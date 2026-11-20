// ============================================================
//  SATU PROYEK = SATU BARIS
//  Proyek bisa punya banyak sub project, dokumen, layanan, dan
//  arah bahasa. Berkas ini meringkasnya jadi satu baris tabel,
//  tanpa pernah menggandakan proyeknya.
//
//  Nilai ganda disajikan sebagai "item pertama +sisa", misalnya
//  "Indonesia → Inggris +2". Nilai lengkapnya tetap dibawa di
//  field `*All` supaya filter dan tooltip memakai seluruh isi —
//  jadi memfilter bahasa kedua tetap menemukan proyeknya.
// ============================================================
import { DONE, stagesOf, flowOf, stageLabel } from '../config/workflows.js'
import { PRIORITIES } from '../config/priority.js'

/** Urutan prioritas untuk sortir: makin besar makin mendesak. */
export const prioRank = (p) => {
  const i = PRIORITIES.indexOf(p || 'Normal')
  return i < 0 ? 0 : i
}

/** "Indonesia → Inggris" dari satu sub project. */
export const arahOf = (s) =>
  s?.lang_from && s?.lang_to ? `${s.lang_from} → ${s.lang_to}` : ''

/** Daftar unik, buang yang kosong, pertahankan urutan munculnya. */
const uniq = (arr) => [...new Set(arr.filter((x) => x != null && x !== ''))]

/** "A +2" — item pertama plus jumlah sisanya. */
export const ringkas = (list) =>
  !list.length ? '' : list.length === 1 ? list[0] : `${list[0]} +${list.length - 1}`

/** Tahap berjalan; "Selesai" bila semua sub project tuntas. */
export function statusOf(p) {
  const open = (p.sub_projects || []).filter((s) => s.stage !== DONE)
  if (!open.length) return 'Selesai'
  const labels = uniq(open.map((s) => stageLabel(flowOf(s, p), s.stage)))
  return ringkas(labels)
}

/**
 * Ringkasan satu proyek untuk satu baris tabel.
 * @param {object} p proyek
 * @param {(id: string) => string} namaUser penerjemah/vendor id → nama
 */
const hariKey = (v) => { const t = v ? new Date(v) : null; return t && !Number.isNaN(t.getTime()) ? `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}` : '' }
const geser = (n) => { const t = new Date(); t.setDate(t.getDate() + n); return hariKey(t) }

export function projectRow(p, namaUser = (x) => x, subMilik = null) {
  // subMilik: saringan sub project yang boleh dilihat pengguna ini (mis. penerjemah hanya sub yang ditugaskan kepadanya)
  const subs = subMilik ? (p.sub_projects || []).filter(subMilik) : (p.sub_projects || [])
  const hariIni = hariKey(new Date())
  const besok = geser(1)

  const arahAll = uniq(subs.map(arahOf))
  const layananAll = uniq(subs.map((s) => s.title || s.type))
  const orangAll = uniq(subs.map((s) => {
    const id = s.data?.translator || s.translator || s.data?.vendor
    return id ? namaUser(id) : ''
  }))

  // Rincian dokumen yang dikerjakan (untuk pelaksana: langsung terbaca di baris, tanpa membuka isi project)
  const dokAll = subs.flatMap((s) => {
    const rinci = (s.docs || []).filter((d) => String(d?.desc || '').trim())
    if (rinci.length) return rinci.map((d) => `${String(d.desc).trim()}${Number(d.pages) ? ` · ${Number(d.pages)} hlm` : ''}`)
    const t = String(s.title || '').replace(/^terjemahan tersumpah:\s*/i, '')
    return t ? [`${t}${Number(s.pages) ? ` · ${Number(s.pages)} hlm` : ''}`] : []
  })
  // Jumlah dokumen: pakai rincian docs bila ada, kalau tidak pakai file_count.
  const jmlDok = subs.reduce((n, s) => n + (s.docs?.length || s.file_count || 0), 0)
  const jmlHal = subs.reduce((n, s) => n + (s.docs?.length
    ? s.docs.reduce((a, d) => a + (Number(d.pages) || 0), 0)
    : Number(s.pages) || 0), 0)

  return {
    p,
    id: p.id,
    timestamp: p.created_at || '',
    invoice: p.invoice_no || '',
    pelanggan: p.customer?.name || '',
    prioritas: p.about?.priority || 'Normal',
    prioRank: prioRank(p.about?.priority),
    deadline: p.about?.deadline || '',
    // lewat deadline & belum selesai → ditaruh paling akhir saat urut Deadline
    terlambat: !!p.about?.deadline && hariKey(p.about.deadline) < hariIni && !subs.every((s) => s.stage === DONE),
    status: statusOf(p),
    cabang: p.branch || '',
    print: p.about?.print_location || p.branch || '',
    cs: (p.about?.cs_name || '').replace(/\s*\(.*\)\s*$/, ''),
    arah: ringkas(arahAll), arahAll,
    orang: ringkas(orangAll), orangAll,
    jmlDok, jmlHal, dokAll,
    layanan: ringkas(layananAll), layananAll,
    // penanda visual (lihat ProjectSpreadsheet)
    prioMendesak: (p.about?.priority || 'Normal') !== 'Normal',
    dibuatHariIni: hariKey(p.created_at) === hariIni,
    dlHariIni: hariKey(p.about?.deadline) === hariIni,
    dlBesok: hariKey(p.about?.deadline) === besok,
    subs,
  }
}

