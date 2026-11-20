// ============================================================
//  KATALOG IZIN TERPUSAT — satu-satunya daftar fitur, tindakan, dan field sensitif.
//  Modul → Menu → Submenu/Fitur → Tindakan (+ Field).
//  Kode izin: `<fitur>.<tindakan>`, mis. `pengiriman.daftar.lihat`, `pengaturan.role.kelola`.
//
//  ATURAN:
//  - Fitur baru WAJIB didaftarkan di sini → otomatis muncul di Pengaturan → Role & Hak Akses.
//  - Default deny: role yang belum diberi izin = ditolak. Role biasa TIDAK otomatis dapat fitur baru
//    (kecuali `asal` diisi = perilaku lama yang dipertahankan saat role pertama kali dibuat).
//  - Visibilitas menu (`menu`) TERPISAH dari otorisasi (`lihat` dst.). Menu disembunyikan ≠ akses dicabut.
//  - `asal`: daftar role yang punya hak itu di aturan LAMA (sebelum fitur ini) → dipakai untuk mengisi
//    role bawaan supaya tidak ada akses yang berubah saat fitur ini diaktifkan.
// ============================================================
import { ROLES, canAsal as can } from './access.js'
import { canSeeBeranda, canSeeInvoices, canSeePelanggan, canSeeMitra, canSeeKatalog, canSeePenugasan, canSeeRegister, canSeeLaporanOto, canSeeAffidavit, canSeeKeuangan, canSeeVendor, canMonitor, canSeeAllActivity, MENU_PELAKSANA } from './menuAccess.js'

/** Tindakan yang dikenal (urutan tampil). */
export const AKSI = {
  menu: { label: 'Tampilkan menu', ket: 'Hanya tampil/tidaknya menu. Tidak memberi akses data.' },
  lihat: { label: 'Buka halaman & lihat data' },
  detail: { label: 'Lihat detail' },
  tambah: { label: 'Tambah' },
  ubah: { label: 'Edit' },
  hapus: { label: 'Hapus' },
  arsip: { label: 'Arsip & pulihkan' },
  ajukan: { label: 'Ajukan' },
  setujui: { label: 'Setujui / tolak' },
  batal: { label: 'Batalkan / buka kembali' },
  tugaskan: { label: 'Tugaskan / ganti PIC' },
  status: { label: 'Ubah status' },
  lampiran_lihat: { label: 'Lihat & unduh lampiran' },
  lampiran_kelola: { label: 'Unggah & hapus lampiran' },
  impor: { label: 'Impor' },
  ekspor: { label: 'Ekspor' },
  cetak: { label: 'Cetak' },
  bagikan: { label: 'Bagikan' },
  laporan: { label: 'Laporan & dashboard' },
  riwayat: { label: 'Riwayat perubahan' },
  massal: { label: 'Tindakan massal' },
  atur: { label: 'Kelola pengaturan modul' },
  kelola: { label: 'Kelola' },
}
/** Tindakan yang membutuhkan izin `lihat` pada fitur yang sama (validasi dependensi). */
export const BUTUH_LIHAT = Object.keys(AKSI).filter((a) => !['menu', 'lihat'].includes(a))
/** Tindakan "sensitif" → peringatan saat diberikan. */
export const AKSI_SENSITIF = ['hapus', 'setujui', 'atur', 'kelola', 'massal', 'impor', 'ekspor', 'bagikan']

/** Cakupan data (urut dari paling sempit). `organisasi` = seluruh perusahaan (semua PT & cabang milik 247). */
export const CAKUPAN = {
  sendiri: 'Data milik sendiri',
  ditugaskan: 'Data yang ditugaskan kepadanya',
  tim: 'Data tim',
  departemen: 'Data departemen',
  cabang: 'Data cabangnya',
  cabang_pilihan: 'Beberapa cabang terpilih',
  semua: 'Seluruh data organisasi',
}
export const URUT_CAKUPAN = Object.keys(CAKUPAN)

