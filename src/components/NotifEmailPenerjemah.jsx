import { useState } from 'react'
import { Mail, Send, ChevronDown } from 'lucide-react'
import { Field, Input, cx } from './ui.jsx'
import { invoiceLabel } from '../config/access.js'
import { prioSub } from '../config/priority.js'
import { daftarDokChat } from './SalinChatOrder.jsx'
import { ALAMAT_ATLAS, EMAIL_SAH, NOTIF_LIVE, PENGIRIM_NOTIF, kirimEmailContoh } from '../lib/notifEmail.js'

// ============================================================
//  EMAIL NOTIFIKASI TUGAS — pengaturan per akun penerjemah (Pengaturan → Pengguna)
//  + pratinjau email. Hanya admin pengelola pengguna yang bisa mengubah alamat & tombolnya.
//  Email tidak berisi lampiran maupun nama pelanggan — penerjemah membuka dokumennya di ATLAS.
// ============================================================

const tglJam = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  const tgl = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return String(v).length > 10 ? `${tgl}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')} WITA` : tgl
}
const jmlDok = (sb) => sb.docs?.length || sb.file_count || 0
const jmlHal = (sb) => (sb.docs?.length ? sb.docs.reduce((a, d) => a + (Number(d.pages) || 0), 0) : Number(sb.pages) || 0)

/** Isi email untuk pratinjau (susunan yang sama dibuat ulang di server dari data project). */
export function isiEmailTugas(project, subs, penerjemah) {
  const no = invoiceLabel(project?.invoice_no) || project?.invoice_no || '—'
  const baris = subs.map((sb) => ({
    judul: daftarDokChat(sb, false).join(', ') || sb.title || 'Dokumen',
    dok: jmlDok(sb), hal: jmlHal(sb),
    arah: sb.lang_from && sb.lang_to ? `${sb.lang_from} → ${sb.lang_to}` : '',
    prioritas: prioSub(project, sb),
  }))
  return {
    dari: PENGIRIM_NOTIF,
    ke: String(penerjemah?.notif_email || '').trim(),
    subjek: `Tugas baru ${no} · DL ${tglJam(project?.about?.deadline)}`,
    sapaan: `Halo ${penerjemah?.nickname || penerjemah?.name || 'Penerjemah'}, ada tugas baru:`,
    no, deadline: tglJam(project?.about?.deadline), baris,
    tautan: ALAMAT_ATLAS,
  }
}

/** Data BUATAN untuk pratinjau — bukan dokumen pelanggan. */
const besokSore = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(16, 0, 0, 0); return d.toISOString() }
const CONTOH_PROJECT = () => ({ invoice_no: '1090000000123', about: { deadline: besokSore(), priority: 'Ekspres' } })
const CONTOH_SUB = [{ id: 'c1', title: 'Akta Kelahiran', lang_from: 'Indonesia', lang_to: 'Inggris', docs: [{ desc: 'Akta Kelahiran', pages: 1 }, { desc: 'Kartu Keluarga', pages: 2 }] }]

export function PratinjauEmail({ isi }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200" data-pratinjau-email>
      <div className="space-y-0.5 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-ink-soft">
        <p className="break-words"><span className="text-ink-mute">Dari:</span> {isi.dari}</p>
        <p className="break-words"><span className="text-ink-mute">Kepada:</span> {isi.ke || '(alamat belum diisi)'}</p>
        <p className="break-words text-xs font-semibold text-ink">{isi.subjek}</p>
      </div>
      <div className="space-y-2 px-3 py-3 text-sm text-ink">
        <p>{isi.sapaan}</p>
        <p className="break-words font-semibold">{isi.no} · DL {isi.deadline}</p>
        <ol className="space-y-1">
          {isi.baris.map((b, i) => (
            <li key={i} className="break-words">{i + 1}. {b.judul}<span className="text-ink-soft"> — {[b.dok && `${b.dok} dok`, b.hal && `${b.hal} hal`, b.arah, b.prioritas].filter(Boolean).join(' · ')}</span></li>
          ))}
        </ol>
        <p><span className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Buka di ATLAS</span></p>
      </div>
    </div>
  )
}

