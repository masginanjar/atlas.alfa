// ============================================================
//  ROLE & CABANG — tambah cabang baru cukup di BRANCHES.
// ============================================================
export const BRANCHES = ['Bali', 'Jakarta', 'Surabaya', 'Semarang', 'Bandung', 'Yogyakarta', 'Makassar', 'Medan', 'Batam']

/** Cabang yang boleh diakses user: cabang utama + cabang tambahan (CS multi cabang / backup). */
export const branchesOf = (u) => (u?.branches?.length ? [...new Set([u.branch, ...u.branches])] : [u?.branch].filter(Boolean))
/** Petty cash: satu kas per cabang + satu kas APOSTILLE milik Direktur (untuk bayar apostille/legalisasi). */
export const APOSTILLE_FUND = 'Apostille'
export const pettyLabel = (k) => (k === APOSTILLE_FUND ? 'Petty Cash Apostille (Direktur)' : `Petty Cash ${k}`)
export function pettyAccountsOf(u) {
  if (['superadmin', 'admin_pusat', 'direktur', 'akunting'].includes(u?.role)) return [APOSTILLE_FUND, ...BRANCHES]
  if (u?.role === 'supervisor') return [APOSTILLE_FUND, ...branchesOf(u)]
  if (['penerjemah', 'proofreader', 'otorisator', 'staf_apostille'].includes(u?.role)) return []
  return branchesOf(u)
}
/** Bahasa asing sebuah sub project terjemahan (selain Indonesia). */
/**
 * Aturan penugasan terjemahan (17 Nov 2026): Indonesia · Inggris · Belanda dikerjakan penerjemah INTERNAL atau BIRO REKANAN.
 * Bahasa lain dibeli ke vendor (order ke vendor) — bukan penerjemah internal, bukan biro.
 */
export const BAHASA_INTERNAL = ['Indonesia', 'Inggris', 'Belanda']
export const perluVendor = (s) => ['terjemahan', 'terjemahan_nt'].includes(s?.type) && [s?.lang_from, s?.lang_to].some((l) => l && !BAHASA_INTERNAL.includes(l))
export const foreignLang = (s) => [s?.lang_from, s?.lang_to].find((l) => l && l !== 'Indonesia') || ''
/** Koordinator bahasa: semua order bahasa ini lewat 1 pintu (mis. Emma = Jepang). */
export const coordinatorFor = (users, lang) => (lang ? users.find((u) => u.coordinator_lang === lang && u.active !== false) : null)
/** Koordinator vendor: tim yang memegang order ke vendor tertentu (user.koordinator = [vendor_id]). */
export const vendorKoordinator = (u) => (Array.isArray(u?.koordinator) ? u.koordinator : [])
/** Sub project ini dikoordinasi orang ini? (vendornya dipegang dia, atau diserahkan kepadanya) */
export const diKoordinasi = (u, x) => !!u && (vendorKoordinator(u).includes(x?.data?.vendor) || (x?.data?.coordinator && x.data.coordinator === u.id))
export const isMultiBranch = (u) => branchesOf(u).length > 1
/** Penerjemah, Proofreader & Otorisator = freelance: tidak punya cabang, bekerja dari mana saja. */
export const FREELANCE_ROLES = ['penerjemah', 'proofreader', 'otorisator']
export const isFreelance = (u) => { const r = [...new Set([u?.base_role || u?.role, ...(u?.extra_roles || [])].filter(Boolean))]; return r.length > 0 && r.every((x) => FREELANCE_ROLES.includes(x)) }
/** Lokasi singkat untuk label: "Bali" / "Freelance". */
export const placeOf = (u) => (isFreelance(u) ? 'Mitra' : u?.branch || '—')
export const branchLabel = (u) => (isFreelance(u) ? 'Mitra (semua cabang)' : isMultiBranch(u) ? `Multi Cabang (${branchesOf(u).join(', ')})` : u?.branch)

