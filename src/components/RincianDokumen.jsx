// Rincian dokumen untuk pelaksana (penerjemah / proofreader / otorisator):
// dibuka dengan klik baris di daftar Project. Hanya bagian yang ditugaskan
// kepadanya, hanya dokumen sumber & hasil kerja — tanpa tahap, sub lain, hasil scan.
import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { fieldFiles } from './FileManager.jsx'
import { drive } from '../lib/integrations.js'
import { saveBlob } from '../lib/download.js'
import JenisTerjemahan from './JenisTerjemahan.jsx'

const HASIL = { hasil_terjemahan: 'Hasil terjemahan', hasil_vendor: 'Hasil vendor', hasil_proofread: 'Hasil pemeriksaan', file_final: 'Hasil otorisasi' }

export default function RincianDokumen({ project, subMilik }) {
  const { user, notify } = useApp()
  const [sibuk, setSibuk] = useState('')
  // Berkas hasil yang sudah ada ditampilkan menurut jenisnya; bila belum ada sama sekali, tertulis "belum diunggah"
  const kunciHasil = ['hasil_terjemahan', 'hasil_vendor', 'hasil_proofread', 'file_final']
  const subs = (project.sub_projects || []).filter((s) => !subMilik || subMilik(s))
  const unduh = async (f) => {
    if (sibuk) return
    try { setSibuk(f.id || f.name); await saveBlob(f.name, await drive.blob(f)) } catch (e) { notify(e.message, 'err') } finally { setSibuk('') }
  }
  const Berkas = ({ f }) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); unduh(f) }} disabled={!!sibuk} title={`Unduh ${f.name}`} data-unduh-berkas
      className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg bg-white px-2.5 text-left text-[12.5px] font-semibold text-ink ring-1 ring-slate-200 hover:ring-brand disabled:opacity-60 md:min-h-9 dark:bg-white/5 dark:ring-white/10">
      <span className="min-w-0 truncate">{f.name}</span>{sibuk === (f.id || f.name) ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5 shrink-0 text-ink-mute" aria-hidden="true" />}
    </button>
  )
  const Kosong = () => <span className="text-[12.5px] text-ink-mute">belum diunggah</span>
  if (!subs.length) return <p className="px-4 py-3 text-[13px] text-ink-mute">Tidak ada dokumen yang ditugaskan kepada Anda di project ini.</p>
  return (
    <div className="flex flex-col gap-2.5 px-3 py-3 md:px-4" onClick={(e) => e.stopPropagation()} data-rincian-dokumen>
      {subs.map((s) => {
        const docs = (s.docs || []).filter((d) => String(d?.desc || '').trim())
        const daftar = docs.length ? docs.map((d) => ({ nama: String(d.desc).trim(), hlm: Number(d.pages) || 0 })) : [{ nama: String(s.title || 'Dokumen').replace(/^terjemahan tersumpah:\s*/i, ''), hlm: Number(s.pages) || 0 }]
        const sumber = fieldFiles(s.data, 'dokumen_sumber')
        const hasil = kunciHasil.map((k) => [HASIL[k], fieldFiles(s.data, k)]).filter(([, l], i) => l.length || i === 0)
        return (
          <section key={s.id} className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">
            <p className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-1.5 text-[12px] dark:border-white/10" data-info-jenis><JenisTerjemahan subs={[s]} />{(s.type === 'terjemahan_nt' || s.flow === 'tr_nt') && <span className="text-ink-mute">Selesai diterjemahkan langsung ke Admin Pusat / CS — tanpa proofreader &amp; otorisasi.</span>}</p>
            {subs.length > 1 && <p className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[12px] font-bold text-ink-soft dark:border-white/10 dark:bg-white/5">{s.lang_from && s.lang_to ? `${s.lang_from} → ${s.lang_to}` : 'Dokumen'}</p>}
            <div className="grid gap-x-5 gap-y-3 p-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0"><p className="mb-1 text-[11.5px] font-bold text-ink-mute">Dokumen</p>
                <ol className="space-y-1 text-[13px]">{daftar.map((d, i) => <li key={i} className="flex min-w-0 gap-2"><span className="shrink-0 tabular-nums text-ink-mute">{i + 1}.</span><span className="min-w-0 break-words font-semibold">{d.nama}</span>{d.hlm > 0 && <span className="shrink-0 whitespace-nowrap text-ink-mute">· {d.hlm} hlm</span>}</li>)}</ol></div>
              <div className="min-w-0"><p className="mb-1 text-[11.5px] font-bold text-ink-mute">Dokumen sumber</p>
                <div className="flex flex-col items-start gap-1.5">{sumber.length ? sumber.map((f, i) => <Berkas key={f.id || i} f={f} />) : <Kosong />}</div></div>
              <div className="min-w-0">{hasil.map(([label, l]) => (
                <div key={label} className="mb-2 last:mb-0"><p className="mb-1 text-[11.5px] font-bold text-ink-mute">{label}</p>
                  <div className="flex flex-col items-start gap-1.5">{l.length ? l.map((f, i) => <Berkas key={f.id || i} f={f} />) : <Kosong />}</div></div>))}</div>
            </div>
          </section>
        )
      })}
    </div>
  )
}
