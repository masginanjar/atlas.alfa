-- ===== ROLE & HAK AKSES — tahap 1 (tambahan; kebijakan tabel lain tidak diubah) =====
-- SUDAH dijalankan di live 15 Nov 2026 (diuji: 15 skenario lolos, transaksi uji di-rollback).
-- Belum: isi role bawaan ke akses_role (node scripts/seed-akses.mjs) — dilakukan saat RLS modul mulai memakai app_izin (tahap 2).
create table if not exists public.akses_role (id text primary key default gen_random_uuid()::text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), doc jsonb not null default '{}'::jsonb);
create table if not exists public.akses_pengecualian (id text primary key default gen_random_uuid()::text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), doc jsonb not null default '{}'::jsonb);
create table if not exists public.akses_audit (id text primary key default gen_random_uuid()::text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), doc jsonb not null default '{}'::jsonb);
create unique index if not exists akses_role_kode_uq on public.akses_role ((doc->>'kode'));
create index if not exists akses_peng_user_idx on public.akses_pengecualian ((doc->>'user_id'));
create index if not exists akses_audit_at_idx on public.akses_audit (created_at desc);
alter table public.akses_role enable row level security;
alter table public.akses_pengecualian enable row level security;
alter table public.akses_audit enable row level security;
create trigger akses_role_touch before update on public.akses_role for each row execute function touch_updated_at();
create trigger akses_peng_touch before update on public.akses_pengecualian for each row execute function touch_updated_at();

-- Pemeriksaan izin terpusat (default deny)
create or replace function public.app_izin(kode text) returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare u public.users; r jsonb; fitur text; aksi text;
begin
  u := public.app_user();
  if u.id is null then return false; end if;
  if exists (select 1 from public.akses_pengecualian p where p.doc->>'user_id' = u.id and p.doc->>'kode' = kode and coalesce((p.doc->>'dicabut')::boolean,false) = false
             and p.doc->>'nilai' = 'larang' and (coalesce(p.doc->>'sampai','') = '' or (p.doc->>'sampai')::timestamptz > now())) then return false; end if;
  if u.role = 'superadmin' then return true; end if;
  select doc into r from public.akses_role where doc->>'kode' = u.role and coalesce((doc->>'dihapus')::boolean,false) = false limit 1;
  if r is null or coalesce((r->>'aktif')::boolean, true) = false then return false; end if;
  if exists (select 1 from public.akses_pengecualian p where p.doc->>'user_id' = u.id and p.doc->>'kode' = kode and coalesce((p.doc->>'dicabut')::boolean,false) = false
             and p.doc->>'nilai' = 'izinkan' and (coalesce(p.doc->>'sampai','') = '' or (p.doc->>'sampai')::timestamptz > now())) then return true; end if;
  if coalesce((r->'izin'->kode->>'aktif')::boolean, false) = false then return false; end if;
  fitur := regexp_replace(kode, '\.[^.]+$', ''); aksi := regexp_replace(kode, '^.*\.', '');
  if aksi not in ('menu','lihat') and coalesce((r->'izin'->(fitur || '.lihat')->>'aktif')::boolean,false) = false and (r->'izin') ? (fitur || '.menu') then return false; end if;
  return true;
end $$;
create or replace function public.app_cakupan(kode text) returns text language sql stable security definer set search_path to 'public' as $$
  select case when (public.app_user()).role = 'superadmin' then 'semua'
    else coalesce((select p.doc->>'cakupan' from public.akses_pengecualian p where p.doc->>'user_id' = (public.app_user()).id and p.doc->>'kode' = kode and p.doc->>'nilai' = 'izinkan' and coalesce((p.doc->>'dicabut')::boolean,false) = false and (coalesce(p.doc->>'sampai','') = '' or (p.doc->>'sampai')::timestamptz > now()) limit 1),
                  (select doc->'izin'->kode->>'cakupan' from public.akses_role where doc->>'kode' = (public.app_user()).role limit 1), 'sendiri') end $$;
