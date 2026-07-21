# Supabase-Setup (zentrales Abi Buch)

Damit alle Fotos zentral gespeichert werden und live auf allen Geräten im Abi Buch
erscheinen, brauchst du ein kostenloses Supabase-Projekt. Dauert ~5 Minuten.

## 1. Projekt anlegen
1. Gehe auf <https://supabase.com> → **Sign in** → **New project**.
2. Namen vergeben, Datenbank-Passwort setzen, Region wählen (z. B. *Central EU (Frankfurt)*).
3. Warten, bis das Projekt bereit ist.

## 2. Keys eintragen
- **Project Settings → API** öffnen.
- Kopiere **Project URL** und den **anon public** Key.
- Trage beide in `js/config.js` ein:

```js
window.ABI_CONFIG = {
  SUPABASE_URL: "https://DEINPROJEKT.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJI....",
  BUCKET: "abi-fotos",
  TABLE: "fotos",
  SCHULE: "Abitur 2026",
};
```

## 3. Datenbank + Storage einrichten
Öffne im Supabase-Dashboard den **SQL Editor** und führe dieses Skript einmal aus:

```sql
-- Tabelle für alle Medien im Abi Buch
create table if not exists public.fotos (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  mode        text,
  media_type  text,               -- 'photo' | 'strip' | 'video'
  url         text not null,
  author      text,
  caption     text
);

-- Realtime aktivieren (Live-Galerie)
alter publication supabase_realtime add table public.fotos;

-- Row Level Security: öffentliches Lesen + Einfügen (Gäste-Fotobox)
alter table public.fotos enable row level security;

create policy "Abi Buch lesen"   on public.fotos for select using (true);
create policy "Abi Buch posten"  on public.fotos for insert with check (true);

-- Öffentlicher Storage-Bucket für die Bild-/Videodateien
insert into storage.buckets (id, name, public)
values ('abi-fotos', 'abi-fotos', true)
on conflict (id) do nothing;

-- Storage-Policies: öffentlich lesen + hochladen
create policy "abi upload" on storage.objects for insert
  with check (bucket_id = 'abi-fotos');
create policy "abi read"   on storage.objects for select
  using (bucket_id = 'abi-fotos');
```

## 4. Fertig
Öffne die App neu. Unten im Startmenü verschwindet der Hinweis „Lokal-Modus".
Im Abi Buch steht jetzt **„Live · zentral gespeichert"**. Neue Fotos erscheinen
automatisch auf allen geöffneten Geräten.

---

### Hinweise zur Sicherheit
Die obigen Policies erlauben **jedem mit dem Link** das Posten — genau richtig für
eine offene Gäste-Fotobox auf der Abifeier. Wenn du Missbrauch verhindern willst,
kannst du den Link erst zur Feier teilen oder später die Insert-Policy einschränken.
Der `anon`-Key ist **nicht geheim** — er ist für den Browser gedacht.
