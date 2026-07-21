/* =========================================================================
   ABI FOTOBOX — Konfiguration
   -------------------------------------------------------------------------
   Trage hier deine Supabase-Daten ein, damit alle Fotos zentral gespeichert
   und live im "Abi Buch" auf allen Geräten erscheinen.

   1. Erstelle ein kostenloses Projekt auf https://supabase.com
   2. Projekt-Einstellungen → API → kopiere "Project URL" und "anon public" Key
   3. Füge beide unten ein.
   4. Führe das SQL aus SUPABASE_SETUP.md aus (Tabelle + Storage Bucket).

   Solange die Felder leer sind, läuft die App im LOKAL-MODUS (nur dieses
   Gerät, über localStorage). Sobald die Keys eingetragen sind, wird alles
   zentral gespeichert und live synchronisiert.
   ========================================================================= */
window.ABI_CONFIG = {
  SUPABASE_URL: "",       // z.B. "https://xxxxxxxx.supabase.co"
  SUPABASE_ANON_KEY: "",  // z.B. "eyJhbGci..."

  BUCKET: "abi-fotos",    // Name des Storage-Buckets (siehe SUPABASE_SETUP.md)
  TABLE: "fotos",         // Name der Datenbank-Tabelle

  SCHULE: "Abitur 2026",  // Wird auf den Fotostreifen gedruckt
};
