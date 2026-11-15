// Aturan pengelolaan Role & Hak Akses (dipakai halaman pengaturan).
// Server memeriksa ulang aturan yang sama (trigger/fungsi database) — ini lapis UI.
import { ROLES } from '../config/access.js'
import { MODUL, FITUR, FIELD, AKSI, AKSI_SENSITIF, CAKUPAN, TINGKAT_FIELD, konfigAsal, pisahKode, KODE_INTI } from '../config/izin.js'
import { boleh, konfigRole, daftarRole } from './izin.js'

export const ROLE_SISTEM = 'superadmin'
export const DESKRIPSI_BAWAAN = {
  superadmin: 'Pemilik sistem. Semua izin, termasuk mengelola role. Tidak bisa diubah atau dihapus.',
  admin_pusat: 'Admin kantor pusat — operasional semua cabang.',
  supervisor: 'Akun tugas direktur (label "Direktur").',
  direktur: 'Pimpinan — persetujuan & laporan.',
  cs: 'CS cabang — operasional cabang sendiri.',
  akunting: 'Keuangan & persetujuan pembayaran.',
  penerjemah: 'Pelaksana lepas — hanya tugas yang ditugaskan.',
  proofreader: 'Pelaksana lepas — proofread tugas yang ditugaskan.',
  otorisator: 'Pelaksana — otorisasi dokumen.',
  staf_apostille: 'Staf proses apostille & legalisasi.',
  helper: 'Membantu CS & staf apostille di cabangnya sendiri.',
}

/** Semua role (bawaan + buatan), lengkap dengan konfigurasi efektif. */
export function semuaRoleLengkap() {
  const simpan = Object.fromEntries(daftarRole().map((r) => [r.kode, r]))
  const bawaan = Object.keys(ROLES).map((k) => ({ kode: k, nama: ROLES[k].label, deskripsi: DESKRIPSI_BAWAAN[k] || '', aktif: true, bawaan: true, sistem: k === ROLE_SISTEM, ...konfigRole(k), ...(simpan[k] || {}), kode: k }))
  const buatan = Object.values(simpan).filter((r) => !ROLES[r.kode]).map((r) => ({ ...r, bawaan: false }))
  return [...bawaan, ...buatan]
}

export const slugKode = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
export const penggunaRole = (users, kode) => (users || []).filter((u) => u.role === kode || (u.extra_roles || []).includes(kode))
export const superadminAktif = (users) => (users || []).filter((u) => u.active !== false && u.role === ROLE_SISTEM)

/** Boleh mengelola role? */
export const bolehKelola = (user) => boleh(user, 'pengaturan.role.kelola')
/** Penyunting bukan Super Admin hanya boleh memberi izin yang ia miliki sendiri (anti eskalasi). */
export const bolehBeri = (user, kode) => user?.role === ROLE_SISTEM || (boleh(user, kode) && !KODE_INTI.includes(kode))

/** Selisih dua konfigurasi → daftar perubahan yang mudah dibaca. */
export function selisih(lama, baru) {
  const out = []
  const kode = new Set([...Object.keys(lama.izin || {}), ...Object.keys(baru.izin || {})])
  for (const k of kode) {
    const a = lama.izin?.[k], b = baru.izin?.[k]
    const [fitur, aksi] = pisahKode(k)
    const label = `${FITUR[fitur]?.label || fitur} · ${AKSI[aksi]?.label || aksi}`
    if (!!a?.aktif !== !!b?.aktif) out.push({ kode: k, jenis: b?.aktif ? 'tambah' : 'cabut', label, sensitif: !!b?.aktif && (AKSI_SENSITIF.includes(aksi) || KODE_INTI.includes(k)), teks: b?.aktif ? `Diberi: ${label}${b.cakupan ? ` (${CAKUPAN[b.cakupan]})` : ''}` : `Dicabut: ${label}` })
    else if (a?.aktif && b?.aktif && (a.cakupan !== b.cakupan || String(a.cabang || '') !== String(b.cabang || ''))) out.push({ kode: k, jenis: 'cakupan', label, sensitif: b.cakupan === 'semua', teks: `Cakupan ${label}: ${CAKUPAN[a.cakupan] || '-'} → ${CAKUPAN[b.cakupan] || '-'}${b.cabang?.length ? ` (${b.cabang.join(', ')})` : ''}` })
  }
  for (const f of Object.keys(FIELD)) {
    const a = lama.field?.[f] || 'sembunyi', b = baru.field?.[f] || 'sembunyi'
    if (a !== b) out.push({ kode: `field:${f}`, jenis: 'field', label: FIELD[f].label, sensitif: ['lihat', 'edit'].includes(b), teks: `Field ${FIELD[f].label}: ${TINGKAT_FIELD[a]} → ${TINGKAT_FIELD[b]}` })
  }
  for (const k of ['nama', 'deskripsi', 'aktif']) if ((lama[k] ?? '') !== (baru[k] ?? '')) out.push({ kode: k, jenis: 'info', label: k, teks: k === 'aktif' ? (baru.aktif === false ? 'Role dinonaktifkan' : 'Role diaktifkan') : `${k}: "${lama[k] ?? ''}" → "${baru[k] ?? ''}"`, sensitif: k === 'aktif' })
  return out
}

/** Validasi sebelum menyimpan konfigurasi role. Kembalikan pesan galat atau null. */
export function validasiSimpan({ user, role, baru, users }) {
  if (!bolehKelola(user)) return 'Anda tidak berwenang mengelola role.'
  if (role.kode === ROLE_SISTEM) return 'Role Super Admin adalah role sistem dan tidak dapat diubah.'
  if (user.role === role.kode && user.role !== ROLE_SISTEM) return 'Anda tidak dapat mengubah role yang sedang Anda pakai sendiri.'
  if (!baru.nama?.trim()) return 'Nama role wajib diisi.'
  for (const [k, v] of Object.entries(baru.izin || {})) {
    if (!v?.aktif) continue
    if (!(role.izin?.[k]?.aktif) && !bolehBeri(user, k)) return `Anda tidak dapat memberikan izin yang tidak Anda miliki: ${k}`
    if (v.cakupan === 'cabang_pilihan' && !(v.cabang || []).length) return `Pilih minimal satu cabang untuk ${k}`
  }
  if (baru.aktif === false && penggunaRole(users, role.kode).length && role.aktif !== false) return null // boleh, tapi diperingatkan di UI
  return null
}

/** Konfigurasi awal untuk role baru. */
export function konfigBaru({ nama, kode, deskripsi, salinDari }) {
  const sumber = salinDari ? konfigRole(salinDari) : { izin: {}, field: Object.fromEntries(MODUL.flatMap((m) => (m.field || []).map((x) => [x.id, 'sembunyi']))) }
  return { id: kode, kode, nama: nama.trim(), deskripsi: (deskripsi || '').trim(), aktif: true, izin: JSON.parse(JSON.stringify(sumber.izin || {})), field: { ...(sumber.field || {}) }, disalin_dari: salinDari || '' }
}
export const kembalikanAsal = (kode) => konfigAsal(kode)
