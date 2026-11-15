import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Loader2, Check, X, AlertTriangle, ChevronUp, ChevronDown, ImagePlus, CircleSlash, ArrowLeftRight, Sparkles } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { db, MODE } from '../lib/db.js'
import { drive } from '../lib/integrations.js'
import { invoiceLabel } from '../config/access.js'
import { rupiah } from '../lib/format.js'
import { Button, Sheet, cx } from './ui.jsx'
import { REQ_KINDS, scopeRequests, tandaiDibayar } from './Requests.jsx'
import { bacaScreenshot, bacaStruktur, terapkanAi, nominalKedua, cocokkan, potong } from '../lib/buktiMassal.js'
import { aiInfo, aiJalan, kanvasKeJpeg } from '../lib/ai.js'

// ============================================================
//  UPLOAD BUKTI TRANSFER MASSAL (Keuangan → +). Superadmin & Akunting.
//  Screenshot daftar transaksi → OCR di browser → crop per baris (+ header)
//  → cocokkan ke pengajuan "Perlu transfer" → preview → Konfirmasi & Upload.
//  Pembaca: AI Gemini (model di Pengaturan → AI) + cek ulang nominal dengan Tesseract; cadangan: Tesseract saja.
//  Mode otomatis (Pengaturan → AI): baris yang cocok pasti langsung diproses; baris ragu tetap menunggu Konfirmasi.
// ============================================================

// ---------- OCR (Tesseract, file di folder ocr/ — dimuat saat dibutuhkan) ----------
let workerJanji = null
function ambilWorker() {
  if (!workerJanji) {
    workerJanji = (async () => {
      const { createWorker } = await import('tesseract.js')
      const dasar = new URL('ocr/', document.baseURI).href
      // Data bahasa (eng, .gz) disimpan sebagai teks base64 agar bisa di-host di mana saja (artifact menolak berkas biner).
      // Didekode ke Blob → blob URL; '#' membuat akhiran '/eng.traineddata.gz' dari tesseract jadi fragmen (diabaikan fetch).
      const b64 = await (await fetch(dasar + 'eng-traineddata.b64.txt')).text()
      const bytes = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0))
      const langUrl = URL.createObjectURL(new Blob([bytes]))
      const w = await createWorker('eng', 1, { workerPath: dasar + 'worker.min.js', corePath: dasar, langPath: langUrl + '#', cacheMethod: 'none', workerBlobURL: false, gzip: true })
      await w.setParameters({ tessedit_pageseg_mode: '6' })
      return w
    })().catch((e) => { workerJanji = null; throw e })
  }
  return workerJanji
}
const keKanvas = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').putImageData(new ImageData(im.data, im.width, im.height), 0, 0); return c }
async function ocr(im, { angka } = {}) {
  const w = await ambilWorker()
  await w.setParameters({ tessedit_char_whitelist: angka ? 'Rp0123456789.,' : '' })
  return (await w.recognize(keKanvas(im))).data.text || ''
}
async function bacaFile(file) {
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
  const g = c.getContext('2d'); g.drawImage(bmp, 0, 0)
  return g.getImageData(0, 0, c.width, c.height)
}
/** Gambar bukti = header tabel ditempel di atas baris transaksi. */
function rakitBukti(im, hd, b) {
  const a = potong(im, hd.x0, hd.y0, hd.x1, hd.y1); const r = potong(im, hd.x0, b.y0, hd.x1, b.y1)
  const pad = 8; const c = document.createElement('canvas'); c.width = a.width + pad * 2; c.height = a.height + r.height + pad * 2
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
  g.putImageData(new ImageData(a.data, a.width, a.height), pad, pad); g.putImageData(new ImageData(r.data, r.width, r.height), pad, pad + a.height)
  return c
}
const keBlob = (c) => new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85))
/** "14/11/2026 05:50:13" → "2026-11-14" */
const tglIso = (t) => { const m = String(t || '').match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '' }