revoke execute on function public.app_izin(text) from anon;
revoke execute on function public.app_cakupan(text) from anon;

-- Audit: hanya ditulis trigger (SECURITY DEFINER); tidak ada kebijakan insert/update/delete untuk pengguna
create or replace function public.akses_catat(jenis text, aksi text, target text, target_nama text, sebelum jsonb, sesudah jsonb) returns void language plpgsql security definer set search_path to 'public' as $$
declare u public.users;
begin
  u := public.app_user();
  insert into public.akses_audit(doc) values (jsonb_build_object('at', now(), 'jenis', jenis, 'aksi', aksi, 'target', target, 'target_nama', target_nama,
    'oleh', coalesce(u.doc->>'name', case when auth.uid() is null then 'Sistem' else 'tidak dikenal' end), 'oleh_id', u.id, 'sebelum', sebelum, 'sesudah', sesudah));
end $$;
revoke execute on function public.akses_catat(text,text,text,text,jsonb,jsonb) from anon, authenticated;

create or replace function public.akses_role_jaga() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare k text; inti text[] := array['pengaturan.role.lihat','pengaturan.role.kelola','pengaturan.role.riwayat','pengguna.role.kelola'];
  aku text := (public.app_user()).role;
begin
  if auth.uid() is null then return new; end if;
  if new.doc->>'kode' = 'superadmin' then raise exception 'Role Super Admin adalah role sistem dan tidak dapat diubah'; end if;
  if tg_op = 'UPDATE' and new.doc->>'kode' is distinct from old.doc->>'kode' then raise exception 'Kode role tidak dapat diubah'; end if;
  if aku <> 'superadmin' then
    if new.doc->>'kode' = aku then raise exception 'Tidak dapat mengubah role yang sedang Anda pakai'; end if;
    for k in select key from jsonb_each(coalesce(new.doc->'izin','{}'::jsonb)) where coalesce((value->>'aktif')::boolean,false) loop
      if tg_op = 'INSERT' or coalesce((old.doc->'izin'->k->>'aktif')::boolean,false) = false then
        if k = any(inti) or not public.app_izin(k) then raise exception 'Tidak dapat memberikan izin yang tidak Anda miliki: %', k; end if;
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger akses_role_jaga before insert or update on public.akses_role for each row execute function public.akses_role_jaga();

create or replace function public.akses_role_audit() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.akses_catat('role', case when tg_op = 'INSERT' then 'buat' when coalesce((new.doc->>'dihapus')::boolean,false) then 'hapus'
      when (old.doc->>'aktif') is distinct from (new.doc->>'aktif') then case when coalesce((new.doc->>'aktif')::boolean,true) then 'aktifkan' else 'nonaktifkan' end else 'ubah_izin' end,
    new.doc->>'kode', new.doc->>'nama', case when tg_op = 'UPDATE' then old.doc end, new.doc);
  return null;
end $$;
create trigger akses_role_audit after insert or update on public.akses_role for each row execute function public.akses_role_audit();

create or replace function public.akses_peng_audit() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.akses_catat('pengecualian', case when tg_op = 'INSERT' then 'tambah' when coalesce((new.doc->>'dicabut')::boolean,false) then 'cabut' else 'ubah' end,
    new.doc->>'user_id', (select doc->>'name' from public.users where id = new.doc->>'user_id'), case when tg_op = 'UPDATE' then old.doc end, new.doc);
  return null;
end $$;
create trigger akses_peng_audit after insert or update on public.akses_pengecualian for each row execute function public.akses_peng_audit();