/** Blok pengaturan di form Pengguna. `e` = akun yang diedit, `set` = pengubahnya, `bisaUbah` = izin pengaturan.pengguna.ubah. */
export default function NotifEmailPenerjemah({ e, set, bisaUbah }) {
  const [buka, setBuka] = useState(false)
  const [kirim, setKirim] = useState({ sibuk: false, pesan: '', nada: '' })
  const alamat = String(e.notif_email || '').trim()
  const sah = EMAIL_SAH.test(alamat)
  const nyala = e.notif_email_aktif === true
  const tersimpan = !!e.id
  const contoh = async () => {
    if (kirim.sibuk) return
    setKirim({ sibuk: true, pesan: '', nada: '' })
    const r = await kirimEmailContoh(e.id)
    setKirim({ sibuk: false, nada: r.ok ? 'ok' : 'gagal', pesan: r.demo ? 'Mode demo: email tidak benar-benar dikirim. Di versi live, email contoh masuk ke alamat ini.' : r.ok ? `Email contoh terkirim ke ${r.ke || alamat}. Minta penerjemah cek kotak masuk (dan folder spam).` : (r.alasan || 'Email contoh gagal dikirim') })
  }
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200" data-notif-email>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1"><p className="flex items-center gap-1.5 text-sm font-semibold"><Mail className="h-4 w-4 shrink-0" />Email notifikasi tugas</p><p className="text-[11px] text-ink-mute">Saat ada project baru ditugaskan ke penerjemah ini, ia mendapat email singkat: No Invoice, dokumen, deadline. Tanpa lampiran.</p></div>
        <button type="button" role="switch" aria-checked={nyala} aria-label="Email notifikasi tugas" disabled={!bisaUbah}
          onClick={() => set({ ...e, notif_email_aktif: !nyala })}
          className={cx("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 max-md:h-8 max-md:w-14 max-md:before:absolute max-md:before:-inset-x-1 max-md:before:-inset-y-1.5 max-md:before:content-['']", nyala ? 'bg-brand' : 'bg-slate-300')}><span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition max-md:h-7 max-md:w-7', nyala ? 'left-[1.375rem] max-md:left-[1.625rem]' : 'left-0.5')} /></button>
      </div>
      <div className="mt-3">
        <Field label="Email notifikasi" hint="Alamat email yang benar-benar dibuka penerjemah (boleh email pribadi). Berbeda dari email untuk masuk ATLAS.">
          <Input type="email" inputMode="email" autoComplete="off" placeholder="nama@email.com" value={e.notif_email || ''} disabled={!bisaUbah}
            onChange={(x) => set({ ...e, notif_email: x.target.value })} className="max-md:text-base" />
        </Field>
        {alamat && !sah && <p className="mt-1 text-[11px] text-rose-700">Alamat email belum benar.</p>}
        {nyala && !alamat && <p className="mt-1 text-[11px] text-amber-700">Tombol menyala tetapi alamat belum diisi — email belum akan terkirim.</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setBuka(!buka)} aria-expanded={buka}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-ink-soft ring-1 ring-slate-300 hover:bg-slate-100 max-md:min-h-11">
          <ChevronDown className={cx('h-3.5 w-3.5 transition', buka && 'rotate-180')} />{buka ? 'Tutup contoh email' : 'Lihat contoh email'}</button>
        {bisaUbah && tersimpan && sah && (
          <button type="button" onClick={contoh} disabled={kirim.sibuk}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-brand ring-1 ring-brand/30 hover:bg-brand hover:text-white disabled:opacity-50 max-md:min-h-11">
            <Send className="h-3.5 w-3.5" />{kirim.sibuk ? 'Mengirim…' : 'Kirim email contoh'}</button>)}
      </div>
      {bisaUbah && sah && !tersimpan && <p className="mt-1 text-[11px] text-ink-mute">Simpan akun ini dulu untuk mengirim email contoh.</p>}
      {kirim.pesan && <p role="status" className={cx('mt-2 text-[11px]', kirim.nada === 'gagal' ? 'text-rose-700' : 'text-emerald-700')}>{kirim.pesan}</p>}
      {buka && <div className="mt-3"><p className="mb-1 text-[11px] text-ink-mute">Contoh dengan data buatan{NOTIF_LIVE ? '' : ' (mode demo — tidak ada email yang dikirim)'}:</p><PratinjauEmail isi={isiEmailTugas(CONTOH_PROJECT(), CONTOH_SUB, e)} /></div>}
      {!bisaUbah && <p className="mt-2 text-[11px] text-amber-700">Hanya admin dengan izin mengubah pengguna yang dapat mengganti pengaturan ini.</p>}
    </div>
  )
}
