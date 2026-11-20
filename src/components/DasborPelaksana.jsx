// Dashboard pelaksana (penerjemah / proofreader / otorisator):
// "Kerjakan sekarang" + satu tabel "Pekerjaan saya" (Semua / Aktif / Selesai) + beban deadline 7 hari.
// Hanya bagian yang ditugaskan kepadanya — tanpa tahap, sub lain, atau hasil scan.
import { useMemo, useState } from 'react'
import { useApp } from '../lib/store.jsx'
import { cx } from './ui.jsx'
import { subMilikUntuk, invoiceLabel } from '../config/access.js'
import { myWorkSubs, AksiTugasBaris } from './WorkerActions.jsx'
import { infoDeadline } from './BarisCanvas.jsx'

const kunciHari = (dl) => (String(dl).length > 10 ? new Date(new Date(dl).getTime() + 8 * 3600e3).toISOString().slice(0, 10) : String(dl).slice(0, 10))
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export default function DasborPelaksana({ projects = [] }) {
  const { user } = useApp()
  const [saring, setSaring] = useState('aktif')
  const milik = useMemo(() => subMilikUntuk(user), [user])
  const baris = useMemo(() => projects.map((p) => {
    const subs = (p.sub_projects || []).filter(milik)
    if (!subs.length) return null
    const dok = subs.flatMap((s) => { const d = (s.docs || []).filter((x) => String(x?.desc || '').trim()); return d.length ? d.map((x) => ({ nama: String(x.desc).trim(), hlm: Number(x.pages) || 0 })) : [{ nama: String(s.title || 'Dokumen').replace(/^terjemahan tersumpah:\s*/i, ''), hlm: Number(s.pages) || 0 }] })
    const arah = [...new Set(subs.map((s) => (s.lang_from && s.lang_to ? `${s.lang_from} → ${s.lang_to}` : '')).filter(Boolean))].join(', ')
    return { p, dok, arah, hlm: dok.reduce((a, d) => a + d.hlm, 0), aktif: myWorkSubs(user, p).length > 0, dl: p.about?.deadline || '' }
  }).filter(Boolean).sort((a, b) => (a.aktif === b.aktif ? String(a.dl || '9').localeCompare(String(b.dl || '9')) : a.aktif ? -1 : 1)), [projects, milik, user])
  const aktif = baris.filter((r) => r.aktif); const selesai = baris.filter((r) => !r.aktif)
  const tampil = saring === 'aktif' ? aktif : saring === 'selesai' ? selesai : baris
  const utama = aktif[0]
  const hariIni = kunciHari(new Date().toISOString())
  const minggu = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() + 8 * 3600e3 + i * 864e5); const k = d.toISOString().slice(0, 10); return { k, label: i === 0 ? 'Hari ini' : `${HARI[d.getUTCDay()]} ${d.getUTCDate()}`, hlm: aktif.filter((r) => r.dl && kunciHari(r.dl) === k).reduce((a, r) => a + r.hlm, 0) } }), [aktif])
  const maks = Math.max(1, ...minggu.map((x) => x.hlm))
  const Pil = ({ p }) => { const d = infoDeadline(p); return d ? <span className="flex flex-col items-start gap-0.5"><span className="inline-flex min-h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-bold" style={{ background: d.bg, color: d.fg }}>{d.tgl}</span>{d.sisa && d.sisa !== 'Selesai' && <span className="text-[11px] font-semibold" style={{ color: d.teks }}>{d.sisa}</span>}</span> : <span className="text-ink-mute">—</span> }
  const Dok = ({ dok }) => <ol className="space-y-0.5 text-[13px]">{dok.slice(0, 4).map((d, i) => <li key={i} className="flex min-w-0 gap-1.5"><span className="shrink-0 tabular-nums text-ink-mute">{i + 1}.</span><span className="min-w-0 break-words">{d.nama}{d.hlm > 0 && <span className="text-ink-mute"> · {d.hlm} hlm</span>}</span></li>)}{dok.length > 4 && <li className="text-[11.5px] font-semibold text-ink-mute">+{dok.length - 4} dokumen lagi</li>}</ol>

  return (
    <div className="flex flex-col gap-3" data-dasbor-pelaksana>
      {utama && (
        <section className="flex flex-col gap-3 rounded-2xl bg-[#141B34] p-4 text-white md:flex-row md:items-center md:p-5" data-kerjakan-sekarang>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">Kerjakan sekarang</span>
            <span className="text-lg font-extrabold tabular-nums md:text-xl">{invoiceLabel(utama.p.invoice_no)}{utama.arah && <span className="font-bold"> · {utama.arah}</span>}</span>
            <span className="text-[13px] text-white/80">{utama.dok.slice(0, 3).map((d, i) => `${i + 1}. ${d.nama}${d.hlm ? ` · ${d.hlm} hlm` : ''}`).join('   ')}{utama.dok.length > 3 ? `   +${utama.dok.length - 3} lagi` : ''}</span>
            {(() => { const d = infoDeadline(utama.p); return d ? <span className="flex flex-wrap items-center gap-2 text-[12.5px]"><span className="inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-bold" style={{ background: d.bg, color: d.fg }}>Deadline {d.tgl}</span><span className="font-semibold text-amber-200">{d.sisa}</span></span> : null })()}
          </div>
          <div className="shrink-0 rounded-xl bg-white p-1.5 text-[#141B34] max-md:[&_button]:min-h-11"><AksiTugasBaris project={utama.p} hp /></div>
        </section>
      )}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <h2 className="mr-1 text-[15px] font-bold">Pekerjaan saya</h2>
            {[['semua', 'Semua', baris.length], ['aktif', 'Aktif', aktif.length], ['selesai', 'Selesai', selesai.length]].map(([k, l, n]) => (
              <button key={k} type="button" onClick={() => setSaring(k)} aria-pressed={saring === k} data-saring-dasbor={k}
                className={cx('inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-bold ring-1 md:h-9', saring === k ? 'bg-[#141B34] text-white ring-[#141B34]' : 'bg-white text-ink-soft ring-slate-200 hover:ring-brand dark:bg-white/5')}>{l}<span className="font-semibold opacity-70">{n}</span></button>
            ))}
            <span className="ml-auto hidden text-xs text-ink-mute sm:inline">Urut deadline terdekat</span>
          </div>
          {!tampil.length ? <p className="border-t border-slate-100 px-4 py-8 text-center text-sm text-ink-mute">{saring === 'aktif' ? 'Tidak ada pekerjaan aktif. Semua bagian Anda sudah selesai.' : 'Belum ada pekerjaan di sini.'}</p> : <>
            <table className="hidden w-full text-left text-[13.5px] md:table" data-tabel-dasbor>
              <thead className="bg-slate-50 text-xs font-bold text-ink-soft dark:bg-white/5"><tr><th className="px-4 py-2.5">No. Invoice</th><th className="px-3 py-2.5">Deadline</th><th className="px-3 py-2.5">Arah Bahasa</th><th className="px-3 py-2.5">Dokumen</th><th className="px-4 py-2.5 text-right">Aksi</th></tr></thead>
              <tbody>{tampil.map((r) => (
                <tr key={r.p.id} className={cx('border-t border-slate-100 align-middle dark:border-white/10', !r.aktif && 'bg-[#DDF5E4] dark:bg-[#143524]')} data-baris-dasbor>
                  <td className="px-4 py-3"><a href={`#/projects/${r.p.id}`} className="whitespace-nowrap text-[14.5px] font-extrabold tabular-nums hover:underline">{invoiceLabel(r.p.invoice_no)}</a></td>
                  <td className="px-3 py-3"><Pil p={r.p} /></td>
                  <td className="whitespace-nowrap px-3 py-3">{r.arah || '—'}</td>
                  <td className="px-3 py-3"><Dok dok={r.dok} /></td>
                  <td className="px-4 py-3"><span className="flex items-center justify-end">{r.aktif ? <AksiTugasBaris project={r.p} /> : <span className="text-[13px] font-bold text-emerald-700 dark:text-emerald-300">Selesai</span>}</span></td>
                </tr>))}</tbody>
            </table>
            <ul className="divide-y divide-slate-100 border-t border-slate-100 md:hidden dark:divide-white/10 dark:border-white/10" data-kartu-dasbor>{tampil.map((r) => (
              <li key={r.p.id} className={cx('flex flex-col gap-2 px-4 py-3', !r.aktif && 'bg-[#DDF5E4] dark:bg-[#143524]')}>
                <span className="flex items-start justify-between gap-2"><a href={`#/projects/${r.p.id}`} className="inline-flex min-h-11 items-center text-[15px] font-extrabold tabular-nums">{invoiceLabel(r.p.invoice_no)}</a><Pil p={r.p} /></span>
                {r.arah && <span className="text-[13px] font-semibold">{r.arah}</span>}
                <Dok dok={r.dok} />
                {r.aktif ? <AksiTugasBaris project={r.p} hp /> : <span className="text-[13px] font-bold text-emerald-700">Selesai</span>}
              </li>))}</ul>
          </>}
        </section>
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10" data-deadline-7hari>
          <h2 className="mb-2 text-[15px] font-bold">Deadline 7 hari ke depan</h2>
          <ul className="space-y-2">{minggu.map((x) => (
            <li key={x.k} className="grid grid-cols-[64px_minmax(0,1fr)_52px] items-center gap-2 text-[13px]">
              <span className={cx('font-bold', x.k === hariIni && x.hlm > 0 ? 'text-rose-600' : x.hlm > 0 ? 'text-ink' : 'text-ink-mute')}>{x.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10" role="img" aria-label={`${x.hlm} halaman`}><span className={cx('block h-full rounded-full', x.k === hariIni ? 'bg-rose-500' : 'bg-brand')} style={{ width: `${(x.hlm / maks) * 100}%` }} /></span>
              <span className="text-right tabular-nums text-ink-mute">{x.hlm} hlm</span>
            </li>))}</ul>
        </section>
      </div>
    </div>
  )
}
