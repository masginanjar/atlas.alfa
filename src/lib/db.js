// ============================================================
//  LAPISAN DATA — satu antarmuka, dua mesin:
//   • DEMO  : localStorage di browser (tanpa server, untuk mencoba)
//   • LIVE  : InsForge (Postgres + Auth) bila VITE_INSFORGE_URL diisi
//  Halaman tidak pernah memanggil InsForge langsung — selalu lewat sini,
//  jadi ganti backend di masa depan cukup ubah file ini.
// ============================================================
import { createClient } from '@insforge/sdk'
import { SUPABASE_READY, supabaseDb } from './supabase.js'
import { seed } from './seed.js'
import { applyLegacyImport } from './legacyImport.js'
import { CHAT_ENABLED } from './flags.js'
import { ensureDefaultCouriers } from '../config/couriers.js'
import { FAQ_SEED } from '../config/faqSeed.js'
import { ARAH_AFFIDAVIT } from './affidavit.js'
import { BRANCHES as AFF_BRANCHES } from '../config/access.js'
import { PANGGILAN, BALI_NOV_2026, LIBUR_CABANG_NOV_2026, geserHari } from '../config/jadwalSeed.js'

const AFF_ARAH = ARAH_AFFIDAVIT.map((a) => a.key)
// Payload impor sistem lama hanya versi tersamar, dan hanya untuk mode demo.
// Mode live (Supabase) tidak memuat berkas itu. Lihat vite.config.js.

const URL_ = import.meta.env.VITE_INSFORGE_URL
// 'supabase' (live, Supabase) · 'live' (InsForge, lama) · 'demo' (localStorage)
export const MODE = SUPABASE_READY ? 'supabase' : URL_ ? 'live' : 'demo'
export const IS_LIVE = MODE !== 'demo'
const ALL_TABLES = ['users', 'people', 'projects', 'petty_cash', 'couriers', 'notifications', 'requests', 'perf_daily', 'share_links', 'share_log', 'vendor_bills', 'fund_balances', 'app_settings', 'activity_log', 'pings', 'notes', 'todos', 'reminders', 'messages', 'daftar_harga', 'faq', 'affidavit_stok', 'affidavit_pakai', 'affidavit_kirim', 'jadwal', 'cuti', 'mitra', 'kapasitas', 'perusahaan_dok', 'data_pribadi', 'kirim', 'kirim_alamat', 'kirim_templat', 'kirim_kendala', 'kirim_mutasi', 'kirim_event', 'akses_role', 'akses_pengecualian', 'akses_audit', 'app_laporan', 'kehadiran', 'surat_kuasa', 'surat_kuasa_penerima']
// Chat dimatikan → `messages` tidak ikut dilanggan realtime maupun disegarkan.
export const TABLES = CHAT_ENABLED ? ALL_TABLES : ALL_TABLES.filter((t) => t !== 'messages')

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

