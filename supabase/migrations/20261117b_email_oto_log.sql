-- Log pengiriman Email Otorisasi (metadata saja). Tertutup: RLS aktif TANPA policy → hanya fungsi server `email-otorisasi`.
create table if not exists public.email_oto_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id text not null,
  aksi text not null,
  project_id text,
  oto_id text,
  tes boolean,
  lampiran integer,
  ukuran integer,
  hasil text
);
create index if not exists email_oto_log_user_idx on public.email_oto_log (user_id, at desc);
alter table public.email_oto_log enable row level security;
revoke all on public.email_oto_log from anon, authenticated;
