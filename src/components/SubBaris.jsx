import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import PilihLembaga from './PilihLembaga.jsx'
import { PrioritasSub } from './Priority.jsx'
import { Trash2, Upload, Paperclip, X, IdCard } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { SUB_TYPES, COUNTRIES, OBJEK_APOSTILLE, points } from '../config/subtypes.js'
import { FieldError, cx } from './ui.jsx'
import { placeOf, perluVendor, vendorEksekutor } from '../config/access.js'
import PilihCari from './PilihCari.jsx'
import { newSub, usesDocs, isTerjemahan, docsOf, fromDocs, docFileName, safeName, MAKS_DOK, hitungHalaman } from './SubProjectEditor.jsx'
import { LANGS } from '../config/bahasa.js'

/**
 * Sub project di halaman penuh "Project Baru" (tata letak 20 Nov 2026):
 *  • baris atas  = pengaturan: Kategori | Bahasa asal → tujuan | Prioritas | Penerjemah (dan isian khas kategori)
 *  • di bawahnya = daftar dokumen selebar kartu, supaya nama file yang panjang terbaca utuh (turun baris, tidak terpotong)
 *  • warna: blok warna di field Kategori + latar kartu per kategori (lihat TEMA)
 * Di HP tiap kolom turun rapi (penuh / setengah lebar).
 * Dokumen hanya lewat satu tombol "Upload / tarik file (bisa banyak)":
 *  • terjemahan: tiap file = satu baris dokumen di sub yang sama
 *  • apostille / legalisasi: sama — tiap file = satu baris dokumen di sub yang sama (19 Nov 2026; dulu 1 sub = 1 dokumen)
 */
/** Reguler / Non Reguler hanya untuk pasangan bahasa Indonesia · Inggris · Belanda (dikerjakan tim internal).
 *  Bahasa lain (ke vendor, mis. Mandarin): TIDAK ada pilihan jenis per dokumen — kecepatannya memakai Prioritas sub project (19 Nov 2026). */
const BHS_REGULER = ['Indonesia', 'Inggris', 'Belanda']
export const opsiJenis = (sub) => (BHS_REGULER.includes(sub.lang_from) && (!sub.lang_to || BHS_REGULER.includes(sub.lang_to))
  ? [['reguler', 'Reguler'], ['non_reguler', 'Non Reguler']]
  : [])
/** Jenis dokumen disesuaikan saat bahasa berubah: jenis yang tidak berlaku lagi kembali ke pilihan pertama. */
const rapikanJenis = (sub) => {
  if (!isTerjemahan(sub.type) || !Array.isArray(sub.docs)) return Array.isArray(sub.docs) ? { ...sub, docs: sub.docs.map((d) => (d.file && d.file_name ? { ...d, file_name: tanpaNo(d.file_name) } : d)) } : sub
  const ops = opsiJenis(sub).map(([v]) => v)
  if (!ops.length) return { ...sub, docs: nomori(sub, sub.docs.map((d) => { if (d.kind === undefined) return d; const { kind, ...r } = d; return r })) } // bahasa vendor: tanpa jenis per dokumen
  return { ...sub, docs: nomori(sub, sub.docs.map((d) => (ops.includes(d.kind || 'reguler') ? d : { ...d, kind: ops[0] }))) }
}

/** Sub project baru untuk halaman penuh: bahasa tujuan kosong (wajib dipilih), eksekutor bawaan = staf apostille/legalisasi. */
export const subBaru = (type, data, asal) => {
  const s = { ...newSub(type), lang_to: '' }
  if (['apostille', 'legalisasi'].includes(type)) {
    if (asal?.executor_id) Object.assign(s, { executor_kind: asal.executor_kind, executor_id: asal.executor_id })
    else { const staf = (data?.users || []).find((u) => u.role === 'staf_apostille' && u.active !== false); if (staf) Object.assign(s, { executor_kind: 'staff', executor_id: staf.id }) }
  }
  return s
}

const extOf = (n = '') => (n.match(/\.[^.]+$/)?.[0] || '')
const namaDasar = (n = '') => n.replace(/\.[^.]+$/, '')
/** Buang nomor urut di awal nama ("1. ", "2) ", "3 ") supaya tidak dobel saat dinomori ulang. */
const tanpaNo = (n = '') => String(n).replace(/^\s*(?:\d{1,3}[.)]\s*|\d{1,2}\s+(?=\D))/, '')
/** Terjemahan: nomor urut otomatis di awal nama file ("1. …", "2. …") — ikut berubah saat dokumen ditambah / dilepas. Deskripsi disimpan tanpa nomor. */
const nomori = (sub, docs) => (!isTerjemahan(sub.type) ? docs : docs.map((d, i) => (d.file
  ? { ...d, desc: tanpaNo(d.desc), file_name: `${i + 1}. ${tanpaNo(d.file_name ?? docFileName(d))}` }
  : d)))
/**
 * Apostille & legalisasi: nomor urut otomatis di awal nama file, berurutan antar sub project
 * ("1. …", "2. …") — ikut bergeser saat sub ditambah / dihapus. Mengembalikan array yang sama bila tidak ada yang berubah.
 */
export function nomoriAntarSub(subs) {
  let n = 0; let ubah = false
  const hasil = subs.map((x) => {
    if (!['apostille', 'legalisasi'].includes(x.type) || !Array.isArray(x.docs)) return x
    let beda = false
    const docs = x.docs.map((d) => {
      if (!d?.file) return d
      n += 1
      const nama = `${n}. ${tanpaNo(d.file_name ?? docFileName(d))}`; const desc = tanpaNo(d.desc)
      if (nama === d.file_name && desc === d.desc) return d
      beda = true
      return { ...d, file_name: nama, desc }
    })
    if (!beda) return x
    ubah = true
    return { ...x, ...fromDocs(docs) }
  })
  return ubah ? hasil : subs
}
/**
 * Satu ID pemohon untuk semua: KTP / paspor yang diunggah di satu sub apostille / legalisasi otomatis dipakai sub lain
 * yang belum punya ID (nomornya ikut, termasuk saat baru terbaca). Sub yang ID-nya dilepas / diganti sendiri tidak diisi lagi.
 */
