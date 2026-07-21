/* =========================================================================
   ABI FOTOBOX — Speicher-Schicht
   Zentral über Supabase (Storage + Realtime), sonst lokal (localStorage).
   Einheitliche API:
     Storage.isCentral        → true wenn Supabase konfiguriert
     Storage.save(blob, meta) → speichert ein Medium, liefert Eintrag
     Storage.list()           → alle Einträge (neueste zuerst)
     Storage.onNew(cb)        → Callback bei neuem Eintrag (live)
   ========================================================================= */
window.Storage = (function () {
  const cfg = window.ABI_CONFIG || {};
  const central = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  let client = null;
  const listeners = [];

  if (central) {
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  function emit(entry) { listeners.forEach((cb) => { try { cb(entry); } catch (e) { console.error(e); } }); }

  /* ---------------- Zentral (Supabase) ---------------- */
  async function saveCentral(blob, meta) {
    const ext = blob.type.includes("webm") ? "webm" : "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const up = await client.storage.from(cfg.BUCKET).upload(path, blob, {
      contentType: blob.type, upsert: false,
    });
    if (up.error) throw up.error;

    const { data: pub } = client.storage.from(cfg.BUCKET).getPublicUrl(path);
    const row = {
      mode: meta.mode,
      media_type: meta.mediaType,       // "photo" | "strip" | "video"
      url: pub.publicUrl,
      author: meta.author || null,
      caption: meta.caption || null,
    };
    const ins = await client.from(cfg.TABLE).insert(row).select().single();
    if (ins.error) throw ins.error;
    return normalize(ins.data);
  }

  async function listCentral() {
    const res = await client.from(cfg.TABLE).select("*").order("created_at", { ascending: false });
    if (res.error) throw res.error;
    return res.data.map(normalize);
  }

  function subscribeCentral() {
    client
      .channel("fotos-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: cfg.TABLE },
        (payload) => emit(normalize(payload.new)))
      .subscribe();
  }

  function normalize(r) {
    return {
      id: r.id,
      mode: r.mode,
      mediaType: r.media_type,
      url: r.url,
      author: r.author,
      caption: r.caption,
      createdAt: r.created_at,
    };
  }

  /* ---------------- Lokal (localStorage) ---------------- */
  const LS_KEY = "abi_fotos_local";
  function lsRead() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } }
  function lsWrite(a) { localStorage.setItem(LS_KEY, JSON.stringify(a)); }

  function blobToDataUrl(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  async function saveLocal(blob, meta) {
    const url = await blobToDataUrl(blob);
    const entry = {
      id: "loc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      mode: meta.mode,
      mediaType: meta.mediaType,
      url,
      author: meta.author || null,
      caption: meta.caption || null,
      createdAt: new Date().toISOString(),
    };
    const all = lsRead();
    all.unshift(entry);
    // Speicher schonen: max. 60 lokale Medien
    lsWrite(all.slice(0, 60));
    emit(entry);
    return entry;
  }

  async function listLocal() { return lsRead(); }

  /* Sync zwischen Tabs im Lokal-Modus */
  if (!central) {
    window.addEventListener("storage", (e) => {
      if (e.key === LS_KEY && e.newValue) {
        try {
          const now = JSON.parse(e.newValue);
          if (now[0]) emit(now[0]);
        } catch {}
      }
    });
  } else {
    subscribeCentral();
  }

  return {
    isCentral: central,
    save: (blob, meta) => (central ? saveCentral(blob, meta) : saveLocal(blob, meta)),
    list: () => (central ? listCentral() : listLocal()),
    onNew: (cb) => listeners.push(cb),
  };
})();
