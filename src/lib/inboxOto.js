// ============================================================
//  INBOX OTORISASI — data bersama (dipakai halaman Inbox, lencana angka di menu, dan pemeriksa latar).
//  • LIVE: fungsi server `email-inbox` (baca-saja; hanya email dari otorisator terdaftar / alamat tes).
//  • DEMO: balasan CONTOH dari email yang disimulasikan.
//  • "Perlu ditangani" (angka di menu) = lampiran belum disimpan · balasan "OK" yang belum di-ACC · balasan lain yang belum dibuka.
// ============================================================
import { useSyncExternalStore } from 'react'
import { db, MODE } from './db.js'
import { SUPABASE_URL } from './supabase.js'

export const INBOX_LIVE = MODE === 'supabase'
export const digit = (v) => String(v || '').replace(/\D/g, '')
/** Buang sisa kepala kutipan ("Pada … <alamat>\nmenulis:" / "On … wrote:") yang terpotong dua baris di ujung isi balasan. */
export const tanpaKepalaKutipan = (t) => String(t || '').replace(/\n*^(Pada|On)\b[^\n]*(\n[^\n]*){0,2}?(menulis|wrote):?\s*$[\s\S]*/im, '').trim()

export async function panggilInbox(aksi, body = {}) {
  try {
    const token = await db.token?.()
    if (!token) return { ok: false, alasan: 'Sesi berakhir — silakan masuk ulang' }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/email-inbox`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ aksi, ...body }) })
    return await r.json().catch(() => ({ ok: false, alasan: `Server ${r.status}` }))
  } catch { return { ok: false, alasan: 'Koneksi ke server gagal — periksa internet' } }
}
/** Demo: satu balasan contoh per project yang emailnya pernah disimulasikan. Simulasi ke-2, ke-4, … dibalas "OK" (tanpa lampiran). */
const inboxDemo = (projects) => (projects || []).filter((p) => (p.email_oto || []).length).map((p) => { const n = p.email_oto.length, e = p.email_oto[n - 1]; const inv = digit(p.invoice_no); const ok = n % 2 === 0; return {
  uid: `demo-${p.id}-${n}`, oto_id: e.oto_id || '', dari: e.oto_nama || 'Otorisator', tes: true, subjek: `Re: ${e.subjek}`, tanggal: new Date(+new Date(e.at) + 3600e3).toISOString(), invoice: [inv],
  cuplikan: ok ? 'OK' : 'Selamat siang, dokumen sudah saya periksa dan otorisasi. Hasilnya terlampir.\n\nTerima kasih.',
  lampiran: ok ? [] : [{ part: '2', nama: `Hasil otorisasi ${inv} (contoh sintetis).txt`, ukuran: 74, mime: 'text/plain' }, { part: '3', nama: `Lampiran kedua ${inv} (contoh sintetis).txt`, ukuran: 74, mime: 'text/plain' }, { part: '4', nama: `Lampiran ketiga ${inv} (contoh sintetis).txt`, ukuran: 74, mime: 'text/plain' }] } })

// ---- penyimpanan bersama ----
const K_DIBACA = 'atlas-inbox-oto-dibaca'
let st = { muat: false, data: null, galat: '', mode_tes: false, bisa_ambil: false, at: '', dibaca: bacaDibaca() }
const dengar = new Set()
const set = (p) => { st = { ...st, ...p }; dengar.forEach((f) => f()) }
export const useInboxOto = () => useSyncExternalStore((f) => { dengar.add(f); return () => dengar.delete(f) }, () => st)
export const getInboxOto = () => st
let berjalan = null
/** Ambil daftar balasan. Panggilan bersamaan digabung jadi satu. */
export function cekInbox(projects) {
  if (berjalan) return berjalan
  set({ muat: true, galat: '' })
  berjalan = (async () => {
    const r = INBOX_LIVE ? await panggilInbox('inbox') : { ok: true, data: inboxDemo(projects), mode_tes: true, bisa_ambil: true, dicek_at: new Date().toISOString() }
    if (r.ok) for (const m of r.data || []) m.cuplikan = tanpaKepalaKutipan(m.cuplikan)
    set({ muat: false, data: r.ok ? r.data || [] : st.data, galat: r.ok ? '' : r.alasan || 'Gagal memuat inbox', mode_tes: !!r.mode_tes, bisa_ambil: !!r.bisa_ambil, at: r.dicek_at || st.at })
    return r
  })().finally(() => { berjalan = null })
  return berjalan
}
// balasan tanpa lampiran & bukan "OK": dianggap sudah ditangani setelah barisnya dibuka (dicatat di perangkat ini)
function bacaDibaca() { try { return new Set(JSON.parse(localStorage.getItem(K_DIBACA) || '[]')) } catch { return new Set() } }
export function tandaiDibaca(uid) { const n = new Set(st.dibaca); if (n.has(String(uid))) return; n.add(String(uid)); try { localStorage.setItem(K_DIBACA, JSON.stringify([...n].slice(-300))) } catch { /* penuh: abaikan */ } set({ dibaca: n }) }

export function tandaiSemuaDibaca(uids) { const n = new Set(st.dibaca); for (const u of uids) n.add(String(u)); try { localStorage.setItem(K_DIBACA, JSON.stringify([...n].slice(-300))) } catch { /* penuh: abaikan */ } set({ dibaca: n }) }
/** Balasan yang isinya hanya "OK" (ok / Ok / OK / oke / okay), tanpa lampiran. Baris penutup umum (terima kasih, salam, tanda tangan ponsel) diabaikan.
 *  "OK tapi …" atau baris lain apa pun → BUKAN balasan OK (harus dibaca manusia). */
export function balasanOk(m) {
  if ((m?.lampiran || []).length) return false
  const baris = String(m?.cuplikan || '').split('\n').map((x) => x.trim()).filter(Boolean)
  if (!baris.length || baris.length > 6) return false
  const polos = (x) => x.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!/^(ok|oke|okay|okey)$/.test(polos(baris[0]))) return false
  return baris.slice(1).every((x) => /^(terima kasih|terimakasih|trims|makasih|thanks|thank you|salam|regards|best regards|hormat saya|sent from|dikirim dari|get outlook|--)/i.test(polos(x) || x) || polos(x) === '')
}
const petaProject = (projects) => new Map((projects || []).filter((p) => !p.cancelled).map((p) => [digit(p.invoice_no), p]))
export const projectPesan = (m, peta, manual) => (m.invoice || []).map((i) => peta.get(i)).find(Boolean) || (manual ? peta.get(digit(manual)) : null) || null
export const lampiranTersimpan = (p, m, l) => (p?.email_oto_balasan || []).some((x) => String(x.uid) === String(m.uid) && x.part === l.part)
export const sudahAcc = (p, m) => (p?.email_oto_balasan || []).some((x) => String(x.uid) === String(m.uid) && x.acc)
/** Apakah balasan ini masih perlu ditangani (dipakai untuk angka di menu & titik biru di tabel). */
export function perluTindakan(m, p, dibaca) {
  const L = m.lampiran || []
  if (L.length) return L.some((l) => !lampiranTersimpan(p, m, l))
  if (balasanOk(m)) return !sudahAcc(p, m) && !(dibaca || st.dibaca).has(String(m.uid)) || (!sudahAcc(p, m) && !!p && (p.sub_projects || []).some((s) => s.stage === 'otorisasi' && !s.cancelled))
  return !(dibaca || st.dibaca).has(String(m.uid))
}
export function jumlahInboxOto(pesan, projects, dibaca) {
  if (!pesan?.length) return 0
  const peta = petaProject(projects); return pesan.filter((m) => perluTindakan(m, projectPesan(m, peta), dibaca)).length
}
export { petaProject }
