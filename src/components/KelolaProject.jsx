import { useState } from 'react'
import { Archive, Trash2, RotateCcw, AlertTriangle } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { go } from '../lib/router.js'
import { can, invoiceLabel } from '../config/access.js'
import { Button, Sheet, Input, cx } from './ui.jsx'
import { tgl } from '../lib/format.js'

// ============================================================
//  ARSIP / HAPUS / HAPUS PAKSA PROJECT — hanya yang berizin
//  "project.hapus" (bawaan: Super Admin saja).
//  • Arsipkan    : disembunyikan dari daftar, dasbor & laporan; bisa dipulihkan.
//  • Hapus       : dipindah ke Sampah; bisa dipulihkan, tidak ada yang hilang.
//  • Hapus paksa : dihapus permanen dari database — wajib mengetik nomor invoice.
//  Semua tercatat di riwayat project (siapa & kapan).
// ============================================================
const cap = (p, user, aksi) => ({ history_admin: [...(p.history_admin || []), { at: new Date().toISOString(), by: user.name, action: aksi }] })

/** Tombol + lembar pilihan di halaman detail project. */
export function KelolaProject({ project, ringkas }) {
  const { user, save, remove, notify } = useApp()
  const [buka, setBuka] = useState(false)
  const [ketik, setKetik] = useState('')
  const [sibuk, setSibuk] = useState('')
  if (!can.deleteProject(user)) return null
  const no = invoiceLabel(project.invoice_no)
  const jalan = async (kunci, fn, pesan) => { setSibuk(kunci); try { await fn(); notify(pesan); setBuka(false); go('projects') } catch (e) { notify(e.message, 'err') } finally { setSibuk('') } }
  const arsip = () => jalan('arsip', () => save('projects', { id: project.id, archived: true, archived_at: new Date().toISOString(), archived_by: user.name, ...cap(project, user, 'Diarsipkan') }), `Project ${no} diarsipkan — bisa dipulihkan dari Arsip & Sampah`)
  const hapus = () => jalan('hapus', () => save('projects', { id: project.id, deleted_at: new Date().toISOString(), deleted_by: user.name, ...cap(project, user, 'Dipindah ke Sampah') }), `Project ${no} dipindah ke Sampah — bisa dipulihkan`)
  const paksa = () => jalan('paksa', () => remove('projects', project.id), `Project ${no} dihapus permanen`)
  const cocok = ketik.trim().toUpperCase().replace(/^INV-/, '') === String(no).toUpperCase().replace(/^INV-/, '')
  return (
    <>
      {ringkas
        ? <button type="button" onClick={() => setBuka(true)} aria-label="Arsip / hapus project" title="Arsip / hapus project" data-aksi="kelola-project" className="grid h-9 w-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50 max-md:h-11 max-md:w-11"><Trash2 className="h-4 w-4" /></button>
        : <Button size="sm" variant="danger" onClick={() => setBuka(true)} aria-label="Arsip / hapus project" data-aksi="kelola-project"><Trash2 className="h-3.5 w-3.5" /><span className="max-sm:hidden">Arsip / Hapus</span></Button>}
      {buka && (
        <Sheet open onClose={() => { setBuka(false); setKetik('') }} title={`Arsip / hapus ${no}`} subtitle="Hanya Super Admin. Semua tindakan dicatat.">
          <div className="space-y-3" data-kelola-project>
            <div className="rounded-2xl p-3.5 ring-1 ring-slate-200">
              <p className="flex items-center gap-2 text-sm font-bold"><Archive className="h-4 w-4 text-sky-700" />Arsipkan</p>
              <p className="mt-1 text-xs text-ink-soft">Project disembunyikan dari daftar, dasbor, dan laporan. Datanya utuh dan bisa dipulihkan kapan saja.</p>
              <Button className="mt-2.5 max-md:min-h-11" variant="outline" loading={sibuk === 'arsip'} disabled={!!sibuk} onClick={arsip} data-aksi="arsip-project"><Archive className="h-4 w-4" />Arsipkan project</Button>
            </div>
            <div className="rounded-2xl p-3.5 ring-1 ring-slate-200">
              <p className="flex items-center gap-2 text-sm font-bold"><Trash2 className="h-4 w-4 text-amber-700" />Hapus (ke Sampah)</p>
              <p className="mt-1 text-xs text-ink-soft">Project dipindah ke Sampah. Tidak tampil di mana pun, tetapi masih bisa dipulihkan.</p>
              <Button className="mt-2.5 max-md:min-h-11" variant="outline" loading={sibuk === 'hapus'} disabled={!!sibuk} onClick={hapus} data-aksi="hapus-project"><Trash2 className="h-4 w-4" />Pindahkan ke Sampah</Button>
            </div>
            <div className="rounded-2xl bg-rose-50 p-3.5 ring-1 ring-rose-200">
              <p className="flex items-center gap-2 text-sm font-bold text-rose-800"><AlertTriangle className="h-4 w-4" />Hapus paksa (permanen)</p>
              <p className="mt-1 text-xs text-rose-900">Project dan seluruh riwayat tahapnya dihapus dari database. <b>Tidak bisa dibatalkan.</b> Ketik nomor invoice <b>{no}</b> untuk melanjutkan.</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Input value={ketik} onChange={(e) => setKetik(e.target.value)} placeholder={`Ketik ${no}`} aria-label="Ketik nomor invoice untuk hapus paksa" autoComplete="off" className="min-w-0 flex-1 basis-40 max-md:text-base" data-ketik-invoice />
                <Button variant="danger" className="max-md:min-h-11" loading={sibuk === 'paksa'} disabled={!cocok || !!sibuk} onClick={paksa} data-aksi="hapus-paksa">Hapus permanen</Button>
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </>
  )
}

/** Tombol + daftar Arsip & Sampah (di halaman Project) — pulihkan atau hapus paksa. */
export function ArsipSampah() {
  const { user, data, save, remove, notify, ask } = useApp()
  const [buka, setBuka] = useState(false)
  const [tab, setTab] = useState('arsip')
  const [sibuk, setSibuk] = useState('')
  if (!can.deleteProject(user)) return null
  const semua = data.projects_arsip || []
  const arsip = semua.filter((p) => !p.deleted_at), sampah = semua.filter((p) => p.deleted_at)
  const rows = tab === 'arsip' ? arsip : sampah
  const pulih = async (p) => { setSibuk(p.id); try { await save('projects', { id: p.id, archived: false, archived_at: null, deleted_at: null, deleted_by: null, ...cap(p, user, 'Dipulihkan') }); notify(`Project ${invoiceLabel(p.invoice_no)} dipulihkan`) } catch (e) { notify(e.message, 'err') } finally { setSibuk('') } }
  const paksa = async (p) => {
    if (!(await ask(`Hapus PERMANEN project ${invoiceLabel(p.invoice_no)}? Tindakan ini tidak bisa dibatalkan.`))) return
    setSibuk(p.id); try { await remove('projects', p.id); notify(`Project ${invoiceLabel(p.invoice_no)} dihapus permanen`) } catch (e) { notify(e.message, 'err') } finally { setSibuk('') }
  }
  return (
    <>
      <button type="button" onClick={() => setBuka(true)} data-aksi="arsip-sampah" title="Arsip & Sampah project"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-semibold text-ink-soft ring-1 ring-[#D9DBE7] hover:text-ink hover:ring-ink max-md:min-h-11 dark:bg-white/5 dark:ring-white/10">
        <Archive className="h-4 w-4" aria-hidden="true" />Arsip & Sampah{semua.length ? ` (${semua.length})` : ''}
      </button>
      {buka && (
        <Sheet open side onClose={() => setBuka(false)} title="Arsip & Sampah project" subtitle="Hanya Super Admin">
          <div className="space-y-3" data-arsip-sampah>
            <div className="flex gap-2" role="tablist">
              {[['arsip', `Arsip (${arsip.length})`], ['sampah', `Sampah (${sampah.length})`]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('min-h-10 flex-1 rounded-xl text-sm font-bold ring-1 max-md:min-h-11', tab === k ? 'bg-ink text-white ring-ink' : 'bg-white text-ink ring-slate-300')}>{l}</button>)}
            </div>
            {!rows.length && <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-ink-mute ring-1 ring-slate-200">{tab === 'arsip' ? 'Belum ada project yang diarsipkan.' : 'Sampah kosong.'}</p>}
            {rows.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-2xl p-3 ring-1 ring-slate-200" data-baris-arsip={p.invoice_no}>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-sm font-extrabold">{invoiceLabel(p.invoice_no)}</p>
                  <p className="truncate text-xs text-ink-soft">{p.customer?.name || '—'} · {p.branch}</p>
                  <p className="text-[11px] text-ink-mute">{p.deleted_at ? `Dihapus ${tgl(p.deleted_at)} oleh ${p.deleted_by || '—'}` : `Diarsipkan ${p.archived_at ? tgl(p.archived_at) : ''} oleh ${p.archived_by || '—'}`}</p>
                </div>
                <Button size="sm" variant="outline" className="max-md:min-h-11" loading={sibuk === p.id} disabled={!!sibuk} onClick={() => pulih(p)} data-aksi="pulihkan"><RotateCcw className="h-3.5 w-3.5" />Pulihkan</Button>
                <Button size="sm" variant="danger" className="max-md:min-h-11" disabled={!!sibuk} onClick={() => paksa(p)} data-aksi="hapus-paksa-baris"><Trash2 className="h-3.5 w-3.5" />Hapus paksa</Button>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}
