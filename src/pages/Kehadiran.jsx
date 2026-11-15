import { useMemo, useState } from 'react'
import { Download, Lock, UserCheck, UserX, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { BRANCHES, roleLabel, placeOf } from '../config/access.js'
import { boleh, izinEfektif, dalamCakupan } from '../lib/izin.js'
import { hariIniAbsen, ZONA_ABSEN } from '../lib/session.js'
import { Card, Empty, Select, Sheet, cx } from '../components/ui.jsx'
import { CariTabel } from '../components/TabelSortir.jsx'

// ============================================================
//  REKAP KEHADIRAN — login harian = absen hadir.
//  Satu catatan per orang per hari (tanggal WITA), dibuat otomatis
//  saat login (server: app_absen). Akses: izin kehadiran.lihat
//  (bawaan: Superadmin & Direktur).
// ============================================================

const jam = (iso) => (iso ? new Intl.DateTimeFormat('id-ID', { timeZone: ZONA_ABSEN, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(':', '.') : '')
const menit = (iso) => { if (!iso) return null; const [h, m] = jam(iso).split('.').map(Number); return h * 60 + m }
const fmtMenit = (m) => (m == null ? '–' : `${String(Math.floor(m / 60)).padStart(2, '0')}.${String(Math.round(m % 60)).padStart(2, '0')}`)
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const NAMA_HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const hariDalamBulan = (bln) => { const [y, m] = bln.split('-').map(Number); const n = new Date(Date.UTC(y, m, 0)).getUTCDate(); return Array.from({ length: n }, (_, i) => `${bln}-${String(i + 1).padStart(2, '0')}`) }
const geserBulan = (bln, n) => { const [y, m] = bln.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7) }
const hariMinggu = (tgl) => new Date(`${tgl}T00:00:00Z`).getUTCDay()

export default function Kehadiran() {
  const { user, data } = useApp()
  const today = hariIniAbsen()
  const [bulan, setBulan] = useState(today.slice(0, 7))
  const [cabang, setCabang] = useState('')
  const [role, setRole] = useState('')
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState(null)
  const [semuaBelum, setSemuaBelum] = useState(false)
  const izin = izinEfektif(user, 'kehadiran.lihat')

  // Staf aktif dalam cakupan izin (cabang sendiri / semua)
  const staf = useMemo(() => (data.users || [])
    .filter((u) => u.active !== false && !u.persona && dalamCakupan(user, izin, { cabang: u.branch }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name))), [data.users, user, izin])
  const catatan = useMemo(() => (data.kehadiran || []).filter((r) => dalamCakupan(user, izin, { cabang: r.branch })), [data.kehadiran, user, izin])
  const peta = useMemo(() => { const m = new Map(); for (const r of catatan) m.set(`${r.user_id}:${r.tanggal}`, r); return m }, [catatan])

  const hari = useMemo(() => hariDalamBulan(bulan).filter((d) => d <= today), [bulan, today])
  const s = q.trim().toLowerCase()
  const tampil = staf.filter((u) => (!cabang || u.branch === cabang) && (!role || u.role === role) && (!s || `${u.name} ${u.email || ''}`.toLowerCase().includes(s)))
  const ringkas = tampil.map((u) => {
    const rows = hari.map((d) => peta.get(`${u.id}:${d}`)).filter(Boolean)
    const ms = rows.map((r) => menit(r.masuk_at)).filter((x) => x != null)
    const terakhir = [...(data.kehadiran || [])].filter((r) => r.user_id === u.id).sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)))[0]
    return { u, hadir: rows.length, rata: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null, hariIni: peta.get(`${u.id}:${today}`), terakhir }
  })
  const hadirHariIni = ringkas.filter((x) => x.hariIni)
  const belum = ringkas.filter((x) => !x.hariIni)
  const roles = [...new Set(staf.map((u) => u.role))]

  if (!boleh(user, 'kehadiran.lihat')) return <Card><Empty icon={Lock} title="Tidak ada akses" text="Rekap kehadiran hanya untuk yang diberi izin." /></Card>

  const ekspor = () => {
    const kepala = ['Nama', 'Role', 'Cabang', 'Hadir', 'Rata-rata jam masuk', ...hari.map((d) => d.slice(8))]
    const baris = ringkas.map(({ u, hadir, rata }) => [u.name, roleLabel(u), u.branch || '', hadir, fmtMenit(rata), ...hari.map((d) => jam(peta.get(`${u.id}:${d}`)?.masuk_at) || '')])
    const csv = [kepala, ...baris].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = `kehadiran-${bulan}.csv`; a.click()
  }
  const [y, m] = bulan.split('-').map(Number)
  const chip = 'inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold ring-1 max-md:min-h-11'

  return (
    <div className="space-y-3" data-halaman-kehadiran>
      <div>
        <h1 className="flex items-center gap-2 text-[17px] font-extrabold leading-tight tracking-tight"><UserCheck className="h-5 w-5 text-brand" />Kehadiran</h1>
        <p className="mt-0.5 text-[12px] text-ink-mute">Login pertama setiap hari = absen hadir. Jam dalam WITA.</p>
      </div>

      {/* Hari ini */}
      <Card className="p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[13px] font-bold">Hari ini · <span className="text-emerald-700">{hadirHariIni.length} hadir</span> <span className="text-ink-mute">dari {ringkas.length}</span></p>
          <p className="text-[11px] text-ink-mute">{new Intl.DateTimeFormat('id-ID', { timeZone: ZONA_ABSEN, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${ringkas.length ? (hadirHariIni.length / ringkas.length) * 100 : 0}%` }} /></div>
        {belum.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-rose-700"><UserX className="h-3.5 w-3.5" />Belum login hari ini ({belum.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {belum.map(({ u }, i) => <button type="button" key={u.id} onClick={() => setDetail(u)} className={cx(chip, 'bg-rose-50 text-rose-800 ring-rose-200', i >= 6 && !semuaBelum && 'max-md:hidden')}>{u.name}<span className="text-rose-500">· {placeOf(u)}</span></button>)}
              {belum.length > 6 && !semuaBelum && <button type="button" onClick={() => setSemuaBelum(true)} className={cx(chip, 'bg-white text-ink-soft ring-slate-200 md:hidden')}>+{belum.length - 6} lainnya</button>}
            </div>
          </div>
        )}
      </Card>

      {/* Alat */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg bg-white ring-1 ring-slate-200">
          <button type="button" aria-label="Bulan sebelumnya" onClick={() => setBulan(geserBulan(bulan, -1))} className="grid h-11 w-11 place-items-center md:h-8 md:w-8"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[120px] text-center text-[13px] font-semibold">{NAMA_BULAN[m - 1]} {y}</span>
          <button type="button" aria-label="Bulan berikutnya" disabled={bulan >= today.slice(0, 7)} onClick={() => setBulan(geserBulan(bulan, 1))} className="grid h-11 w-11 place-items-center disabled:opacity-30 md:h-8 md:w-8"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <Select aria-label="Cabang" value={cabang} onChange={(e) => setCabang(e.target.value)} className="!w-auto md:!h-8 md:!py-0 md:text-[13px]">
          <option value="">Semua cabang</option>
          {BRANCHES.filter((b) => staf.some((u) => u.branch === b)).map((b) => <option key={b}>{b}</option>)}
        </Select>
        <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className="!w-auto md:!h-8 md:!py-0 md:text-[13px]">
          <option value="">Semua role</option>
          {roles.map((r) => <option key={r} value={r}>{roleLabel(null, r)}</option>)}
        </Select>
        <CariTabel value={q} onChange={setQ} label="Cari nama…" />
        {boleh(user, 'kehadiran.ekspor') && <button type="button" onClick={ekspor} className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-semibold ring-1 ring-slate-200 hover:text-brand md:h-8"><Download className="h-4 w-4" />Ekspor CSV</button>}
      </div>

      {ringkas.length === 0 ? <Card><Empty icon={UserCheck} title="Belum ada staf" /></Card> : (
        <>
          {/* Desktop: matriks orang × tanggal */}
          <Card className="overflow-hidden max-md:hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] text-ink-mute">
                    <th className="sticky left-0 z-10 min-w-[200px] bg-slate-50 px-3 py-2 font-semibold">Nama</th>
                    <th className="px-2 py-2 text-center font-semibold">Hadir</th>
                    <th className="px-2 py-2 text-center font-semibold">Rata² masuk</th>
                    {hari.map((d) => <th key={d} className={cx('min-w-[38px] px-1 py-2 text-center font-semibold', d === today && 'text-brand', hariMinggu(d) === 0 && 'text-rose-500')}><div>{NAMA_HARI[hariMinggu(d)]}</div><div className="text-[12px] text-ink">{Number(d.slice(8))}</div></th>)}
                  </tr>
                </thead>
                <tbody>
                  {ringkas.map(({ u, hadir, rata }) => (
                    <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                        <button type="button" onClick={() => setDetail(u)} className="text-left">
                          <span className="block font-semibold text-ink hover:text-brand">{u.name}</span>
                          <span className="block text-[11px] text-ink-mute">{roleLabel(u)} · {placeOf(u)}</span>
                        </button>
                      </td>
                      <td className="px-2 text-center font-bold">{hadir}<span className="font-normal text-ink-mute">/{hari.length}</span></td>
                      <td className="px-2 text-center tabular-nums">{fmtMenit(rata)}</td>
                      {hari.map((d) => { const r = peta.get(`${u.id}:${d}`); return (
                        <td key={d} className="px-0.5 py-1 text-center" title={r ? `Masuk ${jam(r.masuk_at)} · login ${r.login_ke || 1}× ${r.perangkat ? `· ${r.perangkat}` : ''}` : 'Tidak login'}>
                          {r ? <span className="inline-block rounded bg-emerald-50 px-1 py-0.5 text-[10.5px] font-semibold tabular-nums text-emerald-800">{jam(r.masuk_at)}</span> : <span className="text-slate-300">·</span>}
                        </td>) })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* HP: kartu per orang */}
          <div className="space-y-2 md:hidden">
            {ringkas.map(({ u, hadir, rata, hariIni }) => (
              <button type="button" key={u.id} onClick={() => setDetail(u)} className="block w-full rounded-2xl bg-white p-3 text-left ring-1 ring-[#E7E8F0]" data-kartu-hadir>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{u.name}</p>
                    <p className="text-[12px] text-ink-mute">{roleLabel(u)} · {placeOf(u)}</p>
                  </div>
                  {hariIni ? <span className={cx(chip, 'shrink-0 bg-emerald-50 text-emerald-800 ring-emerald-200')}><Clock className="h-3.5 w-3.5" />{jam(hariIni.masuk_at)}</span>
                    : <span className={cx(chip, 'shrink-0 bg-rose-50 text-rose-700 ring-rose-200')}>Belum login</span>}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[12px]">
                  <span><b>{hadir}</b><span className="text-ink-mute">/{hari.length} hari</span></span>
                  <span className="text-ink-mute">Rata² masuk <b className="text-ink">{fmtMenit(rata)}</b></span>
                </div>
                <div className="mt-2 flex flex-wrap gap-[3px]" aria-hidden>
                  {hari.map((d) => <span key={d} className={cx('h-2.5 w-2.5 rounded-sm', peta.get(`${u.id}:${d}`) ? 'bg-emerald-500' : 'bg-slate-200')} />)}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.name || ''} subtitle={detail ? `${roleLabel(detail)} · ${placeOf(detail)} · ${NAMA_BULAN[m - 1]} ${y}` : ''}>
        {detail && (() => {
          const rows = hari.slice().reverse()
          return (
            <div className="divide-y divide-slate-100">
              {rows.map((d) => { const r = peta.get(`${detail.id}:${d}`); return (
                <div key={d} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                  <span className={cx(hariMinggu(d) === 0 && 'text-rose-600')}>{new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))}</span>
                  {r ? <span className="text-right"><b className="tabular-nums text-emerald-700">{jam(r.masuk_at)}</b><span className="ml-2 text-[11px] text-ink-mute">login {r.login_ke || 1}×{r.perangkat ? ` · ${r.perangkat}` : ''}</span></span>
                    : <span className="text-[12px] text-slate-400">Tidak login</span>}
                </div>) })}
            </div>
          )
        })()}
      </Sheet>
    </div>
  )
}