// ---------------- DEMO (localStorage) ----------------
import { perfDemo } from './perfDemo.js'
import { compactDemo } from './compactDemo.js'
import { fotoTim } from './avatarTim.js'
import { isiJadwalDemo } from './jadwalDemo.js'
import { isFreelance } from '../config/access.js'
import { isiKirimDemo } from './kirimDemo.js'
import { SK_PENERIMA_DEMO } from './skPenerimaDemo.js'
const KEY = 'atlas-alfa-v24' // naikkan versi bila struktur data demo berubah
let mem = null
function load() {
  if (mem) return mem
  try { mem = JSON.parse(localStorage.getItem(KEY)) } catch { mem = null }
  // Demo ringkas: 30 project yang mewakili semua role (data lama diganti sekali)
  cleanStorage()
  if (!mem || !mem.compact_v9) { mem = seed(); migrate(mem); compactDemo(mem); save() }
  if (migrate(mem)) save()
  if (perfDemo(mem)) save() // tugas contoh harian (mati secara bawaan di demo ringkas)
  return mem
}
/** Migrasi data demo yang sudah tersimpan (idempoten): peran otorisasi & arsip riwayat. */
function migrate(m) {
  let changed = false
  // penamaan prioritas: Speed → Ekspres, Super Speed → Super Ekspres
  const PRIO_RENAME = { Speed: 'Ekspres', 'Super Speed': 'Super Ekspres', Tinggi: 'Super Ekspres' }
  for (const p of m.projects || []) { const v = p.about?.priority; if (v && PRIO_RENAME[v]) { p.about.priority = PRIO_RENAME[v]; changed = true } }
  const u = (id) => m.users.find((x) => x.id === id)
  const set = (id, patch) => { const x = u(id); if (x && Object.entries(patch).some(([k, v]) => JSON.stringify(x[k]) !== JSON.stringify(v))) { Object.assign(x, patch); changed = true } }
  set('u-ot-made', { otorisator_level: 'master' })
  if (isiJadwalDemo(m)) changed = true
  if (isiKirimDemo(m)) changed = true
  // Biro rekanan (16 Nov 2026): Indotrans — order lewat grup, CS unggah hasil, langsung nomor register, biaya masuk tagihan. Tarif diisi pemilik.
  if (!m.biro_indotrans_v1) {
    if (!(m.people || []).some((x) => x.type === 'vendor' && /indotrans/i.test(x.name))) {
      m.people = [...(m.people || []), { id: 'p-vendor-indotrans', name: 'Indotrans', type: 'vendor', branch: 'Semua', phone: '', biro: true, payment_term: 'invoice',
        services: [{ name: 'Terjemahan tersumpah (tarif belum diisi)', price: 0 }], accounts: [], notes: 'Biro rekanan. Order lewat grup; hasil diunggah CS lalu langsung ke Admin Pusat untuk nomor register.', created_at: new Date().toISOString() }]
    }
    m.biro_indotrans_v1 = true; changed = true
  }
  // Portal to-do vendor (16 Nov 2026): contoh vendor Bahasa Korea + tautan portal + 2 pekerjaan SINTETIS (bukan data pelanggan).
  if (!m.portal_todo_v1) {
    const vid = 'p-vendor-anisa'; const at = new Date().toISOString(); const hari = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString() }
    if (!(m.people || []).some((x) => x.id === vid)) m.people = [...(m.people || []), { id: vid, name: 'Anisa', type: 'vendor', branch: 'Semua', phone: '', languages: ['Korea'], kode_portal: '247', payment_term: 'invoice',
      services: [{ name: 'Terjemahan Korea (tarif belum diisi)', price: 0 }], accounts: [], notes: 'Vendor Bahasa Korea. Bekerja lewat portal vendor: unduh sumber, unggah hasil.', created_at: at }]
    if (!(m.share_links || []).some((l) => l.token === 'demo-portal-anisa')) m.share_links = [...(m.share_links || []), { id: 'sl-anisa', token: 'demo-portal-anisa', kind: 'vendor', project_id: null, vendor_id: vid, activated_at: at, expires_at: hari(30), revoked_at: null, shared: [], shared_regs: [], fails: [], opens: 0, email_sends: [], created_by: null, created_at: at, history: [{ at, by: 'Sistem', action: 'Tautan contoh (demo)' }] }]
    const berkas = (nama) => ({ id: `f-${nama}`, name: `${nama}.txt`, size: 40, url: `data:text/plain;base64,${btoa(`Contoh dokumen sumber (data sintetis): ${nama}`)}`, drive_id: null, uploaded_at: at })
    const buat = (id, no, nama, dok, n, metode) => {
      const list = dok.map(([d]) => berkas(d)); const sid = `${id}-s1`
      return { id, invoice_no: no, branch: 'Bali', created_at: at, files: [], customer: { zoho_id: null, name: nama, email: '', phone: '', ship: { attention: nama, street1: '[ALAMAT CONTOH]', city: '[KOTA]' }, manual: true },
        about: { print_location: 'Bali', priority: 'Normal', received_at: at.slice(0, 10), deadline: hari(n), deadline_time: '17:00', cs_name: 'Demo', metode_kirim: metode, courier: '' },
        sub_projects: [{ id: sid, type: 'terjemahan', title: `Terjemahan Tersumpah: ${dok[0][0]}${dok.length > 1 ? ` +${dok.length - 1}` : ''}`, description: dok.map(([d], i) => `${i + 1}. ${d}`).join('\n'), file_count: dok.length, pages: dok.reduce((a, x) => a + x[1], 0),
          docs: dok.map(([desc, pages]) => ({ desc, pages, kind: 'normal' })), lang_from: 'Indonesia', lang_to: 'Korea', translator_kind: 'vendor', translator: vid, flow: 'tr_ext', stage: 'pengajuan', stage_at: at,
          data: { vendor: vid, dokumen_sumber: list[0], dokumen_sumber_list: list }, history: [{ at, by: 'Sistem', action: 'Contoh (demo)' }] }] }
    }
    if (!(m.projects || []).some((p) => p.id === 'pj-anisa-1')) m.projects = [...(m.projects || []),
      buat('pj-anisa-1', 'INV-990201', '[Contoh Pelanggan A]', [['Akta Kelahiran (contoh)', 1], ['Kartu Keluarga (contoh)', 2], ['Ijazah (contoh)', 1]], 3, 'softcopy'),
      buat('pj-anisa-2', 'INV-990202', '[Contoh Pelanggan B]', [['Surat Keterangan (contoh)', 2]], 5, 'vendor')]
    m.portal_todo_v1 = true; changed = true
  }
  if (!m.portal_bukti_v1) {
    const pj = (m.projects || []).find((p) => p.id === 'pj-anisa-2'); const sb = pj?.sub_projects?.[0]
    if (sb && !sb.data?.payments?.length) { const at = new Date().toISOString(); sb.data = { ...sb.data, total_pengajuan: 300000, payments: [{ amount: 300000, date: at.slice(0, 10), bukti: { id: 'f-bukti-anisa', name: 'Bukti transfer (contoh).txt', size: 30, url: `data:text/plain;base64,${btoa('Contoh bukti transfer (data sintetis)')}`, uploaded_at: at } }] } }
    m.portal_bukti_v1 = true; changed = true
  }
  // Contoh untuk "Buat pesan notifikasi" (17 Nov 2026): dokumen sintetis di tahap Proofread & Otorisasi, deadline besok / hari ini
  if (!m.pesan_siap_v1) {
    const tr = (m.users || []).find((u) => u.role === 'penerjemah' && u.active !== false)?.id
    const pf = (m.users || []).find((u) => u.role === 'proofreader' && u.active !== false)?.id
    if (tr && pf) {
      const now = new Date(); const at = now.toISOString()
      const dl = (hari, jam) => { const d = new Date(now.getTime() + 8 * 3600e3 + hari * 864e5).toISOString().slice(0, 10); return `${d}T${jam}:00+08:00` }
      const buat = (id, inv, nama, stage, deadline, prio) => ({ id, invoice_no: inv, branch: 'Bali', created_at: at, files: [], payment_status: 'paid', customer: { zoho_id: null, name: nama, ship: {} },
        about: { print_location: 'Bali', priority: prio, received_at: at.slice(0, 10), deadline, metode_kirim: 'softcopy', courier: '' },
        sub_projects: [{ id: `${id}-s1`, type: 'terjemahan', title: 'Terjemahan Tersumpah: Dokumen (contoh)', description: '1. Dokumen (contoh)', file_count: 1, pages: 1, docs: [{ desc: 'Dokumen (contoh)', pages: 1 }],
          lang_from: 'Indonesia', lang_to: 'Inggris', flow: 'tr_int', stage, stage_at: at, data: { translator: tr, proofreader: pf }, history: [] }] })
      const baru = [
        buat('pj-siap-o1', 'INV-990301', '[Contoh Ready Oto A]', 'otorisasi', dl(1, '08:00'), 'Normal'),
        buat('pj-siap-o2', 'INV-990302', '[Contoh Ready Oto B]', 'otorisasi', dl(1, '08:00'), 'Normal'),
        buat('pj-siap-o3', 'INV-990303', '[Contoh Ready Oto C]', 'otorisasi', dl(0, '17:00'), 'Sameday'),
        buat('pj-siap-p1', 'INV-990304', '[Contoh Ready Proof A]', 'proofread', dl(1, '08:00'), 'Normal'),
        buat('pj-siap-p2', 'INV-990305', '[Contoh Ready Proof B]', 'proofread', dl(0, '17:00'), 'Sameday'),
      ].filter((p) => !(m.projects || []).some((x) => x.id === p.id))
      m.projects = [...(m.projects || []), ...baru]
    }
    m.pesan_siap_v1 = true; changed = true
  }
  // Contoh "Sudah diotorisasi" (17 Nov 2026): tiga dokumen sintetis yang baru di-ACC otorisator pertama
  if (!m.pesan_acc_v1) {
    const ot = (m.users || []).find((u) => u.role === 'otorisator' && u.active !== false)
    const tr = (m.users || []).find((u) => u.role === 'penerjemah' && u.active !== false)?.id
    const pf = (m.users || []).find((u) => u.role === 'proofreader' && u.active !== false)?.id
    if (ot && tr && pf) {
      const now = new Date(); const at = now.toISOString()
      const dl = (hari, jam) => `${new Date(now.getTime() + 8 * 3600e3 + hari * 864e5).toISOString().slice(0, 10)}T${jam}:00+08:00`
      const buat = (id, inv, nama, deadline, prio) => ({ id, invoice_no: inv, branch: 'Bali', created_at: at, files: [], payment_status: 'paid', customer: { zoho_id: null, name: nama, ship: {} },
        about: { print_location: 'Bali', priority: prio, received_at: at.slice(0, 10), deadline, metode_kirim: 'softcopy', courier: '' },
        sub_projects: [{ id: `${id}-s1`, type: 'terjemahan', title: 'Terjemahan Tersumpah: Dokumen (contoh)', description: '1. Dokumen (contoh)', file_count: 1, pages: 1, docs: [{ desc: 'Dokumen (contoh)', pages: 1 }],
          lang_from: 'Indonesia', lang_to: 'Inggris', flow: 'tr_int', stage: 'registrasi', stage_at: at, data: { translator: tr, proofreader: pf, authorized_by: ot.id, authorized_name: ot.name, authorized_at: at }, history: [] }] })
      const baru = [buat('pj-siap-a1', 'INV-990311', '[Contoh Sudah Oto A]', dl(1, '08:00'), 'Normal'), buat('pj-siap-a2', 'INV-990312', '[Contoh Sudah Oto B]', dl(1, '08:00'), 'Normal'), buat('pj-siap-a3', 'INV-990313', '[Contoh Sudah Oto C]', dl(0, '17:00'), 'Sameday')]
        .filter((p) => !(m.projects || []).some((x) => x.id === p.id))
      m.projects = [...(m.projects || []), ...baru]
    }
    m.pesan_acc_v1 = true; changed = true
  }
  // Email Otorisasi (17 Nov 2026): satu contoh dokumen Belanda di tahap otorisasi, lengkap dengan berkas sumber & hasil proofread SINTETIS, supaya alurnya bisa dicoba di demo
  if (!m.email_oto_demo_v1) {
    const pr = (m.projects || []).find((x) => !x.cancelled && !x.archived && (x.sub_projects || []).some((sb) => sb.stage === 'otorisasi'))
    const sb = pr?.sub_projects.find((x) => x.stage === 'otorisasi')
    if (sb) {
      const url = 'data:text/plain;base64,' + btoa('Berkas contoh sintetis untuk demo Email Otorisasi (bukan dokumen pelanggan).')
      const f = (id, name) => ({ id, name, size: 78, url, drive_id: null, uploaded_at: new Date().toISOString() })
      sb.lang_from = 'Belanda'; sb.lang_to = 'Indonesia'
      sb.data = { ...(sb.data || {}), dokumen_sumber: null, dokumen_sumber_list: [f('demo-eo-s', 'Contoh dokumen sumber (sintetis).txt')], hasil_proofread: null, hasil_proofread_list: [f('demo-eo-p', 'NED-IND Contoh hasil proofread (sintetis).txt')] }
    }
    m.email_oto_demo_v1 = true; changed = true
  }
  // Laporan Otorisasi (17 Nov 2026): akun Muhammad Arifin boleh melihat rekap semua otorisator
  if (!m.oto_lihat_semua_v1) {
    const ar = (m.users || []).find((u) => u.role === 'otorisator' && /arifin/i.test(u.name))
    if (ar && !(m.app_settings || []).some((r) => r.key === 'oto_lihat_semua')) m.app_settings = [...(m.app_settings || []), { id: 'as-oto-lihat', key: 'oto_lihat_semua', users: [ar.id] }]
    m.oto_lihat_semua_v1 = true; changed = true
  }
  // Koordinator vendor (10 Nov 2026): Emma → Pak Zenzia, Debby → Pak Dedi (Jerman)
  if (!m.koordinator_v1) {
    let dedi = (m.people || []).find((x) => x.type === 'vendor' && /dedi/i.test(x.name))
    if (!dedi) { dedi = { id: 'p-vendor-dedi', name: 'Bapak Dedi', type: 'vendor', branch: 'Semua', phone: '', languages: ['Jerman'], services: [{ name: 'Terjemahan Jerman–Indonesia /dok', price: 400000 }, { name: 'Terjemahan Indonesia–Jerman /dok', price: 400000 }], accounts: [], notes: 'Penerjemah lepas Bahasa Jerman.', created_at: new Date().toISOString() }; m.people = [...(m.people || []), dedi] }
    const zen = (m.people || []).find((x) => x.type === 'vendor' && /zenzia/i.test(x.name))
    set('u-cs-yog', { koordinator: zen ? [zen.id] : [] })
    set('u-cs-bdg', { koordinator: [dedi.id] })
    m.koordinator_v1 = true; changed = true
  }
  // Contoh untuk Upload Bukti Transfer Massal (14 Nov 2026): pengajuan "Perlu transfer" berbagai sumber dana
  if (!m.bukti_massal_v1 || !(m.requests || []).some((r) => r.id === 'rq-bm-1')) {
    const now = new Date().toISOString()
    const R = (id, kind, branch, amount, purpose, dana, who, extra = {}) => ({ id, kind, branch, amount, purpose, status: 'disetujui', sumber_dana: dana, requested_by: who[0], requested_name: who[1],
      recipient: { bank: '', number: '', holder: '' }, attachment: null, project_id: null, fund: null, created_at: now,
      approved_by: 'u-dir', approved_name: 'Fina (Direktur)', approved_at: now, history: [{ at: now, by: who[1], action: 'Diajukan' }, { at: now, by: 'Fina (Direktur)', action: `ACC · dana ${dana}` }], ...extra })
    m.requests = [...(m.requests || []),
      R('rq-bm-1', 'lain', 'Bali', 1250000, 'Servis AC ruang CS Bali', 'ATS', ['u-cs-bali', 'Nikita (CS Bali)'], { recipient: { bank: 'BCA', number: '7720381122', holder: 'CV Sejuk Abadi' } }),
      R('rq-bm-2', 'lain', 'Jakarta', 750000, 'Kurir dokumen ke Kemenkumham (pagi)', 'ATI', ['u-cs-jkt', 'Rika (CS Jakarta)'], { recipient: { bank: 'BCA', number: '5430998811', holder: 'Andi Pratama' } }),
      R('rq-bm-3', 'lain', 'Jakarta', 750000, 'Kurir dokumen ke Kemenkumham (sore)', 'ATI', ['u-cs-jkt', 'Rika (CS Jakarta)'], { recipient: { bank: 'BCA', number: '5430998811', holder: 'Andi Pratama' } }),
      R('rq-bm-4', 'topup', 'Batam', 3000000, 'Top up petty cash Batam', 'PTI', ['u-cs-btm', 'Gean (CS Batam)'], { fund: 'Batam' }),
    ]
    m.bukti_massal_v1 = true; changed = true
  }
  // foto profil tim (hanya bila belum ada foto unggahan)
  for (const x of m.users || []) { const f = fotoTim(x.name); if (f && (!x.avatar || x.avatar_tim)) { if (x.avatar !== f) { x.avatar = f; x.avatar_tim = true; changed = true } } }
  set('u-ot-lukas', { otorisator_level: 'staf' })
  // Master Otorisasi tetap melihat submenu Nomor Register (role Otorisator tidak lagi menampilkannya) — pengecualian pengguna.
  m.akses_pengecualian = m.akses_pengecualian || []
  if (u('u-ot-made') && !m.akses_pengecualian.some((k) => k.user_id === 'u-ot-made' && k.kode === 'register.menu')) { m.akses_pengecualian.push({ id: 'kc-reg-master', user_id: 'u-ot-made', kode: 'register.menu', nilai: 'izinkan', sampai: '', alasan: 'Master Otorisasi menginput nomor register', oleh: 'Sistem', at: new Date().toISOString() }); changed = true }
  set('u-pr-rina', { extra_roles: ['otorisator'], otorisator_level: 'staf' })
  if (!u('u-pr-ela')) { m.users.push({ id: 'u-pr-ela', name: 'Ela', email: 'ela@247.id', role: 'proofreader', branch: 'Bali', extra_roles: ['otorisator'], otorisator_level: 'staf', active: true, created_at: new Date().toISOString() }); changed = true }
  // arsip lama tanpa rincian dokumen → isi jenis Reguler / Non Reguler (data contoh)
  for (const p of m.projects.filter((x) => String(x.id).startsWith('arch-'))) for (const sb of p.sub_projects) {
    if (sb.docs) continue
    sb.docs = Array.from({ length: sb.file_count || 1 }, (_, d) => ({ desc: sb.title, pages: Math.max(1, Math.round((sb.pages || 2) / (sb.file_count || 1))), kind: (sb.id.length + d) % 3 === 0 ? 'non_reguler' : 'reguler' })); changed = true
  }
  // termin pembayaran vendor: Jepang (Pak Zenzia) & Pak Deddy bulanan via koordinator, Mandarin (Bu Tinah) sesuai tagihan
  for (const v of m.people.filter((p) => p.type === 'vendor' && !p.payment_term)) {
    const n = v.name.toLowerCase()
    const term = /zenzia|deddy/.test(n) ? 'monthly' : /tinah/.test(n) ? 'invoice' : null
    if (term) { v.payment_term = term; changed = true }
  }
  // penerjemah, proofreader & otorisator = freelance → tanpa cabang
  for (const x of m.users) if (isFreelance(x) && (x.branch || x.branches?.length)) { x.branch = ''; x.branches = []; changed = true }
  // Lengkapi ekspedisi bawaan yang belum ada; yang sudah ada tidak disentuh.
  if (ensureDefaultCouriers(m.couriers, () => uid())) changed = true
  // Contoh pengingat & to-do, supaya My Reminders dan Calendar tidak kosong.
  // Hanya diisi sekali; begitu ada isinya, tidak pernah ditimpa lagi.
  if (!(m.reminders || []).length) {
    // Selalu di masa depan: kalau jamnya hari ini sudah lewat, digeser ke
    // hari berikutnya. Kalau tidak, alarm langsung berbunyi saat demo dibuka.
    const jam = (geserHari, j, mnt = 0) => {
      const d = new Date(); d.setDate(d.getDate() + geserHari); d.setHours(j, mnt, 0, 0)
      while (d.getTime() <= Date.now() + 60000) d.setDate(d.getDate() + 1)
      return d.toISOString()
    }
    // Diberikan ke beberapa pengguna per peran, supaya akun demo mana pun
    // yang dibuka tetap punya contoh pengingat.
    const milik = (peran, ke = 0) => m.users.filter((u) => (u.base_role || u.role) === peran)[ke]?.id
    const contoh = [
      [milik('superadmin'), 'Rekap omset harian', jam(0, 17, 0), 'daily'],
      [milik('superadmin'), 'Cek tagihan vendor jatuh tempo', jam(1, 9, 0), 'none'],
      [milik('cs', 0), 'Telepon pelanggan soal alamat kirim', jam(0, 15, 30), 'none'],
      [milik('cs', 0), 'Kirim draft ke pelanggan', jam(1, 10, 0), 'none'],
      [milik('cs', 1), 'Ambil dokumen di notaris', jam(0, 13, 0), 'none'],
      [milik('cs', 2), 'Konfirmasi resi ke kurir', jam(0, 14, 30), 'none'],
      [milik('cs', 3), 'Tagih pelunasan pelanggan', jam(0, 16, 0), 'none'],
      [milik('cs', 4), 'Susulkan dokumen kurang', jam(0, 10, 30), 'none'],
      [milik('cs', 5), 'Kabari progres ke pelanggan', jam(0, 15, 0), 'none'],
      [milik('penerjemah', 0), 'Setor hasil terjemahan', jam(0, 16, 0), 'none'],
      [milik('penerjemah', 1), 'Setor hasil terjemahan', jam(0, 16, 30), 'none'],
      [milik('penerjemah', 2), 'Mulai dokumen berikutnya', jam(0, 11, 0), 'none'],
      [milik('penerjemah', 3), 'Cek revisi dari proofreader', jam(0, 14, 0), 'none'],
      [milik('proofreader', 0), 'Proofread dokumen antre', jam(0, 13, 0), 'none'],
      [milik('akunting', 0), 'Rekonsiliasi pembayaran hari ini', jam(0, 16, 30), 'daily'],
      [milik('direktur', 0), 'Tinjau pengajuan menunggu ACC', jam(0, 10, 0), 'daily'],
      [milik('admin_pusat', 0), 'Cek registrasi dokumen', jam(0, 11, 30), 'none'],
      [milik('staf_apostille', 0), 'Antar berkas ke Kemenkumham', jam(0, 9, 30), 'none'],
      [milik('supervisor'), 'Review beban kerja tim', jam(1, 8, 30), 'weekly'],
    ].filter(([owner]) => owner)
    m.reminders = contoh.map(([owner_id, title, at, repeat]) => ({
      id: uid(), owner_id, title, at, repeat, active: true,
      note: '', created_at: new Date().toISOString(),
    }))
    changed = true
  }
  // Kerangka daftar harga jual — ANGKANYA SENGAJA KOSONG. Harga jual
  // diisi Direktur di aplikasi; mengarang angka di sini berbahaya karena
  // CS bisa memakainya menawar ke pelanggan.
  // FAQ contoh — sekali saja, supaya perubahan pengelola tidak tertimpa.
  if (!(m.faq || []).length) {
    m.faq = FAQ_SEED.map((r, i) => ({ id: uid(), ...r, status: 'terbit', urutan: i + 1,
      editor: 'Contoh', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }))
    changed = true
  }
  // F&Q v2 — balasan English, hitungan pakai & satu usulan CS (demo).
  if (!m.faq_v2) {
    const bln = new Date().toISOString().slice(0, 7)
    const pakai = [41, 33, 18, 9, 27, 4]
    m.faq = (m.faq || []).map((r, i) => {
      const s = FAQ_SEED.find((x) => x.pertanyaan === r.pertanyaan)
      return { ...r, balasan_en: r.balasan_en || s?.balasan_en || '', pakai: r.pakai || { [bln]: pakai[i] ?? 0 }, nilai: r.nilai || { suka: Math.max(1, Math.round((pakai[i] ?? 0) / 5)), kurang: i === 3 ? 2 : 0 } }
    })
    m.faq.push({ id: uid(), status: 'usulan', kategori: 'Lainnya', pertanyaan: 'Bisa terjemah dokumen tulisan tangan?', panduan: '', balasan: '', pengusul: 'Emma', pengusul_id: 'u-cs-yog', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    m.faq_v2 = true; changed = true
  }
  if (!(m.daftar_harga || []).length) {
    const baris = [
      ['Terjemahan Tersumpah', ['Inggris', 'Mandarin', 'Jepang', 'Korea', 'Jerman', 'Perancis', 'Belanda', 'Arab', 'Spanyol', 'Rusia', 'Turki'], 'per halaman'],
      ['Terjemahan Non Tersumpah', ['Inggris', 'Mandarin'], 'per halaman'],
      ['Apostille', ['Apostille Kemenkumham'], 'per dokumen'],
      ['Legalisasi', ['Legalisasi Notaris', 'Legalisasi Kemenkumham', 'Legalisasi Kemenlu', 'Legalisasi Kemenag', 'Legalisasi Kedutaan'], 'per dokumen'],
      ['Lainnya', ['Copy translate'], 'per halaman'],
      ['Lainnya', ['Scan & kirim softcopy'], 'per pesanan'],
    ]
    let n = 0
    m.daftar_harga = baris.flatMap(([kategori, items, satuan]) =>
      items.map((layanan) => ({ id: uid(), kategori, layanan, satuan, harga_normal: null, harga_kilat: null, catatan: '', urutan: ++n })))
    changed = true
  }
  // Mitra contoh — diisi manual oleh CS, jadi cukup beberapa baris untuk demo.
  if (!(m.mitra || []).length) {
    const CONTOH = [
      ['Bali Visa Center', 'Travel / Visa', 'Pak Gede', '081234567801', 'gede@balivisa.id', 'Bali', 'Aktif', '10% per dokumen'],
      ['Notaris Dewi Sartika, S.H.', 'Notaris', 'Bu Dewi', '081234567802', '', 'Bali', 'Aktif', 'Harga khusus legalisasi'],
      ['PT Global Edu Konsultan', 'Agen', 'Sdri. Rina', '081234567803', 'rina@globaledu.co.id', 'Jakarta', 'Aktif', '12% terjemahan'],
      ['Universitas Dharma Nusantara', 'Kampus / Sekolah', 'Bagian Akademik', '0213456789', 'akademik@udn.ac.id', 'Jakarta', 'Jeda', 'Kontrak tahunan'],
      ['CV Mandiri Dokumen', 'Agen', 'Pak Hartono', '081234567805', '', 'Surabaya', 'Berhenti', '—'],
    ]
    const hariLalu = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
    m.mitra = CONTOH.map(([nama, jenis, pic, telepon, email, cabang, status, komisi], i) => ({
      id: uid(), nama, jenis, pic, telepon, email, cabang, status, komisi,
      alamat: '', catatan: '', mulai: hariLalu(40 + i * 25),
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }))
    changed = true
  }
  // Stok affidavit contoh — sengaja bercampur: ada yang cukup, rendah, habis,
  // dan ada yang BELUM DIISI, supaya keempat status terlihat di demo.
  if (!(m.affidavit_stok || []).length) {
    const CONTOH = { Bali: [51, 320, 180, 0], Jakarta: [240, 48, null, null], Surabaya: [96, 12, null, null] }
    const now = new Date().toISOString()
    m.affidavit_stok = []
    for (const cabang of AFF_BRANCHES) {
      const row = CONTOH[cabang]
      AFF_ARAH.forEach((arah, i) => {
        const sisa = row ? row[i] : null
        if (sisa === null && !row) return // cabang lain: belum pernah diisi pusat
        m.affidavit_stok.push({ id: uid(), cabang, arah, sisa, catatan: '', oleh: 'Contoh', at: now, created_at: now })
      })
    }
    m.affidavit_pakai ||= []
    m.affidavit_kirim ||= []
    changed = true
  }
  // Contoh jadwal November 2026, disalin dari lembar jadwal asli.
  if (!(m.jadwal || []).length) {
    const cari = (panggilan, cabang) => {
      const potong = PANGGILAN[panggilan]
      if (!potong) return null
      return (m.users || []).find((u) => u.active !== false && u.name.includes(potong)
        && (!cabang || u.branch === cabang || (u.branches || []).includes(cabang))) || null
    }
    const out = []
    const tambah = (iso, cabang, panggilan, shift) => {
      const [nama, jam] = String(panggilan).split('@')
      const u = cari(nama.trim(), cabang)
      if (!u) return
      out.push({ id: uid(), tanggal: iso, cabang, user_id: u.id, shift,
        jam_mulai: jam || '', created_at: new Date().toISOString() })
    }
    // Bali: seluruh baris shift + libur
    BALI_NOV_2026.minggu.forEach((mg, w) => {
      for (const [shift, sel] of Object.entries(mg)) {
        sel.forEach((isi, h) => {
          if (!isi) return
          const iso = geserHari(BALI_NOV_2026.mulai, w * 7 + h)
          for (const nama of String(isi).split(',')) tambah(iso, 'Bali', nama.trim(), shift)
        })
      }
    })
    // Cabang lain: lembar aslinya hanya mencatat hari libur
    for (const [cabang, minggu] of Object.entries(LIBUR_CABANG_NOV_2026)) {
      minggu.forEach((mg, w) => mg.forEach((isi, h) => {
        if (!isi) return
        const iso = geserHari(BALI_NOV_2026.mulai, w * 7 + h)
        for (const nama of String(isi).split(',')) tambah(iso, cabang, nama.trim(), 'libur')
      }))
    }
    m.jadwal = out
    m.cuti ||= []
    changed = true
  }
  // Penerima kuasa bawaan (Surat Kuasa) — HANYA mode demo; di live dari database.
  if (!m.sk_penerima_demo_v1 && SK_PENERIMA_DEMO.length) {
    const kini = new Date().toISOString()
    m.surat_kuasa_penerima = [...SK_PENERIMA_DEMO.map((r) => ({ ...r, created_at: kini, updated_at: kini })), ...(m.surat_kuasa_penerima || []).filter((r) => !SK_PENERIMA_DEMO.some((x) => x.id === r.id))]
    m.sk_penerima_demo_v1 = true
    changed = true
  }
  // Contoh riwayat kehadiran (login harian) 20 hari terakhir — HANYA mode demo, untuk memperlihatkan rekap.
  if (!m.kehadiran_demo_v1) {
    const zona = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(d)
    const acak = (n) => { const x = Math.sin(n) * 10000; return x - Math.floor(x) }
    const rows = []
    const aktif = (m.users || []).filter((x) => x.active !== false && !x.persona)
    for (let h = 20; h >= 1; h--) {
      const tgl = zona(new Date(Date.now() - h * 864e5))
      aktif.forEach((x, i) => {
        const r = acak(h * 97 + i * 13)
        if (r < 0.14) return // tidak login hari itu
        const menitMasuk = 7 * 60 + 30 + Math.floor(acak(h * 31 + i) * 120) // 07.30–09.30 WITA
        const masuk = new Date(`${tgl}T${String(Math.floor(menitMasuk / 60)).padStart(2, '0')}:${String(menitMasuk % 60).padStart(2, '0')}:00+08:00`).toISOString()
        rows.push({ id: `${x.id}:${tgl}`, created_at: masuk, updated_at: masuk, user_id: x.id, name: x.name, role: x.role, branch: x.branch, tanggal: tgl, masuk_at: masuk, terakhir_at: masuk, login_ke: 1 + Math.floor(acak(i + h) * 3), perangkat: acak(i * 7) < 0.4 ? 'Android' : 'Windows' })
      })
    }
    m.kehadiran = [...rows, ...(m.kehadiran || [])]
    m.kehadiran_demo_v1 = true
    changed = true
  }
  return changed
}

/** Impor data sistem lama (idempoten). Cadangan disimpan sebelum perubahan pertama; log tiap impor disimpan di mem.import_runs. */
export async function importLegacy() {
  // Data live ada di Supabase. Jangan unduh atau terapkan dump legacy di mode itu.
  if (IS_LIVE) return { changed: false, skipped: 'live' }
  // Hanya demo: berkas tersamar, diunduh saat fitur impor dipakai.
  const LEGACY_2026_11_04 = (await import('@legacy-payload')).default
  const before = JSON.stringify(mem)
  const log = applyLegacyImport(mem, LEGACY_2026_11_04)
  if (!log.changed) return log
  try { if (!localStorage.getItem(`${KEY}:backup:${LEGACY_2026_11_04.source}`)) localStorage.setItem(`${KEY}:backup:${LEGACY_2026_11_04.source}`, before) } catch { /* penyimpanan penuh — lanjut tanpa cadangan lokal */ }
  mem.import_runs = [...(mem.import_runs || []), { ...log, conflicts: log.conflicts.slice(0, 200) }]
  save()
  return log
}
export let storageError = null
const emit = (v) => { try { window.dispatchEvent(new CustomEvent('atlas-storage', { detail: v })) } catch { /* abaikan */ } }
const isQuota = (e) => e?.name === 'QuotaExceededError' || e?.code === 22 || e?.code === 1014 || /quota/i.test(e?.message || '')
/** Hapus sisa data lama di browser: cadangan impor, versi database sebelumnya, kunci uji. Mengembalikan jumlah byte yang dibebaskan. */
export function cleanStorage() {
  let freed = 0
  try {
    const drop = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k === KEY) continue
      if (k.startsWith(`${KEY}:backup`) || /^atlas-alfa-v\d+$/.test(k) || k.startsWith('atlas-alfa-v') && !k.startsWith(KEY) || k.startsWith('fill')) drop.push(k)
    }
    for (const k of drop) { freed += (localStorage.getItem(k) || '').length; localStorage.removeItem(k) }
  } catch { /* abaikan */ }
  return freed
}
/** Ringkas data yang boleh dibuang bila penyimpanan tetap penuh. */
function shrink(m) {
  m.activity_log = (m.activity_log || []).slice(-500)
  m.notifications = (m.notifications || []).slice(-100)
  m.perf_daily = (m.perf_daily || []).slice(-400)
  m.share_log = (m.share_log || []).slice(-100)
  m.import_runs = []
}
function save() {
  const write = () => localStorage.setItem(KEY, JSON.stringify(mem))
  try { write(); if (storageError) { storageError = null; emit(null) }; return }
  catch (e) {
    if (!isQuota(e)) { storageError = 'blocked'; emit('blocked'); return }
    // Penuh → bersihkan sisa lama, lalu ringkas, lalu coba lagi
    cleanStorage()
    try { write(); storageError = null; emit(null); return } catch { /* lanjut */ }
    shrink(mem)
    try { write(); storageError = null; emit(null); return } catch { /* lanjut */ }
    storageError = 'quota'; emit('quota')
  }
}
/** Ukuran pemakaian localStorage (byte) untuk info di Setting. */
export const storageUsage = () => { try { let t = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); t += k.length + (localStorage.getItem(k) || '').length } return t } catch { return 0 } }

