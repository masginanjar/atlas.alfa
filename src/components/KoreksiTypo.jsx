import { useEffect, useRef, useState } from 'react'
import { Loader2, SpellCheck, CheckCircle2, AlertTriangle, RotateCcw, Download } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { drive } from '../lib/integrations.js'
import { saveBlob } from '../lib/download.js'
import { typoAktif, jenisTypo, periksaTypo, terapkanDocx, catatDipakai, namaKoreksi } from '../lib/typo.js'
import { cx } from './ui.jsx'

// ============================================================
//  KOREKSI TYPO OTOMATIS — panel di bawah satu file hasil terjemahan.
//  • Tampil hanya untuk akun yang toggle-nya ON (diatur admin). Akun OFF: komponen ini tidak merender apa pun & tidak memanggil server.
//  • File asli sudah tersimpan lebih dulu. Pemeriksaan berjalan di latar; hasil koreksi disimpan sebagai VERSI BARU —
//    file asli tetap bisa diunduh. Tidak ada yang dikirim ke klien dari sini.
//  Props: file (objek file project), blob (File yang baru diunggah, opsional), otomatis (mulai sendiri),
//         onGanti(fileBaru: File, { cek_id, n }) → induk mengunggah & mengganti entri · onTanda(typo) → induk menyimpan penanda.
// ============================================================
export default function KoreksiTypo({ project, sub, file, blob, otomatis, onGanti, onTanda }) {
  const { user, notify } = useApp()
  const [tahap, setTahap] = useState('diam') // diam | periksa | temuan | bersih | gagal | simpan
  const [hasil, setHasil] = useState(null)
  const [pilih, setPilih] = useState(() => new Set())
  const [galat, setGalat] = useState('')
  const sumber = useRef(null)
  const jalan = useRef(false)
  const jenis = jenisTypo(file?.name)
  const aktif = typoAktif(user) && !!jenis
  const tanda = file?.typo

  const ambil = async () => (sumber.current ||= blob || await drive.blob(file))
  const mulai = async () => {
    if (jalan.current) return; jalan.current = true
    setTahap('periksa'); setGalat('')
    try {
      const r = await periksaTypo({ user, project, sub, blob: await ambil(), nama: file.name })
      if (!r.ok) { if (r.mati) { setTahap('diam'); return } setGalat(r.alasan || 'Pemeriksaan gagal'); setTahap(r.kosong ? 'lewat' : 'gagal'); return }
      setHasil(r)
      if (!r.temuan.length) { setTahap('bersih'); onTanda?.({ status: 'bersih', cek_id: r.cek_id }); return }
      setPilih(new Set(r.temuan.filter((x) => x.yakin).map((x) => x.id))); setTahap('temuan')
    } catch (e) { setGalat(e.message || 'Pemeriksaan gagal'); setTahap('gagal') } finally { jalan.current = false }
  }
  useEffect(() => { if (aktif && otomatis && !tanda && tahap === 'diam') mulai() }, [aktif, otomatis, tanda]) // eslint-disable-line react-hooks/exhaustive-deps

  const unduhAsli = async () => { try { await saveBlob(file.versi_asli.name, await drive.blob(file.versi_asli)) } catch (e) { notify(e.message, 'err') } }
  // Versi hasil koreksi: tampil untuk SIAPA PUN yang membuka (bukan hanya akun ON) supaya file asli selalu bisa diambil.
  if (tanda?.status === 'dipakai' && tahap === 'diam') return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2 text-[11px] text-emerald-800" data-typo="dipakai">
      <span className="inline-flex items-center gap-1"><SpellCheck className="h-3.5 w-3.5" />Versi koreksi typo · {tanda.n} kata</span>
      {file.versi_asli && <button type="button" onClick={unduhAsli} className="inline-flex items-center gap-1 font-semibold underline max-md:min-h-11" data-aksi="unduh-asli"><Download className="h-3.5 w-3.5" />Unduh file asli</button>}
    </div>
  )
  if (!aktif) return null
  if (tahap === 'diam') {
    if (tanda?.status === 'bersih') return <p className="px-3 pb-2 text-[11px] text-emerald-800" data-typo="bersih">Tidak ditemukan typo</p>
    return (
      <div className="px-3 pb-2" data-typo="diam">
        <button type="button" onClick={mulai} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand-soft max-md:min-h-11" data-aksi="periksa-typo"><SpellCheck className="h-3.5 w-3.5" />{tanda?.status === 'ditinjau' ? 'Lihat lagi saran typo' : 'Periksa typo'}</button>
      </div>
    )
  }
  if (tahap === 'periksa') return <p className="flex items-center gap-2 px-3 pb-2 text-xs font-semibold text-brand" role="status" data-typo="periksa"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Memeriksa typo…</p>
  if (tahap === 'bersih') return <p className="flex items-center gap-1.5 px-3 pb-2 text-xs font-semibold text-emerald-800" role="status" data-typo="bersih"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Tidak ditemukan typo{hasil?.demo ? ' (demo: contoh, bukan AI)' : ''}</p>
  if (tahap === 'lewat') return <p className="px-3 pb-2 text-[11px] text-ink-mute" data-typo="lewat">{galat}</p>
  if (tahap === 'gagal') return (
    <div className="mx-3 mb-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200" role="alert" data-typo="gagal">
      <p className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>Pemeriksaan typo gagal: {galat}. File asli tetap tersimpan dan bisa dipakai.</span></p>
      <button type="button" onClick={mulai} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-semibold ring-1 ring-amber-300 max-md:min-h-11" data-aksi="coba-lagi-typo"><RotateCcw className="h-3.5 w-3.5" />Coba lagi</button>
    </div>
  )

  // ---- temuan / simpan ----
  const t = hasil.temuan; const n = pilih.size; const sibuk = tahap === 'simpan'; const saran = hasil.jenis !== 'docx'
  const balik = (id) => setPilih((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x })
  const pakai = async () => {
    if (sibuk || !n) return
    setTahap('simpan')
    try {
      const dipilih = t.filter((x) => pilih.has(x.id))
      const r = await terapkanDocx(await ambil(), dipilih)
      await onGanti(new File([r.blob], namaKoreksi(file.name), { type: r.blob.type }), { cek_id: hasil.cek_id, n: r.n })
      catatDipakai(hasil.cek_id, r.n)
      notify(`${r.n} typo dikoreksi — tersimpan sebagai versi baru, file asli tetap ada`)
      setTahap('diam')
    } catch (e) { notify(e.message || 'Gagal menyimpan hasil koreksi', 'err'); setTahap('temuan') }
  }
  const tutup = () => { catatDipakai(hasil.cek_id, 0); onTanda?.({ status: 'ditinjau', cek_id: hasil.cek_id, n: t.length }); setTahap('diam') }
  return (
    <div className="mx-3 mb-2 rounded-xl bg-white text-ink ring-1 ring-brand/30" data-typo="temuan">
      <div className="px-3 pt-3">
        <p className="flex items-center gap-1.5 text-xs font-bold"><SpellCheck className="h-4 w-4 text-brand" aria-hidden="true" />{t.length} kemungkinan typo{hasil.demo ? ' — DEMO: contoh, bukan AI' : ''}</p>
        <p className="mt-0.5 text-[11px] text-ink-mute">{saran ? 'PDF belum bisa diedit dengan aman — ini saran saja. Perbaiki di file kerja Anda lalu unggah ulang.' : 'Hilangkan centang pada kata yang tidak ingin diubah. Tata bahasa, nama, dan angka tidak disentuh.'}{hasil.sebagian ? ' Dokumen panjang: hanya bagian awal yang diperiksa.' : ''}</p>
      </div>
      <ul className="mt-2 divide-y divide-slate-100 border-y border-slate-100">
        {t.map((x) => {
          const on = pilih.has(x.id)
          const isi = (
            <span className="min-w-0 flex-1">
              <span className="block text-sm"><span className="font-semibold text-rose-700 line-through decoration-rose-300">{x.asli}</span><span className="mx-1.5 text-ink-mute" aria-label="menjadi">→</span><span className="font-bold text-emerald-700">{x.koreksi}</span></span>
              <span className="mt-0.5 block break-words text-[12px] leading-snug text-ink-soft">{x.kutip.sebelum}<mark className="rounded bg-amber-100 px-0.5 text-ink">{x.kutip.kata}</mark>{x.kutip.sesudah}</span>
              {x.sebab && <span className="mt-0.5 block text-[11px] font-semibold text-amber-700">Tidak dipilih otomatis: {x.sebab}</span>}
            </span>
          )
          return (
            <li key={x.id} data-typo-baris data-yakin={x.yakin ? '1' : '0'}>
              {saran ? <div className="flex gap-2.5 px-3 py-2.5">{isi}</div> : (
                <label className={cx('flex min-h-11 cursor-pointer items-start gap-2.5 px-3 py-2.5', on ? 'bg-emerald-50/50' : 'bg-white')}>
                  <input type="checkbox" checked={on} disabled={sibuk} onChange={() => balik(x.id)} className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600" aria-label={`Koreksi ${x.asli} menjadi ${x.koreksi}`} />
                  {isi}
                </label>
              )}
            </li>
          )
        })}
      </ul>
      <div className="sticky bottom-0 flex gap-2 rounded-b-xl bg-white/95 p-3 backdrop-blur max-md:flex-col-reverse" data-typo-aksi>
        <button type="button" onClick={tutup} disabled={sibuk} className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold text-ink-soft ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50 md:min-h-9" data-aksi="pakai-asli">{saran ? 'Tutup' : 'Pakai file asli'}</button>
        {!saran && <button type="button" onClick={pakai} disabled={sibuk || !n} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 md:min-h-9" data-aksi="gunakan-koreksi">{sibuk ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Menyimpan versi baru…</> : <>Gunakan hasil koreksi{n ? ` (${n})` : ''}</>}</button>}
      </div>
    </div>
  )
}
