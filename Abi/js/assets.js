/* =========================================================================
   ABI FOTOBOX — Effekt-Bibliothek
   30 Filter · Sticker · Masken · Hintergrund-Rahmen (alle Abi-Themed)
   Alles rein clientseitig, keine externen Bilder nötig.
   ========================================================================= */

/* ---------- 30 FILTER (CSS filter Strings, live + auf Canvas anwendbar) --- */
window.ABI_FILTERS = [
  { id: "original",   name: "Original",       css: "none" },
  { id: "sw",         name: "Schwarz-Weiß",   css: "grayscale(1) contrast(1.05)" },
  { id: "diplom",     name: "Diplom Sepia",   css: "sepia(0.85) contrast(1.1) brightness(1.02)" },
  { id: "gold",       name: "Gold",           css: "sepia(0.5) saturate(1.7) hue-rotate(-12deg) brightness(1.06)" },
  { id: "vintage",    name: "Vintage Abi",    css: "sepia(0.4) contrast(1.2) brightness(0.95) saturate(0.85)" },
  { id: "kuehl",      name: "Kühl",           css: "saturate(1.15) contrast(1.05) hue-rotate(-8deg) brightness(1.03)" },
  { id: "warm",       name: "Warm",           css: "saturate(1.25) sepia(0.15) brightness(1.05)" },
  { id: "hell",       name: "Strahlend",      css: "brightness(1.18) contrast(0.95) saturate(1.1)" },
  { id: "drama",      name: "Dramatisch",     css: "contrast(1.45) brightness(0.92) saturate(1.2)" },
  { id: "pastell",    name: "Pastell",        css: "saturate(0.75) brightness(1.12) contrast(0.9)" },
  { id: "pop",        name: "Pop Farben",     css: "saturate(1.9) contrast(1.15)" },
  { id: "noir",       name: "Film Noir",      css: "grayscale(1) contrast(1.6) brightness(0.9)" },
  { id: "sonne",      name: "Sonnenschein",   css: "sepia(0.3) saturate(1.5) hue-rotate(-15deg) brightness(1.12)" },
  { id: "mint",       name: "Mint",           css: "saturate(1.2) hue-rotate(25deg) brightness(1.05)" },
  { id: "purpur",     name: "Purpur",         css: "saturate(1.3) hue-rotate(-40deg) contrast(1.1)" },
  { id: "cyber",      name: "Cyber",          css: "saturate(1.6) hue-rotate(180deg) contrast(1.15)" },
  { id: "traum",      name: "Traum",          css: "blur(0.6px) brightness(1.15) saturate(1.25) contrast(0.95)" },
  { id: "matt",       name: "Matt",           css: "contrast(0.85) brightness(1.05) saturate(0.9)" },
  { id: "kontrast",   name: "Hochkontrast",   css: "contrast(1.7) brightness(1.02)" },
  { id: "kreide",     name: "Kreide",         css: "grayscale(0.6) brightness(1.2) contrast(0.85)" },
  { id: "abendrot",   name: "Abendrot",       css: "sepia(0.45) saturate(1.8) hue-rotate(-25deg) brightness(0.98)" },
  { id: "polar",      name: "Polar",          css: "saturate(0.6) brightness(1.15) hue-rotate(10deg) contrast(1.1)" },
  { id: "honig",      name: "Honig",          css: "sepia(0.6) saturate(1.4) brightness(1.08)" },
  { id: "invert",     name: "Negativ",        css: "invert(1) hue-rotate(180deg)" },
  { id: "tiefblau",   name: "Tiefblau",       css: "saturate(1.3) hue-rotate(15deg) brightness(0.95) contrast(1.2)" },
  { id: "rose",       name: "Rosé",           css: "sepia(0.25) saturate(1.5) hue-rotate(-30deg) brightness(1.08)" },
  { id: "smaragd",    name: "Smaragd",        css: "saturate(1.5) hue-rotate(60deg) contrast(1.1)" },
  { id: "glanz",      name: "Glanz",          css: "brightness(1.1) contrast(1.25) saturate(1.35)" },
  { id: "nebel",      name: "Nebel",          css: "brightness(1.1) contrast(0.8) saturate(0.85) blur(0.4px)" },
  { id: "festlich",   name: "Festlich",       css: "sepia(0.35) saturate(1.7) hue-rotate(-10deg) contrast(1.15) brightness(1.05)" },
];