/**
 * DEMO SAJA — kehadiran rekan kerja.
 * Di demo hanya ada satu orang yang benar-benar membuka ATLAS (Anda), sehingga
 * semua orang lain akan selalu "Offline". Agar status Online / Idle / Offline
 * bisa dilihat, baris pengguna LAIN diberi contoh kehadiran yang bergulir.
 * Mekanismenya tetap yang asli (kolom online_until & last_active_at); baris
 * pengguna yang sedang login tidak pernah diubah — itu data nyata dari denyut.
 * Di mode Supabase/live fungsi ini tidak dipakai sama sekali.
 */
function demoPresence(rows) {
  let me = null
  try { me = sessionStorage.getItem(KEY + ':me') } catch { /* abaikan */ }
  const now = Date.now()
  const iso = (ms) => new Date(ms).toISOString()
  return rows.map((u, i) => {
    if (u.id === me || u.active === false) return u
    const n = i % 4
    if (n === 0) return { ...u, online_until: iso(now + 120000), last_active_at: iso(now - (1 + (i % 7)) * 60000) } // online
    if (n === 1) return { ...u, online_until: iso(now + 120000), last_active_at: iso(now - (18 + (i % 30)) * 60000) } // idle
    return { ...u, online_until: null, last_active_at: iso(now - (2 + (i % 20)) * 3600000) } // offline
  })
}