/** Tingkat akses field sensitif. */
export const TINGKAT_FIELD = { sembunyi: 'Tidak boleh dilihat', samar: 'Disamarkan', lihat: 'Boleh dilihat', edit: 'Boleh diedit' }

const SEMUA = Object.keys(ROLES)
const KANTOR = ['superadmin', 'direktur', 'supervisor', 'admin_pusat', 'cs', 'akunting', 'helper', 'staf_apostille']
const KIRIM_OPS = ['superadmin', 'direktur', 'admin_pusat', 'supervisor', 'cs', 'helper', 'staf_apostille']
const KIRIM_ADMIN = ['superadmin', 'direktur', 'admin_pusat']
const PELAKSANA = ['penerjemah', 'proofreader', 'otorisator']
/** Role yang lolos fungsi lama (dievaluasi per role). */
const dari = (fn) => SEMUA.filter((r) => { try { return !!fn({ role: r }) } catch { return false } })
/** Menu yang di aturan lama boleh dibuka pelaksana lepas (penerjemah dkk.). */
const plus = (a, key) => (MENU_PELAKSANA.includes(key) ? [...new Set([...a, ...PELAKSANA])] : a.filter((r) => !PELAKSANA.includes(r)))

/**
 * f(id, label, aksi, asal) — fitur. `aksi` = daftar tindakan yang TERSEDIA di fitur itu.
 * `asal` = { semua: roles } atau { menu, lihat, ..., _lain } per tindakan (aturan lama).
 */
const f = (id, label, aksi, asal = {}, extra = {}) => ({ id, label, aksi, asal, ...extra })

