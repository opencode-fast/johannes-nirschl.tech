/* =========================================================================
   ABI FOTOBOX — "Abi Buch" Galerie
   Zeigt alle zentral gespeicherten Fotos/Videos, live aktualisiert.
   ========================================================================= */
window.Gallery = (function () {
  let loaded = false;
  const seen = new Set();

  function grid() { return document.getElementById("galleryGrid"); }

  async function open() {
    Screens.show("galleryScreen");
    document.getElementById("galleryStatus").textContent = Storage.isCentral
      ? "Live · zentral gespeichert" : "Lokal-Modus (nur dieses Gerät)";
    if (!loaded) await refresh();
  }

  async function refresh() {
    const g = grid();
    g.innerHTML = `<div class="gallery-empty">Lädt…</div>`;
    let items = [];
    try { items = await Storage.list(); }
    catch (e) { g.innerHTML = `<div class="gallery-empty">Fehler beim Laden.<br><small>${e.message || e}</small></div>`; return; }
    seen.clear();
    g.innerHTML = "";
    if (!items.length) {
      g.innerHTML = `<div class="gallery-empty">Noch keine Fotos.<br>Sei die/der Erste! 🎓</div>`;
    } else {
      items.forEach((it) => { seen.add(it.id); g.appendChild(card(it)); });
    }
    loaded = true;
  }

  function card(it) {
    const el = document.createElement("figure");
    el.className = "gcard";
    if (it.mediaType === "video") {
      el.innerHTML = `<video src="${it.url}" playsinline muted loop preload="metadata"></video>
        <span class="gbadge">▶︎ Video</span>`;
      const v = el.querySelector("video");
      el.addEventListener("mouseenter", () => v.play().catch(()=>{}));
      el.addEventListener("mouseleave", () => { v.pause(); v.currentTime = 0; });
    } else {
      const label = it.mediaType === "strip" ? "Streifen" : "Foto";
      el.innerHTML = `<img src="${it.url}" loading="lazy" alt="Abi Foto">
        <span class="gbadge">${label}</span>`;
    }
    el.addEventListener("click", () => openLightbox(it));
    return el;
  }

  function prepend(it) {
    if (seen.has(it.id)) return;
    seen.add(it.id);
    const g = grid();
    const empty = g.querySelector(".gallery-empty");
    if (empty) g.innerHTML = "";
    const c = card(it);
    c.classList.add("gcard-new");
    g.insertBefore(c, g.firstChild);
  }

  /* Lightbox */
  function openLightbox(it) {
    const lb = document.getElementById("lightbox");
    const body = document.getElementById("lightboxBody");
    body.innerHTML = it.mediaType === "video"
      ? `<video src="${it.url}" controls autoplay playsinline loop></video>`
      : `<img src="${it.url}" alt="Abi Foto">`;
    lb.classList.add("show");
    document.getElementById("lightboxDownload").href = it.url;
    document.getElementById("lightboxDownload").download = "abi-" + it.id + (it.mediaType==="video"?".webm":".jpg");
  }
  function closeLightbox() {
    const lb = document.getElementById("lightbox");
    lb.classList.remove("show");
    document.getElementById("lightboxBody").innerHTML = "";
  }

  // Live: neue Medien sofort einblenden
  Storage.onNew((it) => {
    if (document.getElementById("galleryScreen").classList.contains("active")) prepend(it);
    else loaded = false; // beim nächsten Öffnen neu laden
    toast();
  });

  let toastTimer = null;
  function toast() {
    const t = document.getElementById("newToast");
    if (!t) return;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  return { open, refresh, closeLightbox };
})();