-- Penjaga role pengguna (kolom users.role = generated dari doc → baca doc di BEFORE trigger)
create or replace function public.users_role_jaga() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare saku public.users := public.app_user();
begin
  if (new.doc->>'role') is not distinct from (old.doc->>'role') and coalesce((new.doc->>'active')::boolean,true) = coalesce((old.doc->>'active')::boolean,true)
     and (new.doc->'extra_roles') is not distinct from (old.doc->'extra_roles') then return new; end if;
  if (old.doc->>'role') = 'superadmin' and coalesce((old.doc->>'active')::boolean,true)
     and ((new.doc->>'role') is distinct from 'superadmin' or coalesce((new.doc->>'active')::boolean,true) = false)
     and (select count(*) from public.users where role = 'superadmin' and active and id <> old.id) = 0 then
    raise exception 'Super Admin aktif terakhir tidak dapat dicabut atau dinonaktifkan';
  end if;
  if auth.uid() is not null and ((new.doc->>'role') is distinct from (old.doc->>'role') or (new.doc->'extra_roles') is distinct from (old.doc->'extra_roles')) then
    if exists (select 1 from public.users where id = old.id and auth_id = auth.uid()) then raise exception 'Tidak dapat mengubah role sendiri'; end if;
    if saku.role <> 'superadmin' and not public.app_izin('pengguna.role.kelola') then raise exception 'Tidak berwenang menetapkan role'; end if;
    if (new.doc->>'role') = 'superadmin' and saku.role <> 'superadmin' then raise exception 'Hanya Super Admin yang dapat menetapkan role Super Admin'; end if;
  end if;
  if (new.doc->>'role') is distinct from (old.doc->>'role') or (new.doc->'extra_roles') is distinct from (old.doc->'extra_roles') then
    perform public.akses_catat('pengguna', 'tetapkan_role', old.id, new.doc->>'name', jsonb_build_object('role', old.doc->>'role', 'extra_roles', old.doc->'extra_roles'), jsonb_build_object('role', new.doc->>'role', 'extra_roles', new.doc->'extra_roles'));
  end if;
  return new;
end $$;
create trigger users_role_jaga before update on public.users for each row execute function public.users_role_jaga();

-- RLS
create policy akses_role_baca on public.akses_role for select to authenticated using ((public.app_user()).id is not null);
create policy akses_role_tulis on public.akses_role for insert to authenticated with check (public.app_izin('pengaturan.role.kelola'));
create policy akses_role_ubah on public.akses_role for update to authenticated using (public.app_izin('pengaturan.role.kelola')) with check (public.app_izin('pengaturan.role.kelola'));
create policy akses_peng_baca on public.akses_pengecualian for select to authenticated using (doc->>'user_id' = (public.app_user()).id or public.app_izin('pengaturan.role.lihat'));
create policy akses_peng_tulis on public.akses_pengecualian for insert to authenticated with check (public.app_izin('pengaturan.role.kelola') and doc->>'user_id' <> (public.app_user()).id);
create policy akses_peng_ubah on public.akses_pengecualian for update to authenticated using (public.app_izin('pengaturan.role.kelola') and doc->>'user_id' <> (public.app_user()).id) with check (public.app_izin('pengaturan.role.kelola') and doc->>'user_id' <> (public.app_user()).id);
create policy akses_audit_baca on public.akses_audit for select to authenticated using (public.app_izin('pengaturan.role.riwayat'));
-- + app_patch: tambahkan 'akses_role','akses_pengecualian' ke daftar tabel; realtime publication: akses_role, akses_pengecualian.

-- Fungsi trigger & audit tidak bisa dipanggil langsung lewat API:
revoke execute on function public.akses_catat(text,text,text,text,jsonb,jsonb) from public, anon, authenticated;
revoke execute on function public.akses_role_jaga() from public, anon, authenticated;
revoke execute on function public.akses_role_audit() from public, anon, authenticated;
revoke execute on function public.akses_peng_audit() from public, anon, authenticated;
revoke execute on function public.users_role_jaga() from public, anon, authenticated;
revoke execute on function public.app_izin(text) from public, anon; grant execute on function public.app_izin(text) to authenticated;
revoke execute on function public.app_cakupan(text) from public, anon; grant execute on function public.app_cakupan(text) to authenticated;
