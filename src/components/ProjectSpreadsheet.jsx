import { useEffect, useMemo, useRef, useState } from 'react'
import { labelPrioritas } from '../config/priority.js'
import { OfficialInvoice } from './NoReg.jsx'
import { InvoiceNo, TandaAcc } from './badges.jsx'
import { Eye, MoreHorizontal, Search, SlidersHorizontal, X, ArrowUp, ArrowDown, FolderOpen, Printer, ChevronDown } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { Button, Sheet, cx, bisaDitekan } from './ui.jsx'
import { invoiceLabel, accEmail } from '../config/access.js'
import SalinInvoice from './SalinInvoice.jsx'
import { tanggalJam, tanggal } from '../lib/waktu.js'
import { projectRow, TABLE_COLS, sortRows, filterOptions, applyFilters, FILTER_LABEL, RENTANG_JML, rentangTanggal } from '../lib/projectRow.js'
import { stageLabel, flowOf, isDone } from '../config/workflows.js'
import { grupOf, garisUrgensi, sisaWaktu, kelasGrup, labelGrup } from '../lib/urgensi.js'
import { Stepper, StatusVendor } from '../pages/Projects.jsx'
import { progressOf } from '../config/workflows.js'
import { SUB_TYPES } from '../config/subtypes.js'
import CentangApostille from './CentangApostille.jsx'

const PAGE = 36

/** Judul sub tanpa awalan "Terjemahan Tersumpah:" (jenis yang paling umum). Jenis lain (Apostille, Legalisasi, …) tetap memakai awalannya
 *  karena kolom Kategori sudah dihapus — supaya jenis layanannya tetap terbaca. */
const judulTanpaKategori = (x) => { const t = String(x.title || ''); return x.type === 'terjemahan' ? t.replace(/^terjemahan tersumpah:\s*/i, '') || t : t }

/** Lingkaran penanda: hitam = prioritas mendesak, hijau = diinput hari ini,
 *  merah = deadline hari ini, oranye = deadline besok. */
function Lingkar({ warna, judul, children }) {
  if (!warna) return children
  // Kapsul solid (latar penuh, teks putih) — sama dengan aturan kapsul di tampilan List
  const w = { hitam: 'bg-ink', hijau: 'bg-emerald-600', merah: 'bg-rose-600', oranye: 'bg-orange-500' }[warna]
  return (
    <span title={judul} data-kapsul={warna} className={cx('inline-block max-w-full truncate whitespace-nowrap rounded-full px-2 py-0.5 font-semibold text-white', w)}>{children}</span>
  )
}

/** Sel yang isinya bisa lebih dari satu — klik untuk melihat semuanya. */
function SelGanda({ ringkas, semua, align }) {
  const [buka, setBuka] = useState(false)
  if (!semua?.length) return <span className="text-ink-mute">—</span>
  if (semua.length === 1) return <span className="block truncate" title={semua[0]}>{semua[0]}</span>
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); setBuka((b) => !b) }}
      title={semua.join('\n')} aria-expanded={buka}
      className={cx('block w-full min-w-0 text-left hover:underline', align)}>
      {buka
        ? <span className="block space-y-0.5">{semua.map((v, i) => <span key={i} className="block break-words">{v}</span>)}</span>
        : <span className="block truncate">{ringkas}</span>}
    </button>
  )
}

/** Menu titik tiga untuk aksi tambahan. */
function MenuAksi({ row, onFiles, onPrint }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const tutup = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', tutup)
    return () => document.removeEventListener('pointerdown', tutup)
  }, [open])
  return (
    <span ref={ref} className="relative inline-block">
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        title="Tindakan lain" aria-label={`Tindakan lain untuk ${invoiceLabel(row.invoice)}`} aria-haspopup="menu" aria-expanded={open}
        className="grid h-11 w-11 place-items-center rounded-lg text-ink-mute ring-1 ring-slate-200 hover:bg-white hover:text-brand md:h-7 md:w-7">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <span role="menu" className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200">
          <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setOpen(false); onFiles(row.p) }}
            title="Buka folder file project"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-50">
            <FolderOpen className="h-4 w-4 text-ink-mute" />File project
          </button>
          <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setOpen(false); onPrint(row.p) }}
            title="Cetak dokumen sesuai alur dan izin yang berlaku"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-50">
            <Printer className="h-4 w-4 text-ink-mute" />Cetak dokumen
          </button>
        </span>
      )}
    </span>
  )
}