export function bagikanId(subs) {
  const al = (x) => ['apostille', 'legalisasi'].includes(x.type)
  const asal = subs.find((x) => al(x) && x.applicant_file && !x._id_ikut)
  if (!asal) return subs
  let ubah = false
  const hasil = subs.map((x) => {
    if (x === asal || !al(x) || x._id_lepas || x.data?.dokumen_id) return x
    const ikut = x._id_ikut && x.applicant_file === asal.applicant_file
    if (x.applicant_file && !ikut) return x
    if (ikut && x.applicant_id === asal.applicant_id && x.applicant_id_type === asal.applicant_id_type) return x
    ubah = true
    return { ...x, applicant_file: asal.applicant_file, applicant_id: asal.applicant_id || '', applicant_id_type: asal.applicant_id_type || 'ktp', _id_ikut: true }
  })
  return ubah ? hasil : subs
}
const terisi = (d) => !!(d.file || d.existing || String(d.desc || '').trim())

/** Pasang 1–banyak file ke sub. Mengembalikan sub yang sudah diisi + file sisa (melebihi batas dokumen sub). */
export async function pasangKeSub(sub, fileList) {
  const list = [...(fileList || [])]; if (!list.length || !usesDocs(sub.type)) return { sub, sisa: list }
  const hal = await Promise.all(list.map(hitungHalaman))
  const maks = MAKS_DOK[sub.type] || 0
  const next = docsOf(sub).filter(terisi); const sisa = []
  const jenis = isTerjemahan(sub.type) ? opsiJenis(sub)[0]?.[0] : undefined
  list.forEach((f, n) => {
    // Baris dokumen yang sudah bernama tetapi belum ada filenya (mis. hasil Tarik Data) diisi lebih dulu, urut dari atas — namanya dipertahankan.
    const k = next.findIndex((d) => !d.file && !d.existing && String(d.desc || '').trim())
    if (k >= 0) { const d = next[k]; next[k] = { ...d, pages: hal[n] > 0 ? hal[n] : (d.pages || 1), file: f, file_name: `${safeName(tanpaNo(d.desc)) || 'dokumen'}${extOf(f.name)}`, name_edited: true }; return }
    if (maks && next.length >= maks) { sisa.push(f); return }
    const desc = namaDasar(f.name)
    next.push({ desc, pages: hal[n] > 0 ? hal[n] : 1, ...(jenis ? { kind: next[next.length - 1]?.kind || jenis } : {}), file: f, file_name: `${safeName(desc) || 'dokumen'}${extOf(f.name)}`, name_edited: false })
  })
  return { sub: { ...sub, ...fromDocs(next.length ? nomori(sub, next) : [{ desc: '', pages: 1 }]) }, sisa }
}

const kata = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
/** Indeks baris dokumen yang sudah bernama (mis. hasil Tarik Data dari invoice) tetapi belum ada filenya. */
export const barisKosong = (docs) => docs.map((d, i) => (!d.file && !d.existing && String(d.desc || '').trim() ? i : -1)).filter((i) => i >= 0)
/**
 * Upload massal: tebak pasangan tiap file dengan isi sub project dari NAMA FILE saja (isi file tidak dibaca).
 * Mengembalikan, per file: indeks baris tujuan, atau 'baru' (jadi dokumen baru) bila tidak ada yang cocok. Selalu bisa diganti pengguna.
 */
export function cocokkanFile(files, docs, kosong) {
  const calon = []
  files.forEach((f, fi) => {
    const kf = kata(namaDasar(f.name)); const ada = new Set(kf); const rapat = kf.join('')
    kosong.forEach((di) => {
      const kd = kata(tanpaNo(docs[di].desc)).filter((w) => w.length >= 2); if (!kd.length) return
      let skor = kd.filter((w) => ada.has(w) || (w.length >= 4 && rapat.includes(w))).length / kd.length
      const singkatan = kd.length >= 2 ? kd.map((w) => w[0]).join('') : ''
      if (singkatan && ada.has(singkatan)) skor = Math.max(skor, 0.9) // mis. "KK" ↔ "Kartu Keluarga"
      if (skor >= 0.6) calon.push([skor, fi, di])
    })
  })
  calon.sort((a, b) => b[0] - a[0])
  const ke = files.map(() => 'baru'); const filePakai = new Set(); const barisPakai = new Set()
  for (const [, fi, di] of calon) { if (filePakai.has(fi) || barisPakai.has(di)) continue; ke[fi] = di; filePakai.add(fi); barisPakai.add(di) }
  return ke
}
/** Pasang file sesuai pilihan pengguna: ke[n] = indeks baris dokumen | 'baru' | 'lewati'. */
export async function pasangPilihan(sub, files, ke) {
  const hal = await Promise.all(files.map((f, n) => (ke[n] === 'lewati' ? 0 : Promise.resolve(hitungHalaman(f)).catch(() => 0))))
  const maks = MAKS_DOK[sub.type] || 0
  const next = docsOf(sub).filter(terisi).slice(); const sisa = []
  const jenis = isTerjemahan(sub.type) ? opsiJenis(sub)[0]?.[0] : undefined
  files.forEach((f, n) => {
    const k = ke[n]; if (k === 'lewati') return
    if (typeof k === 'number' && next[k] && !next[k].file && !next[k].existing) { const d = next[k]; next[k] = { ...d, pages: hal[n] > 0 ? hal[n] : (d.pages || 1), file: f, file_name: `${safeName(tanpaNo(d.desc)) || 'dokumen'}${extOf(f.name)}`, name_edited: true }; return }
    if (maks && next.length >= maks) { sisa.push(f); return }
    const desc = namaDasar(f.name)
    next.push({ desc, pages: hal[n] > 0 ? hal[n] : 1, ...(jenis ? { kind: jenis } : {}), file: f, file_name: `${safeName(desc) || 'dokumen'}${extOf(f.name)}`, name_edited: false })
  })
  return { sub: { ...sub, ...fromDocs(next.length ? nomori(sub, next) : [{ desc: '', pages: 1 }]) }, sisa }
}

const inputCls = 'h-9 w-full min-w-0 rounded-[10px] border-0 bg-white px-2.5 text-sm text-ink ring-1 ring-[#D9DBE7] placeholder:text-slate-400 hover:ring-slate-400 focus:outline-none focus:ring-2 focus:ring-brand max-md:h-11 max-md:text-base'
/** Warna per kategori: `blok` = warna field Kategori (teks putih), `kartu` = latar + garis kartu. */
const TEMA = {
  terjemahan: { blok: '!bg-[#2343C9]', kartu: 'bg-[#EAF1FF] ring-[#C9D8FB]', sel: 'bg-[#EAF1FF] border-[#C9D8FB]' },
  apostille: { blok: '!bg-[#14275E]', kartu: 'bg-[#FFF8DC] ring-[#EBDD9C]', sel: 'bg-[#FFF8DC] border-[#EBDD9C]' },
  legalisasi: { blok: '!bg-[#C62828]', kartu: 'bg-[#FDECEC] ring-[#F3C4C4]', sel: 'bg-[#FDECEC] border-[#F3C4C4]' },
  jasa_lain: { blok: '!bg-[#1E7A3C]', kartu: 'bg-[#E9F7EE] ring-[#BFE3CB]', sel: 'bg-[#E9F7EE] border-[#BFE3CB]' },
  terjemahan_nt: { blok: '!bg-[#6D28D9]', kartu: 'bg-[#F3ECFF] ring-[#D9C8F8]', sel: 'bg-[#F3ECFF] border-[#D9C8F8]' },
}

