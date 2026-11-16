-- 16 Nov 2026 — Wajib ganti kata sandi setelah login dengan sandi sementara + catat email asli + permintaan reset ke Superadmin.
-- Email @247.id belum punya kotak surat, jadi "lupa kata sandi" tidak lewat email.
create table if not exists public.akun_kontak (
  user_id text primary key references public.users(id) on delete cascade,
  email_asli text not null,
  dicatat_at timestamptz not null default now()
);
alter table public.akun_kontak enable row level security;
drop policy if exists akun_kontak_baca on public.akun_kontak;
create policy akun_kontak_baca on public.akun_kontak for select to authenticated
  using (public.app_role() = any (array['superadmin','direktur']) or user_id = public.app_user_id());

create table if not exists public.permintaan_sandi (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  email text not null, nama text, cabang text, role text,
  dibuat_at timestamptz not null default now(),
  status text not null default 'baru' check (status in ('baru','selesai')),
  selesai_at timestamptz, selesai_oleh text
);
create index if not exists permintaan_sandi_status on public.permintaan_sandi (status, dibuat_at desc);
alter table public.permintaan_sandi enable row level security;
drop policy if exists permintaan_sandi_baca on public.permintaan_sandi;
create policy permintaan_sandi_baca on public.permintaan_sandi for select to authenticated using (public.app_role() = 'superadmin');
drop policy if exists permintaan_sandi_ubah on public.permintaan_sandi;
create policy permintaan_sandi_ubah on public.permintaan_sandi for update to authenticated using (public.app_role() = 'superadmin') with check (public.app_role() = 'superadmin');

-- Dipanggil pengguna SETELAH mengganti kata sandinya sendiri: mencatat email asli dan melepas tanda wajib ganti.
create or replace function public.akun_selesai_ganti(p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid text; em text := lower(trim(coalesce(p_email, '')));
begin
  select id into uid from public.users where auth_id = (select auth.uid()) limit 1;
  if uid is null then raise exception 'Akun tidak dikenal'; end if;
  if length(em) > 120 or em !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then raise exception 'Email tidak valid'; end if;
  if em like '%@247.id' then raise exception 'Isi email pribadi yang aktif, bukan email @247.id'; end if;
  insert into public.akun_kontak (user_id, email_asli) values (uid, em)
    on conflict (user_id) do update set email_asli = excluded.email_asli, dicatat_at = now();
  update public.users set doc = (doc - 'wajib_ganti_sandi') || jsonb_build_object('sandi_diganti_at', now()) where id = uid;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.akun_selesai_ganti(text) from public, anon;
grant execute on function public.akun_selesai_ganti(text) to authenticated;
