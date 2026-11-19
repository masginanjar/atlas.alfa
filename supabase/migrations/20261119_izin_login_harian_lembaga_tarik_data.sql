-- 19 Nov 2026 (sudah diterapkan di live): izin baru + RLS tambah lembaga lewat mesin izin.
--  • login-harian.kelola  : role yang WAJIB login ulang setiap hari (CS, Staf Apostille, Helper, Admin Pusat)
--  • lembaga.tambah       : boleh menambah lembaga / kedutaan dari form project
--  • tarik-data.tambah    : boleh memakai Tarik Data (beta) — fungsi server tarik-data-ai
update public.akses_role set doc = jsonb_set(doc, '{izin,login-harian.kelola}', '{"aktif": true}'::jsonb, true)
 where doc->>'kode' in ('cs','staf_apostille','helper','admin_pusat');
update public.akses_role set doc = jsonb_set(doc, '{izin,lembaga.tambah}', jsonb_build_object('aktif', true, 'cakupan', case when doc->>'kode' in ('admin_pusat','direktur','supervisor') then 'semua' else 'cabang' end), true)
 where doc->>'kode' in ('cs','admin_pusat','helper','staf_apostille','direktur','supervisor');
update public.akses_role set doc = jsonb_set(doc, '{izin,tarik-data.tambah}', jsonb_build_object('aktif', true, 'cakupan', case when doc->>'kode' in ('admin_pusat','direktur','supervisor') then 'semua' else 'cabang' end), true)
 where doc->>'kode' in ('cs','admin_pusat','helper','direktur','supervisor');
drop policy if exists people_ins_lembaga on public.people;
create policy people_ins_lembaga on public.people for insert to authenticated
  with check (public.app_izin('lembaga.tambah') and doc->>'type' = 'lembaga');
