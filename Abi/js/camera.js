/* =========================================================================
   ABI FOTOBOX — Kamera & Aufnahme-Engine
   Live-Vorschau + Filter + platzierbare Sticker/Masken + Rahmen.
   Erzeugt Foto (JPEG), 4er-Fotostreifen (JPEG) und Video (WebM) mit
   fest eingebrannten Effekten.
   ========================================================================= */
window.Camera = (function () {
  let stream = null;
  let facing = "user";
  const video = () => document.getElementById("video");
  const stage = () => document.getElementById("stage");

  /* ---------------- Kamera starten / wechseln ---------------- */
  async function start(facingMode) {
    if (facingMode) facing = facingMode;
    stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
    } catch (err) {
      // Fallback ohne facingMode-Zwang
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    const v = video();
    v.srcObject = stream;
    v.muted = true;
    await v.play().catch(() => {});
    return stream;
  }

  function stop() {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  }

  async function flip() {
    facing = facing === "user" ? "environment" : "user";
    await start(facing);
    applyMirror();
  }

  function applyMirror() {
    // Frontkamera spiegeln (natürlicheres Selfie-Gefühl)
    const v = video();
    const t = facing === "user" ? "scaleX(-1)" : "none";
    v.style.transform = t;
    // 3D-Masken-Canvas identisch spiegeln, damit alles deckungsgleich bleibt
    if (window.HeadTrack && window.HeadTrack.canvas) window.HeadTrack.canvas.style.transform = t;
  }

  /* ---------------- Effekt-Zustand ---------------- */
  const fx = {
    filterCss: "none",
    stickers: [],     // {char, type, x(0-1), y(0-1), scale, rot}
    background: null,  // svg-fn oder null
  };

  function setFilter(css) {
    fx.filterCss = css || "none";
    video().style.filter = fx.filterCss;
  }

  function addSticker(st, isMask) {
    const el = { uid: Math.random().toString(36).slice(2), char: st.char, type: st.type,
      x: 0.5, y: isMask ? 0.35 : 0.5, scale: isMask ? 2.4 : 1.2, rot: 0 };
    fx.stickers.push(el);
    renderStickers();
    return el;
  }

  function clearStickers() { fx.stickers = []; renderStickers(); }
  function setBackground(svgFn) { fx.background = svgFn || null; renderBackground(); }

  function reset() {
    setFilter("none");
    fx.stickers = [];
    fx.background = null;
    renderStickers();
    renderBackground();
  }

  /* ---------------- Sticker-Overlay (DOM, ziehbar) ---------------- */
  function renderStickers() {
    const layer = document.getElementById("stickerLayer");
    layer.innerHTML = "";
    fx.stickers.forEach((s) => {
      const d = document.createElement("div");
      d.className = "sticker" + (s.type === "text" ? " sticker-text" : "");
      d.textContent = s.char;
      d.style.left = s.x * 100 + "%";
      d.style.top = s.y * 100 + "%";
      d.style.transform = `translate(-50%,-50%) scale(${s.scale}) rotate(${s.rot}deg)`;
      attachDrag(d, s, layer);
      // Doppeltipp/-klick entfernt Sticker
      d.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        fx.stickers = fx.stickers.filter((x) => x.uid !== s.uid);
        renderStickers();
      });
      const del = document.createElement("button");
      del.className = "sticker-del";
      del.textContent = "×";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        fx.stickers = fx.stickers.filter((x) => x.uid !== s.uid);
        renderStickers();
      });
      d.appendChild(del);
      layer.appendChild(d);
    });
  }

  function attachDrag(el, s, layer) {
    let startX, startY, ox, oy, pinchStart = null;

    function pointFor(e) {
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX, y: t.clientY };
    }
    function onDown(e) {
      if (e.target.classList.contains("sticker-del")) return;
      e.preventDefault();
      if (e.touches && e.touches.length === 2) { pinchStart = pinchInfo(e); return; }
      const p = pointFor(e);
      startX = p.x; startY = p.y; ox = s.x; oy = s.y;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
    }
    function onMove(e) {
      e.preventDefault();
      if (e.touches && e.touches.length === 2 && pinchStart) {
        const pi = pinchInfo(e);
        s.scale = Math.max(0.4, Math.min(6, pinchStart.scale * (pi.dist / pinchStart.dist)));
        s.rot = pinchStart.rot + (pi.angle - pinchStart.angle);
        applyTransform();
        return;
      }
      const rect = layer.getBoundingClientRect();
      const p = pointFor(e);
      s.x = Math.max(0, Math.min(1, ox + (p.x - startX) / rect.width));
      s.y = Math.max(0, Math.min(1, oy + (p.y - startY) / rect.height));
      el.style.left = s.x * 100 + "%";
      el.style.top = s.y * 100 + "%";
    }
    function onUp() {
      pinchStart = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    }
    function pinchInfo(e) {
      const a = e.touches[0], b = e.touches[1];
      const dx = b.clientX - a.clientX, dy = b.clientY - a.clientY;
      return { dist: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) * 180 / Math.PI, scale: s.scale, rot: s.rot };
    }
    function applyTransform() {
      el.style.transform = `translate(-50%,-50%) scale(${s.scale}) rotate(${s.rot}deg)`;
    }
    el.addEventListener("mousedown", onDown);
    el.addEventListener("touchstart", onDown, { passive: false });
  }

  function renderBackground() {
    const layer = document.getElementById("bgLayer");
    if (!fx.background) { layer.style.backgroundImage = "none"; return; }
    const s = stage();
    const w = s.clientWidth, h = s.clientHeight;
    layer.style.backgroundImage = `url("${window.svgToDataUrl(fx.background(w, h))}")`;
    layer.style.backgroundSize = "cover";
  }

  /* ---------------- Compositing auf Canvas ---------------- */
  // Zeichnet eine Quelle "cover" (zentriert, füllend) in den Zielbereich,
  // optional horizontal gespiegelt (Frontkamera).
  function drawCover(ctx, src, sw0, sh0, dx, dy, dw, dh, flip) {
    const scale = Math.max(dw / sw0, dh / sh0);
    const cw = dw / scale, ch = dh / scale;
    const cx = (sw0 - cw) / 2, cy = (sh0 - ch) / 2;
    if (flip) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(src, cx, cy, cw, ch, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(src, cx, cy, cw, ch, dx, dy, dw, dh);
    }
  }

  // Zeichnet Videoframe + Filter + 3D-Maske + Sticker + Rahmen in ctx-Bereich
  function drawComposite(ctx, dx, dy, dw, dh) {
    const v = video();
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();

    // Videoframe (mit Filter + evtl. gespiegelt) — "cover" berechnen
    const flip = facing === "user";
    const vw = v.videoWidth || 1280, vh = v.videoHeight || 960;
    ctx.filter = fx.filterCss === "none" ? "none" : fx.filterCss;
    drawCover(ctx, v, vw, vh, dx, dy, dw, dh, flip);
    ctx.filter = "none";

    // 3D-Masken (Doktorhut etc.) — deckungsgleich mit dem Anzeige-Canvas
    const ht = window.HeadTrack;
    if (ht && ht.isActive && ht.canvas && ht.canvas.width) {
      drawCover(ctx, ht.canvas, ht.canvas.width, ht.canvas.height, dx, dy, dw, dh, flip);
    }

    // Partikel-Effekte (Feuerbälle etc.) — über der Person, unter Rahmen.
    // Nicht gespiegelt (symmetrisch), deckt den gesamten Bereich.
    const ef = window.Effects;
    if (ef && ef.active() && ef.canvas && ef.canvas.width) {
      drawCover(ctx, ef.canvas, ef.canvas.width, ef.canvas.height, dx, dy, dw, dh, false);
    }

    // Sticker (relativ zum Zielbereich)
    fx.stickers.forEach((s) => {
      const px = dx + s.x * dw, py = dy + s.y * dh;
      const base = dw * (s.type === "text" ? 0.11 : 0.14);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((s.rot * Math.PI) / 180);
      if (s.type === "text") {
        const fs = base * s.scale;
        ctx.font = `700 ${fs}px Georgia, serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = fs * 0.12;
        ctx.strokeStyle = "#0b1f3a";
        ctx.strokeText(s.char, 0, 0);
        ctx.fillStyle = "#d4af37";
        ctx.fillText(s.char, 0, 0);
      } else {
        const fs = base * s.scale;
        ctx.font = `${fs}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.char, 0, 0);
      }
      ctx.restore();
    });
    ctx.restore();

    // Rahmen zuletzt (über allem)
    if (fx.background) {
      const img = bgImageCache(dw, dh);
      if (img && img.complete) ctx.drawImage(img, dx, dy, dw, dh);
    }
  }

  // Rahmen-Bild cachen, damit es beim Video-Loop nicht neu geladen wird
  let _bgImg = null, _bgKey = "";
  function bgImageCache(w, h) {
    if (!fx.background) return null;
    const key = w + "x" + h + fx.background.toString().length;
    if (_bgKey !== key) {
      _bgKey = key;
      _bgImg = new Image();
      _bgImg.src = window.svgToDataUrl(fx.background(w, h));
    }
    return _bgImg;
  }

  /* ---------------- Einzelfoto ---------------- */
  function capturePhoto() {
    const s = stage();
    const w = 1080, h = Math.round((s.clientHeight / s.clientWidth) * 1080);
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    drawComposite(ctx, 0, 0, w, h);
    return new Promise((res) => cv.toBlob((b) => res(b), "image/jpeg", 0.9));
  }

  /* ---------------- 4er-Fotostreifen (klassischer Filmstreifen) ---------- */
  // frames: 4 Foto-Blobs; komponiert einen schwarzen Filmstreifen mit
  // Perforationslöchern an beiden Seiten (Schwarz-Weiß-Look).
  async function buildStrip(frameBlobs) {
    const W = 760;
    const sprocketW = Math.round(W * 0.135);      // schwarzer Rand je Seite
    const frameW = W - sprocketW * 2;             // Bildbreite
    const frameH = Math.round(frameW * 1.0);      // ~ quadratische Frames wie Vorlage
    const sep = 14;                               // schwarzer Abstand zwischen Frames
    const topM = 26, botM = 84;                   // Ränder oben/unten
    const H = topM + frameH * 4 + sep * 3 + botM;

    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");

    // Filmkörper: durchgehend schwarz
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);

    // Fotos einsetzen (Cover-Zuschnitt, quadratisch)
    const imgs = await Promise.all(frameBlobs.map(blobToImage));
    imgs.forEach((img, i) => {
      const y = topM + i * (frameH + sep);
      const scale = Math.max(frameW / img.width, frameH / img.height);
      const sw = frameW / scale, sh = frameH / scale;
      const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, sprocketW, y, frameW, frameH);
    });

    // Perforationslöcher (weiß) an beiden Seiten, durchgehend
    const holeW = Math.round(sprocketW * 0.42);
    const holeH = Math.round(holeW * 0.72);
    const holeR = Math.round(holeH * 0.28);
    const pitch = Math.round(holeH * 2.05);       // Abstand von Loch zu Loch
    const leftX = Math.round((sprocketW - holeW) / 2);
    const rightX = W - sprocketW + leftX;
    ctx.fillStyle = "#ffffff";
    for (let y = pitch; y < H - holeH; y += pitch) {
      roundRect(ctx, leftX, y, holeW, holeH, holeR); ctx.fill();
      roundRect(ctx, rightX, y, holeW, holeH, holeR); ctx.fill();
    }

    // Dezente Beschriftung unten (S/W, minimalistisch)
    const date = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "800 30px 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText((window.ABI_CONFIG.SCHULE || "ABITUR").toUpperCase(), W / 2, H - botM / 2 - 4);
    ctx.font = "500 20px 'Helvetica Neue', Arial, sans-serif";
    ctx.fillStyle = "#9a9a9a";
    ctx.fillText(date, W / 2, H - botM / 2 + 24);

    return new Promise((res) => cv.toBlob((b) => res(b), "image/jpeg", 0.92));
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function blobToImage(blob) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(blob);
    });
  }

  /* ---------------- Video-Aufnahme (Effekte eingebrannt) ---------------- */
  let recorder = null, recCanvas = null, recCtx = null, recRAF = null, recStream = null, recChunks = [];

  function startVideo() {
    const s = stage();
    const w = 720, h = Math.round((s.clientHeight / s.clientWidth) * 720);
    recCanvas = document.createElement("canvas");
    recCanvas.width = w; recCanvas.height = h;
    recCtx = recCanvas.getContext("2d");
    recChunks = [];

    const loop = () => {
      recCtx.fillStyle = "#000";
      recCtx.fillRect(0, 0, w, h);
      drawComposite(recCtx, 0, 0, w, h);
      recRAF = requestAnimationFrame(loop);
    };
    loop();

    recStream = recCanvas.captureStream(30);
    // Audio vom Mikro dazumischen, falls verfügbar
    const mime = pickMime();
    recorder = new MediaRecorder(recStream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    recorder.start();
  }

  function pickMime() {
    const cands = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    return cands.find((c) => window.MediaRecorder && MediaRecorder.isTypeSupported(c)) || "";
  }

  function stopVideo() {
    return new Promise((res) => {
      if (!recorder) return res(null);
      recorder.onstop = () => {
        cancelAnimationFrame(recRAF);
        const blob = new Blob(recChunks, { type: "video/webm" });
        recorder = null;
        res(blob);
      };
      recorder.stop();
    });
  }

  return {
    start, stop, flip, applyMirror,
    setFilter, addSticker, clearStickers, setBackground, reset,
    renderBackground,
    capturePhoto, buildStrip,
    startVideo, stopVideo,
    get facing() { return facing; },
  };
})();
