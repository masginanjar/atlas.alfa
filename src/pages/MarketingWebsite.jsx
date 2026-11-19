import { useMemo, useState } from 'react'
import { Globe, Plus, Pencil, Trash2, ExternalLink, AlertTriangle, Target, CheckCircle2, Loader, PauseCircle, ShieldCheck, XCircle, Bot } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { Button, Card, Empty, Field, Input, Select, Sheet, Textarea, cx } from '../components/ui.jsx'
import { tgl } from '../lib/format.js'
import { WEBSITE, TAUTAN_WEBSITE, JENIS_KONTEN, PRIORITAS_KONTEN, STATUS_KONTEN, WARNA_STATUS_KONTEN, statusPosting, hariIniWita, kontenBaru, cekKonten, ringkasHari, STATUS_BUTUH_SETUJU, sudahDisetujui, ditolak, menungguSetuju, kontenOtomatis } from '../config/marketing.js'

// ============================================================
//  MARKETING → WEBSITE. Ide konten + status posting blog hari ini untuk tiap website.
//  Diisi MANUAL oleh tim (belum membaca blog secara otomatis) — status "Sudah Terbit" berarti tim menandainya terbit.
//  Izin (Role & Hak Akses): marketing-website.lihat / tambah / ubah / hapus — diperiksa lagi di server (RLS tabel marketing_konten).
// ============================================================
const Lencana = ({ teks }) => <span className={cx('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', WARNA_STATUS_KONTEN[teks] || WARNA_STATUS_KONTEN.Ide)}>{teks}</span>
const WARNA_PRIO = { Tinggi: 'text-rose-700', Sedang: 'text-amber-700', Rendah: 'text-ink-mute' }
const pilihCls = 'h-[34px] min-w-0 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand max-md:h-11 max-md:flex-1 max-md:text-base'
const tautCls = 'inline-flex min-h-8 items-center gap-1 rounded-lg bg-white px-2 text-[12px] font-semibold text-brand ring-1 ring-[#D9DBE7] hover:ring-brand max-md:min-h-11 max-md:px-3'
const urutPrio = (p) => PRIORITAS_KONTEN.indexOf(p) < 0 ? 9 : PRIORITAS_KONTEN.indexOf(p)

