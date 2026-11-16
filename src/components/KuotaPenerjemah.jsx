import { useMemo, useState } from 'react'
import { Users, ChevronDown, ChevronUp } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { Card, cx } from './ui.jsx'
import { placeOf } from '../config/access.js'
import { flowOf, stageIndex, DONE } from '../config/workflows.js'
import { halamanSub } from '../pages/Dashboard.jsx'
import { hariIni, tambahHari } from './ToolbarRingkas.jsx'
import { tgl } from '../lib/format.js'

// ============================================================
//  KUOTA PENERJEMAH (halaman Penugasan)
//  Berapa dokumen & halaman yang DITUGASKAN / DIKERJAKAN tiap
//  penerjemah pada rentang tanggal — bawaan: bulan ini.
//  Tanggal yang dipakai: tanggal ditugaskan dan tanggal selesai
//  diterjemahkan (bukan deadline). Hanya menghitung, tidak mengubah data.
// ============================================================

const hari = (iso) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '')
/** Tanggal dokumen ditugaskan ke penerjemah (riwayat penetapan terakhir; data lama: tanggal masuk project). */
export const tglTugas = (sb, p) => {
  const h = [...(sb.history || [])].reverse().find((x) => /^Penerjemah (ditetapkan|diganti)/.test(x.action || ''))
  return hari(sb.data?.assigned_at || h?.at) || String(p.about?.received_at || p.created_at || '').slice(0, 10)
}
const tglSelesai = (sb) => hari(sb.data?.translated_at || (sb.history || []).find((h) => /^Penerjemahan/.test(h.action || ''))?.at)

const awalBulan = (t) => `${t.slice(0, 7)}-01`
const pilihan = (t = hariIni()) => {
  const bl = tambahHari(awalBulan(t), -1)
  return [
    ['Bulan ini', { from: awalBulan(t), to: t }],
    ['Hari ini', { from: t, to: t }],
    ['7 hari', { from: tambahHari(t, -6), to: t }],
    ['30 hari', { from: tambahHari(t, -29), to: t }],
    ['Bulan lalu', { from: awalBulan(bl), to: bl }],
  ]
}

