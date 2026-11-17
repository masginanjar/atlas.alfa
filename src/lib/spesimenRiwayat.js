// ============================================================
//  Riwayat dokumen Pemisah Spesimen (file Word yang sudah dibuat).
//  LIVE: disimpan di server lewat fungsi `spesimen-riwayat` (tabel spesimen_riwayat tertutup; izin diperiksa di server).
//  DEMO: disimpan di perangkat ini saja (localStorage), maksimal 8 dokumen.
// ============================================================
import { db, MODE } from './db.js'
import { SUPABASE_URL } from './supabase.js'

export const RIWAYAT_LIVE = MODE === 'supabase'
const KUNCI = 'atlas-spesimen-riwayat'
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const MAKS_RIWAYAT_BYTE = 6 * 1024 * 1024
const keB64 = (blob) => new Promise((ok, gagal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => gagal(new Error('gagal membaca file')); r.readAsDataURL(blob) })
const dariB64 = (s) => { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type: MIME }) }
const bacaDemo = () => { try { return JSON.parse(localStorage.getItem(KUNCI) || '[]') } catch { return [] } }

async function panggil(aksi, body = {}) {
  try {
    const token = await db.token?.()
    if (!token) return { ok: false, alasan: 'Sesi berakhir — silakan masuk ulang' }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/spesimen-riwayat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ aksi, ...body }) })
    return await r.json().catch(() => ({ ok: false, alasan: `Server ${r.status}` }))
  } catch { return { ok: false, alasan: 'Koneksi ke server gagal — periksa internet' } }
}
const ringkas = (daftar) => daftar.map((p) => ({ nama: String(p.nama || '').trim().slice(0, 160), jabatan: String(p.jabatan || '').trim().slice(0, 200), instansi: String(p.instansi || '').trim().slice(0, 200) }))

/** Simpan file Word yang baru dibuat. Mengembalikan { ok, alasan? } — "tersimpan" hanya bila server/perangkat benar-benar menyimpan. */
export async function riwayatSimpan({ blob, nama_file, daftar, user }) {
  if (blob.size > MAKS_RIWAYAT_BYTE) return { ok: false, alasan: 'File lebih dari 6 MB — tidak disimpan ke riwayat' }
  const berkas = await keB64(blob); const pejabat = ringkas(daftar)
  if (RIWAYAT_LIVE) return panggil('simpan', { nama_file, pejabat, berkas })
  const baru = { id: `r${Date.now().toString(36)}`, dibuat_at: new Date().toISOString(), user_id: user?.id || '', user_nama: user?.name || '', nama_file, pejabat, ukuran: blob.size, berkas }
  let list = [baru, ...bacaDemo()].slice(0, 8)
  for (;;) {
    try { localStorage.setItem(KUNCI, JSON.stringify(list)); return { ok: true } } catch { if (list.length <= 1) return { ok: false, alasan: 'Penyimpanan perangkat penuh — riwayat tidak tersimpan' }; list = list.slice(0, -1) }
  }
}
/** Daftar riwayat tanpa isi file. semua=true hanya berlaku bila server mengizinkan (pemisah-spesimen.kelola). */
export async function riwayatDaftar(user, semua) {
  if (RIWAYAT_LIVE) return panggil('daftar')
  return { ok: true, data: bacaDemo().filter((x) => semua || x.user_id === (user?.id || '')).map(({ berkas, ...x }) => x) }
}
export async function riwayatBerkas(id) {
  if (RIWAYAT_LIVE) { const r = await panggil('unduh', { id }); return r.ok ? { ok: true, blob: dariB64(r.berkas), nama_file: r.nama_file } : r }
  const x = bacaDemo().find((y) => y.id === id); return x ? { ok: true, blob: dariB64(x.berkas), nama_file: x.nama_file } : { ok: false, alasan: 'Dokumen tidak ditemukan' }
}
export async function riwayatHapus(id) {
  if (RIWAYAT_LIVE) return panggil('hapus', { id })
  try { localStorage.setItem(KUNCI, JSON.stringify(bacaDemo().filter((y) => y.id !== id))); return { ok: true } } catch { return { ok: false, alasan: 'Gagal menghapus' } }
}
