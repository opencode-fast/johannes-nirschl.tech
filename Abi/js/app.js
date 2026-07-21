/* =========================================================================
   ABI FOTOBOX — App-Steuerung
   Startmenü → Modus wählen → Aufnahme → Vorschau → im Abi Buch speichern.
   ========================================================================= */

/* ---------------- Screen-Routing ---------------- */
window.Screens = {
  show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    window.scrollTo(0, 0);
  },
};

const App = (function () {
  let mode = null;              // "strip" | "photo" | "video"
  let capturedBlob = null;      // aktuelles Ergebnis
  let capturedType = null;      // "photo" | "strip" | "video"
  let recording = false;

  /* ---------------- Start ---------------- */
  function init() {
    buildToolbars();
    wireStartMenu();
    wireBoothControls();
    wirePreview();
    wireGallery();

    // Modus-Anzeige im Lokal-Modus
    if (!Storage.isCentral) {
      document.getElementById("modeNote").style.display = "block";
    }
    document.getElementById("year").textContent = new Date().getFullYear();
  }

  /* ---------------- Startmenü ---------------- */
  function wireStartMenu() {
    document.getElementById("btnStrip").addEventListener("click", () => enterBooth("strip"));
    document.getElementById("btnFree").addEventListener("click", () => {
      Screens.show("freeScreen");
    });
    document.getElementById("btnFreePhoto").addEventListener("click", () => enterBooth("photo"));
    document.getElementById("btnFreeVideo").addEventListener("click", () => enterBooth("video"));
    document.getElementById("btnFreeBack").addEventListener("click", () => Screens.show("startScreen"));
    document.getElementById("btnBook").addEventListener("click", () => Gallery.open());
    document.getElementById("btnBookFromBooth").addEventListener("click", () => { if (window.HeadTrack) window.HeadTrack.stop(); Camera.stop(); Gallery.open(); });
  }

  /* ---------------- Fotobox betreten ---------------- */
  async function enterBooth(m) {
    mode = m;
    capturedBlob = null; capturedType = null;
    Camera.reset();
    Screens.show("boothScreen");
    setupCaptureButton();
    document.getElementById("boothTitle").textContent =
      m === "strip" ? "Fotostreifen · 4 Fotos" : m === "video" ? "Video" : "Einzelfoto";
    hideCamError();
    try {
      await Camera.start("user");
      Camera.applyMirror();
      Camera.renderBackground();
      hideCamError();
      // Kopf-Tracking fortsetzen, falls eine 3D-Maske aktiv ist
      if (window.HeadTrack && window.HeadTrack.ready && window.HeadTrack.isActive) window.HeadTrack.start();
    } catch (e) {
      showCamError(e);
    }
  }

  /* Kamera-Fehler freundlich & handlungsleitend im Booth anzeigen (kein Rauswurf) */
  function showCamError(e) {
    const box = document.getElementById("camError");
    const secure = window.isSecureContext;
    const noApi = !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia;
    let title, hint;
    if (!secure || noApi) {
      title = "Kamera braucht eine sichere Verbindung";
      hint = "Öffne die App über <b>https://…</b> oder <b>http://localhost</b> — nicht als Datei (file://) oder über eine IP-Adresse. Danach fragt der Browser nach Kamerazugriff.";
    } else if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
      title = "Kamerazugriff wurde blockiert";
      hint = "Bitte im Browser den Kamerazugriff für diese Seite <b>erlauben</b> und erneut versuchen.";
    } else if (e && e.name === "NotFoundError") {
      title = "Keine Kamera gefunden";
      hint = "Es wurde keine Kamera erkannt. Prüfe, ob eine Kamera vorhanden und nicht von einer anderen App belegt ist.";
    } else {
      title = "Kamera konnte nicht gestartet werden";
      hint = (e && (e.message || e.name)) ? String(e.message || e.name) : "Unbekannter Fehler.";
    }
    box.querySelector(".cam-error-title").textContent = title;
    box.querySelector(".cam-error-hint").innerHTML = hint;
    box.classList.add("show");
  }
  function hideCamError() {
    document.getElementById("camError").classList.remove("show");
  }

  function setupCaptureButton() {
    const btn = document.getElementById("shutter");
    btn.classList.toggle("is-video", mode === "video");
    document.getElementById("shutterLabel").textContent =
      mode === "strip" ? "4 Fotos starten" : mode === "video" ? "Aufnahme" : "Foto";
  }

  /* ---------------- Effekt-Toolbars aufbauen ---------------- */
  function buildToolbars() {
    // Filter
    const fr = document.getElementById("filterRow");
    ABI_FILTERS.forEach((f, i) => {
      const b = document.createElement("button");
      b.className = "chip" + (i === 0 ? " active" : "");
      b.textContent = f.name;
      b.addEventListener("click", () => {
        Camera.setFilter(f.css);
        fr.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
      });
      fr.appendChild(b);
    });

    // Sticker
    const sr = document.getElementById("stickerRow");
    ABI_STICKERS.forEach((s) => {
      const b = document.createElement("button");
      b.className = "chip chip-icon" + (s.type === "text" ? " chip-text" : "");
      b.textContent = s.type === "text" ? s.char : s.char;
      b.title = s.name;
      b.addEventListener("click", () => Camera.addSticker(s, false));
      sr.appendChild(b);
    });

    // Masken (3D, kopfgetrackt) — mit Fallback auf Emoji-Masken
    buildMaskRow();

    // Hintergründe
    const br = document.getElementById("bgRow");
    ABI_BACKGROUNDS.forEach((bg, i) => {
      const b = document.createElement("button");
      b.className = "chip" + (i === 0 ? " active" : "");
      b.textContent = bg.name;
      b.addEventListener("click", () => {
        Camera.setBackground(bg.svg);
        br.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
      });
      br.appendChild(b);
    });

    // Tabs zwischen Effekt-Kategorien
    document.querySelectorAll(".fxtab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".fxtab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".fxpanel").forEach((p) => p.classList.remove("active"));
        document.getElementById(tab.dataset.panel).classList.add("active");
      });
    });
  }

  /* ---------------- 3D-Masken (Kopf-Tracking) ---------------- */
  function buildMaskRow() {
    const mr = document.getElementById("maskRow");
    mr.innerHTML = "";
    const HT = window.HeadTrack;
    if (!HT || HT.available === false) { buildEmojiMaskRow(); return; }
    mr.appendChild(mkMaskChip("Keine", null, true));
    HT.models.forEach((m) => mr.appendChild(mkMaskChip(m.name, m.id, false)));
  }

  function mkMaskChip(label, id, active) {
    const b = document.createElement("button");
    b.className = "chip" + (active ? " active" : "");
    b.textContent = label;
    b.addEventListener("click", () => selectMask(id, b));
    return b;
  }

  async function selectMask(id, btn) {
    const HT = window.HeadTrack;
    const hint = document.getElementById("maskHint");
    if (!HT) return;

    // Beim ersten echten Masken-Tap die Engine laden
    if (id && HT.available !== true) {
      hint.textContent = "3D-Masken werden geladen…";
      const ok = await HT.init(document.getElementById("video"), document.getElementById("stage"));
      if (!ok) {
        hint.textContent = "3D-Masken hier nicht verfügbar — einfache Masken werden genutzt.";
        buildEmojiMaskRow();
        return;
      }
      Camera.applyMirror();
    }
    if (HT.available !== true) return; // Fallback aktiv oder nicht bereit

    HT.setMask(id);
    document.querySelectorAll("#maskRow .chip").forEach((x) => x.classList.remove("active"));
    if (btn) btn.classList.add("active");
    hint.textContent = id ? "Bewege deinen Kopf — die Maske folgt dir." : "3D-Masken folgen deinem Kopf.";
  }

  function buildEmojiMaskRow() {
    const mr = document.getElementById("maskRow");
    mr.innerHTML = "";
    document.getElementById("maskHint").textContent =
      "Auf das Gesicht ziehen · mit zwei Fingern größer/drehen";
    ABI_MASKS.forEach((s) => {
      const b = document.createElement("button");
      b.className = "chip chip-icon";
      b.textContent = s.char;
      b.title = s.name;
      b.addEventListener("click", () => Camera.addSticker(s, true));
      mr.appendChild(b);
    });
  }

  /* ---------------- Booth-Controls ---------------- */
  function wireBoothControls() {
    document.getElementById("shutter").addEventListener("click", onShutter);
    document.getElementById("btnFlip").addEventListener("click", () => Camera.flip());
    document.getElementById("btnClearStickers").addEventListener("click", () => Camera.clearStickers());
    document.getElementById("btnBoothBack").addEventListener("click", () => {
      if (recording) return;
      if (window.HeadTrack) window.HeadTrack.stop();
      Camera.stop();
      Screens.show("startScreen");
    });
    document.getElementById("btnCamRetry").addEventListener("click", async () => {
      hideCamError();
      try {
        await Camera.start("user");
        Camera.applyMirror();
        Camera.renderBackground();
      } catch (e) { showCamError(e); }
    });
  }

  async function onShutter() {
    if (mode === "video") { return toggleVideo(); }
    if (mode === "photo") {
      await countdown(3);
      const blob = await Camera.capturePhoto();
      showPreview(blob, "photo");
    }
    if (mode === "strip") {
      const frames = [];
      for (let i = 0; i < 4; i++) {
        setStripHint(`Foto ${i + 1} von 4`);
        await countdown(3);
        flash();
        frames.push(await Camera.capturePhoto());
        await wait(600);
      }
      setStripHint("");
      setBusy(true, "Streifen wird gebaut…");
      const strip = await Camera.buildStrip(frames);
      setBusy(false);
      showPreview(strip, "strip");
    }
  }

  async function toggleVideo() {
    const btn = document.getElementById("shutter");
    if (!recording) {
      recording = true;
      btn.classList.add("recording");
      document.getElementById("shutterLabel").textContent = "Stopp";
      Camera.startVideo();
      startRecTimer();
    } else {
      recording = false;
      btn.classList.remove("recording");
      stopRecTimer();
      setBusy(true, "Video wird verarbeitet…");
      const blob = await Camera.stopVideo();
      setBusy(false);
      document.getElementById("shutterLabel").textContent = "Aufnahme";
      if (blob) showPreview(blob, "video");
    }
  }

  /* ---------------- Countdown / Effekte ---------------- */
  function countdown(n) {
    return new Promise((res) => {
      const el = document.getElementById("countdown");
      let c = n;
      el.textContent = c;
      el.classList.add("show");
      const iv = setInterval(() => {
        c--;
        if (c <= 0) { clearInterval(iv); el.classList.remove("show"); flash(); res(); }
        else { el.textContent = c; el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); }
      }, 800);
    });
  }
  function flash() {
    const f = document.getElementById("flash");
    f.classList.add("go");
    setTimeout(() => f.classList.remove("go"), 260);
  }
  function setStripHint(t) { document.getElementById("stripHint").textContent = t; }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let recTimer = null, recStart = 0;
  function startRecTimer() {
    recStart = Date.now();
    const el = document.getElementById("recTimer");
    el.classList.add("show");
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - recStart) / 1000);
      el.textContent = "● " + String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    }, 300);
  }
  function stopRecTimer() {
    clearInterval(recTimer);
    document.getElementById("recTimer").classList.remove("show");
  }

  function setBusy(on, text) {
    const b = document.getElementById("busy");
    document.getElementById("busyText").textContent = text || "";
    b.classList.toggle("show", on);
  }

  /* ---------------- Vorschau + Speichern ---------------- */
  function showPreview(blob, type) {
    capturedBlob = blob; capturedType = type;
    if (window.HeadTrack) window.HeadTrack.stop();
    Camera.stop();
    const box = document.getElementById("previewMedia");
    const url = URL.createObjectURL(blob);
    box.innerHTML = type === "video"
      ? `<video src="${url}" controls autoplay loop playsinline></video>`
      : `<img src="${url}" alt="Vorschau">`;
    document.getElementById("saveHint").textContent = Storage.isCentral
      ? "Wird ins zentrale Abi Buch hochgeladen" : "Wird lokal gespeichert (Lokal-Modus)";
    Screens.show("previewScreen");
  }

  function wirePreview() {
    document.getElementById("btnRetake").addEventListener("click", async () => {
      URLcleanup();
      await enterBooth(mode);
    });
    document.getElementById("btnSave").addEventListener("click", onSave);
    document.getElementById("btnDownload").addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(capturedBlob);
      a.download = "abi-" + Date.now() + (capturedType === "video" ? ".webm" : ".jpg");
      a.click();
    });
  }

  async function onSave() {
    const btn = document.getElementById("btnSave");
    const author = document.getElementById("authorInput").value.trim();
    btn.disabled = true;
    setBusy(true, Storage.isCentral ? "Wird hochgeladen…" : "Wird gespeichert…");
    try {
      await Storage.save(capturedBlob, {
        mode, mediaType: capturedType, author,
      });
      setBusy(false);
      btn.disabled = false;
      URLcleanup();
      document.getElementById("authorInput").value = author; // Name merken
      Gallery.refresh();
      Screens.show("doneScreen");
    } catch (e) {
      setBusy(false);
      btn.disabled = false;
      alert("Speichern fehlgeschlagen:\n" + (e.message || e) + "\n\nTipp: Supabase-Setup prüfen (SUPABASE_SETUP.md).");
    }
  }

  function URLcleanup() {
    document.getElementById("previewMedia").innerHTML = "";
  }

  /* ---------------- Galerie / Abschluss ---------------- */
  function wireGallery() {
    document.getElementById("btnGalleryBack").addEventListener("click", () => Screens.show("startScreen"));
    document.getElementById("btnGalleryRefresh").addEventListener("click", () => Gallery.refresh());
    document.getElementById("lightboxClose").addEventListener("click", () => Gallery.closeLightbox());
    document.getElementById("lightbox").addEventListener("click", (e) => {
      if (e.target.id === "lightbox") Gallery.closeLightbox();
    });
    document.getElementById("btnDoneBook").addEventListener("click", () => Gallery.open());
    document.getElementById("btnDoneAgain").addEventListener("click", () => Screens.show("startScreen"));
  }

  return { init };
})();

window.addEventListener("DOMContentLoaded", App.init);
