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
import { Inbox, Loader2, RotateCw, Paperclip, CheckCircle2, FolderKanban, FlaskConical, ArrowRight, FolderDown, ChevronDown } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { invoiceLabel } from '../config/access.js'
import { db, MODE } from '../lib/db.js'
import { SUPABASE_URL } from '../lib/supabase.js'
import { uploadProjectFiles, fieldFiles } from '../components/FileManager.jsx'
import { cx } from '../components/ui.jsx'

const LIVE = MODE === 'supabase'
/** Buang sisa kepala kutipan ("Pada … <alamat>\nmenulis:" / "On … wrote:") yang terpotong dua baris di ujung isi balasan. */
const tanpaKepalaKutipan = (t) => String(t || '').replace(/\n*^(Pada|On)\b[^\n]*(\n[^\n]*){0,2}?(menulis|wrote):?\s*$[\s\S]*/im, '').trim()
const digit = (v) => String(v || '').replace(/\D/g, '')
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`)
const waktu = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '')
/** Waktu ringkas seperti di daftar email: hari ini → jam, selain itu tanggal. */
const waktuRingkas = (iso) => { if (!iso) return ''; const d = new Date(iso), n = new Date(); return d.toDateString() === n.toDateString() ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) }
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
  cuplikan: 'Selamat siang, dokumen sudah saya periksa dan otorisasi. Hasilnya terlampir.\n\nTerima kasih.', lampiran: [{ part: '2', nama: `Hasil otorisasi ${inv} (contoh sintetis).txt`, ukuran: 74, mime: 'text/plain' }, { part: '3', nama: `Lampiran kedua ${inv} (contoh sintetis).txt`, ukuran: 74, mime: 'text/plain' }, { part: '4', nama: `Lampiran ketiga ${inv} (contoh sintetis).txt`, ukuran: 74, mime: 'text/plain' }] } })

export default function InboxOtorisasi() {
  const { user, data, save, notify } = useApp()
  const [st, setSt] = useState({ muat: false, data: null, galat: '', mode_tes: false, bisa_ambil: false, at: '' })
  const [sibuk, setSibuk] = useState('') // kunci lampiran yang sedang disimpan
  const [terbuka, setTerbuka] = useState('') // uid baris yang sedang dibuka (detail muncul di bawah barisnya)
  const [lepas, setLepas] = useState(() => new Set()) // lampiran yang TIDAK dicentang (`uid:part`) — bawaan: semua dicentang
  const [maju, setMaju] = useState(null) // { uid, i, n } kemajuan simpan banyak
  const [manual, setManual] = useState({}) // uid → nomor invoice yang diketik saat project tidak dikenali
  const izin = boleh(user, 'inbox-otorisasi.lihat'); const bisaSimpan = boleh(user, 'inbox-otorisasi.tambah')
  const petaInv = useMemo(() => new Map((data.projects || []).filter((p) => !p.cancelled).map((p) => [digit(p.invoice_no), p])), [data.projects])
  const muat = async () => {
    setSt((v) => ({ ...v, muat: true, galat: '' }))
    const r = LIVE ? await panggil('inbox') : { ok: true, data: inboxDemo(data.projects), mode_tes: true, bisa_ambil: true, dicek_at: new Date().toISOString() }
    if (r.ok) for (const m of r.data || []) m.cuplikan = tanpaKepalaKutipan(m.cuplikan)
    setSt((v) => ({ ...v, muat: false, data: r.ok ? r.data || [] : v.data, galat: r.ok ? '' : r.alasan || 'Gagal memuat inbox', mode_tes: !!r.mode_tes, bisa_ambil: !!r.bisa_ambil, at: r.dicek_at || v.at }))
  }
  useEffect(() => { if (izin) muat() }, [izin]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!izin) return <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-[#E7E8F0]"><p className="text-[17px] font-bold">Tidak ada akses</p><p className="mt-1 text-sm text-[#5E6380]">Minta Super Admin mengaktifkan “Inbox Otorisasi” di Role & Hak Akses.</p></div>

  const projectDari = (m) => (m.invoice || []).map((i) => petaInv.get(i)).find(Boolean) || petaInv.get(digit(manual[m.uid])) || null
  const sudah = (p, m, l) => (p?.email_oto_balasan || []).some((x) => String(x.uid) === String(m.uid) && x.part === l.part)
  /** Simpan satu / banyak lampiran sekaligus: semua diambil & diunggah dulu, lalu project disimpan SEKALI (supaya tidak saling menimpa). */
  const simpanBanyak = async (m, daftar) => {
    const p0 = projectDari(m); if (!p0 || sibuk || !daftar.length) return
    setSibuk(`${m.uid}:${daftar.length === 1 ? daftar[0].part : '*'}`); setMaju({ uid: String(m.uid), i: 0, n: daftar.length })
    const p = (data.projects || []).find((x) => x.id === p0.id) || p0 // versi terbaru
    const dOto = (p.sub_projects || []).filter((s) => s.stage === 'otorisasi' && !s.cancelled); const target = dOto.length === 1 ? dOto[0] : null
    const added = [], catat = [], gagal = []
    try {
      for (let i = 0; i < daftar.length; i++) {
        const l = daftar[i]; setMaju({ uid: String(m.uid), i: i + 1, n: daftar.length })
        try {
          let blob
          if (LIVE) { const r = await panggil('lampiran', { uid: m.uid, part: l.part }); if (!r.ok) throw new Error(r.alasan || 'gagal mengambil'); blob = dariB64(r.b64, r.mime) }
          else blob = new Blob(['Berkas contoh sintetis untuk demo Inbox Otorisasi (bukan dokumen pelanggan).'], { type: 'text/plain' })
          const up = await uploadProjectFiles([{ file: new File([blob], l.nama, { type: blob.type }), name: l.nama, sub_id: target?.id || '' }], { branch: p.branch, invoice: p.invoice_no, by: user.name, subs: p.sub_projects })
          added.push(...up); catat.push({ uid: m.uid, part: l.part, nama: l.nama, at: new Date().toISOString(), by_name: user.name })
        } catch (e) { gagal.push(`${l.nama} (${e.message || 'gagal'})`) }
      }
      if (added.length) {
        const next = { id: p.id, email_oto_balasan: [...(p.email_oto_balasan || []), ...catat].slice(-80) }
        if (target) next.sub_projects = p.sub_projects.map((s) => { if (s.id !== target.id) return s; const list = [...fieldFiles(s.data, 'file_final'), ...added]; return { ...s, data: { ...s.data, file_final: list[0], file_final_list: list } } })
        else next.files = [...(p.files || []), ...added]
        await save('projects', next)
        notify(`${added.length} file tersimpan ${target ? 'sebagai Hasil Otorisasi' : 'di File project'} · ${invoiceLabel(p.invoice_no)}`)
      }
      if (gagal.length) notify(`${gagal.length} file GAGAL disimpan: ${gagal.join('; ')}`.slice(0, 300), 'err')
    } catch (e) { notify(e.message || 'Gagal menyimpan lampiran', 'err') } finally { setSibuk(''); setMaju(null) }
  }
  const simpan = (m, l) => simpanBanyak(m, [l])
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
      {st.data?.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E7E8F0]" role="table" aria-label="Daftar balasan email" data-daftar-inbox>
          <div className="hidden grid-cols-[minmax(130px,190px)_minmax(0,1fr)_minmax(110px,170px)_72px_86px_28px] items-center gap-3 border-b border-[#E7E8F0] bg-[#F6F7FB] px-4 py-2 text-[11.5px] font-bold uppercase tracking-wide text-[#5E6380] md:grid" role="row">
            <span role="columnheader">Pengirim</span><span role="columnheader">Judul & isi</span><span role="columnheader">Project</span><span role="columnheader">Lampiran</span><span className="text-right" role="columnheader">Waktu</span><span />
          </div>
          {st.data.map((m) => { const p = projectDari(m); const pKini = p && ((data.projects || []).find((x) => x.id === p.id) || p); const on = terbuka === String(m.uid)
            const nL = m.lampiran?.length || 0; const nOk = (m.lampiran || []).filter((l) => sudah(pKini, m, l)).length; const beres = nL > 0 && nOk === nL
            const ringkas = (m.cuplikan || '').replace(/\s+/g, ' ').trim()
            const bolehSimpan = bisaSimpan && (!LIVE || st.bisa_ambil); const belum = (m.lampiran || []).filter((l) => !sudah(pKini, m, l)); const dipilih = belum.filter((l) => !lepas.has(`${m.uid}:${l.part}`))
            return (
            <div key={m.uid} className={cx('border-b border-[#EEF0F5] last:border-b-0', on && 'bg-[#F8FAFF]')} role="rowgroup" data-pesan data-terbuka={on ? 'ya' : 'tidak'}>
              <button type="button" onClick={() => setTerbuka(on ? '' : String(m.uid))} aria-expanded={on} aria-controls={`inbox-${m.uid}`}
                className={cx('grid w-full items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-left hover:bg-[#F3F6FE] max-md:min-h-[64px] max-md:grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(130px,190px)_minmax(0,1fr)_minmax(110px,170px)_72px_86px_28px]', !beres && 'font-semibold')} role="row" data-baris-inbox>
                <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] text-[#141B34]" role="cell"><span className={cx('h-2 w-2 shrink-0 rounded-full', beres ? 'bg-transparent' : 'bg-[#0B57D0]')} aria-hidden="true" /><span className="truncate">{m.dari}</span>{m.tes && <span className="shrink-0 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-bold text-sky-900">TES</span>}</span>
                <span className="text-right text-xs font-normal text-[#5E6380] md:hidden">{waktuRingkas(m.tanggal)}</span>
                <span className="min-w-0 truncate text-[13.5px] text-[#141B34] max-md:col-span-2" role="cell">{m.subjek || '(tanpa judul)'}{ringkas && <span className="font-normal text-[#5E6380]"> — {ringkas}</span>}</span>
                <span className="min-w-0 truncate text-xs font-normal text-[#30354F] max-md:col-span-2" role="cell">{p ? invoiceLabel(p.invoice_no) : <span className="font-semibold text-[#8A4B00]">Belum dikenali</span>}{nL > 0 && <span className="md:hidden"> · <Paperclip className="inline h-3 w-3" aria-hidden="true" /> {nL} lampiran{beres ? ' · tersimpan' : ''}</span>}</span>
                <span className="hidden items-center gap-1 text-xs font-normal text-[#5E6380] md:flex" role="cell">{nL > 0 ? <>{beres ? <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-label="Semua lampiran sudah disimpan" /> : <Paperclip className="h-4 w-4" aria-hidden="true" />}{nL}</> : '—'}</span>
                <span className="hidden text-right text-xs font-normal text-[#5E6380] md:block" role="cell">{waktuRingkas(m.tanggal)}</span>
                <ChevronDown className={cx('hidden h-4 w-4 text-[#5E6380] transition-transform md:block', on && 'rotate-180')} aria-hidden="true" />
              </button>
              {on && (
                <div id={`inbox-${m.uid}`} className="flex flex-col gap-2.5 border-t border-[#E7E8F0] px-4 pb-4 pt-3 md:pl-9" data-detail-pesan>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"><strong className="text-[14.5px]">{m.dari}</strong><span className="text-xs text-[#5E6380]">{waktu(m.tanggal)}</span></div>
                  <p className="break-words text-[13.5px] font-semibold">{m.subjek || '(tanpa judul)'}</p>
                  {m.cuplikan ? <p className="whitespace-pre-line break-words rounded-xl bg-white px-3 py-2 text-[13px] leading-relaxed text-[#30354F] ring-1 ring-[#E7E8F0]">{m.cuplikan}</p> : <p className="text-xs text-[#5E6380]">(Tidak ada tulisan — hanya lampiran / kutipan.)</p>}
                  <div className="flex flex-wrap items-center gap-2 text-[13px]" data-project-pesan>
                    <FolderKanban className="h-4 w-4 shrink-0 text-[#5E6380]" aria-hidden="true" />
                    {p ? <><span className="min-w-0 break-words"><strong>{invoiceLabel(p.invoice_no)}</strong> · {p.customer?.name || '—'}</span>
                        <a href={`#/projects/${p.id}`} className={cx(tb, 'ml-auto bg-white')} data-aksi="buka-project">Buka project<ArrowRight className="h-4 w-4" aria-hidden="true" /></a></>
                      : <label className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[#8A4B00]"><span className="font-semibold">Project belum dikenali — ketik nomor invoice:</span>
                          <input type="text" inputMode="numeric" value={manual[m.uid] || ''} onChange={(e) => setManual((v) => ({ ...v, [m.uid]: e.target.value }))} placeholder="13 angka" aria-label="Nomor invoice project" className="min-h-9 w-44 rounded-lg border-0 bg-white px-2.5 text-sm ring-1 ring-[#D9DBE7] max-md:min-h-11 max-md:text-base" data-isi="invoice-manual" /></label>}
                  </div>
                  {bolehSimpan && belum.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#EEF3FE] px-3 py-2" data-simpan-banyak>
                      <label className="flex min-h-9 items-center gap-2 text-[13px] font-semibold max-md:min-h-11"><input type="checkbox" className="h-4 w-4" checked={dipilih.length === belum.length} ref={(el) => { if (el) el.indeterminate = dipilih.length > 0 && dipilih.length < belum.length }} onChange={(e) => setLepas((v) => { const n = new Set(v); for (const l of belum) e.target.checked ? n.delete(`${m.uid}:${l.part}`) : n.add(`${m.uid}:${l.part}`); return n })} data-isi="pilih-semua" />Pilih semua</label>
                      <span className="text-xs text-[#5E6380]">{dipilih.length} dari {belum.length} file dipilih</span>
                      <button type="button" onClick={() => simpanBanyak(m, dipilih)} disabled={!p || !!sibuk || !dipilih.length} title={p ? '' : 'Tentukan project-nya dulu'} className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#141B34] px-3 text-[13px] font-semibold text-white disabled:opacity-50 max-md:min-h-11" data-aksi="simpan-terpilih">
                        {maju?.uid === String(m.uid) && maju.n > 1 ? <><Loader2 className="h-4 w-4 animate-spin" />Menyimpan {maju.i}/{maju.n}…</> : <><FolderDown className="h-4 w-4" />Simpan {dipilih.length} file ke project</>}</button>
                    </div>
                  )}
                  {nL > 0 ? <ul className="flex flex-col gap-1.5">{m.lampiran.map((l) => { const ok = sudah(pKini, m, l); const k = `${m.uid}:${l.part}`; return (
                    <li key={l.part} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-[#F1F3F4] px-3 py-2" data-lampiran-inbox={ok ? 'tersimpan' : 'belum'}>
                      {!ok && bolehSimpan && belum.length > 1 ? <input type="checkbox" className="h-4 w-4 shrink-0" checked={!lepas.has(k)} onChange={() => setLepas((v) => { const n = new Set(v); n.has(k) ? n.delete(k) : n.add(k); return n })} aria-label={`Pilih ${l.nama}`} data-isi="pilih-lampiran" /> : null}
                      <Paperclip className="h-4 w-4 shrink-0 text-[#5E6380]" aria-hidden="true" />
                      <span className="min-w-0 flex-[1_1_180px] break-words text-[13.5px] font-semibold">{l.nama} <span className="font-normal text-[#5E6380]">({kb(l.ukuran)})</span></span>
                      {ok ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Sudah disimpan ke project</span>
                        : bolehSimpan ? <button type="button" onClick={() => simpan(m, l)} disabled={!p || !!sibuk} title={p ? '' : 'Tentukan project-nya dulu'} className={cx(tb, 'bg-white')} data-aksi="simpan-lampiran">{sibuk === k ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderDown className="h-4 w-4" />}{sibuk === k ? 'Menyimpan…' : 'Simpan'}</button>
                        : <span className="text-xs text-[#5E6380]">Tidak ada izin menyimpan</span>}
                    </li>) })}</ul> : <p className="text-xs text-[#5E6380]">Tanpa lampiran.</p>}
                </div>
              )}
            </div>) })}
        </div>
      )}
      {st.at && <p className="text-[11.5px] text-[#5E6380]">Terakhir dicek {waktu(st.at)}. Lampiran yang disimpan menjadi Hasil Otorisasi bila invoice itu punya satu dokumen di tahap Otorisasi; selain itu masuk File project. Menandai “sudah diotorisasi” tetap dilakukan di project-nya.</p>}
    </div>
  )
}