export default function KuotaPenerjemah({ className }) {
  const { data } = useApp()
  const daftar = pilihan()
  const [range, setRange] = useState(daftar[0][1])
  const [open, setOpen] = useState(true)
  const dalam = (d) => !!d && (!range.from || d >= range.from) && (!range.to || d <= range.to)

  const { baris, vendor } = useMemo(() => {
    const per = new Map(); let vendor = 0
    for (const p of data.projects) {
      for (const sb of p.sub_projects || []) {
        const flow = flowOf(sb, p)
        if (flow === 'tr_ext') { if (sb.data?.vendor && dalam(tglTugas(sb, p))) vendor += 1; continue }
        if (!['tr_int', 'tr_nt'].includes(flow)) continue
        const uid = sb.data?.translator
        if (!uid) continue
        const lewat = sb.stage === DONE || stageIndex(flow, sb.stage) > stageIndex(flow, 'penerjemahan')
        const ditugaskan = dalam(tglTugas(sb, p)); const selesai = lewat && dalam(tglSelesai(sb))
        if (!ditugaskan && !selesai) continue
        const hal = halamanSub(sb, flow)
        const r = per.get(uid) || { dok: 0, hal: 0, dokSelesai: 0, halSelesai: 0 }
        r.dok += 1; r.hal += hal
        if (lewat) { r.dokSelesai += 1; r.halSelesai += hal }
        per.set(uid, r)
      }
    }
    const baris = data.users.filter((u) => u.role === 'penerjemah' && u.active !== false)
      .map((u) => ({ u, ...(per.get(u.id) || { dok: 0, hal: 0, dokSelesai: 0, halSelesai: 0 }) }))
      .sort((a, b) => b.hal - a.hal || a.u.name.localeCompare(b.u.name))
    return { baris, vendor }
  }, [data.projects, data.users, range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps

  const max = Math.max(1, ...baris.map((r) => r.hal))
  const tDok = baris.reduce((a, r) => a + r.dok, 0); const tHal = baris.reduce((a, r) => a + r.hal, 0); const tSel = baris.reduce((a, r) => a + r.halSelesai, 0)
  const chip = (on) => cx('inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 max-md:min-h-11 max-md:px-3', on ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-ink-soft ring-slate-200 hover:ring-indigo-400')
  const tglCls = 'h-8 w-36 rounded-lg border-0 bg-white px-2 text-xs text-ink ring-1 ring-slate-300 focus:ring-2 focus:ring-brand max-md:h-11 max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:px-1.5 max-md:text-base'
  const label = daftar.find(([, v]) => v.from === range.from && v.to === range.to)?.[0]
    || (range.from || range.to ? `${range.from ? tgl(range.from) : '…'} – ${range.to ? tgl(range.to) : '…'}` : 'semua tanggal')

  return (
    <Card className={cx('overflow-hidden', className)} data-kuota-penerjemah>
      <div className="flex flex-wrap items-center gap-2 bg-indigo-50/60 px-4 py-3">
        <Users className="h-4 w-4 shrink-0 text-indigo-600" />
        <h2 className="font-bold">Kuota Penerjemah</h2>
        <span className="min-w-0 text-xs text-ink-mute max-md:order-last max-md:basis-full" data-kuota-ringkas>{label.toLowerCase()} · {tDok} dok · {tHal} hal ditugaskan · {tSel} hal selesai</span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Tutup Kuota Penerjemah' : 'Buka Kuota Penerjemah'}
          className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-ink-soft ring-1 ring-slate-200 hover:text-brand max-md:h-11 max-md:w-11">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-2">
            {daftar.map(([nama, v]) => {
              const on = v.from === range.from && v.to === range.to
              return <button key={nama} type="button" className={chip(on)} aria-pressed={on} onClick={() => setRange(v)} data-kuota-chip={nama}>{nama}</button>
            })}
            <span className="flex items-center gap-1.5 text-xs text-ink-mute md:ml-auto max-md:w-full">Tanggal
              <input type="date" value={range.from} max={range.to || undefined} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={tglCls} aria-label="Dari tanggal" />
              –<input type="date" value={range.to} min={range.from || undefined} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={tglCls} aria-label="Sampai tanggal" />
            </span>
          </div>
          <div className="space-y-2.5 px-4 py-4">
            {!baris.length && <p className="py-3 text-center text-sm text-ink-mute">Belum ada penerjemah aktif.</p>}
            {baris.map(({ u, dok, hal, halSelesai }) => (
              <div key={u.id} data-kuota-baris={u.id} className="grid items-center gap-x-3 gap-y-1 grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[170px_1fr_260px]">
                <p className="truncate text-sm font-semibold">{u.name} <span className="text-[11px] font-normal text-ink-mute">· {placeOf(u)}</span></p>
                <div className="relative flex h-3 overflow-hidden rounded-full bg-slate-100 max-md:order-3 max-md:col-span-2" role="img" aria-label={`${u.name}: ${dok} dokumen, ${hal} halaman ditugaskan, ${halSelesai} halaman selesai`}>
                  <div className="h-3 bg-emerald-500" style={{ width: `${(halSelesai / max) * 100}%` }} />
                  <div className="h-3 bg-brand" style={{ width: `${((hal - halSelesai) / max) * 100}%` }} />
                </div>
                <p className="text-right text-xs tabular-nums md:text-left">
                  <b>{dok}</b> dok · <b>{hal}</b> hal
                  {hal > 0 ? <span className="text-ink-mute"> · {halSelesai} selesai</span> : <span className="ml-1 font-semibold text-emerald-700">Kosong</span>}
                </p>
              </div>
            ))}
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-ink-mute">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-emerald-500" />selesai diterjemahkan</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-brand" />masih dikerjakan</span>
              <span>dihitung dari tanggal ditugaskan / selesai diterjemahkan, bukan deadline</span>
              <span>· Vendor eksternal: {vendor} dokumen</span>
            </p>
          </div>
        </>
      )}
    </Card>
  )
}
