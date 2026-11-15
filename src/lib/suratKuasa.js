// ============================================================
//  SURAT KUASA — template, validasi, dan pembuat PDF SATU HALAMAN A4.
//  • PDF dibangun langsung dengan jsPDF (teks asli, bukan gambar) dari data formulir.
//  • Pratinjau = PDF yang sama (dirender ke kanvas), jadi apa yang terlihat = yang dicetak.
//  • Aturan muat: jarak → padding tabel → ukuran huruf (batas: isi ≥ 10 pt, tabel ≥ 9,5 pt).
//    Bila tetap tidak muat: TIDAK diekspor, pengguna diberi tahu penyebabnya. Tidak pernah
//    memotong teks, menghapus baris, atau membuat halaman kedua.
// ============================================================
import { jsPDF } from 'jspdf'

export const TPL_VERSI = 'SK-2'
/** Redaksi bawaan (dapat diubah lewat Pengaturan template oleh yang berizin). {layanan} diganti pilihan layanan. */
export const REDAKSI_BAWAAN = {
  pembuka: 'Yang bertanda tangan di bawah ini :',
  kepada: 'Dengan ini memberi kuasa kepada :',
  tujuan: 'Untuk mengurus proses permohonan layanan {layanan} pada dokumen pemberi kuasa dan pada akhirnya menerima hasil permohonan yaitu {hasil} pada dokumen berikut :',
  wewenang: 'Untuk maksud dan keperluan tersebut, penerima kuasa diberi hak dan wewenang untuk melakukan permohonan, memberi keterangan-keterangan sesuai yang diperlukan dan menerima {hasil} tersebut dari instansi atau Pejabat yang berwenang.',
  penutup: 'Demikian surat kuasa ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.',
}
export const LAYANAN = { legalisasi: 'Legalisasi', apostille: 'Apostille', keduanya: 'Legalisasi/Apostille' }
export const HASIL_LAYANAN = { legalisasi: 'Stiker Legalisasi', apostille: 'Sertifikat Apostille', keduanya: 'Stiker Legalisasi/Sertifikat Apostille' }
const isi = (t, s) => String(t).replaceAll('{layanan}', LAYANAN[s.layanan] || '').replaceAll('{hasil}', HASIL_LAYANAN[s.layanan] || '')
export const STATUS_SK = { draf: 'Draf', perlu_diperiksa: 'Perlu diperiksa', siap_cetak: 'Siap dicetak' }