/* ---------- STICKER (Emoji + Text) — frei platzierbar ------------------- */
/* type: "emoji" wird via fillText gezeichnet, "text" ist ein Text-Badge.  */
window.ABI_STICKERS = [
  { id: "cap",     type: "emoji", char: "🎓", name: "Doktorhut" },
  { id: "scroll",  type: "emoji", char: "📜", name: "Urkunde" },
  { id: "party",   type: "emoji", char: "🎉", name: "Party" },
  { id: "confetti",type: "emoji", char: "🎊", name: "Konfetti" },
  { id: "star",    type: "emoji", char: "⭐", name: "Stern" },
  { id: "sparkle", type: "emoji", char: "✨", name: "Glitzer" },
  { id: "trophy",  type: "emoji", char: "🏆", name: "Pokal" },
  { id: "crown",   type: "emoji", char: "👑", name: "Krone" },
  { id: "champ",   type: "emoji", char: "🍾", name: "Sekt" },
  { id: "cheers",  type: "emoji", char: "🥂", name: "Anstoßen" },
  { id: "fire",    type: "emoji", char: "🔥", name: "Feuer" },
  { id: "cool",    type: "emoji", char: "😎", name: "Cool" },
  { id: "party2",  type: "emoji", char: "🥳", name: "Feiern" },
  { id: "heart",   type: "emoji", char: "❤️", name: "Herz" },
  { id: "hundred", type: "emoji", char: "💯", name: "100" },
  { id: "grad_m",  type: "emoji", char: "🧑‍🎓", name: "Absolvent" },
  { id: "grad_f",  type: "emoji", char: "👩‍🎓", name: "Absolventin" },
  { id: "balloon", type: "emoji", char: "🎈", name: "Ballon" },
  { id: "camera",  type: "emoji", char: "📸", name: "Foto" },
  { id: "hands",   type: "emoji", char: "🙌", name: "Jubel" },
  { id: "t_abi",   type: "text",  char: "ABI 2026", name: "Abi 2026" },
  { id: "t_done",  type: "text",  char: "GESCHAFFT!", name: "Geschafft!" },
  { id: "t_finally",type: "text", char: "ENDLICH!", name: "Endlich!" },
  { id: "t_best",  type: "text",  char: "BESTE STUFE", name: "Beste Stufe" },
];

/* ---------- MASKEN (Emoji, größer, zum aufs-Gesicht-legen) -------------- */
window.ABI_MASKS = [
  { id: "m_cap",     type: "emoji", char: "🎓", name: "Hut" },
  { id: "m_glasses", type: "emoji", char: "🕶️", name: "Sonnenbrille" },
  { id: "m_nerd",    type: "emoji", char: "🤓", name: "Nerd-Brille" },
  { id: "m_star",    type: "emoji", char: "🤩", name: "Sterne-Augen" },
  { id: "m_party",   type: "emoji", char: "🥳", name: "Party-Gesicht" },
  { id: "m_crown",   type: "emoji", char: "👑", name: "Krone" },
];

/* ---------- HINTERGRUND-RAHMEN (SVG, über das Foto gelegt) --------------- */
/* Jede Funktion liefert einen SVG-String für die Zielgröße (w × h).       */
function _frameGold(w, h) {
  const b = Math.round(Math.min(w, h) * 0.04);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="${b/2}" y="${b/2}" width="${w-b}" height="${h-b}" fill="none"
      stroke="#d4af37" stroke-width="${b}"/>
    <rect x="${b*1.6}" y="${b*1.6}" width="${w-b*3.2}" height="${h-b*3.2}" fill="none"
      stroke="#d4af37" stroke-width="${Math.max(2,b*0.15)}"/>
  </svg>`;
}
function _frameBanner(w, h, txt) {
  const fs = Math.round(w * 0.07);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="0" y="${h - fs*1.8}" width="${w}" height="${fs*1.8}" fill="#0b1f3a" opacity="0.82"/>
    <text x="${w/2}" y="${h - fs*0.55}" font-family="Georgia, serif" font-weight="bold"
      font-size="${fs}" fill="#d4af37" text-anchor="middle">${txt}</text>
  </svg>`;
}
function _frameConfetti(w, h) {
  const cols = ["#d4af37","#ffffff","#4a90d9","#e05a5a","#5ac07a","#c05ac0"];
  let dots = "";
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.28;
    const r = 3 + Math.random() * 6;
    const c = cols[i % cols.length];
    dots += `<rect x="${x}" y="${y}" width="${r*1.6}" height="${r*0.9}" rx="1"
      fill="${c}" transform="rotate(${Math.random()*90-45} ${x} ${y})"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${dots}</svg>`;
}
function _frameLaurel(w, h) {
  const cx = w/2, cy = h*0.9, fs = Math.round(w*0.16);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <text x="${cx}" y="${cy}" font-size="${fs}" text-anchor="middle">🎓</text>
    <text x="${cx - fs*1.4}" y="${cy}" font-size="${fs}" text-anchor="middle">🌿</text>
    <text x="${cx + fs*1.4}" y="${cy}" font-size="${fs}" text-anchor="middle" transform="scale(-1,1)" transform-origin="${cx + fs*1.4} ${cy}">🌿</text>
  </svg>`;
}

window.ABI_BACKGROUNDS = [
  { id: "none",     name: "Kein Rahmen", svg: null },
  { id: "gold",     name: "Goldrahmen",  svg: _frameGold },
  { id: "grats",    name: "Glückwunsch", svg: (w,h)=>_frameBanner(w,h,"Herzlichen Glückwunsch!") },
  { id: "abi2026",  name: "ABI 2026",    svg: (w,h)=>_frameBanner(w,h,"ABI 2026") },
  { id: "confetti", name: "Konfetti",    svg: _frameConfetti },
  { id: "laurel",   name: "Lorbeer",     svg: _frameLaurel },
  { id: "done",     name: "Geschafft",   svg: (w,h)=>_frameBanner(w,h,"Endlich geschafft 🎓") },
];

/* SVG-String → HTMLImage-Ladbare data-URL */
window.svgToDataUrl = function (svg) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
};
