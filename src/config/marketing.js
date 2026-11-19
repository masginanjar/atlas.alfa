// ============================================================
//  MARKETING → WEBSITE (20 Nov 2026): ide konten & status posting blog.
//  SATU catatan per artikel dengan SATU status yang berjalan dari ide sampai terbit,
//  supaya daftar "Ide Konten" dan "Status Posting Hari Ini" tidak pernah berbeda cerita.
// ============================================================
/** Website yang dikelola. Menambah website cukup di sini. */
export const WEBSITE = ['englishlink.co.id', 'etranslator.nl']
export const JENIS_KONTEN = ['Edukasi', 'Layanan', 'Panduan', 'FAQ', 'Berita', 'Lainnya']
export const PRIORITAS_KONTEN = ['Tinggi', 'Sedang', 'Rendah']
/** Urutan = alur kerja. */
export const STATUS_KONTEN = ['Ide', 'Disetujui', 'Sedang Ditulis', 'Siap Review', 'Siap Terbit', 'Terjadwal', 'Sudah Terbit', 'Tertunda']
/** Status di panel "Status Posting Blog Hari Ini" (lebih ringkas) ← status artikel. */
const KE_POSTING = { Ide: 'Belum Mulai', Disetujui: 'Belum Mulai', 'Sedang Ditulis': 'Sedang Ditulis', 'Siap Review': 'Review', 'Siap Terbit': 'Terjadwal', Terjadwal: 'Terjadwal', 'Sudah Terbit': 'Sudah Terbit', Tertunda: 'Tertunda' }
export const statusPosting = (s) => KE_POSTING[s] || 'Belum Mulai'
export const WARNA_STATUS_KONTEN = {
  Ide: 'bg-slate-100 text-slate-700 ring-slate-200', Disetujui: 'bg-sky-50 text-sky-800 ring-sky-200', 'Sedang Ditulis': 'bg-amber-50 text-amber-800 ring-amber-200',
  'Siap Review': 'bg-violet-50 text-violet-800 ring-violet-200', 'Siap Terbit': 'bg-indigo-50 text-indigo-800 ring-indigo-200', Terjadwal: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  'Sudah Terbit': 'bg-emerald-50 text-emerald-800 ring-emerald-200', Tertunda: 'bg-rose-50 text-rose-700 ring-rose-200',
  'Belum Mulai': 'bg-slate-100 text-slate-700 ring-slate-200', Review: 'bg-violet-50 text-violet-800 ring-violet-200',
}
/** Tanggal hari ini (WITA) dalam bentuk YYYY-MM-DD — sama dengan isi <input type="date">. */
export const hariIniWita = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Makassar' })
export const kontenBaru = (website = WEBSITE[0]) => ({ website, judul: '', kata_kunci: '', jenis: JENIS_KONTEN[0], prioritas: 'Sedang', tanggal: '', jam: '', pic: '', status: 'Ide', link: '', catatan: '' })
const URL_OK = /^https?:\/\/[^\s]+\.[^\s]+$/i
/** Pesan galat per kolom ({} = sah). */
export function cekKonten(k) {
  const g = {}
  if (!WEBSITE.includes(k.website)) g.website = 'Pilih website'
  if (!String(k.judul || '').trim()) g.judul = 'Judul / topik wajib diisi'
  if (k.link && !URL_OK.test(String(k.link).trim())) g.link = 'Link harus diawali http:// atau https://'
  if (k.status === 'Sudah Terbit' && !String(k.link || '').trim()) g.link = 'Isi link artikel yang sudah terbit'
  if (['Terjadwal', 'Sudah Terbit'].includes(k.status) && !k.tanggal) g.tanggal = 'Isi tanggal terbit'
  return g
}
/** Ringkasan satu hari: { target, terbit, proses, tertunda }. */
export function ringkasHari(rows, tanggal) {
  const hari = rows.filter((r) => r.tanggal === tanggal)
  const terbit = hari.filter((r) => r.status === 'Sudah Terbit').length, tertunda = hari.filter((r) => r.status === 'Tertunda').length
  return { hari, target: hari.length, terbit, tertunda, proses: hari.length - terbit - tertunda }
}