export const MODUL = [
  { id: 'utama', label: 'Beranda & Dashboard', fitur: [
    f('beranda', 'Beranda', ['menu', 'lihat'], { semua: dari(canSeeBeranda) }),
    f('dashboard', 'Dashboard', ['menu', 'lihat', 'laporan'], { semua: plus(SEMUA, 'dashboard') }),
    f('dasbor-tata', 'Atur tampilan dasbor sendiri (urutan & ukuran kartu)', ['ubah'], { ubah: SEMUA }),
  ] },
  { id: 'penjualan', label: 'Penjualan', fitur: [
    f('faktur', 'Faktur', ['menu', 'lihat', 'detail', 'ekspor', 'cetak'], { semua: dari(canSeeInvoices) }),
    f('pelanggan', 'Pelanggan', ['menu', 'lihat', 'detail', 'tambah', 'ubah', 'hapus', 'ekspor'], { semua: dari(canSeePelanggan) }),
    f('mitra', 'Mitra', ['menu', 'lihat', 'detail', 'tambah', 'ubah', 'hapus'], { semua: dari(canSeeMitra) }),
    f('katalog', 'Katalog / Daftar Harga', ['menu', 'lihat', 'tambah', 'ubah', 'hapus', 'impor', 'ekspor'], { semua: dari(canSeeKatalog) }),
  ] },
  { id: 'marketing', label: 'Marketing', fitur: [
    // 20 Nov 2026: ide konten & status posting blog per website. Default deny → hanya Super Admin sampai diatur di Role & Hak Akses.
    f('marketing-website', 'Website — ide konten, persetujuan terbit & status posting blog', ['menu', 'lihat', 'tambah', 'ubah', 'hapus', 'setujui']),
  ] },
  { id: 'project', label: 'Project', fitur: [
    // 19 Nov 2026: Tarik Data (beta) — susun usulan sub project dari item invoice memakai AI (server: tarik-data-ai).
    f('tarik-data', 'Tarik Data (beta) — susun sub project dari invoice', ['tambah'], { tambah: ['cs', 'admin_pusat', 'helper', 'direktur', 'supervisor'] }),
    // 20 Nov 2026: Tarik dari Drive (masa transisi) — susun usulan sub project dari nama file di folder Drive lama (server: drive-files aksi tarik-nama). Default: Super Admin saja.
    f('tarik-drive', 'Tarik dari Drive (transisi) — susun sub project dari nama file Drive', ['tambah']),
    f('project', 'Project', ['menu', 'lihat', 'detail', 'tambah', 'ubah', 'hapus', 'tugaskan', 'status', 'lampiran_lihat', 'lampiran_kelola', 'ekspor', 'cetak', 'bagikan', 'riwayat', 'massal'],
      { menu: plus(SEMUA, 'projects'), lihat: plus(SEMUA, 'projects'), detail: plus(SEMUA, 'projects'), lampiran_lihat: plus(SEMUA, 'projects'), riwayat: plus(SEMUA, 'projects'), status: plus(SEMUA, 'projects'),
        tambah: dari(can.editProject), ubah: dari(can.editProject), tugaskan: dari(can.editProject), lampiran_kelola: plus(SEMUA, 'projects'), ekspor: dari(can.editProject), cetak: dari(can.editProject), bagikan: dari(can.editProject), massal: dari(can.editProject),
        hapus: dari(can.deleteProject) }),
    f('penugasan', 'Penugasan', ['menu', 'lihat', 'tugaskan'], { semua: dari(canSeePenugasan) }),
    // 15 Nov 2026: submenu Nomor Register disembunyikan dari role Otorisator (Staf Otorisasi cukup Project + Laporan Otorisasi).
    // Hanya MENU-nya; hak data tetap (tahap Nomor Registrasi di alur kerja). Master Otorisasi diberi lewat pengecualian pengguna.
    f('register', 'Nomor Register', ['menu', 'lihat', 'tambah', 'ubah', 'ekspor'], { menu: dari(canSeeRegister).filter((r) => r !== 'otorisator'), _lain: dari(canSeeRegister) }),
    f('otorisasi', 'Laporan Otorisasi', ['menu', 'lihat', 'laporan', 'ekspor'], { semua: dari(canSeeLaporanOto) }),
    f('dokumen', 'Dokumen', ['menu', 'lihat', 'lampiran_lihat', 'lampiran_kelola'], { semua: plus(SEMUA, 'dokumen') }),
    // 15 Nov 2026: dokumen Apostille & Legalisasi punya folder sendiri per project. Pelaksana (penerjemah,
    // proofreader, otorisator) tidak perlu tahu — aturan lama: semua role lain boleh.
    f('dokumen-al', 'Dokumen Apostille & Legalisasi', ['lihat', 'lampiran_kelola'], { semua: SEMUA.filter((r) => !PELAKSANA.includes(r)) }),
    f('affidavit', 'Affidavit', ['menu', 'lihat', 'tambah', 'ubah', 'laporan'], { semua: dari(canSeeAffidavit) }),
  ], field: [
    { id: 'project.biaya', label: 'Biaya / fee vendor & penerjemah (harga modal)', asal: { lihat: dari(can.seeBiaya), edit: dari(can.editBiaya) } },
    // 16 Nov 2026 (keputusan pemilik): biaya vendor Apostille/Legalisasi hanya untuk Superadmin, Direktur, Akunting — tim cukup melihat nama paketnya.
    { id: 'project.biaya_apostille', label: 'HPP vendor yang disembunyikan dari tim (apostille, legalisasi & vendor pilihan)', asal: { lihat: ['superadmin', 'direktur', 'akunting'] } },
    { id: 'project.kontak_pelanggan', label: 'Kontak & alamat pelanggan', asal: { lihat: dari(can.seeCustomerDetail) } },
    { id: 'project.nominal', label: 'Nominal transaksi / harga jual', asal: { lihat: KANTOR } },
  ] },
  // 15 Nov 2026: menu Alat. Fitur baru → bawaan hanya Superadmin (default deny); role lain diberi lewat Role & Hak Akses.
  { id: 'alat', label: 'Alat', fitur: [
    f('smart-translator', 'Smart Translator', ['menu', 'lihat']),
    // 19 Nov 2026: Bahasa Belanda di Smart Translator (Indonesia ⇄ Belanda, template & istilah baku tim Belanda). Default deny — diberikan ke penerjemah Belanda lewat Role & Hak Akses.
    // Diperiksa server (gemini-ai → app_izin) dan aplikasi Smart Translator (rpc app_izin). Tetap butuh izin smart-translator.lihat.
    f('smart-translator-belanda', 'Smart Translator — Bahasa Belanda (template tim Belanda)', ['lihat']),
    // 17 Nov 2026: Pemisah Data & Spesimen Pejabat (baca data pejabat, potong tanda tangan/paraf/stempel, ekspor Word). Default deny.
    f('pemisah-spesimen', 'Pemisah Spesimen Pejabat', ['menu', 'lihat', 'kelola']),
    // 15 Nov 2026 (keputusan pemilik): Staf Apostille/Legalisasi membuat surat kuasa dari baris pekerjaannya → lihat, tambah, ubah, cetak. Menu, hapus, atur tetap hanya Superadmin.
    // 16 Nov 2026 (keputusan pemilik): mengerjakan tahap Apostille/Legalisasi bisa diberikan PER PENGGUNA (mis. satu CS tertentu) lewat pengecualian.
    // status = Mulai Proses, centang to-do, unggah hasil, Selesai · setujui = mencentang langkah "Bayar Pajak".
    // 16 Nov 2026 (keputusan pemilik): salah bahasa / harus ganti vendor saat alur sudah berjalan → kunci dibuka dari form edit, alur dokumen diulang, alasan wajib.
    f('penugasan-ulang', 'Ulang penugasan dokumen (ganti bahasa / penerjemah / vendor saat alur berjalan)', ['ubah'], { ubah: ['superadmin', 'supervisor', 'direktur', 'admin_pusat'] }),
    // 16 Nov 2026 (keputusan pemilik): order ke biro rekanan (mis. Indotrans) boleh oleh pimpinan DAN CS.
    f('biro-order', 'Order ke biro rekanan (mis. Indotrans)', ['tambah'], { tambah: ['superadmin', 'supervisor', 'direktur', 'admin_pusat', 'cs'] }),
    f('chat-pelanggan', 'Copy chat WhatsApp ke pelanggan (Draft · Selesai · Review)', ['lihat'], { lihat: ['superadmin', 'supervisor', 'direktur', 'admin_pusat', 'cs'] }),
    f('inbox-otorisasi', 'Inbox Otorisasi — balasan email dari otorisator & simpan lampirannya ke project', ['menu', 'lihat', 'tambah'], { menu: ['superadmin', 'admin_pusat'], lihat: ['superadmin', 'admin_pusat'], tambah: ['superadmin', 'admin_pusat'] }),
    f('email-otorisasi', 'Email otorisasi — kirim dokumen sumber & hasil proofread ke otorisator lewat email (1 invoice 1 email)', ['tambah', 'atur'], { tambah: ['superadmin', 'admin_pusat'] }),
    f('pesan-siap', 'Pesan notifikasi Ready to proof / Ready to oto / Sudah diotorisasi (copy chat WhatsApp)', ['tambah', 'massal'], { tambah: ['superadmin', 'penerjemah', 'proofreader', 'otorisator', 'admin_pusat'], massal: ['superadmin', 'admin_pusat'] }),
    f('vendor-order', 'Order ke vendor (bahasa selain Indonesia · Inggris · Belanda)', ['tambah'], { tambah: ['superadmin', 'supervisor', 'direktur', 'admin_pusat', 'cs'] }),
    f('apostille-proses', 'Proses Apostille / Legalisasi', ['status', 'setujui'], { status: ['superadmin', 'supervisor', 'staf_apostille'], setujui: ['superadmin', 'direktur'] }),
    f('surat-kuasa', 'Surat Kuasa', ['menu', 'lihat', 'tambah', 'ubah', 'hapus', 'cetak', 'atur'], { lihat: ['staf_apostille'], tambah: ['staf_apostille'], ubah: ['staf_apostille'], cetak: ['staf_apostille'] }),
  ] },
  { id: 'keuangan', label: 'Keuangan', fitur: [
    f('keuangan', 'Ringkasan Keuangan', ['menu', 'lihat', 'laporan'], { menu: plus(SEMUA, 'keuangan'), lihat: plus(SEMUA, 'keuangan'), laporan: dari(canSeeKeuangan) }),
    f('pengajuan', 'Pengajuan', ['menu', 'lihat', 'detail', 'tambah', 'ubah', 'ajukan', 'setujui', 'batal', 'lampiran_lihat', 'lampiran_kelola', 'ekspor'],
      { _lain: dari(canSeeKeuangan), menu: plus(SEMUA, 'keuangan'), lihat: plus(SEMUA, 'keuangan'), detail: plus(SEMUA, 'keuangan'), tambah: plus(SEMUA, 'keuangan'), ajukan: plus(SEMUA, 'keuangan'), lampiran_lihat: plus(SEMUA, 'keuangan'), lampiran_kelola: plus(SEMUA, 'keuangan'), setujui: ['direktur', 'akunting', 'superadmin'] }),
    f('petty', 'Petty Cash', ['menu', 'lihat', 'tambah', 'ubah', 'ekspor'], { _lain: dari(canSeeKeuangan), tambah: dari(can.topUpPettyCash) }),
    f('tagihan', 'Tagihan Vendor', ['menu', 'lihat', 'tambah', 'ubah', 'setujui', 'ekspor'], { _lain: dari(canSeeKeuangan), setujui: dari(can.approveVendor) }),
    f('vendor', 'Vendor', ['menu', 'lihat', 'tambah', 'ubah', 'hapus'], { menu: dari(canSeeVendor), _lain: dari(can.manageVendors) }),
  ], field: [
    { id: 'keuangan.sumber_dana', label: 'Sumber dana & saldo PT', asal: { lihat: dari(can.seeFunding), edit: dari(can.seeFunding) } },
    { id: 'keuangan.rekening', label: 'Nomor rekening vendor/penerjemah', asal: { lihat: ['superadmin', 'direktur', 'akunting'], edit: ['superadmin', 'akunting'] } },
  ] },
  { id: 'pengiriman', label: 'Pengiriman', fitur: [
    f('pengiriman.ringkasan', 'Ringkasan', ['menu', 'lihat', 'laporan'], { semua: KIRIM_OPS }),
    f('pengiriman.daftar', 'Daftar Pengiriman', ['menu', 'lihat', 'detail', 'status', 'ekspor', 'cetak', 'riwayat', 'massal', 'batal'], { _lain: KIRIM_OPS, batal: KIRIM_ADMIN, massal: KIRIM_OPS }),
    f('pengiriman.buat', 'Buat Pengiriman', ['menu', 'lihat', 'tambah', 'ubah', 'hapus'], { semua: KIRIM_OPS }),
    f('pengiriman.ongkir', 'Cek Ongkir', ['menu', 'lihat'], { semua: KIRIM_OPS }),
    f('pengiriman.draft', 'Draft & Impor', ['menu', 'lihat', 'impor'], { _lain: KIRIM_OPS, impor: KIRIM_ADMIN }),
    f('pengiriman.alamat', 'Buku Alamat & Cabang', ['menu', 'lihat', 'tambah', 'ubah', 'hapus', 'atur'], { _lain: KIRIM_OPS, atur: KIRIM_ADMIN }),
    f('pengiriman.label', 'Label & Serah Terima', ['menu', 'lihat', 'cetak'], { semua: KIRIM_OPS }),
    f('pengiriman.kendala', 'Kendala, Retur & Klaim', ['menu', 'lihat', 'tambah', 'ubah', 'status'], { semua: KIRIM_OPS }),
    f('pengiriman.saldo', 'Saldo & Mutasi', ['menu', 'lihat', 'tambah', 'impor', 'ekspor'], { semua: KIRIM_ADMIN }),
    f('pengiriman.laporan', 'Laporan Pengiriman', ['menu', 'lihat', 'laporan', 'ekspor'], { semua: KIRIM_ADMIN }),
    f('pengiriman.pengaturan', 'Pengaturan Pengiriman', ['menu', 'lihat', 'atur'], { semua: KIRIM_ADMIN }),
    f('pengiriman.sinkron', 'Tarik data dari Everpro', ['lihat', 'kelola'], { semua: KIRIM_ADMIN }),
  ], field: [
    { id: 'pengiriman.biaya', label: 'Ongkir, cashback & selisih tagihan', asal: { lihat: KIRIM_OPS, edit: KIRIM_ADMIN } },
    { id: 'pengiriman.saldo_nominal', label: 'Saldo & mutasi Everpro', asal: { lihat: KIRIM_ADMIN, edit: KIRIM_ADMIN } },
  ] },
  { id: 'kolaborasi', label: 'Kolaborasi', fitur: [
    f('agenda', 'Agenda', ['menu', 'lihat', 'tambah', 'ubah', 'hapus'], { semua: plus(SEMUA, 'agenda') }),
    // 15 Nov 2026: penerjemah/proofreader/otorisator (freelance) tidak perlu tahu siapa yang sedang online.
    f('tim-online', 'Lihat siapa yang online', ['lihat'], { lihat: SEMUA.filter((r) => !PELAKSANA.includes(r)) }),
    f('jadwal', 'Jadwal Kerja', ['menu', 'lihat', 'tambah', 'ubah'], { semua: plus(SEMUA, 'jadwal') }),
    // 15 Nov 2026: login harian = absen hadir. Rekap kehadiran untuk Superadmin & Direktur.
    f('kehadiran', 'Rekap Kehadiran (login harian)', ['menu', 'lihat', 'ekspor'], { semua: ['superadmin', 'direktur'] }),
    // 19 Nov 2026: hanya CS, Staf Apostille, Helper & Admin Pusat yang wajib login ulang tiap hari (absen). Role lain tetap masuk.
    //  Dicentang = role ini WAJIB login setiap hari. Super Admin tidak pernah wajib (lihat wajibLoginHarian).
    f('login-harian', 'Wajib login ulang setiap hari (absen hadir)', ['kelola'], { kelola: ['cs', 'staf_apostille', 'helper', 'admin_pusat'] }),
    f('notes', 'Catatan', ['menu', 'lihat', 'tambah', 'ubah', 'hapus', 'bagikan'], { semua: plus(SEMUA, 'notes') }),
  ] },
  { id: 'perusahaan', label: 'Perusahaan & Pengaturan', fitur: [
    f('perusahaan', 'Perusahaan', ['menu', 'lihat', 'lampiran_lihat', 'lampiran_kelola'], { semua: plus(SEMUA, 'perusahaan') }),
    f('faq', 'FAQ', ['menu', 'lihat', 'ubah'], { menu: plus(SEMUA, 'faq'), lihat: plus(SEMUA, 'faq'), ubah: ['superadmin'] }),
    f('settings', 'Pengaturan', ['menu', 'lihat'], { semua: SEMUA }),
    f('pengaturan.pengguna', 'Pengguna', ['lihat', 'tambah', 'ubah', 'arsip'], { semua: dari(can.manageUsers) }),
    // 19 Nov 2026: tim boleh menambah lembaga / kedutaan yang belum ada langsung dari form project ("Lembaga lain").
    f('lembaga', 'Tambah lembaga / kedutaan dari form project', ['tambah'], { tambah: ['cs', 'admin_pusat', 'helper', 'staf_apostille', 'direktur', 'supervisor'] }),
    f('pengaturan.master', 'Master data & Kurir', ['lihat', 'tambah', 'ubah', 'hapus'], { semua: dari(can.managePeople) }),
    f('pengaturan.integrasi', 'Integrasi', ['lihat', 'atur'], { semua: dari(can.manageUsers) }),
    // 15 Nov 2026: pengaturan AI (Gemini) — fitur baru, bawaan hanya Superadmin.
    f('pengaturan.ai', 'AI (Gemini) — model & batas biaya', ['lihat', 'atur']),
    // 20 Nov 2026: Koreksi Typo Otomatis — laporan seberapa sering tiap penerjemah typo. Fitur baru, bawaan hanya Superadmin.
    //  (Toggle per akun memakai izin yang sudah ada: pengaturan.pengguna.ubah — dijaga juga oleh trigger users_kunci_jaga.)
    f('koreksi-typo', 'Koreksi Typo Otomatis — laporan typo per penerjemah', ['laporan']),
    f('pengaturan.role', 'Role & Hak Akses', ['lihat', 'kelola', 'riwayat'], { semua: ['superadmin'] }, { inti: true }),
    f('pengguna.role', 'Menetapkan role pengguna', ['kelola'], { semua: ['superadmin'] }, { inti: true }),
  ], field: [
    { id: 'pengguna.identitas', label: 'Identitas pribadi karyawan (KTP, alamat, rekening gaji)', asal: { lihat: ['superadmin'], edit: ['superadmin'] } },
  ] },
  { id: 'sistem', label: 'Sistem', fitur: [
    f('monitoring', 'Monitoring', ['menu', 'lihat'], { semua: dari(canMonitor) }),
    f('status-server', 'Status Server', ['menu', 'lihat'], { semua: dari(canMonitor) }),
    f('rilis-fitur', 'Rilis Fitur', ['menu', 'lihat', 'atur'], { semua: dari(canMonitor) }),
    f('aktivitas', 'Aktivitas', ['menu', 'lihat', 'ekspor'], { semua: dari(canSeeAllActivity) }),
    f('laporan-staf', 'Laporan masalah dari staf', ['tambah', 'lihat', 'status'], { tambah: SEMUA, lihat: dari(canMonitor), status: dari(canMonitor) }),
  ] },
]