/** Kolom tabel: urutan & judul persis seperti yang diminta. */
export const TABLE_COLS = [
  { key: 'invoice', label: 'No. Invoice', w: '132px', sort: (r) => r.invoice, sticky: true },
  { key: 'timestamp', label: 'Timestamp', w: '122px', sort: (r) => r.timestamp },
  { key: 'pelanggan', label: 'Nama Pelanggan', w: '160px', sort: (r) => r.pelanggan.toLowerCase() },
  { key: 'prioritas', label: 'Prioritas', w: '108px', sort: (r) => r.prioRank },
  { key: 'deadline', label: 'Deadline', w: '116px', sort: (r) => r.deadline },
  { key: 'status', label: 'Status', w: '140px', sort: (r) => r.status.toLowerCase() },
  { key: 'cabang', label: 'Cabang', w: '104px', sort: (r) => r.cabang.toLowerCase() },
  { key: 'print', label: 'Print', w: '104px', sort: (r) => r.print.toLowerCase() },
  { key: 'cs', label: 'CS', w: '112px', sort: (r) => r.cs.toLowerCase() },
  { key: 'arah', label: 'Arah Bahasa', w: '164px', sort: (r) => (r.arahAll[0] || '').toLowerCase() },
  // khusus: hanya tampil bila diminta (daftar project pelaksana) — rincian dokumen langsung di baris
  { key: 'cabangCs', label: 'Cabang & CS', w: '130px', khusus: true, sort: (r) => `${r.cabang} ${r.cs}`.toLowerCase() },
  { key: 'dokumen', label: 'Dokumen', w: '300px', khusus: true, sort: (r) => (r.dokAll[0] || '').toLowerCase() },
  { key: 'orang', label: 'Penerjemah/Vendor', w: '156px', sort: (r) => (r.orangAll[0] || '').toLowerCase() },
  { key: 'jmlDok', label: 'Dok', w: '72px', num: true, sort: (r) => r.jmlDok },
  { key: 'jmlHal', label: 'Hal', w: '72px', num: true, sort: (r) => r.jmlHal },
  { key: 'layanan', label: 'Detail Layanan', w: '180px', sort: (r) => (r.layananAll[0] || '').toLowerCase() },
]

/** Urutkan SELURUH hasil lebih dulu, baru dipotong untuk pemuatan bertahap. */
export function sortRows(rows, key, dir) {
  const col = TABLE_COLS.find((c) => c.key === key)
  if (!col) return rows
  const arah = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    // Deadline (urut naik): hari ini, besok, dst.; yang lewat deadline & belum selesai paling akhir
    if (key === 'deadline' && dir === 'asc') { const la = a.terlambat ? 1 : 0, lb = b.terlambat ? 1 : 0; if (la !== lb) return la - lb }
    const x = col.sort(a), y = col.sort(b)
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * arah
    return String(x).localeCompare(String(y), 'id') * arah
  })
}

