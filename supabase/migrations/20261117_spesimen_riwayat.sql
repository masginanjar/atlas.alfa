-- Riwayat file Word dari Alat → Pemisah Spesimen. Tertutup: RLS aktif TANPA policy → hanya fungsi server `spesimen-riwayat` (service role) yang bisa membaca/menulis.
create table if not exists public.spesimen_riwayat (
  id uuid primary key default gen_random_uuid(),
  dibuat_at timestamptz not null default now(),
  user_id text not null,
  user_nama text,
  branch text,
  nama_file text not null,
  pejabat jsonb not null default '[]'::jsonb,
  ukuran integer not null default 0,
  berkas text not null
);
create index if not exists spesimen_riwayat_user_idx on public.spesimen_riwayat (user_id, dibuat_at desc);
alter table public.spesimen_riwayat enable row level security;
revoke all on public.spesimen_riwayat from anon, authenticated;