/** Peta cepat. */
export const FITUR = Object.fromEntries(MODUL.flatMap((m) => m.fitur.map((x) => [x.id, { ...x, modul: m.id }])))
export const FIELD = Object.fromEntries(MODUL.flatMap((m) => (m.field || []).map((x) => [x.id, { ...x, modul: m.id }])))
export const SEMUA_KODE = MODUL.flatMap((m) => m.fitur.flatMap((x) => x.aksi.map((a) => `${x.id}.${a}`)))
/** Izin inti yang hanya boleh dimiliki role sistem / diberikan dengan sadar (tidak termasuk preset "Akses Penuh Modul"). */
export const KODE_INTI = MODUL.flatMap((m) => m.fitur.filter((x) => x.inti).flatMap((x) => x.aksi.map((a) => `${x.id}.${a}`)))
export const pisahKode = (kode) => { const i = kode.lastIndexOf('.'); return [kode.slice(0, i), kode.slice(i + 1)] }

/** Halaman (rute #/key[/sub]) → fitur yang mengatur aksesnya. */
export const RUTE_FITUR = {
  beranda: 'beranda', dashboard: 'dashboard', faktur: 'faktur', pelanggan: 'pelanggan', mitra: 'mitra', 'daftar-harga': 'katalog', 'marketing-website': 'marketing-website',
  projects: 'project', penugasan: 'penugasan', register: 'register', otorisasi: 'otorisasi', dokumen: 'dokumen', affidavit: 'affidavit',
  keuangan: 'keuangan', vendor: 'vendor', agenda: 'agenda', jadwal: 'jadwal', notes: 'notes', perusahaan: 'perusahaan', faq: 'faq', settings: 'settings',
  kehadiran: 'kehadiran', 'smart-translator': 'smart-translator', 'pemisah-spesimen': 'pemisah-spesimen', 'inbox-otorisasi': 'inbox-otorisasi', 'surat-kuasa': 'surat-kuasa', monitoring: 'monitoring', 'status-server': 'status-server', 'rilis-fitur': 'rilis-fitur', aktivitas: 'aktivitas',
  'pengiriman': 'pengiriman.ringkasan', 'pengiriman/daftar': 'pengiriman.daftar', 'pengiriman/buat': 'pengiriman.buat', 'pengiriman/ongkir': 'pengiriman.ongkir',
  'pengiriman/draft': 'pengiriman.draft', 'pengiriman/alamat': 'pengiriman.alamat', 'pengiriman/label': 'pengiriman.label', 'pengiriman/kendala': 'pengiriman.kendala',
  'pengiriman/saldo': 'pengiriman.saldo', 'pengiriman/laporan': 'pengiriman.laporan', 'pengiriman/pengaturan': 'pengiriman.pengaturan',
  'keuangan/pengajuan': 'pengajuan', pengajuan: 'pengajuan', 'keuangan/petty': 'petty', 'keuangan/tagihan': 'tagihan',
}

