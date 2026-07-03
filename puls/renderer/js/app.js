// rPPG application: camera → face tracking → ROI colour → POS → heart rate.
import { FaceLandmarker, FilesetResolver } from "../vendor/mediapipe/vision_bundle.mjs";
import { computeROIs, sampleROI, drawROIs } from "./face/roi.js";
import { matrixToEuler } from "./face/pose.js";
import { POS, estimateHeartRate, snrToConfidence } from "./lib/rppg.js";
import { resampleUniform, movingDetrend, bandpassFFT, median, std, mean } from "./lib/signal.js";
import { createCharts, updateCharts } from "./ui/charts.js";

// ---- Tuning constants -------------------------------------------------------
const PROC_W = 320;          // downscaled width for colour sampling (speed)
const FS = 30;               // analysis sample rate (Hz)
const WINDOW_SEC = 20;       // averaging window shown to the user
const BUFFER_SEC = 24;       // rolling buffer kept in memory
const MIN_SEC = 6;           // minimum data before first estimate
const ANALYSIS_MS = 800;     // how often to recompute HR
const HR_LO = 0.7, HR_HI = 4.0; // 42–240 BPM band
// -----------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const el = {
  video: $("video"), display: $("displayCanvas"), proc: $("procCanvas"),
  overlayMsg: $("videoOverlayMsg"), start: $("startBtn"), stop: $("stopBtn"),
  camSelect: $("cameraSelect"), bpm: $("bpmValue"), conf: $("confValue"),
  stability: $("stabilityValue"), snr: $("snrValue"), fps: $("fpsValue"),
  frames: $("framesValue"), face: $("faceValue"), status: $("statusText"),
  progress: $("windowProgress"), windowLabel: $("windowLabel"),
};

let faceLandmarker = null;
let stream = null;
let running = false;
let charts = null;

const displayCtx = el.display.getContext("2d");
const procCtx = el.proc.getContext("2d", { willReadFrequently: true });
let PROC_H = 240;

let buffer = [];             // rolling samples
let prevLm = null;           // for motion estimation
let lastTs = 0;
let lastAnalysis = 0;
let recentBpm = [];          // rolling HR estimates for stability
let fpsEma = 0, lastFrameT = 0, startedAt = 0;

// Landmarks used to estimate frame-to-frame motion (nose, eyes, chin, brows).
const MOTION_IDX = [1, 33, 263, 152, 10, 61, 291];

function setStatus(msg, cls = "") { el.status.textContent = msg; el.status.className = "status " + cls; }

async function initModel() {
  setStatus("Loading face-tracking model…");
  const fileset = await FilesetResolver.forVisionTasks("./vendor/mediapipe/wasm");
  faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: "./vendor/mediapipe/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFacialTransformationMatrixes: true, // head pose
  });
}

async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    el.camSelect.innerHTML = "";
    cams.forEach((c, i) => {
      const o = document.createElement("option");
      o.value = c.deviceId;
      o.textContent = c.label || `Camera ${i + 1}`;
      el.camSelect.appendChild(o);
    });
  } catch (e) { /* labels appear after first permission grant */ }
}

async function startCamera() {
  const deviceId = el.camSelect.value || undefined;
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 },
    },
    audio: false,
  });
  el.video.srcObject = stream;
  await el.video.play();
  await listCameras();

  const vw = el.video.videoWidth, vh = el.video.videoHeight;
  PROC_H = Math.round((PROC_W * vh) / vw);
  el.proc.width = PROC_W; el.proc.height = PROC_H;
  el.display.width = vw; el.display.height = vh;
}

function computeMotion(lm) {
  if (!prevLm) return 0;
  let s = 0;
  for (const i of MOTION_IDX) {
    const dx = lm[i].x - prevLm[i].x, dy = lm[i].y - prevLm[i].y;
    s += Math.hypot(dx, dy);
  }
  return (s / MOTION_IDX.length) * 100; // normalised-coord units → percent
}

