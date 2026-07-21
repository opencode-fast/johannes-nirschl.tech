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
  const CROWN_STL_URL = "assets/crown.stl";   // echtes 3D-Kronen-Modell

  // Feinjustage (falls eine Maske auf dem Gerät leicht sitzt)
  const TUNE = {
    smooth: 0.55,    // 0..1, Glättung von Position/Drehung (höher = ruhiger, träger)
    scale: 1.0,      // globaler Größenfaktor der Maske (Größe folgt der Kopfgröße)
    lift: 1.0,       // globaler Höhen-Faktor (wie weit über dem Kopf)
    back: 0.18,      // wie weit die Maske nach hinten (Richtung Hinterkopf) rückt
    occScale: 1.0,   // Größe des unsichtbaren Kopf-Occluders (Tiefen-Verdeckung)
    occBack: 0.0,    // Occluder nach hinten schieben (falls Front fälschlich verdeckt)
    crownScale: 1.0, // nur Krone: Größe fein justieren (kleiner < 1 < größer)
    crownLift: 1.0,  // nur Krone: Höhe fein justieren (tiefer < 1 < höher)
  };

  // Verfügbare 3D-Masken (Metadaten schon vor init nutzbar)
  const MODELS = [
    { id: "cap",     name: "Doktorhut",      anchor: "head", lift: 0.95, scale: 1.05 },
    { id: "crown",   name: "Krone",          anchor: "head", lift: 0.89, scale: 1.55 },
    { id: "glasses", name: "Brille",         anchor: "eyes", lift: 0.00, scale: 1.00 },
    { id: "halo",    name: "Heiligenschein", anchor: "head", lift: 1.35, scale: 1.12 },
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
  let rigs = [];                 // ein Rig pro Person (Maske + Occluder + Quaste)
  let crownGeo = null;           // geladenes STL-Kronen-Modell (null = prozedural)
  let videoEl = null, mountEl = null;
  let RW = 640, RH = 480;
  let rafId = null, lastVideoTime = -1;
  let currentId = null;
  let lastApplyT = 0;            // Zeit des letzten Frames (für Quaste-Physik)
  let initPromise = null;

  const MAX_FACES = 5;          // gleichzeitig getrackte Personen
  const GRACE_MS = 260;         // Maske bleibt so lange sichtbar, wenn ein
                                // Gesicht kurz nicht erkannt wird (kein Flackern)

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
        numFaces: MAX_FACES,
        // großzügiger, damit auch seitliche/weiter entfernte Gesichter erfasst
        // werden (mehrere Personen gleichzeitig)
        minFaceDetectionConfidence: 0.3,
        minFacePresenceConfidence: 0.3,
        minTrackingConfidence: 0.3,
      });

      // echtes Kronen-Modell laden (fällt auf prozedurale Krone zurück)
      crownGeo = await loadCrownGeometry()
        .then((g) => { console.info("Abi: Krone-STL geladen,", g.attributes.position.count, "Vertices"); return g; })
        .catch((e) => { console.warn("Abi: Krone-STL NICHT geladen, nutze prozedurale Krone:", e); return null; });

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
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(0.4, 1, 1.2);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-0.6, 0.3, 0.8);
    scene.add(fill);

    // Weiche Studio-Umgebung: damit Gold-Metalle (Krone/Quaste) schön
    // reflektieren statt dunkel/flach zu wirken — ohne externe HDR-Datei.
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = makeEnvTexture();
      scene.environment = pmrem.fromEquirectangular(envTex).texture;
      envTex.dispose(); pmrem.dispose();
    } catch (e) { /* Environment ist optional */ }

    // Ein Rig pro Person: eigene Maske, eigener Kopf-Occluder, eigene Quaste.
    rigs = [];
    for (let i = 0; i < MAX_FACES; i++) rigs.push(makeRig());
  }

  // Kleine prozedurale Studio-Umgebung (Verlauf + zwei Lichtflecken) als
  // Equirect-Textur — Grundlage für schöne Metall-Reflexe.
  function makeEnvTexture() {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 32;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0.0, "#ffffff");
    g.addColorStop(0.45, "#cccccc");
    g.addColorStop(0.55, "#8c8c8c");
    g.addColorStop(1.0, "#1a1a1a");
    x.fillStyle = g; x.fillRect(0, 0, 64, 32);
    x.fillStyle = "rgba(255,255,255,0.95)";
    x.beginPath(); x.ellipse(16, 8, 7, 4, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(46, 6, 5, 3, 0, 0, Math.PI * 2); x.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    if ("SRGBColorSpace" in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Baut ein komplettes Rig (alle Masken vorgebaut, nur die aktive sichtbar).
  function makeRig() {
    const root = new THREE.Group();
    scene.add(root);
    const modelRoots = {};
    MODELS.forEach((m) => {
      const r = buildModel(m.id);
      r.visible = false;
      r.traverse((o) => { o.renderOrder = 1; }); // Maske NACH dem Occluder zeichnen
      root.add(r);
      modelRoots[m.id] = r;
    });

    // Unsichtbarer Tiefen-Occluder in Kopfform (nur Tiefenpuffer, colorWrite:false).
    // Verdeckt die Maskenteile HINTER dem Kopf → Maske wirkt getragen. renderOrder 0
    // sorgt dafür, dass er VOR der Maske gezeichnet wird (Tiefe steht dann bereit).
    const occluder = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 20),
      new THREE.MeshBasicMaterial({ colorWrite: false })
    );
    occluder.renderOrder = 0;
    occluder.visible = false;
    scene.add(occluder);

    // Baumelnde Quaste: eigene Gruppe im WELTRAUM (nicht unter der gedrehten
    // Maske), damit sie unter Schwerkraft frei nach unten hängt und mitschwingt.
    const tGroup = new THREE.Group();
    tGroup.visible = false;
    scene.add(tGroup);
    const N = 6;                       // Kettenglieder des baumelnden Teils
    const segs = [];
    for (let i = 0; i < N - 1; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 7), matGold());
      seg.renderOrder = 1;
      tGroup.add(seg); segs.push(seg);
    }
    // starre Schnur vom Knopf (Mitte) zur Brett-Ecke — sie liegt auf dem Brett,
    // damit die Quaste in der MITTE befestigt ist und erst an der Ecke abfällt.
    const topCord = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 7), matGold());
    topCord.renderOrder = 1; tGroup.add(topCord);
    const fringe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.15, 0.30, 12), matGold());
    fringe.renderOrder = 1; tGroup.add(fringe);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), matGray());
    knot.renderOrder = 1; tGroup.add(knot);
    const tassel = { group: tGroup, segs, topCord, fringe, knot, N, pts: [], prev: [], inited: false };
    for (let i = 0; i < N; i++) { tassel.pts.push(new THREE.Vector3()); tassel.prev.push(new THREE.Vector3()); }

    return { root, modelRoots, occluder, tassel, smoothed: null, target: null, active: false, lastSeen: 0, center: new THREE.Vector2() };
  }

  /* ---------------- STL-Kronen-Modell laden ------------------------------
     Eigener kleiner Binär-STL-Parser (kein Addon-Loader nötig, damit kein
     Import-Map gebraucht wird). Ergebnis wird aufgerichtet, zentriert und auf
     Einheitsgröße (horizontaler Durchmesser = 1) normiert. */
  // Base64 → Uint8Array
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // STL-Bytes beschaffen: bevorzugt das EINGEBETTETE Modell (gzip+base64),
  // damit die Krone unabhängig vom Hosting/Pfad immer da ist. Fallback: Datei.
  async function getCrownArrayBuffer() {
    const gz = window.__CROWN_STL_GZ_B64;
    if (gz && typeof DecompressionStream !== "undefined") {
      try {
        const bytes = b64ToBytes(gz);
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        return await new Response(stream).arrayBuffer();
      } catch (e) {
        console.warn("Abi: eingebettete Krone konnte nicht entpackt werden, versuche Datei:", e);
      }
    }
    const res = await fetch(CROWN_STL_URL);
    if (!res.ok) throw new Error("STL HTTP " + res.status);
    return await res.arrayBuffer();
  }

  async function loadCrownGeometry() {
    const buf = await getCrownArrayBuffer();
    const dv = new DataView(buf);
    if (dv.byteLength < 84) throw new Error("STL zu klein");
    const n = dv.getUint32(80, true);
    if (84 + n * 50 > dv.byteLength) throw new Error("STL kein Binärformat");
    const pos = new Float32Array(n * 9);
    let off = 84, p = 0;
    for (let i = 0; i < n; i++) {
      off += 12; // Flächennormale überspringen
      for (let v = 0; v < 3; v++) {
        pos[p++] = dv.getFloat32(off, true);
        pos[p++] = dv.getFloat32(off + 4, true);
        pos[p++] = dv.getFloat32(off + 8, true);
        off += 12;
      }
      off += 2; // Attribut-Bytes
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    // aufrichten: Modell ist Z-hoch → Y-hoch (Spitzen nach oben)
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    // zentrieren
    geo.computeBoundingBox();
    const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
    geo.translate(-c.x, -c.y, -c.z);
    // auf Einheits-Durchmesser skalieren
    geo.computeBoundingBox();
    const size = new THREE.Vector3(); geo.boundingBox.getSize(size);
    const horiz = Math.max(size.x, size.z) || 1;
    const s = 1 / horiz;
    geo.scale(s, s, s);
    geo.computeVertexNormals();
    return geo;
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
  // Gold-Akzent (partielle Farbe) — Krone/Quaste/Heiligenschein. Metallisch,
  // reflektiert die Studio-Umgebung; leichtes Emissive, damit es nie schwarz wird.
  const matGold  = () => new THREE.MeshStandardMaterial({
    color: 0xd8b24a, roughness: 0.28, metalness: 0.9,
    emissive: 0x1a1206, emissiveIntensity: 0.55, envMapIntensity: 1.15,
  });

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
      // Die Quaste hängt frei (dynamische Verlet-Physik) und wird separat pro
      // Rig gerendert — siehe makeRig()/updateTassel(). Bewusst KEIN starres
      // Modell mehr, damit sie beim Bewegen des Kopfes wirklich baumelt.
      // leichte Grund-Neigung, damit das Brett natürlich sitzt
      g.rotation.x = -0.12;
    } else if (id === "crown") {
      if (crownGeo) {
        // echtes STL-Modell (geteilte Geometrie, eigenes Gold-Material)
        const crown = new THREE.Mesh(crownGeo, matGold());
        g.add(crown);
        // leichte Rück-Neigung, damit die Krone nicht nach vorne kippt
        // (die Kopf-Oben-Achse lehnt sich leicht nach vorne)
        g.rotation.x = -0.15;
      } else {
        // Fallback: prozedurale Krone
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 32, 1, true), matGold());
        g.add(band);
        const spikes = 8;
        for (let i = 0; i < spikes; i++) {
          const a = (i / spikes) * Math.PI * 2;
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 12), matGold());
          sp.position.set(Math.cos(a) * 0.55, 0.32, Math.sin(a) * 0.55);
          g.add(sp);
          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), matWhite());
          ball.position.set(Math.cos(a) * 0.55, 0.5, Math.sin(a) * 0.55);
          g.add(ball);
        }
        g.rotation.x = -0.1;
      }
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
        new THREE.MeshStandardMaterial({ color: 0xe8c765, emissive: 0x7a5f1e, roughness: 0.3, metalness: 0.4 }));
      halo.rotation.x = Math.PI / 2; g.add(halo);
    }
    return g;
  }

  /* ---------------- Maske wählen / Loop steuern -------------------------- */
  function setMask(id) {
    currentId = id;
    rigs.forEach((rig) => {
      rig.smoothed = null; rig.target = null; rig.active = false;
      rig.tassel.inited = false;
      Object.keys(rig.modelRoots).forEach((k) => { rig.modelRoots[k].visible = (k === id); });
      rig.root.visible = false;
      rig.occluder.visible = false;
      rig.tassel.group.visible = false;
    });
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
     Mehrere Gesichter: pro Frame werden alle erkannten Köpfe einzeln
     berechnet und stabil den Rigs zugeordnet.
  ----------------------------------------------------------------------- */
  const _q = {};
  let DOWN = null, YUP = null, TASSEL_MID = null, TASSEL_CORNER = null, _tmp = null, _tmp2 = null, _tmp3 = null;
  function ensureTemps() {
    if (_q.up) return;
    _q.up = new THREE.Vector3(); _q.rawR = new THREE.Vector3(); _q.fwd = new THREE.Vector3();
    _q.right = new THREE.Vector3(); _q.m = new THREE.Matrix4(); _q.quat = new THREE.Quaternion();
    DOWN = new THREE.Vector3(0, -1, 0); YUP = new THREE.Vector3(0, 1, 0);
    TASSEL_MID = new THREE.Vector3(0, 0.14, 0);          // Knopf-Mitte oben (Befestigung)
    TASSEL_CORNER = new THREE.Vector3(0.80, 0.14, 0.80); // Brett-Ecke — hier fällt sie über die Kante
    _tmp = new THREE.Vector3(); _tmp2 = new THREE.Vector3(); _tmp3 = new THREE.Vector3();
  }

  // Volle 3D-Pose + Anker/Occluder für EIN Gesicht (Landmark-Array).
  function computePose(lm) {
    const P = (i) => new THREE.Vector3(lm[i].x * RW, RH - lm[i].y * RH, -lm[i].z * RW);
    const eyeR = 33, eyeL = 263, forehead = 10, chin = 152, rC = 234, lC = 454;
    const pF = P(forehead), pC = P(chin), pRC = P(rC), pLC = P(lC);

    _q.up.copy(pF).sub(pC).normalize();                       // Kopf-Oben
    _q.rawR.copy(pLC).sub(pRC).normalize();                   // grob nach rechts
    _q.fwd.copy(_q.rawR).cross(_q.up).normalize();            // Blickrichtung
    if (_q.fwd.z < 0) _q.fwd.negate();                        // muss zur Kamera zeigen (+z)
    _q.right.copy(_q.up).cross(_q.fwd).normalize();           // sauber orthogonal
    _q.up.copy(_q.fwd).cross(_q.right).normalize();
    _q.m.makeBasis(_q.right, _q.up, _q.fwd);
    _q.quat.setFromRotationMatrix(_q.m);

    const headW = pLC.distanceTo(pRC) || 1;
    const headH = pF.distanceTo(pC) || 1;
    const headC = pRC.clone().add(pLC).multiplyScalar(0.5);
    const model = MODELS.find((m) => m.id === currentId);

    // Krone extra fein justierbar (eigene Modell-Proportionen)
    const isCrown = model.id === "crown";
    const liftF = model.lift * TUNE.lift * (isCrown ? TUNE.crownLift : 1);
    const scaleF = model.scale * TUNE.scale * (isCrown ? TUNE.crownScale : 1);

    const anchor = new THREE.Vector3();
    if (model.anchor === "eyes") {
      anchor.copy(P(eyeR)).add(P(eyeL)).multiplyScalar(0.5);
    } else {
      const lift = headH * liftF;
      anchor.copy(headC)
        .addScaledVector(_q.up, lift)
        .addScaledVector(_q.fwd, -headH * TUNE.back);
    }
    const scale = headW * scaleF;

    // Occluder-Zentrum: über der Wangen-Mitte und Richtung Hinterkopf. Ein
    // echter Schädel reicht vorne nur bis zur Gesichtsebene (~0.35·headW) und
    // hinten weiter (~0.65·headW) → Rückversatz, sonst frisst die vordere
    // Occluder-Wölbung die Vorderkante des Huts.
    const occC = headC.clone()
      .addScaledVector(_q.up, headH * 0.12)
      .addScaledVector(_q.fwd, -headW * 0.18 - headH * TUNE.occBack);

    return { anchor, occC, headW, scale, quat: _q.quat.clone(), cx: anchor.x, cy: anchor.y };
  }

  function detectAndPose() {
    if (!THREE || !rigs.length) return;
    ensureTemps();
    if (!currentId || !videoEl || videoEl.readyState < 2) return;
    if (videoEl.videoWidth && RW !== Math.min(videoEl.videoWidth, 640)) resize();

    // Erkennung nur bei neuem Video-Frame; die Physik/Glättung läuft jedoch
    // jeden Frame, damit die Quaste flüssig schwingt.
    if (videoEl.currentTime !== lastVideoTime) {
      lastVideoTime = videoEl.currentTime;
      const res = landmarker.detectForVideo(videoEl, performance.now());
      assignFaces((res && res.faceLandmarks) || []);
    }
    applyRigs();
  }

  // Erkannte Gesichter stabil den Rigs zuordnen (nächster bisheriger
  // Mittelpunkt), damit Masken nicht zwischen Personen springen.
  function assignFaces(faces) {
    const now = performance.now();
    const poses = [];
    for (let i = 0; i < faces.length && i < MAX_FACES; i++) poses.push(computePose(faces[i]));

    const claimed = new Array(rigs.length).fill(false);
    const match = new Array(poses.length).fill(-1);

    // 1) an bereits aktive Rigs (inkl. Nachlauf) nach Nähe koppeln
    for (let j = 0; j < poses.length; j++) {
      let best = -1, bd = Infinity;
      for (let r = 0; r < rigs.length; r++) {
        if (claimed[r] || !rigs[r].active) continue;
        const dx = rigs[r].center.x - poses[j].cx, dy = rigs[r].center.y - poses[j].cy;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = r; }
      }
      const reach = poses[j].headW * 1.6;
      if (best >= 0 && bd < reach * reach) { match[j] = best; claimed[best] = true; }
    }
    // 2) übrige Gesichter auf WIRKLICH freie Rigs (nicht aktiv, nicht im Nachlauf)
    for (let j = 0; j < poses.length; j++) {
      if (match[j] >= 0) continue;
      let r = -1;
      for (let k = 0; k < rigs.length; k++) if (!claimed[k] && !rigs[k].active) { r = k; break; }
      if (r < 0) continue;
      match[j] = r; claimed[r] = true;
      rigs[r].smoothed = null; rigs[r].tassel.inited = false;
    }

    // Treffer eintragen. Nicht getroffene Rigs bleiben aktiv (Nachlauf) und
    // werden erst in applyRigs nach GRACE_MS ausgeblendet → kein Flackern.
    for (let j = 0; j < poses.length; j++) {
      const r = match[j];
      if (r >= 0) { rigs[r].target = poses[j]; rigs[r].active = true; rigs[r].lastSeen = now; }
    }
  }

  // Jeden Frame: glätten, Transform anwenden, Occluder & Quaste updaten.
  function applyRigs() {
    const now = performance.now();
    let dt = (now - lastApplyT) / 1000;
    if (!(dt > 0) || dt > 0.05) dt = 0.016;     // erster Frame / Tab-Wechsel abfangen
    lastApplyT = now;
    const s = 1 - TUNE.smooth;

    for (const rig of rigs) {
      // Nachlauf: kurz nach Verlust des Gesichts noch sichtbar halten
      if (rig.active && rig.target && (now - rig.lastSeen) > GRACE_MS) {
        rig.active = false; rig.target = null;
      }
      if (!rig.active || !rig.target) {
        if (rig.root.visible) rig.root.visible = false;
        if (rig.occluder.visible) rig.occluder.visible = false;
        if (rig.tassel.group.visible) rig.tassel.group.visible = false;
        continue;
      }
      const tg = rig.target;
      if (!rig.smoothed) {
        rig.smoothed = { pos: tg.anchor.clone(), occ: tg.occC.clone(), headW: tg.headW, scale: tg.scale, quat: tg.quat.clone() };
      } else {
        rig.smoothed.pos.lerp(tg.anchor, s);
        rig.smoothed.occ.lerp(tg.occC, s);
        rig.smoothed.headW += (tg.headW - rig.smoothed.headW) * s;
        rig.smoothed.scale += (tg.scale - rig.smoothed.scale) * s;
        rig.smoothed.quat.slerp(tg.quat, s);
      }
      const sm = rig.smoothed;
      rig.center.set(sm.pos.x, sm.pos.y);

      // Maske
      Object.keys(rig.modelRoots).forEach((k) => { rig.modelRoots[k].visible = (k === currentId); });
      rig.root.visible = true;
      rig.root.position.copy(sm.pos);
      rig.root.scale.setScalar(sm.scale);
      rig.root.quaternion.copy(sm.quat);

      // Occluder (Ellipsoid in Kopfform; vorne kürzer, damit die Hut-Vorderkante frei bleibt)
      const hw = sm.headW * TUNE.occScale;
      rig.occluder.visible = true;
      rig.occluder.position.copy(sm.occ);
      rig.occluder.quaternion.copy(sm.quat);
      rig.occluder.scale.set(hw * 0.60, hw * 0.78, hw * 0.50);

      // Quaste nur beim Doktorhut
      if (currentId === "cap") {
        rig.tassel.group.visible = true;
        // Mitte (Knopf) und Brett-Ecke in Weltkoordinaten
        _tmp.copy(TASSEL_MID).multiplyScalar(sm.scale).applyQuaternion(sm.quat).add(sm.pos);
        _tmp3.copy(TASSEL_CORNER).multiplyScalar(sm.scale).applyQuaternion(sm.quat).add(sm.pos);
        updateTassel(rig.tassel, _tmp, _tmp3, sm.scale, dt);
      } else {
        rig.tassel.group.visible = false;
      }
    }
  }

  // Verlet-Kette: die Quaste baumelt frei unter Schwerkraft am Aufhängepunkt
  // und schwingt bei Kopfbewegung nach.
  function updateTassel(t, mid, corner, scale, dt) {
    const N = t.N;
    const segLen = (0.9 * scale) / (N - 1);   // Länge des frei baumelnden Teils
    if (!t.inited) {
      for (let i = 0; i < N; i++) { t.pts[i].copy(corner).addScaledVector(DOWN, segLen * i); t.prev[i].copy(t.pts[i]); }
      t.inited = true;
    }
    const g = 2600 * (scale / 70);   // Schwerkraft, kopfgrößen-relativ
    const damp = 0.94;
    const dt2 = dt * dt;
    // Integration (Verlet); die Aufhängung an der Brett-Ecke bleibt fix
    for (let i = 1; i < N; i++) {
      const cur = t.pts[i], prev = t.prev[i];
      const vx = (cur.x - prev.x) * damp, vy = (cur.y - prev.y) * damp, vz = (cur.z - prev.z) * damp;
      prev.copy(cur);
      cur.x += vx; cur.y += vy - g * dt2; cur.z += vz;
    }
    // Zwangsbedingungen: feste Segmentlänge, Punkt 0 an der Ecke fixiert
    for (let k = 0; k < 14; k++) {
      t.pts[0].copy(corner);
      for (let i = 1; i < N; i++) {
        const a = t.pts[i - 1], b = t.pts[i];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;
        const diff = (d - segLen) / d;
        if (i - 1 === 0) { b.x -= dx * diff; b.y -= dy * diff; b.z -= dz * diff; }
        else { const h = 0.5 * diff; a.x += dx * h; a.y += dy * h; a.z += dz * h; b.x -= dx * h; b.y -= dy * h; b.z -= dz * h; }
      }
    }
    const rad = 0.028 * scale;
    // starre Schnur Mitte→Ecke (liegt auf dem Brett), dann die baumelnden Segmente
    placeCyl(t.topCord, mid, corner, rad);
    for (let i = 0; i < N - 1; i++) placeCyl(t.segs[i], t.pts[i], t.pts[i + 1], rad);
    // Franse + Knoten am unteren Ende
    const tip = t.pts[N - 1], above = t.pts[N - 2];
    _tmp2.copy(tip).sub(above).normalize();                 // nach unten entlang der Schnur
    t.fringe.quaternion.setFromUnitVectors(YUP, _tmp2.clone().negate());
    t.fringe.scale.setScalar(scale);
    t.fringe.position.copy(tip).addScaledVector(_tmp2, 0.15 * scale);
    t.knot.scale.setScalar(scale);
    t.knot.position.copy(tip);
  }

  // Setzt einen Zylinder (Basisgeometrie r=1,h=1) zwischen zwei Weltpunkte.
  function placeCyl(mesh, a, b, rad) {
    _tmp2.copy(b).sub(a);
    const len = _tmp2.length() || 1e-4;
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(rad, len, rad);
    _tmp2.multiplyScalar(1 / len);
    mesh.quaternion.setFromUnitVectors(YUP, _tmp2);
  }
})();
