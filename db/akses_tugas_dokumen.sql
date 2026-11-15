-- ============================================================
-- 15 Nov 2026 — (1) Penerjemah/proofreader hanya melihat project yang ditugaskan
--               (2) Berkas project hanya untuk yang boleh melihat project-nya
--                   (cabangnya, lokasi print/titip print, atau ditugaskan)
--               (3) Folder "apostille-legalisasi" per project: butuh izin dokumen-al.*
-- Diterapkan ke LIVE hanya setelah "live kan". Non-destruktif (create/alter, tanpa drop).
-- ============================================================

-- (1) Project ditugaskan: dipakai bila cakupan izin project.lihat = 'ditugaskan'
create or replace function public.app_proyek_ditugaskan(d jsonb, uid text) returns boolean
language sql immutable set search_path = public as $f$
  select uid is not null and (coalesce(d->>'created_by' = uid, false) or exists (
    select 1 from jsonb_array_elements(coalesce(d->'sub_projects','[]'::jsonb)) s
    where uid in (s->'data'->>'translator', s->'data'->>'proofreader', s->'data'->>'staff_apostille', s->'data'->>'authorized_by')))
$f$;

alter policy projects_select on public.projects using (
  (select app_is_staff()) and (
    case when (select app_cakupan('project.lihat')) = 'ditugaskan' then app_proyek_ditugaskan(doc, (select app_user_id()))
    else (select app_sees_all()) or branch = any (coalesce((select app_branches()), '{}')) or print_location = any (coalesce((select app_branches()), '{}')) end));
alter policy projects_update on public.projects using (
  (select app_is_staff()) and (
    case when (select app_cakupan('project.lihat')) = 'ditugaskan' then app_proyek_ditugaskan(doc, (select app_user_id()))
    else (select app_sees_all()) or branch = any (coalesce((select app_branches()), '{}')) or print_location = any (coalesce((select app_branches()), '{}')) end));
alter policy projects_write on public.projects with check (
  (select app_is_staff()) and (select app_cakupan('project.lihat')) <> 'ditugaskan' and (
    (select app_sees_all()) or branch = any (coalesce((select app_branches()), '{}')) or print_location = any (coalesce((select app_branches()), '{}'))));

-- Otorisator bekerja dari antrian bersama → project-nya tetap 'semua' (perilaku lama dipertahankan)
update public.akses_role set doc = jsonb_set(doc, '{izin,project.lihat,cakupan}', '"semua"')
 where doc->>'kode' = 'otorisator' and doc->'izin'->'project.lihat' is not null;

-- (3) izin baru dokumen-al.* untuk semua role kecuali pelaksana (aturan lama dipertahankan)
update public.akses_role set doc = jsonb_set(jsonb_set(doc, '{izin,dokumen-al.lihat}', '{"aktif":true,"cakupan":"cabang"}'),
                                             '{izin,dokumen-al.lampiran_kelola}', '{"aktif":true,"cakupan":"cabang"}')
 where doc->>'kode' not in ('penerjemah','proofreader','otorisator','superadmin') and doc->'izin' is not null
   and not (doc->'izin' ? 'dokumen-al.lihat');

-- (2)+(3) Berkas di bucket files: folder <cabang>/<no invoice>/...
create or replace function public.app_berkas_proyek_ada(inv text) returns boolean
language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.projects where invoice_no = inv)
$f$;
revoke execute on function public.app_berkas_proyek_ada(text) from public, anon;
grant execute on function public.app_berkas_proyek_ada(text) to authenticated;

create policy files_proyek_jaga on storage.objects as restrictive for all to authenticated
using (
  bucket_id <> 'files'
  or not public.app_berkas_proyek_ada(split_part(name, '/', 2))
  or (exists (select 1 from public.projects p where p.invoice_no = split_part(name, '/', 2))
      and (split_part(name, '/', 3) <> 'apostille-legalisasi' or (select public.app_izin('dokumen-al.lihat')))))
with check (
  bucket_id <> 'files'
  or not public.app_berkas_proyek_ada(split_part(name, '/', 2))
  or (exists (select 1 from public.projects p where p.invoice_no = split_part(name, '/', 2))
      and (split_part(name, '/', 3) <> 'apostille-legalisasi' or (select public.app_izin('dokumen-al.lampiran_kelola')))));

-- (4) Penerjemah menolak tugas → setelah ditolak project tidak lagi "ditugaskan" kepadanya,
--     jadi perubahan dilakukan di server (fungsi ini memeriksa dia memang pemegang tugasnya).
create or replace function public.app_tolak_tugas(p_project text, p_sub text, p_alasan text) returns void
language plpgsql security definer set search_path = public as $f$
declare u public.users; p public.projects; kini text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); ada boolean := false; subs jsonb := '[]'; s jsonb;
begin
  u := public.app_user();
  if u.id is null then raise exception 'Harus masuk dulu'; end if;
  if coalesce(trim(p_alasan), '') = '' then raise exception 'Isi alasan penolakan'; end if;
  select * into p from public.projects where id = p_project for update;
  if p.id is null then raise exception 'Project tidak ditemukan'; end if;
  for s in select * from jsonb_array_elements(coalesce(p.doc->'sub_projects','[]')) loop
    if s->>'id' = p_sub then
      if coalesce(s->'data'->>'translator', '') <> u.id or coalesce(s->>'stage','') <> 'penerjemahan' then
        raise exception 'Tugas ini tidak sedang dipegang Anda';
      end if;
      ada := true;
      s := s || jsonb_build_object('translator', '', 'stage', 'pilih_penerjemah', 'stage_at', kini,
        'data', coalesce(s->'data','{}') || jsonb_build_object('translator', '', 'tolak_note', trim(p_alasan), 'tolak_by', u.id,
          'tolak_name', u.doc->>'name', 'tolak_at', kini, 'tolak_count', coalesce((s->'data'->>'tolak_count')::int, 0) + 1, 'penerjemahan_work_started_at', ''),
        'history', coalesce(s->'history','[]') || jsonb_build_array(jsonb_build_object('at', kini, 'by', u.doc->>'name', 'by_id', u.id, 'role', u.role,
          'action', 'Tugas ditolak penerjemah → kembali ke Pilih Penerjemah · alasan: ' || trim(p_alasan), 'rejected', true, 'reason', trim(p_alasan))));
    end if;
    subs := subs || jsonb_build_array(s);
  end loop;
  if not ada then raise exception 'Sub project tidak ditemukan'; end if;
  update public.projects set doc = jsonb_set(doc, '{sub_projects}', subs) where id = p_project;
end $f$;
revoke execute on function public.app_tolak_tugas(text, text, text) from public, anon;
grant execute on function public.app_tolak_tugas(text, text, text) to authenticated;
