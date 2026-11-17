import { Fragment, useRef, useState } from 'react'
import { Download, Upload, Loader2, ChevronDown, ChevronRight, CheckCircle2, FileText, BadgeCheck, Trash2, RefreshCw } from 'lucide-react'
import { portal } from '../lib/portalClient.js'
import { saveBlob } from '../lib/download.js'
import { cx } from './ui.jsx'
import { tgl, jam } from '../lib/format.js'

/**
 * To-do vendor: satu tabel sederhana. Tiap baris = satu invoice.
 * Unduh sumber sekaligus (ZIP), unggah hasil sekaligus (massal). Klik baris → daftar dokumen yang harus dikerjakan.
 * Data hanya milik vendor pemegang tautan (disaring di portalCore.vendorView).
 */
const WARNA = { Selesai: 'bg-emerald-100 text-emerald-800', 'Hasil diunggah': 'bg-sky-100 text-sky-800', Dikerjakan: 'bg-amber-100 text-amber-900' }
const inv = (n) => String(n || '').replace(/^INV-/i, '')
const beres = (r) => r.status !== 'Dikerjakan' // hasil sudah diunggah / selesai → baris biru + centang biru
const baru = (r) => !beres(r) && r.masuk && Date.now() - new Date(r.masuk).getTime() < 24 * 36e5
const Tanda = ({ r }) => (
  <>
    {beres(r) && <BadgeCheck className="inline h-[18px] w-[18px] flex-none text-[#1D5FD1]" aria-label="Sudah diunggah" data-centang-biru />}
    {baru(r) && <span className="inline-flex flex-none items-center rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white" data-new>NEW</span>}
  </>
)

