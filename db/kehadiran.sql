-- ============================================================
-- 15 Nov 2026 — Login harian = absen hadir.
-- Satu baris per orang per hari (tanggal WITA). Hanya bisa ditulis lewat app_absen()
-- (tidak ada policy insert/update/delete langsung). Rekap: izin kehadiran.lihat.
-- ============================================================
create table if not exists public.kehadiran (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  doc jsonb not null default '{}'::jsonb,
  user_id text generated always as (doc->>'user_id') stored,
  tanggal text generated always as (doc->>'tanggal') stored,
  branch text generated always as (doc->>'branch') stored
);
create index if not exists kehadiran_tanggal on public.kehadiran (tanggal);
create index if not exists kehadiran_user on public.kehadiran (user_id);
alter table public.kehadiran enable row level security;
create policy kehadiran_baca on public.kehadiran for select to authenticated using (
  user_id = (select app_user_id())
  or ((select app_izin('kehadiran.lihat')) and (select app_cabang_izin('kehadiran.lihat')) && array['*', branch]));

create or replace function public.app_absen(p_perangkat text default '') returns jsonb
language plpgsql security definer set search_path = public as $f$
declare u public.users; tgl text := to_char(now() at time zone 'Asia/Makassar', 'YYYY-MM-DD');
        kini text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); out jsonb;
begin
  -- orang yang benar-benar login (bukan persona/act-as)
  select * into u from public.users where auth_id = auth.uid() and active limit 1;
  if u.id is null then raise exception 'Akun tidak aktif'; end if;
  insert into public.kehadiran (id, doc) values (u.id || ':' || tgl, jsonb_build_object(
      'user_id', u.id, 'name', u.doc->>'name', 'role', u.role, 'branch', u.branch, 'tanggal', tgl,
      'masuk_at', kini, 'terakhir_at', kini, 'login_ke', 1, 'perangkat', left(coalesce(p_perangkat, ''), 80)))
  on conflict (id) do update set updated_at = now(),
      doc = public.kehadiran.doc || jsonb_build_object('terakhir_at', kini, 'login_ke', coalesce((public.kehadiran.doc->>'login_ke')::int, 1) + 1)
  returning jsonb_build_object('id', id, 'created_at', created_at, 'updated_at', updated_at) || doc into out;
  return out;
end $f$;
revoke execute on function public.app_absen(text) from public, anon;
grant execute on function public.app_absen(text) to authenticated;

-- Izin rekap: Superadmin (otomatis) & Direktur, semua cabang
update public.akses_role set doc = jsonb_set(jsonb_set(jsonb_set(doc,
    '{izin,kehadiran.menu}', '{"aktif":true}'), '{izin,kehadiran.lihat}', '{"aktif":true,"cakupan":"semua"}'), '{izin,kehadiran.ekspor}', '{"aktif":true,"cakupan":"semua"}')
 where doc->>'kode' = 'direktur' and doc->'izin' is not null and not (doc->'izin' ? 'kehadiran.lihat');

-- Riwayat dari catatan login yang sudah ada (log aktivitas)
insert into public.kehadiran (id, doc)
select x.by_id || ':' || x.tgl, jsonb_build_object('user_id', x.by_id, 'name', u.doc->>'name', 'role', u.role, 'branch', u.branch, 'tanggal', x.tgl,
       'masuk_at', to_char(x.masuk at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'terakhir_at', to_char(x.akhir at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       'login_ke', x.n, 'perangkat', '', 'sumber', 'log aktivitas')
from (select doc->>'by_id' by_id, to_char(created_at at time zone 'Asia/Makassar', 'YYYY-MM-DD') tgl, min(created_at) masuk, max(created_at) akhir, count(*) n
      from public.activity_log where doc->>'kind' = 'login' and doc->>'by_id' is not null group by 1, 2) x
join public.users u on u.id = x.by_id
on conflict (id) do nothing;
