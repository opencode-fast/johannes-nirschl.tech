# 🎓 Abi Fotobox

Eine kinderleichte Web-Fotobox für die Abifeier. Gäste machen Fotos & Videos mit
Abi-Effekten, alles landet zentral im **Abi Buch**, das während der Feier live von
allen angeschaut werden kann.

Minimalistisches **Schwarz-Weiß-Design**.

## Funktionen
- **Startmenü** mit zwei großen Kacheln:
  - **Fotostreifen** – 4 Fotos hintereinander mit Countdown → klassischer
    **Filmstreifen** (schwarzer Filmkörper, Perforationslöcher an beiden Seiten).
  - **Freier Modus** – Einzelfoto **oder** Video.
- **30 Filter** (alle Abi-Themed) + **Sticker**, **3D-Masken** und **Rahmen**:
  - **3D-Masken mit Kopf-Tracking** – ein Doktorhut (o.ä.), der dem Kopf folgt,
    als würde man ihn wirklich tragen (MediaPipe Face Tracking + Three.js,
    prozedurale Modelle, keine externen Dateien).
  - Sticker frei ziehen, mit zwei Fingern skalieren & drehen.
  - Filter/3D-Maske/Sticker/Rahmen werden fest ins Foto **und** ins Video eingebrannt.
- **Abi Buch** – zentrale Galerie, die sich **live** aktualisiert (neue Fotos ploppen
  sofort auf allen Geräten auf). Antippen für Großansicht + Download.
- **Kein Build-Schritt** – reines HTML/CSS/JS. Läuft von jedem Static-Host.

### 3D-Masken – Voraussetzungen & Feinjustage
- Brauchen **WebGL** und beim ersten Antippen **Internet** (Modell + Bibliotheken
  werden per CDN geladen). Fehlt beides, fällt die App automatisch auf einfache
  Emoji-Masken zurück – die App bleibt voll nutzbar.
- Die volle Kopf-Drehung (Neigen/Drehen/Kippen) kommt direkt aus der
  Gesichts-Geometrie — kein manuelles Kalibrieren nötig.
- Die **Größe folgt automatisch der Kopfgröße** (näher/größer = größere Maske).
- **Tiefe/Verdeckung:** ein unsichtbarer Kopf-Occluder verdeckt die Teile der
  Maske, die hinter dem Kopf liegen — der Hut wirkt getragen, nicht davor.
- Live nachjustierbar (Standardwerte in `js/headtrack.js` → `TUNE`):
  `HeadTrack.tune({ lift: 1.1, scale: 0.95, occScale: 1.1, occBack: 0.05 })`
  - `lift` = Höhe über dem Kopf, `scale` = Größe, `smooth` = Ruhe/Trägheit
  - `occScale` = Größe der Verdeckungs-Hülle (größer = mehr wird hinterm Kopf
    versteckt), `occBack` = Hülle nach hinten schieben, falls die Front der
    Maske fälschlich abgeschnitten wird.

## Schnellstart (lokal testen)
Weil die App die Kamera nutzt, braucht sie `https` **oder** `localhost`:

```bash
cd Abi
python3 -m http.server 8000
# Browser: http://localhost:8000
```

Ohne Supabase-Keys läuft alles im **Lokal-Modus** (Fotos nur auf diesem Gerät) –
ideal zum Ausprobieren. Für das echte, geräteübergreifende Abi Buch siehe unten.

## Zentrales Abi Buch aktivieren
Trage deine Supabase-Daten in `js/config.js` ein – Schritt-für-Schritt in
[`SUPABASE_SETUP.md`](SUPABASE_SETUP.md). Danach werden alle Fotos zentral
gespeichert und live synchronisiert.

## Veröffentlichen
Lade den Ordner auf einen beliebigen Static-Host (Netlify, Vercel, GitHub Pages,
Cloudflare Pages …) und teile den Link + QR-Code auf der Feier.

## Projektstruktur
```
index.html            App-Shell & alle Screens
css/styles.css        Schwarz-Weiß-Design (minimalistisch)
js/config.js          Supabase-Keys + Schulname  ← hier eintragen
js/assets.js          30 Filter, Sticker, Emoji-Masken (Fallback), Rahmen
js/storage.js         Speicher-Schicht (Supabase ↔ localStorage-Fallback)
js/camera.js          Kamera + Effekt-Compositing (Foto/Filmstreifen/Video)
js/headtrack.js       3D-Masken mit Kopf-Tracking (MediaPipe + Three.js)
js/gallery.js         Abi Buch (Live-Galerie + Lightbox)
js/app.js             Ablauf-Steuerung & UI-Verdrahtung
SUPABASE_SETUP.md     Backend in 5 Minuten
```

## Browser-Hinweise
- Am besten auf modernem Safari (iOS) / Chrome (Android). Kamerazugriff muss erlaubt
  werden. Video-Aufnahme nutzt `MediaRecorder` (WebM).
