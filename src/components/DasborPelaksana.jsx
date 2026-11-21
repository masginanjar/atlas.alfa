// Dashboard pelaksana (penerjemah / proofreader / otorisator):
// "Kerjakan sekarang" + satu tabel "Pekerjaan saya" (Semua / Aktif / Selesai) + beban deadline 7 hari.
// Hanya bagian yang ditugaskan kepadanya — tanpa tahap, sub lain, atau hasil scan.
import { useMemo, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Sheet, Button } from './ui.jsx'
import FileManager from './FileManager.jsx'
import { KapasitasSaya } from './Kapasitas.jsx'
import { useApp } from '../lib/store.jsx'
import { cx } from './ui.jsx'
import { subMilikUntuk, invoiceLabel } from '../config/access.js'
import { myWorkSubs, AksiTugasBaris } from './WorkerActions.jsx'
import { infoDeadline } from './BarisCanvas.jsx'
import JenisTerjemahan from './JenisTerjemahan.jsx'

const kunciHari = (dl) => (String(dl).length > 10 ? new Date(new Date(dl).getTime() + 8 * 3600e3).toISOString().slice(0, 10) : String(dl).slice(0, 10))
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export default function DasborPelaksana({ projects = [], angka = {}, perbaikan = [], atas = null, tanpaPekerjaan = false }) {
  const { user } = useApp()
  const [berkas, setBerkas] = useState(null)
  const [saring, setSaring] = useState('aktif')
  const milik = useMemo(() => subMilikUntuk(user), [user])
  const baris = useMemo(() => projects.map((p) => {
    const subs = (p.sub_projects || []).filter(milik)
    if (!subs.length) return null
    const dok = subs.flatMap((s) => { const d = (s.docs || []).filter((x) => String(x?.desc || '').trim()); return d.length ? d.map((x) => ({ nama: String(x.desc).trim(), hlm: Number(x.pages) || 0 })) : [{ nama: String(s.title || 'Dokumen').replace(/^terjemahan tersumpah:\s*/i, ''), hlm: Number(s.pages) || 0 }] })
    const arah = [...new Set(subs.map((s) => (s.lang_from && s.lang_to ? `${s.lang_from} → ${s.lang_to}` : '')).filter(Boolean))].join(', ')
    return { p, dok, arah, subs, hlm: dok.reduce((a, d) => a + d.hlm, 0), aktif: myWorkSubs(user, p).length > 0, dl: p.about?.deadline || '' }
  }).filter(Boolean).sort((a, b) => (a.aktif === b.aktif ? String(a.dl || '9').localeCompare(String(b.dl || '9')) : a.aktif ? -1 : 1)), [projects, milik, user])
  const aktif = baris.filter((r) => r.aktif); const selesai = baris.filter((r) => !r.aktif)
  const tampil = saring === 'aktif' ? aktif : saring === 'selesai' ? selesai : baris
  const utama = aktif[0]
  const hariIni = kunciHari(new Date().toISOString())
  const minggu = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() + 8 * 3600e3 + i * 864e5); const k = d.toISOString().slice(0, 10); return { k, label: i === 0 ? 'Hari ini' : `${HARI[d.getUTCDay()]} ${d.getUTCDate()}`, hlm: aktif.filter((r) => r.dl && kunciHari(r.dl) === k).reduce((a, r) => a + r.hlm, 0) } }), [aktif])
  const maks = Math.max(1, ...minggu.map((x) => x.hlm))
  const Pil = ({ p }) => { const d = infoDeadline(p); return d ? <span className="flex flex-col items-start gap-0.5"><span className="inline-flex min-h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-bold" style={{ background: d.bg, color: d.fg }}>{d.tgl}</span>{d.sisa && d.sisa !== 'Selesai' && <span className="text-[11px] font-semibold" style={{ color: d.teks }}>{d.sisa}</span>}</span> : <span className="text-ink-mute">—</span> }
  const Dok = ({ dok }) => <ol className="space-y-0.5 text-[13px]">{dok.slice(0, 4).map((d, i) => <li key={i} className="flex min-w-0 gap-1.5"><span className="shrink-0 tabular-nums text-ink-mute">{i + 1}.</span><span className="min-w-0 break-words">{d.nama}{d.hlm > 0 && <span className="text-ink-mute"> · {d.hlm} hlm</span>}</span></li>)}{dok.length > 4 && <li className="text-[11.5px] font-semibold text-ink-mute">+{dok.length - 4} dokumen lagi</li>}</ol>

  const sekarang = new Date()
  const tanggal = `${['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][new Date(sekarang.getTime() + 8 * 3600e3).getUTCDay()]}, ${sekarang.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', timeZone: 'Asia/Makassar' })} · ${sekarang.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' })} WITA`
  const hlmHariIni = aktif.filter((r) => r.dl && kunciHari(r.dl) === hariIni).reduce((a, r) => a + r.hlm, 0)
  const Angka = ({ label, nilai, ket, nada }) => (
    <div className={cx('flex flex-col gap-0.5 rounded-2xl p-4 ring-1', nada === 'bahaya' ? 'bg-rose-50 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-400/30' : 'bg-white ring-slate-200 dark:bg-white/5 dark:ring-white/10')} data-angka-dasbor>
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      <b className={cx('text-[28px] font-extrabold leading-tight tabular-nums', nada === 'bahaya' ? 'text-rose-600' : nada === 'aman' ? 'text-emerald-600' : 'text-ink')}>{nilai}</b>
      <span className="text-xs text-ink-mute">{ket}</span>
    </div>
  )
  const Folder = ({ p }) => <button type="button" onClick={() => setBerkas(p)} aria-label={`File ${invoiceLabel(p.invoice_no)}`} title="Folder file" data-aksi="file" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-ink-soft ring-1 ring-slate-200 hover:text-brand md:h-9 md:w-9 dark:bg-white/5"><FolderOpen className="h-4 w-4" aria-hidden="true" /></button>

  return (
    <div className="flex flex-col gap-3" data-dasbor-pelaksana>
      <header className="flex flex-col px-1">
        <span className="text-xs font-semibold text-ink-soft">{tanggal}</span>
        <h1 className="text-[22px] font-extrabold tracking-tight md:text-2xl">Halo, {user?.name}</h1>
      </header>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Angka label="Tugas aktif" nilai={angka.aktif ?? aktif.length} ket={`${aktif.reduce((a, r) => a + r.dok.length, 0)} dokumen · ${aktif.reduce((a, r) => a + r.hlm, 0)} halaman`} />
        <Angka label="Deadline hari ini" nilai={angka.hariIni ?? 0} ket={angka.hariIni ? 'selesaikan hari ini' : 'tidak ada'} nada={angka.hariIni ? 'bahaya' : undefined} />
        <Angka label="Terlambat" nilai={angka.telat ?? 0} ket={angka.telat ? 'sudah lewat deadline' : 'tidak ada yang lewat'} nada={angka.telat ? 'bahaya' : 'aman'} />
        <Angka label="Selesai bulan ini" nilai={angka.selesai ?? selesai.length} ket="dokumen" />
      </div>
      {/* Performa & jumlah pekerjaan saya — di bagian atas dashboard */}
      {atas && <div className="grid gap-3 lg:grid-cols-2 lg:items-start [&>*]:min-w-0" data-performa-atas>{atas}</div>}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-3">
        {tanpaPekerjaan && !utama && <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-ink-mute ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">Tidak ada pekerjaan aktif. Daftar lengkap ada di menu <a href="#/projects" className="font-semibold text-brand underline-offset-2 hover:underline">Project</a>.</p>}
      {utama && (
        <section className="flex flex-col gap-3 rounded-2xl bg-[#141B34] p-4 text-white md:flex-row md:items-center md:p-5" data-kerjakan-sekarang>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">Kerjakan sekarang</span>
            <span className="text-lg font-extrabold tabular-nums md:text-xl">{invoiceLabel(utama.p.invoice_no)}{utama.arah && <span className="font-bold"> · {utama.arah}</span>} <JenisTerjemahan subs={utama.subs} className="ml-1 align-middle" /></span>
            <span className="text-[13px] text-white/80">{utama.dok.slice(0, 3).map((d, i) => `${i + 1}. ${d.nama}${d.hlm ? ` · ${d.hlm} hlm` : ''}`).join('   ')}{utama.dok.length > 3 ? `   +${utama.dok.length - 3} lagi` : ''}</span>
            {(() => { const d = infoDeadline(utama.p); return d ? <span className="flex flex-wrap items-center gap-2 text-[12.5px]"><span className="inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-bold" style={{ background: d.bg, color: d.fg }}>Deadline {d.tgl}</span><span className="font-semibold text-amber-200">{d.sisa}</span></span> : null })()}
          </div>
          <div className="shrink-0 rounded-xl bg-white p-1.5 text-[#141B34] max-md:[&_button]:min-h-11"><AksiTugasBaris project={utama.p} hp /></div>
        </section>
      )}
        {/* Tabel "Pekerjaan saya" tidak ditampilkan untuk penerjemah & proofreader (daftarnya ada di halaman Project) */}
        <section className={cx('overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10', tanpaPekerjaan && 'hidden')} data-pekerjaan-saya>
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
                  <td className="px-3 py-3"><span className="flex flex-col items-start gap-0.5"><span className="whitespace-nowrap">{r.arah || '—'}</span><JenisTerjemahan subs={r.subs} /></span></td>
                  <td className="px-3 py-3"><Dok dok={r.dok} /></td>
                  <td className="px-4 py-3"><span className="flex items-center justify-end">{r.aktif ? <AksiTugasBaris project={r.p} /> : <span className="mr-2 text-[13px] font-bold text-emerald-700 dark:text-emerald-300">Selesai</span>}<span className="ml-1.5"><Folder p={r.p} /></span></span></td>
                </tr>))}</tbody>
            </table>
            <ul className="divide-y divide-slate-100 border-t border-slate-100 md:hidden dark:divide-white/10 dark:border-white/10" data-kartu-dasbor>{tampil.map((r) => (
              <li key={r.p.id} className={cx('flex flex-col gap-2 px-4 py-3', !r.aktif && 'bg-[#DDF5E4] dark:bg-[#143524]')}>
                <span className="flex items-start justify-between gap-2"><a href={`#/projects/${r.p.id}`} className="inline-flex min-h-11 items-center text-[15px] font-extrabold tabular-nums">{invoiceLabel(r.p.invoice_no)}</a><Pil p={r.p} /></span>
                <span className="flex flex-wrap items-center gap-2">{r.arah && <span className="text-[13px] font-semibold">{r.arah}</span>}<JenisTerjemahan subs={r.subs} /></span>
                <Dok dok={r.dok} />
                <span className="flex items-center gap-2"><span className="min-w-0 flex-1">{r.aktif ? <AksiTugasBaris project={r.p} hp /> : <span className="text-[13px] font-bold text-emerald-700">Selesai</span>}</span><Folder p={r.p} /></span>
              </li>))}</ul>
          </>}
        </section>
      </div>
      <aside className="flex min-w-0 flex-col gap-3">
        <KapasitasSaya kartu hariIni={hlmHariIni} />
        <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10" data-dikembalikan>
          <h2 className="text-[15px] font-bold">Dikembalikan untuk diperbaiki</h2>
          {!perbaikan.length ? <p className="text-[13px] text-ink-mute">Tidak ada yang dikembalikan.</p> : perbaikan.map((t) => (
            <div key={t.id} className="flex flex-col gap-1.5 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-400/30">
              <b className="text-[13.5px] tabular-nums">{invoiceLabel(t.project?.invoice_no)}{t.title ? ` · ${String(t.title).replace(/^terjemahan tersumpah:\s*/i, '')}` : ''}</b>
              <span className="whitespace-pre-line text-[12.5px] text-ink-soft">Catatan pemeriksa: {t.data.perbaikan_note}</span>
              {t.project && <div className="[&_button]:min-h-11"><AksiTugasBaris project={t.project} hp /></div>}
            </div>))}
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
      </aside>
      </div>
      {berkas && (
        <Sheet open xwide onClose={() => setBerkas(null)} title="File Project" subtitle={`${invoiceLabel(berkas.invoice_no)} · ${berkas.customer?.name || ''}`}
          footer={<Button variant="outline" className="flex-1 sm:flex-none sm:px-6" onClick={() => setBerkas(null)}>Tutup</Button>}>
          <FileManager kelompok project={projects.find((x) => x.id === berkas.id) || berkas} />
        </Sheet>
      )}
    </div>
  )
}