export const ROLES = {
  superadmin: { label: 'Superadmin' },
  admin_pusat: { label: 'Admin Kantor Pusat' },
  supervisor: { label: 'Direktur' }, // label tampilan: tugas direktur dikerjakan akun supervisor (permintaan 9 Nov 2026)
  cs: { label: 'CS Cabang' },
  direktur: { label: 'Direktur' },
  akunting: { label: 'Akunting' },
  penerjemah: { label: 'Penerjemah' },
  proofreader: { label: 'Proofreader' },
  otorisator: { label: 'Otorisator' },
  staf_apostille: { label: 'Staf Apostille' },
  // Helper: membantu CS & Staf Apostille, TERBATAS pada cabangnya sendiri.
  // Bukan Admin Kantor Pusat — tidak melihat cabang lain.
  helper: { label: 'Helper Cabang' },
}
/** Role pelaksana yang login & punya To-Do List sendiri. */
/** Label role; otorisator dibedakan Master / Staf Otorisasi. */
/** Role buatan sendiri (Pengaturan → Role & Hak Akses) — diisi mesin izin. */
export const ROLE_TAMBAHAN = {}
export function setRoleTambahan(list = []) { for (const k of Object.keys(ROLE_TAMBAHAN)) delete ROLE_TAMBAHAN[k]; for (const r of list) if (!ROLES[r.kode]) ROLE_TAMBAHAN[r.kode] = { label: r.nama || r.kode, aktif: r.aktif !== false } }
/** Semua role yang bisa ditetapkan ke pengguna (bawaan + buatan sendiri yang aktif). */
export const semuaRole = () => ({ ...ROLES, ...Object.fromEntries(Object.entries(ROLE_TAMBAHAN).filter(([, r]) => r.aktif)) })
export const roleLabel = (u, role = u?.role) => (role === 'otorisator' ? (u?.otorisator_level === 'master' ? 'Master Otorisasi' : 'Staf Otorisasi') : ROLES[role]?.label ?? ROLE_TAMBAHAN[role]?.label ?? role)
/** Semua role yang dimiliki user (double job: role utama + extra_roles). */
export const rolesOf = (u) => [...new Set([u?.base_role || u?.role, ...(u?.extra_roles || [])].filter(Boolean))]
export const WORKER_ROLES = ['penerjemah', 'proofreader', 'otorisator', 'staf_apostille']

// Master data non-login. Penerjemah/Proofreader/Otorisator kini berupa PENGGUNA (role) dengan To-Do List.
export const PERSON_TYPES = {
  vendor: 'Vendor',
  lembaga: 'Lembaga Legalisasi',
}

// ============================================================
//  TIM PROOFREADER — satu identitas untuk pengguna biasa
//  Nama masing-masing proofreader hanya terlihat oleh manajemen
//  (dan oleh proofreader itu sendiri). Pembatasan dilakukan di
//  lapisan data (nameOf, daftar pilihan, Tim Aktif), bukan sekadar
//  disembunyikan di tampilan.
// ============================================================
export const PROOFREADER_TEAM = { id: 'tim-proofreader', lead: 'Muhammad Arifin', label: 'Tim Proofreader' }
export const proofreaderTeamName = () => `${PROOFREADER_TEAM.lead} · ${PROOFREADER_TEAM.label}`
/** Boleh melihat nama masing-masing proofreader? */
export const seeProofreaderIdentity = (u) => ['superadmin', 'admin_pusat', 'supervisor', 'direktur', 'akunting', 'penerjemah'].includes(u?.base_role || u?.role) // penerjemah: memilih proofreader sendiri sebelum kirim (permintaan 8 Nov 2026)
/** Nama yang boleh ditampilkan ke `viewer` untuk user `target`. */
export function displayNameFor(viewer, target) {
  if (!target) return undefined
  const isPr = (target.base_role || target.role) === 'proofreader'
  if (!isPr || viewer?.id === target.id || seeProofreaderIdentity(viewer)) return target.name
  return proofreaderTeamName()
}
/**
 * TIM OTORISASI HANYA DIKETAHUI INTERNAL (20 Nov 2026): penerjemah, proofreader biasa & CS tidak boleh tahu bahwa Master Otorisasi
 * punya tim (staf otorisasi). Bagi mereka semua urusan otorisasi tampil & diarahkan ke Master Otorisasi.
 * Di internal pembagian kerja tetap seperti biasa (klaim, prestasi, laporan atas nama staf yang mengerjakan).
 * Yang ikut tim (punya role otorisator, utama atau tambahan) tentu tetap melihat.
 */
