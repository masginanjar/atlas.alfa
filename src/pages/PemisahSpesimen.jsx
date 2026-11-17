// ============================================================
//  ALAT → PEMISAH DATA & SPESIMEN PEJABAT
//  Upload → Ekstraksi (AI Gemini di server, hanya di ATLAS live) → Pemeriksaan → Unduh Word.
//  • Data sesi ini hanya ada di perangkat (tidak disimpan ke server); dokumen dikirim ke server AI hanya saat dibaca.
//  • Potongan spesimen = bagian gambar asli. Tidak ada yang digambar ulang / dilengkapi / digandakan.
//  • Demo: AI tidak tersedia → semua diisi & dipotong manual (dijelaskan di layar, bukan simulasi).
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Upload, FileText, Image as ImageIcon, AlertTriangle, Check, Trash2, RotateCw, Crop, Search, Plus, Download, ArrowUp, ArrowDown, Loader2, X, ExternalLink, Eye, Eraser, Undo2, History } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { cx } from '../components/ui.jsx'
import { AI_LIVE, aiSpesimen, aiCariAlamat } from '../lib/ai.js'
import { RIWAYAT_LIVE, riwayatSimpan, riwayatDaftar, riwayatBerkas, riwayatHapus } from '../lib/spesimenRiwayat.js'

const CATUR = { backgroundImage: 'linear-gradient(45deg,#E4E6EF 25%,transparent 25%,transparent 75%,#E4E6EF 75%),linear-gradient(45deg,#E4E6EF 25%,transparent 25%,transparent 75%,#E4E6EF 75%)', backgroundSize: '12px 12px', backgroundPosition: '0 0,6px 6px' }
import { JENIS_SPESIMEN, JENIS_NOMOR, STATUS_PNS, idBaru, bacaBerkas, potongGambar, pejabatDariAi, pejabatKosong, saranGabung, kekurangan, statusPejabat, barisNomor, buatDocx, buatCatatanDocx, unduhBlob, namaBerkas, tumpang, hapusLatar, TINGKAT_LATAR } from '../lib/spesimen.js'