/** Pilihan filter yang tersedia, diambil dari data yang ada. */
export function filterOptions(rows) {
  const kumpul = (f) => [...new Set(rows.flatMap(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'))
  return {
    prioritas: [...PRIORITIES].reverse(),
    status: kumpul((r) => [r.status]),
    cabang: kumpul((r) => [r.cabang]),
    cs: kumpul((r) => [r.cs]),
    arah: kumpul((r) => r.arahAll),
    orang: kumpul((r) => r.orangAll),
    print: kumpul((r) => [r.print]),
  }
}
/** Rentang jumlah (Dok / Hal) untuk filter di judul kolom. */
export const RENTANG_JML = { '1': [1, 1], '2-5': [2, 5], '6-10': [6, 10], '>10': [11, Infinity] }
/** Pilihan cepat tanggal di judul kolom Timestamp / Deadline → [dari, sampai] (YYYY-MM-DD). */
export function rentangTanggal(kode) {
  const h = geser(0)
  return { hariini: [h, h], kemarin: [geser(-1), geser(-1)], besok: [geser(1), geser(1)], '7lalu': [geser(-6), h], '7depan': [h, geser(6)], bulanini: [`${h.slice(0, 8)}01`, `${h.slice(0, 8)}31`], lewat: ['', geser(-1)] }[kode] || ['', '']
}

/**
 * Terapkan filter. Untuk arah bahasa & penerjemah dicocokkan ke
 * SELURUH nilai (arahAll/orangAll), bukan hanya yang tampil —
 * jadi memfilter bahasa kedua tetap menemukan proyeknya, satu baris.
 */
export function applyFilters(rows, f) {
  return rows.filter((r) => {
    if (f.prioritas && r.prioritas !== f.prioritas) return false
    if (f.status && r.status !== f.status) return false
    if (f.cabang && r.cabang !== f.cabang) return false
    if (f.cs && r.cs !== f.cs) return false
    if (f.arah && !r.arahAll.includes(f.arah)) return false
    if (f.orang && !r.orangAll.includes(f.orang)) return false
    if (f.print && r.print !== f.print) return false
    if (f.layanan && !r.layananAll.join(' ').toLowerCase().includes(String(f.layanan).toLowerCase().trim())) return false
    if (f.invoice && !String(r.invoice).toLowerCase().includes(String(f.invoice).toLowerCase().trim())) return false
    if (f.pelanggan && !String(r.pelanggan).toLowerCase().includes(String(f.pelanggan).toLowerCase().trim())) return false
    if (f.jmlDok && RENTANG_JML[f.jmlDok] && !(r.jmlDok >= RENTANG_JML[f.jmlDok][0] && r.jmlDok <= RENTANG_JML[f.jmlDok][1])) return false
    if (f.jmlHal && RENTANG_JML[f.jmlHal] && !(r.jmlHal >= RENTANG_JML[f.jmlHal][0] && r.jmlHal <= RENTANG_JML[f.jmlHal][1])) return false
    if (f.dibuatDari && String(r.timestamp).slice(0, 10) < f.dibuatDari) return false
    if (f.dibuatSampai && String(r.timestamp).slice(0, 10) > f.dibuatSampai) return false
    if (f.dlDari && String(r.deadline).slice(0, 10) < f.dlDari) return false
    if (f.dlSampai && String(r.deadline).slice(0, 10) > f.dlSampai) return false
    return true
  })
}

export const FILTER_LABEL = {
  prioritas: 'Prioritas', status: 'Status', cabang: 'Cabang', cs: 'CS',
  arah: 'Arah Bahasa', orang: 'Penerjemah/Vendor', print: 'Print', layanan: 'Layanan', invoice: 'No. Invoice', pelanggan: 'Pelanggan', jmlDok: 'Dok', jmlHal: 'Hal',
  dibuatDari: 'Dibuat dari', dibuatSampai: 'Dibuat sampai',
  dlDari: 'Deadline dari', dlSampai: 'Deadline sampai',
}