function loop() {
  if (!running) return;
  const now = performance.now();

  // fps (EMA)
  if (lastFrameT) {
    const inst = 1000 / (now - lastFrameT);
    fpsEma = fpsEma ? fpsEma * 0.9 + inst * 0.1 : inst;
  }
  lastFrameT = now;

  if (el.video.readyState >= 2) {
    procCtx.drawImage(el.video, 0, 0, PROC_W, PROC_H);
    const ts = Math.max(lastTs + 1, Math.round(now));
    lastTs = ts;
    const res = faceLandmarker.detectForVideo(el.video, ts);

    displayCtx.drawImage(el.video, 0, 0, el.display.width, el.display.height);

    if (res.faceLandmarks && res.faceLandmarks.length) {
      const lm = res.faceLandmarks[0];
      const rois = computeROIs(lm, PROC_W, PROC_H);
      const f = sampleROI(procCtx, rois.forehead);
      const a = sampleROI(procCtx, rois.cheekA);
      const b = sampleROI(procCtx, rois.cheekB);

      // combined RGB weighted by valid skin-pixel count
      const parts = [f, a, b].filter((p) => p.count > 20);
      if (parts.length) {
        let wr = 0, wg = 0, wb = 0, wc = 0, br = 0;
        for (const p of parts) { wr += p.r * p.count; wg += p.g * p.count; wb += p.b * p.count; wc += p.count; br += p.brightness * p.count; }
        const r = wr / wc, g = wg / wc, bl = wb / wc, brightness = br / wc;

        let pose = { yaw: 0, pitch: 0, roll: 0 };
        if (res.facialTransformationMatrixes && res.facialTransformationMatrixes.length)
          pose = matrixToEuler(res.facialTransformationMatrixes[0].data);

        const motion = computeMotion(lm);
        const quality = Math.max(0, 1 - motion / 1.5); // 1 = still, →0 as motion grows

        buffer.push({ t: now, r, g, b: bl, fr: f.r, fg: f.g, fb: f.b, brightness, ...pose, motion, quality });
      }
      prevLm = lm.map((p) => ({ x: p.x, y: p.y }));
      drawROIs(displayCtx, rois, el.display.width / PROC_W);
      el.face.textContent = "tracked";
    } else {
      el.face.textContent = "not found";
    }
  }

  // trim rolling buffer
  const cutoff = now - BUFFER_SEC * 1000;
  while (buffer.length && buffer[0].t < cutoff) buffer.shift();

  // periodic analysis
  if (now - lastAnalysis > ANALYSIS_MS) { lastAnalysis = now; analyze(now); }

  updateLiveStats(now);
  requestAnimationFrame(loop);
}

function updateLiveStats(now) {
  el.fps.textContent = fpsEma ? fpsEma.toFixed(0) : "--";
  el.frames.textContent = buffer.length;
  const elapsed = Math.min(WINDOW_SEC, (now - startedAt) / 1000);
  el.progress.style.width = `${(elapsed / WINDOW_SEC) * 100}%`;
  el.windowLabel.textContent = `${elapsed.toFixed(0)} / ${WINDOW_SEC} s`;
}

