// ============================================================
//  EMAIL OTORISASI — untuk otorisator yang bekerja lewat email.
//  Alur: proofreader lapor ke Admin Pusat → Admin Pusat kirim email (1 invoice = 1 email) berisi
//  dokumen sumber + hasil proofread → otorisator membalas lewat email → Admin Pusat mengunggah
//  hasilnya dan menandai "Sudah diotorisasi" atas nama otorisator itu.
//  • Pengiriman dilakukan SERVER (fungsi `email-otorisasi`, Gmail). Alamat tujuan & mode tes ditentukan server, bukan browser.
//  • DEMO: tidak ada email yang benar-benar dikirim — ditandai jelas sebagai simulasi.
//  • Izin: email-otorisasi.tambah (kirim), email-otorisasi.atur (nyalakan/matikan mode tes).
// ============================================================
import { useMemo, useState, useSyncExternalStore } from 'react'
import { Mail, Loader2, Paperclip, CheckCircle2, FlaskConical, Send, X, Plus, Upload, Pencil } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { invoiceLabel } from '../config/access.js'
import { db, MODE } from '../lib/db.js'
import { SUPABASE_URL } from '../lib/supabase.js'
import { drive } from '../lib/integrations.js'
import { fieldFiles, collect } from './FileManager.jsx'
import { Sheet, cx } from './ui.jsx'

const LIVE = MODE === 'supabase'
const MAKS_BYTE = 18 * 1024 * 1024 // batas lampiran Gmail 25 MB (setelah dikodekan)
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const KODE = { Indonesia: 'IND', Inggris: 'ENG', Belanda: 'NED' }
export const kodeBahasa = (b) => KODE[b] || String(b || '').slice(0, 3).toUpperCase()
const asing = (s) => [s.lang_from, s.lang_to].find((x) => x && x !== 'Indonesia') || s.lang_to || s.lang_from || ''
const wita = (d0 = new Date()) => { const d = d0 instanceof Date && !Number.isNaN(+d0) ? d0 : new Date(); // tanggal tidak valid → pakai sekarang (jangan sampai galat)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value])); return { tgl: `${p.year}-${p.month}-${p.day}`, jam: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` } }
export const salamWaktu = (jam) => { const h = Number(String(jam).slice(0, 2)); return h < 11 ? 'Pagi' : h < 15 ? 'Siang' : h < 19 ? 'Sore' : 'Malam' }
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`)

/** Sub project yang sedang menunggu otorisasi. */
export const subSiapOto = (p) => (p?.sub_projects || []).filter((s) => s.stage === 'otorisasi' && !s.cancelled)
/** Lampiran: dokumen sumber + hasil proofread tiap sub project (tanpa yang di sampah). */
export function lampiranOto(subs) {
  const out = []; const lihat = new Set()
  for (const s of subs) for (const [k, jenis] of [['dokumen_sumber', 'Sumber'], ['hasil_proofread', 'Hasil proofread']]) for (const f of fieldFiles(s.data, k)) {
    if (!f || f.trashed_at) continue; const id = f.drive_id || `${f.name}:${f.size}`; if (lihat.has(id)) continue; lihat.add(id); out.push({ ...f, _id: id, _jenis: jenis })
  }
  return out
}
/** Judul email: "Otorisasi BELANDA Kamis 12 November 2026, PK. 16.00 WITA". */
export function judulEmailOto(subs, tgl, jam) {
  const b = [...new Set(subs.map(asing).filter(Boolean))].join(' & ').toUpperCase()
  const d = tgl ? new Date(`${tgl}T12:00:00+08:00`) : null
  const kapan = d && !Number.isNaN(+d) ? ` ${HARI[new Date(`${tgl}T12:00:00Z`).getUTCDay()]} ${tgl.slice(8, 10)} ${BULAN[Number(tgl.slice(5, 7)) - 1]} ${tgl.slice(0, 4)}` : ''
  return `Otorisasi ${b || 'DOKUMEN'}${kapan}${jam ? `, PK. ${jam.replace(':', '.')} WITA` : ''}`.replace(/\s+/g, ' ')
}
/** Isi email mengikuti format yang biasa dipakai tim. */
export function isiEmailOto(p, subs, sapaan, jamKini) {
  const b = [...new Set(subs.map(asing).filter(Boolean))].join(' & ')
  const baris = subs.map((s, i) => `${i + 1}. ${invoiceLabel(p.invoice_no)} ${[kodeBahasa(s.lang_from), kodeBahasa(s.lang_to)].filter(Boolean).join('-')} ${p.customer?.name || ''}`.trim())
  return `Selamat ${salamWaktu(jamKini)} ${sapaan}, berikut kami kirimkan dokumen ${b || 'terjemahan'} yang perlu diotorisasi:\n\n${baris.join('\n')}\n\nTerima kasih ${sapaan}😊🙏`
}
const keB64 = (blob) => new Promise((ok, gagal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => gagal(new Error('gagal membaca file')); r.readAsDataURL(blob) })
async function panggil(aksi, body = {}) {
  try {
    const token = await db.token?.()
    if (!token) return { ok: false, alasan: 'Sesi berakhir — silakan masuk ulang' }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/email-otorisasi`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ aksi, ...body }) })
    return await r.json().catch(() => ({ ok: false, alasan: `Server ${r.status}` }))
  } catch { return { ok: false, alasan: 'Koneksi ke server gagal — periksa internet' } }
}