export const seeOtoTeam = (u) => !['penerjemah', 'proofreader', 'cs'].includes(u?.base_role || u?.role) || rolesOf(u).includes('otorisator')
export const masterOto = (users = []) => users.find((u) => rolesOf(u).includes('otorisator') && u.otorisator_level === 'master' && u.active !== false) || null
/** Teks tahap Otorisasi untuk yang tidak boleh tahu soal tim — selalu satu kalimat ini saja; null = tampil seperti biasa. */
export const teksOtoUntuk = (viewer, stage) => (stage?.key === 'otorisasi' && !seeOtoTeam(viewer) ? `Sedang diotorisasi ${PROOFREADER_TEAM.lead}` : null)
/** Label role untuk `viewer`: yang tidak boleh tahu soal tim melihat "Otorisator" saja (tanpa Master / Staf). */
export const labelRoleUntuk = (viewer, u) => (!seeOtoTeam(viewer) && u?.role === 'otorisator' ? 'Otorisator' : roleLabel(u))
/** Nama otorisator yang boleh ditampilkan ke `viewer` (klaim "sedang diproses …", dsb.). */
export const namaOtoUntuk = (viewer, nama) => (seeOtoTeam(viewer) ? nama : PROOFREADER_TEAM.lead)
/**
 * PROOFREADER TETAP PER PENERJEMAH (20 Nov 2026): Super Admin menetapkan di Pengaturan → Pengguna (akun penerjemah, isian `proofreader_tetap`).
 * Bila diisi, hasil penerjemah itu SELALU dikirim ke proofreader tersebut — penerjemah tidak memilih.
 * Dikembalikan null bila belum diatur atau proofreader-nya sudah nonaktif (kembali ke cara biasa).
 */
export function proofreaderTetap(sub, users = [], pelaku = null) {
  const tr = users.find((u) => u.id === (sub?.data?.translator || pelaku?.id))
  const id = tr?.proofreader_tetap
  return id ? users.find((u) => u.id === id && u.active !== false && rolesOf(u).includes('proofreader')) || null : null
}
/** Proofreader aktif dengan antrean paling sedikit — dipakai saat penerjemah mengirim ke Tim Proofreader. */
export function pickProofreader(users, projects = []) {
  const pool = users.filter((u) => u.role === 'proofreader' && u.active !== false)
  if (pool.length < 2) return pool[0]?.id || ''
  const load = Object.fromEntries(pool.map((u) => [u.id, 0]))
  for (const p of projects) for (const s of p.sub_projects || []) if (s.stage === 'proofread' && load[s.data?.proofreader] != null) load[s.data.proofreader] += 1
  return pool.slice().sort((a, b) => load[a.id] - load[b.id] || a.name.localeCompare(b.name))[0].id
}

// ============================================================
//  KODE CABANG PADA NOMOR INVOICE — 3 angka setelah "INV-".
//  Dipakai agar daftar Faktur tiap cabang tidak tercampur.
// ============================================================
export const BRANCH_CODES = {
  101: 'Bali', 202: 'Jakarta', 303: 'Bandung', 304: 'Yogyakarta',
  305: 'Surabaya', 306: 'Medan', 307: 'Semarang', 308: 'Makassar', 309: 'Batam',
  209: 'Batam', // Batam juga memakai awalan 209 (Zoho "Region 4")
}
/** Cabang dari nomor invoice ("INV-1012611057086" → "Bali"). null bila kodenya belum dikenal. */
export function branchOfInvoice(no) {
  const m = /^\s*INV-(\d{3})/i.exec(String(no || ''))
  return m ? BRANCH_CODES[Number(m[1])] || null : null
}
/** Kode 3 angka pada nomor invoice, untuk ditampilkan apa adanya. */
export const invoiceCode = (no) => (/^\s*INV-(\d{3})/i.exec(String(no || '')) || [])[1] || ''
/**
 * Nomor invoice untuk DITAMPILKAN — tanpa awalan "INV-", angkanya saja.
 * Nilai yang tersimpan tetap lengkap ("INV-1012611016951") supaya
 * pencocokan dengan Zoho, pencarian, dan kode cabang tidak terganggu.
 */