/** Naskah Markdown → tampilan baca sederhana (judul, tebal, daftar, paragraf). Tanpa HTML mentah; tabel ditampilkan apa adanya. */
function Naskah({ teks }) {
  const [, depan = '', isi = teks] = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(String(teks || '')) || []
  const tebal = (t, k) => String(t).split(/(\*\*[^*]+\*\*)/g).map((x, i) => (/^\*\*[^*]+\*\*$/.test(x) ? <b key={`${k}-${i}`}>{x.slice(2, -2)}</b> : x.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')))
  const blok = String(isi).replace(/\r/g, '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  return (
    <div className="space-y-2 text-[14px] leading-relaxed text-ink" data-naskah>
      {depan && <dl className="rounded-xl bg-slate-50 p-3 text-[12px] ring-1 ring-slate-200">{depan.split('\n').filter((l) => /^[a-zA-Z_]+:\s*\S/.test(l)).map((l, i) => { const p = l.indexOf(':'); return <div key={i} className="flex gap-2"><dt className="w-24 shrink-0 font-semibold text-ink-mute">{l.slice(0, p)}</dt><dd className="min-w-0 break-words">{l.slice(p + 1).trim().replace(/^"|"$/g, '')}</dd></div> })}</dl>}
      {blok.map((b, i) => {
        const h = /^(#{1,4})\s+(.*)$/.exec(b)
        if (h && !b.includes('\n')) return <p key={i} className={h[1].length <= 2 ? 'pt-2 text-[16px] font-extrabold' : 'pt-1 text-[14px] font-bold'}>{h[2]}</p>
        const baris = b.split('\n')
        if (baris.every((l) => /^\s*([-*]|\d+[.)])\s+/.test(l))) return <ul key={i} className="list-disc space-y-1 pl-5">{baris.map((l, j) => <li key={j}>{tebal(l.replace(/^\s*([-*]|\d+[.)])\s+/, ''), `${i}-${j}`)}</li>)}</ul>
        if (baris.some((l) => /^\s*\|.*\|\s*$/.test(l))) return <pre key={i} className="max-w-full overflow-x-auto rounded-lg bg-slate-50 p-2 text-[12px] leading-snug ring-1 ring-slate-200">{b}</pre>
        return <p key={i} className="break-words">{baris.map((l, j) => <span key={j}>{j > 0 && ' '}{tebal(l.replace(/^#{1,4}\s+/, ''), `${i}-${j}`)}</span>)}</p>
      })}
    </div>
  )
}

function Angka({ ikon: Ikon, label, nilai, warna, kode }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white p-3 ring-1 ring-slate-200" data-angka-web={kode}>
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-mute"><Ikon className={cx('h-4 w-4 shrink-0', warna)} aria-hidden="true" /><span className="truncate">{label}</span></p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums leading-none text-ink">{nilai}</p>
    </div>
  )
}

export default function MarketingWebsite() {
  const { user, data, save, remove, notify, ask } = useApp()
  const lihat = boleh(user, 'marketing-website.lihat'), bolehTambah = boleh(user, 'marketing-website.tambah'), bolehUbah = boleh(user, 'marketing-website.ubah'), bolehHapus = boleh(user, 'marketing-website.hapus')
  const bolehSetuju = boleh(user, 'marketing-website.setujui')
  const [form, setForm] = useState(null); const [galat, setGalat] = useState({}); const [sibuk, setSibuk] = useState('')
  const [periksa, setPeriksa] = useState(null); const [catatanSetuju, setCatatanSetuju] = useState(''); const [berkasKe, setBerkasKe] = useState(0)
  const [fWeb, setFWeb] = useState(''); const [fStatus, setFStatus] = useState('aktif'); const [fDari, setFDari] = useState(''); const [fSampai, setFSampai] = useState('')
  const hariIni = hariIniWita()
  const semua = data.marketing_konten || []
  const hari = useMemo(() => ringkasHari(semua, hariIni), [semua, hariIni])
  const telat = useMemo(() => semua.filter((r) => r.tanggal && r.tanggal < hariIni && !['Sudah Terbit', 'Tertunda'].includes(r.status)).length, [semua, hariIni])
  const daftar = useMemo(() => semua.filter((r) => (!fWeb || r.website === fWeb)
    && (fStatus === '' ? true : fStatus === 'aktif' ? r.status !== 'Sudah Terbit' : r.status === fStatus)
    && (!fDari || (r.tanggal && r.tanggal >= fDari)) && (!fSampai || (r.tanggal && r.tanggal <= fSampai)))
    .sort((a, b) => String(a.tanggal || '9999').localeCompare(String(b.tanggal || '9999')) || urutPrio(a.prioritas) - urutPrio(b.prioritas) || String(a.judul).localeCompare(String(b.judul))), [semua, fWeb, fStatus, fDari, fSampai])
  const antre = useMemo(() => semua.filter(menungguSetuju).sort((a, b) => String(a.tanggal || '').localeCompare(String(b.tanggal || ''))), [semua])
  const namaTim = useMemo(() => [...new Set((data.users || []).filter((u) => u.active !== false).map((u) => u.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')), [data.users])

  if (!lihat) return <Card><Empty icon={Globe} title="Tidak ada akses" text="Halaman Marketing → Website belum dibuka untuk role Anda. Minta Super Admin mengaturnya di Pengaturan → Role & Hak Akses." /></Card>

  const buka = (r) => { setGalat({}); setForm(r ? { ...r } : kontenBaru(fWeb || WEBSITE[0])) }
  const simpan = async () => {
    if (sibuk) return
    const g = cekKonten(form, semua.find((x) => x.id === form.id)); setGalat(g)
    if (Object.keys(g).length) return notify('Periksa isian yang ditandai', 'err')
    setSibuk('simpan')
    try {
      await save('marketing_konten', { ...form, judul: form.judul.trim(), kata_kunci: String(form.kata_kunci || '').trim(), link: String(form.link || '').trim(), pic: String(form.pic || '').trim(), ...(form.id ? {} : { dibuat_oleh: user?.name || '', dibuat_oleh_id: user?.id || '' }) })
      notify(form.id ? 'Konten diperbarui' : 'Ide konten ditambahkan'); setForm(null)
    } catch (e) { notify(e.message || 'Gagal menyimpan — isian tidak hilang, coba lagi', 'err') }
    finally { setSibuk('') }
  }
  /** Ganti status langsung dari daftar. Ke "Sudah Terbit" butuh link → buka form supaya link diisi. */
  const gantiStatus = async (r, status) => {
    if (status === r.status || sibuk) return
    const calon = { ...r, status }
    const g = cekKonten(calon, r)
    if (g.status) return notify(g.status, 'err')
    if (Object.keys(g).length) { setGalat(g); setForm(calon); return }
    setSibuk(r.id)
    try { await save('marketing_konten', calon); notify(`Status: ${status}`) }
    catch (e) { notify(e.message || 'Gagal mengubah status', 'err') }
    finally { setSibuk('') }
  }
  /** Keputusan penyetuju. Setuju → Siap Terbit (artikel otomatis lalu diterbitkan tugas terjadwal); Tolak → Tertunda + alasan. */
  const putuskan = async (setuju) => {
    if (sibuk || !periksa) return
    if (!setuju && !catatanSetuju.trim()) return notify('Tulis alasan penolakan supaya penulis tahu apa yang diperbaiki', 'err')
    setSibuk('putus')
    try {
      const { ...r } = periksa
      await save('marketing_konten', { ...r, status: setuju ? 'Siap Terbit' : 'Tertunda', persetujuan: { status: setuju ? 'disetujui' : 'ditolak', oleh: user?.name || '', oleh_id: user?.id || '', pada: new Date().toISOString(), catatan: catatanSetuju.trim() } })
      notify(setuju ? (kontenOtomatis(r) ? 'Disetujui — akan terbit otomatis (paling lambat ±1 jam)' : 'Disetujui — boleh diterbitkan') : 'Ditolak — konten ditunda')
      setPeriksa(null); setCatatanSetuju('')
    } catch (e) { notify(e.message || 'Gagal menyimpan keputusan — coba lagi', 'err') }
    finally { setSibuk('') }
  }
  const bukaPeriksa = (r) => { setCatatanSetuju(''); setBerkasKe(0); setPeriksa(r) }
  const TandaSetuju = ({ r }) => sudahDisetujui(r)
    ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700" title={r.persetujuan?.pada ? `Disetujui ${tgl(r.persetujuan.pada)}` : undefined}><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Disetujui {r.persetujuan?.oleh || ''}</span>
    : ditolak(r) ? <span className="inline-flex items-start gap-1 text-[11px] font-semibold text-rose-700"><XCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">Ditolak{r.persetujuan?.catatan ? `: ${r.persetujuan.catatan}` : ''}</span></span>
    : menungguSetuju(r) ? <span className="text-[11px] font-semibold text-violet-700">Menunggu persetujuan</span> : null
  const hapus = async (r) => {
    const yakin = await ask?.({ title: 'Hapus konten ini?', text: `“${r.judul}” akan dihapus dari daftar.`, ok: 'Hapus' })
    if (yakin === false) return
    try { await remove('marketing_konten', r.id); notify('Konten dihapus') } catch (e) { notify(e.message || 'Gagal menghapus', 'err') }
  }
  const PilihStatus = ({ r, posting }) => bolehUbah
    ? <select value={r.status} disabled={sibuk === r.id} onChange={(e) => gantiStatus(r, e.target.value)} aria-label={`Status ${r.judul}`} data-status-konten={r.id}
        className={cx('h-7 max-w-full cursor-pointer rounded-full border-0 py-0 pl-2 pr-6 text-[11px] font-semibold ring-1 focus:outline-none focus:ring-2 focus:ring-brand max-md:h-11 max-md:text-base', WARNA_STATUS_KONTEN[r.status])}>
        {STATUS_KONTEN.map((s) => <option key={s} value={s} disabled={STATUS_BUTUH_SETUJU.includes(s) && !sudahDisetujui(r) && s !== r.status}>{s}{STATUS_BUTUH_SETUJU.includes(s) && !sudahDisetujui(r) && s !== r.status ? ' (perlu disetujui)' : ''}</option>)}
      </select>
    : <Lencana teks={posting ? statusPosting(r.status) : r.status} />
  const Tautan = ({ r }) => r.link
    ? <a href={r.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 font-semibold text-brand hover:underline max-md:min-h-11"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Lihat artikel</a>
    : <span className="text-ink-mute">—</span>
  const Aksi = ({ r }) => (
    <span className="inline-flex shrink-0 gap-1">
      {bolehUbah && <button type="button" onClick={() => buka(r)} aria-label={`Ubah ${r.judul}`} title="Ubah" className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute hover:bg-slate-100 hover:text-brand max-md:h-11 max-md:w-11"><Pencil className="h-4 w-4" /></button>}
      {bolehHapus && <button type="button" onClick={() => hapus(r)} aria-label={`Hapus ${r.judul}`} title="Hapus" className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 max-md:h-11 max-md:w-11"><Trash2 className="h-4 w-4" /></button>}
    </span>
  )
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  return (
    <div className="min-w-0 space-y-4" data-marketing-website>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[17px] font-extrabold leading-tight tracking-tight" title="Ide konten dan status posting blog — diisi manual oleh tim">Marketing · Website</h1>
        {bolehTambah && <Button size="sm" variant="dark" onClick={() => buka(null)} data-aksi="tambah-ide-konten" className="max-md:min-h-11"><Plus className="h-4 w-4" aria-hidden="true" />Tambah Ide Konten</Button>}
      </div>

      {/* Indikator hari ini */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-ringkas-hari>
        <Angka kode="target" ikon={Target} label="Target Hari Ini" nilai={hari.target} warna="text-brand" />
        <Angka kode="terbit" ikon={CheckCircle2} label="Sudah Terbit" nilai={hari.terbit} warna="text-emerald-600" />
        <Angka kode="proses" ikon={Loader} label="Dalam Proses" nilai={hari.proses} warna="text-amber-600" />
        <Angka kode="tertunda" ikon={PauseCircle} label="Tertunda" nilai={hari.tertunda} warna="text-rose-600" />
      </div>

      {/* Menunggu persetujuan — tidak ada yang terbit sebelum disetujui di sini */}
      <Card className="overflow-hidden" data-antre-setuju>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 bg-violet-50/70 px-3 py-2">
          <h2 className="flex items-center gap-1.5 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-violet-700" aria-hidden="true" />Menunggu Persetujuan <span className="rounded-full bg-violet-700 px-1.5 text-[11px] font-bold leading-5 text-white" data-jml-antre>{antre.length}</span></h2>
          <span className="text-xs text-ink-mute">Konten baru terbit setelah disetujui di sini</span>
        </div>
        {antre.length === 0 ? <p className="px-3 py-3 text-[13px] text-ink-mute">Tidak ada konten yang menunggu persetujuan.</p> : (
          <ul className="divide-y divide-slate-100">{antre.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5" data-antre={r.id}>
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-mute">{r.website} · {r.jenis}{kontenOtomatis(r) && <span className="ml-1 inline-flex items-center gap-0.5 normal-case text-violet-700"><Bot className="h-3 w-3" aria-hidden="true" />artikel otomatis</span>}</p>
                <p className="break-words text-[14px] font-bold leading-snug text-ink">{r.judul}</p>
                <p className="text-[12px] text-ink-mute">{r.pic || 'PIC belum diisi'}{r.tanggal ? ` · rencana ${tgl(r.tanggal)}` : ''}</p>
              </div>
              <Button size="sm" variant={bolehSetuju ? 'dark' : 'outline'} onClick={() => bukaPeriksa(r)} data-aksi="periksa-konten" className="max-md:min-h-11 max-md:w-full">{bolehSetuju ? 'Periksa & putuskan' : 'Lihat naskah'}</Button>
            </li>
          ))}</ul>
        )}
      </Card>

      {/* Status posting blog hari ini — per website */}
      <Card className="overflow-hidden" data-posting-hari-ini>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2">
          <h2 className="text-sm font-bold">Status Posting Blog Hari Ini</h2>
          <span className="text-xs text-ink-mute">{tgl(hariIni)} · artikel dengan rencana terbit hari ini</span>
        </div>
        {WEBSITE.map((w) => {
          const rows = hari.hari.filter((r) => r.website === w).sort((a, b) => String(a.jam || '99').localeCompare(String(b.jam || '99')))
          return (
            <section key={w} className="border-b border-slate-100 last:border-b-0" data-posting-web={w}>
              <p className="flex flex-wrap items-center gap-1.5 px-3 pt-3 text-[13px] font-bold text-ink"><Globe className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />{w}<span className="font-semibold text-ink-mute">· {rows.length} artikel</span>
                <span className="ml-auto flex shrink-0 gap-1.5" data-tautan-web={w}>
                  {TAUTAN_WEBSITE[w]?.demo && <a href={TAUTAN_WEBSITE[w].demo} target="_blank" rel="noopener noreferrer" title="Buka demo website (tab baru)" className={tautCls}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Demo</a>}
                  {TAUTAN_WEBSITE[w]?.situs && <a href={TAUTAN_WEBSITE[w].situs} target="_blank" rel="noopener noreferrer" title="Buka website asli (tab baru)" className={tautCls}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Website</a>}
                </span></p>
              {rows.length === 0 ? <p className="px-3 pb-3 pt-1 text-[13px] text-ink-mute">Tidak ada artikel yang dijadwalkan terbit hari ini.</p> : <>
                <div className="max-md:hidden">
                  <table className="tbl-rapat w-full table-fixed border-collapse text-left">
                    <thead><tr><th style={{ width: '38%' }}>Judul Artikel</th><th style={{ width: '15%' }}>PIC</th><th style={{ width: '17%' }}>Status</th><th style={{ width: '12%' }}>Waktu Terbit</th><th style={{ width: '18%' }}>Link Artikel</th></tr></thead>
                    <tbody>{rows.map((r) => (
                      <tr key={r.id}><td className="font-semibold text-ink"><span className="line-clamp-2" title={r.judul}>{r.judul}</span></td><td className="truncate">{r.pic || '—'}</td><td>{PilihStatus({ r, posting: true })}<span className="mt-0.5 block">{TandaSetuju({ r })}</span></td><td className="tabular-nums">{r.jam || '—'}</td><td>{Tautan({ r })}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <ul className="space-y-2 p-3 md:hidden">{rows.map((r) => (
                  <li key={r.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <p className="break-words text-[15px] font-bold leading-snug text-ink">{r.judul}</p>
                    <p className="mt-0.5 text-[13px] text-ink-mute">{r.pic || 'PIC belum diisi'} · {r.jam ? `terbit ${r.jam}` : 'jam belum diisi'}</p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">{PilihStatus({ r, posting: true })}{Tautan({ r })}</div>
                    <div className="mt-1">{TandaSetuju({ r })}</div>
                  </li>
                ))}</ul>
              </>}
            </section>
          )
        })}
      </Card>

      {telat > 0 && (
        <p data-konten-telat className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900 ring-1 ring-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span><b>{telat} artikel sudah lewat tanggal rencana</b> tapi belum terbit. Perbarui tanggal atau statusnya di daftar di bawah.</span>
        </p>
      )}

      {/* Ide konten */}
      <Card className="overflow-hidden" data-ide-konten>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2">
          <h2 className="mr-1 text-sm font-bold">Ide Konten</h2>
          <select value={fWeb} onChange={(e) => setFWeb(e.target.value)} aria-label="Filter website" className={pilihCls} data-filter="website"><option value="">Semua website</option>{WEBSITE.map((w) => <option key={w}>{w}</option>)}</select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filter status" className={pilihCls} data-filter="status"><option value="aktif">Belum terbit</option><option value="">Semua status</option>{STATUS_KONTEN.map((s) => <option key={s}>{s}</option>)}</select>
          <label className="flex min-w-0 items-center gap-1 text-[12px] font-semibold text-ink-mute max-md:w-full">Terbit dari<input type="date" value={fDari} onChange={(e) => setFDari(e.target.value)} aria-label="Rencana terbit dari tanggal" className={cx(pilihCls, 'font-normal')} data-filter="dari" /></label>
          <label className="flex min-w-0 items-center gap-1 text-[12px] font-semibold text-ink-mute max-md:w-full">sampai<input type="date" value={fSampai} onChange={(e) => setFSampai(e.target.value)} aria-label="Rencana terbit sampai tanggal" className={cx(pilihCls, 'font-normal')} data-filter="sampai" /></label>
          <span className="ml-auto shrink-0 text-xs font-semibold text-ink-mute" data-jml-konten>{daftar.length} konten</span>
        </div>
        {daftar.length === 0 ? (
          <Empty icon={Globe} title={semua.length ? 'Tidak ada yang cocok dengan filter' : 'Belum ada ide konten'} text={semua.length ? 'Ubah filter website, status, atau tanggal.' : bolehTambah ? 'Tekan “Tambah Ide Konten” untuk mencatat ide artikel pertama.' : 'Belum ada ide artikel yang dicatat.'} />
        ) : <>
          <div className="min-w-0 max-w-full overflow-x-auto max-md:hidden">
            <table className="tbl-rapat w-full min-w-[980px] table-fixed border-collapse text-left">
              <thead><tr><th style={{ width: '13%' }}>Website</th><th style={{ width: '25%' }}>Judul / Topik</th><th style={{ width: '14%' }}>Kata Kunci</th><th style={{ width: '9%' }}>Jenis</th><th style={{ width: '8%' }}>Prioritas</th><th style={{ width: '10%' }}>Rencana Terbit</th><th style={{ width: '9%' }}>PIC</th><th style={{ width: '12%' }}>Status</th>{(bolehUbah || bolehHapus) && <th style={{ width: '84px' }}>Aksi</th>}</tr></thead>
              <tbody>{daftar.map((r) => (
                <tr key={r.id} data-konten={r.id}>
                  <td className="truncate">{r.website}</td>
                  <td className="font-semibold text-ink"><span className="line-clamp-2" title={r.judul}>{r.judul}</span></td>
                  <td><span className="line-clamp-2 text-[12px]" title={r.kata_kunci}>{r.kata_kunci || '—'}</span></td>
                  <td className="truncate">{r.jenis || '—'}</td>
                  <td className={cx('font-semibold', WARNA_PRIO[r.prioritas])}>{r.prioritas || '—'}</td>
                  <td className={cx('tabular-nums', r.tanggal && r.tanggal < hariIni && !['Sudah Terbit', 'Tertunda'].includes(r.status) && 'font-semibold text-rose-700')}>{r.tanggal ? tgl(r.tanggal) : '—'}</td>
                  <td className="truncate">{r.pic || '—'}</td>
                  <td>{PilihStatus({ r })}<span className="mt-0.5 block">{TandaSetuju({ r })}</span></td>
                  {(bolehUbah || bolehHapus) && <td>{Aksi({ r })}</td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <ul className="space-y-2 p-3 md:hidden" data-konten-kartu>{daftar.map((r) => (
            <li key={r.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200" data-konten={r.id}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-mute">{r.website} · {r.jenis}</p>
                  <p className="break-words text-[15px] font-bold leading-snug text-ink">{r.judul}</p>
                </div>
                {Aksi({ r })}
              </div>
              {r.kata_kunci && <p className="mt-1 break-words text-[13px] text-ink-soft">Kata kunci: {r.kata_kunci}</p>}
              <p className="mt-1 text-[13px] text-ink-mute"><span className={cx('font-semibold', WARNA_PRIO[r.prioritas])}>Prioritas {r.prioritas || '—'}</span> · {r.tanggal ? `terbit ${tgl(r.tanggal)}` : 'tanggal belum diisi'} · {r.pic || 'PIC belum diisi'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">{PilihStatus({ r })}{TandaSetuju({ r })}</div>
            </li>
          ))}</ul>
        </>}
      </Card>

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Ubah Konten' : 'Tambah Ide Konten'} subtitle="Satu catatan per artikel — statusnya berjalan dari ide sampai terbit"
        footer={<>
          <Button variant="outline" className="flex-1 sm:flex-none sm:px-6" onClick={() => setForm(null)}>Batal</Button>
          <Button className="flex-[2]" variant="dark" loading={sibuk === 'simpan'} disabled={sibuk === 'simpan'} onClick={simpan} data-aksi="simpan-konten">Simpan</Button>
        </>}>
        {form && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Website" required error={galat.website}>
                <Select value={form.website} onChange={(e) => set({ website: e.target.value })} aria-label="Website">{WEBSITE.map((w) => <option key={w}>{w}</option>)}</Select>
              </Field>
              <Field label="Jenis Konten">
                <Select value={form.jenis} onChange={(e) => set({ jenis: e.target.value })} aria-label="Jenis konten">{JENIS_KONTEN.map((j) => <option key={j}>{j}</option>)}</Select>
              </Field>
            </div>
            <Field label="Judul / Topik Artikel" required error={galat.judul}>
              <Input value={form.judul} onChange={(e) => set({ judul: e.target.value })} placeholder="mis. Cara menerjemahkan ijazah untuk kuliah di luar negeri" aria-label="Judul artikel" aria-invalid={!!galat.judul} data-isian="judul" />
            </Field>
            <Field label="Kata Kunci Utama">
              <Input value={form.kata_kunci} onChange={(e) => set({ kata_kunci: e.target.value })} placeholder="mis. penerjemah tersumpah ijazah" aria-label="Kata kunci utama" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Prioritas">
                <Select value={form.prioritas} onChange={(e) => set({ prioritas: e.target.value })} aria-label="Prioritas">{PRIORITAS_KONTEN.map((p) => <option key={p}>{p}</option>)}</Select>
              </Field>
              <Field label="PIC Penulis">
                <Input list="daftar-pic-konten" value={form.pic} onChange={(e) => set({ pic: e.target.value })} placeholder="nama penulis" aria-label="PIC penulis" />
                <datalist id="daftar-pic-konten">{namaTim.map((n) => <option key={n} value={n} />)}</datalist>
              </Field>
              <Field label="Tanggal Rencana Terbit" error={galat.tanggal}>
                <Input type="date" value={form.tanggal || ''} onChange={(e) => set({ tanggal: e.target.value })} aria-label="Tanggal rencana terbit" aria-invalid={!!galat.tanggal} data-isian="tanggal" />
              </Field>
              <Field label="Waktu Terbit">
                <Input type="time" value={form.jam || ''} onChange={(e) => set({ jam: e.target.value })} aria-label="Waktu terbit" />
              </Field>
            </div>
            <Field label="Status" error={galat.status} hint="Siap Terbit, Terjadwal, dan Sudah Terbit hanya untuk konten yang sudah disetujui">
              <Select value={form.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status konten" data-isian="status">{STATUS_KONTEN.map((s) => <option key={s}>{s}</option>)}</Select>
            </Field>
            <Field label="Link Artikel" hint="Diisi setelah artikel terbit" error={galat.link}>
              <Input type="url" inputMode="url" value={form.link || ''} onChange={(e) => set({ link: e.target.value })} placeholder="https://…" aria-label="Link artikel" aria-invalid={!!galat.link} data-isian="link" />
            </Field>
            <Field label="Catatan">
              <Textarea rows={3} value={form.catatan || ''} onChange={(e) => set({ catatan: e.target.value })} placeholder="sudut bahasan, referensi, alasan tertunda…" aria-label="Catatan konten" />
            </Field>
          </div>
        )}
      </Sheet>

      <Sheet open={!!periksa} onClose={() => setPeriksa(null)} title="Periksa Konten" subtitle={periksa ? `${periksa.website} · ${periksa.jenis}` : ''}
        footer={bolehSetuju && periksa && !sudahDisetujui(periksa) ? <>
          <Button variant="outline" className="flex-1" loading={sibuk === 'putus'} disabled={!!sibuk} onClick={() => putuskan(false)} data-aksi="tolak-konten">Tolak</Button>
          <Button variant="dark" className="flex-[2]" loading={sibuk === 'putus'} disabled={!!sibuk} onClick={() => putuskan(true)} data-aksi="setujui-konten">Setujui untuk terbit</Button>
        </> : <Button variant="outline" className="flex-1" onClick={() => setPeriksa(null)}>Tutup</Button>}>
        {periksa && (
          <div className="space-y-3" data-periksa={periksa.id}>
            <div>
              <p className="break-words text-[16px] font-extrabold leading-snug text-ink">{periksa.judul}</p>
              <p className="text-[12px] text-ink-mute">{periksa.pic || 'PIC belum diisi'}{periksa.tanggal ? ` · rencana terbit ${tgl(periksa.tanggal)}` : ''}{periksa.kata_kunci ? ` · kata kunci: ${periksa.kata_kunci}` : ''}</p>
              {periksa.catatan && <p className="mt-1 break-words rounded-lg bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900 ring-1 ring-amber-200">{periksa.catatan}</p>}
            </div>
            {(periksa.berkas || []).length > 0 ? <>
              {periksa.berkas.length > 1 && <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Berkas naskah">{periksa.berkas.map((b, i) => (
                <button key={b.path} type="button" role="tab" aria-selected={i === berkasKe} onClick={() => setBerkasKe(i)} className={cx('min-h-9 rounded-lg px-2.5 text-[12px] font-semibold ring-1 max-md:min-h-11', i === berkasKe ? 'bg-[#141B34] text-white ring-[#141B34]' : 'bg-white text-ink ring-slate-200')}>{String(b.path).split('/').slice(-1)[0]}</button>
              ))}</div>}
              <p className="break-all text-[11px] text-ink-mute">{periksa.berkas[berkasKe]?.path}</p>
              {/\.md$/i.test(periksa.berkas[berkasKe]?.path || '') ? <Naskah teks={periksa.berkas[berkasKe]?.isi} /> : <pre className="max-w-full overflow-x-auto rounded-lg bg-slate-50 p-2 text-[12px] ring-1 ring-slate-200">{periksa.berkas[berkasKe]?.isi}</pre>}
            </> : <p className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-ink-mute ring-1 ring-slate-200">Naskah tidak disimpan di ATLAS (konten ditulis manual). Periksa naskahnya dari penulis sebelum menyetujui.</p>}
            {bolehSetuju && !sudahDisetujui(periksa) && (
              <Field label="Catatan untuk penulis" hint="Wajib diisi bila ditolak">
                <Textarea rows={2} value={catatanSetuju} onChange={(e) => setCatatanSetuju(e.target.value)} placeholder="mis. judul terlalu panjang, sumber kurang jelas…" aria-label="Catatan persetujuan" data-isian="catatan-setuju" />
              </Field>
            )}
            {kontenOtomatis(periksa) && <p className="text-[12px] text-ink-mute">Setelah disetujui, artikel ini diterbitkan otomatis ke website (paling lambat sekitar 1 jam), lalu statusnya berubah menjadi Sudah Terbit.</p>}
          </div>
        )}
      </Sheet>
    </div>
  )
}
