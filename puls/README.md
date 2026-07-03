# rPPG — Camera Pulse Estimation

A web app that estimates a person's heart rate from an ordinary webcam using
**remote photoplethysmography (rPPG)**: it reads the tiny colour changes your
skin shows each time your heart pumps blood, from the forehead and cheeks only.

Everything runs **in the browser** — no video is ever uploaded. To deploy, copy
the folder to any static host.

> ⚕ **Not a medical device.** This is an educational estimate and can be wrong.
> Do not use it for diagnosis, monitoring, or treatment decisions. If you have
> concerns about your heart rate or health, see a clinician.

---

## What it does

- **Advanced facial tracking** — MediaPipe FaceLandmarker (478 landmarks + a 3D
  head-pose matrix) locates the face every frame.
- **Only certain skin regions are analysed** — forehead + both cheeks. These are
  well-perfused, flat, and unobstructed. Eyes, brows, lips and hair are excluded,
  and a skin-colour filter drops stray hair/shadow/specular pixels.
- **Robust to head tilt/rotation and changing light** — ROIs are rotated
  rectangles aligned to the face axis (they follow roll/tilt), and the core
  **POS algorithm** (Plane-Orthogonal-to-Skin, Wang et al. 2017) normalises each
  short window so slow illumination drift and motion largely cancel out.
- **20-second average** — heart rate is computed from a 20 s sliding window via a
  zero-padded FFT with parabolic peak refinement, then stabilised with a rolling
  median. A progress bar shows the window filling.
- **The result *and* everything that influenced it** are graphed live:
  1. rPPG pulse waveform (the recovered heartbeat)
  2. Heart-rate spectrum — the peak **is** the BPM result
  3. Raw skin colour R/G/B — makes lighting changes visible
  4. Head pose (yaw / pitch / roll) — a key confounder
  5. Illumination (ROI brightness) — another confounder
  6. Motion & signal quality — how still the subject was

## How the pipeline works

```
camera frame
  → FaceLandmarker (landmarks + head-pose matrix)
  → forehead + cheek ROIs (rotated boxes, skin-pixel masked)
  → mean R,G,B per ROI  ─┬─► confounders: pose, motion, brightness (graphed)
  → resample to 30 Hz    │
  → POS projection ───────┘  (temporal normalisation ⇒ light/motion robust)
  → band-pass 0.7–4 Hz (42–240 BPM)
  → FFT peak → BPM  → rolling median → result
```

## Run locally

Camera access needs a **secure context** (HTTPS or `localhost`).

```bash
# Option A — Python (no dependencies)
python3 server.py            # → http://localhost:8000

# Option B — any static server
npx serve .                  # → http://localhost:3000
```

Open the URL, press **Start measuring**, allow the camera, hold still under even
lighting, and wait ~20 s for the average to settle.

## Deploy (copy-paste hosting)

The whole app is static files (`index.html`, `css/`, `js/`). Host it anywhere
that serves static content **over HTTPS** (required for the camera):

- **Netlify / Vercel / Cloudflare Pages / GitHub Pages** — drag-and-drop or push
  the folder; HTTPS is automatic.
- **Any web server** — copy the folder into the web root (e.g. nginx/Apache).
- **Docker**

  ```bash
  docker build -t rppg .
  docker run -p 8080:80 rppg     # then serve behind an HTTPS proxy
  ```

No build step, no backend, no database. Two third-party assets load from CDN at
runtime: MediaPipe `tasks-vision` and its model, and Chart.js.

## Tips for a good reading

- Even, steady lighting on the face (avoid backlight and flicker).
- Hold the head still; large yaw/pitch/roll swings show up on the pose graph and
  hurt accuracy.
- Bare forehead and cheeks (no hair/hat covering the ROIs).
- Watch **Confidence** and **Stability (±)** — trust the number when confidence
  is high and the ± is small.

## Accuracy & limits

rPPG is inherently sensitive to motion, lighting, skin tone, camera quality and
compression. Expect good agreement with a real pulse oximeter under ideal
conditions and degraded accuracy otherwise — which is exactly why every major
confounder is graphed next to the result. This is a demonstration/education tool,
not a validated clinical measurement.

## Project layout

```
index.html          UI + graph canvases
css/styles.css       styling
js/app.js            orchestration: camera, loop, analysis, UI
js/face/roi.js       ROI geometry + skin-pixel colour sampling
js/face/pose.js      head-pose (Euler angles) from the transform matrix
js/lib/rppg.js       POS algorithm + heart-rate estimation
js/lib/signal.js     resampling, detrend, band-pass, stats
js/lib/fft.js        radix-2 FFT
js/ui/charts.js      Chart.js wrappers
server.py            local static server (secure context on localhost)
Dockerfile           static hosting image
```