// ---- Pengiriman di latar ----
// Popup langsung ditutup saat "Kirim" ditekan; email dikirim di belakang layar. Status per project disimpan di sini (di luar komponen)
// supaya tetap jalan walau pengguna pindah halaman. Yang ditampilkan saat itu "Sedang dikirim", BUKAN "terkirim" —
// "Terkirim" baru muncul setelah server mengonfirmasi; bila gagal ditandai jelas dan bisa dikirim ulang.
const proses = new Map(); const pendengar = new Set()
const setProses = (id, v) => { if (v) proses.set(id, v); else proses.delete(id); pendengar.forEach((f) => f()) }
const langganan = (f) => { pendengar.add(f); return () => pendengar.delete(f) }
if (typeof window !== 'undefined') window.addEventListener('beforeunload', (e) => { if ([...proses.values()].some((v) => v.status === 'kirim')) { e.preventDefault(); e.returnValue = '' } }) // jangan tutup tab saat email masih dikirim

export default function EmailOtorisasi({ project, className }) {
  const { user, data, save, notify, ask } = useApp()
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState(null) // { penerima:[{id,nama,sapaan}], mode_tes, tes_ke, siap, alasan? }
  const [oto, setOto] = useState('')
  const [tgl, setTgl] = useState(''); const [jam, setJam] = useState('16:00')
  const [isi, setIsi] = useState(''); const [isiManual, setIsiManual] = useState(false)
  const [judulTulis, setJudulTulis] = useState(''); const [judulManual, setJudulManual] = useState(false)
  const [tambahan, setTambahan] = useState([]) // lampiran yang ditambahkan sendiri: file project lain / unggahan dari perangkat (hanya untuk email ini)
  const [pilihFile, setPilihFile] = useState(false)
  const [pilih, setPilih] = useState(new Set())
  const [sibuk, setSibuk] = useState('')
  const [terkirim, setTerkirim] = useState(null) // { teks, ket } → layar "Email terkirim" di dalam popup
  const [galat, setGalat] = useState('') // pesan gagal ditampilkan DI DALAM layar ini (toast bisa tertutup Layar Kerja)
  const subs = useMemo(() => subSiapOto(project), [project])
  const bawaan = useMemo(() => lampiranOto(subs), [subs])
  const berkas = useMemo(() => [...bawaan, ...tambahan], [bawaan, tambahan])
  // file project lain yang belum ada di daftar lampiran (bisa ditambahkan)
  const lainnya = useMemo(() => { const ada = new Set(berkas.map((f) => f._id)); return open ? collect(project, { user }).map((f) => ({ ...f, _id: f.drive_id || `${f.name}:${f.size}`, _jenis: 'File project' })).filter((f) => !ada.has(f._id)) : [] }, [open, project, user, berkas])
  const riwayat = project?.email_oto || []
  const latar = useSyncExternalStore(langganan, () => proses.get(project?.id))
  if (!boleh(user, 'email-otorisasi.tambah') || (!subs.length && !riwayat.length)) return null

  const penerima = info?.penerima || []
  const sapaan = penerima.find((x) => x.id === oto)?.sapaan || 'Bapak/Ibu'
  const judulOtomatis = judulEmailOto(subs, tgl, jam)
  const judul = (judulManual ? judulTulis : judulOtomatis).replace(/[\r\n]+/g, ' ')
  const isiOtomatis = isiEmailOto(project, subs, sapaan, wita().jam)
  const isiPakai = isiManual ? isi : isiOtomatis
  const terpilih = berkas.filter((f) => pilih.has(f._id)); const total = terpilih.reduce((a, f) => a + (f.size || 0), 0)

  const buka = async () => {
    setOpen(true); setGalat(''); setTerkirim(null); setIsiManual(false); setJudulManual(false); setTambahan([]); setPilihFile(false); setPilih(new Set(bawaan.map((f) => f._id))) // layar dibuka dulu — apa pun yang terjadi di bawah, pengguna melihat sesuatu
    try {
      const mentah = project.about?.deadline; const d = mentah ? new Date(mentah) : null; const sah = d && !Number.isNaN(+d)
      const dl = wita(sah ? d : new Date())
      setTgl(dl.tgl); setJam(sah && dl.jam !== '00:00' ? dl.jam : '16:00')
    } catch { setTgl(''); setJam('16:00') }
    let r
    if (LIVE) r = await panggil('info').catch(() => ({ ok: false, alasan: 'Gagal memuat setelan email' }))
    else { const ar = (data.users || []).filter((u) => u.role === 'otorisator' && /arifin/i.test(u.name)); r = { ok: true, penerima: ar.map((u) => ({ id: u.id, nama: u.name, sapaan: 'Pak Arifin' })), mode_tes: true, tes_ke: 'alamat tes (demo)', siap: false } }
    setInfo(r.ok ? r : { penerima: [], alasan: r.alasan || 'Gagal memuat setelan email' }); setOto((v) => v || r.penerima?.[0]?.id || '')
  }
  const aturTes = async (nyala) => {
    if (!LIVE) { setInfo((v) => ({ ...v, mode_tes: nyala })); return }
    if (!nyala && !(await ask('Matikan mode tes? Setelah ini email dikirim LANGSUNG ke otorisator, bukan ke alamat tes.'))) return
    setSibuk('tes'); const r = await panggil('atur', { mode_tes: nyala }); setSibuk('')
    if (r.ok) { setInfo((v) => ({ ...v, mode_tes: r.mode_tes })); notify(r.mode_tes ? 'Mode tes dinyalakan' : 'Mode tes dimatikan — email ke otorisator') } else notify(r.alasan || 'Gagal mengubah mode tes', 'err')
  }
  const kirim = async () => {
    if (sibuk) return
    const salah = (m) => { setGalat(m); notify(m, 'err') }
    setGalat('')
    if (!oto) return salah('Pilih otorisator tujuan')
    if (judul.trim().length < 5) return salah('Judul email masih kosong')
    if (isiPakai.trim().length < 10) return salah('Isi email masih kosong')
    if (!terpilih.length) return salah(berkas.length ? 'Pilih minimal satu lampiran' : 'Invoice ini belum punya file dokumen sumber / hasil proofread — email tidak bisa dikirim')
    if (total > MAKS_BYTE) return salah(`Lampiran ${kb(total)} — melebihi batas 18 MB. Kurangi lampiran.`)
    const tes = !!info?.mode_tes
    if (!tes && riwayat.some((x) => !x.tes && !x.simulasi) && !(await ask('Invoice ini sudah pernah dikirim ke otorisator. Kirim email lagi?'))) return
    // Tutup popup sekarang; kirim di latar.
    const tugas = { id: project.id, inv: invoiceLabel(project.invoice_no), oto, subjek: judul, isi: isiPakai, berkas: terpilih, tes, oto_nama: penerima.find((x) => x.id === oto)?.nama || '', sub_ids: subs.map((s) => s.id), lama: riwayat }
    setOpen(false); setProses(tugas.id, { status: 'kirim', n: terpilih.length })
    notify(`Email ${tugas.inv} sedang dikirim di latar — silakan lanjut bekerja`)
    ;(async () => {
      try {
        const lampiran = []
        for (const f of tugas.berkas) { const blob = f._blob || await drive.blob(f); lampiran.push({ nama: f.name, mime: blob.type || 'application/octet-stream', b64: await keB64(blob) }) }
        let r = { ok: true, simulasi: true }
        if (LIVE) r = await panggil('kirim', { project_id: tugas.id, oto_id: tugas.oto, subjek: tugas.subjek, isi: tugas.isi, lampiran })
        else await new Promise((ok) => setTimeout(ok, 1500))
        if (!r.ok) throw new Error(r.alasan || 'Email gagal dikirim')
        const catat = { at: new Date().toISOString(), by: user.id, by_name: user.name, oto_id: tugas.oto, oto_nama: tugas.oto_nama, tes: LIVE ? !!r.tes : tugas.tes, simulasi: !LIVE, subjek: tugas.subjek, isi: String(tugas.isi || '').slice(0, 2000), berkas: tugas.berkas.map((f) => f.name), sub_ids: tugas.sub_ids }
        try { await save('projects', { id: tugas.id, email_oto: [...tugas.lama, catat].slice(-30) }) } catch { notify(`Email ${tugas.inv} terkirim, tetapi catatannya gagal disimpan di project`, 'err') }
        setProses(tugas.id, null)
        notify(!LIVE ? `Demo: simulasi kirim ${tugas.inv} selesai (tidak ada email sungguhan)` : r.tes ? `Email TES ${tugas.inv} terkirim ke alamat tes` : `Email ${tugas.inv} terkirim ke ${tugas.oto_nama || 'otorisator'}`)
      } catch (e) {
        setProses(tugas.id, { status: 'gagal', alasan: e.message || 'Email gagal dikirim' })
        notify(`Email ${tugas.inv} GAGAL terkirim: ${e.message || 'coba lagi'}`, 'err')
      }
    })()
  }
  const tambahFile = (f) => { setTambahan((v) => [...v, f]); setPilih((v) => new Set(v).add(f._id)) }
  const unggah = (files) => { for (const x of files) { const id = `lokal:${x.name}:${x.size}:${x.lastModified}`; if (!berkas.some((f) => f._id === id)) tambahFile({ _id: id, name: x.name, size: x.size, _jenis: 'Dari perangkat', _blob: x }) } }
  const akhir = riwayat[riwayat.length - 1]
  const baris = 'flex items-center gap-3 border-b border-slate-100 py-1'
  const lbl = 'w-[76px] shrink-0 text-[13px] text-ink-mute'
  const tulis = 'rounded-lg border-0 bg-transparent px-2 py-1.5 text-sm text-ink ring-1 ring-transparent hover:ring-slate-200 focus:bg-white focus:ring-2 focus:ring-[#0B57D0] max-md:text-base'
  const tbl = 'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-[#0B57D0] ring-1 ring-slate-300 hover:bg-[#EEF3FE] max-md:min-h-11'

  return (
    <section className={cx('flex flex-wrap items-center gap-2', className || 'rounded-xl bg-white p-3 ring-1 ring-slate-200')} onClick={(e) => e.stopPropagation()} data-email-oto>
      <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
        <strong className="flex items-center gap-1.5 text-[13px] text-ink"><Mail className="h-4 w-4 text-brand" aria-hidden="true" />Email otorisasi</strong>
        {latar?.status === 'kirim' && <span className="flex items-center gap-1.5 text-xs font-semibold text-[#0B57D0]" role="status" data-email-oto-latar="kirim"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Sedang mengirim email ({latar.n} lampiran)… boleh lanjut bekerja, jangan tutup tab ATLAS.</span>}
        {latar?.status === 'gagal' && <span className="text-xs font-semibold text-rose-700" role="alert" data-email-oto-latar="gagal">Email GAGAL terkirim: {latar.alasan}</span>}
        <span className={cx('text-xs text-ink-mute', latar && 'hidden')} data-email-oto-status>{akhir
          ? <>{akhir.simulasi ? 'Simulasi demo' : akhir.tes ? 'Email TES terkirim' : 'Terkirim'} {new Date(akhir.at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} · oleh {akhir.by_name}{akhir.oto_nama ? ` · untuk ${akhir.oto_nama}` : ''} · {akhir.berkas?.length || 0} lampiran</>
          : 'Untuk otorisator yang bekerja lewat email: kirim dokumen sumber + hasil proofread, 1 invoice 1 email.'}</span>
      </span>
      {subs.length > 0 && <button type="button" onClick={() => { if (latar?.status === 'gagal') setProses(project.id, null); buka() }} disabled={latar?.status === 'kirim'} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50 max-md:min-h-11" data-aksi="buka-email-oto"><Mail className="h-4 w-4" aria-hidden="true" />{latar?.status === 'gagal' ? 'Coba kirim lagi' : akhir ? 'Kirim lagi' : 'Kirim email ke otorisator'}</button>}

      <Sheet open={open} onClose={() => !sibuk && setOpen(false)} title={terkirim ? terkirim.teks : 'Pesan baru'} subtitle={`Email otorisasi · ${invoiceLabel(project.invoice_no)} · 1 invoice 1 email`} wide atas
        footer={terkirim ? <button type="button" onClick={() => setOpen(false)} className="ml-auto min-h-10 rounded-full bg-[#0B57D0] px-6 text-sm font-semibold text-white max-md:min-h-11" data-aksi="tutup-email-oto">Selesai</button> : <div className="flex w-full flex-wrap items-center gap-2">
          <button type="button" onClick={kirim} disabled={!!sibuk || !info || !penerima.length} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#0B57D0] px-6 text-sm font-semibold text-white hover:bg-[#0842a0] disabled:opacity-50 max-md:min-h-11" data-aksi="kirim-email-oto">{sibuk === 'kirim' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sibuk === 'kirim' ? 'Mengirim…' : !LIVE ? 'Kirim (simulasi)' : info?.mode_tes ? 'Kirim TES' : 'Kirim'}</button>
          <span className={cx('text-xs', total > MAKS_BYTE ? 'font-semibold text-rose-700' : 'text-ink-mute')}><Paperclip className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{terpilih.length} lampiran · {kb(total)}</span>
          <button type="button" onClick={() => setOpen(false)} disabled={!!sibuk} className="ml-auto min-h-10 rounded-full px-4 text-sm font-semibold text-ink-soft hover:bg-slate-100 max-md:min-h-11">Batal</button>
        </div>}>
        {terkirim ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center" role="status" data-email-terkirim>
            <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-8 w-8" aria-hidden="true" /></span>
            <strong className="text-base text-ink">{terkirim.teks}</strong>
            <span className="max-w-sm text-[13px] text-ink-soft">{terkirim.ket}</span>
            <span className="mt-1 max-w-full break-words rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-soft ring-1 ring-slate-200">{terkirim.judul} · {terkirim.n} lampiran</span>
          </div>
        ) : (
        <div className="flex flex-col" data-form-email-oto>
          {!info && <p className="flex items-center gap-2 pb-2 text-sm text-ink-mute"><Loader2 className="h-4 w-4 animate-spin" />Memuat setelan email…</p>}
          {info?.alasan && <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-800" role="alert">{info.alasan}</p>}
          {!LIVE && <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-900" data-info-demo>Demo: tombol Kirim hanya SIMULASI — tidak ada email yang dikirim. Pengiriman sungguhan hanya di aplikasi live.</p>}
          {LIVE && info && !info.alasan && info.siap === false && <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-900" role="alert">Email belum disetel di server (kata sandi aplikasi Gmail belum dipasang) — pengiriman akan ditolak.</p>}
          {info && !info.alasan && (
            <div className={cx('mb-2 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[12.5px]', info.mode_tes ? 'bg-sky-50 text-sky-900' : 'bg-emerald-50 text-emerald-900')} data-mode-tes={info.mode_tes ? 'ya' : 'tidak'}>
              <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 font-semibold">{info.mode_tes ? `Mode tes NYALA — email hanya dikirim ke ${info.tes_ke || 'alamat tes'}, bukan ke otorisator.` : 'Mode tes mati — email dikirim langsung ke otorisator.'}</span>
              {boleh(user, 'email-otorisasi.atur') && <button type="button" onClick={() => aturTes(!info.mode_tes)} disabled={!!sibuk} className="min-h-9 rounded-lg bg-white px-2.5 text-xs font-semibold ring-1 ring-slate-300 max-md:min-h-11" data-aksi="atur-tes">{info.mode_tes ? 'Matikan mode tes' : 'Nyalakan mode tes'}</button>}
            </div>
          )}
          {/* Susunan seperti jendela tulis email: Dari · Kepada · Judul · isi · lampiran */}
          <div className={baris}><span className={lbl}>Dari</span><span className="min-w-0 flex-1 truncate text-sm text-ink">Otorisasi 247 <span className="text-ink-mute">· Gmail kantor</span></span></div>
          <label className={baris}><span className={lbl}>Kepada</span>
            <select value={oto} onChange={(e) => setOto(e.target.value)} className="min-h-9 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm font-semibold text-ink focus:ring-0 max-md:min-h-11 max-md:text-base" data-isi="oto">
              {!penerima.length && <option value="">— belum ada otorisator dengan email terdaftar —</option>}
              {penerima.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
            </select></label>
          <div className={cx(baris, 'flex-wrap')}><span className={lbl}>Dibutuhkan</span>
            <input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} aria-label="Dibutuhkan tanggal" className="min-h-9 min-w-0 border-0 bg-transparent px-0 text-sm text-ink focus:ring-0 max-md:h-11 max-md:text-base" data-isi="tgl" />
            <input type="time" value={jam} onChange={(e) => setJam(e.target.value)} aria-label="Pukul (WITA)" className="min-h-9 min-w-0 border-0 bg-transparent px-0 text-sm text-ink focus:ring-0 max-md:h-11 max-md:text-base" data-isi="jam" /><span className="text-xs text-ink-mute">WITA</span></div>
          <label className={baris}><span className={lbl}>Judul</span>
            {info?.mode_tes && LIVE && <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-bold text-sky-900" title="Awalan ini ditambahkan otomatis selama mode tes">[TES]</span>}
            <input type="text" value={judul} onChange={(e) => { setJudulTulis(e.target.value); setJudulManual(true) }} maxLength={190} aria-label="Judul email" className={cx(tulis, 'min-h-9 min-w-0 flex-1 font-semibold max-md:min-h-11')} data-judul-email data-isi="judul" />
            <Pencil className="h-3.5 w-3.5 shrink-0 text-ink-mute" aria-hidden="true" /></label>
          {judulManual && <button type="button" onClick={() => setJudulManual(false)} className="self-start py-1 text-xs font-semibold text-[#0B57D0] underline max-md:min-h-11">Kembalikan judul bawaan</button>}
          <textarea value={isiPakai} onChange={(e) => { setIsi(e.target.value); setIsiManual(true) }} rows={8} aria-label="Isi email" className={cx(tulis, 'mt-2 block w-full resize-y leading-relaxed')} data-isi="isi" />
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-mute"><Pencil className="h-3 w-3" aria-hidden="true" />Judul dan isi bisa diubah langsung sebelum dikirim.</span>
          {isiManual && <button type="button" onClick={() => setIsiManual(false)} className="self-start text-xs font-semibold text-[#0B57D0] underline max-md:min-h-11">Kembalikan ke teks bawaan</button>}
          <div className="mt-2 flex flex-col gap-1.5 border-t border-slate-100 pt-3" data-daftar-lampiran>
            {!berkas.length && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-800">Belum ada dokumen sumber / hasil proofread pada invoice ini.</p>}
            {berkas.map((f) => { const on = pilih.has(f._id); const ganti = () => setPilih((v) => { const n = new Set(v); n.has(f._id) ? n.delete(f._id) : n.add(f._id); return n }); return (
              <div key={f._id} className={cx('flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm', on ? 'bg-[#F1F3F4] text-ink' : 'bg-white text-ink-mute line-through ring-1 ring-dashed ring-slate-200')} data-lampiran={on ? 'ya' : 'tidak'}>
                <Paperclip className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words font-semibold">{f.name} <span className="font-normal text-ink-mute no-underline">({kb(f.size)})</span></span>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-soft ring-1 ring-slate-200">{f._jenis}</span>
                <button type="button" onClick={ganti} aria-label={on ? `Lepas lampiran ${f.name}` : `Lampirkan lagi ${f.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-slate-200 max-md:h-11 max-md:w-11">{on ? <X className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}</button>
              </div>) })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2" data-tambah-lampiran>
            <button type="button" onClick={() => setPilihFile((v) => !v)} className={tbl} aria-expanded={pilihFile} data-aksi="tambah-file-project"><Plus className="h-4 w-4" aria-hidden="true" />Tambah dari file project{lainnya.length ? ` (${lainnya.length})` : ''}</button>
            <label className={cx(tbl, 'cursor-pointer')} data-aksi="unggah-lampiran"><Upload className="h-4 w-4" aria-hidden="true" />Unggah dari perangkat
              <input type="file" multiple className="sr-only" onChange={(e) => { const fl = [...e.target.files]; e.target.value = ''; if (fl.length) unggah(fl) }} aria-label="Unggah lampiran dari perangkat" /></label>
          </div>
          {pilihFile && (
            <div className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200" data-daftar-file-project>
              {!lainnya.length && <p className="px-2 py-2 text-[13px] text-ink-mute">Tidak ada file project lain yang bisa ditambahkan.</p>}
              {lainnya.map((f) => (
                <button key={f._id} type="button" onClick={() => tambahFile(f)} className="flex min-h-11 items-center gap-2.5 rounded-lg bg-white px-3 py-1.5 text-left text-sm ring-1 ring-slate-200 hover:bg-[#EEF3FE]" data-file-project>
                  <Plus className="h-4 w-4 shrink-0 text-[#0B57D0]" aria-hidden="true" />
                  <span className="min-w-0 flex-1 break-words">{f.name} <span className="text-ink-mute">({kb(f.size)})</span></span>
                  {f.source && <span className="shrink-0 text-[11px] text-ink-mute">{f.source}</span>}
                </button>))}
            </div>
          )}
          <span className="mt-1 text-[11px] text-ink-mute">File yang diunggah dari perangkat hanya ikut di email ini — tidak tersimpan ke project.</span>
          {galat && <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-800" role="alert" data-galat-email>{galat}</p>}
          <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-ink-mute"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Setelah otorisator membalas email, unggah hasilnya di tahap Otorisasi dan pilih namanya di “Otorisator yang mengerjakan” — status berubah menjadi sudah diotorisasi atas nama beliau.</p>
        </div>
        )}
      </Sheet>
    </section>
  )
}