const LABEL = {
  cocok: ['Cocok', 'bg-emerald-50 text-emerald-700 ring-emerald-200', Check],
  pilih: ['Perlu dipilih manual', 'bg-amber-50 text-amber-800 ring-amber-200', AlertTriangle],
  tidak: ['Tidak cocok', 'bg-slate-100 text-slate-600 ring-slate-200', CircleSlash],
  gagal: ['Gagal / pending — tidak diupload', 'bg-rose-50 text-rose-700 ring-rose-200', X],
  sendiri: ['Rekening sendiri — dilewati', 'bg-slate-100 text-slate-600 ring-slate-200', ArrowLeftRight],
}

export default function BuktiMassal({ open, onClose }) {
  const { user, data, save, notify, branchFilter, refreshTables } = useApp()
  const [tahap, setTahap] = useState('pilih') // pilih → baca → preview → simpan → hasil
  const [progres, setProgres] = useState({ teks: '', n: 0 })
  const [baris, setBaris] = useState([]) // { id, file, im, hd, b, h (hasil cocok), req, ikut, url }
  const [asli, setAsli] = useState([])
  const [hasil, setHasil] = useState([])
  const [salah, setSalah] = useState('')
  const inputRef = useRef(null)
  const sudahArsip = useRef(false)
  const [setel, setSetel] = useState(null) // { model, otomatis } dari Pengaturan → AI
  const [mesin, setMesin] = useState([]) // catatan pembaca per file
  useEffect(() => { if (open) aiInfo().then((r) => setSetel(r.ok ? r.fitur?.bukti || {} : {})).catch(() => setSetel({})) }, [open])

  const projectOf = (r) => (data.projects || []).find((p) => p.id === r.project_id)
  const invoiceOf = (r) => projectOf(r)?.invoice_no || ''
  const kandidat = useMemo(() => scopeRequests(user, data.requests || [], branchFilter).filter((r) => r.status === 'disetujui' && !r.bukti_transfer), [data.requests, user, branchFilter])

  useEffect(() => { if (!open) { baris.forEach((x) => x.url && URL.revokeObjectURL(x.url)); setTahap('pilih'); setBaris([]); setAsli([]); setHasil([]); setSalah(''); setMesin([]); sudahArsip.current = false } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const gambarUlang = async (x) => { const blob = await keBlob(rakitBukti(x.im, x.hd, x.b)); if (x.url) URL.revokeObjectURL(x.url); return { ...x, blob, url: URL.createObjectURL(blob) } }

  const proses = async (files) => {
    files = [...files].filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type))
    if (!files.length) return notify('Pilih screenshot PNG/JPG', 'err')
    setTahap('baca'); setSalah(''); setAsli(files)
    let cfg = setel; if (!cfg) { const i = await aiInfo().catch(() => null); cfg = i?.ok ? i.fitur?.bukti || {} : {}; setSetel(cfg) }
    try {
      setProgres({ teks: 'Menyiapkan pembaca gambar (sekali saja, ±7 MB)…', n: 0 }); await ambilWorker()
      const semua = []; const catat = []
      for (const [i, f] of files.entries()) {
        setProgres({ teks: `Membaca ${f.name} (${i + 1}/${files.length})…`, n: 0 })
        const im = await bacaFile(f)
        let r = null
        try {
          // 1) AI membaca seluruh tabel; struktur baris & potongan bukti tetap dari piksel asli. 2) Tesseract membaca ulang kolom nominal.
          if (cfg.model) {
            const st = bacaStruktur(im)
            const ai = await aiJalan('bukti', kanvasKeJpeg(keKanvas(im), 2600, 0.92))
            if (ai.ok && terapkanAi(st, ai.data?.baris)) {
              setProgres({ teks: `Mengecek ulang nominal ${f.name}…`, n: 0 })
              try { await nominalKedua(im, st, ocr, (n) => setProgres((p) => ({ ...p, n }))) } catch { /* pembaca kedua gagal → baris tidak diproses otomatis */ }
              r = st; catat.push(`${f.name}: dibaca AI ${ai.modelLabel || 'Gemini'}, nominal dicek ulang Tesseract`)
            } else if (!ai.demo) catat.push(`${f.name}: AI tidak dipakai (${ai.ok ? 'jumlah baris AI berbeda dengan tabel' : ai.alasan || 'gagal'}) — dibaca Tesseract`)
          }
          if (!r) { r = await bacaScreenshot(im, ocr, (n) => setProgres((p) => ({ ...p, n }))); if (!catat.some((c) => c.startsWith(f.name + ':'))) catat.push(`${f.name}: dibaca Tesseract (di perangkat ini)`) }
        } catch (e) { notify(`${f.name}: ${e.message}`, 'err'); continue }
        for (const [j, b] of r.baris.entries()) semua.push({ id: `${i}-${j}`, sumber: f.name, im, hd: r.header, b })
      }
      if (!semua.length) { setSalah('Tidak ada baris transaksi yang terbaca. Pastikan screenshot berisi tabel daftar transaksi lengkap dengan judul kolomnya.'); setTahap('pilih'); return }
      const cocok = cocokkan(semua.map((x) => x.b), kandidat, invoiceOf)
      const jadi = await Promise.all(semua.map((x, k) => gambarUlang({ ...x, h: cocok[k], req: cocok[k].req || null, ikut: cocok[k].status === 'cocok' })))
      setMesin(catat)
      // Otomatis: cocok dengan tepat satu pengajuan; bila dibaca AI, nominal AI harus sama dengan bacaan Tesseract.
      const pasti = (x) => x.h.status === 'cocok' && x.req && (x.b.mesin !== 'gemini' || (x.b.nominal2 != null && x.b.nominal2 === x.b.nominal))
      jadi.forEach((x) => { if (x.h.status === 'cocok' && !pasti(x)) x.h = { ...x.h, alasan: 'Nominal bacaan AI dan Tesseract berbeda — periksa dulu' } })
      const auto = cfg.otomatis ? jadi.filter(pasti) : []
      if (auto.length) { setBaris(jadi.filter((x) => !auto.includes(x))); await konfirmasi(auto, files, true); return }
      setBaris(jadi); setTahap('preview')
    } catch (e) { setSalah(`Gagal membaca gambar: ${e.message}`); setTahap('pilih') }
  }

  const ubah = (id, patch) => setBaris((bs) => bs.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const geser = async (x, sisi, d) => {
    const b = { ...x.b, [sisi]: Math.max(x.hd.y1, Math.min(x.im.height, x.b[sisi] + d)) }
    if (b.y1 - b.y0 < 8) return
    const baru = await gambarUlang({ ...x, b }); ubah(x.id, { b, blob: baru.blob, url: baru.url })
  }
  const dipakai = (id, kecuali) => baris.some((x) => x.ikut && x.id !== kecuali && x.req?.id === id)
  const terpilih = baris.filter((x) => x.ikut && x.req && !['gagal', 'sendiri'].includes(x.h.status))

  const konfirmasi = async (daftar = terpilih, berkas = asli, otomatis = false) => {
    if (!daftar.length) return
    setTahap('simpan'); const out = []
    try {
      // Data terbaru dari server — cegah upload ganda
      const segar = await db.list('requests').catch(() => data.requests || [])
      // Arsip screenshot asli
      const arsip = []
      for (const f of (otomatis || !sudahArsip.current ? berkas : [])) { try { arsip.push(await drive.upload(f, { branch: 'Pusat', invoice: 'BUKTI-MASSAL' })) } catch { /* arsip gagal tidak menghentikan */ } }
      sudahArsip.current = true
      for (const [k, x] of daftar.entries()) {
        setProgres({ teks: `${otomatis ? 'Memproses otomatis' : 'Menyimpan bukti'} ${k + 1}/${daftar.length}…`, n: k / daftar.length })
        const r = segar.find((q) => q.id === x.req.id) || x.req
        if (r.status !== 'disetujui' || r.bukti_transfer) { out.push({ x, ok: false, pesan: r.status === 'dibayar' ? 'Sudah ditransfer sebelumnya — dilewati' : 'Sudah punya bukti / status berubah — dilewati' }); continue }
        try {
          const nama = `Bukti-${(invoiceOf(r) || r.purpose || 'pengajuan').replace(/[^\w-]+/g, '_').slice(0, 40)}-${x.b.nominal || r.amount}.jpg`
          const file = await drive.upload(new File([x.blob], nama, { type: 'image/jpeg' }), { branch: r.branch, invoice: 'PENGAJUAN' })
          await tandaiDibayar({ r, file, date: tglIso(x.b.tgl), user, save, catatan: otomatis ? 'bukti massal (otomatis)' : 'bukti massal' })
          out.push({ x, r, ok: true })
        } catch (e) { out.push({ x, ok: false, pesan: e.message }) }
      }
      const ok = out.filter((o) => o.ok)
      await db.insert?.('activity_log', {
        table: 'requests', kind: 'keuangan', action: `Upload bukti transfer massal${otomatis ? ' (otomatis)' : ''}: ${ok.length} pengajuan ditandai ditransfer`,
        by: user.name, by_id: user.id, role: user.role, at: new Date().toISOString(),
        detail: { otomatis, arsip, screenshot: berkas.map((f) => f.name), pengajuan: ok.map((o) => ({ id: o.r.id, nominal: o.r.amount, ref: o.x.b.ref || '' })), gagal: out.filter((o) => !o.ok).map((o) => o.pesan) },
      })?.catch?.(() => {})
      refreshTables?.(['requests', 'petty_cash', 'activity_log'])
      if (!otomatis) setBaris((bs) => bs.filter((x) => !daftar.includes(x)))
      setHasil((h) => [...h, ...out.map((o) => ({ ...o, otomatis }))]); setTahap('hasil')
      notify(`${ok.length} bukti transfer tersimpan${otomatis ? ' otomatis' : ''}`)
    } catch (e) { notify(e.message, 'err'); setTahap('preview') }
  }

  const sisa = baris.filter((x) => !['gagal', 'sendiri'].includes(x.h.status))
  const ringkas = { cocok: 0, pilih: 0, tidak: 0, gagal: 0, sendiri: 0 }; baris.forEach((x) => { ringkas[x.h.status]++ })
  const opsiReq = (x) => {
    const sama = kandidat.filter((r) => Number(r.amount) === x.b.nominal)
    const lain = kandidat.filter((r) => Number(r.amount) !== x.b.nominal)
    return [...sama, ...lain]
  }
  const labelReq = (r) => `${REQ_KINDS[r.kind]?.label || 'Pengajuan'} · ${invoiceOf(r) ? invoiceLabel(invoiceOf(r)) + ' · ' : ''}${(r.purpose || '').slice(0, 40)} · ${r.branch} · ${rupiah(r.amount)}${r.sumber_dana ? ` · ${r.sumber_dana}` : ''}`

  const footer = tahap === 'preview' ? (
    <span className="flex w-full flex-wrap items-center gap-2">
      <span className="mr-auto text-xs text-ink-mute"><b className="text-ink">{terpilih.length}</b> bukti akan diupload · total <b className="text-ink">{rupiah(terpilih.reduce((a, x) => a + Number(x.req.amount || 0), 0))}</b></span>
      <Button variant="outline" onClick={() => { setTahap('pilih'); setBaris([]) }}>Ulangi</Button>
      <Button disabled={!terpilih.length} onClick={() => konfirmasi()} data-aksi="konfirmasi-massal"><Upload className="h-4 w-4" />Konfirmasi &amp; Upload</Button>
    </span>
  ) : tahap === 'hasil' ? <span className="flex w-full flex-wrap justify-end gap-2">{sisa.length > 0 && <Button variant="outline" className="max-md:min-h-11" onClick={() => setTahap('preview')} data-aksi="periksa-sisa">Periksa {sisa.length} baris lainnya</Button>}<Button className="max-md:min-h-11" onClick={onClose}>Selesai</Button></span> : null

  return (
    <Sheet open={open} onClose={tahap === 'simpan' ? () => {} : onClose} xwide title="Upload Bukti Transfer Massal" subtitle={`${kandidat.length} pengajuan berstatus Perlu transfer`} footer={footer}>
      <div data-bukti-massal className="space-y-3">
        {tahap === 'pilih' && (
          <>
            <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); proses(e.dataTransfer.files) }}
              className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:border-brand">
              <ImagePlus className="h-8 w-8 text-ink-mute" aria-hidden="true" />
              <span className="text-sm font-bold text-ink">Pilih atau tarik screenshot daftar transaksi</span>
              <span className="text-xs text-ink-mute">PNG / JPG · boleh beberapa file · contoh: KlikBCA Bisnis → Transfer Dana</span>
              <input ref={inputRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { proses(e.target.files); e.target.value = '' }} aria-label="Pilih screenshot bukti transfer" data-input-massal />
            </label>
            {MODE === 'demo' && <p className="text-xs text-ink-mute">Mau mencoba? <a href={new URL('contoh/contoh-klikbca-transfer.png', document.baseURI).href} download="contoh-klikbca-transfer.png" target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline" data-contoh-massal>Unduh contoh screenshot</a> (data karangan), lalu upload di sini.</p>}
            {salah && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{salah}</p>}
            <ul className="space-y-1 text-xs text-ink-mute">
              <li>• Pencocokan wajib: nominal sama persis &amp; sumber dana sama (ATS / PTI / PAL / ATI).</li>
              <li>• Baris Gagal/Pending dan transfer antar rekening sendiri tidak diupload.</li>
              {setel?.otomatis
                ? <li data-info-otomatis>• <b>Mode otomatis aktif:</b> baris yang cocok dengan tepat satu pengajuan langsung ditandai sudah ditransfer. Baris yang ragu tetap menunggu Anda periksa.</li>
                : <li>• Tidak ada yang berubah sebelum Anda menekan <b>Konfirmasi &amp; Upload</b>.</li>}
            </ul>
          </>
        )}

        {(tahap === 'baca' || tahap === 'simpan') && (
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-3" aria-live="polite">
            <Loader2 className="h-7 w-7 animate-spin text-brand" aria-hidden="true" />
            <p className="text-sm font-semibold text-ink">{progres.teks}</p>
            <div className="h-1.5 w-64 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand transition-all" style={{ width: `${Math.round(progres.n * 100)}%` }} /></div>
          </div>
        )}

        {['preview', 'hasil'].includes(tahap) && mesin.length > 0 && <ul className="space-y-0.5 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-ink-mute" data-mesin-massal>{mesin.map((m, i) => <li key={i} className="flex gap-1.5"><Sparkles className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{m}</li>)}</ul>}
        {tahap === 'preview' && (
          <>
            <p className="flex flex-wrap gap-1.5 text-xs" data-ringkas-massal>
              {Object.entries(ringkas).filter(([, n]) => n).map(([k, n]) => { const [l, c] = LABEL[k]; return <span key={k} className={cx('rounded-full px-2 py-0.5 font-semibold ring-1', c)}>{l} · {n}</span> })}
            </p>
            <ul className="space-y-2.5">
              {baris.map((x) => {
                const [lbl, cls, Ik] = LABEL[x.h.status]; const kunci = ['gagal', 'sendiri'].includes(x.h.status)
                const beda = x.req && Number(x.req.amount) !== x.b.nominal
                return (
                  <li key={x.id} data-baris-massal={x.h.status} className={cx('grid gap-3 rounded-2xl p-3 ring-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]', x.ikut && !kunci ? 'bg-white ring-brand/40' : 'bg-slate-50 ring-slate-200', kunci && 'opacity-70')}>
                    <div className="min-w-0">
                      <a href={x.url} target="_blank" rel="noreferrer" title="Lihat ukuran penuh"><img src={x.url} alt={`Potongan bukti ${rupiah(x.b.nominal || 0)}`} className="w-full rounded-lg ring-1 ring-slate-200" /></a>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-ink-mute">
                        <span className="mr-1">Rapikan potongan:</span>
                        {[['y0', -4, ChevronUp, 'Atas naik'], ['y0', 4, ChevronDown, 'Atas turun'], ['y1', -4, ChevronUp, 'Bawah naik'], ['y1', 4, ChevronDown, 'Bawah turun']].map(([s, d, I, l]) => (
                          <button key={l} type="button" onClick={() => geser(x, s, d)} aria-label={l} title={l} className="inline-flex h-11 items-center gap-0.5 rounded-lg px-2 ring-1 ring-slate-200 hover:ring-brand sm:h-7"><I className="h-3.5 w-3.5" />{s === 'y0' ? 'Atas' : 'Bawah'}</button>
                        ))}
                        <span className="ml-auto hidden truncate sm:inline">{x.sumber}</span>
                      </div>
                    </div>
                    <div className="min-w-0 space-y-2 text-[13px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="text-base tabular-nums text-ink">{x.b.nominal ? rupiah(x.b.nominal) : 'Nominal tak terbaca'}</b>
                        <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', cls)}><Ik className="h-3 w-3" aria-hidden="true" />{lbl}</span>
                        {x.h.yakin && <span className="text-[11px] text-ink-mute">keyakinan {x.h.yakin}%</span>}
                      </div>
                      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
                        <dt className="text-ink-mute">Penerima</dt><dd className="truncate text-ink">{[x.b.rek, x.b.nama].filter(Boolean).join(' · ') || x.b.ke || '—'}</dd>
                        <dt className="text-ink-mute">Sumber dana</dt><dd className="text-ink">{x.b.dana || <span className="text-amber-700">tidak dikenali</span>}</dd>
                        <dt className="text-ink-mute">Tanggal</dt><dd className="text-ink">{x.b.tgl || '—'}</dd>
                        <dt className="text-ink-mute">Status bank</dt><dd className="text-ink">{x.b.status || '—'}</dd>
                        {x.b.ref && <><dt className="text-ink-mute">No. referensi</dt><dd className="truncate text-ink">{x.b.ref}</dd></>}
                      </dl>
                      {x.h.alasan && <p className="text-xs text-amber-800">{x.h.alasan}</p>}
                      {!kunci && (
                        <>
                          <label className="block text-xs font-semibold text-ink-soft">Pengajuan pasangan
                            <select value={x.req?.id || ''} data-pilih-pasangan onChange={(e) => { const r = kandidat.find((q) => q.id === e.target.value) || null; ubah(x.id, { req: r, ikut: !!r }) }}
                              className="mt-1 h-11 w-full rounded-lg border-slate-300 text-[13px] sm:h-9">
                              <option value="">— pilih pengajuan —</option>
                              {opsiReq(x).map((r) => <option key={r.id} value={r.id} disabled={dipakai(r.id, x.id)}>{labelReq(r)}{dipakai(r.id, x.id) ? ' (sudah dipakai)' : ''}</option>)}
                            </select>
                          </label>
                          {beda && <p className="text-xs font-semibold text-rose-700">Nominal pengajuan ({rupiah(x.req.amount)}) berbeda dengan bukti — periksa lagi.</p>}
                          <label className="flex min-h-[44px] items-center gap-2 text-xs font-semibold text-ink sm:min-h-0">
                            <input type="checkbox" checked={!!x.ikut} disabled={!x.req} onChange={(e) => ubah(x.id, { ikut: e.target.checked })} data-ikut-massal />
                            {x.req ? 'Upload bukti ini' : 'Lewati (belum ada pasangan)'}
                          </label>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {tahap === 'hasil' && (
          <ul className="space-y-1.5" data-hasil-massal>
            {hasil.map((o, i) => (
              <li key={i} className={cx('flex items-center gap-2 rounded-xl px-3 py-2 text-sm', o.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700')}>
                {o.ok ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{rupiah(o.x.b.nominal || o.x.req?.amount || 0)} · {o.x.req ? labelReq(o.x.req) : ''}</span>
                <span className="shrink-0 text-xs">{o.ok ? (o.otomatis ? 'Otomatis · Sudah Dibayar' : 'Sudah Dibayar') : o.pesan}</span>
              </li>
            ))}
            {sisa.length > 0 && <li className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800" data-sisa-massal>{sisa.length} baris belum diproses karena perlu diperiksa (tidak cocok pasti). Tekan “Periksa {sisa.length} baris lainnya”.</li>}
            <li className="pt-1 text-xs text-ink-mute">Screenshot asli diarsipkan dan tercatat di Log Aktivitas.</li>
          </ul>
        )}
      </div>
    </Sheet>
  )
}