export default function PortalVendorTodo({ token, todo = [], transfer = [], onUbah, onExpired }) {
  const [buka, setBuka] = useState(null)
  const [sibuk, setSibuk] = useState('')
  const [pesan, setPesan] = useState(null)
  const pilihRef = useRef(null)
  const sasaran = useRef(null)
  const gantiRef = useRef(null) // file hasil yang sedang diganti (unggah pengganti dulu, baru yang lama dihapus)
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
      await saveBlob(`${inv(r.ref)} ${r.nama || ''}`.trim().replace(/[\\/:*?"<>|]/g, '-') + '.zip', await zip.generateAsync({ type: 'blob' }))
      setPesan({ jenis: 'ok', teks: `${r.sumber.length} dokumen sumber ${inv(r.ref)} diunduh sebagai ZIP.` })
    } catch (e) { galat(e) } finally { setSibuk('') }
  }
  // Bukti transfer per project (invoice): satu tombol unduh per bukti.
  const buktiOf = (r) => transfer.filter((t) => t.ref && t.untuk.some((u) => u.ref === r.ref))
  const unduhBukti = async (t) => {
    setSibuk(`bukti:${t.ref}`); setPesan(null)
    try { const f = await portal.file(token, t.ref); await saveBlob(f.name || t.name || 'Bukti transfer', f.blob) } catch (e) { galat(e) } finally { setSibuk('') }
  }
  const TombolBukti = ({ r, penuh }) => { const list = buktiOf(r); return list.length
    ? <span className={cx('flex flex-col gap-1', penuh && 'w-full')}>{list.map((t) => (
        <button key={t.ref} type="button" onClick={(e) => { e.stopPropagation(); unduhBukti(t) }} disabled={!!sibuk} data-unduh-bukti title={t.name || 'Bukti transfer'} className={cx('inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50', penuh && 'w-full')}>
          {sibuk === `bukti:${t.ref}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span className="whitespace-nowrap">Bukti{t.date ? ` ${tgl(t.date)}` : ''}</span></button>))}</span>
    : <span className="text-sm text-ink-mute">Belum ada</span> }
  const mintaUnggah = (r, ganti = null) => { sasaran.current = r; gantiRef.current = ganti; if (pilihRef.current) pilihRef.current.multiple = !ganti; pilihRef.current?.click() }
  const hapusHasil = async (r, h) => {
    if (!window.confirm(`Hapus file hasil "${h.name}"?`)) return
    setSibuk(`del:${h.id}`); setPesan(null)
    try { await portal.hapusHasil(token, r.id, h.id); setPesan({ jenis: 'ok', teks: `File "${h.name}" dihapus.` }); await onUbah?.() } catch (e) { galat(e) } finally { setSibuk('') }
  }
  const unggah = async (files) => {
    const r = sasaran.current; const lama = gantiRef.current; gantiRef.current = null
    if (!r || !files.length) return
    setSibuk(`up:${r.id}`); setPesan(null)
    try {
      const h = await portal.upload(token, r.id, lama ? files.slice(0, 1) : files)
      if (lama) await portal.hapusHasil(token, r.id, lama.id)
      setPesan({ jenis: 'ok', teks: lama ? `File "${lama.name}" diganti. Tim 247 akan memeriksanya.` : `${h.n} file hasil ${inv(r.ref)} terkirim. Tim 247 akan memeriksanya.` })
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
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">{r.hasil.map((h, i) => (
          <li key={h.id || i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm" data-hasil>
            <FileText className="h-4 w-4 flex-none text-[#1D5FD1]" /><span className="min-w-0 flex-1 basis-40 break-all font-semibold">{h.name}</span>
            {h.at && <span className="flex-none text-xs text-ink-mute" data-cap-waktu>{jam(h.at)}</span>}
            {h.milik && h.id && <span className="flex flex-none gap-1.5">
              <button type="button" onClick={() => mintaUnggah(r, h)} disabled={!!sibuk} data-ganti-hasil className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-white px-2.5 text-xs font-bold ring-1 ring-slate-300 hover:ring-ink disabled:opacity-50 max-md:min-h-11"><RefreshCw className="h-3.5 w-3.5" />Ganti</button>
              <button type="button" onClick={() => hapusHasil(r, h)} disabled={!!sibuk} data-hapus-hasil className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-white px-2.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 hover:ring-rose-500 disabled:opacity-50 max-md:min-h-11">{sibuk === `del:${h.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Hapus</button>
            </span>}
          </li>))}</ul>
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
            <tr><th className="w-8 px-2 py-3" /><th className="px-2 py-3">No Invoice</th><th className="px-2 py-3">Nama</th><th className="px-2 py-3">Deadline</th><th className="px-2 py-3 text-center">Dok</th><th className="px-2 py-3 text-center">Hal</th><th className="px-2 py-3">Alamat Kirim</th><th className="px-2 py-3">Download Sumber</th><th className="px-2 py-3">Upload Hasil</th><th className="px-2 py-3">Bukti Transfer</th><th className="px-3 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {todo.map((r) => (
              <Fragment key={r.id}>
                <tr data-baris-todo={r.ref} data-beres={beres(r) ? '1' : '0'} onClick={() => setBuka(buka === r.id ? null : r.id)} className={cx('cursor-pointer align-top', beres(r) ? 'bg-[#DCEBFF] hover:bg-[#CFE3FF]' : 'bg-white hover:bg-slate-50')}>
                  <td className="px-2 py-2"><button type="button" aria-expanded={buka === r.id} aria-label={`Lihat daftar dokumen ${inv(r.ref)}`} className="grid h-9 w-8 place-items-center rounded-lg text-ink-soft">{buka === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td>
                  <td className="px-2 py-3.5"><span className="flex items-center gap-1.5 whitespace-nowrap font-extrabold">{inv(r.ref)}<Tanda r={r} /></span>{r.masuk && <span className="block whitespace-nowrap text-[11px] text-ink-mute" data-masuk>Masuk {jam(r.masuk)}</span>}</td>
                  <td className="max-w-[180px] px-2 py-3.5">{r.nama}</td>
                  <td className="whitespace-nowrap px-2 py-3.5">{r.deadline ? tgl(r.deadline) : '—'}{r.jam && <span className="block text-xs text-ink-mute">{r.jam} WITA</span>}</td>
                  <td className="px-2 py-3.5 text-center font-semibold tabular-nums">{r.dok}</td>
                  <td className="px-2 py-3.5 text-center font-semibold tabular-nums">{r.hal || '—'}</td>
                  <td className="max-w-[200px] px-2 py-3.5 text-xs text-ink-soft">{r.alamat || '—'}</td>
                  <td className="px-2 py-2"><TombolZip r={r} /></td>
                  <td className="px-2 py-2"><TombolUnggah r={r} /></td>
                  <td className="px-2 py-2"><TombolBukti r={r} /></td>
                  <td className="px-3 py-3.5"><Status r={r} /></td>
                </tr>
                {buka === r.id && <tr className={beres(r) ? 'bg-[#EEF5FF]' : 'bg-slate-50'}><td /><td colSpan={10} className="px-2 pb-4 pt-1"><Rincian r={r} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {/* Kartu (ponsel) */}
      <div className="space-y-2 md:hidden">
        {todo.map((r) => (
          <section key={r.id} data-baris-todo={r.ref} data-beres={beres(r) ? '1' : '0'} className={cx('rounded-2xl p-3.5 shadow-sm ring-1', beres(r) ? 'bg-[#DCEBFF] ring-[#B5D2FB]' : 'bg-white ring-slate-200')}>
            <button type="button" onClick={() => setBuka(buka === r.id ? null : r.id)} aria-expanded={buka === r.id} className="flex min-h-11 w-full items-start gap-2 text-left">
              <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-lg font-extrabold leading-tight">{inv(r.ref)}<Tanda r={r} /></span><span className="block truncate text-sm text-ink-soft">{r.nama}</span></span>
              <Status r={r} />{buka === r.id ? <ChevronDown className="mt-1 h-5 w-5 flex-none" /> : <ChevronRight className="mt-1 h-5 w-5 flex-none" />}
            </button>
            {r.masuk && <p className="mt-0.5 text-[11px] text-ink-mute">Masuk {jam(r.masuk)}</p>}
            <p className="mt-1 text-sm"><span className="text-ink-mute">Deadline</span> <b>{r.deadline ? tgl(r.deadline) : '—'}{r.jam ? ` ${r.jam}` : ''}</b> · <b>{r.dok}</b> dok · <b>{r.hal || '—'}</b> hal</p>
            {r.alamat && <p className="mt-1 text-xs text-ink-soft"><span className="font-semibold text-ink-mute">Alamat kirim:</span> {r.alamat}</p>}
            <div className="mt-2.5 grid grid-cols-2 gap-2"><TombolZip r={r} penuh /><TombolUnggah r={r} penuh /></div>
            {buktiOf(r).length > 0 && <div className="mt-2"><p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-mute">Bukti transfer</p><TombolBukti r={r} penuh /></div>}
            {buka === r.id && <div className="mt-3 border-t border-slate-200 pt-3"><Rincian r={r} /></div>}
          </section>
        ))}
      </div>
    </div>
  )
}
