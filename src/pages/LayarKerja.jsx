// ============================================================
//  LAYAR KERJA PER INVOICE — desain CANVAS ATLAS ("Panel-Samping").
//  Layar penuh: kiri daftar invoice (cari), kanan ringkasan project,
//  daftar dokumen (pilih), kartu Tahap + kartu kerja (isian & tombol
//  tahap yang sama persis dengan detail project).
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, Search, Check } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { invoiceLabel } from '../config/access.js'
import { DONE, flowOf, stagesOf, stageIndex, stageLabel } from '../config/workflows.js'
import { infoDeadline } from '../components/BarisCanvas.jsx'
import { SUB_TYPES } from '../config/subtypes.js'
import ProjectDetail, { SubProject, TabDetailProject } from './ProjectDetail.jsx'
import { cx } from '../components/ui.jsx'
import SalinChatOrder from '../components/SalinChatOrder.jsx'
import EmailOtorisasi from '../components/EmailOtorisasi.jsx'

const PELAKSANA = ['penerjemah', 'proofreader', 'otorisator']
/** Warna kategori — sama dengan Project Baru (blok = field Kategori, kartu = latar + garis kartu), supaya tampilannya sudah dikenal. */
const TEMA = {
  terjemahan: { blok: '#2343C9', bg: '#EAF1FF', tepi: '#C9D8FB' },
  apostille: { blok: '#14275E', bg: '#FFF8DC', tepi: '#EBDD9C' },
  legalisasi: { blok: '#C62828', bg: '#FDECEC', tepi: '#F3C4C4' },
  jasa_lain: { blok: '#1E7A3C', bg: '#E9F7EE', tepi: '#BFE3CB' },
  terjemahan_nt: { blok: '#6D28D9', bg: '#F3ECFF', tepi: '#D9C8F8' },
}
/** Kotak isian hanya-tampil (label kecil + nilai), bentuknya sama dengan kolom di Project Baru. */
function Kotak({ label, children, className, style, tebal }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-[3px]', className)} style={style}>
      <span className="truncate text-[11px] font-semibold text-[#4F5470] dark:text-slate-400">{label}</span>
      <span className={cx('flex min-h-9 min-w-0 items-center rounded-[10px] bg-white px-2.5 text-sm ring-1 ring-[#D9DBE7] dark:bg-white/5 dark:ring-white/10', tebal && 'font-bold')}><span className="min-w-0 truncate">{children}</span></span>
    </div>
  )
}