/** Cakupan bawaan role (dari aturan lama: lihat semua cabang / cabang sendiri / tugas sendiri). */
export const cakupanAsal = (role) => (can.seeAllBranches({ role }) ? 'semua' : PELAKSANA.includes(role) ? 'ditugaskan' : 'cabang')

/** Bangun konfigurasi role dari aturan lama (dipakai untuk role bawaan & tombol "Kembalikan ke aturan lama"). */
export function konfigAsal(role) {
  const izin = {}
  const cak = cakupanAsal(role)
  for (const m of MODUL) for (const x of m.fitur) for (const a of x.aksi) {
    const daftar = x.asal[a] ?? x.asal._lain ?? x.asal.semua ?? []
    // Otorisator bekerja dari antrian bersama (tahap Otorisasi semua project) → project-nya tidak dibatasi "ditugaskan".
    const c = x.id === 'project' && role === 'otorisator' ? 'semua' : cak
    if (role === 'superadmin' || daftar.includes(role)) izin[`${x.id}.${a}`] = a === 'menu' ? { aktif: true } : { aktif: true, cakupan: c }
  }
  const field = {}
  for (const m of MODUL) for (const x of m.field || []) {
    const lihat = role === 'superadmin' || (x.asal.lihat || []).includes(role), edit = role === 'superadmin' || (x.asal.edit || []).includes(role)
    field[x.id] = edit ? 'edit' : lihat ? 'lihat' : 'sembunyi'
  }
  return { izin, field }
}

