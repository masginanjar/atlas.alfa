// ============================================================
//  BACA KTP untuk Surat Kuasa — AI (Gemini, model dipilih di Pengaturan → AI) bila aktif; selain itu Tesseract di perangkat.
//  Tidak memakai kuota Google Vision. Mesin yang dipakai selalu ditampilkan (tidak pernah berganti diam-diam).
//  + modul pemetaan ocr-core.js yang sama dengan Smart Translator.
//  Tidak ada isi KTP yang ditulis ke log.
// ============================================================

import { aiJalan, kanvasKeJpeg } from './ai.js'

const BASE = 'smart-translator/'
const muat = (src) => new Promise((res, rej) => { if (document.querySelector(`script[data-src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.dataset.src = src; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat ' + src)); document.head.appendChild(s) })
const b64bytes = (b) => { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u }

/** File gambar / PDF (halaman 1) → canvas resolusi asli (maks 4000 px). */
export async function keKanvas(blob, nama = '') {
  if (/pdf/i.test(blob.type) || /\.pdf$/i.test(nama)) {
    await muat(BASE + 'vendor/pdf.min.js'); const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = BASE + 'vendor/pdf.worker.min.js'
    const pdf = await lib.getDocument({ data: await blob.arrayBuffer() }).promise; const pg = await pdf.getPage(1); const v0 = pg.getViewport({ scale: 1 }); const v = pg.getViewport({ scale: Math.min(3, 2400 / Math.max(v0.width, v0.height)) })
    const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height); await pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise; return c
  }
  const url = URL.createObjectURL(blob)
  try { const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Gambar tidak bisa dibuka')); i.src = url })
    const k = Math.min(1, 4000 / Math.max(im.naturalWidth, im.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c
  } finally { URL.revokeObjectURL(url) }
}

let pekerja = null
async function viaTesseract(c) {
  if (!pekerja) pekerja = (async () => { await Promise.all([muat(BASE + 'vendor/tesseract.min.js'), muat(BASE + 'vendor/lang-ind.js'), muat(BASE + 'vendor/lang-eng.js')]); const langs = ['ind', 'eng'].map((k) => ({ code: k, data: b64bytes(window.__ST_LANG[k]) })); return window.Tesseract.createWorker(langs, 1, { workerPath: BASE + 'vendor/worker.min.js', corePath: BASE + 'vendor/', workerBlobURL: false }) })().catch((e) => { pekerja = null; throw e })
  const w = await pekerja; const { data } = await w.recognize(c, {}, { text: true, blocks: true })
  let ln = 0; const kata = []; for (const bl of data.blocks || []) for (const pa of bl.paragraphs || []) for (const l of pa.lines || []) { ln++; for (const x of l.words || []) if (x.text?.trim()) kata.push({ t: x.text, c: x.confidence, s: null, ln, q: [x.bbox.x0, x.bbox.y0, x.bbox.x1, x.bbox.y0, x.bbox.x1, x.bbox.y1, x.bbox.x0, x.bbox.y1] }) }
  return kata
}

const PETA = { nama: 'nama', nik: 'nik', pekerjaan: 'kerja', alamat: 'alamat', rtrw: 'rtrw', kel: 'kel', kec: 'kec', kabkota: 'kabkota', provinsi: 'provinsi' }
const AMBANG = { vision: 90, tesseract: 75 }
/**
 * Baca KTP → { mesin, catatan, nilai: {kolom: {v, perlu_cek, alasan}}, kanvas }
 * Hanya kolom yang dibutuhkan surat. Tidak menebak: kolom tak terbaca dibiarkan kosong.
 */
export async function bacaKtp(blob, nama) {
  await muat(BASE + 'ocr-core.js'); const C = window.OCRCORE
  const kanvas = await keKanvas(blob, nama)
  // Keputusan pemilik (15 Nov 2026): Surat Kuasa memakai AI hemat (Gemini) — tidak memakai kuota Google Vision. Cadangan: Tesseract di perangkat.
  let catatan = ''
  const ai = await aiJalan('surat_kuasa', kanvasKeJpeg(kanvas, 2000))
  if (ai.ok && ai.data) {
    const d = ai.data, ragu = new Set(Array.isArray(d.ragu) ? d.ragu : []), out = {}
    for (const [k, sumber] of Object.entries(PETA)) {
      const v = String(d[sumber] ?? '').trim() // apa adanya — tidak "dirapikan"
      if (!v) { out[k] = { v: '', perlu_cek: true, alasan: 'Tidak terbaca — isi manual dari KTP' }; continue }
      const val = C.validasi(sumber, v)
      out[k] = { v, perlu_cek: !val.ok || ragu.has(sumber), alasan: !val.ok ? val.alasan : ragu.has(sumber) ? 'AI ragu pada kolom ini — cocokkan dengan KTP' : '' }
    }
    if (!/ktp/i.test(String(d.jenis || ''))) catatan = `Berkas ini tidak dikenali sebagai KTP (${String(d.jenis || 'jenis tidak jelas').slice(0, 40)}).`
    return { mesin: 'gemini', mesinLabel: `AI ${ai.modelLabel || 'Gemini'}`, catatan, nilai: out, kanvas }
  }
  if (!ai.demo && !ai.mati) catatan = `AI tidak dipakai (${ai.alasan || 'gagal'}) — dibaca dengan Tesseract di perangkat, akurasi lebih rendah.`
  const mesin = 'tesseract'
  const kata = await viaTesseract(kanvas)
  const { nilai } = C.petakanKTP(C.barisDariKata(kata, mesin).lines)
  const out = {}
  for (const [k, sumber] of Object.entries(PETA)) {
    const o = nilai[sumber]; if (!o) { out[k] = { v: '', perlu_cek: true, alasan: 'Tidak terbaca — isi manual dari KTP' }; continue }
    const v = C.validasi(sumber, o.v); const rendah = o.conf != null && o.conf < AMBANG[mesin]
    out[k] = { v: o.v, perlu_cek: !v.ok || rendah, alasan: !v.ok ? v.alasan : rendah ? 'Skor OCR rendah — cocokkan dengan KTP' : '' }
  }
  const jenis = C.deteksiJenis(kata.map((x) => x.t).join(' '))
  if (jenis.nama !== 'KTP') catatan = `${catatan ? catatan + ' ' : ''}Berkas ini tidak dikenali sebagai KTP (${jenis.nama}).`
  return { mesin, mesinLabel: 'Tesseract (di perangkat ini)', catatan, nilai: out, kanvas }
}
