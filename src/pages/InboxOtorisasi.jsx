// ============================================================
//  INBOX OTORISASI — balasan email dari otorisator yang bekerja lewat email.
//  • LIVE: dibaca server (fungsi `email-inbox`, baca-saja) dari kotak masuk Gmail pengirim; HANYA email dari alamat otorisator
//    terdaftar (dan alamat tes selama mode tes). Email lain di akun itu tidak pernah diambil.
//  • Lampiran bisa disimpan langsung ke project: bila ada satu dokumen di tahap Otorisasi → jadi "Hasil Otorisasi" dokumen itu,
//    selain itu masuk File project. Penandaan "sudah diotorisasi" tetap dilakukan manusia di project-nya.
//  • DEMO: isi inbox adalah CONTOH SINTETIS dari email yang disimulasikan — bukan email sungguhan.
//  • Izin: inbox-otorisasi.lihat (buka), inbox-otorisasi.tambah (simpan lampiran ke project).
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { Inbox, Loader2, RotateCw, Paperclip, CheckCircle2, FolderKanban, FlaskConical, ArrowRight, FolderDown } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { invoiceLabel } from '../config/access.js'
import { db, MODE } from '../lib/db.js'
import { SUPABASE_URL } from '../lib/supabase.js'
import { uploadProjectFiles, fieldFiles } from '../components/FileManager.jsx'
import { cx } from '../components/ui.jsx'

const LIVE = MODE === 'supabase'
const digit = (v) => String(v || '').replace(/\D/g, '')
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`)
const waktu = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '')
async function panggil(aksi, body = {}) {
  try {
    const token = await db.token?.()
    if (!token) return { ok: false, alasan: 'Sesi berakhir — silakan masuk ulang' }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/email-inbox`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ aksi, ...body }) })
    return await r.json().catch(() => ({ ok: false, alasan: `Server ${r.status}` }))
  } catch { return { ok: false, alasan: 'Koneksi ke server gagal — periksa internet' } }
}
const dariB64 = (s, mime) => { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type: mime || 'application/octet-stream' }) }
/** Demo: satu balasan contoh untuk tiap project yang emailnya pernah disimulasikan. */
const inboxDemo = (projects) => (projects || []).filter((p) => (p.email_oto || []).length).map((p) => { const e = p.email_oto[p.email_oto.length - 1]; const inv = digit(p.invoice_no); return {
  uid: `demo-${p.id}`, dari: e.oto_nama || 'Otorisator', tes: true, subjek: `Re: ${e.subjek}`, tanggal: new Date(+new Date(e.at) + 3600e3).toISOString(), invoice: [inv],
  cuplikan: 'Selamat siang, dokumen sudah saya periksa dan otorisasi. Hasilnya terlampir.\n\nTerima kasih.', lampiran: [{ part: '2', nama: `Hasil otorisasi ${inv} (contoh sintetis).txt`, ukuran: 74, mime: 'text/plain' }] } })

