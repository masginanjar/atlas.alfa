// ============================================================
//  MESIN IZIN — satu tempat untuk semua pemeriksaan hak akses di front-end.
//  Server memeriksa ulang dengan aturan yang sama (fungsi database app_izin) — UI hanya menyembunyikan.
//
//  Aturan:
//  1. Default deny: kode yang tidak diberikan = ditolak.
//  2. Izin dihitung untuk ROLE YANG SEDANG AKTIF (pengguna multi-role berganti peran lewat menu profil).
//     Izin antar-role TIDAK digabung → cakupan luas role A tidak menempel ke tindakan role B.
//  3. Pengecualian per pengguna: "larang" selalu menang; "izinkan" menambah dengan cakupannya sendiri;
//     boleh berbatas waktu (otomatis tidak berlaku setelah lewat).
//  4. Role nonaktif = tanpa akses.  Role sistem `superadmin` selalu punya semua izin.
//  5. Bila konfigurasi role belum ada (belum pernah diatur), dipakai aturan lama dari katalog (`konfigAsal`).
// ============================================================
import { setRoleTambahan, pasangIzin } from '../config/access.js'
import { FITUR, FIELD, AKSI, BUTUH_LIHAT, URUT_CAKUPAN, konfigAsal, pisahKode, RUTE_FITUR } from '../config/izin.js'

let ROLE = {}       // kode role → doc
let KECUALI = []    // daftar pengecualian
let versi = 0
const pendengar = new Set()

/** Dipanggil store setiap data akses berubah (realtime) → izin berlaku di permintaan berikutnya tanpa login ulang. */
export function setKonfigIzin(roles = [], pengecualian = []) {
  ROLE = Object.fromEntries(roles.filter((r) => !r.dihapus).map((r) => [r.kode || r.id, r]))
  KECUALI = pengecualian
  setRoleTambahan(roles.filter((r) => !r.dihapus))
  versi++; cache.clear()
  pendengar.forEach((f) => f(versi))
}
export const dengarIzin = (f) => { pendengar.add(f); return () => pendengar.delete(f) }
export const daftarRole = () => Object.values(ROLE)
export const roleDoc = (kode) => ROLE[kode] || null

const cache = new Map()
const sekarang = () => Date.now()
const berlaku = (k) => !k.sampai || new Date(k.sampai).getTime() > sekarang()

/** Konfigurasi role (tersimpan, atau aturan lama bila belum pernah diatur). */
export function konfigRole(kode) {
  const r = ROLE[kode]
  if (r) return r
  return { kode, ...konfigAsal(kode), aktif: true, _asal: true }
}

/**
 * Izin efektif sebuah kode untuk pengguna → { boleh, cakupan, cabang, sumber, alasan }.
 * `roleKode` opsional (simulasi "lihat sebagai role").
 */
export function izinEfektif(user, kode, roleKode) {
  if (!user && !roleKode) return { boleh: false, sumber: 'tidak login', alasan: 'Belum login' }
  const role = roleKode || user?.role
  const kunci = `${versi}|${user?.id || ''}|${role}|${kode}`
  if (cache.has(kunci)) return cache.get(kunci)
  const hasil = hitung(user, role, kode)
  cache.set(kunci, hasil)
  return hasil
}

