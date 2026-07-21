/* =========================================================================
   ABI FOTOBOX — 3D-Masken mit Kopf-Tracking
   MediaPipe Face Landmarker (Kopf-Pose) + Three.js (3D-Modelle).
   Rendert z.B. einen Doktorhut, der dem Kopf folgt, als ob man ihn trägt.
   Läuft nur clientseitig; Modelle sind prozedural (keine externen Dateien).
   Alles in Schwarz-Weiß passend zum App-Design.

   Robust: Bibliotheken werden per dynamischem import() geladen. Schlägt das
   fehl (offline/kein WebGL), bleibt window.HeadTrack.available = false und die
   App fällt auf einfache Emoji-Masken zurück.
   ========================================================================= */
(function () {
  "use strict";

  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
  const MP_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
  const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
  const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

  // Feinjustage (falls eine Maske auf dem Gerät leicht sitzt)
  const TUNE = {
    smooth: 0.4,   // 0..1, Glättung von Position/Drehung (höher = ruhiger, träger)
    scale: 1.0,    // globaler Größenfaktor
    lift: 1.0,     // globaler Höhen-Faktor (wie weit über dem Kopf)
  };

  // Verfügbare 3D-Masken (Metadaten schon vor init nutzbar)
  const MODELS = [
    { id: "cap",     name: "Doktorhut",      anchor: "head", lift: 0.55, scale: 1.05 },
    { id: "crown",   name: "Krone",          anchor: "head", lift: 0.30, scale: 0.95 },
    { id: "glasses", name: "Brille",         anchor: "eyes", lift: 0.00, scale: 1.00 },
    { id: "halo",    name: "Heiligenschein", anchor: "head", lift: 0.85, scale: 0.90, flat: true },
  ];

  const HT = {
    available: null,   // null = ungeprüft, true/false nach init
    ready: false,
    isActive: false,
    canvas: null,
    models: MODELS.map((m) => ({ id: m.id, name: m.name })),
    init, setMask, start, stop, tune,
  };
  window.HeadTrack = HT;

  function tune(obj) { Object.assign(TUNE, obj || {}); }

  let THREE = null, FaceLandmarker = null, FilesetResolver = null;
  let landmarker = null;
  let renderer = null, scene = null, camera = null;
  let poseGroup = null, modelRoots = {};
  let videoEl = null, mountEl = null;
  let RW = 640, RH = 480;
  let rafId = null, lastVideoTime = -1;
  let currentId = null;
  let smoothed = null;
  let initPromise = null;

  /* ---------------- Initialisierung (lazy, beim ersten Masken-Tap) ------- */
  // Idempotent: mehrfaches Aufrufen (auch parallel) erzeugt genau EINE Szene.
  function init(video, mount) {
    videoEl = video; mountEl = mount;
    if (HT.ready) return Promise.resolve(true);
    if (HT.available === false) return Promise.resolve(false);
    if (initPromise) return initPromise;
    initPromise = doInit();
    return initPromise;
  }

  async function doInit() {
    try {
      const three = await import(THREE_URL);
      THREE = three;
      const mp = await import(MP_URL);
      FaceLandmarker = mp.FaceLandmarker;
      FilesetResolver = mp.FilesetResolver;

      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
      });

      setupScene();
      HT.available = true;
      HT.ready = true;
      return true;
    } catch (e) {
      console.warn("HeadTrack init fehlgeschlagen:", e);
      HT.available = false;
      HT.ready = false;
      return false;
    }
  }

  function setupScene() {
    if (renderer) return; // niemals eine zweite Szene/Canvas erzeugen
    // evtl. verwaiste Canvas aus früherem Versuch entfernen
    const old = mountEl.querySelector("#htCanvas");
    if (old) old.remove();
    resize();
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(RW, RH, false);
    renderer.setClearColor(0x000000, 0);
    HT.canvas = renderer.domElement;
    HT.canvas.id = "htCanvas";
    mountEl.insertBefore(HT.canvas, mountEl.querySelector(".bg-layer") || null);

    scene = new THREE.Scene();
    // y-up Ortho-Kamera in Pixel-Koordinaten (Ursprung unten links)
    camera = new THREE.OrthographicCamera(0, RW, RH, 0, 1, 4000);
    camera.position.set(0, 0, 2000);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 1.15));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(0.4, 1, 1.2);
    scene.add(dir);

    poseGroup = new THREE.Group();
    scene.add(poseGroup);

    MODELS.forEach((m) => {
      const root = buildModel(m.id);
      root.visible = false;
      poseGroup.add(root);
      modelRoots[m.id] = root;
    });
  }

  function resize() {
    const vw = (videoEl && videoEl.videoWidth) || 640;
    const vh = (videoEl && videoEl.videoHeight) || 480;
    RW = Math.min(vw, 640);
    RH = Math.round(RW * (vh / vw));
    if (renderer) {
      renderer.setSize(RW, RH, false);
      camera.right = RW; camera.top = RH; camera.updateProjectionMatrix();
    }
  }

  /* ---------------- Prozedurale 3D-Modelle (S/W) ------------------------- */
  const matBlack = () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.55, metalness: 0.1 });
  const matWhite = () => new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5, metalness: 0.05 });
  const matGray  = () => new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.15 });

  function buildModel(id) {
    const g = new THREE.Group();
    if (id === "cap") {
      // Mütze (Band) + flaches Brett + Quaste — Doktorhut / Mortarboard
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.6, 0.55, 32), matBlack());
      band.position.y = -0.28; g.add(band);
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 1.5), matBlack());
      board.position.y = 0.02; g.add(board);
      const button = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), matGray());
      button.position.y = 0.07; g.add(button);
      // Quaste: Schnur zur Ecke + herabhängender Faden + Fransen
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), matWhite());
      cord.position.set(0.37, 0.09, 0.37);
      cord.rotation.z = Math.PI / 2; cord.rotation.y = -Math.PI / 4; g.add(cord);
      const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), matWhite());
      hang.position.set(0.72, -0.16, 0.72); g.add(hang);
      const fringe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 0.22, 12), matWhite());
      fringe.position.set(0.72, -0.5, 0.72); g.add(fringe);
      // leichte Grund-Neigung, damit das Brett natürlich sitzt
      g.rotation.x = -0.12;
    } else if (id === "crown") {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 32, 1, true), matWhite());
      g.add(band);
      const spikes = 8;
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 12), matWhite());
        sp.position.set(Math.cos(a) * 0.55, 0.32, Math.sin(a) * 0.55);
        g.add(sp);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), matGray());
        ball.position.set(Math.cos(a) * 0.55, 0.5, Math.sin(a) * 0.55);
        g.add(ball);
      }
      g.rotation.x = -0.1;
    } else if (id === "glasses") {
      const ringGeo = new THREE.TorusGeometry(0.32, 0.055, 12, 32);
      const l = new THREE.Mesh(ringGeo, matBlack()); l.position.set(-0.42, 0, 0); g.add(l);
      const r = new THREE.Mesh(ringGeo, matBlack()); r.position.set(0.42, 0, 0); g.add(r);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.055, 0.055), matBlack());
      g.add(bridge);
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), matBlack());
      armL.position.set(-0.78, 0.05, -0.2); armL.rotation.y = 0.5; g.add(armL);
      const armR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), matBlack());
      armR.position.set(0.78, 0.05, -0.2); armR.rotation.y = -0.5; g.add(armR);
    } else if (id === "halo") {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 16, 40),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x666666, roughness: 0.3 }));
      halo.rotation.x = Math.PI / 2; g.add(halo);
    }
    return g;
  }

  /* ---------------- Maske wählen / Loop steuern -------------------------- */
  function setMask(id) {
    currentId = id;
    smoothed = null;
    Object.keys(modelRoots).forEach((k) => { modelRoots[k].visible = (k === id); });
    HT.isActive = !!id;
    if (id) start(); else render();
  }

  function start() {
    if (!HT.ready || rafId != null) return;
    lastVideoTime = -1;
    loop();
  }
  function stop() {
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    try { detectAndPose(); } catch (e) { /* einzelne Frames dürfen fehlschlagen */ }
    render();
  }

  function render() { if (renderer) renderer.render(scene, camera); }

  /* ---------------- Kopf-Pose aus Landmarks -----------------------------
     Volle 3D-Orientierung direkt aus der Kopf-Geometrie:
     - up    = Kinn → Stirn
     - fwd   = Blickrichtung (zeigt zur Kamera), aus rechts × up
     - right = up × fwd  (garantiert rechtshändig, keine Vorzeichen-Rätsel)
     Daraus eine Quaternion (makeBasis). Position in Pixel-Screen-Space.
  ----------------------------------------------------------------------- */
  const _q = { right: null, up: null, fwd: null, m: null, quat: null, tmp: null };
  function detectAndPose() {
    if (!THREE) return;
    if (!_q.right) {
      _q.right = new THREE.Vector3(); _q.up = new THREE.Vector3(); _q.fwd = new THREE.Vector3();
      _q.rawR = new THREE.Vector3(); _q.m = new THREE.Matrix4();
      _q.quat = new THREE.Quaternion(); _q.pos = new THREE.Vector3();
    }
    if (!currentId || !videoEl || videoEl.readyState < 2) return;
    if (videoEl.videoWidth && RW !== Math.min(videoEl.videoWidth, 640)) resize();
    const now = performance.now();
    if (videoEl.currentTime === lastVideoTime) return;
    lastVideoTime = videoEl.currentTime;

    const res = landmarker.detectForVideo(videoEl, now);
    const root = modelRoots[currentId];
    if (!res || !res.faceLandmarks || !res.faceLandmarks.length) { if (root) root.visible = false; return; }
    if (root) root.visible = true;
    const lm = res.faceLandmarks[0];
    const model = MODELS.find((m) => m.id === currentId);

    // isotroper Pixel-Raum (y nach oben, z zur Kamera positiv)
    const P = (i) => new THREE.Vector3(lm[i].x * RW, RH - lm[i].y * RH, -lm[i].z * RW);
    const eyeR = 33, eyeL = 263, forehead = 10, chin = 152, rC = 234, lC = 454;

    const pF = P(forehead), pC = P(chin), pRC = P(rC), pLC = P(lC);

    // Basisvektoren
    _q.up.copy(pF).sub(pC).normalize();                       // Kopf-Oben
    _q.rawR.copy(pLC).sub(pRC).normalize();                   // grob nach rechts
    _q.fwd.copy(_q.rawR).cross(_q.up).normalize();            // Blickrichtung
    if (_q.fwd.z < 0) _q.fwd.negate();                        // muss zur Kamera zeigen (+z)
    _q.right.copy(_q.up).cross(_q.fwd).normalize();           // sauber orthogonal
    _q.up.copy(_q.fwd).cross(_q.right).normalize();
    _q.m.makeBasis(_q.right, _q.up, _q.fwd);
    _q.quat.setFromRotationMatrix(_q.m);

    // Maße in Pixeln
    const headW = pLC.distanceTo(pRC) || 1;
    const headH = pF.distanceTo(pC) || 1;

    // Ankerpunkt (Screen-Position)
    let ax, ay;
    if (model.anchor === "eyes") {
      const eR = P(eyeR), eL = P(eyeL);
      ax = (eR.x + eL.x) / 2; ay = (eR.y + eL.y) / 2;
    } else {
      // von der Stirn entlang der Kopf-Oben-Richtung nach oben
      ax = pF.x + _q.up.x * headH * model.lift * TUNE.lift;
      ay = pF.y + _q.up.y * headH * model.lift * TUNE.lift;
    }
    const scale = headW * model.scale * TUNE.scale;

    // Glättung (Position/Scale linear, Drehung per slerp)
    if (!smoothed) {
      smoothed = { x: ax, y: ay, scale: scale, quat: _q.quat.clone() };
    } else {
      const s = 1 - TUNE.smooth;
      smoothed.x += (ax - smoothed.x) * s;
      smoothed.y += (ay - smoothed.y) * s;
      smoothed.scale += (scale - smoothed.scale) * s;
      smoothed.quat.slerp(_q.quat, s);
    }

    poseGroup.position.set(smoothed.x, smoothed.y, 0);
    poseGroup.scale.setScalar(smoothed.scale);
    poseGroup.quaternion.copy(smoothed.quat);
  }
})();
