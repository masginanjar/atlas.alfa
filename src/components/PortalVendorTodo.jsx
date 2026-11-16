import { Fragment, useRef, useState } from 'react'
import { Download, Upload, Loader2, ChevronDown, ChevronRight, CheckCircle2, FileText } from 'lucide-react'
import { portal } from '../lib/portalClient.js'
import { saveBlob } from '../lib/download.js'
import { cx } from './ui.jsx'
import { tgl } from '../lib/format.js'

/**
 * To-do vendor: satu tabel sederhana. Tiap baris = satu invoice.
 * Unduh sumber sekaligus (ZIP), unggah hasil sekaligus (massal). Klik baris → daftar dokumen yang harus dikerjakan.
 * Data hanya milik vendor pemegang tautan (disaring di portalCore.vendorView).
 */
const WARNA = { Selesai: 'bg-emerald-100 text-emerald-800', 'Hasil diunggah': 'bg-sky-100 text-sky-800', Dikerjakan: 'bg-amber-100 text-amber-900' }
const inv = (n) => String(n || '').replace(/^INV-/i, '')

export default function PortalVendorTodo({ token, todo = [], onUbah, onExpired }) {
  const [buka, setBuka] = useState(null)
  const [sibuk, setSibuk] = useState('')
  const [pesan, setPesan] = useState(null)
  const pilihRef = useRef(null)
  const sasaran = useRef(null)
  const galat = (e) => { setPesan({ jenis: 'err', teks: e.message || 'Terjadi kendala. Coba lagi.' }); if (/tidak aktif|Sesi/.test(e.message || '')) onExpired?.() }

  const unduhZip = async (r) => {
    if (!r.sumber.length) return
    setSibuk(`zip:${r.id}`); setPesan(null)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip(); const dipakai = new Set()
      for (const s of r.sumber) {
        const f = await portal.file(token, s.ref)
        let nama = f.name || s.name || 'dokumen'; let k = 1
        while (dipakai.has(nama)) nama = (f.name || s.name || 'dokumen').replace(/(\.[^.]+)?$/, ` (${++k})$1`)
        dipakai.add(nama); zip.file(nama, f.blob)
      }
      await saveBlob(`Sumber ${inv(r.ref)}.zip`, await zip.generateAsync({ type: 'blob' }))
      setPesan({ jenis: 'ok', teks: `${r.sumber.length} dokumen sumber ${inv(r.ref)} diunduh sebagai ZIP.` })
    } catch (e) { galat(e) } finally { setSibuk('') }
  }
  const mintaUnggah = (r) => { sasaran.current = r; pilihRef.current?.click() }
  const unggah = async (files) => {
    const r = sasaran.current; if (!r || !files.length) return
    setSibuk(`up:${r.id}`); setPesan(null)
    try {
      const h = await portal.upload(token, r.id, files)
      setPesan({ jenis: 'ok', teks: `${h.n} file hasil ${inv(r.ref)} terkirim. Tim 247 akan memeriksanya.` })
      await onUbah?.()
    } catch (e) { galat(e) } finally { setSibuk('') }
  }
  const TombolZip = ({ r, penuh }) => (r.sumber.length
    ? <button type="button" onClick={(e) => { e.stopPropagation(); unduhZip(r) }} disabled={!!sibuk} data-unduh-zip className={cx('inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-sm font-bold text-ink ring-2 ring-slate-300 hover:ring-ink disabled:opacity-50', penuh && 'w-full')}>
        {sibuk === `zip:${r.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}ZIP ({r.sumber.length})</button>
    : <span className="text-sm text-ink-mute">Belum ada</span>)
  const TombolUnggah = ({ r, penuh }) => (r.status === 'Selesai'
    ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{r.hasil.length} file</span>
    : <button type="button" onClick={(e) => { e.stopPropagation(); mintaUnggah(r) }} disabled={!!sibuk} data-unggah-hasil className={cx('inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-ink px-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50', penuh && 'w-full')}>
        {sibuk === `up:${r.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{r.hasil.length ? `Tambah (${r.hasil.length})` : 'Upload'}</button>)
  const Status = ({ r }) => <span className={cx('inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold', WARNA[r.status])} data-status>{r.status}</span>
  const Rincian = ({ r }) => (
    <div className="space-y-3" data-rincian>
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-mute">Dokumen yang diterjemahkan ({r.docs.length})</p>
        <ol className="divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {r.docs.map((d, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm"><span className="w-5 flex-none text-right text-ink-mute">{i + 1}</span><span className="min-w-0 flex-1 break-words font-semibold">{d.desc}</span>{d.lang && <span className="flex-none text-xs text-ink-soft">{d.lang}</span>}<span className="w-14 flex-none text-right text-xs text-ink-soft">{d.pages ? `${d.pages} hlm` : ''}</span></li>
          ))}
          {!r.docs.length && <li className="px-3 py-2 text-sm text-ink-mute">Daftar dokumen belum diisi.</li>}
        </ol>
      </div>
      {r.hasil.length > 0 && <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-mute">Hasil yang sudah diunggah ({r.hasil.length})</p>
        <ul className="space-y-1">{r.hasil.map((h, i) => <li key={i} className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 flex-none text-emerald-700" /><span className="min-w-0 break-all">{h.name}</span>{h.at && <span className="flex-none text-xs text-ink-mute">{tgl(h.at)}</span>}</li>)}</ul>
      </div>}
    </div>
  )

  if (!todo.length) return <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200"><FileText className="mx-auto mb-2 h-10 w-10 text-brand" /><p className="text-xl font-extrabold">Belum ada pekerjaan</p><p className="mt-1 text-base text-ink-soft">Pekerjaan baru akan muncul di sini.</p></div>
  return (
    <div className="space-y-3" data-todo-vendor>
      <input ref={pilihRef} type="file" multiple className="hidden" aria-label="Pilih file hasil (bisa banyak)" onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; unggah(fs) }} />
      {pesan && <p role={pesan.jenis === 'err' ? 'alert' : 'status'} className={cx('rounded-xl px-4 py-3 text-base font-semibold', pesan.jenis === 'err' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800')} data-pesan={pesan.jenis}>{pesan.teks}</p>}
      {/* Tabel (layar lebar) */}
      <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs font-bold uppercase tracking-wide text-ink">
            <tr><th className="w-8 px-2 py-3" /><th className="px-2 py-3">No Invoice</th><th className="px-2 py-3">Nama</th><th className="px-2 py-3">Deadline</th><th className="px-2 py-3 text-center">Dok</th><th className="px-2 py-3 text-center">Hal</th><th className="px-2 py-3">Alamat Kirim</th><th className="px-2 py-3">Download Sumber</th><th className="px-2 py-3">Upload Hasil</th><th className="px-3 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {todo.map((r) => (
              <Fragment key={r.id}>
                <tr data-baris-todo={r.ref} onClick={() => setBuka(buka === r.id ? null : r.id)} className={cx('cursor-pointer align-middle hover:bg-slate-50', buka === r.id && 'bg-slate-50')}>
                  <td className="px-2 py-2"><button type="button" aria-expanded={buka === r.id} aria-label={`Lihat daftar dokumen ${inv(r.ref)}`} className="grid h-9 w-8 place-items-center rounded-lg text-ink-soft">{buka === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td>
                  <td className="whitespace-nowrap px-2 py-2 font-extrabold">{inv(r.ref)}</td>
                  <td className="max-w-[180px] px-2 py-2">{r.nama}</td>
                  <td className="whitespace-nowrap px-2 py-2">{r.deadline ? tgl(r.deadline) : '—'}{r.jam && <span className="block text-xs text-ink-mute">{r.jam} WITA</span>}</td>
                  <td className="px-2 py-2 text-center font-semibold tabular-nums">{r.dok}</td>
                  <td className="px-2 py-2 text-center font-semibold tabular-nums">{r.hal || '—'}</td>
                  <td className="max-w-[220px] px-2 py-2 text-xs text-ink-soft">{r.alamat || '—'}</td>
                  <td className="px-2 py-2"><TombolZip r={r} /></td>
                  <td className="px-2 py-2"><TombolUnggah r={r} /></td>
                  <td className="px-3 py-2"><Status r={r} /></td>
                </tr>
                {buka === r.id && <tr className="bg-slate-50"><td /><td colSpan={9} className="px-2 pb-4 pt-1"><Rincian r={r} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {/* Kartu (ponsel) */}
      <div className="space-y-2 md:hidden">
        {todo.map((r) => (
          <section key={r.id} data-baris-todo={r.ref} className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200">
            <button type="button" onClick={() => setBuka(buka === r.id ? null : r.id)} aria-expanded={buka === r.id} className="flex min-h-11 w-full items-start gap-2 text-left">
              <span className="min-w-0 flex-1"><span className="block text-lg font-extrabold leading-tight">{inv(r.ref)}</span><span className="block truncate text-sm text-ink-soft">{r.nama}</span></span>
              <Status r={r} />{buka === r.id ? <ChevronDown className="mt-1 h-5 w-5 flex-none" /> : <ChevronRight className="mt-1 h-5 w-5 flex-none" />}
            </button>
            <p className="mt-1 text-sm"><span className="text-ink-mute">Deadline</span> <b>{r.deadline ? tgl(r.deadline) : '—'}{r.jam ? ` ${r.jam}` : ''}</b> · <b>{r.dok}</b> dok · <b>{r.hal || '—'}</b> hal</p>
            {r.alamat && <p className="mt-1 text-xs text-ink-soft"><span className="font-semibold text-ink-mute">Alamat kirim:</span> {r.alamat}</p>}
            <div className="mt-2.5 grid grid-cols-2 gap-2"><TombolZip r={r} penuh /><TombolUnggah r={r} penuh /></div>
            {buka === r.id && <div className="mt-3 border-t border-slate-200 pt-3"><Rincian r={r} /></div>}
          </section>
        ))}
      </div>
    </div>
  )
}