function Kol({ label, wajib, hp = 'full', className, style, children }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-[3px]', hp === 'half' ? 'max-md:!basis-[calc(50%-5px)] max-md:!grow' : hp === 'sisa' ? 'max-md:!basis-[calc(100%-108px)] max-md:!grow' : 'max-md:!basis-full', className)} style={style}>
      <span className="truncate text-[11px] font-semibold text-[#4F5470]">{label}{wajib && <span className="text-[#B4233F]"> *</span>}</span>
      {children}
    </div>
  )
}

function TombolUnggah({ label, onFiles, banyak = true, salah, tinggi = 'h-9', data, className }) {
  return (
    <label {...(data ? { [data]: '' } : {})} className={cx('flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] px-3 text-[13px] font-bold text-white hover:opacity-90 max-md:h-11', tinggi, salah ? 'bg-[#B4233F]' : 'bg-[#3457D5]', className)}>
      <Upload className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span>
      <input type="file" multiple={banyak} className="hidden" accept="application/pdf,image/*,.doc,.docx" aria-label={label}
        onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) onFiles(fs) }} />
    </label>
  )
}

/** Isian satu baris yang MELEBAR KE BAWAH mengikuti panjang teks (nama file panjang tetap terbaca utuh). Enter tidak membuat baris baru. */
function TeksPanjang({ value, onChange, className, ...p }) {
  const r = useRef(null)
  useLayoutEffect(() => {
    const el = r.current; if (!el) return
    const atur = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
    atur(); window.addEventListener('resize', atur)
    return () => window.removeEventListener('resize', atur)
  }, [value])
  return <textarea ref={r} rows={1} value={value} {...p} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
    onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ' '))} className={cx('block resize-none overflow-hidden break-words [overflow-wrap:anywhere]', className)} />
}

