// ============================================================
//  EMAIL OTORISASI — untuk otorisator yang bekerja lewat email.
//  Alur: proofreader lapor ke Admin Pusat → Admin Pusat kirim email (1 invoice = 1 email) berisi
//  dokumen sumber + hasil proofread → otorisator membalas lewat email → Admin Pusat mengunggah
//  hasilnya dan menandai "Sudah diotorisasi" atas nama otorisator itu.
//  • Pengiriman dilakukan SERVER (fungsi `email-otorisasi`, Gmail). Alamat tujuan & mode tes ditentukan server, bukan browser.
//  • DEMO: tidak ada email yang benar-benar dikirim — ditandai jelas sebagai simulasi.
//  • Izin: email-otorisasi.tambah (kirim), email-otorisasi.atur (nyalakan/matikan mode tes).
// ============================================================
import { useMemo, useState } from 'react'
import { Mail, Loader2, Paperclip, CheckCircle2, FlaskConical } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { invoiceLabel } from '../config/access.js'
import { db, MODE } from '../lib/db.js'
import { SUPABASE_URL } from '../lib/supabase.js'
import { drive } from '../lib/integrations.js'
import { fieldFiles } from './FileManager.jsx'
import { Sheet, cx } from './ui.jsx'

const LIVE = MODE === 'supabase'
const MAKS_BYTE = 18 * 1024 * 1024 // batas lampiran Gmail 25 MB (setelah dikodekan)
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const KODE = { Indonesia: 'IND', Inggris: 'ENG', Belanda: 'NED' }
export const kodeBahasa = (b) => KODE[b] || String(b || '').slice(0, 3).toUpperCase()
const asing = (s) => [s.lang_from, s.lang_to].find((x) => x && x !== 'Indonesia') || s.lang_to || s.lang_from || ''
const wita = (d = new Date()) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value])); return { tgl: `${p.year}-${p.month}-${p.day}`, jam: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` } }
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

export default function EmailOtorisasi({ project }) {
  const { user, data, save, notify, ask } = useApp()
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState(null) // { penerima:[{id,nama,sapaan}], mode_tes, tes_ke, siap, alasan? }
  const [oto, setOto] = useState('')
  const [tgl, setTgl] = useState(''); const [jam, setJam] = useState('16:00')
  const [isi, setIsi] = useState(''); const [isiManual, setIsiManual] = useState(false)
  const [pilih, setPilih] = useState(new Set())
  const [sibuk, setSibuk] = useState('')
  const subs = useMemo(() => subSiapOto(project), [project])
  const berkas = useMemo(() => lampiranOto(subs), [subs])
  const riwayat = project?.email_oto || []
  if (!boleh(user, 'email-otorisasi.tambah') || (!subs.length && !riwayat.length)) return null

  const penerima = info?.penerima || []
  const sapaan = penerima.find((x) => x.id === oto)?.sapaan || 'Bapak/Ibu'
  const judul = judulEmailOto(subs, tgl, jam)
  const isiOtomatis = isiEmailOto(project, subs, sapaan, wita().jam)
  const isiPakai = isiManual ? isi : isiOtomatis
  const terpilih = berkas.filter((f) => pilih.has(f._id)); const total = terpilih.reduce((a, f) => a + (f.size || 0), 0)

  const buka = async () => {
    const dl = project.about?.deadline ? wita(new Date(project.about.deadline)) : wita()
    setTgl(dl.tgl); setJam(project.about?.deadline && dl.jam !== '00:00' ? dl.jam : '16:00'); setIsiManual(false); setPilih(new Set(berkas.map((f) => f._id))); setOpen(true)
    let r
    if (LIVE) r = await panggil('info')
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
    if (!oto) return notify('Pilih otorisator tujuan', 'err')
    if (!terpilih.length) return notify('Pilih minimal satu lampiran', 'err')
    if (total > MAKS_BYTE) return notify(`Lampiran ${kb(total)} — melebihi batas 18 MB. Kurangi lampiran.`, 'err')
    const tes = !!info?.mode_tes
    if (!tes && riwayat.some((x) => !x.tes && !x.simulasi) && !(await ask('Invoice ini sudah pernah dikirim ke otorisator. Kirim email lagi?'))) return
    setSibuk('kirim')
    try {
      const lampiran = []
      for (const f of terpilih) { const blob = await drive.blob(f); lampiran.push({ nama: f.name, mime: blob.type || 'application/octet-stream', b64: await keB64(blob) }) }
      let r = { ok: true, simulasi: true }
      if (LIVE) r = await panggil('kirim', { project_id: project.id, oto_id: oto, subjek: judul, isi: isiPakai, lampiran })
      if (!r.ok) { notify(r.alasan || 'Email gagal dikirim', 'err'); return }
      const catat = { at: new Date().toISOString(), by: user.id, by_name: user.name, oto_id: oto, oto_nama: penerima.find((x) => x.id === oto)?.nama || '', tes: LIVE ? !!r.tes : tes, simulasi: !LIVE, subjek: judul, berkas: terpilih.map((f) => f.name), sub_ids: subs.map((s) => s.id) }
      try { await save('projects', { id: project.id, email_oto: [...riwayat, catat].slice(-20) }) } catch { notify('Email terkirim, tetapi catatannya gagal disimpan di project', 'err') }
      notify(!LIVE ? 'Demo: email TIDAK benar-benar dikirim (simulasi tercatat)' : r.tes ? 'Email TES terkirim ke alamat tes' : `Email terkirim ke ${catat.oto_nama || 'otorisator'}`)
      setOpen(false)
    } catch (e) { notify(e.message || 'Gagal menyiapkan lampiran', 'err') } finally { setSibuk('') }
  }
  const akhir = riwayat[riwayat.length - 1]
  const cap = 'min-h-9 rounded-lg border-0 bg-white px-2.5 py-1.5 text-sm text-ink ring-1 ring-slate-300 max-md:min-h-11 max-md:text-base'

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200" data-email-oto>
      <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
        <strong className="flex items-center gap-1.5 text-[13px] text-ink"><Mail className="h-4 w-4 text-brand" aria-hidden="true" />Email otorisasi</strong>
        <span className="text-xs text-ink-mute" data-email-oto-status>{akhir
          ? <>{akhir.simulasi ? 'Simulasi demo' : akhir.tes ? 'Email TES terkirim' : 'Terkirim'} {new Date(akhir.at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} · oleh {akhir.by_name}{akhir.oto_nama ? ` · untuk ${akhir.oto_nama}` : ''} · {akhir.berkas?.length || 0} lampiran</>
          : 'Untuk otorisator yang bekerja lewat email: kirim dokumen sumber + hasil proofread, 1 invoice 1 email.'}</span>
      </span>
      {subs.length > 0 && <button type="button" onClick={buka} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:opacity-90 max-md:min-h-11" data-aksi="buka-email-oto"><Mail className="h-4 w-4" aria-hidden="true" />{akhir ? 'Kirim lagi' : 'Kirim email ke otorisator'}</button>}

      <Sheet open={open} onClose={() => !sibuk && setOpen(false)} title="Email otorisasi" subtitle={`${invoiceLabel(project.invoice_no)} · 1 invoice 1 email`} wide
        footer={<div className="flex flex-wrap items-center justify-end gap-2">
          <span className={cx('mr-auto text-xs', total > MAKS_BYTE ? 'font-semibold text-rose-700' : 'text-ink-mute')}>{terpilih.length} lampiran · {kb(total)}</span>
          <button type="button" onClick={() => setOpen(false)} disabled={!!sibuk} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-ink-soft ring-1 ring-slate-300 max-md:min-h-11">Batal</button>
          <button type="button" onClick={kirim} disabled={!!sibuk || !info || !penerima.length} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50 max-md:min-h-11" data-aksi="kirim-email-oto">{sibuk === 'kirim' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}{sibuk === 'kirim' ? 'Mengirim…' : !LIVE ? 'Simulasikan kirim' : info?.mode_tes ? 'Kirim email TES' : 'Kirim email'}</button>
        </div>}>
        <div className="flex flex-col gap-3" data-form-email-oto>
          {!info && <p className="flex items-center gap-2 text-sm text-ink-mute"><Loader2 className="h-4 w-4 animate-spin" />Memuat setelan email…</p>}
          {info?.alasan && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-800" role="alert">{info.alasan}</p>}
          {!LIVE && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-900" data-info-demo>Demo: tombol di bawah hanya SIMULASI — tidak ada email yang dikirim. Pengiriman sungguhan hanya di aplikasi live.</p>}
          {LIVE && info && !info.alasan && info.siap === false && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-900" role="alert">Email belum disetel di server (kata sandi aplikasi Gmail belum dipasang) — pengiriman akan ditolak.</p>}
          {info && !info.alasan && (
            <div className={cx('flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[12.5px]', info.mode_tes ? 'bg-sky-50 text-sky-900' : 'bg-emerald-50 text-emerald-900')} data-mode-tes={info.mode_tes ? 'ya' : 'tidak'}>
              <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 font-semibold">{info.mode_tes ? `Mode tes NYALA — email hanya dikirim ke ${info.tes_ke || 'alamat tes'}, bukan ke otorisator.` : 'Mode tes mati — email dikirim langsung ke otorisator.'}</span>
              {boleh(user, 'email-otorisasi.atur') && <button type="button" onClick={() => aturTes(!info.mode_tes)} disabled={!!sibuk} className="min-h-9 rounded-lg bg-white px-2.5 text-xs font-semibold ring-1 ring-slate-300 max-md:min-h-11" data-aksi="atur-tes">{info.mode_tes ? 'Matikan mode tes' : 'Nyalakan mode tes'}</button>}
            </div>
          )}
          <label className="block text-xs font-semibold text-ink-soft">Otorisator tujuan
            <select value={oto} onChange={(e) => setOto(e.target.value)} className={cx(cap, 'mt-1 block w-full')} data-isi="oto">
              {!penerima.length && <option value="">— belum ada otorisator dengan email terdaftar —</option>}
              {penerima.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
            </select></label>
          <div className="grid grid-cols-2 gap-2 max-[380px]:grid-cols-1">
            <label className="block text-xs font-semibold text-ink-soft">Dibutuhkan tanggal<input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} className={cx(cap, 'mt-1 block w-full max-md:h-11')} data-isi="tgl" /></label>
            <label className="block text-xs font-semibold text-ink-soft">Pukul (WITA)<input type="time" value={jam} onChange={(e) => setJam(e.target.value)} className={cx(cap, 'mt-1 block w-full max-md:h-11')} data-isi="jam" /></label>
          </div>
          <div className="text-xs font-semibold text-ink-soft">Judul email<p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-2 text-sm font-semibold text-ink ring-1 ring-slate-200" data-judul-email>{info?.mode_tes && LIVE ? '[TES] ' : ''}{judul}</p></div>
          <label className="block text-xs font-semibold text-ink-soft">Isi email
            <textarea value={isiPakai} onChange={(e) => { setIsi(e.target.value); setIsiManual(true) }} rows={8} className={cx(cap, 'mt-1 block w-full font-normal leading-relaxed')} data-isi="isi" />
            {isiManual && <button type="button" onClick={() => setIsiManual(false)} className="mt-1 text-xs font-semibold text-brand underline">Kembalikan ke teks bawaan</button>}</label>
          <fieldset className="flex flex-col gap-1.5"><legend className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink-soft"><Paperclip className="h-3.5 w-3.5" aria-hidden="true" />Lampiran (dokumen sumber & hasil proofread)</legend>
            {!berkas.length && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-800">Belum ada dokumen sumber / hasil proofread pada invoice ini.</p>}
            {berkas.map((f) => (
              <label key={f._id} className="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm ring-1 ring-slate-200" data-lampiran>
                <input type="checkbox" checked={pilih.has(f._id)} onChange={() => setPilih((v) => { const n = new Set(v); n.has(f._id) ? n.delete(f._id) : n.add(f._id); return n })} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 break-words">{f.name}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{f._jenis}</span>
                <span className="shrink-0 text-[11px] text-ink-mute">{kb(f.size)}</span>
              </label>))}
          </fieldset>
          <p className="flex items-start gap-1.5 text-[11.5px] text-ink-mute"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Setelah otorisator membalas email, unggah hasilnya di tahap Otorisasi dan pilih namanya di “Otorisator yang mengerjakan” — status berubah menjadi sudah diotorisasi atas nama beliau.</p>
        </div>
      </Sheet>
    </section>
  )
}
