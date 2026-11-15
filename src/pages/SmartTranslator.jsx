import { useEffect, useMemo, useRef, useState } from 'react'
import { Languages, Lock, ExternalLink, FolderInput } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { invoiceLabel } from '../config/access.js'
import { SUB_TYPES } from '../config/subtypes.js'
import { uploadProjectFiles } from '../components/FileManager.jsx'
import PilihCari from '../components/PilihCari.jsx'
import { Button, Card, Empty, Input, Select, Sheet } from '../components/ui.jsx'

// ============================================================
//  SMART TRANSLATOR — aplikasi mandiri (public/smart-translator/app.html)
//  ditampilkan di dalam ATLAS. Proses dokumen (OCR KTP), Referensi kota,
//  Daftar pekerjaan, Glosarium, Template. Ruang kerja tiga panel (sumber | ekstraksi | terjemahan).
//  Gambar dibaca lewat server ATLAS (AI Gemini / Vision) bila login; cadangan Tesseract di perangkat. Akses: izin smart-translator.lihat (bawaan Superadmin).
//  "Simpan ke project": hasil FINAL dikirim aplikasi (postMessage) → di sini pengguna memilih project & sub project,
//  lalu berkas diunggah ke File Project. Butuh izin project.lampiran_kelola; daftar project mengikuti data yang boleh dilihat pengguna.
// ============================================================
const KUNCI_TUJUAN = 'atlas-st-tujuan'
export default function SmartTranslator() {
  const { user } = useApp()
  const ref = useRef(null)
  const [kirim, setKirim] = useState(null) // { filename, blob, jenis }
  const bisaSimpan = boleh(user, 'project.lampiran_kelola')
  useEffect(() => {
    const h = (e) => {
      if (e.origin !== window.location.origin || e.source !== ref.current?.contentWindow || e.data?.type !== 'st-simpan-folder' || !(e.data.blob instanceof Blob)) return
      setKirim({ filename: String(e.data.filename || 'hasil'), blob: e.data.blob, jenis: String(e.data.jenis || '') })
    }
    window.addEventListener('message', h); return () => window.removeEventListener('message', h)
  }, [])
  if (!boleh(user, 'smart-translator.lihat')) return <Card><Empty icon={Lock} title="Tidak ada akses" text="Smart Translator hanya untuk yang diberi izin." /></Card>
  const src = `smart-translator/app.html?embed=1${bisaSimpan ? '&folder=1' : ''}`
  return (
    <div className="space-y-2" data-halaman-smart-translator>
      <div className="flex items-center justify-end gap-2">
        <a href="smart-translator/app.html" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-semibold ring-1 ring-slate-200 hover:text-brand md:min-h-8"><ExternalLink className="h-4 w-4" />Buka layar penuh</a>
      </div>
      <iframe ref={ref} title="Smart Translator" src={src} className="block w-full rounded-2xl bg-[#F4F5F9] ring-1 ring-[#E7E8F0]" style={{ height: 'calc(100dvh - 158px)', minHeight: 480 }} />
      {kirim && bisaSimpan && <SimpanKeProject kirim={kirim} onClose={() => setKirim(null)}
        onBeres={(info) => { ref.current?.contentWindow?.postMessage({ type: 'st-simpan-folder-ok', ...info }, window.location.origin); setKirim(null) }} />}
    </div>
  )
}

