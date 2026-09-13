-- Skema ini DIBUAT OTOMATIS oleh aplikasi saat pertama kali menyimpan data
-- (lihat lib/db.js -> ensureSchema). File ini hanya referensi kalau kamu
-- ingin menjalankannya manual lewat Neon SQL Editor.

CREATE TABLE IF NOT EXISTS noir_works_items (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,             -- 'prompt' (Prompt Generator) atau 'metadata' (Metadata Generator)
  title TEXT NOT NULL DEFAULT '',
  model TEXT,                     -- model Claude yang dipakai saat generate
  data JSONB NOT NULL,            -- payload lengkap (title, prompt, keywords, dll)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS noir_works_items_kind_created_idx
ON noir_works_items (kind, created_at DESC);