/** Rincian sub project — tabel sederhana yang muncul di bawah baris induk. */
function BarisSub({ subs, kolom, tanpaTahap }) {
  if (!subs.length) return <p className="px-3 py-3 text-xs text-ink-mute">Belum ada sub project.</p>
  return (
    <div className="min-w-0 max-w-full overflow-x-auto px-3 py-2">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="text-ink-mute">
            {['#', 'Judul', 'Arah Bahasa', 'Penerjemah/Vendor', 'Dok.', 'Hlm.', 'Tahap'].filter((h) => !(tanpaTahap && h === 'Tahap')).map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-2 py-1.5 font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subs.map((x, i) => (
            <tr key={x.id || i} className="border-t border-slate-100">
              <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-ink-mute">{i + 1}</td>
              <td className="max-w-[320px] truncate px-2 py-1.5 font-semibold" title={x.judul}>{x.judul || '—'}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{x.arah || '—'}</td>
              <td className="max-w-[160px] truncate px-2 py-1.5" title={x.orang}>{x.orang || '—'}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{x.dok}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{x.hal}</td>
              {!tanpaTahap && <td className="px-2 py-1.5 text-brand">{x.raw ? <CentangApostille p={x.p} sb={x.raw} label={x.tahap || '—'} /> : (x.tahap || '—')}{x.raw && <StatusVendor sb={x.raw} />}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ProjectSpreadsheet({ list, detailFor, onDetail, onFiles, onPrint, state, setState, hideCols = [], renderAksi, pref = {}, tanpaCari, kepalaAksi, renderIsi, subMilik = null, tanpaTahap = false, selaluBuka = false, kolomKhusus = [], tanpaIsi = false, lebarAksi = '', renderBawahHp = null, selesaiUntuk = null }) {
  // Baris hijau muda = selesai. Untuk pelaksana "selesai" = bagiannya sudah beres (selesaiUntuk), bukan seluruh project.
  const beres = (p) => (selesaiUntuk ? selesaiUntuk(p) : isDone(p))
  // lebar area tabel yang terlihat → isi baris (sub project) selalu pas kiri-kanan, tidak melebar ke kanan
  const gulirRef = useRef(null)
  const [lebarTampak, setLebarTampak] = useState(0)
  useEffect(() => {
    const el = gulirRef.current; if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => setLebarTampak(el.clientWidth)); ro.observe(el); setLebarTampak(el.clientWidth)
    return () => ro.disconnect()
  })
  // Kolom yang disembunyikan untuk peran tertentu (mis. pelaksana freelance tidak punya cabang),
  // lalu pilihan pengguna (Tampilan › Kolom tabel).
  // kolom `khusus` hanya tampil bila diminta lewat kolomKhusus (dan tidak ikut pilihan kolom pengguna)
  const KOLOM = TABLE_COLS.filter((c) => !hideCols.includes(c.key)).filter((c) => (c.khusus ? kolomKhusus.includes(c.key) : !pref.tabelCols || c.key === 'invoice' || pref.tabelCols.includes(c.key)))
  // Lebar kolom bisa ditarik dari batas judul; disimpan per perangkat.
  const [lebar, setLebar] = useState(() => { try { return JSON.parse(localStorage.getItem('atlas-tabel-lebar') || '{}') } catch { return {} } })
  const simpanLebar = (next) => { setLebar(next); try { localStorage.setItem('atlas-tabel-lebar', JSON.stringify(next)) } catch { /* abaikan */ } }
  const mulaiTarik = (e, key, awal) => {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX; const w0 = parseInt(lebar[key] || awal, 10) || 120
    const gerak = (ev) => setLebar((l) => ({ ...l, [key]: `${Math.max(64, w0 + ev.clientX - x0)}px` }))
    const lepas = (ev) => { window.removeEventListener('pointermove', gerak); window.removeEventListener('pointerup', lepas); simpanLebar({ ...lebar, [key]: `${Math.max(64, w0 + ev.clientX - x0)}px` }) }
    window.addEventListener('pointermove', gerak); window.addEventListener('pointerup', lepas)
  }
  const [lipat, setLipat] = useState(() => new Set())
  // HP: saat tabel digulir ke samping, kolom invoice yang menempel ikut mengecil supaya ruang baca lebih lega
  const [digulir, setDigulir] = useState(false)
  const { data } = useApp()
  const namaUser = useMemo(() => {
    const peta = new Map()
    for (const u of data.users || []) peta.set(u.id, (u.name || '').replace(/\s*\(.*\)\s*$/, ''))
    for (const o of data.people || []) peta.set(o.id, o.name || '')
    return (id) => peta.get(id) || ''
  }, [data.users, data.people])

  // Pencarian, filter, dan urutan disimpan di induk supaya tetap bertahan
  // ketika panel detail dibuka-tutup atau setelah aksi cetak.
  const { q = '', sortKey = 'timestamp', sortDir = 'desc', filters = {}, shownN = PAGE } = state
  const set = (patch) => setState((s) => ({ ...s, ...patch }))
  const [buka, setBuka] = useState(() => new Set())
  // selaluBuka: isi baris (rincian sub) terbuka sejak awal; klik baris untuk menutup — `buka` lalu berarti daftar yang DITUTUP
  const terbuka = (id) => (selaluBuka ? !buka.has(id) : buka.has(id))
  const toggleBaris = (id) => setBuka((v) => { const n = new Set(v); n.has(id) ? n.delete(id) : n.add(id); return n })
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)
  useEffect(() => {
    if (!filterOpen) return
    const tutup = (e) => { if (!filterRef.current?.contains(e.target)) setFilterOpen(false) }
    document.addEventListener('pointerdown', tutup)
    return () => document.removeEventListener('pointerdown', tutup)
  }, [filterOpen])

  const semuaRow = useMemo(() => list.map((p) => projectRow(p, namaUser, subMilik)), [list, namaUser, subMilik])
  const opsi = useMemo(() => filterOptions(semuaRow), [semuaRow])
  // ---------- Filter di SETIAP judul kolom ----------
  const setF = (patch) => set({ filters: { ...filters, ...patch }, shownN: PAGE })
  const jmlPer = useMemo(() => {
    const m = { prioritas: {}, cabang: {}, print: {}, cs: {}, arah: {}, orang: {}, layanan: {} }
    const tambah = (k, v) => { if (v) m[k][v] = (m[k][v] || 0) + 1 }
    for (const r of semuaRow) { tambah('prioritas', r.prioritas); tambah('cabang', r.cabang); tambah('print', r.print); tambah('cs', r.cs); r.arahAll.forEach((v) => tambah('arah', v)); r.orangAll.forEach((v) => tambah('orang', v)) }
    return m
  }, [semuaRow])
  const TGL = { timestamp: ['dibuatDari', 'dibuatSampai', [['hariini', 'Hari ini'], ['kemarin', 'Kemarin'], ['7lalu', '7 hari terakhir'], ['bulanini', 'Bulan ini']]], deadline: ['dlDari', 'dlSampai', [['hariini', 'Hari ini'], ['besok', 'Besok'], ['7depan', '7 hari ke depan'], ['bulanini', 'Bulan ini'], ['lewat', 'Sudah lewat']]] }
  const KOLOM_TEKS = ['invoice', 'pelanggan', 'layanan']
  const KOLOM_JML = ['jmlDok', 'jmlHal']
  const bisaFilter = (c) => KOLOM_TEKS.includes(c.key) || KOLOM_JML.includes(c.key) || !!TGL[c.key] || !!opsi[c.key]
  const filterAktif = (c) => (TGL[c.key] ? !!(filters[TGL[c.key][0]] || filters[TGL[c.key][1]]) : !!filters[c.key])
  const [fOpen, setFOpen] = useState(null) // kolom yang popup filternya sedang terbuka
  // Judul kolom: tombol kecil ▾ (sama dengan tampilan Kartu) → popup filter baru muncul saat diklik
  const filterJudul = (c) => bisaFilter(c) && (
    <button type="button" onClick={(e) => { e.stopPropagation(); setFOpen(c.key) }} aria-label={`Filter ${c.label}${filterAktif(c) ? ' (aktif)' : ''}`} title={`Filter ${c.label}`} data-filter-kolom={c.key} aria-haspopup="dialog"
      className={cx('ml-1 inline-grid h-6 w-6 shrink-0 place-items-center rounded-md align-middle max-md:h-9 max-md:w-9', filterAktif(c) ? 'bg-[#4169E1] text-white' : 'text-[#5E6380] hover:bg-white')}><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></button>
  )
  const kolomF = fOpen ? TABLE_COLS.find((c) => c.key === fOpen) : null
  const isiFilter = () => {
    const c = kolomF; if (!c) return null
    const pilih = (patch) => { setF(patch); setFOpen(null) }
    const tbl = (aktif) => cx('flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm font-semibold ring-1 transition', aktif ? 'bg-[#141B34] text-white ring-[#141B34]' : 'bg-white text-ink ring-slate-200 hover:ring-slate-400')
    if (KOLOM_TEKS.includes(c.key)) return (
      <label className="block text-xs font-semibold text-ink-soft">Ketik sebagian {c.label.toLowerCase()}
        <input type="search" autoFocus value={filters[c.key] || ''} onChange={(e) => setF({ [c.key]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && setFOpen(null)} placeholder="Cari…" data-isi-filter
          className="mt-1 block min-h-11 w-full rounded-xl border-0 bg-white px-3 text-base text-ink ring-1 ring-slate-300 focus:ring-2 focus:ring-[#4169E1] md:text-sm" />
      </label>
    )
    if (TGL[c.key]) {
      const [dari, sampai, opsiTgl] = TGL[c.key]
      const cocok = (k) => { const [a, b] = rentangTanggal(k); return (filters[dari] || '') === a && (filters[sampai] || '') === b }
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">{opsiTgl.map(([k, l]) => <button key={k} type="button" onClick={() => { const [a, b] = rentangTanggal(k); pilih({ [dari]: a, [sampai]: b }) }} className={tbl(cocok(k))} data-opsi-filter={k}>{l}</button>)}</div>
          <div>
            <p className="mb-1 text-xs font-semibold text-ink-soft">Rentang tanggal</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-ink-mute">Dari<input type="date" value={filters[dari] || ''} onChange={(e) => setF({ [dari]: e.target.value })} className="mt-1 block min-h-11 w-full rounded-xl border-0 bg-white px-2.5 text-base ring-1 ring-slate-300 md:text-sm" /></label>
              <label className="text-xs text-ink-mute">Sampai<input type="date" value={filters[sampai] || ''} onChange={(e) => setF({ [sampai]: e.target.value })} className="mt-1 block min-h-11 w-full rounded-xl border-0 bg-white px-2.5 text-base ring-1 ring-slate-300 md:text-sm" /></label>
            </div>
          </div>
        </div>
      )
    }
    const daftar = KOLOM_JML.includes(c.key) ? Object.keys(RENTANG_JML) : (opsi[c.key] || [])
    const jml = c.key === 'status' ? jmlStatus : jmlPer[c.key] || {}
    return (
      <div className={cx('grid gap-2', daftar.length > 6 ? 'sm:grid-cols-2' : 'grid-cols-2')}>
        {daftar.map((v) => <button key={v} type="button" onClick={() => pilih({ [c.key]: v })} className={tbl(filters[c.key] === v)} data-opsi-filter={v}><span className="min-w-0 truncate">{KOLOM_JML.includes(c.key) ? v.replace('-', '–') : v}</span>{jml[v] ? <span className="shrink-0 text-xs font-medium opacity-60">{jml[v]}</span> : null}</button>)}
      </div>
    )
  }
  const kosongkanF = () => { const c = kolomF; if (!c) return; setF(TGL[c.key] ? { [TGL[c.key][0]]: '', [TGL[c.key][1]]: '' } : { [c.key]: '' }); setFOpen(null) }
  // jumlah project per status (tahap) — untuk filter di judul kolom Status
  const jmlStatus = useMemo(() => { const m = {}; for (const r of semuaRow) m[r.status] = (m[r.status] || 0) + 1; return m }, [semuaRow])

  const hasil = useMemo(() => {
    const s = q.trim().toLowerCase()
    let r = semuaRow
    if (s) r = r.filter((x) => invoiceLabel(x.invoice).toLowerCase().includes(s) || x.pelanggan.toLowerCase().includes(s))
    r = applyFilters(r, filters)
    const urut = sortRows(r, sortKey, sortDir) // diurutkan utuh dulu, baru dipotong
    // yang masih berjalan selalu di atas; yang SELESAI tetap tampil, di bagian bawah (urutan di dalamnya tidak berubah)
    // paling atas: yang sudah dibalas/di-ACC otorisator lewat email (sampai nomor register terbit)
    return [...urut.filter((x) => accEmail(x.p)), ...urut.filter((x) => !accEmail(x.p) && !isDone(x.p)), ...urut.filter((x) => !accEmail(x.p) && isDone(x.p))]
  }, [semuaRow, q, filters, sortKey, sortDir])

  const tampil = hasil.slice(0, shownN)
  const chips = Object.entries(filters).filter(([, v]) => v)

  const klikJudul = (key) => {
    if (key === sortKey) set({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })
    else set({ sortKey: key, sortDir: key === 'timestamp' ? 'desc' : 'asc' })
  }

  const nilai = (r, key) => {
    if (key === 'timestamp') {
      // Tanggal & jam dipisah supaya proporsional: kapsul hanya pada tanggal, jam di bawahnya.
      const [tgl, jam] = String(tanggalJam(r.timestamp) || '').split(/\s(?=\d{1,2}[.:]\d{2}$)/)
      return (
        <span className="block whitespace-nowrap leading-tight">
          <Lingkar warna={r.dibuatHariIni ? 'hijau' : ''} judul={r.dibuatHariIni ? 'Diinput hari ini' : tanggalJam(r.timestamp)}>
            <span className="tabular-nums text-xs">{tgl}</span>
          </Lingkar>
          {jam && <span className="mt-0.5 block text-[11px] tabular-nums text-ink-mute">{jam}</span>}
        </span>)
    }
    if (key === 'invoice') return (
      <Lingkar warna={r.prioMendesak ? 'hitam' : ''} judul={r.prioMendesak ? `Prioritas ${r.prioritas}` : ''}>
        <span className="inline-flex items-center gap-0.5"><InvoiceNo project={r.p} /><TandaAcc project={r.p} className="ml-1" /><OfficialInvoice project={r.p} className="ml-0.5" /><SalinInvoice no={invoiceLabel(r.invoice)} /></span>
      </Lingkar>)
    if (key === 'deadline') {
      const w = r.dlHariIni ? 'merah' : r.dlBesok ? 'oranye' : ''
      return (<>
        <Lingkar warna={w} judul={r.dlHariIni ? 'Deadline hari ini' : r.dlBesok ? 'Deadline besok' : tanggal(r.deadline)}>
          <span className="tabular-nums">{r.deadline ? tanggal(r.deadline) : '—'}</span>
        </Lingkar>{pref.urgensi && sisaWaktu(r.p) && <span className={cx('block text-[10.5px] font-bold', grupOf(r.p) === 'terlambat' ? 'text-rose-600' : 'text-orange-600')}>{sisaWaktu(r.p)}</span>}</>)
    }
    if (key === 'dokumen') return !r.dokAll?.length ? <span className="text-ink-mute">—</span> : (
      <ol className="min-w-0 space-y-0.5 text-[12.5px] leading-snug" data-dok-baris>
        {r.dokAll.slice(0, 5).map((d, i) => <li key={i} className="flex min-w-0 gap-1.5"><span className="shrink-0 tabular-nums text-ink-mute">{i + 1}.</span><span className="min-w-0 break-words md:line-clamp-2" title={d}>{d}</span></li>)}
        {r.dokAll.length > 5 && <li className="text-[11px] font-semibold text-ink-mute" title={r.dokAll.slice(5).join('\n')}>+{r.dokAll.length - 5} dokumen lagi</li>}
      </ol>)
    if (key === 'arah') return <SelGanda ringkas={r.arah} semua={r.arahAll} />
    if (key === 'orang') return <SelGanda ringkas={r.orang} semua={r.orangAll} />
    if (key === 'layanan') return <SelGanda ringkas={r.layanan} semua={r.layananAll} />
    if (key === 'jmlDok' || key === 'jmlHal') return <span className="block tabular-nums md:text-right">{r[key] || 0}</span>
    if (key === 'prioritas') return <span className={cx('inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold',
      r.prioritas === 'Normal' ? 'bg-slate-100 text-ink-soft' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200')}>{r.prioritas}</span>
    if (key === 'status') return <span className="block min-w-0"><span className="block truncate text-xs font-semibold text-brand" title={r.status}>{r.status}</span>{pref.stepper && <span className="mt-1 block w-24"><Stepper p={r.p} prog={progressOf(r.p)} kecil /></span>}</span>
    const v = r[key]
    return <span className="block truncate" title={v}>{v || '—'}</span>
  }

  return (
    <div className="min-w-0 space-y-3">
      {/* ---------- Pencarian & filter (di HP pakai pencarian/filter halaman, supaya tidak dobel) ---------- */}
      <div className={cx('hidden min-w-0 flex-wrap items-center gap-2', !tanpaCari && 'md:flex')}>
        <label className="relative block min-w-0 flex-1 basis-full sm:basis-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden="true" />
          <input value={q} onChange={(e) => set({ q: e.target.value, shownN: PAGE })}
            placeholder="Cari no. invoice atau nama pelanggan…" aria-label="Cari project"
            className="w-full max-w-full rounded-xl border-0 bg-white py-2.5 pl-9 pr-3 text-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-brand" />
        </label>
        <span ref={filterRef} className="relative">
          <Button variant="outline" onClick={() => setFilterOpen((o) => !o)} aria-expanded={filterOpen} title="Saring hasil">
            <SlidersHorizontal className="h-4 w-4" />Filter{chips.length > 0 && <span className="ml-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-ink px-1 text-[11px] font-bold text-white">{chips.length}</span>}
          </Button>
          {filterOpen && (
            <div className="absolute right-0 z-30 mt-1 w-[min(92vw,20rem)] max-w-[92vw] space-y-2.5 rounded-xl bg-white p-3 shadow-xl ring-1 ring-slate-200">
              {[['prioritas', opsi.prioritas], ['status', opsi.status], ['cabang', opsi.cabang], ['cs', opsi.cs], ['arah', opsi.arah], ['orang', opsi.orang]].filter(([k]) => !hideCols.includes(k)).map(([k, list]) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-mute">{FILTER_LABEL[k]}</span>
                  <select value={filters[k] || ''} onChange={(e) => set({ filters: { ...filters, [k]: e.target.value }, shownN: PAGE })}
                    className="w-full max-w-full rounded-lg border-0 bg-slate-50 py-2 pl-2.5 pr-7 text-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-brand">
                    <option value="">Semua</option>
                    {list.map((v) => <option key={v} value={v}>{k === 'prioritas' ? labelPrioritas(v) : v}</option>)}
                  </select>
                </label>
              ))}
              {[['Dibuat', 'dibuatDari', 'dibuatSampai'], ['Deadline', 'dlDari', 'dlSampai']].map(([judul, a, b]) => (
                <div key={judul}>
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-mute">{judul}</span>
                  <div className="flex min-w-0 gap-2">
                    {[a, b].map((k) => (
                      <input key={k} type="date" value={filters[k] || ''} aria-label={FILTER_LABEL[k]}
                        onChange={(e) => set({ filters: { ...filters, [k]: e.target.value }, shownN: PAGE })}
                        className="min-w-0 flex-1 rounded-lg border-0 bg-slate-50 px-2 py-2 text-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-brand" />
                    ))}
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={() => { set({ filters: {}, shownN: PAGE }); setFilterOpen(false) }}>Reset semua filter</Button>
            </div>
          )}
        </span>
      </div>

      {/* ---------- Chip filter aktif ---------- */}
      {chips.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {chips.map(([k, v]) => (
            <span key={k} className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">
              <span className="truncate">{FILTER_LABEL[k]}: {v}</span>
              <button type="button" onClick={() => set({ filters: { ...filters, [k]: '' }, shownN: PAGE })}
                aria-label={`Hapus filter ${FILTER_LABEL[k]}`} className="rounded-full p-0.5 hover:bg-white/70"><X className="h-3 w-3" /></button>
            </span>
          ))}
          <button type="button" onClick={() => set({ filters: {}, shownN: PAGE })} className="rounded-full px-2 py-1 text-xs font-semibold text-ink-mute hover:bg-slate-100">Reset</button>
        </div>
      )}

      <Sheet open={!!kolomF} onClose={() => setFOpen(null)} title={kolomF ? `Filter ${kolomF.label}` : ''}
        footer={<><Button variant="outline" className="flex-1" onClick={kosongkanF} data-aksi="filter-semua">Tampilkan semua</Button><Button className="flex-[2]" onClick={() => setFOpen(null)}>Selesai</Button></>}>
        <div data-popup-filter={fOpen || ''}>{isiFilter()}</div>
      </Sheet>
      {/* ---------- Tabel ---------- */}
      {hasil.length === 0 && chips.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-ink-mute ring-1 ring-slate-200">Tidak ada project yang cocok.</p>
      ) : (
        <div ref={gulirRef} className={cx('min-w-0 max-w-full overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200', digulir && 'tabel-digulir')} data-digulir={digulir ? '1' : '0'}
          onScroll={(e) => {
            const el = e.currentTarget; const x = el.scrollLeft
            // nilai 0–1 mengikuti jarak gulir → kolom invoice mengecil perlahan (tanpa render ulang React)
            if (!el._raf) el._raf = requestAnimationFrame(() => { el._raf = 0; el.style.setProperty('--ciut', String(Math.min(1, Math.max(0, el.scrollLeft / 180)).toFixed(3))) })
            const g = x > 12; if (g !== digulir) setDigulir(g)
          }}>
          <table className={cx('w-max min-w-full border-collapse text-left align-top text-sm md:w-full', pref.ukuranTabel === 'kecil' && 'tabel-kecil', pref.ukuranTabel === 'besar' && 'tabel-besar')} data-tabel-hp="gulir" data-ukuran={pref.ukuranTabel || 'normal'}>
            <thead>
              <tr>
                {KOLOM.map((c) => (
                  <th key={c.key} scope="col" style={tanpaIsi && !lebar[c.key] ? (c.key === 'dokumen' ? { width: '34%', minWidth: '170px' } : undefined) : { width: lebar[c.key] || c.w, minWidth: lebar[c.key] || c.w }}
                    className={cx('relative sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-bold text-ink-soft',
                      c.sticky && 'left-0 z-20 shadow-[6px_0_8px_-6px_rgba(15,23,42,.25)] md:shadow-none')}>
                    <span onPointerDown={(e) => mulaiTarik(e, c.key, c.w)} onDoubleClick={() => simpanLebar({ ...lebar, [c.key]: undefined })} title="Tarik untuk mengubah lebar · klik dua kali untuk kembali"
                      className="absolute right-0 top-0 hidden h-full w-2 cursor-col-resize select-none md:block hover:bg-brand/30" aria-hidden="true" data-tarik-kolom />
                    <button type="button" onClick={() => klikJudul(c.key)}
                      title={`Urutkan menurut ${c.label}`} aria-label={`Urutkan menurut ${c.label}`}
                      className={cx('inline-flex items-center gap-1 hover:text-ink', c.num && 'md:w-full md:justify-end')}>
                      {c.label}
                      {sortKey === c.key && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                    {filterJudul(c)}
                  </th>
                ))}
                <th scope="col" style={{ width: lebarAksi || (tanpaIsi ? '64px' : renderAksi ? '250px' : '104px'), minWidth: lebarAksi || (tanpaIsi ? '64px' : renderAksi ? '250px' : '104px') }} className={cx('sticky top-0 z-20 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-ink-soft md:right-0', tanpaIsi && 'right-0 text-right')}>{kepalaAksi || 'Aksi'}</th>
              </tr>
            </thead>
            <tbody>
              {hasil.length === 0 && <tr><td colSpan={KOLOM.length + 1} className="px-4 py-10 text-sm text-ink-mute" data-kosong-filter>Tidak ada project yang cocok dengan filter ini — ubah pilihan di judul kolom atau tekan Reset.</td></tr>}
              {tampil.map((r, i) => (
                <tr key={r.id} {...(tanpaIsi ? {} : { onClick: () => toggleBaris(r.id), ...bisaDitekan(() => toggleBaris(r.id)), 'aria-expanded': terbuka(r.id), title: 'Klik untuk melihat sub project' })} data-grup={grupOf(r.p)}
                  className={cx(!tanpaIsi && 'cursor-pointer', 'border-b border-slate-100 align-top last:border-0 md:hover:bg-brand-soft/40',
                    detailFor?.id === r.id ? 'bg-brand-soft/60' : terbuka(r.id) ? 'bg-brand-soft/40' : beres(r.p) ? 'bg-[#DDF5E4] dark:bg-[#143524]' : i % 2 === 1 ? 'bg-slate-100 md:bg-slate-50/60' : 'bg-white')} data-selesai={beres(r.p) ? '' : undefined}>
                  {KOLOM.map((c) => (
                    <td key={c.key} data-label={c.label}
                      className={cx('min-w-0 max-w-full whitespace-nowrap md:whitespace-normal', tanpaIsi ? 'px-2.5 py-2' : 'px-3 py-2.5', c.sticky && cx('sticky left-0 z-[1] shadow-[6px_0_8px_-6px_rgba(15,23,42,.25)] md:shadow-none', detailFor?.id === r.id || terbuka(r.id) ? 'bg-[#eef4fb]' : beres(r.p) ? 'bg-[#DDF5E4] dark:bg-[#143524]' : i % 2 === 1 ? 'bg-slate-100 md:bg-slate-50' : 'bg-white'), c.sticky && pref.urgensi && cx('border-l-[3px]', garisUrgensi(r.p)))}>
                      {nilai(r, c.key)}
                    </td>
                  ))}
                  <td data-label="Aksi" className={cx('px-3 md:sticky', tanpaIsi ? cx('sticky right-0 z-10 py-2 text-right shadow-[-8px_0_10px_-8px_rgba(15,23,42,.18)]', beres(r.p) ? 'bg-[#DDF5E4] dark:bg-[#143524]' : i % 2 === 1 ? 'bg-slate-100 md:bg-slate-50' : 'bg-white') : 'py-2.5', ' md:right-0 md:z-10 md:shadow-[-8px_0_10px_-8px_rgba(15,23,42,.18)]', beres(r.p) && !(detailFor?.id === r.id || terbuka(r.id)) ? 'md:bg-[#DDF5E4] dark:md:bg-[#143524]' : tanpaIsi ? '' : 'md:bg-white')}>
                    {renderAksi ? renderAksi(r.p) : <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => onDetail(r.p)} title="Lihat detail project"
                        aria-label={`Lihat detail project ${invoiceLabel(r.invoice)}`}
                        className={cx('grid h-11 w-11 place-items-center rounded-lg ring-1 transition md:h-7 md:w-7',
                          detailFor?.id === r.id ? 'bg-brand text-white ring-brand' : 'bg-white text-brand ring-brand/30 hover:bg-brand hover:text-white')}>
                        <Eye className="h-4 w-4" />
                      </button>
                      <MenuAksi row={r} onFiles={onFiles} onPrint={onPrint} />
                    </span>}
                  </td>
                </tr>
              )).flatMap((tr, idx) => {
                const r = tampil[idx]
                const out = []
                // Baris judul grup tenggat (hanya bila urutan menurut deadline, supaya grupnya runtut)
                if (pref.grup && sortKey === 'deadline') {
                  const gDari = (p) => (accEmail(p) ? 'acc' : grupOf(p)) // baris ACC punya grup sendiri di paling atas
                  const g = gDari(r.p); const sebelum = idx > 0 ? gDari(tampil[idx - 1].p) : null
                  if (g !== sebelum) out.push(
                    <tr key={`g-${g}-${idx}`} data-grup-tenggat={g}>
                      <td colSpan={KOLOM.length + 1} className={cx('sticky left-0 border-y px-3 py-1 text-[11.5px] font-extrabold', g === 'acc' ? 'border-sky-200 bg-sky-50 text-sky-900' : kelasGrup(g))}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setLipat((v) => { const n = new Set(v); n.has(g) ? n.delete(g) : n.add(g); return n }) }} className="flex w-full items-center gap-2 text-left">
                          {lipat.has(g) ? '▸' : '▾'} {g === 'acc' ? 'ACC otorisator — menunggu nomor register' : labelGrup(g)}<span className="font-semibold opacity-70">· {hasil.filter((x) => gDari(x.p) === g).length}</span>
                        </button>
                      </td>
                    </tr>)
                  if (lipat.has(g)) return out
                }
                if (tanpaIsi) {
                  // HP: aksi tugas (Mulai / Lanjutkan / Tolak) di baris sendiri di bawah project — selebar layar, mudah dijangkau jempol
                  const bawah = renderBawahHp?.(r.p)
                  return bawah ? [...out, tr, (
                    <tr key={`${r.id}-aksi-hp`} className="border-b border-slate-100 bg-slate-50/70 md:hidden" data-aksi-hp>
                      <td colSpan={KOLOM.length + 1} className="p-0"><div className="sticky left-0 min-w-0 px-3 py-2" style={lebarTampak ? { width: lebarTampak } : undefined}>{bawah}</div></td>
                    </tr>)] : [...out, tr]
                }
                if (!terbuka(r.id)) return [...out, tr]
                return [...out, tr, (
                  <tr key={`${r.id}-sub`} className="border-b border-slate-100 bg-slate-50/70">
                    <td colSpan={KOLOM.length + 1} className="p-0">
                      <div className="sticky left-0 min-w-0 overflow-hidden" style={lebarTampak ? { width: lebarTampak } : undefined} data-isi-baris-tabel>
                      {renderIsi ? renderIsi(r.p) : <BarisSub kolom={KOLOM} tanpaTahap={tanpaTahap} subs={(r.subs || []).map((x) => ({
                        id: x.id, raw: x, p: r.p, judul: judulTanpaKategori(x), kategori: (SUB_TYPES[x.type] || SUB_TYPES.jasa_lain).label,
                        arah: x.lang_from && x.lang_to ? `${x.lang_from} → ${x.lang_to}` : '',
                        orang: namaUser(x.data?.translator || x.translator || x.data?.vendor || ''),
                        dok: x.docs?.length || x.file_count || 0,
                        hal: x.docs?.length ? x.docs.reduce((a, d) => a + (Number(d.pages) || 0), 0) : (Number(x.pages) || 0),
                        // nama tahap yang terbaca, bukan kode mentah ('siap_print')
                        tahap: x.stage ? stageLabel(flowOf(x, r.p), x.stage) : '',
                      }))} />}
                      </div>
                    </td>
                  </tr>
                )]
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasil.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 px-1 text-[11px] text-ink-mute" data-ringkas-tabel>
          <span><b className="text-ink">{hasil.length}</b> project</span>
          <span><b className="text-rose-600">{hasil.filter((r) => grupOf(r.p) === 'terlambat').length}</b> terlambat</span>
          <span><b className="text-orange-600">{hasil.filter((r) => grupOf(r.p) === 'hariini').length}</b> hari ini</span>
          <span><b className="text-ink">{hasil.reduce((a, r) => a + (r.jmlHal || 0), 0)}</b> hlm</span>
          {pref.grup && sortKey !== 'deadline' && <span className="ml-auto">grup tenggat tampil saat diurutkan menurut Deadline</span>}
        </p>
      )}
      {hasil.length > shownN && (
        <Button variant="outline" className="w-full" onClick={() => set({ shownN: shownN + PAGE })}>
          Tampilkan {PAGE} lagi ({hasil.length - shownN} tersisa)
        </Button>
      )}
    </div>
  )
}