export const invoiceLabel = (no) => String(no ?? '').replace(/^\s*INV-/i, '')

/** Aturan LAMA (sebelum Role & Hak Akses) — dipakai katalog izin untuk mengisi role bawaan. Jangan dipakai langsung di UI. */
export const canAsal = {
  seeAllBranches: (u) => ['superadmin', 'admin_pusat', 'supervisor', 'direktur', 'akunting'].includes(u?.role),
  seeProofreaderIdentity,
  openSettings: (u) => ['superadmin', 'admin_pusat', 'supervisor'].includes(u?.role),
  manageVendors: (u) => ['superadmin', 'admin_pusat', 'supervisor', 'akunting'].includes(u?.role),
  approveVendor: (u) => ['superadmin', 'direktur'].includes(u?.role),
  // Keuangan: sumber dana (ATS/PTI/PAL/ATI) & Tagihan Vendor hanya Superadmin, Direktur, Akunting
  seeFunding: (u) => ['superadmin', 'direktur', 'akunting'].includes(u?.role),
  // Keuangan semua cabang; Direktur hanya cabangnya (+ kas apostille miliknya)
  seeAllFinance: (u) => ['superadmin', 'admin_pusat', 'direktur', 'akunting'].includes(u?.role),
  // Data pelanggan & alamat pengiriman disembunyikan dari pelaksana penerjemahan (hanya nama pelanggan)
  seeCustomerDetail: (u) => !['penerjemah', 'proofreader', 'otorisator'].includes(u?.role),
  editProject: (u) => !WORKER_ROLES.includes(u?.role),
  editBiaya: (u) => ['superadmin', 'supervisor', 'direktur'].includes(u?.role),
  seeBiaya: (u) => ['superadmin', 'supervisor', 'direktur', 'akunting'].includes(u?.role),
  seeBiayaApostille: (u) => ['superadmin', 'direktur', 'akunting'].includes(u?.role),
  manageUsers: (u) => u?.role === 'superadmin',
  managePeople: (u) => ['superadmin', 'admin_pusat', 'supervisor'].includes(u?.role),
  topUpPettyCash: (u) => ['superadmin', 'direktur', 'akunting', 'cs', 'admin_pusat', 'supervisor'].includes(u?.role),
  deleteProject: (u) => u?.role === 'superadmin',
  processStage: (u, stage, sub, project) => canProcess(u, stage, sub, project),
}

/** Mesin izin dipasang dari lib/izin.js (tanpa impor melingkar). Sebelum terpasang → aturan lama. */
let IZIN = null
export const pasangIzin = (x) => { IZIN = x }
const lewat = (kode, asal) => (u) => (IZIN ? IZIN.boleh(u, kode) : asal(u))
const field = (id, tingkat, asal) => (u) => (IZIN ? tingkat.includes(IZIN.aksesField(u, id)) : asal(u))
/** Hak akses yang dipakai UI — mengikuti Pengaturan → Role & Hak Akses (katalog config/izin.js). */
export const can = {
  ...canAsal,
  editProject: lewat('project.ubah', canAsal.editProject),
  deleteProject: lewat('project.hapus', canAsal.deleteProject),
  manageUsers: lewat('pengaturan.pengguna.ubah', canAsal.manageUsers),
  managePeople: lewat('pengaturan.master.ubah', canAsal.managePeople),
  manageVendors: lewat('vendor.ubah', canAsal.manageVendors),
  approveVendor: lewat('tagihan.setujui', canAsal.approveVendor),
  topUpPettyCash: lewat('petty.tambah', canAsal.topUpPettyCash),
  seeBiaya: field('project.biaya', ['lihat', 'edit'], canAsal.seeBiaya),
  seeBiayaApostille: field('project.biaya_apostille', ['lihat', 'edit'], canAsal.seeBiayaApostille),
  editBiaya: field('project.biaya', ['edit'], canAsal.editBiaya),
  seeFunding: field('keuangan.sumber_dana', ['lihat', 'edit'], canAsal.seeFunding),
  seeCustomerDetail: field('project.kontak_pelanggan', ['samar', 'lihat', 'edit'], canAsal.seeCustomerDetail),
}