const ST = { belum: ['Belum diperiksa', 'bg-slate-100 text-slate-700'], kurang: ['Perlu dilengkapi', 'bg-orange-100 text-orange-900'], sudah: ['Sudah diperiksa', 'bg-emerald-100 text-emerald-800'] }
const Pil = ({ k }) => <span className={cx('inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-bold', ST[k][1])}>{k === 'sudah' && <Check className="h-3 w-3" aria-hidden="true" />}{k === 'kurang' && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}{ST[k][0]}</span>
const tb = 'inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50'
const tbUtama = cx(tb, 'bg-[#141B34] text-white hover:opacity-90')
const tbGaris = cx(tb, 'border border-[#D9DBE7] bg-white text-[#141B34] hover:border-[#B9BDD0]')
const tbKecil = 'inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D9DBE7] bg-white px-2.5 text-xs font-semibold text-[#141B34] hover:border-[#B9BDD0] max-md:min-h-11 disabled:opacity-50'
const inputCls = 'block min-h-10 w-full min-w-0 rounded-[10px] border border-[#D9DBE7] bg-white px-2.5 text-sm text-[#141B34] focus:border-[#4169E1] focus:outline-none focus:ring-2 focus:ring-[#4169E1]/30 max-md:min-h-11 max-md:text-base'
const Kartu = ({ judul, kanan, children, className }) => (
  <section className={cx('flex flex-col gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-[#E7E8F0] sm:p-4', className)}>
    {(judul || kanan) && <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xs font-bold uppercase tracking-wider text-[#5E6380]">{judul}</h2>{kanan}</div>}
    {children}
  </section>
)
function Isian({ label, value, onChange, ket, tanda, disabled, className, ...p }) {
  const id = useRef(idBaru('f')).current
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-semibold text-[#5E6380]">{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} {...p} className={cx(inputCls, tanda && '!border-orange-400 !bg-orange-50', disabled && '!bg-[#F3F4F9] text-[#6B7090]')} />
      {ket && <span className={cx('text-[11.5px]', tanda ? 'text-orange-800' : 'text-[#5E6380]')}>{ket}</span>}
    </div>
  )
}

/** Alat potong: pilih area di gambar asli (tarik), putar hasil, perbesar tampilan, tentukan jenis. */
function AlatPotong({ halaman, awal, onSimpan, onClose }) {
  const [kotak, setKotak] = useState(awal?.kotak || null)
  const [rot, setRot] = useState(awal?.rot || 0)
  const [jenis, setJenis] = useState(awal?.jenis || 'ttd')
  const [zoom, setZoom] = useState(1)
  const [hasil, setHasil] = useState(null)
  const [sibuk, setSibuk] = useState(false)
  const ref = useRef(null); const tarik = useRef(null)
  useEffect(() => { const esc = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', esc); document.body.style.overflow = 'hidden'; return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = '' } }, [onClose])
  useEffect(() => { let hidup = true; if (!kotak) { setHasil(null); return undefined } potongGambar(halaman.url, kotak, rot).then((h) => hidup && setHasil(h)).catch(() => hidup && setHasil(null)); return () => { hidup = false } }, [kotak, rot, halaman.url])
  const titik = (e) => { const r = ref.current.getBoundingClientRect(); return { x: Math.max(0, Math.min(halaman.w, ((e.clientX - r.left) / r.width) * halaman.w)), y: Math.max(0, Math.min(halaman.h, ((e.clientY - r.top) / r.height) * halaman.h)) } }
  const mulai = (e) => { e.preventDefault(); ref.current.setPointerCapture?.(e.pointerId); const p = titik(e); tarik.current = p; setKotak({ x: p.x, y: p.y, w: 1, h: 1 }) }
  const gerak = (e) => { if (!tarik.current) return; const p = titik(e), a = tarik.current; setKotak({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) }) }
  const lepas = () => { tarik.current = null; setKotak((k) => (k && (k.w < 8 || k.h < 8) ? null : k)) }
  const simpan = async () => { if (!kotak || sibuk) return; setSibuk(true); try { const h = await potongGambar(halaman.url, kotak, rot); onSimpan({ jenis, kotak, rot, ...h }) } finally { setSibuk(false) } }
  const pc = (v, total) => `${(v / total) * 100}%`
  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-stretch justify-center bg-[#141B34]/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Perbaiki potongan spesimen" data-alat-potong>
      <div className="flex max-h-[100dvh] w-full max-w-[1000px] flex-col overflow-hidden bg-white sm:max-h-[92dvh] sm:rounded-2xl">
        <header className="flex items-center gap-3 border-b border-[#E7E8F0] px-4 py-3">
          <div className="min-w-0 flex-1"><h2 className="text-base font-extrabold">Potong spesimen dari gambar asli</h2><p className="truncate text-xs text-[#5E6380]">{halaman.fileName} · halaman {halaman.no}</p></div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="grid h-11 w-11 place-items-center rounded-xl text-[#5E6380] hover:bg-[#F3F4F9]"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <div className="flex min-w-0 shrink-0 flex-col gap-2 bg-[#F3F4F9] p-3 md:min-h-0 md:flex-1 md:shrink">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#5E6380]"><span className="font-semibold">Tarik pada gambar untuk memilih area.</span>
              <label className="ml-auto flex items-center gap-2">Perbesar<input type="range" min="1" max="4" step="0.25" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Perbesar tampilan" className="w-28" /><span className="w-10 tabular-nums">{Math.round(zoom * 100)}%</span></label>
            </div>
            <div className="h-[42dvh] overflow-auto rounded-xl border border-[#D9DBE7] bg-white md:h-auto md:min-h-[240px] md:flex-1">
              <div ref={ref} onPointerDown={mulai} onPointerMove={gerak} onPointerUp={lepas} onPointerCancel={lepas} className="relative cursor-crosshair touch-none select-none" style={{ width: `${zoom * 100}%` }} data-area-potong>
                <img src={halaman.url} alt={`Halaman ${halaman.no} dari ${halaman.fileName}`} draggable={false} className="block w-full" />
                {kotak && <div className="pointer-events-none absolute border-2 border-[#3457D5] bg-[#3457D5]/10" style={{ left: pc(kotak.x, halaman.w), top: pc(kotak.y, halaman.h), width: pc(kotak.w, halaman.w), height: pc(kotak.h, halaman.h) }} />}
              </div>
            </div>
          </div>
          <aside className="flex w-full shrink-0 flex-col gap-3 border-t border-[#E7E8F0] p-3 md:w-[300px] md:overflow-y-auto md:border-l md:border-t-0">
            <fieldset className="flex flex-col gap-1.5"><legend className="mb-1 text-xs font-bold uppercase tracking-wider text-[#5E6380]">Jenis potongan</legend>
              {Object.entries(JENIS_SPESIMEN).map(([k, l]) => <label key={k} className={cx('flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-sm font-semibold', jenis === k ? 'border-[#3457D5] bg-[#F3F6FF]' : 'border-[#E7E8F0]')}><input type="radio" name="jenis-potong" checked={jenis === k} onChange={() => setJenis(k)} className="h-4 w-4" />{l}</label>)}
            </fieldset>
            <div className="flex flex-col gap-1.5"><span className="text-xs font-bold uppercase tracking-wider text-[#5E6380]">Hasil potongan</span>
              <div className="grid min-h-[110px] place-items-center rounded-xl border border-dashed border-[#C9CEE6] bg-[#FAFBFE] p-2">{hasil ? <img src={hasil.url} alt="Pratinjau potongan" className="max-h-40 max-w-full object-contain" /> : <span className="text-xs text-[#5E6380]">Belum ada area dipilih</span>}</div>
              <span className="text-[11.5px] text-[#5E6380]">Diambil dari gambar asli · proporsi dipertahankan · tidak digambar ulang.</span>
            </div>
            <button type="button" onClick={() => setRot((r) => (r + 90) % 360)} className={tbGaris}><RotateCw className="h-4 w-4" />Putar 90°</button>
            <div className="mt-auto flex flex-col gap-2"><button type="button" onClick={simpan} disabled={!kotak || sibuk} className={tbUtama} data-aksi="simpan-potongan">{sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Simpan potongan</button><button type="button" onClick={onClose} className={tbGaris}>Batal</button></div>
          </aside>
        </div>
      </div>
    </div>, document.body)
}

/** Pratinjau satu formulir (tata letak mengikuti PDF acuan). */
function Formulir({ p }) {
  const pakai = (j) => p.spesimen.filter((s) => s.jenis === j && s.pakai)
  const ttd = pakai('ttd').slice(0, 2), prf = pakai('paraf').slice(0, 2), cap = pakai('stempel')[0]
  const data = [['Nama Pejabat', p.nama.trim() || '-'], ...barisNomor(p), ['Jabatan', p.jabatan.trim() || '-'], ['Alamat Instansi', [p.instansi.trim(), p.alamat.trim()].filter(Boolean).join(' — ') || '-']]
  const kosong = (t) => <span className="text-center text-[10.5px] italic text-[#666]">{t}</span>
  const gbr = (s, kelas) => <img src={s.urlBersih || s.url} alt={JENIS_SPESIMEN[s.jenis]} className={cx('max-w-full object-contain', kelas)} />
  const baris = (label, ket, isi) => <div className="flex border-t border-black"><div className="flex w-[21%] shrink-0 flex-col justify-between p-2 text-[11px]"><span>{label}</span>{ket && <span className="text-[9.5px]">{ket}</span>}</div>{isi}</div>
  const selK = (isi, k) => <div key={k} className="grid min-h-[112px] flex-1 place-items-center border-l border-black p-2">{isi}</div>
  return (
    <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-[560px] flex-col gap-2 overflow-hidden border sm:aspect-[210/297] border-[#D9DBE7] bg-white px-[7%] py-[6%] text-[#111] shadow-lg" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }} data-pratinjau-formulir>
      <strong className="text-center text-[11px]">LAMPIRAN FORMULIR 01</strong>
      <p className="text-[10.5px] font-bold leading-snug">Kepada: Direktur Jenderal Administrasi Hukum Umum Kementerian Hukum, d/a. Jl. H.R. Rasuna Said Kav 6-7 Kuningan Jakarta 12940</p>
      <strong className="mt-1 text-center text-[11.5px]">Perihal : PENYAMPAIAN SPESIMEN TANDA TANGAN</strong>
      <p className="text-[10.5px]">Dengan ini menyampaikan spesimen (contoh tanda tangan) dan cap pejabat sebagai berikut.</p>
      <div className="flex flex-col gap-1 px-2">{data.map(([l, v]) => <div key={l} className="flex gap-1.5 text-[11px] leading-snug"><span className="w-24 shrink-0">{l}</span><span>:</span><span className="min-w-0 flex-1 break-words border-b border-dotted border-[#6B7090]">{v}</span></div>)}</div>
      <div className="mt-1 flex flex-col border border-t-0 border-black">
        {baris('Tanda Tangan', '*mohon bubuhkan 2 tanda tangan', [0, 1].map((i) => selK(ttd[i] ? gbr(ttd[i], 'max-h-[84px]') : kosong('Tanda tangan tidak tersedia'), i)))}
        {baris('Paraf', '*mohon bubuhkan 2 paraf', [0, 1].map((i) => selK(prf[i] ? gbr(prf[i], 'max-h-[76px]') : kosong('Paraf tidak tersedia'), i)))}
        {baris('Cap/Stempel', '', <div className="grid min-h-[124px] flex-[2] place-items-center border-l border-black p-2">{cap ? gbr(cap, 'max-h-[110px]') : kosong('Stempel tidak tersedia')}</div>)}
      </div>
      <p className="text-[10.5px]">Demikian Disampaikan dengan sebenar-benarnya.</p>
    </div>
  )
}

export default function PemisahSpesimen() {
  const { user, notify, ask } = useApp()
  const [files, setFiles] = useState([])       // { id, name, jenis, status: antre|baca|ai|ok|gagal, ket, pct, halIds }
  const [hal, setHal] = useState({})            // id → halaman
  const [list, setList] = useState([])          // pejabat berurutan
  const [aktif, setAktif] = useState(null)
  const [langkah, setLangkah] = useState('upload')
  const [potong, setPotong] = useState(null)    // { pageId, pid, sid? }
  const [lihatHal, setLihatHal] = useState(null)
  const [abaikanGabung, setAbaikanGabung] = useState([])
  const [cari, setCari] = useState({})          // pid → { sibuk, hasil, galat }
  const [sibukUnduh, setSibukUnduh] = useState('')
  const [pratinjau, setPratinjau] = useState(0)
  const [sibukLatar, setSibukLatar] = useState('')
  const [riwayat, setRiwayat] = useState({ muat: false, data: null, galat: '', sibuk: '' })
  const inputRef = useRef(null); const antre = useRef(Promise.resolve())
  const izin = boleh(user, 'pemisah-spesimen.lihat'); const kelola = boleh(user, 'pemisah-spesimen.kelola')
  useEffect(() => { if (langkah === 'riwayat' && izin && !riwayat.data && !riwayat.muat && !riwayat.galat) muatRiwayat() }, [langkah, riwayat.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const ubahFile = (id, patch) => setFiles((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const ubah = (pid, patch) => setList((l) => l.map((p) => (p.id === pid ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch), ...(patch.diperiksa === undefined && typeof patch !== 'function' ? { diperiksa: false } : {}) } : p)))
  const p = list.find((x) => x.id === aktif) || list[0] || null
  const halAktif = lihatHal && hal[lihatHal] ? hal[lihatHal] : p?.sumber?.[0]?.pageId && hal[p.sumber[0].pageId] ? hal[p.sumber[0].pageId] : Object.values(hal)[0] || null

  async function prosesFile(file, rec) {
    try {
      ubahFile(rec.id, { status: 'baca', ket: 'Membuka file…', pct: 10 })
      const pages = await bacaBerkas(file, (k) => ubahFile(rec.id, { pct: 10 + Math.round(k * 40) }))
      setHal((h) => ({ ...h, ...Object.fromEntries(pages.map((x) => [x.id, x])) }))
      ubahFile(rec.id, { halIds: pages.map((x) => x.id), jmlHal: pages.length, pct: 50, ...(pages.terpotong ? { ket: `Hanya 40 dari ${pages.terpotong} halaman yang dibuka` } : {}) })
      if (!AI_LIVE) { ubahFile(rec.id, { status: 'ok', pct: 100, ket: `${pages.length} halaman siap · AI hanya berjalan di ATLAS live — di demo, data pejabat diisi dan spesimen dipotong manual` }); return }
      let ketemu = 0; const gagalAi = []
      for (let i = 0; i < pages.length; i++) {
        const h = pages[i]
        ubahFile(rec.id, { status: 'ai', ket: `Membaca halaman ${i + 1} dari ${pages.length}`, pct: 50 + Math.round((i / pages.length) * 50) })
        const r = await aiSpesimen(h.url)
        if (!r.ok) { gagalAi.push(`hal. ${h.no}: ${r.alasan || 'gagal dibaca'}`); if (r.habis || r.mati) break; continue }
        for (const hasil of pejabatDariAi(r.data, h)) {
          const sp = []
          for (const j of ['ttd', 'paraf', 'stempel']) for (const k of hasil.kotak[j]) {
            const lawan = j === 'ttd' ? hasil.kotak.stempel : j === 'stempel' ? hasil.kotak.ttd : []
            const tumpuk = hasil.bertumpuk || lawan.some((o) => tumpang(k, o))
            try { const g = await potongGambar(h.url, k, 0); sp.push({ id: idBaru('s'), jenis: j, pageId: h.id, fileName: h.fileName, no: h.no, kotak: k, rot: 0, ...g, pakai: true, asal: 'ai', bertumpuk: tumpuk && j !== 'paraf', tinjau: true }) } catch { /* potongan gagal → dilewati, bisa dipotong manual */ }
          }
          ketemu += 1
          setList((l) => [...l, { ...hasil.p, spesimen: sp }])
        }
      }
      ubahFile(rec.id, gagalAi.length && !ketemu
        ? { status: 'gagal', pct: 100, ket: `Halaman terbuka, tetapi AI gagal membaca (${gagalAi[0]}). Data bisa diisi manual.` }
        : { status: 'ok', pct: 100, ket: `${ketemu} pejabat ditemukan${gagalAi.length ? ` · ${gagalAi.length} halaman gagal dibaca AI` : ''}${ketemu ? '' : ' — tambah pejabat manual bila perlu'}` })
    } catch (e) { ubahFile(rec.id, { status: 'gagal', pct: 100, ket: `${e?.message || 'File tidak bisa dibuka'}. File lain tetap diproses.` }) }
  }
  const tambahFile = (fl) => {
    const baru = [...fl].slice(0, 30).map((f) => ({ file: f, rec: { id: idBaru('f'), name: f.name, jenis: (f.name.split('.').pop() || '').toUpperCase(), status: 'antre', ket: 'Menunggu giliran', pct: 0, halIds: [] } }))
    if (!baru.length) return
    setFiles((f) => [...f, ...baru.map((b) => b.rec)])
    for (const b of baru) antre.current = antre.current.then(() => prosesFile(b.file, b.rec)) // satu per satu; gagal satu tidak membatalkan yang lain
  }
  const hapusFile = async (f) => {
    if (list.some((x) => x.spesimen.some((s) => f.halIds.includes(s.pageId))) && !(await ask(`Hapus ${f.name}? Spesimen yang dipotong dari file ini ikut terhapus.`))) return
    setList((l) => l.map((x) => ({ ...x, spesimen: x.spesimen.filter((s) => !f.halIds.includes(s.pageId)), sumber: x.sumber.filter((s) => !f.halIds.includes(s.pageId)) })))
    setHal((h) => Object.fromEntries(Object.entries(h).filter(([k]) => !f.halIds.includes(k)))); setFiles((l) => l.filter((x) => x.id !== f.id))
  }

  const tambahPejabat = () => { const n = pejabatKosong(); setList((l) => [...l, n]); setAktif(n.id); setLangkah('periksa') }
  const hapusPejabat = async (x) => { if (!(await ask(`Hapus ${x.nama.trim() || 'pejabat ini'} beserta potongan spesimennya?`))) return; setList((l) => l.filter((y) => y.id !== x.id)); if (aktif === x.id) setAktif(null) }
  const geser = (i, d) => setList((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l;[n[i], n[j]] = [n[j], n[i]]; return n })
  const gabung = (a, b) => { setList((l) => { const A = l.find((x) => x.id === a), B = l.find((x) => x.id === b); if (!A || !B) return l; const isi = (k) => A[k] || B[k]; return l.filter((x) => x.id !== b).map((x) => (x.id === a ? { ...A, jabatan: isi('jabatan'), instansi: isi('instansi'), lokasi: isi('lokasi'), alamat: isi('alamat'), nip: isi('nip'), nomor_lain: isi('nomor_lain'), jenis_lain: isi('jenis_lain'), sumber: [...A.sumber, ...B.sumber], spesimen: [...A.spesimen, ...B.spesimen], ragu: [...new Set([...A.ragu, ...B.ragu])], diperiksa: false } : x)) }); notify('Digabung — periksa lagi datanya') }
  const saran = useMemo(() => saranGabung(list).filter(([a, b]) => !abaikanGabung.includes(`${a}|${b}`)), [list, abaikanGabung])

  const simpanPotongan = (h) => {
    const { pageId, pid, sid } = potong; const pg = hal[pageId]; const idSp = sid || idBaru('s')
    const lama = sid ? list.find((x) => x.id === pid)?.spesimen.find((y) => y.id === sid) : null
    setList((l) => l.map((x) => { if (x.id !== pid) return x
      const lain = x.spesimen.filter((s) => s.id !== sid && s.pageId === pageId && s.jenis !== h.jenis && s.jenis !== 'paraf' && h.jenis !== 'paraf')
      const tumpuk = lain.some((s) => tumpang(s.kotak, h.kotak))
      const baru = { id: idSp, pageId, fileName: pg.fileName, no: pg.no, pakai: true, asal: 'manual', bertumpuk: tumpuk, tinjau: tumpuk, ...h, urlBersih: null, latar: '' }
      const kena = new Set(lain.filter((s) => tumpang(s.kotak, h.kotak)).map((s) => s.id)) // pasangan yang ditimpa ikut ditandai
      const tandai = (arr) => arr.map((s) => (kena.has(s.id) ? { ...s, bertumpuk: true, tinjau: true } : s))
      return { ...x, diperiksa: false, spesimen: tandai(sid ? x.spesimen.map((s) => (s.id === sid ? { ...s, ...baru, pakai: s.pakai } : s)) : [...x.spesimen, baru]), sumber: x.sumber.some((s) => s.pageId === pageId) ? x.sumber : [...x.sumber, { fileName: pg.fileName, no: pg.no, pageId }] }
    }))
    setPotong(null)
    if (lama?.latar) terapLatar(pid, idSp, lama.latar, h.url) // potongan diperbaiki → latar dihapus ulang dari potongan baru
  }
  // Hapus latar: kertas dijadikan transparan di perangkat ini (bukan AI, tidak menggambar ulang). Potongan asli tetap disimpan.
  const terapLatar = async (pid, sid, tingkat, url) => {
    setSibukLatar(sid)
    try {
      const r = await hapusLatar(url, tingkat)
      if (r.kosong) { notify('Hasilnya kosong — goresan terlalu tipis. Coba tingkat “Halus” atau pakai potongan asli.', 'err'); return false }
      ubahSp(pid, sid, { urlBersih: r.url, latar: tingkat }); return true
    } catch { notify('Gagal menghapus latar gambar ini', 'err'); return false } finally { setSibukLatar('') }
  }
  const latarSemua = async (x) => { let n = 0; for (const s of x.spesimen) if (!s.latar && await terapLatar(x.id, s.id, 'sedang', s.url)) n += 1; notify(n ? `Latar ${n} potongan dihapus — periksa hasilnya` : 'Tidak ada potongan yang perlu diproses') }
  const ubahSp = (pid, sid, patch) => ubah(pid, (x) => ({ spesimen: x.spesimen.map((s) => (s.id === sid ? { ...s, ...patch } : s)), diperiksa: false }))

  const cariAlamat = async (x) => {
    if (!x.instansi.trim()) return notify('Isi nama instansi dulu', 'err')
    setCari((c) => ({ ...c, [x.id]: { sibuk: true } }))
    const r = await aiCariAlamat(x.instansi, x.lokasi)
    setCari((c) => ({ ...c, [x.id]: r.ok ? { hasil: r.data } : { galat: r.alasan || 'Pencarian gagal' } }))
  }
  const pakaiAlamat = (x, pil, data) => { ubah(x.id, { alamat: pil.alamat, alamat_ok: true, alamat_asal: 'cari', alamat_sumber: data.sumber || [], alamat_dicari_at: data.dicari_at }); setCari((c) => ({ ...c, [x.id]: null })); notify('Alamat dipakai & dikonfirmasi') }

  const unduh = async (daftar, nama, kunci) => {
    const kur = daftar.map((x) => [x, kekurangan(x)]).filter(([, k]) => k.length)
    if (kur.length && !(await ask(`Masih ada kekurangan — ${kur.map(([x, k]) => `${x.nama.trim() || '(tanpa nama)'}: ${k.join(', ')}`).join(' · ')}. Bagian yang kosong ditulis apa adanya di Word. Tetap unduh?`))) return
    setSibukUnduh(kunci)
    try {
      const blob = await buatDocx(daftar); unduhBlob(blob, nama)
      const r = await riwayatSimpan({ blob, nama_file: nama, daftar, user })
      if (r.ok) { notify('Word diunduh & tersimpan di Riwayat'); setRiwayat((v) => ({ ...v, data: null })) } else notify(`Word diunduh, tetapi TIDAK tersimpan di Riwayat: ${r.alasan || 'gagal'}`, 'err')
    } catch (e) { notify(`Gagal membuat Word: ${e?.message || 'kesalahan tak dikenal'}`, 'err') } finally { setSibukUnduh('') }
  }
  const muatRiwayat = async () => { setRiwayat((v) => ({ ...v, muat: true, galat: '' })); const r = await riwayatDaftar(user, kelola); setRiwayat((v) => ({ ...v, muat: false, data: r.ok ? r.data : v.data, galat: r.ok ? '' : r.alasan || 'Gagal memuat riwayat' })) }
  const unduhRiwayat = async (x) => { setRiwayat((v) => ({ ...v, sibuk: x.id })); const r = await riwayatBerkas(x.id); setRiwayat((v) => ({ ...v, sibuk: '' })); if (r.ok) { unduhBlob(r.blob, r.nama_file || x.nama_file); notify('Word diunduh dari Riwayat') } else notify(r.alasan || 'Gagal mengunduh', 'err') }
  const hapusRiwayat = async (x) => { if (!(await ask(`Hapus “${x.nama_file}” dari Riwayat? File yang sudah diunduh tidak ikut terhapus.`))) return; setRiwayat((v) => ({ ...v, sibuk: x.id })); const r = await riwayatHapus(x.id); setRiwayat((v) => ({ ...v, sibuk: '' })); if (r.ok) { notify('Dihapus dari Riwayat'); muatRiwayat() } else notify(r.alasan || 'Gagal menghapus', 'err') }
  const unduhCatatan = async () => { setSibukUnduh('catatan'); try { unduhBlob(await buatCatatanDocx(list, user?.name || ''), 'Catatan-pemeriksaan-spesimen.docx') } catch (e) { notify(`Gagal: ${e?.message || ''}`, 'err') } finally { setSibukUnduh('') } }

  if (!izin) return <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-[#E7E8F0]"><p className="text-[17px] font-bold">Tidak ada akses</p><p className="mt-1 text-sm text-[#5E6380]">Minta Super Admin mengaktifkan “Pemisah Spesimen” di Role &amp; Hak Akses.</p></div>

  const LANGKAH = [['upload', 'Upload'], ['periksa', 'Pemeriksaan'], ['ekspor', 'Unduh Word'], ['riwayat', 'Riwayat']]
  const sedang = files.some((f) => ['antre', 'baca', 'ai'].includes(f.status))
  const nama = (x) => x.nama.trim() || '(nama belum diisi)'
  const daftarHal = Object.values(hal)

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-3.5" data-pemisah-spesimen>
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <div className="mr-auto flex min-w-0 flex-col"><span className="text-xs text-[#5E6380]">Alat · Toolkit</span><h1 className="text-xl font-extrabold tracking-tight">Pemisah Data &amp; Spesimen Pejabat</h1></div>
        <ol className="flex flex-wrap items-center gap-1.5" aria-label="Langkah">
          {LANGKAH.map(([k, l], i) => <li key={k}><button type="button" onClick={() => setLangkah(k)} aria-current={langkah === k ? 'step' : undefined} data-langkah={k}
            className={cx('inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[13px] font-bold ring-1 md:min-h-9', langkah === k ? 'bg-[#141B34] text-white ring-[#141B34]' : 'bg-white text-[#141B34] ring-[#D9DBE7]')}><span className={cx('grid h-5 w-5 place-items-center rounded-full text-[11px]', langkah === k ? 'bg-white text-[#141B34]' : 'bg-[#EEF0F5]')}>{k === 'riwayat' ? <History className="h-3 w-3" aria-hidden="true" /> : i + 1}</span>{l}{k === 'periksa' && list.length > 0 && <span className="opacity-70">· {list.length}</span>}</button></li>)}
        </ol>
      </header>
      <p className="rounded-xl bg-[#EEF3FF] px-3 py-2 text-xs text-[#23408F]">Data yang sedang diperiksa hanya ada di perangkat ini — unduh Word sebelum menutup halaman. File Word yang sudah diunduh tersimpan di tab Riwayat{RIWAYAT_LIVE ? ' (server ATLAS)' : ' (demo: hanya di perangkat ini)'}. {AI_LIVE ? 'Saat dibaca, gambar halaman dikirim ke pembaca AI (Gemini) lewat server ATLAS; isinya tidak disimpan di log.' : 'Demo: pembaca AI dan pencarian alamat tidak berjalan (tidak ada server) — data diisi dan dipotong manual.'}</p>

      {langkah === 'upload' && (<>
        <Kartu judul="1 · Upload dokumen" kanan={<span className="text-xs text-[#5E6380]">PDF multipage · JPG · JPEG · PNG · DOCX</span>}>
          <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); tambahFile(e.dataTransfer.files) }} className="flex flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed border-[#B9BEDA] bg-[#F8F9FD] px-4 py-7 text-center" data-tarik-file>
            <Upload className="h-7 w-7 text-[#3457D5]" aria-hidden="true" /><strong className="text-base">Tarik banyak file ke sini</strong>
            <span className="max-w-[520px] text-[13px] text-[#5E6380]">Satu dokumen boleh memuat beberapa pejabat, dan satu pejabat boleh muncul di beberapa dokumen. File yang gagal tidak membatalkan file lain.</span>
            <button type="button" onClick={() => inputRef.current?.click()} className={cx(tb, 'bg-[#3457D5] text-white')}><Upload className="h-4 w-4" />Pilih file (bisa banyak)</button>
            <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png" className="hidden" aria-label="Pilih file dokumen" onChange={(e) => { tambahFile(e.target.files); e.target.value = '' }} data-input-file />
          </div>
        </Kartu>
        {files.length > 0 && <Kartu judul={`Daftar file · ${files.length} file · ${daftarHal.length} halaman`}>
          <ul className="flex flex-col gap-2">{files.map((f) => {
            const w = { ok: ['Selesai', 'bg-emerald-100 text-emerald-800'], gagal: ['Gagal', 'bg-rose-100 text-rose-800'], antre: ['Menunggu', 'bg-slate-100 text-slate-700'], baca: ['Membuka…', 'bg-blue-100 text-blue-800'], ai: ['Dibaca AI…', 'bg-blue-100 text-blue-800'] }[f.status]
            return (
              <li key={f.id} className={cx('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5', f.status === 'gagal' ? 'border-rose-200 bg-rose-50/60' : 'border-[#E7E8F0] bg-white')} data-baris-file={f.status}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#EEF0F5] text-[#4A4F6A]" aria-hidden="true">{/JPE?G|PNG/.test(f.jenis) ? <ImageIcon className="h-[18px] w-[18px]" /> : <FileText className="h-[18px] w-[18px]" />}</span>
                <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1"><div className="flex flex-wrap items-baseline gap-x-2.5"><strong className="break-all text-sm">{f.name}</strong><span className="text-xs text-[#5E6380]">{f.jenis}{f.jmlHal ? ` · ${f.jmlHal} halaman` : ''}</span></div>
                  {f.status !== 'gagal' && <div role="progressbar" aria-valuenow={f.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progres ${f.name}`} className="h-1.5 overflow-hidden rounded bg-[#EEF0F5]"><div className={cx('h-full', f.status === 'ok' ? 'bg-emerald-600' : 'bg-[#3457D5]')} style={{ width: `${f.pct}%` }} /></div>}
                  <span className={cx('text-xs', f.status === 'gagal' ? 'text-rose-800' : 'text-[#5E6380]')}>{f.ket}</span></div>
                <span className={cx('inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-bold', w[1])}>{w[0]}</span>
                <button type="button" onClick={() => hapusFile(f)} disabled={['baca', 'ai'].includes(f.status)} aria-label={`Hapus ${f.name} dari daftar`} className="grid h-11 w-11 place-items-center rounded-[10px] text-[#6B7090] hover:bg-[#F3F4F9] disabled:opacity-40 md:h-9 md:w-9"><Trash2 className="h-4 w-4" /></button>
              </li>
            )
          })}</ul>
        </Kartu>}
        <div className="flex flex-wrap justify-end gap-2.5"><button type="button" onClick={tambahPejabat} className={tbGaris}><Plus className="h-4 w-4" />Tambah pejabat manual</button>
          <button type="button" onClick={() => { setLangkah('periksa'); if (!list.length) tambahPejabat() }} disabled={!daftarHal.length || sedang} className={tbUtama} data-aksi="ke-periksa">{sedang ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{sedang ? 'Masih memproses…' : `Lanjut ke pemeriksaan${list.length ? ` · ${list.length} pejabat` : ''}`}</button></div>
      </>)}

      {langkah === 'periksa' && (<>
        {saran.map(([a, b]) => { const A = list.find((x) => x.id === a), B = list.find((x) => x.id === b); if (!A || !B) return null; const info = (x) => [x.nip && `NIP ${x.nip}`, x.nomor_lain && `${x.jenis_lain || 'No.'} ${x.nomor_lain}`, x.jabatan, x.instansi].filter(Boolean).join(' · ') || 'tanpa nomor/jabatan'
          return (
            <div key={`${a}|${b}`} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-xl border border-[#F1D3A8] bg-[#FFF8EF] p-3" data-saran-gabung>
              <AlertTriangle className="h-5 w-5 shrink-0 text-orange-800" aria-hidden="true" />
              <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1 text-[13px] text-[#5A3A12]"><strong className="text-sm">Nama mirip: “{nama(A)}” muncul 2 kali</strong><span>Nama saja belum cukup — bandingkan dulu: <b>①</b> {info(A)} ({A.sumber[0]?.fileName || 'manual'}) &nbsp;<b>②</b> {info(B)} ({B.sumber[0]?.fileName || 'manual'})</span></div>
              <button type="button" onClick={() => gabung(a, b)} className={tbGaris} data-aksi="gabung">Gabungkan</button><button type="button" onClick={() => setAbaikanGabung((l) => [...l, `${a}|${b}`])} className={tbGaris}>Biarkan terpisah</button>
            </div>
          ) })}
        {!list.length ? <Kartu><p className="text-sm text-[#5E6380]">Belum ada pejabat. {AI_LIVE ? 'Upload dokumen dulu, atau' : 'Di demo,'} tambah pejabat secara manual lalu potong spesimennya dari halaman dokumen.</p><button type="button" onClick={tambahPejabat} className={cx(tbUtama, 'self-start')}><Plus className="h-4 w-4" />Tambah pejabat manual</button></Kartu> : (
          <div className="flex flex-wrap items-start gap-3.5">
            <nav aria-label="Daftar pejabat" className="flex min-w-0 flex-[1_1_240px] flex-col gap-2.5 rounded-2xl bg-white p-3 ring-1 ring-[#E7E8F0] lg:max-w-[300px]">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#5E6380]">Pejabat · {list.length}</h2>
              <ol className="flex flex-col gap-1.5">{list.map((x, i) => (
                <li key={x.id} className="flex items-stretch gap-1">
                  <button type="button" onClick={() => { setAktif(x.id); setLihatHal(null) }} aria-pressed={p?.id === x.id} data-pilih-pejabat className={cx('flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-left', p?.id === x.id ? 'border-[#3457D5] bg-[#F3F6FF]' : 'border-[#E7E8F0] bg-white')}>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[#141B34] text-xs font-extrabold text-white">{i + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5"><strong className="break-words text-[13px]">{nama(x)}</strong><span className="truncate text-[11.5px] text-[#5E6380]">{x.sumber.length ? `${x.sumber[0].fileName} · hal. ${x.sumber[0].no}${x.sumber.length > 1 ? ` +${x.sumber.length - 1}` : ''}` : 'diisi manual'}</span><Pil k={statusPejabat(x)} /></span>
                  </button>
                  <span className="flex flex-col justify-center gap-0.5"><button type="button" onClick={() => geser(i, -1)} disabled={i === 0} aria-label={`Naikkan urutan ${nama(x)}`} className="grid h-7 w-8 place-items-center rounded-md text-[#5E6380] hover:bg-[#F3F4F9] disabled:opacity-30 max-md:h-11 max-md:w-11"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" onClick={() => geser(i, 1)} disabled={i === list.length - 1} aria-label={`Turunkan urutan ${nama(x)}`} className="grid h-7 w-8 place-items-center rounded-md text-[#5E6380] hover:bg-[#F3F4F9] disabled:opacity-30 max-md:h-11 max-md:w-11"><ArrowDown className="h-3.5 w-3.5" /></button></span>
                </li>
              ))}</ol>
              <button type="button" onClick={tambahPejabat} className={cx(tbKecil, 'justify-center')} data-aksi="tambah-pejabat"><Plus className="h-3.5 w-3.5" />Tambah pejabat manual</button>
            </nav>

            <section aria-label="Dokumen asli" className="flex min-w-0 flex-[2_1_340px] flex-col gap-2.5 rounded-2xl bg-white p-3 ring-1 ring-[#E7E8F0]">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xs font-bold uppercase tracking-wider text-[#5E6380]">Dokumen asli</h2>
                {daftarHal.length > 0 && <select value={halAktif?.id || ''} onChange={(e) => setLihatHal(e.target.value)} aria-label="Pilih halaman dokumen" className={cx(inputCls, 'md:!min-h-9 !w-auto max-w-[260px] md:!text-xs')} data-pilih-halaman>{daftarHal.map((h) => <option key={h.id} value={h.id}>{h.fileName} · hal. {h.no}{h.ket ? ` (${h.ket})` : ''}</option>)}</select>}</div>
              {halAktif ? (<>
                <div className="relative overflow-hidden rounded-xl border border-[#E7E8F0] bg-[#FBFBFD]"><img src={halAktif.url} alt={`Halaman ${halAktif.no} dari ${halAktif.fileName}`} className="block w-full" />
                  {p?.spesimen.filter((s) => s.pageId === halAktif.id).map((s) => <div key={s.id} className={cx('pointer-events-none absolute rounded border-2', { ttd: 'border-[#3457D5]', paraf: 'border-emerald-600', stempel: 'border-orange-600' }[s.jenis])} style={{ left: `${(s.kotak.x / halAktif.w) * 100}%`, top: `${(s.kotak.y / halAktif.h) * 100}%`, width: `${(s.kotak.w / halAktif.w) * 100}%`, height: `${(s.kotak.h / halAktif.h) * 100}%` }}><span className={cx('absolute -top-5 left-[-2px] whitespace-nowrap rounded px-1.5 text-[10px] font-bold text-white', { ttd: 'bg-[#3457D5]', paraf: 'bg-emerald-600', stempel: 'bg-orange-600' }[s.jenis])}>{JENIS_SPESIMEN[s.jenis].split(' ')[0]}</span></div>)}
                </div>
                {p && <button type="button" onClick={() => setPotong({ pageId: halAktif.id, pid: p.id })} className={cx(tbGaris, 'self-start')} data-aksi="potong-baru"><Crop className="h-4 w-4" />Potong spesimen dari halaman ini</button>}
              </>) : <p className="rounded-xl bg-[#F3F4F9] px-3 py-6 text-center text-sm text-[#5E6380]">Belum ada halaman. Upload dokumen di langkah 1.</p>}
            </section>

            {p && <section aria-label="Hasil ekstraksi" className="flex min-w-0 flex-[3_1_420px] flex-col gap-3.5" data-form-pejabat={p.id}>
              <Kartu judul="Data pejabat" kanan={<span className="flex items-center gap-2"><Pil k={statusPejabat(p)} /><button type="button" onClick={() => hapusPejabat(p)} aria-label="Hapus pejabat ini" className="grid h-9 w-9 place-items-center rounded-lg text-[#6B7090] hover:bg-[#F3F4F9] max-md:h-11 max-md:w-11"><Trash2 className="h-4 w-4" /></button></span>}>
                {p.ragu?.length > 0 && <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-900">Pembaca AI ragu pada kolom: {p.ragu.join(', ')} — mohon dicek ke dokumen asli.</p>}
                <div className="flex flex-wrap gap-2.5"><Isian label="Nama lengkap dan gelar" value={p.nama} onChange={(v) => ubah(p.id, { nama: v })} tanda={!p.nama.trim()} className="flex-[2_1_260px]" data-isi="nama" />
                  <div className="flex min-w-0 flex-[1_1_170px] flex-col gap-1"><label htmlFor={`pns-${p.id}`} className="text-xs font-semibold text-[#5E6380]">Status PNS</label><select id={`pns-${p.id}`} value={p.status_pns} onChange={(e) => ubah(p.id, { status_pns: e.target.value })} className={cx(inputCls, p.status_pns === 'tidak_tahu' && '!border-orange-400 !bg-orange-50')} data-isi="status-pns">{Object.entries(STATUS_PNS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><span className="text-[11.5px] text-[#5E6380]">{p.nip_tercetak && p.status_pns === 'tidak_tahu' ? 'Label NIP tercetak di dokumen — mohon konfirmasi' : 'Tidak ditebak dari jabatan atau instansi'}</span></div></div>
                <div className="flex flex-wrap gap-2.5"><Isian label="NIP" value={p.nip} onChange={(v) => ubah(p.id, { nip: v })} disabled={p.status_pns !== 'pns'} ket={p.status_pns === 'pns' ? 'Disimpan sebagai teks' : 'Hanya untuk pejabat yang dikonfirmasi PNS'} inputMode="numeric" className="flex-[1_1_200px]" data-isi="nip" />
                  <div className="flex min-w-0 flex-[1_1_140px] flex-col gap-1"><label htmlFor={`jn-${p.id}`} className="text-xs font-semibold text-[#5E6380]">Jenis nomor lain</label><select id={`jn-${p.id}`} value={JENIS_NOMOR.includes(p.jenis_lain) || !p.jenis_lain ? p.jenis_lain : 'Lainnya'} onChange={(e) => ubah(p.id, { jenis_lain: e.target.value })} className={inputCls} data-isi="jenis-lain"><option value="">— tidak ada —</option>{JENIS_NOMOR.map((j) => <option key={j} value={j}>{j}</option>)}</select></div>
                  <Isian label="Nomor lain" value={p.nomor_lain} onChange={(v) => ubah(p.id, { nomor_lain: v })} ket="Disimpan sebagai teks · tidak dianggap NIP" className="flex-[1_1_200px]" data-isi="nomor-lain" /></div>
                <div className="flex flex-wrap gap-2.5"><Isian label="Jabatan (sesuai dokumen)" value={p.jabatan} onChange={(v) => ubah(p.id, { jabatan: v })} tanda={!p.jabatan.trim()} className="flex-[1_1_240px]" data-isi="jabatan" /><Isian label="Instansi dan unit kerja" value={p.instansi} onChange={(v) => ubah(p.id, { instansi: v })} tanda={!p.instansi.trim()} ket={!p.instansi.trim() ? 'Belum ada — mohon diisi' : ''} className="flex-[1_1_240px]" data-isi="instansi" /></div>
                <div className="flex flex-wrap items-end gap-2.5"><Isian label="Lokasi instansi (kota/kabupaten)" value={p.lokasi} onChange={(v) => ubah(p.id, { lokasi: v })} className="flex-[1_1_180px]" data-isi="lokasi" />
                  <button type="button" onClick={() => cariAlamat(p)} disabled={cari[p.id]?.sibuk || !AI_LIVE} title={AI_LIVE ? 'Cari alamat kantor instansi di internet' : 'Pencarian hanya berjalan di ATLAS live'} className={cx(tbGaris, '!min-h-10 max-md:!min-h-11')} data-aksi="cari-alamat">{cari[p.id]?.sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Cari Alamat Instansi</button></div>
                {!AI_LIVE && <p className="text-[11.5px] text-[#5E6380]">Demo: tombol pencarian tidak aktif (tidak ada server). Alamat diisi manual.</p>}
                <div className="flex flex-col gap-1"><label htmlFor={`al-${p.id}`} className="text-xs font-semibold text-[#5E6380]">Alamat instansi (kantor, bukan rumah)</label><textarea id={`al-${p.id}`} rows={2} value={p.alamat} onChange={(e) => ubah(p.id, { alamat: e.target.value, alamat_ok: false, alamat_asal: p.alamat_asal === 'cari' && e.target.value === p.alamat ? 'cari' : (e.target.value ? 'manual' : '') })} className={cx(inputCls, 'py-2', (!p.alamat.trim() || !p.alamat_ok) && '!border-orange-400 !bg-orange-50')} data-isi="alamat" />
                  <label className="flex min-h-9 items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={p.alamat_ok} disabled={!p.alamat.trim()} onChange={(e) => ubah(p.id, { alamat_ok: e.target.checked })} className="h-[18px] w-[18px]" data-isi="alamat-ok" />Alamat sudah saya periksa &amp; konfirmasi</label>
                  {p.alamat_asal && <span className="text-[11.5px] text-[#5E6380]">Asal alamat: {{ dokumen: 'tercetak di dokumen', cari: 'pencarian internet', manual: 'diisi manual' }[p.alamat_asal]}{p.alamat_dicari_at ? ` · dicari ${new Date(p.alamat_dicari_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</span>}</div>
                {cari[p.id]?.galat && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-900" data-cari-galat>Pencarian gagal: {cari[p.id].galat}. Alamat tetap bisa diisi manual.</p>}
                {cari[p.id]?.hasil && <div className="flex flex-col gap-2 rounded-xl border border-[#E7E8F0] bg-[#F8F9FD] p-3" data-hasil-cari>
                  <strong className="text-[13px]">Hasil pencarian · {cari[p.id].hasil.pilihan.length} pilihan · dicari {new Date(cari[p.id].hasil.dicari_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                  {!cari[p.id].hasil.pilihan.length && <span className="text-[13px] text-[#5E6380]">Tidak ada alamat yang ditemukan dengan yakin. Silakan isi manual.</span>}
                  {cari[p.id].hasil.pilihan.map((o, i) => <div key={i} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[#E7E8F0] bg-white p-2"><span className="flex min-w-0 flex-[1_1_240px] flex-col"><span className="text-[13px] font-semibold">{o.nama || p.instansi}</span><span className="break-words text-xs text-[#5E6380]">{o.alamat}</span></span><button type="button" onClick={() => pakaiAlamat(p, o, cari[p.id].hasil)} className={tbKecil} data-aksi="pakai-alamat"><Check className="h-3.5 w-3.5" />Pakai &amp; konfirmasi</button></div>)}
                  {cari[p.id].hasil.sumber?.length > 0 ? <div className="flex flex-col gap-1 text-xs"><span className="font-semibold text-[#5E6380]">Sumber pencarian (cek dulu sebelum dipakai):</span>{cari[p.id].hasil.sumber.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all font-semibold text-[#0B5C8A] hover:underline"><ExternalLink className="h-3 w-3 shrink-0" />{s.judul || s.url}</a>)}</div>
                    : <span className="text-xs text-orange-900">Tautan sumber tidak tersedia dari pencarian ini — verifikasi alamat secara manual sebelum dikonfirmasi.</span>}
                  <span className="text-[11.5px] text-[#5E6380]">Jabatan di dokumen tidak diganti dengan jabatan terbaru dari internet.</span>
                </div>}
              </Kartu>

              <Kartu judul="Spesimen · potongan dari gambar asli" kanan={<span className="flex flex-wrap gap-1.5">{p.spesimen.some((s) => !s.latar) && <button type="button" onClick={() => latarSemua(p)} disabled={!!sibukLatar} className={tbKecil} data-aksi="latar-semua">{sibukLatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />}Hapus latar semua</button>}{halAktif && <button type="button" onClick={() => setPotong({ pageId: halAktif.id, pid: p.id })} className={tbKecil}><Plus className="h-3.5 w-3.5" />Tambah potongan</button>}</span>}>
                <div className="flex flex-wrap gap-2.5">{Object.entries(JENIS_SPESIMEN).map(([j, l]) => { const sp = p.spesimen.filter((s) => s.jenis === j); const maks = j === 'stempel' ? 1 : 2; const dipakai = sp.filter((s) => s.pakai).length
                  return (
                    <div key={j} className="flex min-w-0 flex-[1_1_230px] flex-col gap-2 rounded-xl border border-[#E7E8F0] p-2.5" data-kategori={j}>
                      <div className="flex items-center justify-between gap-2"><strong className="text-[13px]">{l}</strong><span className="text-[11.5px] text-[#5E6380]">{sp.length ? `${dipakai}/${maks} dipakai` : ''}</span></div>
                      {!sp.length && <div className="grid min-h-[84px] place-items-center rounded-lg border border-dashed border-[#C9CEE6] bg-[#FAFBFE] p-2 text-center"><strong className="text-[13px] text-[#4A4F6A]">{l.split(' /')[0]} tidak tersedia</strong></div>}
                      {j === 'paraf' && !sp.length && <span className="text-[11.5px] text-[#5E6380]">Tidak dibuat dari tanda tangan. Di Word kolom paraf ditulis “Paraf tidak tersedia”.</span>}
                      {sp.map((s) => (
                        <div key={s.id} className={cx('flex flex-col gap-1.5 rounded-lg p-1.5', s.tinjau ? 'bg-orange-50 ring-1 ring-orange-200' : 'bg-[#F8F9FD]')} data-spesimen={s.jenis}>
                          <div className="grid min-h-[72px] place-items-center rounded bg-white p-1" style={s.urlBersih ? CATUR : undefined} data-latar={s.latar || 'asli'}><img src={s.urlBersih || s.url} alt={`${l} dari ${s.fileName} hal. ${s.no}`} className="max-h-24 max-w-full object-contain" /></div>
                          <span className="break-words text-[11px] text-[#5E6380]">{s.fileName} · hal. {s.no} · {s.asal === 'ai' ? 'deteksi AI' : 'dipotong manual'}</span>
                          {s.bertumpuk && <span className="inline-flex items-start gap-1 text-[11.5px] font-semibold text-orange-900"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />Bertumpuk dengan goresan/cap lain — potongan apa adanya, tidak dinyatakan bersih.</span>}
                          {s.latar
                            ? <div className="flex flex-wrap items-center gap-1.5" data-kontrol-latar>
                                <span className="text-[11.5px] font-semibold text-emerald-800">Latar dihapus (kotak-kotak = transparan)</span>
                                <select aria-label="Kekuatan hapus latar" value={s.latar} disabled={sibukLatar === s.id} onChange={(e) => terapLatar(p.id, s.id, e.target.value, s.url)} className="min-h-9 rounded-lg border border-[#D9DBE7] bg-white px-2 text-xs font-semibold max-md:min-h-11 max-md:text-base" data-isi="tingkat-latar">{Object.entries(TINGKAT_LATAR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                                <button type="button" onClick={() => ubahSp(p.id, s.id, { urlBersih: null, latar: '' })} className={tbKecil} data-aksi="latar-asli"><Undo2 className="h-3.5 w-3.5" />Kembalikan asli</button>
                              </div>
                            : <button type="button" onClick={() => terapLatar(p.id, s.id, 'sedang', s.url)} disabled={sibukLatar === s.id} className={cx(tbKecil, 'self-start')} data-aksi="hapus-latar">{sibukLatar === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />}Hapus latar</button>}
                          <label className="flex min-h-8 items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={s.pakai} onChange={(e) => { if (e.target.checked && dipakai >= maks) return notify(`Maksimal ${maks} ${l.toLowerCase()} di Word`, 'err'); ubahSp(p.id, s.id, { pakai: e.target.checked }) }} className="h-[18px] w-[18px]" />Masukkan ke Word</label>
                          {s.tinjau && <label className="flex min-h-8 items-center gap-2 text-xs font-semibold text-orange-900"><input type="checkbox" checked={false} onChange={() => ubahSp(p.id, s.id, { tinjau: false })} className="h-[18px] w-[18px]" data-isi="tinjau" />Sudah saya tinjau</label>}
                          <div className="flex flex-wrap gap-1"><button type="button" onClick={() => hal[s.pageId] ? setPotong({ pageId: s.pageId, pid: p.id, sid: s.id }) : notify('Halaman sumbernya sudah dihapus', 'err')} className={tbKecil}><Crop className="h-3.5 w-3.5" />Perbaiki</button><button type="button" onClick={() => ubah(p.id, (x) => ({ spesimen: x.spesimen.filter((y) => y.id !== s.id), diperiksa: false }))} className={tbKecil}><Trash2 className="h-3.5 w-3.5" />Hapus</button></div>
                        </div>
                      ))}
                    </div>
                  ) })}</div>
              </Kartu>
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                {kekurangan(p).length > 0 && <span className="mr-auto min-w-0 flex-[1_1_240px] text-[12.5px] text-orange-900" data-kekurangan>Kurang: {kekurangan(p).join(', ')}</span>}
                <button type="button" onClick={() => ubah(p.id, (x) => ({ diperiksa: !x.diperiksa }))} className={p.diperiksa ? tbGaris : tbUtama} data-aksi="tandai-periksa"><Check className="h-4 w-4" />{p.diperiksa ? 'Batalkan tanda sudah diperiksa' : 'Tandai sudah diperiksa'}</button>
                <button type="button" onClick={() => setLangkah('ekspor')} className={tbGaris}>Lanjut ke unduh Word</button>
              </div>
            </section>}
          </div>
        )}
      </>)}

      {langkah === 'ekspor' && (!list.length ? <Kartu><p className="text-sm text-[#5E6380]">Belum ada pejabat untuk diekspor.</p></Kartu> : (
        <div className="flex flex-wrap items-start gap-3.5">
          <section aria-label="Pratinjau Word" className="flex min-w-0 flex-[3_1_420px] flex-col overflow-hidden max-sm:flex-[1_1_100%] items-center gap-3 rounded-2xl bg-[#E9EBF3] p-3 sm:p-4">
            <div className="flex w-full flex-wrap items-center justify-between gap-2"><strong className="text-[13px]">Pratinjau · halaman {Math.min(pratinjau, list.length - 1) + 1} dari {list.length} · A4</strong><span className="flex gap-1.5"><button type="button" onClick={() => setPratinjau((i) => Math.max(0, i - 1))} disabled={pratinjau <= 0} className={tbKecil}>‹ Sebelumnya</button><button type="button" onClick={() => setPratinjau((i) => Math.min(list.length - 1, i + 1))} disabled={pratinjau >= list.length - 1} className={tbKecil}>Berikutnya ›</button></span></div>
            <Formulir p={list[Math.min(pratinjau, list.length - 1)]} />
            <span className="text-center text-xs text-[#5E6380]">Pratinjau di layar; file Word memakai isi yang sama. Teks bisa diedit di Word, gambar tertanam dengan proporsi aslinya.</span>
          </section>
          <section aria-label="Ekspor" className="flex min-w-0 flex-[2_1_340px] flex-col gap-3.5 max-sm:flex-[1_1_100%]">
            {list.some((x) => kekurangan(x).length) && <div className="flex flex-col gap-1.5 rounded-xl border border-[#F1D3A8] bg-[#FFF8EF] p-3 text-[13px] text-[#5A3A12]" data-daftar-kurang><strong className="text-sm">{list.filter((x) => kekurangan(x).length).length} dari {list.length} pejabat belum lengkap</strong><ul className="ml-4 list-disc">{list.filter((x) => kekurangan(x).length).map((x) => <li key={x.id}>{nama(x)}: {kekurangan(x).join(', ')}</li>)}</ul><span className="text-xs">Tetap bisa diunduh; bagian yang kosong ditulis apa adanya di Word.</span></div>}
            <Kartu judul="Urutan pejabat di Word">
              <ol className="flex flex-col gap-2">{list.map((x, i) => (
                <li key={x.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl border border-[#E7E8F0] px-3 py-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[#141B34] text-xs font-extrabold text-white">{i + 1}</span>
                  <span className="flex min-w-0 flex-[1_1_160px] flex-col"><strong className="break-words text-[13.5px]">{nama(x)}</strong><span className="text-xs text-[#5E6380]">{kekurangan(x).length ? `Kurang: ${kekurangan(x).join(', ')}` : 'Lengkap'}</span></span>
                  <Pil k={statusPejabat(x)} />
                  <button type="button" onClick={() => setPratinjau(i)} aria-label={`Pratinjau ${nama(x)}`} className={tbKecil}><Eye className="h-3.5 w-3.5" />Lihat</button>
                  <button type="button" onClick={() => unduh([x], `Spesimen-${namaBerkas(x.nama)}.docx`, x.id)} disabled={!!sibukUnduh} className={tbKecil} data-aksi="unduh-satu">{sibukUnduh === x.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Unduh Word</button>
                </li>
              ))}</ol>
              <button type="button" onClick={() => unduh(list, `Spesimen-${list.length}-pejabat.docx`, 'semua')} disabled={!!sibukUnduh} className={cx(tbUtama, '!min-h-12 !whitespace-normal py-2')} data-aksi="unduh-semua">{sibukUnduh === 'semua' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Unduh semua pejabat dalam satu Word (.docx)</button>
              <span className="text-xs text-[#5E6380]">File .docx asli · halaman baru untuk setiap pejabat · NIP hanya diisi untuk PNS yang sudah dikonfirmasi, nomor lain memakai labelnya sendiri.</span>
            </Kartu>
            <Kartu judul="Catatan pemeriksaan (terpisah dari formulir)"><span className="text-[13px] text-[#5E6380]">Berisi sumber data tiap pejabat, asal &amp; tanggal pencarian alamat beserta tautannya, dan tanda spesimen yang bertumpuk.</span><button type="button" onClick={unduhCatatan} disabled={!!sibukUnduh} className={cx(tbGaris, 'max-w-full self-start !whitespace-normal py-2 text-left')} data-aksi="unduh-catatan">{sibukUnduh === 'catatan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Unduh catatan pemeriksaan (.docx)</button></Kartu>
          </section>
        </div>
      ))}

      {langkah === 'riwayat' && (
        <Kartu judul={`Riwayat dokumen${kelola ? ' · semua pengguna' : ' · buatan saya'}`} kanan={<button type="button" onClick={muatRiwayat} disabled={riwayat.muat} className={tbKecil}>{riwayat.muat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}Muat ulang</button>}>
          <span className="text-xs text-[#5E6380]">{RIWAYAT_LIVE ? 'File Word yang pernah dibuat tersimpan di server ATLAS sampai dihapus. Isinya memuat spesimen tanda tangan/cap — unduh hanya bila perlu.' : 'Demo: riwayat disimpan di perangkat ini saja (maksimal 8 dokumen) dan tidak terlihat di perangkat lain.'}</span>
          {riwayat.galat && <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-800" role="alert">{riwayat.galat}</p>}
          {riwayat.muat && !riwayat.data && <p className="flex items-center gap-2 py-6 text-sm text-[#5E6380]"><Loader2 className="h-4 w-4 animate-spin" />Memuat riwayat…</p>}
          {riwayat.data && !riwayat.data.length && <p className="rounded-xl bg-[#F3F4F9] px-3 py-6 text-center text-sm text-[#5E6380]">Belum ada dokumen. Setiap Word yang diunduh dari langkah 3 otomatis tercatat di sini.</p>}
          {riwayat.data?.length > 0 && <ul className="flex flex-col gap-2" data-daftar-riwayat>{riwayat.data.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[#E7E8F0] px-3 py-2.5" data-riwayat>
              <FileText className="h-5 w-5 shrink-0 text-[#4169E1]" aria-hidden="true" />
              <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5"><strong className="break-words text-[13.5px]">{x.nama_file}</strong>
                <span className="text-xs text-[#5E6380]">{new Date(x.dibuat_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}{x.user_nama ? ` · ${x.user_nama}` : ''} · {(x.pejabat || []).length} pejabat · {Math.max(1, Math.round((x.ukuran || 0) / 1024))} KB</span>
                {(x.pejabat || []).length > 0 && <span className="break-words text-xs text-[#4A4F6A]">{x.pejabat.slice(0, 4).map((q) => q.nama || '(tanpa nama)').join(' · ')}{x.pejabat.length > 4 ? ` · +${x.pejabat.length - 4}` : ''}</span>}</span>
              <span className="flex flex-wrap gap-1.5"><button type="button" onClick={() => unduhRiwayat(x)} disabled={!!riwayat.sibuk} className={tbKecil} data-aksi="unduh-riwayat">{riwayat.sibuk === x.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Unduh lagi</button>
                <button type="button" onClick={() => hapusRiwayat(x)} disabled={!!riwayat.sibuk} className={tbKecil} data-aksi="hapus-riwayat"><Trash2 className="h-3.5 w-3.5" />Hapus</button></span>
            </li>))}</ul>}
        </Kartu>
      )}

      {potong && hal[potong.pageId] && <AlatPotong halaman={hal[potong.pageId]} awal={potong.sid ? list.find((x) => x.id === potong.pid)?.spesimen.find((s) => s.id === potong.sid) : null} onSimpan={simpanPotongan} onClose={() => setPotong(null)} />}
    </div>
  )
}
