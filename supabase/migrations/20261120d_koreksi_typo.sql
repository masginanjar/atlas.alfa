-- 20 Nov 2026 — Koreksi Typo Otomatis (hasil terjemahan).
-- 1) Catatan tiap pemeriksaan (tanpa isi dokumen & tanpa nama file): untuk mencegah pemeriksaan ulang file identik,
--    memantau biaya, dan laporan seberapa sering tiap penerjemah typo. Hanya server (service role) yang membaca/menulis.
create table if not exists public.typo_cek (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  bulan text not null,
  project_id text not null,
  sub_id text not null,
  user_id text not null,
  branch text,
  hash text not null,
  ekstensi text,
  bahasa text,
  n_kata integer not null default 0,
  temuan jsonb not null default '[]'::jsonb,
  n_temuan integer not null default 0,
  n_yakin integer not null default 0,
  n_dipakai integer not null default 0,
  sebagian boolean not null default false,
  model text,
  token_masuk integer not null default 0,
  token_keluar integer not null default 0,
  biaya_usd numeric not null default 0,
  status text not null default 'ada',
  dipakai_at timestamptz
);
create index if not exists typo_cek_kunci on public.typo_cek (project_id, sub_id, hash);
create index if not exists typo_cek_user on public.typo_cek (user_id, bulan);
alter table public.typo_cek enable row level security;
revoke all on public.typo_cek from anon, authenticated;

-- 2) Toggle per akun `koreksi_typo` ikut dijaga: hanya Super Admin / pemegang izin pengaturan.pengguna.ubah yang boleh mengubahnya
--    (pengguna tidak bisa menyalakan sendiri lewat pembaruan profilnya).
create or replace function public.users_kunci_jaga()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare kunci text[] := array['role','base_role','extra_roles','branch','branches','act_as','active','coordinator_lang','otorisator_level','email','persona','koordinator','apostille_akses','koreksi_typo'];
  k text; berubah boolean := false; saku public.users;
begin
  if auth.uid() is null then return new; end if; -- server / migrasi
  saku := public.app_user();
  if tg_op = 'INSERT' then
    if coalesce(saku.role,'') <> 'superadmin' and not public.app_izin('pengaturan.pengguna.tambah') then raise exception 'Tidak berwenang menambah pengguna'; end if;
    if new.doc->>'role' = 'superadmin' and coalesce(saku.role,'') <> 'superadmin' then raise exception 'Hanya Super Admin yang dapat membuat akun Super Admin'; end if;
    return new;
  end if;
  foreach k in array kunci loop
    if (new.doc->k) is distinct from (old.doc->k) then berubah := true; end if;
  end loop;
  if new.auth_id is distinct from old.auth_id and old.auth_id is not null then berubah := true; end if;
  if berubah and coalesce(saku.role,'') <> 'superadmin' and not public.app_izin('pengaturan.pengguna.ubah') then
    raise exception 'Tidak berwenang mengubah data akses pengguna (role, cabang, status, persona)';
  end if;
  if berubah and (old.doc->>'role') = 'superadmin' and coalesce(saku.role,'') <> 'superadmin' then raise exception 'Hanya Super Admin yang dapat mengubah akun Super Admin'; end if;
  return new;
end $function$;
