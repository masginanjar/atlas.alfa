-- 20 Nov 2026 — Marketing → Website: ide konten & status posting blog (tabel baru, tidak menyentuh data lain).
create table if not exists public.marketing_konten (
  id text primary key default (gen_random_uuid())::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  doc jsonb not null default '{}'::jsonb
);
alter table public.marketing_konten enable row level security;
revoke all on public.marketing_konten from anon;
grant select, insert, update, delete on public.marketing_konten to authenticated;
-- Akses lewat mesin izin (Role & Hak Akses), bukan nama role.
create policy mk_select on public.marketing_konten for select to authenticated using ((select app_izin('marketing-website.lihat')));
create policy mk_insert on public.marketing_konten for insert to authenticated with check ((select app_izin('marketing-website.tambah')));
create policy mk_update on public.marketing_konten for update to authenticated using ((select app_izin('marketing-website.ubah'))) with check ((select app_izin('marketing-website.ubah')));
create policy mk_delete on public.marketing_konten for delete to authenticated using ((select app_izin('marketing-website.hapus')));
-- + trigger updated_at (sama dengan tabel lain), masuk publikasi realtime, dan 'marketing_konten' ditambahkan ke daftar tabel app_patch.