const OVERRIDE = ['superadmin', 'admin_pusat', 'supervisor']
export const CLAIM_TTL = 30 * 60 * 1000 // kunci "sedang diproses" berlaku 30 menit

/** Klaim aktif pada sub project (otorisasi pool). */
export function activeClaim(sub) {
  const c = sub?.data?.claim
  return c && Date.now() - new Date(c.at).getTime() < CLAIM_TTL ? c : null
}

/**
 * Boleh memproses tahap ini?
 *  • stage.roles        : role yang diizinkan
 *  • stage.assignee     : hanya user yang ditugaskan (mis. data.translator) — Superadmin/Direktur boleh override
 *  • stage.printBranch  : hanya staf cabang lokasi Print
 *  • stage.claimable    : pool bersama; user lain tidak boleh bila sedang diklaim
 */
/** Lokasi print = 'Vendor' bila dicetak pihak eksternal (vendor) — tidak terikat cabang. */
export const PRINT_VENDOR = 'Vendor'
export const printAtVendor = (project) => project?.about?.print_location === PRINT_VENDOR
/** Cabang yang bertanggung jawab atas tahap print/scan: lokasi print, atau cabang asal bila dicetak vendor. */
export const printBranchOf = (project) => (project?.about?.print_location && project.about.print_location !== PRINT_VENDOR ? project.about.print_location : project?.branch)
/** Proses Apostille/Legalisasi lewat izin (Pengaturan → Role & Hak Akses), termasuk pengecualian per pengguna.
 *  Bersifat TAMBAHAN: role tahap yang lama tetap berlaku apa adanya. */
export const bolehProsesApostille = (u) => !!IZIN && !!u && IZIN.boleh(u, 'apostille-proses.status')
export const bolehPajakApostille = (u) => !!IZIN && !!u && IZIN.boleh(u, 'apostille-proses.setujui')
/** Langkah ceklis yang dibatasi peran (mis. "Bayar Pajak"): role yang tercantum, atau pemegang izin setujui. */
export const bolehItemCeklis = (u, f, it) => !f?.itemRoles?.[it] || f.itemRoles[it].includes(u?.role) || (it === 'Bayar Pajak' && bolehPajakApostille(u))
/** Tahap milik Staf Apostille yang dibuka untuk pengguna ini lewat izin (bukan lewat role tahap). */
export const lewatIzinApostille = (u, stage) => !!stage && stage.assignee === 'staff_apostille' && !stage.roles.includes(u?.role) && bolehProsesApostille(u)
export function canProcess(u, stage, sub, project) {
  if (!u || !stage) return false
  const izinKhusus = lewatIzinApostille(u, stage)
  if (!stage.roles.includes(u.role) && !izinKhusus) return false
  if (u.role === 'superadmin') return true
  if (stage.assignee && sub && !OVERRIDE.includes(u.role) && !izinKhusus && sub.data?.[stage.assignee] && sub.data[stage.assignee] !== u.id) return false
  if (stage.printBranch && project && !branchesOf(u).includes(printBranchOf(project))) return false
  if (stage.claimable && sub) { const c = activeClaim(sub); if (c && c.by !== u.id) return false }
  return true
}

