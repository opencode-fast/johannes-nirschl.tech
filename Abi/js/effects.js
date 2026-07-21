/* =========================================================================
   ABI FOTOBOX — Partikel-Effekte (Feuerbälle, Konfetti, Funken)
   Eigener 2D-Canvas über der Person. Läuft live und wird ins Foto/Video
   eingebrannt (siehe camera.js → drawComposite). Kein WebGL nötig.
   ========================================================================= */
(function () {
  "use strict";

  const TYPES = [
    { id: "fire",     name: "🔥 Feuerbälle" },
    { id: "confetti", name: "🎉 Konfetti" },
    { id: "sparkle",  name: "✨ Funken" },
  ];

  let canvas = null, ctx = null, stage = null;
  let raf = null, type = null, last = 0, spawnAcc = 0;
  let parts = [];

  const rand = (a, b) => a + Math.random() * (b - a);

  const EF = { init, set, start, stop, active, get canvas() { return canvas; }, get types() { return TYPES.slice(); } };
  window.Effects = EF;

  function init(stageEl) {
    if (canvas) { resize(); return canvas; }
    stage = stageEl;
    canvas = document.createElement("canvas");
    canvas.id = "fxCanvas";
    stage.insertBefore(canvas, stage.querySelector(".bg-layer") || null);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    return canvas;
  }

  function resize() {
    if (!canvas || !stage) return;
    const r = stage.getBoundingClientRect();
    // Fallback, falls die Stage beim Init noch keine Größe hat
    const w = Math.max(80, Math.round(r.width || 360));
    const h = Math.max(80, Math.round(r.height || w * 1.33));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  function active() { return !!type; }

  function set(t) {
    type = t || null;
    parts.length = 0; spawnAcc = 0;
    if (type) start(); else { stop(); clearCanvas(); }
  }

  function start() {
    if (raf != null || !type || !canvas) return;
    resize();
    last = performance.now();
    loop();
  }
  function stop() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } }
  function clearCanvas() { if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height); }

  function loop() {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    let dt = (now - last) / 1000;
    if (!(dt > 0) || dt > 0.05) dt = 0.016;
    last = now;
    step(dt);
    draw();
  }

  /* ---------------- Simulation ---------------- */
  function step(dt) {
    const W = canvas.width, H = canvas.height;

    if (type === "fire") {
      spawnAcc += dt * 6;                    // ~6 Feuerbälle/s
      while (spawnAcc >= 1) { spawnAcc -= 1; spawnFire(W, H); }
    } else if (type === "confetti") {
      spawnAcc += dt * 45;
      while (spawnAcc >= 1) { spawnAcc -= 1; spawnConfetti(W, H); }
    } else if (type === "sparkle") {
      spawnAcc += dt * 34;
      while (spawnAcc >= 1) { spawnAcc -= 1; spawnSparkle(W, H); }
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.k === "fire") {
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        p.emit -= dt; if (p.emit <= 0) { p.emit = 0.045; spawnEmber(p, H); }
        if (p.life >= p.max || p.y < -0.08 * H) { burst(p, H); parts.splice(i, 1); continue; }
      } else if (p.k === "ember" || p.k === "spark") {
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life >= p.max) parts.splice(i, 1);
      } else if (p.k === "confetti") {
        p.vy += p.g * dt;
        p.x += p.vx * dt + Math.sin(p.life * p.fl) * p.amp * dt;
        p.y += p.vy * dt; p.rot += p.vr * dt;
        if (p.y > H + 40 || p.life >= p.max) parts.splice(i, 1);
      } else if (p.k === "sparkle") {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life >= p.max) parts.splice(i, 1);
      }
    }
    if (parts.length > 360) parts.splice(0, parts.length - 360);
  }

  function spawnFire(W, H) {
    parts.push({
      k: "fire", x: rand(0.08, 0.92) * W, y: H + rand(0, 0.03 * H),
      vx: rand(-0.10, 0.10) * W, vy: -rand(0.9, 1.4) * H, g: rand(0.75, 0.95) * H,
      size: rand(0.045, 0.08) * W, life: 0, max: rand(1.3, 2.1), hue: rand(15, 45), emit: 0,
    });
  }
  function spawnEmber(p, H) {
    parts.push({
      k: "ember", x: p.x + rand(-0.4, 0.4) * p.size, y: p.y + rand(0, 0.5) * p.size,
      vx: rand(-0.02, 0.02) * canvas.width, vy: rand(-0.01, 0.07) * H, g: 0.1 * H,
      size: rand(0.25, 0.5) * p.size, life: 0, max: rand(0.3, 0.55), hue: p.hue + rand(-6, 12),
    });
  }
  function burst(p, H) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + rand(-0.3, 0.3);
      const sp = rand(0.12, 0.32) * H;
      parts.push({
        k: "spark", x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.55 * H,
        size: rand(0.16, 0.32) * p.size, life: 0, max: rand(0.4, 0.8), hue: p.hue + rand(0, 15),
      });
    }
  }
  function spawnSparkle(W, H) {
    parts.push({
      k: "sparkle", x: rand(0, 1) * W, y: H + 10,
      vx: rand(-0.03, 0.03) * W, vy: -rand(0.2, 0.5) * H,
      size: rand(0.006, 0.016) * W, life: 0, max: rand(1.2, 2.2), hue: rand(42, 52),
    });
  }
  function spawnConfetti(W, H) {
    const cols = ["#e63946", "#f1c40f", "#2a9d8f", "#457b9d", "#e76f51", "#ffffff", "#caa64b"];
    parts.push({
      k: "confetti", x: rand(0, 1) * W, y: -20,
      vx: rand(-0.05, 0.05) * W, vy: rand(0.25, 0.55) * H, g: 0.15 * H,
      size: rand(0.012, 0.024) * W, rot: rand(0, 6.28), vr: rand(-4, 4),
      fl: rand(4, 9), amp: rand(0.05, 0.12) * W, life: 0, max: rand(3, 5),
      col: cols[(Math.random() * cols.length) | 0],
    });
  }

  /* ---------------- Zeichnen ---------------- */
  function draw() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    // glühende Partikel additiv
    ctx.globalCompositeOperation = "lighter";
    for (const p of parts) {
      if (p.k === "fire" || p.k === "ember" || p.k === "spark" || p.k === "sparkle") drawGlow(p);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    for (const p of parts) if (p.k === "confetti") drawConfetti(p);
  }

  function drawGlow(p) {
    const f = 1 - p.life / p.max;
    if (f <= 0) return;
    let r, a, hue = p.hue, coreL = 85;
    if (p.k === "fire") { r = p.size * (1.1 + 0.5 * (1 - f)); a = Math.min(1, f * 1.4); }
    else if (p.k === "ember") { r = p.size; a = f * 0.85; }
    else if (p.k === "spark") { r = p.size * 0.9; a = f; }
    else { r = p.size * (0.8 + Math.abs(Math.sin(p.life * 12)) * 0.6); a = f; coreL = 92; } // sparkle: funkeln
    r = Math.max(1, r);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `hsla(${hue},100%,${coreL}%,${a})`);
    g.addColorStop(0.35, `hsla(${hue},100%,60%,${a * 0.65})`);
    g.addColorStop(1, `hsla(${Math.max(0, hue - 20)},100%,45%,0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawConfetti(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, Math.min(1, p.max - p.life));
    ctx.fillStyle = p.col;
    ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
})();