const demo = {
  // Mode demo tidak punya sistem kata sandi — fungsinya tetap ada supaya
  // tombolnya bisa dicoba, tapi tidak menyimpan apa pun.
  async setUserPassword(email) {
    const u = load().users.find((x) => String(x.email).toLowerCase() === String(email).toLowerCase())
    if (!u) throw new Error('Email itu tidak terdaftar di ATLAS.')
    const d = load()
    for (const p of d.permintaan_sandi || []) if (p.user_id === u.id) p.status = 'selesai'
    save(d)
    return { ok: true, demo: true, nama: u.name }
  },
  // Demo: permintaan reset kata sandi disimulasikan di penyimpanan lokal.
  async mintaResetSandi(email) {
    const d = load(); const u = d.users.find((x) => String(x.email).toLowerCase() === String(email).trim().toLowerCase() && x.active !== false)
    if (u && !(d.permintaan_sandi || []).some((p) => p.user_id === u.id && p.status === 'baru')) { d.permintaan_sandi = [{ id: 'ps-' + Date.now(), user_id: u.id, email: u.email, nama: u.name, cabang: u.branch, role: u.role, dibuat_at: new Date().toISOString(), status: 'baru' }, ...(d.permintaan_sandi || [])]; save(d) }
    return { ok: true, pesan: 'Bila email itu terdaftar, permintaan sudah diteruskan ke Superadmin. Kata sandi baru akan diberikan langsung oleh Superadmin.' }
  },
  async permintaanSandi() { return (load().permintaan_sandi || []).filter((p) => p.status === 'baru') },
  async tutupPermintaanSandi(id) { const d = load(); for (const p of d.permintaan_sandi || []) if (p.id === id) p.status = 'selesai'; save(d) },
  async kontakAkun() { return load().akun_kontak || [] },
  async signIn(email) {
    const u = load().users.find((x) => x.email.toLowerCase() === email.toLowerCase() && x.active !== false)
    if (!u) throw new Error('User tidak ditemukan')
    try { sessionStorage.setItem(KEY + ':me', u.id) } catch { /* abaikan */ }
    return u
  },
  async currentUser() {
    let id = null
    try { id = sessionStorage.getItem(KEY + ':me') } catch { /* abaikan */ }
    return load().users.find((x) => x.id === id) ?? null
  },
  async signOut() { try { sessionStorage.removeItem(KEY + ':me') } catch { /* abaikan */ } },
  async list(t) { const rows = structuredClone(load()[t] ?? []); return t === 'users' ? demoPresence(rows) : rows },
  async insert(t, row) { const r = { id: uid(), created_at: new Date().toISOString(), ...row }; const arr = (load()[t] ||= []); arr.push(r); if (t === 'activity_log' && arr.length > 3000) arr.splice(0, arr.length - 3000); save(); if (t === 'app_settings') perfDemo(mem) && save(); return structuredClone(r) },
  async update(t, id, patch) {
    const arr = (load()[t] ||= []); const i = arr.findIndex((x) => x.id === id)
    if (i < 0) throw new Error('Data tidak ditemukan')
    arr[i] = { ...arr[i], ...patch, updated_at: new Date().toISOString() }; save(); if (t === 'app_settings') perfDemo(mem) && save(); return structuredClone(arr[i])
  },
  async remove(t, id) { load()[t] = load()[t].filter((x) => x.id !== id); save() },
  async reset() { cleanStorage(); mem = seed(); migrate(mem); compactDemo(mem); save() },
  /** Baca ulang dari localStorage — dipakai saat tab lain menulis (mis. chat). */
  async reload() { mem = null; load() },
  async cleanup() { const f = cleanStorage(); shrink(load()); save(); return f },
  token: async () => null,
  // nomor registrasi (demo): dihitung di registrasi.js dari data lokal
  async regNext() { throw new Error('demo') },
  async regInsert(rows) { const arr = (load().registrations ||= []); for (const r of rows || []) { if (arr.some((x) => x.reg_no === r.reg_no)) throw new Error(`Nomor ${r.reg_no} sudah dipakai`); arr.push({ ...r, created_at: new Date().toISOString() }) } save(); return rows },
  async hapusDummy() { const m = load(); const ids = new Set((m.projects || []).filter((p) => p.dummy).map((p) => p.id)); const n = { projects: ids.size, registrations: (m.registrations || []).filter((r) => r.source === 'dummy').length }; m.projects = (m.projects || []).filter((p) => !ids.has(p.id)); m.registrations = (m.registrations || []).filter((r) => r.source !== 'dummy'); m.notifications = (m.notifications || []).filter((x) => !ids.has(x.project_id)); save(); return n },
  async regUpdate(reg_no, patch) { const arr = (load().registrations ||= []); const i = arr.findIndex((x) => x.reg_no === reg_no); if (i >= 0) { arr[i] = { ...arr[i], ...patch }; save() } return patch },
  async regUpsert(rows) { const arr = (load().registrations ||= []); for (const r of rows || []) { const i = arr.findIndex((x) => x.reg_no === r.reg_no); if (i >= 0) arr[i] = { ...arr[i], ...r }; else arr.push({ ...r, created_at: new Date().toISOString() }) } save(); return rows },
  async regList({ project_id, invoice_no } = {}) { return structuredClone((load().registrations || []).filter((r) => (project_id && r.project_id === project_id) || (invoice_no && r.invoice_no === invoice_no))) },
}

