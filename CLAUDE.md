# Pedoman Proyek ATLAS

## Proses rilis (wajib)
- Setiap perubahan dipublikasikan ke **demo** (artifact) dulu. Push ke **live** (repo `masginanjar/atlas.alfa`, GitHub Pages) hanya setelah pemilik bilang "live kan / livekan".
- Fungsi server (Supabase Edge Functions) langsung berlaku di live saat di-deploy — beri tahu pemilik setiap kali.
- Jangan taruh service_role key Supabase, secret Zoho, atau kunci Everpro di kode front-end. Kunci hanya di Supabase Secrets.
- Pembatasan cabang/akses wajib di server (RLS), bukan hanya disembunyikan di UI.
- Data pribadi pelanggan tidak boleh masuk repo publik (`src/lib/demoZohoNov.js`, `src/lib/legacy/payload-*.json` dikecualikan dari sinkron).

## MOBILE FIRST (aturan permanen — berlaku untuk SETIAP prompt, fitur, komponen, dan perbaikan)
Utamakan kenyamanan UI/UX mobile dan kesiapan Android/iOS, **tanpa mengubah tampilan & pengalaman desktop** yang sudah ada. Berlaku otomatis kecuali pemilik meminta pengecualian secara eksplisit.

### Pertahankan desktop
- Layout, ukuran, posisi, warna, tipografi, navigasi, tabel, dan interaksi desktop tidak berubah.
- Perubahan mobile diisolasi lewat breakpoint (`max-md:` / `md:hidden` / media query `max-width: 767px`) atau komponen adaptif terpisah.
- Jangan ubah style global/komponen bersama bila desktop ikut berubah.
- Breakpoint proyek (Tailwind default): HP `< 768px` (`md`), tablet `768–1023px`, desktop `≥ 1024px` (`lg`).
- Logika bisnis & sumber data sama untuk mobile dan desktop.

### Pengalaman mobile
- Rapi, cepat, sederhana, nyaman satu tangan; tindakan utama dalam jangkauan jempol.
- Target sentuh minimal 44 × 44 px (`max-md:min-h-11`), tidak bergantung pada hover.
- Tidak ada scroll horizontal seluruh halaman; teks tidak terlalu kecil; zoom tidak dikunci (kolom isian ≥ 16px di HP agar iOS tidak auto-zoom).
- Navigasi: bar bawah (Dasbor · Project · Buat · Agenda · Menu) + menu "Menu"/drawer, mengikuti role. Status aktif & judul halaman jelas; tombol kembali/tautan langsung bekerja.
- Tabel lebar → kartu/daftar ringkas di HP. Bila perbandingan kolom perlu, scroll horizontal hanya di dalam area tabel dengan petunjuk.
- Bottom sheet untuk pilihan/aksi singkat; halaman penuh untuk form panjang/detail kompleks; hindari modal bertumpuk.
- Form satu kolom, label jelas, `inputMode`/`type` keyboard sesuai (email, tel, angka), validasi di dekat field, input dipertahankan saat galat.
- Tombol aksi utama sticky bila membantu, tanpa menutupi konten. Filter panjang dilipat di HP.
- Safe area: `env(safe-area-inset-*)` pada elemen fixed/sticky; `dvh` untuk tinggi; header, bar bawah, tombol sticky, dan keyboard tidak saling menumpuk. Portrait & landscape layak.

### Android, iOS, PWA
- Struktur siap dikemas (mis. Capacitor); integrasi perangkat dipisah dari komponen UI.
- PWA: manifest, ikon, standalone, strategi update & cache aman; jangan cache data sensitif sembarangan.
- Tampilkan kondisi offline/gagal koneksi dengan jelas; jangan tampilkan transaksi berhasil sebelum dikonfirmasi server.
- Minta izin kamera/lokasi/file/notifikasi hanya saat fiturnya dipakai.
- PWA ≠ otomatis siap App Store/Play Store (build, signing, native, syarat publikasi terpisah).

### Performa & kualitas
- Minimalkan render ulang, ukuran aset, dan pemuatan data. Loading/empty/error/sukses konsisten.
- Cegah kirim ganda (tombol nonaktif saat proses). Animasi ringan, hormati `prefers-reduced-motion`. Jangan ganggu gesture sistem.

### Verifikasi setiap perubahan
- Cek lebar 320, 375, 390, 430 px, tablet (768), landscape, dan desktop (1024, 1440).
- Uji navigasi, form, keyboard, scroll, modal, bottom sheet, tombol sticky.
- Bandingkan screenshot desktop sebelum/sesudah pada viewport sama — tidak boleh ada perubahan visual yang tidak diminta.
- Jangan mengklaim uji perangkat nyata bila hanya simulasi viewport.

Kriteria selesai: berfungsi penuh di mobile, nyaman dengan jempol, siap menuju Android/iOS, desktop tetap sama.

## ROLE & HAK AKSES (aturan permanen — setiap fitur baru)
Setiap fitur, menu, halaman, tombol tindakan, atau field sensitif BARU wajib:
1. Didaftarkan di katalog `src/config/izin.js` (`MODUL` → fitur + tindakan yang tersedia; field sensitif di `field`; rute di `RUTE_FITUR`). Otomatis muncul di Pengaturan → Role & Hak Akses.
2. Diperiksa lewat mesin izin, bukan daftar nama role: UI `boleh(user, 'fitur.aksi')` / `menuTampil` / `aksesField` (`src/lib/izin.js`); server `app_izin('fitur.aksi')` + `app_lingkup(kode, cabang)` di RLS & edge function.
3. Default deny: role biasa TIDAK otomatis mendapat fitur baru (Super Admin saja). Isi `asal` hanya bila fitur menggantikan aturan lama, supaya akses yang sudah ada tidak berubah.
4. Tindakan yang tidak diizinkan disembunyikan; halaman tanpa izin → pesan "Tidak ada akses" tanpa data.
5. Uji: menu/halaman/tombol sesuai izin, akses lewat URL/API ditolak, tidak bocor lintas cabang. `node scripts/cek-katalog-izin.mjs` (otomatis di build) gagal bila menu belum terdaftar.
6. Perubahan role/izin tercatat di audit (trigger database); jangan menulis aturan akses berdasarkan nama role di kode baru.