const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
/** 2026-11-15 → 15 November 2026. Teks lain dikembalikan apa adanya. */
export const tglIndo = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${+m[3]} ${BLN[+m[2] - 1]} ${m[1]}` : String(s || '') }
export const tglNomor = (r) => [tglIndo(r.tanggal), String(r.nomor || '').trim()].filter(Boolean).join(' / ')

/** Rangkai alamat dari komponen KTP tanpa menggandakan bagian yang sudah tertulis di baris alamat. */
export function rangkaiAlamat(p) {
  const a = String(p.alamat || '').trim(), U = a.toUpperCase(), out = [a]
  const ada = (s) => !!s && U.includes(String(s).toUpperCase().trim())
  const rt = String(p.rtrw || '').trim()
  if (rt && !/\bRT\b/.test(U) && !ada(rt)) { const m = rt.match(/^(\d+)\s*\/\s*(\d+)$/); out.push(m ? `RT ${m[1]}/RW ${m[2]}` : `RT/RW ${rt}`) }
  if (p.kel && !ada(p.kel)) out.push(`Kel./Desa ${String(p.kel).trim()}`)
  if (p.kec && !ada(p.kec)) out.push(`Kec. ${String(p.kec).trim()}`)
  if (p.kabkota && !ada(String(p.kabkota).replace(/^(KOTA|KABUPATEN|KAB\.?)\s+/i, ''))) out.push(String(p.kabkota).trim())
  if (p.provinsi && !ada(p.provinsi)) out.push(String(p.provinsi).trim())
  if (p.kodepos) out.push(String(p.kodepos).trim())
  return out.filter(Boolean).join(', ')
}
/** Validasi bentuk NIK — 16 digit hanya bentuk, bukan bukti benar. */
export function cekNik(v) {
  const s = String(v || '').trim(); if (!s) return { ok: false, kosong: true, x: 'NIK kosong' }
  if (/\D/.test(s)) return { ok: false, x: 'Ada karakter bukan angka — cocokkan dengan KTP' }
  if (s.length !== 16) return { ok: false, x: `${s.length} digit (NIK berbentuk 16 digit)` }
  return { ok: true, x: '16 digit — bentuk sesuai, tetap cocokkan dengan KTP' }
}
export const suratBaru = () => ({ pemberi: { nama: '', nik: '', pekerjaan: '', alamat: '', rtrw: '', kel: '', kec: '', kabkota: '', provinsi: '', kodepos: '', alamat_surat: '' }, pemberi_diedit: [], alamat_manual: false,
  penerima: [], jumlah_penerima: 2, layanan: 'apostille', dokumen: [{ jenis: '', nama: '', pemilik: '', tanggal: '', nomor: '' }], tempat: '', tanggal: '', meterai: true, status: 'draf', tpl_versi: TPL_VERSI, versi: 0 })

/** Yang wajib ada sebelum cetak/PDF. */
export function kekurangan(s) {
  const k = []
  if (!s.pemberi?.nama?.trim()) k.push('Nama pemberi kuasa')
  if (!s.pemberi?.nik?.trim()) k.push('NIK pemberi kuasa')
  if (!(s.pemberi?.alamat_surat || '').trim()) k.push('Alamat pemberi kuasa')
  const n = s.jumlah_penerima === 1 ? 1 : 2
  for (let i = 0; i < n; i++) if (!s.penerima?.[i]?.nama?.trim()) k.push(`Penerima kuasa ${i + 1}`)
  if (!(s.dokumen || []).some((d) => (d.nama || d.jenis || '').trim())) k.push('Minimal satu dokumen')
  if (!s.tempat?.trim()) k.push('Tempat penandatanganan')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.tanggal || '')) k.push('Tanggal surat')
  return k
}

// ---------- PDF ----------
const A4 = { w: 595.28, h: 841.89 }
const mm = (x) => x * 2.83465
/** Tangga penyesuaian (dicoba berurutan sampai muat). Batas bawah: isi 10 pt, tabel 9,5 pt, margin 15 mm. */
export const TANGGA = [
  { fs: 11, tfs: 10.5, lh: 1.32, gap: 9, pad: 3.6, m: mm(20), ttd: 64 },
  { fs: 11, tfs: 10.5, lh: 1.24, gap: 6.5, pad: 3, m: mm(20), ttd: 58 },
  { fs: 10.5, tfs: 10, lh: 1.22, gap: 5.5, pad: 2.6, m: mm(18), ttd: 54 },
  { fs: 10.5, tfs: 10, lh: 1.18, gap: 4.5, pad: 2.2, m: mm(16), ttd: 50 },
  { fs: 10, tfs: 9.5, lh: 1.16, gap: 4, pad: 2, m: mm(15), ttd: 48 },
]
const KOLOM = [0.06, 0.17, 0.27, 0.27, 0.23]
const KEPALA = ['No', 'Jenis Dokumen', 'Nama Dokumen', 'Pemilik Dokumen / Nama yang tertera pada dokumen', 'Tanggal/Nomor Dokumen']

function gambar(s, P, red) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true })
  const L = P.m, R = A4.w - P.m, W = R - L, bawah = A4.h - P.m
  let y = P.m; const tinggi = {}
  const lh = (fs) => fs * P.lh
  const set = (fs, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(fs) }
  const para = (t, { bold, align = 'justify', indent = 0, no } = {}) => { set(P.fs, bold); if (no) doc.text(no, L + indent - 18, y + P.fs * 0.8); const w = W - indent; const ls = doc.splitTextToSize(String(t), w); ls.forEach((l, i) => { const akhir = i === ls.length - 1; doc.text(l, L + indent, y + P.fs * 0.8, align === 'justify' && !akhir ? { align: 'justify', maxWidth: w } : {}); y += lh(P.fs) }) }
  const identitas = (o) => { const lab = 78, xv = L + lab + 8; for (const [k, v] of [['Nama', o.nama], ['Pekerjaan', o.pekerjaan], ['Alamat', o.alamat_surat ?? o.alamat], ['NIK', o.nik]]) { set(P.fs); doc.text(k, L, y + P.fs * 0.8); doc.text(':', L + lab, y + P.fs * 0.8); const ls = doc.splitTextToSize(String(v || '-'), R - xv); ls.forEach((l) => { doc.text(l, xv, y + P.fs * 0.8); y += lh(P.fs) }) } }
  const mulai = (k) => { tinggi[k] = -y }; const selesai = (k) => { tinggi[k] += y }

  // 1. Judul
  mulai('kepala'); set(14, true); doc.text('SURAT KUASA', A4.w / 2, y + 12, { align: 'center' }); y += 14 * 1.25 + P.gap
  // 2. Pemberi
  para(red.pembuka, { align: 'left' }); identitas(s.pemberi); y += P.gap; selesai('kepala')
  // 3-4. Penerima
  mulai('penerima'); para(red.kepada, { align: 'left' }); const n = s.jumlah_penerima === 1 ? 1 : 2
  for (let i = 0; i < n; i++) { identitas(s.penerima?.[i] || {}); if (i < n - 1) y += P.gap }
  y += P.gap * 0.6; selesai('penerima')
  // 5. KHUSUS (garis putus-putus seperti contoh)
  set(P.fs); const tw = doc.getTextWidth('KHUSUS'); const yc = y + P.fs * 0.5; doc.setLineWidth(0.7); doc.setLineDashPattern([4, 3], 0); doc.line(L, yc, A4.w / 2 - tw / 2 - 10, yc); doc.line(A4.w / 2 + tw / 2 + 10, yc, R, yc); doc.setLineDashPattern([], 0); doc.text('KHUSUS', A4.w / 2, y + P.fs * 0.8, { align: 'center' }); y += lh(P.fs) + P.gap * 0.6
  // 6. Tujuan
  mulai('paragraf'); para(isi(red.tujuan, s), { indent: 30, no: '1.' }); y += P.gap * 0.8; selesai('paragraf')
  // 7. Tabel
  mulai('tabel'); const xs = [L]; KOLOM.forEach((k) => xs.push(xs[xs.length - 1] + k * W)); doc.setLineWidth(0.5); doc.setDrawColor(60)
  const baris = (sel, bold, tengah) => { set(P.tfs, bold); const ls = sel.map((t, i) => doc.splitTextToSize(String(t || ''), xs[i + 1] - xs[i] - 2 * P.pad)); const h = Math.max(...ls.map((x) => x.length)) * P.tfs * 1.18 + 2 * P.pad
    ls.forEach((x, i) => { doc.rect(xs[i], y, xs[i + 1] - xs[i], h); const ty0 = tengah ? y + (h - x.length * P.tfs * 1.18) / 2 : y + P.pad; x.forEach((l, j) => { const ty = ty0 + j * P.tfs * 1.18 + P.tfs * 0.82; if (tengah || i === 0) doc.text(l, (xs[i] + xs[i + 1]) / 2, ty, { align: 'center' }); else doc.text(l, xs[i] + P.pad, ty) }) }); y += h }
  baris(KEPALA, true, true)
  const dok = (s.dokumen || []).filter((d) => [d.jenis, d.nama, d.pemilik, d.tanggal, d.nomor].some((v) => String(v || '').trim()))
  dok.forEach((d, i) => baris([`${i + 1}.`, d.jenis, d.nama, d.pemilik, tglNomor(d)]))
  y += P.gap; selesai('tabel')
  // 8-9. Wewenang & penutup
  tinggi.paragraf -= y; para(isi(red.wewenang, s), { indent: 30, no: '2.' }); y += P.gap; para(red.penutup, { indent: 30 }); y += P.gap * 0.6; tinggi.paragraf += y
  // 10. Tempat & tanggal
  mulai('ttd'); set(P.fs); doc.text(`${s.tempat || '..........'}, ${tglIndo(s.tanggal) || '..........'}`, R, y + P.fs * 0.8, { align: 'right' }); y += lh(P.fs) + P.gap * 0.5
  // 11. Tanda tangan
  const kol = n === 2 ? [['Penerima Kuasa 1', s.penerima?.[0]?.nama], ['Penerima Kuasa 2', s.penerima?.[1]?.nama], ['Pemberi Kuasa', s.pemberi?.nama]] : [['Penerima Kuasa', s.penerima?.[0]?.nama], ['Pemberi Kuasa', s.pemberi?.nama]]
  const cw = W / kol.length; let yMaks = y
  kol.forEach(([jab, nama], i) => { const cx = L + cw * i + cw / 2; let yy = y; set(P.fs); doc.text(jab, cx, yy + P.fs * 0.8, { align: 'center' }); yy += lh(P.fs) + P.ttd
    if (s.meterai && jab === 'Pemberi Kuasa') { doc.setFontSize(7.5); doc.setTextColor(150); doc.text('meterai', cx - cw / 2 + 14, yy - P.ttd / 2); doc.setTextColor(0) }
    set(P.fs); const ls = doc.splitTextToSize(String(nama || '(.....................)'), cw - 10); ls.forEach((l) => { doc.text(l, cx, yy + P.fs * 0.8, { align: 'center' }); yy += lh(P.fs) }); yMaks = Math.max(yMaks, yy) })
  y = yMaks; selesai('ttd')
  return { doc, yAkhir: y, bawah, tinggi, P }
}

/**
 * Bangun PDF satu halaman. → { muat, blob?, halaman, tingkat (0=ukuran normal), huruf, lebih (pt), sebab }
 * Bila muat=false, blob TIDAK dibuat untuk ekspor (hanya `pratinjau` untuk menunjukkan kelebihan).
 */
export function buatPdf(s, redaksi) {
  const red = { ...REDAKSI_BAWAAN, ...(redaksi || {}) }
  let r = null
  for (let i = 0; i < TANGGA.length; i++) { r = gambar(s, TANGGA[i], red); if (r.yAkhir <= r.bawah + 0.5) return { muat: true, blob: r.doc.output('blob'), halaman: r.doc.getNumberOfPages(), tingkat: i, huruf: TANGGA[i].fs, hurufTabel: TANGGA[i].tfs, sisa: Math.round(r.bawah - r.yAkhir) } }
  const t = r.tinggi, lebih = Math.round(r.yAkhir - r.bawah), nDok = (s.dokumen || []).length
  const sebab = []
  if (t.tabel > 0.34 * A4.h) sebab.push(`Tabel dokumen (${nDok} baris) memakai ±${Math.round(t.tabel / A4.h * 100)}% halaman — bagi daftar dokumen menjadi surat terpisah, atau persingkat nama dokumen.`)
  if (t.kepala + t.penerima > 0.36 * A4.h) sebab.push('Identitas (alamat/nama) sangat panjang — periksa alamat yang berulang atau terlalu rinci.')
  if (t.paragraf > 0.22 * A4.h) sebab.push('Redaksi paragraf panjang — persingkat lewat pengaturan template.')
  if (!sebab.length) sebab.push('Gabungan isi sedikit melebihi kapasitas — persingkat uraian dokumen atau bagi menjadi dua surat.')
  return { muat: false, halaman: 1, lebih, lebihBaris: Math.ceil(lebih / (TANGGA[TANGGA.length - 1].fs * 1.16)), sebab, pratinjau: r.doc.output('blob') }
}
export const namaFile = (s) => `Surat Kuasa - ${(s.pemberi?.nama || 'Tanpa Nama').replace(/[\\/:*?"<>|]/g, '-').trim()}${s.invoice_no ? ' - ' + s.invoice_no : ''}.pdf`