// ---------------- LIVE (InsForge) ----------------
let client = null
function ins() {
  if (!client) client = createClient({ baseUrl: URL_, anonKey: import.meta.env.VITE_INSFORGE_ANON_KEY })
  return client
}
const unwrap = ({ data, error }) => { if (error) throw new Error(error.message || 'Gagal memproses data'); return data }

async function profileByEmail(email) {
  const rows = unwrap(await ins().database.from('users').select('*').eq('email', email))
  const u = rows?.[0]
  if (!u || u.active === false) throw new Error('Akun belum terdaftar di ATLAS. Hubungi Superadmin.')
  return u
}

const live = {
  async signIn(email, password) {
    unwrap(await ins().auth.signInWithPassword({ email, password }))
    return profileByEmail(email)
  },
  async currentUser() {
    const { data } = await ins().auth.getCurrentUser()
    const email = data?.user?.email
    return email ? profileByEmail(email).catch(() => null) : null
  },
  async signOut() { await ins().auth.signOut() },
  async list(t) { return unwrap(await ins().database.from(t).select('*').order('created_at', { ascending: false }).limit(2000)) ?? [] },
  async insert(t, row) { return unwrap(await ins().database.from(t).insert([row]).select())?.[0] },
  async update(t, id, patch) { return unwrap(await ins().database.from(t).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select())?.[0] },
  async remove(t, id) { unwrap(await ins().database.from(t).delete().eq('id', id)) },
  async reset() {},
  // token sesi untuk memanggil /api (Zoho & Drive) — dicek ulang di server
  token: async () => { try { const s = await ins().auth.getCurrentSession?.(); return s?.data?.session?.accessToken ?? null } catch { return null } },
}

export const db = MODE === 'supabase' ? supabaseDb : MODE === 'live' ? live : demo