/** Preset per modul. */
export const PRESET = {
  tanpa: { label: 'Tanpa Akses', ket: 'Menu disembunyikan & semua tindakan dicabut' },
  lihat: { label: 'Hanya Lihat', ket: 'Menu, lihat, detail, laporan, riwayat' },
  operasional: { label: 'Operasional', ket: 'Lihat + tambah, edit, ubah status, lampiran, cetak (tanpa hapus/setujui/atur)' },
  penuh: { label: 'Akses Penuh Modul', ket: 'Semua tindakan modul ini — kecuali hak mengelola role/Super Admin' },
}
const PRESET_AKSI = {
  tanpa: [],
  lihat: ['menu', 'lihat', 'detail', 'laporan', 'riwayat', 'lampiran_lihat'],
  operasional: ['menu', 'lihat', 'detail', 'laporan', 'riwayat', 'lampiran_lihat', 'tambah', 'ubah', 'status', 'lampiran_kelola', 'cetak', 'ajukan', 'tugaskan'],
}
export function terapkanPreset(izin, modulId, preset, cakupan = 'cabang') {
  const m = MODUL.find((x) => x.id === modulId); const n = { ...izin }
  for (const x of m.fitur) for (const a of x.aksi) {
    const kode = `${x.id}.${a}`
    if (KODE_INTI.includes(kode)) continue // preset tidak pernah menyentuh hak inti
    const on = preset === 'penuh' || (PRESET_AKSI[preset] || []).includes(a)
    if (on) n[kode] = a === 'menu' ? { aktif: true } : { aktif: true, cakupan: n[kode]?.cakupan || cakupan }
    else delete n[kode]
  }
  return n
}
