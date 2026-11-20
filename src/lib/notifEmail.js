// ============================================================
//  EMAIL NOTIFIKASI TUGAS — sisi browser.
//  • Saat sebuah sub project terjemahan DITETAPKAN ke penerjemah internal (baru / ganti penerjemah),
//    penerjemah itu mendapat email "Tugas baru" — hanya bila tombol di akunnya dinyalakan admin
//    (user.notif_email_aktif === true) dan alamat "Email notifikasi"-nya terisi.
//  • Browser hanya memberi tahu server "project ini, sub ini". Server (fungsi notif-email) yang membaca
//    data project, menentukan penerima, menyusun isi, dan mengirim lewat Resend. Kunci Resend tidak pernah ada di browser.
//  • Isi email: No Invoice, judul dokumen, jumlah dokumen & halaman, arah bahasa, prioritas, deadline, tombol buka ATLAS.
//    TANPA lampiran dan TANPA data pribadi pelanggan (nama pelanggan tidak ditulis).
//  • DEMO: tidak ada email yang benar-benar dikirim — hanya pratinjau.
// ============================================================
import { db, MODE } from './db.js'
import { SUPABASE_URL } from './supabase.js'

export const NOTIF_LIVE = MODE === 'supabase'
export const ALAMAT_ATLAS = 'https://app.247translator.id'
export const PENGIRIM_NOTIF = 'ATLAS 247 <notifikasi@247translator.id>'
export const EMAIL_SAH = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i
export const notifEmailAktif = (u) => u?.notif_email_aktif === true && EMAIL_SAH.test(String(u?.notif_email || '').trim())

/** Penerjemah internal yang SEDANG memegang sub project ini (tahap Penerjemahan). Di tahap lain = belum / sudah bukan tugasnya. */
const pemegang = (s) => (s?.stage === 'penerjemahan' && (s?.translator_kind || 'translator') === 'translator' ? String(s?.translator || s?.data?.translator || '') : '')

/**
 * Sub project yang baru masuk ke tangan seorang penerjemah internal pada simpanan ini → [{ sub_id, translator }].
 * Mencakup: project baru dengan penerjemah terisi, "Tetapkan Penerjemah", dan ganti penerjemah.
 * Server menyaring ulang & mencegah email ganda untuk pasangan project–sub–penerjemah yang sama.
 */
export function penugasanBaru(prev, saved, olehId = '') {
  if (saved?.dummy) return []
  const lama = new Map((prev?.sub_projects || []).map((s) => [s.id, pemegang(s)]))
  return (saved?.sub_projects || [])
    .map((s) => ({ sub_id: s.id, translator: pemegang(s) }))
    .filter((x) => x.translator && x.translator !== olehId && lama.get(x.sub_id) !== x.translator)
}

async function panggil(aksi, body) {
  try {
    const token = await db.token?.()
    if (!token) return { ok: false, alasan: 'Sesi berakhir — silakan masuk ulang' }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/notif-email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ aksi, ...body }) })
    const x = await r.json().catch(() => ({ ok: false, alasan: `Server ${r.status}` }))
    if (r.status === 401) return { ok: false, alasan: 'Sesi berakhir — silakan masuk ulang' }
    return x
  } catch { return { ok: false, alasan: 'Koneksi ke server gagal — periksa internet lalu coba lagi' } }
}

/**
 * Dipanggil setelah project tersimpan. Tidak pernah menggagalkan simpanan: kegagalan email hanya dikembalikan sebagai hasil.
 * → { ok, terkirim: n, dilewati: n } · demo: { ok, demo: true, terkirim: n }
 */
export async function kirimNotifTugas(project, tugas, users = []) {
  if (!tugas?.length) return { ok: true, terkirim: 0 }
  if (!NOTIF_LIVE) {
    const n = tugas.filter((t) => notifEmailAktif(users.find((u) => u.id === t.translator))).length
    return { ok: true, demo: true, terkirim: n }
  }
  // Hemat panggilan: bila tidak satu pun penerima menyalakan notifikasi, server tidak dipanggil.
  if (users.length && !tugas.some((t) => notifEmailAktif(users.find((u) => u.id === t.translator)))) return { ok: true, terkirim: 0 }
  return panggil('tugas', { project_id: project.id, sub_ids: tugas.map((t) => t.sub_id) })
}

/** Email CONTOH (data buatan) ke alamat notifikasi satu akun — untuk memastikan alamatnya benar. Hanya admin pengelola pengguna. */
export async function kirimEmailContoh(userId) {
  if (!NOTIF_LIVE) return { ok: true, demo: true }
  return panggil('contoh', { user_id: userId })
}