export default function LayarKerja({ projectId, subId, daftar = [], onClose }) {
  const { user, data, nameOf } = useApp()
  const [pid, setPid] = useState(projectId)
  const [sid, setSid] = useState(subId || null)
  const [q, setQ] = useState('')
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', f); document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', f); document.body.style.overflow = '' }
  }, [onClose])
  const project = data.projects.find((p) => p.id === pid)
  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    const dasar = daftar.length ? daftar.map((p) => data.projects.find((x) => x.id === p.id) || p) : project ? [project] : []
    return dasar.filter((p) => !k || `${p.invoice_no} ${p.customer?.name || ''}`.toLowerCase().includes(k)).slice(0, 80)
  }, [daftar, data.projects, q, project])
  if (!project) return null
  const subs = project.sub_projects || []
  const akt = subs.find((x) => x.id === sid) || subs.find((x) => x.stage !== DONE) || subs[0]
  const dl = infoDeadline(project)
  const print = project.about?.print_location || project.branch
  const cs = String(project.about?.cs_name || '').replace(/\s*\(.*\)\s*$/, '')
  const flow = akt ? flowOf(akt, project) : null
  const st = flow ? stagesOf(flow) : []
  const pos = akt ? (akt.stage === DONE ? st.length : stageIndex(flow, akt.stage)) : 0

  return createPortal(
    <div className="fixed inset-0 z-[200] flex bg-[#F3F4F9] text-[#141B34] dark:bg-[#0f1424] dark:text-slate-100" role="dialog" aria-modal="true" aria-label={`Layar kerja ${invoiceLabel(project.invoice_no)}`} data-layar-kerja>
      <nav aria-label="Daftar invoice" className="hidden w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-[#E7E8F0] bg-white px-3 py-4 md:flex dark:border-white/10 dark:bg-[#121729]">
        <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-1.5 self-start px-2 text-[13px] font-bold"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Daftar project</button>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#D9DBE7] px-3">
          <Search className="h-4 w-4 text-[#5E6380]" aria-hidden="true" /><span className="sr-only">Cari invoice</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari invoice" className="h-10 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none focus:ring-0" />
        </label>
        <div className="flex flex-col gap-1">
          {list.map((p) => {
            const on = p.id === pid; const d = infoDeadline(p)
            return (
              <button key={p.id} type="button" onClick={() => { setPid(p.id); setSid(null) }} aria-current={on ? 'true' : undefined} data-pilih-invoice
                className={cx('flex min-h-[52px] w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left', on ? 'bg-[#141B34] text-white' : 'hover:bg-[#F3F4F9] dark:hover:bg-white/5')}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-sm font-bold tabular-nums">{invoiceLabel(p.invoice_no)}</span><span className="truncate text-xs opacity-80">{p.customer?.name}</span></span>
                {d && <span className="inline-flex min-h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[11px] font-bold" style={{ background: d.bg, color: d.fg }}>{d.tgl.replace(/ \d\d\.\d\d$/, '')}</span>}
              </button>
            )
          })}
        </div>
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto px-3 pb-10 pt-5 sm:px-6">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-3.5">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-1.5 self-start text-[13px] font-bold md:hidden"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Daftar project</button>
          {/* Kepala + data project: bentuknya mengikuti Project Baru (kotak isian yang sama, hanya tampil) */}
          <div className="flex flex-col gap-0.5 px-1">
            <span className="truncate text-xs font-semibold text-[#5E6380]">Project · {project.customer?.name || '—'}</span>
            <h1 className="text-[22px] font-extrabold tracking-tight tabular-nums">{invoiceLabel(project.invoice_no)}</h1>
          </div>
          <div className="flex flex-wrap items-start gap-2.5 rounded-2xl bg-white px-4 py-3.5 dark:bg-white/5" data-lk-project>
            <Kotak label="Prioritas" tebal className="max-md:basis-[calc(50%-5px)] max-md:grow" style={{ flex: '1 1 130px' }}>{project.about?.priority || 'Normal'}</Kotak>
            <div className="flex min-w-0 flex-col gap-[3px] max-md:basis-full" style={{ flex: '1.6 1 220px' }}>
              <span className="text-[11px] font-semibold text-[#4F5470] dark:text-slate-400">Deadline (WITA)</span>
              <span className="flex min-h-9 items-center rounded-[10px] px-2.5 text-sm font-bold ring-1 ring-[#D9DBE7]" style={dl ? { background: dl.bg, color: dl.fg } : undefined}>{dl ? `${dl.tgl} · ${dl.sisa}` : '—'}</span>
            </div>
            <Kotak label="Cabang" className="max-md:basis-[calc(50%-5px)] max-md:grow" style={{ flex: '1 1 110px' }}>{project.branch}</Kotak>
            <Kotak label="Print" className="max-md:basis-[calc(50%-5px)] max-md:grow" style={{ flex: '1 1 110px' }}>{print}</Kotak>
            <Kotak label="CS" className="max-md:basis-[calc(50%-5px)] max-md:grow" style={{ flex: '1.4 1 150px' }}>{cs || '—'}</Kotak>
          </div>

          {PELAKSANA.includes(user.role) ? (
            <div className="rounded-2xl bg-white p-4 dark:bg-white/5"><ProjectDetail id={project.id} embedded focusSub={akt?.id} /></div>
          ) : (<>
            {/* Tiap sub = kartu berwarna kategori dengan baris atas seperti Project Baru. Sub yang dipilih terbuka: tahap satu baris + isian kerja. */}
            {subs.map((x, n) => {
              const f = flowOf(x, project); const s2 = stagesOf(f); const selesai = x.stage === DONE; const k = selesai ? s2.length : stageIndex(f, x.stage); const on = x.id === akt?.id
              const t = TEMA[x.type] || TEMA.jasa_lain
              const nDok = x.docs?.length || x.file_count || 0
              const nHlm = x.docs?.length ? x.docs.reduce((a, d) => a + (Number(d.pages) || 0), 0) : (Number(x.pages) || 0)
              const tr = ['terjemahan', 'terjemahan_nt'].includes(x.type)
              const vendor = x.translator_kind === 'vendor' || x.executor_kind === 'vendor'
              const siapa = tr ? (x.translator_kind === 'vendor' ? nameOf(x.translator || x.data?.vendor) : nameOf(x.data?.translator || x.translator)) : nameOf(x.executor_id)
              const tujuan = tr ? null : x.type === 'apostille' ? ['Negara', x.country] : x.type === 'legalisasi' ? ['Lembaga', nameOf(x.institution)] : null
              return (
                <section key={x.id} aria-label={`Sub project ${n + 1}: ${x.title}`} className="flex flex-col gap-3 rounded-2xl p-3 ring-1 md:p-3.5" style={{ background: t.bg, '--tw-ring-color': t.tepi }} data-lk-sub={x.type} data-buka={on ? '' : undefined}>
                  <button type="button" onClick={() => setSid(x.id)} aria-expanded={on} data-pilih-sub title={x.title} className="flex w-full flex-wrap items-end gap-2.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-[#141B34] text-sm font-extrabold text-white max-md:h-11 max-md:w-11">{n + 1}</span>
                    <span className="flex min-w-0 flex-col gap-[3px] max-md:basis-0 max-md:grow" style={{ flex: '1.2 1 180px' }}>
                      <span className="text-[11px] font-semibold text-[#4F5470]">Kategori</span>
                      <span className="flex min-h-9 items-center rounded-[10px] px-3 text-sm font-bold text-white max-md:min-h-11" style={{ background: t.blok }}><span className="min-w-0 truncate">{(SUB_TYPES[x.type] ?? SUB_TYPES.jasa_lain).label}</span></span>
                    </span>
                    {tr && <Kotak label="Bahasa" className="max-md:basis-full" style={{ flex: '1.5 1 200px' }}>{x.lang_from && x.lang_to ? `${x.lang_from} → ${x.lang_to}` : '—'}</Kotak>}
                    {tujuan && <Kotak label={tujuan[0]} className="max-md:basis-full" style={{ flex: '1.5 1 200px' }}>{tujuan[1] || '—'}</Kotak>}
                    <Kotak label="Dok · Hlm" className="max-md:basis-[calc(50%-5px)] max-md:grow" style={{ flex: '0 0 96px' }}>{nDok} · {nHlm}</Kotak>
                    <Kotak label={tr ? (vendor ? 'Penerjemah · vendor' : 'Penerjemah') : (vendor ? 'Eksekutor · vendor' : 'Eksekutor')} className="max-md:basis-[calc(50%-5px)] max-md:grow" style={{ flex: '1.2 1 150px' }}>{siapa || (tr ? 'Direktur' : '—')}</Kotak>
                    <Kotak label={selesai ? 'Status' : `Tahap ${k + 1} dari ${s2.length}`} tebal className="max-md:basis-full" style={{ flex: '1.6 1 200px' }}>{selesai ? 'Selesai' : stageLabel(f, x.stage)}</Kotak>
                  </button>
                  {on && (
                    <>
                      <ol aria-label={selesai ? 'Semua tahap selesai' : `Tahap ${k + 1} dari ${s2.length}: ${stageLabel(f, x.stage)}`} className="flex items-center px-1" data-lk-tahap>
                        {s2.map((z, i) => (
                          <li key={z.key} title={`${i + 1}. ${z.label}`} className={cx('flex items-center', i < s2.length - 1 && 'flex-1')}>
                            <span className={cx('grid h-[18px] w-[18px] flex-none place-items-center rounded-full', i < k ? 'bg-[#141B34] text-white' : i === k ? 'bg-[#2343C9] ring-[3px] ring-[#C9D8FB]' : 'bg-white ring-1 ring-inset ring-[#C4C8D8]')}>{i < k && <Check className="h-3 w-3" aria-hidden="true" />}</span>
                            {i < s2.length - 1 && <span aria-hidden="true" className={cx('h-0.5 flex-1', i < k ? 'bg-[#141B34]' : 'bg-[#D9DBE7]')} />}
                          </li>
                        ))}
                      </ol>
                      {!selesai && s2[k + 1] && <p className="-mt-1.5 px-1 text-[11px] text-[#4F5470]">Berikutnya: {s2[k + 1].label}</p>}
                      <div className="min-w-0 overflow-hidden rounded-xl bg-white ring-1 ring-black/5 dark:bg-[#121729]" data-lk-kerja>
                        <SubProject key={x.id} n={n + 1} project={project} sub={x} compact tanpaTahap tanpaKepala />
                      </div>
                    </>
                  )}
                </section>
              )
            })}
            <SalinChatOrder project={project} />
            <EmailOtorisasi project={project} />
            {/* Tab bagian lain project (catatan, file, kurir, portal, riwayat) — sama dengan halaman detail */}
            <section aria-label="Bagian lain project" className="flex flex-col gap-3 rounded-2xl bg-white p-3 sm:p-4 dark:bg-white/5" data-tab-layar-kerja>
              <TabDetailProject key={project.id} project={project} />
            </section>
          </>)}
        </div>
      </main>
    </div>,
    document.body
  )
}
