// ============================================================
//  Jembatan fitur AI (Gemini) ↔ server (fungsi gemini-ai).
//  LIVE: semua panggilan lewat server; kunci Gemini tidak pernah di browser. Model per fitur dipilih di Pengaturan → AI.
//  DEMO: tidak ada panggilan AI (tidak ada server) — pengaturan disimpan di perangkat, pembacaan memakai cara cadangan.
// ============================================================
import { db, MODE } from './db.js'
import { SUPABASE_URL } from './supabase.js'

export const AI_LIVE = MODE === 'supabase'
export const TINGKAT = { hemat: 'Hemat', menengah: 'Menengah', bagus: 'Bagus' }
/** Salinan tampilan (harga USD per 1 juta token masuk/keluar). Sumber kebenaran ada di server. */
export const KATALOG_CONTOH = [
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', tingkat: 'hemat', masuk: 0.25, keluar: 1.5 },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', tingkat: 'hemat', masuk: 0.3, keluar: 2.5 },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', tingkat: 'menengah', masuk: 0.5, keluar: 3 },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', tingkat: 'menengah', masuk: 0.75, keluar: 3.75 },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', tingkat: 'bagus', masuk: 2, keluar: 12 },
]
export const FITUR_AI = [
  { id: 'penerjemah', label: 'Smart Translator', ket: 'Pembaca kedua untuk dokumen di Smart Translator. Hasilnya dibandingkan dengan Google Vision; yang berbeda ditandai untuk dicek.', tanpa: 'Tanpa AI (Google Vision / Tesseract saja)', token: [1300, 4000] },
  { id: 'surat_kuasa', label: 'Surat Kuasa — baca KTP', ket: 'Mengisi identitas pemberi kuasa dari foto KTP.', tanpa: 'Tanpa AI (Tesseract, gratis)', token: [1300, 320] },
  { id: 'spesimen', label: 'Pemisah Spesimen', ket: 'Membaca data pejabat penanda tangan dan letak tanda tangan / paraf / stempel, serta mencari alamat kantor instansi di internet.', tanpa: 'Tanpa AI (isi & potong manual)', token: [1500, 700] },
  { id: 'bukti', label: 'Bukti transfer massal', ket: 'Membaca screenshot daftar transfer internet banking.', tanpa: 'Tanpa AI (Tesseract, gratis)', token: [1250, 900] },
]
const BAWAAN = () => ({ kurs: 17000, fitur: { penerjemah: { model: 'gemini-3-flash-preview', batas_rp: 100000 }, surat_kuasa: { model: 'gemini-3.5-flash-lite', batas_rp: 50000 }, bukti: { model: 'gemini-3.5-flash-lite', batas_rp: 50000, otomatis: true }, spesimen: { model: 'gemini-3.1-pro-preview', batas_rp: 300000 } } })
const KUNCI_DEMO = 'atlas_ai_demo'
const demoBaca = () => { try { const s = JSON.parse(localStorage.getItem(KUNCI_DEMO) || 'null'); const b = BAWAAN(); return s ? { kurs: s.kurs || b.kurs, fitur: Object.fromEntries(Object.keys(b.fitur).map((k) => [k, { ...b.fitur[k], ...(s.fitur?.[k] || {}) }])) } : b } catch { return BAWAAN() } }

async function panggil(aksi, body) {
  try {
    const token = await db.token?.()
    if (!token) return { ok: false, alasan: 'Sesi berakhir — silakan masuk ulang' }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/gemini-ai`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ aksi, ...body }) })
    const x = await r.json().catch(() => ({ ok: false, alasan: `Server ${r.status}` }))
    if (r.status === 401) return { ok: false, alasan: 'Sesi berakhir — silakan masuk ulang' }
    return x
  } catch { return { ok: false, cadangan: true, alasan: 'Koneksi ke server AI gagal — periksa internet' } }
}

/** Pengaturan + pemakaian bulan ini. Bukan pengatur → hanya { fitur: { id: { model, otomatis } } }. */
export async function aiInfo() {
  if (!AI_LIVE) { const s = demoBaca(); return { ok: true, demo: true, aktif: false, atur: true, setelan: s, pakai: {}, katalog: KATALOG_CONTOH, fitur: Object.fromEntries(Object.entries(s.fitur).map(([k, f]) => [k, { model: f.model, otomatis: f.otomatis ?? null }])) } }
  const r = await panggil('info', {})
  if (r.ok && r.setelan && !r.fitur) r.fitur = Object.fromEntries(Object.entries(r.setelan.fitur).map(([k, f]) => [k, { model: f.model, otomatis: f.otomatis ?? null }]))
  return r
}
export async function aiAtur(patch) {
  if (!AI_LIVE) { const s = demoBaca(); if (patch.kurs != null) s.kurs = Math.round(Number(patch.kurs)); for (const [k, v] of Object.entries(patch.fitur || {})) s.fitur[k] = { ...s.fitur[k], ...v }; localStorage.setItem(KUNCI_DEMO, JSON.stringify(s)); return { ok: true, setelan: s } }
  return panggil('atur', patch)
}
/** Jalankan AI untuk satu gambar (data URL JPG/PNG). Gagal/dimatikan/batas tercapai → { ok:false, cadangan:true, alasan }. */
export async function aiJalan(fitur, gambar) {
  if (!AI_LIVE) return { ok: false, cadangan: true, demo: true, alasan: 'AI hanya berjalan di ATLAS live — demo memakai pembaca di perangkat' }
  return panggil('jalan', { fitur, gambar })
}
/** Pemisah Spesimen: baca pejabat + kotak tanda tangan/paraf/stempel dari satu halaman (data URL JPG/PNG). */
export async function aiSpesimen(gambar) {
  if (!AI_LIVE) return { ok: false, cadangan: true, demo: true, alasan: 'AI hanya berjalan di ATLAS live' }
  return panggil('jalan', { fitur: 'spesimen', gambar })
}
/** Pemisah Spesimen: cari alamat KANTOR instansi di internet (hanya nama instansi & lokasi yang dikirim). */
export async function aiCariAlamat(instansi, lokasi = '') {
  if (!AI_LIVE) return { ok: false, demo: true, alasan: 'Pencarian hanya berjalan di ATLAS live' }
  return panggil('jalan', { fitur: 'spesimen', tugas: 'alamat', instansi, lokasi })
}
/** Canvas → data URL JPEG yang cukup kecil untuk dikirim (sisi terpanjang ≤ maks px). */
export function kanvasKeJpeg(c, maks = 2200, mutu = 0.9) {
  const k = Math.min(1, maks / Math.max(c.width, c.height)); let s = c
  if (k < 1) { s = document.createElement('canvas'); s.width = Math.round(c.width * k); s.height = Math.round(c.height * k); const g = s.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, s.width, s.height) }
  return s.toDataURL('image/jpeg', mutu)
}
/** Perkiraan biaya satu dokumen (rupiah) untuk model & fitur — angka kasar dari jumlah token rata-rata hasil uji. */
export const kiraBiaya = (m, f, kurs) => (m && f ? ((f.token[0] * m.masuk + f.token[1] * m.keluar) / 1e6) * kurs : 0)
