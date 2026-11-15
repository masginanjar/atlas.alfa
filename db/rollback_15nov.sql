-- ROLLBACK perubahan database 15 Nov 2026 (jalankan hanya bila perlu & atas persetujuan pemilik).
-- Urutan: dari yang terbaru. Data baru di akses_* / app_laporan TIDAK dihapus oleh skrip ini.

-- 1) Penjaga kolom akses pengguna (audit peluncuran)
drop trigger if exists users_kunci_jaga on public.users;
-- 2) Laporan masalah staf
drop policy if exists app_laporan_kirim on public.app_laporan;
drop policy if exists app_laporan_baca on public.app_laporan;
drop policy if exists app_laporan_ubah on public.app_laporan;
-- 3) Kebijakan Pengiriman kembali ke fungsi lama (sebelum katalog izin)
alter policy kirim_read on public.kirim using (((select app_kirim_ops()) or (select app_kirim_keu())) and app_kirim_cabang(doc->>'cabang'));
alter policy kirim_ins on public.kirim with check ((select app_kirim_ops()) and app_kirim_cabang(doc->>'cabang'));
alter policy kirim_upd on public.kirim using ((select app_kirim_ops()) and app_kirim_cabang(doc->>'cabang')) with check ((select app_kirim_ops()) and app_kirim_cabang(doc->>'cabang'));
alter policy kirim_del on public.kirim using ((select app_kirim_ops()) and app_kirim_cabang(doc->>'cabang') and doc->>'tahap' = 'draft');
alter policy kirim_event_read on public.kirim_event using (((select app_kirim_ops()) or (select app_kirim_keu())) and app_kirim_cabang(doc->>'cabang'));
alter policy kirim_alamat_read on public.kirim_alamat using (((select app_kirim_ops()) or (select app_kirim_keu())) and (coalesce(doc->>'cabang','') = '' or app_kirim_cabang(doc->>'cabang')));
alter policy kirim_alamat_tulis on public.kirim_alamat using ((select app_kirim_ops()) and (coalesce(doc->>'cabang','') = '' or app_kirim_cabang(doc->>'cabang'))) with check ((select app_kirim_ops()) and (coalesce(doc->>'cabang','') = '' or app_kirim_cabang(doc->>'cabang')));
alter policy kirim_kendala_read on public.kirim_kendala using (((select app_kirim_ops()) or (select app_kirim_keu())) and app_kirim_cabang(doc->>'cabang'));
alter policy kirim_kendala_tulis on public.kirim_kendala using (((select app_kirim_ops()) or (select app_kirim_keu())) and app_kirim_cabang(doc->>'cabang')) with check (((select app_kirim_ops()) or (select app_kirim_keu())) and app_kirim_cabang(doc->>'cabang'));
alter policy kirim_mutasi_keu on public.kirim_mutasi using ((select app_kirim_keu())) with check ((select app_kirim_keu()));
drop policy if exists kirim_mutasi_baca on public.kirim_mutasi;
alter policy kirim_templat_tulis on public.kirim_templat using ((select app_role()) = any (array['superadmin','direktur','admin_pusat'])) with check ((select app_role()) = any (array['superadmin','direktur','admin_pusat']));
-- 4) Penjaga role pengguna (Role & Hak Akses tahap 1) — biasanya TIDAK perlu dicabut
-- drop trigger if exists users_role_jaga on public.users;
-- Edge function: kirim v6 → v5 (tanpa app_izin), drive-files v8 → v7 (tanpa cek cabang berkas): deploy ulang versi lama dari repo git.

-- 5) Uji lanjutan (15 Nov, siang)
drop index if exists public.registrations_urut_unik;
-- requests_jaga_status: hapus blok "nominal wajib > 0" (kembalikan versi sebelumnya).
-- app_patch: blok "_versi" aman dibiarkan (hanya aktif bila aplikasi mengirim _versi).