function analyze(now) {
  const win = buffer.filter((s) => s.t >= now - WINDOW_SEC * 1000);
  const spanSec = win.length ? (win[win.length - 1].t - win[0].t) / 1000 : 0;
  if (win.length < FS * MIN_SEC * 0.5 || spanSec < MIN_SEC) {
    setStatus(`Collecting signal… keep still and well-lit (${spanSec.toFixed(0)}s / ${MIN_SEC}s minimum).`, "warn");
    return;
  }

  const t0 = win[0].t;
  const times = win.map((s) => (s.t - t0) / 1000);
  const dur = times[times.length - 1];
  const n = Math.max(64, Math.round(dur * FS));

  // resample the (irregular) camera signal onto a uniform grid
  const R = resampleUniform(times, win.map((s) => s.r), FS, n);
  const G = resampleUniform(times, win.map((s) => s.g), FS, n);
  const B = resampleUniform(times, win.map((s) => s.b), FS, n);

  // POS wants raw RGB (it normalises internally); feed it directly
  const rgb = new Array(n);
  for (let i = 0; i < n; i++) rgb[i] = [R[i], G[i], B[i]];
  const pulse = POS(rgb, FS);
  const filtered = bandpassFFT(pulse, FS, HR_LO, HR_HI);
  const hr = estimateHeartRate(pulse, FS, HR_LO, HR_HI);

  // stability via rolling median of recent estimates
  recentBpm.push(hr.bpm);
  if (recentBpm.length > 12) recentBpm.shift();
  const bpm = median(recentBpm);
  const spread = recentBpm.length > 2 ? std(recentBpm) : NaN;
  const conf = snrToConfidence(hr.snr);

  // confounder quality summary
  const avgQuality = mean(win.map((s) => s.quality));
  const maxMotion = Math.max(...win.map((s) => s.motion));
  const poseRange = Math.max(...win.map((s) => Math.abs(s.yaw))) + Math.max(...win.map((s) => Math.abs(s.pitch)));

  // result UI
  el.bpm.textContent = isFinite(bpm) ? bpm.toFixed(0) : "--";
  el.conf.textContent = `${(conf * 100).toFixed(0)}%`;
  el.stability.textContent = isFinite(spread) ? `${spread.toFixed(1)} BPM` : "--";
  el.snr.textContent = hr.snr.toFixed(2);

  // guidance based on confounders
  if (spanSec < WINDOW_SEC) setStatus(`Building 20 s average… ${spanSec.toFixed(0)} s so far.`, "");
  else if (conf < 0.35 || avgQuality < 0.5)
    setStatus("Low signal quality — reduce motion, face a steady light, avoid backlight.", "bad");
  else if (spread > 6)
    setStatus("Reading still settling — hold steady for a few more seconds.", "warn");
  else setStatus("Good signal. Reading is stable.", "good");

  // spectrum trimmed to the plausible HR band, in BPM
  const specBpm = [], specPower = [];
  for (let k = 0; k < hr.freqs.length; k++) {
    const f = hr.freqs[k];
    if (f >= 0.6 && f <= 4.2) { specBpm.push(f * 60); specPower.push(hr.power[k]); }
  }

  // charts (downsample time-series to ~120 pts for smooth rendering)
  const step = Math.max(1, Math.floor(win.length / 120));
  const dec = (arr) => arr.filter((_, i) => i % step === 0);
  updateCharts(charts, {
    time: dec(times),
    pulseTime: Array.from({ length: filtered.length }, (_, i) => i / FS).filter((_, i) => i % Math.max(1, Math.floor(filtered.length / 200)) === 0),
    pulse: filtered.filter((_, i) => i % Math.max(1, Math.floor(filtered.length / 200)) === 0),
    specBpm, specPower,
    peakBpm: bpm,
    rgbR: dec(win.map((s) => s.fr)),
    rgbG: dec(win.map((s) => s.fg)),
    rgbB: dec(win.map((s) => s.fb)),
    yaw: dec(win.map((s) => s.yaw)),
    pitch: dec(win.map((s) => s.pitch)),
    roll: dec(win.map((s) => s.roll)),
    bright: dec(win.map((s) => s.brightness)),
    motion: dec(win.map((s) => s.motion)),
    quality: dec(win.map((s) => s.quality)),
  });
}

async function start() {
  if (running) return;
  el.start.disabled = true;
  el.overlayMsg.textContent = "Requesting camera…";
  el.overlayMsg.classList.remove("hidden");
  try {
    // Request the camera FIRST — synchronously within the click gesture.
    // Safari revokes the user-activation once you await a long task (the model
    // download), and then silently refuses to show the camera prompt.
    if (!stream) await startCamera();
    setStatus("Loading face-tracking model…");
    if (!faceLandmarker) await initModel();
    if (!charts) charts = createCharts();

    buffer = []; prevLm = null; recentBpm = []; lastTs = 0; lastAnalysis = 0;
    fpsEma = 0; lastFrameT = 0; startedAt = performance.now();
    running = true;
    el.stop.disabled = false;
    el.overlayMsg.classList.add("hidden");
    setStatus("Measuring… look at the camera, stay still, keep lighting steady.", "");
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    let msg = err && err.message ? err.message : String(err);
    if (err && (err.name === "NotAllowedError" || err.name === "SecurityError"))
      msg = "Camera permission was blocked. In Safari: aA icon in the address bar → Website Settings → Camera → Allow, then reload.";
    else if (err && err.name === "NotFoundError")
      msg = "No camera was found on this device.";
    setStatus("Error: " + msg, "bad");
    el.overlayMsg.textContent = "Camera off";
    el.start.disabled = false;
  }
}

function stop() {
  running = false;
  el.start.disabled = false;
  el.stop.disabled = true;
  el.overlayMsg.textContent = "Stopped";
  el.overlayMsg.classList.remove("hidden");
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  setStatus("Stopped. Press “Start measuring” to run again.", "");
}

el.start.addEventListener("click", start);
el.stop.addEventListener("click", stop);
el.camSelect.addEventListener("change", async () => {
  if (running) { stop(); await start(); }
});

// try to populate camera list up front (labels fill in after first grant)
listCameras();
setStatus("Ready. Press “Start measuring” and allow camera access.");