function hitung(user, role, kode) {
  const [fitur, aksi] = pisahKode(kode)
  if (!FITUR[fitur] || !FITUR[fitur].aksi.includes(aksi)) return { boleh: false, sumber: 'katalog', alasan: `Kode izin "${kode}" tidak terdaftar di katalog → ditolak (default deny)` }
  // pengecualian pengguna (larang menang)
  const ex = user ? KECUALI.filter((k) => k.user_id === user.id && k.kode === kode && berlaku(k)) : []
  const larang = ex.find((k) => k.nilai === 'larang')
  if (larang) return { boleh: false, sumber: 'pengecualian', alasan: `Dilarang khusus untuk pengguna ini${larang.alasan ? ` (${larang.alasan})` : ''}${larang.sampai ? ` sampai ${larang.sampai.slice(0, 10)}` : ''}` }
  const izinkan = ex.find((k) => k.nilai === 'izinkan')
  if (role === 'superadmin') return { boleh: true, cakupan: 'semua', sumber: 'role', alasan: 'Role sistem Super Admin memiliki semua izin' }
  const r = konfigRole(role)
  if (r.aktif === false) return { boleh: false, sumber: 'role', alasan: `Role ${r.nama || role} sedang nonaktif` }
  const i = r.izin?.[kode]
  if (izinkan) return { boleh: true, cakupan: izinkan.cakupan || i?.cakupan || 'sendiri', cabang: izinkan.cabang, sumber: 'pengecualian', alasan: `Diizinkan khusus untuk pengguna ini${izinkan.sampai ? ` sampai ${izinkan.sampai.slice(0, 10)}` : ''}` }
  if (!i?.aktif) return { boleh: false, sumber: r._asal ? 'aturan lama' : 'role', alasan: `Role ${r.nama || role} tidak diberi izin "${AKSI[aksi]?.label || aksi}" pada ${FITUR[fitur].label}` }
  // dependensi: tindakan apa pun butuh "lihat" pada fitur yang sama
  if (BUTUH_LIHAT.includes(aksi) && FITUR[fitur].aksi.includes('lihat') && !r.izin?.[`${fitur}.lihat`]?.aktif) return { boleh: false, sumber: 'dependensi', alasan: `Butuh izin "Buka halaman & lihat data" pada ${FITUR[fitur].label}` }
  return { boleh: true, cakupan: aksi === 'menu' ? undefined : i.cakupan || 'cabang', cabang: i.cabang, sumber: r._asal ? 'aturan lama' : 'role', alasan: `Diberikan oleh role ${r.nama || role}` }
}

/** Pemeriksaan singkat. */
export const boleh = (user, kode) => izinEfektif(user, kode).boleh
/** Menu tampil? (visibilitas — terpisah dari akses data). */
export const menuTampil = (user, fitur) => boleh(user, `${fitur}.menu`)
/** Halaman boleh dibuka lewat rute (termasuk URL langsung)? */
export function halamanBoleh(user, page, sub) {
  const fitur = RUTE_FITUR[sub ? `${page}/${sub}` : page] || RUTE_FITUR[page]
  if (!fitur) return true // halaman tanpa fitur terdaftar (mis. profil sendiri) — tetap diatur aturan lama
  return boleh(user, `${fitur}.lihat`)
}

/** Cocokkan sebuah baris data dengan cakupan izin. `baris`: { cabang, dibuat_oleh, ditugaskan:[], tim, departemen } */
export function dalamCakupan(user, izin, baris) {
  if (!izin?.boleh) return false
  const c = izin.cakupan || 'sendiri'
  if (c === 'semua') return true
  if (c === 'cabang') return !baris?.cabang || [user?.branch, ...(user?.branches || [])].includes(baris.cabang)
  if (c === 'cabang_pilihan') return !baris?.cabang || (izin.cabang || []).includes(baris.cabang)
  if (c === 'departemen') return !!user?.departemen && baris?.departemen === user.departemen
  if (c === 'tim') return !!user?.tim && baris?.tim === user.tim
  if (c === 'ditugaskan') return (baris?.ditugaskan || []).includes(user?.id) || baris?.dibuat_oleh === user?.id
  return baris?.dibuat_oleh === user?.id
}
export const lebihLuas = (a, b) => URUT_CAKUPAN.indexOf(a) > URUT_CAKUPAN.indexOf(b)

/** Tingkat akses field sensitif: 'sembunyi' | 'samar' | 'lihat' | 'edit'. */
export function aksesField(user, fieldId, roleKode) {
  if (!FIELD[fieldId]) return 'sembunyi'
  const role = roleKode || user?.role
  if (role === 'superadmin') return 'edit'
  const r = konfigRole(role)
  if (r.aktif === false) return 'sembunyi'
  return r.field?.[fieldId] || 'sembunyi'
}
/** Tampilkan nilai field sesuai tingkat akses. */
export function nilaiField(user, fieldId, nilai) {
  const t = aksesField(user, fieldId)
  if (t === 'sembunyi') return null
  if (t === 'samar') { const s = String(nilai ?? ''); return s.length <= 4 ? '••••' : `${'•'.repeat(Math.min(6, s.length - 3))}${s.slice(-3)}` }
  return nilai
}

// Hubungkan `can.*` (config/access.js) ke mesin izin ini.
pasangIzin({ boleh, aksesField })