export default function InboxOtorisasi() {
  const { user, data, save, notify } = useApp()
  const [st, setSt] = useState({ muat: false, data: null, galat: '', mode_tes: false, bisa_ambil: false, at: '' })
  const [sibuk, setSibuk] = useState('') // kunci lampiran yang sedang disimpan
  const [manual, setManual] = useState({}) // uid → nomor invoice yang diketik saat project tidak dikenali
  const izin = boleh(user, 'inbox-otorisasi.lihat'); const bisaSimpan = boleh(user, 'inbox-otorisasi.tambah')
  const petaInv = useMemo(() => new Map((data.projects || []).filter((p) => !p.cancelled).map((p) => [digit(p.invoice_no), p])), [data.projects])
  const muat = async () => {
    setSt((v) => ({ ...v, muat: true, galat: '' }))
    const r = LIVE ? await panggil('inbox') : { ok: true, data: inboxDemo(data.projects), mode_tes: true, bisa_ambil: true, dicek_at: new Date().toISOString() }
    setSt((v) => ({ ...v, muat: false, data: r.ok ? r.data || [] : v.data, galat: r.ok ? '' : r.alasan || 'Gagal memuat inbox', mode_tes: !!r.mode_tes, bisa_ambil: !!r.bisa_ambil, at: r.dicek_at || v.at }))
  }
  useEffect(() => { if (izin) muat() }, [izin]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!izin) return <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-[#E7E8F0]"><p className="text-[17px] font-bold">Tidak ada akses</p><p className="mt-1 text-sm text-[#5E6380]">Minta Super Admin mengaktifkan “Inbox Otorisasi” di Role & Hak Akses.</p></div>

  const projectDari = (m) => (m.invoice || []).map((i) => petaInv.get(i)).find(Boolean) || petaInv.get(digit(manual[m.uid])) || null
  const sudah = (p, m, l) => (p?.email_oto_balasan || []).some((x) => String(x.uid) === String(m.uid) && x.part === l.part)
  const simpan = async (m, l) => {
    const p0 = projectDari(m); if (!p0 || sibuk) return
    const kunci = `${m.uid}:${l.part}`; setSibuk(kunci)
    try {
      let blob
      if (LIVE) { const r = await panggil('lampiran', { uid: m.uid, part: l.part }); if (!r.ok) { notify(r.alasan || 'Gagal mengambil lampiran', 'err'); return } blob = dariB64(r.b64, r.mime) }
      else blob = new Blob(['Berkas contoh sintetis untuk demo Inbox Otorisasi (bukan dokumen pelanggan).'], { type: 'text/plain' })
      const p = (data.projects || []).find((x) => x.id === p0.id) || p0 // versi terbaru
      const dOto = (p.sub_projects || []).filter((s) => s.stage === 'otorisasi' && !s.cancelled); const target = dOto.length === 1 ? dOto[0] : null
      const added = await uploadProjectFiles([{ file: new File([blob], l.nama, { type: blob.type }), name: l.nama, sub_id: target?.id || '' }], { branch: p.branch, invoice: p.invoice_no, by: user.name, subs: p.sub_projects })
      const catat = { uid: m.uid, part: l.part, nama: l.nama, at: new Date().toISOString(), by_name: user.name }
      const next = { id: p.id, email_oto_balasan: [...(p.email_oto_balasan || []), catat].slice(-60) }
      if (target) next.sub_projects = p.sub_projects.map((s) => { if (s.id !== target.id) return s; const list = [...fieldFiles(s.data, 'file_final'), ...added]; return { ...s, data: { ...s.data, file_final: list[0], file_final_list: list } } })
      else next.files = [...(p.files || []), ...added]
      await save('projects', next)
      notify(target ? `Tersimpan sebagai Hasil Otorisasi · ${invoiceLabel(p.invoice_no)}` : `Tersimpan di File project · ${invoiceLabel(p.invoice_no)}`)
    } catch (e) { notify(e.message || 'Gagal menyimpan lampiran', 'err') } finally { setSibuk('') }
  }
  const tb = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold ring-1 ring-[#D9DBE7] hover:bg-[#F3F4F9] disabled:opacity-50 max-md:min-h-11'

  return (
    <div className="flex flex-col gap-4" data-inbox-otorisasi>
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#141B34] text-white"><Inbox className="h-5 w-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-[1_1_220px]"><h1 className="text-xl font-bold tracking-tight">Inbox Otorisasi</h1>
          <p className="text-[13px] text-[#5E6380]">Balasan email dari otorisator. Simpan lampirannya langsung ke project.</p></span>
        <button type="button" onClick={muat} disabled={st.muat} className={cx(tb, 'bg-white')} data-aksi="cek-balasan">{st.muat ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}Cek balasan</button>
      </header>
      {!LIVE && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-900" data-info-demo>Demo: isi inbox di bawah adalah CONTOH — muncul setelah Anda menyimulasikan kirim email otorisasi. Di aplikasi live, yang tampil adalah balasan sungguhan.</p>}
      {LIVE && st.mode_tes && <p className="flex items-start gap-2 rounded-xl bg-sky-50 px-3 py-2 text-[12.5px] font-semibold text-sky-900"><FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Mode tes nyala — balasan dari alamat tes ikut ditampilkan di sini.</p>}
      {st.galat && <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-800" role="alert" data-galat-inbox>{st.galat}</p>}
      {st.muat && !st.data && <p className="flex items-center gap-2 py-8 text-sm text-[#5E6380]"><Loader2 className="h-4 w-4 animate-spin" />Membaca kotak masuk…</p>}
      {st.data && !st.data.length && !st.galat && <div className="rounded-2xl bg-white px-4 py-10 text-center ring-1 ring-[#E7E8F0]" data-inbox-kosong><p className="text-[15px] font-bold">Belum ada balasan</p><p className="mt-1 text-[13px] text-[#5E6380]">Yang tampil di sini hanya email dari otorisator terdaftar dalam 30 hari terakhir.</p></div>}
      {st.data?.length > 0 && <ul className="flex flex-col gap-3" data-daftar-inbox>{st.data.map((m) => { const p = projectDari(m); return (
        <li key={m.uid} className="flex flex-col gap-2.5 rounded-2xl bg-white p-4 ring-1 ring-[#E7E8F0]" data-pesan>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-[14.5px]">{m.dari}</strong>{m.tes && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-bold text-sky-900">TES</span>}
            <span className="ml-auto text-xs text-[#5E6380]">{waktu(m.tanggal)}</span>
          </div>
          <p className="break-words text-[13.5px] font-semibold">{m.subjek || '(tanpa judul)'}</p>
          {m.cuplikan && <p className="whitespace-pre-line break-words rounded-xl bg-[#F6F7FB] px-3 py-2 text-[13px] leading-relaxed text-[#30354F]">{m.cuplikan}</p>}
          <div className="flex flex-wrap items-center gap-2 text-[13px]" data-project-pesan>
            <FolderKanban className="h-4 w-4 shrink-0 text-[#5E6380]" aria-hidden="true" />
            {p ? <><span className="min-w-0 break-words"><strong>{invoiceLabel(p.invoice_no)}</strong> · {p.customer?.name || '—'}</span>
                <a href={`#/projects/${p.id}`} className={cx(tb, 'ml-auto')} data-aksi="buka-project">Buka project<ArrowRight className="h-4 w-4" aria-hidden="true" /></a></>
              : <label className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[#8A4B00]"><span className="font-semibold">Project belum dikenali — ketik nomor invoice:</span>
                  <input type="text" inputMode="numeric" value={manual[m.uid] || ''} onChange={(e) => setManual((v) => ({ ...v, [m.uid]: e.target.value }))} placeholder="13 angka" aria-label="Nomor invoice project" className="min-h-9 w-44 rounded-lg border-0 bg-white px-2.5 text-sm ring-1 ring-[#D9DBE7] max-md:min-h-11 max-md:text-base" data-isi="invoice-manual" /></label>}
          </div>
          {m.lampiran?.length > 0 ? <ul className="flex flex-col gap-1.5">{m.lampiran.map((l) => { const ok = sudah(p && ((data.projects || []).find((x) => x.id === p.id) || p), m, l); const k = `${m.uid}:${l.part}`; return (
            <li key={l.part} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-[#F1F3F4] px-3 py-2" data-lampiran-inbox={ok ? 'tersimpan' : 'belum'}>
              <Paperclip className="h-4 w-4 shrink-0 text-[#5E6380]" aria-hidden="true" />
              <span className="min-w-0 flex-[1_1_180px] break-words text-[13.5px] font-semibold">{l.nama} <span className="font-normal text-[#5E6380]">({kb(l.ukuran)})</span></span>
              {ok ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Sudah disimpan ke project</span>
                : bisaSimpan && (!LIVE || st.bisa_ambil) ? <button type="button" onClick={() => simpan(m, l)} disabled={!p || !!sibuk} title={p ? '' : 'Tentukan project-nya dulu'} className={cx(tb, 'bg-white')} data-aksi="simpan-lampiran">{sibuk === k ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderDown className="h-4 w-4" />}{sibuk === k ? 'Menyimpan…' : 'Simpan ke project'}</button>
                : <span className="text-xs text-[#5E6380]">Tidak ada izin menyimpan</span>}
            </li>) })}</ul> : <p className="text-xs text-[#5E6380]">Tanpa lampiran.</p>}
        </li>) })}</ul>}
      {st.at && <p className="text-[11.5px] text-[#5E6380]">Terakhir dicek {waktu(st.at)}. Lampiran yang disimpan menjadi Hasil Otorisasi bila invoice itu punya satu dokumen di tahap Otorisasi; selain itu masuk File project. Menandai “sudah diotorisasi” tetap dilakukan di project-nya.</p>}
    </div>
  )
}