/** Pilih project (nomor invoice) + sub project tujuan, lalu unggah berkas ke File Project. */
function SimpanKeProject({ kirim, onClose, onBeres }) {
  const { user, data, save, notify } = useApp()
  const projects = useMemo(() => [...(data.projects || [])].filter((p) => !p.demo_perf).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))), [data.projects])
  const [pid, setPid] = useState(() => { try { const t = localStorage.getItem(KUNCI_TUJUAN); return projects.some((p) => p.id === t) ? t : '' } catch { return '' } })
  const [subId, setSubId] = useState('')
  const [nama, setNama] = useState(kirim.filename)
  const [sibuk, setSibuk] = useState(false)
  const project = projects.find((p) => p.id === pid) || null
  const ext = (kirim.filename.match(/\.[a-z0-9]+$/i) || [''])[0]
  const namaBersih = `${nama.replace(/[\\/:*?"<>|]/g, '-').replace(/\.[a-z0-9]+$/i, '').trim() || 'hasil'}${ext}`
  const sudahAda = !!project && (project.files || []).some((f) => f.name === namaBersih)
  const opsi = useMemo(() => projects.slice(0, 400).map((p) => ({ value: p.id, label: `${invoiceLabel(p.invoice_no)} · ${p.customer?.name || '(tanpa nama)'} · ${p.branch || ''}` })), [projects])

  const simpan = async () => {
    if (!project || sibuk) return
    setSibuk(true)
    try {
      const [f] = await uploadProjectFiles([{ file: new File([kirim.blob], namaBersih, { type: kirim.blob.type }), name: namaBersih, sub_id: subId || null }], { branch: project.branch, invoice: project.invoice_no, by: user.name, subs: project.sub_projects })
      const kini = (data.projects || []).find((p) => p.id === project.id) || project
      await save('projects', { id: project.id, files: [...(kini.files || []), { ...f, jenis: 'smart_translator' }] })
      try { localStorage.setItem(KUNCI_TUJUAN, project.id) } catch { /* abaikan */ }
      notify(`Tersimpan di File Project ${invoiceLabel(project.invoice_no)}`)
      onBeres({ filename: namaBersih, invoice: invoiceLabel(project.invoice_no) })
    } catch (e) { notify(`Gagal menyimpan: ${e.message}`, 'err'); setSibuk(false) }
  }

  return (
    <Sheet open onClose={sibuk ? () => {} : onClose} title="Simpan ke project" subtitle={`${kirim.jenis ? kirim.jenis + ' · ' : ''}hasil final Smart Translator`}
      footer={<><Button variant="outline" className="max-md:min-h-11" disabled={sibuk} onClick={onClose}>Batal</Button><span className="flex-1" /><Button variant="dark" className="max-md:min-h-11" disabled={!project} loading={sibuk} onClick={simpan} data-aksi="st-simpan-project"><FolderInput className="h-4 w-4" />Simpan</Button></>}>
      <div className="space-y-4" data-simpan-ke-project>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Project tujuan (nomor invoice)</label>
          <PilihCari value={pid} onChange={(v) => { setPid(v); setSubId('') }} options={opsi} placeholder="Cari nomor invoice atau nama pelanggan…" label="Project tujuan" kosong="Project tidak ditemukan" />
          {!projects.length && <p className="mt-1 text-xs text-ink-mute">Belum ada project yang bisa Anda buka.</p>}
        </div>
        {project && (
          <div>
            <label htmlFor="st-sub" className="mb-1 block text-xs font-semibold text-ink-soft">Simpan di</label>
            <Select id="st-sub" value={subId} onChange={(e) => setSubId(e.target.value)} className="max-md:!h-11 max-md:text-base">
              <option value="">File Project (umum)</option>
              {(project.sub_projects || []).map((x, i) => <option key={x.id} value={x.id}>Sub {i + 1} · {x.title || SUB_TYPES[x.type]?.label || x.type}</option>)}
            </Select>
          </div>
        )}
        <div>
          <label htmlFor="st-nama" className="mb-1 block text-xs font-semibold text-ink-soft">Nama berkas</label>
          <Input id="st-nama" value={nama} onChange={(e) => setNama(e.target.value)} autoComplete="off" spellCheck={false} className="max-md:text-base" />
          <p className="mt-1 text-[11px] text-ink-mute">Disimpan sebagai <b className="break-all text-ink">{namaBersih}</b></p>
          {sudahAda && <p className="mt-1 text-[11px] font-semibold text-amber-700">Berkas dengan nama ini sudah ada di project. Berkas lama tidak ditimpa — yang baru ditambahkan sebagai berkas terpisah.</p>}
        </div>
      </div>
    </Sheet>
  )
}