/** Satu dokumen selebar kartu: nama (sekaligus nama file) bisa diganti dan boleh panjang; × = lepas dokumen dari sub. */
function Berkas({ d, i, onUbah, onLepas, onFile, jenisOps = [], pakaiHal, sebagai: Tag = 'li' }) {
  const adaFile = !!d.file
  const belum = !adaFile && !d.existing
  return (
    <Tag data-baris-dok className={cx('flex flex-wrap items-center gap-2 rounded-xl px-2.5 py-1.5 ring-1', belum ? 'bg-[#FFFAEF] ring-[#F2D9A6]' : 'bg-white ring-[#E6E8F0]')}>
      <div className="order-1 flex min-w-0 flex-1 items-start gap-2 max-md:basis-[calc(100%-52px)]">
        <Paperclip className={cx('mt-[9px] h-4 w-4 shrink-0 max-md:hidden', adaFile ? 'text-[#17693A]' : 'text-[#8A8FA8]')} />
        {!adaFile && <span data-no-dok className="mt-[7px] flex-none text-sm font-bold leading-snug text-[#6B7088] max-md:mt-2.5 max-md:text-base">{i + 1}.</span>}
        {d.existing && !adaFile
          ? <span className="min-w-0 flex-1 py-1.5 text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere] max-md:py-2.5 max-md:text-base">{d.desc}</span>
          : <TeksPanjang value={adaFile ? (d.file_name ?? docFileName(d)) : d.desc} aria-label={`Nama dokumen / file ${i + 1}`} title="Nama dokumen sekaligus nama file — bisa diganti" data-nama-file
              onChange={(v) => onUbah(adaFile ? { file_name: v, name_edited: true, desc: namaDasar(v) } : { desc: v })}
              className={cx('min-h-[34px] w-full min-w-0 flex-1 rounded-lg border-0 bg-transparent px-1.5 py-[7px] text-sm font-semibold leading-snug hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand max-md:min-h-11 max-md:py-2.5 max-md:text-base', adaFile ? 'text-[#124D2B]' : 'text-ink')} />}
      </div>
      {belum && onFile && (
        <label title="Pilih file untuk dokumen ini" data-pilih-file className="order-2 inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] bg-[#3457D5] px-3 text-[13px] font-bold text-white hover:opacity-90 max-md:order-5 max-md:h-11">
          <Upload className="h-4 w-4" />File
          <input type="file" className="hidden" accept="application/pdf,image/*,.doc,.docx" aria-label={`Pilih file dokumen ${i + 1}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
        </label>
      )}
      {jenisOps.length > 0 && <select value={jenisOps.some(([v]) => v === (d.kind || 'reguler')) ? (d.kind || 'reguler') : jenisOps[0][0]} onChange={(e) => onUbah({ kind: e.target.value })} aria-label={`Jenis dokumen ${i + 1}`} data-jenis-dok
        className={cx(inputCls, 'order-3 !w-[132px] flex-none !px-2 !text-[13px] font-semibold max-md:!w-auto max-md:flex-1 max-md:!text-base')}>
        {jenisOps.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>}
      {pakaiHal && <input type="number" min="1" inputMode="numeric" value={d.pages} aria-label={`Jumlah halaman dokumen ${i + 1}`} title="Jumlah halaman"
        onChange={(e) => onUbah({ pages: Math.max(0, Number(e.target.value)) })} className={cx(inputCls, 'order-4 !w-[64px] flex-none !px-1 text-center font-semibold')} />}
      <button type="button" onClick={onLepas} aria-label={`Lepas dokumen ${i + 1}`} title="Lepas dokumen" className="order-5 grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[#6B7088] hover:bg-rose-50 hover:text-rose-600 max-md:order-2 max-md:h-11 max-md:w-11"><X className="h-4 w-4" /></button>
    </Tag>
  )
}

/** Item invoice Zoho → baris-baris isinya (untuk disejajarkan dengan baris dokumen). Baris pembuka sebelum daftar bernomor (mis. "IND-ENG") jadi keterangan. Harga tidak dipakai. */
export function bacaItemInvoice(it) {
  if (!it) return { ket: '', baris: [] }
  const semua = String(it.description || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
  const bernomor = (x) => /^\d{1,3}[.)]\s+/.test(x)
  const awal = semua.findIndex(bernomor)
  const kepala = awal > 0 ? semua.slice(0, awal) : []
  const baris = (awal >= 0 ? semua.slice(awal) : semua).map((x) => x.replace(/^\d{1,3}[.)]\s+/, ''))
  const jumlah = it.quantity ? `${it.quantity} ${it.unit || ''}`.trim() : ''
  return { ket: [...kepala, jumlah].filter(Boolean).join(' · '), baris }
}

export default function SubBaris({ n, sub, onChange, onRemove, branch, error, onPecah, daftarTr = [], onKeduanya, onApostilleHasil, prioProject = 'Normal', duaKolom, zoho, noZoho }) {
  const { data } = useApp()
  const [seret, setSeret] = useState(false)
  const [bacaId, setBacaId] = useState(null)
  const [massal, setMassal] = useState(null) // upload massal yang sedang dipasangkan: { files, ke }
  const [sibuk, setSibuk] = useState(false)
  const [teks, setTeks] = useState(() => points(sub.description).join('; '))
  const set = (patch) => onChange({ ...sub, ...patch })
  const extra = (SUB_TYPES[sub.type] ?? SUB_TYPES.jasa_lain).extra
  const errOn = (word) => !!error && error.toLowerCase().includes(word)
  const of = (type) => data.people.filter((p) => p.type === type && (p.branch === branch || p.branch === 'Semua'))
  const pakaiDok = usesDocs(sub.type)
  const docs = pakaiDok ? docsOf(sub).filter(terisi) : []
  const maks = MAKS_DOK[sub.type] || 0
  const setDocs = (next) => set(fromDocs(next.length ? nomori(sub, next) : [{ desc: '', pages: 1 }]))
  const ubahDok = (i, patch) => setDocs(docs.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const kosong = barisKosong(docs)
  /**
   * Upload banyak file. Bila sub sudah punya isi bernama yang belum ada filenya (mis. ditarik dari invoice),
   * file TIDAK langsung ditempel berurutan: pengguna memilih dulu "Gunakan file ini untuk …" (tebakan dari nama file, bisa diganti).
   */
  const pasang = async (files) => {
    const list = [...(files || [])]; if (!list.length) return
    if (kosong.length && !(list.length === 1 && kosong.length === 1)) { setMassal({ files: list, ke: cocokkanFile(list, docs, kosong) }); return }
    const r = await pasangKeSub(sub, list); onChange(r.sub); if (r.sisa.length) onPecah?.(r.sisa, r.sub)
  }
  const pasangMassal = async () => {
    if (!massal || sibuk) return
    setSibuk(true)
    try { const r = await pasangPilihan(sub, massal.files, massal.ke); onChange(r.sub); setMassal(null); if (r.sisa.length) onPecah?.(r.sisa, r.sub) } finally { setSibuk(false) }
  }
  const nPasang = massal ? massal.ke.filter((k) => k !== 'lewati').length : 0
  /** Pasang SATU file ke baris dokumen tertentu (baris bernama yang belum ada filenya). */
  const pasangSatu = async (i, f) => { const hal = await hitungHalaman(f).catch(() => 0); setDocs(docs.map((d, j) => (j === i ? { ...d, pages: hal > 0 ? hal : (d.pages || 1), file: f, file_name: `${safeName(tanpaNo(d.desc)) || 'dokumen'}${extOf(f.name)}`, name_edited: true } : d))) }
  const catTarik = sub._tarik?.catatan || []
  const jenisOps = opsiJenis(sub)
  // Apostille atas HASIL TERJEMAHAN: tidak ada file yang diunggah sekarang — sub ini menunggu hasil dari sub terjemahan yang dipilih.
  const tunggu = sub.type === 'apostille' && sub.objek === 'terjemahan'
  const pilihSumber = (ref) => { const t = daftarTr.find((x) => String(x.ref) === String(ref)); onChange({ ...sub, sumber_sub: t ? t.ref : '', ...fromDocs(t ? [{ desc: `Hasil terjemahan — ${t.nama}`, pages: 1 }] : [{ desc: '', pages: 1 }]) }) }
  const pilihObjek = (v) => {
    if (v === 'keduanya' && onKeduanya) return onKeduanya()
    if (v === 'terjemahan') { const t = daftarTr.length === 1 ? daftarTr[0] : daftarTr.find((x) => String(x.ref) === String(sub.sumber_sub)); return onChange({ ...sub, objek: v, sumber_sub: t ? t.ref : '', ...fromDocs(t ? [{ desc: `Hasil terjemahan — ${t.nama}`, pages: 1 }] : [{ desc: '', pages: 1 }]) }) }
    onChange({ ...sub, objek: v, ...(sub.sumber_sub ? { sumber_sub: '', ...fromDocs([{ desc: '', pages: 1 }]) } : {}) })
  }
  const setBahasa = (patch) => onChange(rapikanJenis({ ...sub, ...patch }))
  const gantiJenisSub = (k) => {
    const dasar = usesDocs(k) ? { ...sub, type: k, ...fromDocs(docsOf(sub).slice(0, MAKS_DOK[k] || undefined)) } : { ...sub, type: k }
    if (['apostille', 'legalisasi'].includes(k) && !dasar.executor_id) { const b = subBaru(k, data); dasar.executor_kind = b.executor_kind; dasar.executor_id = b.executor_id }
    setMassal(null)
    onChange(rapikanJenis(dasar))
  }

  // ID pemohon: KTP atau paspor. Nomor KTP dibaca otomatis (apa adanya — hanya dipakai bila tepat 16 angka);
  // nomor paspor belum dibaca otomatis → diketik. Selalu bisa dikoreksi.
  const unggahId = async (f) => {
    const paspor = /pas+por|passport/i.test(f.name)
    onChange({ ...sub, applicant_file: f, _id_ikut: false, _id_lepas: false, applicant_id_type: paspor ? 'paspor' : (sub.applicant_id_type || 'ktp') })
    if (String(sub.applicant_id || '').trim()) return
    if (paspor) { setBacaId({ paspor: true }); return }
    setBacaId('baca')
    try {
      const { bacaKtp } = await import('../lib/ktpOcr.js')
      const r = await bacaKtp(f, f.name)
      const nik = String(r?.nilai?.nik?.v || '').replace(/\s/g, '')
      if (/^\d{16}$/.test(nik)) { onChange({ ...sub, applicant_file: f, applicant_id_type: 'ktp', applicant_id: nik }); setBacaId({ ok: true, mesin: r.mesinLabel || 'pembaca otomatis' }) }
      else if (/pas+por|passport/i.test(String(r?.catatan || ''))) { onChange({ ...sub, applicant_file: f, applicant_id_type: 'paspor' }); setBacaId({ paspor: true }) }
      else setBacaId({ gagal: true })
    } catch { setBacaId({ gagal: true }) }
  }
  const tipeId = sub.applicant_id_type || 'ktp'
  const adaId = !!sub.applicant_file || !!sub.data?.dokumen_id
  const ketId = bacaId === 'baca' ? 'Membaca nomor dari KTP…'
    : bacaId?.ok ? 'Terbaca otomatis — cocokkan dengan KTP.'
    : bacaId?.paspor ? 'Paspor: ketik nomornya.'
    : bacaId?.gagal ? 'Nomor tidak terbaca — ketik manual.' : ''
  const ketIkut = sub._id_ikut && sub.applicant_file ? 'ID sama dengan sub di atas.' : ''
  const lembaga = extra.includes('institution') ? of('lembaga').find((p) => p.id === sub.institution) : null
  const nHal = docs.reduce((a, d) => a + (Number(d.pages) || 0), 0)
  const tema = TEMA[sub.type] || TEMA.jasa_lain
  const tr = isTerjemahan(sub.type)
  const al = ['apostille', 'legalisasi'].includes(sub.type)
  const labelUnggah = seret ? 'Lepas file di sini' : kosong.length ? 'Upload massal' : docs.length ? 'Upload file lagi' : 'Upload file'
  // Terjemahan ke VENDOR: file tidak wajib diunggah saat membuat project — cukup nama dokumennya (tombol "+ Dokumen").
  const keVendor = tr && (sub.translator_kind === 'vendor' || perluVendor(sub))
  const tambahBaris = () => setDocs([...docs, { desc: `Dokumen ${docs.length + 1}`, pages: 1, ...(tr && jenisOps[0] ? { kind: jenisOps[0][0] } : {}) }])
  const judulDok = tr
    ? (docs.length ? `Dokumen · ${docs.length} · ${nHal} hlm` : keVendor ? 'Dokumen · file tidak wajib' : 'Dokumen · belum ada file')
    : tunggu ? 'Dokumen · menunggu hasil terjemahan'
    : `${sub.type === 'legalisasi' ? 'Dokumen yang dilegalisasi' : 'Dokumen yang diapostille'}${docs.length ? ` · ${docs.length} dokumen` : ' · belum ada file'}`

  const dua = !!duaKolom
  const elAtas = (
      <div className="flex flex-wrap items-end gap-2.5" data-sub-atas>
        <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-[#141B34] text-sm font-extrabold text-white max-md:order-[-3] max-md:h-11 max-md:w-11" aria-label={`Sub project ${n}`}>{n}</span>
        <Kol label="Kategori" hp="sisa" className="max-md:order-[-2] md:max-w-[300px]" style={{ flex: '1.2 1 190px' }}>
          <select value={sub.type} onChange={(e) => gantiJenisSub(e.target.value)} aria-label={`Jenis sub project ${n}`} title="Kategori sub project — bisa diganti" data-jenis-sub
            className={cx('h-9 w-full min-w-0 cursor-pointer rounded-[10px] border-0 py-0 pl-3 pr-8 text-sm font-bold !text-white focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 max-md:h-11 max-md:text-base', tema.blok)}>
            {Object.entries(SUB_TYPES).map(([k, t]) => <option key={k} value={k} className="bg-white text-ink">{t.label}</option>)}
          </select>
        </Kol>

        {extra.includes('lang') && (
          <Kol label="Bahasa" wajib style={{ flex: '1.6 1 250px' }}>
            <div className="flex items-center gap-1.5">
              <select value={sub.lang_from} onChange={(e) => setBahasa({ lang_from: e.target.value })} aria-label="Bahasa asal" className={cx(inputCls, '!px-2')}>{LANGS.map((x) => <option key={x}>{x}</option>)}</select>
              <span aria-hidden className="text-[#4F5470]">→</span>
              <select value={sub.lang_to || ''} onChange={(e) => setBahasa({ lang_to: e.target.value })} aria-label="Bahasa tujuan" aria-invalid={!sub.lang_to} data-bahasa-tujuan
                className={cx(inputCls, '!px-2', !sub.lang_to && '!ring-[#B4233F]', errOn('bahasa tujuan') && '!ring-2')}>
                <option value="">Pilih tujuan…</option>{LANGS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
          </Kol>
        )}
        {extra.includes('country') && (
          <Kol label="Tujuan negara" wajib hp="half" style={{ flex: '1 1 140px' }}>
            <PilihCari ringkas label="Tujuan negara" invalid={errOn('negara')} value={sub.country} onChange={(v) => set({ country: v })} options={COUNTRIES} placeholder="Pilih negara…" kosong="Negara tidak ditemukan" />
          </Kol>
        )}
        {extra.includes('institution') && (
          <Kol label="Lembaga" wajib hp="half" style={{ flex: '1.4 1 170px' }}>
            <PilihLembaga ringkas branch={branch} invalid={errOn('lembaga')} value={sub.institution} onChange={(v) => set({ institution: v })} />
          </Kol>
        )}
        {extra.includes('objek') && (
          <Kol label="Yang diapostille" wajib hp="half" style={{ flex: '1 1 140px' }}>
            <select value={sub.objek || ''} onChange={(e) => pilihObjek(e.target.value)} data-objek aria-label="Yang diapostille" aria-invalid={errOn('yang diapostille')} className={cx(inputCls, '!px-2', errOn('yang diapostille') && '!ring-2 !ring-rose-500')}>
              <option value="">Pilih…</option>{OBJEK_APOSTILLE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Kol>
        )}
        {!pakaiDok && (
          <Kol label="Halaman" hp="half" style={{ flex: '0 0 84px' }}>
            <input type="number" min="0" inputMode="numeric" value={sub.pages} aria-label="Jumlah halaman" onChange={(e) => set({ pages: Number(e.target.value), pages_manual: true })} className={cx(inputCls, 'text-center font-semibold')} />
          </Kol>
        )}
        <Kol label="Prioritas" hp="half" style={{ flex: '0 0 164px' }}>
          <PrioritasSub value={sub.priority || prioProject} onChange={(v) => set({ priority: v })} />
        </Kol>
        {extra.includes('translator') && (
          <Kol label={perluVendor(sub) ? 'Penerjemah · vendor' : 'Penerjemah'} hp="half" style={{ flex: '1.3 1 180px' }}>
            <PilihCari ringkas label="Penerjemah" placeholder="Ditentukan Direktur"
              value={sub.translator ? `${sub.translator_kind || 'translator'}:${sub.translator}` : ''}
              onChange={(v) => { const [kind, id] = String(v).split(':'); set({ translator_kind: id ? (kind || '') : '', translator: id || '' }) }}
              options={[
                { value: '', label: 'Ditentukan Direktur', note: 'Biarkan kosong' },
                ...(perluVendor(sub) ? [] : data.users.filter((u) => u.role === 'penerjemah' && u.active !== false)).map((u) => ({ value: `translator:${u.id}`, label: u.name, note: `Penerjemah internal · ${placeOf(u)}` })),
                ...of('vendor').filter((p) => !vendorEksekutor(p, data.people) && (perluVendor(sub) ? !p.biro : !!p.biro)).map((p) => ({ value: `vendor:${p.id}`, label: p.name, note: p.biro ? 'Biro rekanan' : 'Vendor eksternal' })),
              ]} kosong="Penerjemah / vendor tidak ditemukan" />
          </Kol>
        )}
        {extra.includes('translator_nt') && (
          <Kol label="Penerjemah" wajib hp="half" style={{ flex: '1.3 1 180px' }}>
            <PilihCari ringkas label="Penerjemah" placeholder="— Pilih penerjemah —" invalid={errOn('penerjemah')} value={sub.translator || ''} onChange={(v) => set({ translator_kind: 'translator', translator: v })}
              options={data.users.filter((u) => u.role === 'penerjemah' && u.active !== false).map((u) => ({ value: u.id, label: u.name, note: placeOf(u) }))} kosong="Penerjemah tidak ditemukan" />
          </Kol>
        )}
        {(extra.includes('executor') || extra.includes('executor_opt')) && (
          <Kol label={extra.includes('executor') ? 'Eksekutor' : 'Eksekutor · tidak wajib'} wajib={extra.includes('executor')} style={{ flex: '1.3 1 170px' }}>
            <select value={sub.executor_id ? `${sub.executor_kind}:${sub.executor_id}` : ''} aria-label="Eksekutor" aria-invalid={errOn('eksekutor')} data-eksekutor
              onChange={(e) => { const [kind, id] = e.target.value.split(':'); set({ executor_kind: kind || '', executor_id: id || '' }) }} className={cx(inputCls, '!px-2', errOn('eksekutor') && '!ring-2 !ring-rose-500')}>
              <option value="">{extra.includes('executor') ? 'Pilih eksekutor…' : 'Belum ditentukan'}</option>
              <optgroup label="Internal">{data.users.filter((u) => u.role === 'staf_apostille' && u.active !== false).map((u) => <option key={u.id} value={`staff:${u.id}`}>{u.name}</option>)}</optgroup>
              <optgroup label="Eksternal">{of('vendor').filter((p) => vendorEksekutor(p, data.people) || (sub.executor_kind === 'vendor' && sub.executor_id === p.id)).map((p) => <option key={p.id} value={`vendor:${p.id}`}>{p.name}</option>)}</optgroup>
            </select>
          </Kol>
        )}
        {al && (
          <Kol label={sub.type === 'legalisasi' ? 'ID pemohon · tidak wajib' : 'ID pemohon · KTP / Paspor'} wajib={sub.type === 'apostille'} style={{ flex: '1.8 1 230px' }}>
            {adaId ? (
              <div className="flex h-9 min-w-0 items-center gap-1 rounded-[10px] bg-[#EEEBFF] pl-2 pr-1 text-[#3B2F9E] ring-1 ring-[#D4CEFA] max-md:h-11" data-id-pemohon={tipeId}>
                <IdCard className="h-4 w-4 shrink-0" />
                <select value={tipeId} onChange={(e) => set({ applicant_id_type: e.target.value })} aria-label="Jenis ID pemohon" className="h-[26px] !w-[88px] flex-none cursor-pointer rounded-md border-0 bg-transparent bg-[length:14px] bg-[right_2px_center] py-0 pl-1 pr-5 text-[13px] font-bold focus:outline-none focus:ring-2 focus:ring-brand max-md:h-9 max-md:text-base">
                  <option value="ktp">KTP</option><option value="paspor">Paspor</option><option value="lain">NIB / SK</option>
                </select>
                <input value={sub.applicant_id || ''} onChange={(e) => set({ applicant_id: e.target.value, _id_ikut: false })} aria-label="Nomor ID pemohon" placeholder={tipeId === 'paspor' ? 'No. paspor' : tipeId === 'ktp' ? 'No. KTP (NIK)' : 'No. NIB / SK'} data-nomor-id
                  className="h-[26px] min-w-0 flex-1 rounded-md border-0 bg-white px-1.5 text-[13px] font-bold text-[#2A2170] focus:outline-none focus:ring-2 focus:ring-brand max-md:h-9 max-md:text-base" />
                {sub.applicant_file && <button type="button" onClick={() => { set({ applicant_file: null, applicant_id: sub._id_ikut ? '' : sub.applicant_id, _id_ikut: false, _id_lepas: true }); setBacaId(null) }} aria-label="Lepas file ID pemohon" title={sub.applicant_file.name} className="grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-white hover:text-rose-600 max-md:h-9 max-md:w-9"><X className="h-3.5 w-3.5" /></button>}
              </div>
            ) : (
              <label data-upload-id className={cx('flex h-9 w-full min-w-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-dashed bg-white px-2 text-[13px] font-bold max-md:h-11', errOn('id / dokumen pemohon') ? 'border-rose-500 text-rose-700' : 'border-[#8C7FE6] text-[#3B2F9E]')}>
                <Upload className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Upload KTP / Paspor</span>
                <input type="file" className="hidden" accept="image/*,application/pdf" aria-label="File ID pemohon (KTP / paspor)" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) unggahId(f) }} />
              </label>
            )}
          </Kol>
        )}

        {onRemove && <button type="button" onClick={onRemove} aria-label={`Hapus sub project ${n}`} title="Hapus sub project" className="ml-auto grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[#6B7088] hover:bg-white hover:text-rose-600 max-md:order-[-1] max-md:ml-0 max-md:h-11 max-md:w-11"><Trash2 className="h-[18px] w-[18px]" /></button>}
      </div>
  )
  const elDeskripsi = (
          <Kol label="Nama jasa · pisahkan dengan titik koma (;)" wajib>
            <TeksPanjang value={teks} aria-invalid={errOn('deskripsi')} placeholder="mis. Akta Kelahiran; KK" aria-label="Deskripsi dokumen"
              onChange={(v) => { setTeks(v); const raw = v.split(';').filter((t) => t.trim()); const description = raw.map((t, i) => `${i + 1}. ${t.replace(/^\s+/, '')}`).join('\n'); const jml = points(description).length; set({ description: v.trim() ? description : '', file_count: jml, ...(sub.pages_manual ? {} : { pages: jml }) }) }}
              className={cx(inputCls, '!h-auto min-h-9 py-2 leading-snug max-md:min-h-11 max-md:py-2.5', errOn('deskripsi') && '!ring-2 !ring-rose-500')} />
          </Kol>
  )
  const elKepala = (
            <div className="flex items-center gap-2 px-2.5 text-[11px] font-semibold text-[#4F5470]">
              <span className="min-w-0 flex-1 truncate">{judulDok}{!(keVendor && !docs.length) && <span className="text-[#B4233F]"> *</span>}{tr && jenisOps.length > 0 && <span className="md:hidden"> · jenis: {jenisOps.map(([, l]) => l).join(' / ')}</span>}</span>
              {tr && docs.length > 0 && jenisOps.length > 0 && <span className="w-[132px] flex-none max-md:hidden">Jenis<span className="text-[#B4233F]"> *</span></span>}
              {tr && docs.length > 0 && <span className="w-[64px] flex-none text-center max-md:hidden">Hlm</span>}
              {docs.length > 0 && <span className="w-9 flex-none max-md:hidden" />}
            </div>
  )
  const elSumber = (daftarTr.length
                ? <select value={sub.sumber_sub ? String(sub.sumber_sub) : ''} onChange={(e) => pilihSumber(e.target.value)} aria-label="Hasil terjemahan dari sub project" aria-invalid={errOn('dokumen')} data-sumber-sub
                    className={cx(inputCls, '!px-2 font-semibold', !sub.sumber_sub && '!ring-[#B4233F]', errOn('dokumen') && '!ring-2')}>
                    <option value="">Pilih hasil terjemahan yang mana…</option>{daftarTr.map((t) => <option key={String(t.ref)} value={String(t.ref)}>Sub {t.n} · {t.nama}</option>)}
                  </select>
                : <p className="flex min-h-9 items-center rounded-[10px] bg-amber-50 px-2.5 text-xs text-amber-900 ring-1 ring-amber-200 max-md:min-h-11" data-tanpa-tr>Tambahkan sub Terjemahan dulu.</p>)
  const elMassal = massal && (
                    <div className="rounded-xl bg-white p-3 ring-1 ring-[#C9CCE0]" data-upload-massal role="group" aria-label="Pasangkan file upload massal">
                      <p className="text-sm font-bold text-ink">Upload massal · {massal.files.length} file dipilih</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-[#4F5470]">Pasangan ditebak dari nama file — periksa dulu.</p>
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {massal.files.map((f, k) => {
                          const v = massal.ke[k]
                          return (
                            <li key={k} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-slate-50 px-2.5 py-2 ring-1 ring-slate-200" data-massal-file>
                              <div className="min-w-0 flex-1 max-md:basis-full">
                                <p className="text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{f.name}</p>
                                <p className={cx('text-[11px]', typeof v === 'number' ? 'text-[#17693A]' : v === 'baru' ? 'text-[#8A4B00]' : 'text-[#6B7088]')}>
                                  {typeof v === 'number' ? 'Terpasang' : v === 'baru' ? 'Jadi dokumen baru' : 'Dilewati'}
                                </p>
                              </div>
                              <label className="flex min-w-0 flex-col gap-[3px] md:w-[280px] md:flex-none max-md:basis-full">
                                <span className="text-[11px] font-semibold text-[#4F5470]">Gunakan file ini untuk</span>
                                <select value={String(v)} data-massal-pilih aria-label={`Gunakan file ${f.name} untuk`}
                                  onChange={(e) => { const x = e.target.value; setMassal((m) => ({ ...m, ke: m.ke.map((y, j) => (j === k ? (x === 'baru' || x === 'lewati' ? x : Number(x)) : y)) })) }}
                                  className={cx(inputCls, '!px-2 font-semibold')}>
                                  {kosong.map((di) => <option key={di} value={String(di)} disabled={massal.ke.some((y, j) => j !== k && y === di)}>{di + 1} · {tanpaNo(docs[di].desc)}</option>)}
                                  <option value="baru">Jadikan dokumen baru</option>
                                  <option value="lewati">Lewati file ini</option>
                                </select>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                      <div className="mt-2.5 flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => setMassal(null)} disabled={sibuk} className="h-9 rounded-[10px] bg-white px-4 text-[13px] font-bold text-ink ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60 max-md:h-11 max-md:flex-1">Batal</button>
                        <button type="button" onClick={pasangMassal} disabled={sibuk || !nPasang} data-massal-pasang className="h-9 rounded-[10px] bg-[#3457D5] px-4 text-[13px] font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 max-md:h-11 max-md:flex-1">{sibuk ? 'Memasang…' : `Pasang ${nPasang} file`}</button>
                      </div>
                    </div>
  )
  const elUnggah = !massal && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <TombolUnggah data="data-unggah-banyak" salah={errOn('dokumen')} label={labelUnggah} onFiles={pasang} className="md:w-auto md:px-5" />
                      {keVendor && (!maks || docs.length < maks) && <button type="button" onClick={tambahBaris} data-aksi="tambah-dokumen" className="inline-flex h-9 items-center gap-1 rounded-[10px] bg-white px-3 text-[13px] font-bold text-ink ring-1 ring-[#D9DBE7] hover:ring-ink max-md:h-11">+ Dokumen</button>}
                      {onApostilleHasil && sub.type === 'terjemahan' && docs.length > 0 && <button type="button" onClick={onApostilleHasil} data-aksi="apostille-hasil" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-xs font-semibold text-[#17693A] hover:underline max-md:min-h-11">+ Apostille hasil terjemahan ini</button>}
                    </div>
  )
  const elCatatan = (
    <>
      {(ketId || ketIkut || lembaga?.note || error || catTarik.length > 0) && (
        <div className="mt-2 space-y-1">
          {catTarik.length > 0 && <ul className="space-y-0.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-violet-900 ring-1 ring-violet-200" data-catatan-tarik>{sub._tarik.judul && <li className="font-bold">{sub._tarik.sumber === 'drive' ? 'Dari folder Drive' : 'Dari item invoice'}: {sub._tarik.judul}</li>}{catTarik.map((c, k) => <li key={k}>• {c}</li>)}</ul>}
          {ketId && <p className="text-[11px] text-[#3B2F9E]" data-ket-id>{ketId}</p>}
          {!ketId && ketIkut && <p className="text-[11px] text-[#3B2F9E]" data-ket-ikut>{ketIkut}</p>}
          {lembaga?.note && <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-900 ring-1 ring-amber-200">{lembaga.note}</p>}
          {error && <FieldError>{error}</FieldError>}
        </div>
      )}
    </>
  )
  const berkas = (d, i, sebagai) => <Berkas key={i} sebagai={sebagai} d={d} i={i} jenisOps={tr ? jenisOps : []} pakaiHal={tr} onUbah={(p) => ubahDok(i, p)} onFile={(f) => pasangSatu(i, f)} onLepas={() => setDocs(docs.filter((_, j) => j !== i))} />
  const seretProps = {
    onDragOver: pakaiDok ? (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.stopPropagation(); setSeret(true) } } : undefined,
    onDragLeave: pakaiDok ? () => setSeret(false) : undefined,
    onDrop: pakaiDok ? (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); e.stopPropagation(); setSeret(false); pasang(e.dataTransfer.files) } } : undefined,
  }

  if (dua) {
    // DUA KOLOM (≥ 1280px): kiri = item invoice Zoho (hanya baca), kanan = isian. Tiap baris isi invoice sejajar dengan baris dokumennya.
    // Di bawah itu (HP, tablet, laptop kecil) kolom kiri disembunyikan (daftar item invoice tetap ada di atas) dan kolom kanan tersusun seperti kartu biasa.
    const z = bacaItemInvoice(zoho)
    const barisBiasa = pakaiDok && !tunggu
    const nBaris = barisBiasa ? Math.max(z.baris.length, docs.length) : z.baris.length
    const kiri = 'max-xl:hidden xl:col-start-1 border-x border-emerald-200 bg-white px-3'
    const kanan = cx('xl:col-start-2 border-x px-3 md:px-3.5', tema.sel)
    const selZoho = (teks, k) => (
      <div className="flex h-full min-h-9 items-center gap-2 rounded-[10px] bg-slate-50 px-2.5 py-1 text-[12.5px] leading-snug text-ink-soft" data-zoho-baris>
        <span className="w-5 flex-none text-right font-bold text-[#8A8FA8]">{k + 1}.</span><span className="min-w-0 cursor-text select-text [overflow-wrap:anywhere]">{teks}</span>
      </div>
    )
    return (
      <div data-sub-baris={sub.type} data-n={n} data-dua {...seretProps}
        className={cx('rounded-2xl xl:grid xl:gap-x-3 xl:[grid-template-columns:var(--sub-kiri,42%)_minmax(0,1fr)]', seret ? 'ring-2 ring-brand' : error ? 'ring-2 ring-rose-400' : '')}>
        <div className={cx(kiri, 'flex flex-col gap-1 rounded-t-2xl border-t pb-2 pt-3 md:pt-3.5')} data-zoho-item={zoho ? '' : 'kosong'}>
          {zoho ? (
            <>
              <div className="flex items-start gap-2">
                <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-emerald-50 text-[13px] font-extrabold text-emerald-800">{noZoho || n}</span>
                <p className="min-w-0 flex-1 cursor-text select-text pt-1 text-[13px] font-bold leading-snug text-ink [overflow-wrap:anywhere]">{zoho.name || 'Item'}</p>
              </div>
              {z.ket && <p className="pl-9 text-[11px] text-[#4F5470] [overflow-wrap:anywhere]">{z.ket}</p>}
            </>
          ) : <p className="rounded-[10px] border border-dashed border-slate-300 px-2.5 py-2 text-xs text-[#6B7088]">Bukan dari invoice</p>}
        </div>
        <div className={cx(kanan, 'rounded-t-2xl border-t pb-2 pt-3 md:pt-3.5')}>{elAtas}</div>

        <div className={cx(kiri, 'border-t border-t-slate-100 pb-1 pt-2 text-[11px] font-semibold text-[#4F5470]')}>{zoho ? `Isi invoice · ${z.baris.length} baris` : ''}</div>
        <div className={cx(kanan, 'pb-1 pt-1')}><div className="border-t border-[#141B34]/[.12] pt-2">{pakaiDok ? elKepala : null}</div></div>

        {!barisBiasa && nBaris === 0 && <div className={cx(kanan, 'py-[3px]')}>{!pakaiDok ? elDeskripsi : elSumber}</div>}
        {Array.from({ length: nBaris }, (_, k) => (
          <Fragment key={k}>
            <div className={cx(kiri, 'py-[3px]')}>{z.baris[k] != null ? selZoho(z.baris[k], k) : null}</div>
            {barisBiasa && <div className={cx(kanan, 'py-[3px]')} {...(al && k === 0 ? { 'data-dok-al': '' } : {})}>{docs[k] ? berkas(docs[k], k, 'div') : null}</div>}
            {!barisBiasa && k === 0 && <div className={cx(kanan, 'py-[3px]')} style={{ gridRow: `span ${nBaris}` }}>{!pakaiDok ? elDeskripsi : elSumber}</div>}
          </Fragment>
        ))}

        <div className={cx(kiri, 'rounded-b-2xl border-b pb-3')} />
        <div className={cx(kanan, 'flex flex-col gap-2 rounded-b-2xl border-b pb-3 pt-1.5')}>
          {barisBiasa && elMassal}
          {barisBiasa && elUnggah}
          {elCatatan}
        </div>
      </div>
    )
  }

  return (
    <div data-sub-baris={sub.type} data-n={n} {...seretProps}
      className={cx('rounded-2xl p-3 ring-1 md:p-3.5', tema.kartu, seret ? '!ring-2 !ring-brand' : error ? '!ring-2 !ring-rose-400' : '')}>
      {/* Baris atas = pengaturan sub project. Kolom turun baris bila layar sempit; di HP: nomor · Kategori · hapus di baris pertama. */}
      {elAtas}

      {/* Di bawah pengaturan: dokumen selebar kartu — nama file panjang turun baris, tidak terpotong. */}
      <div className="mt-3 flex flex-col gap-2 border-t border-[#141B34]/[.12] pt-3" data-sub-dok>
        {!pakaiDok && elDeskripsi}
        {pakaiDok && (
          <>
            {elKepala}
            {tunggu ? elSumber : (
              <>
                {docs.length > 0 && (
                  <ul className="flex flex-col gap-1.5" {...(al ? { 'data-dok-al': '' } : {})}>
                    {docs.map((d, i) => berkas(d, i))}
                  </ul>
                )}
                {elMassal}
                {elUnggah}
              </>
            )}
          </>
        )}
      </div>

      {elCatatan}
    </div>
  )
}