/** Filter data sesuai hak lihat user. */
export function scopeByBranch(user, rows, branchFilter) {
  let out = rows
  if (['penerjemah', 'proofreader'].includes(user.role)) {
    // pelaksana melihat project yang ditugaskan kepadanya (lintas cabang)
    const key = user.role === 'penerjemah' ? 'translator' : 'proofreader'
    return out.filter((r) => !r.sub_projects || r.sub_projects.some((x) => x.data?.[key] === user.id))
  }
  if (user.role === 'staf_apostille') return out.filter((r) => !r.sub_projects || r.sub_projects.some((x) =>
    x.data?.staff_apostille === user.id || (!x.data?.staff_apostille && ['ap_int', 'lg_int'].includes(x.flow) && r.branch === user.branch)))
  if (user.role === 'otorisator') return out.filter((r) => !r.sub_projects || r.sub_projects.some((x) => x.stage === 'otorisasi' || x.data?.authorized_by === user.id))
  if (!can.seeAllBranches(user)) {
    const mine = branchesOf(user)
    const lang = user.coordinator_lang
    out = out.filter((r) => mine.includes(r.branch) || mine.includes(r.about?.print_location)
      || (lang && (r.sub_projects || []).some((x) => x.type === 'terjemahan' && foreignLang(x) === lang))
      || (r.sub_projects || []).some((x) => diKoordinasi(user, x)))
    if (branchFilter && branchFilter !== 'Semua' && mine.length > 1) out = out.filter((r) => r.branch === branchFilter || r.about?.print_location === branchFilter)
  } else if (branchFilter && branchFilter !== 'Semua') out = out.filter((r) => r.branch === branchFilter)
  return out
}

/** Pilihan per vendor (Pengaturan → Vendor): HPP-nya boleh dilihat tim atau tidak. */
export const HPP_TIM = { '': 'Ikuti bawaan (apostille & legalisasi disembunyikan)', tampil: 'Selalu tampil ke tim', sembunyi: 'Selalu disembunyikan dari tim' }
/**
 * HPP / biaya vendor disembunyikan dari orang ini? Yang tampil hanya nama paketnya.
 * Bawaan: dokumen apostille/legalisasi disembunyikan; vendor bisa diatur "selalu tampil" / "selalu sembunyi".
 * Superadmin, Direktur, Akunting (izin field project.biaya_apostille) selalu melihat.
 */
export const biayaVendorTersembunyi = (u, sub, vendor) => {
  const m = vendor?.hpp_tim
  const tersembunyi = m === 'sembunyi' || (m !== 'tampil' && ['apostille', 'legalisasi'].includes(sub?.type))
  return tersembunyi && !can.seeBiayaApostille(u)
}

/** Project yang otorisatornya sudah membalas lewat email (balasan "OK" atau berlampiran) dan masih menunggu nomor register.
 *  Dipakai untuk tanda "ACC" di samping nomor invoice dan untuk menaruh project itu di paling atas daftar sampai nomor register terbit. */
export const accEmail = (p) => !!(p?.email_oto_balasan || []).length && !p.cancelled && (p.sub_projects || []).some((s) => !s.cancelled && (s.stage === 'otorisasi' || s.stage === 'registrasi'))

/**
 * Vendor EKSEKUTOR (20 Nov 2026): vendor pengurusan apostille / legalisasi / jasa lain (mis. ARM) — ditandai `eksekutor` di Pengaturan → Vendor.
 * Hanya mereka yang muncul di pilihan Eksekutor (kelompok "Eksternal"), dan mereka TIDAK muncul di pilihan penerjemah.
 * Cadangan bila belum ada satu pun yang ditandai (data lama / demo): vendor tanpa bahasa yang layanannya menyebut apostille / legalisasi.
 */
const layananUrus = (p) => !(p?.languages || []).length && (Array.isArray(p?.services) ? p.services : []).some((x) => /apostille|legalisasi/i.test(String(x?.name || x?.nama || x?.label || x || '')))
export const vendorEksekutor = (p, semua) => (p?.type === 'vendor' && ((semua || []).some((x) => x?.type === 'vendor' && x.eksekutor) ? !!p.eksekutor : layananUrus(p)))
