import { useState } from 'react'
import { Trash2, Upload, Paperclip, X, IdCard } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { SUB_TYPES, COUNTRIES, OBJEK_APOSTILLE, points } from '../config/subtypes.js'
import { FieldError, cx } from './ui.jsx'
import { placeOf, perluVendor } from '../config/access.js'
import PilihCari from './PilihCari.jsx'
import { newSub, usesDocs, isTerjemahan, docsOf, fromDocs, docFileName, safeName, MAKS_DOK, hitungHalaman } from './SubProjectEditor.jsx'

/**
 * Sub project SATU BARIS — dipakai di halaman penuh "Project Baru".
 * Isiannya ke samping; di HP tiap kolom turun rapi (penuh / setengah lebar).
 * Dokumen hanya lewat satu tombol "Upload / tarik file (bisa banyak)":
 *  • terjemahan: tiap file = satu baris dokumen di sub yang sama
 *  • apostille / legalisasi: satu sub = satu dokumen; file berikutnya jadi sub sendiri (onPecah)
 */
const LANGS = ['Indonesia', 'Inggris', 'Mandarin', 'Jepang', 'Korea', 'Arab', 'Belanda', 'Jerman', 'Prancis', 'Spanyol', 'Rusia', 'Lainnya']
/** Reguler / Non Reguler hanya untuk pasangan bahasa Indonesia · Inggris · Belanda. Bahasa lain: Normal / Ekspres. */
const BHS_REGULER = ['Indonesia', 'Inggris', 'Belanda']
export const opsiJenis = (sub) => (BHS_REGULER.includes(sub.lang_from) && (!sub.lang_to || BHS_REGULER.includes(sub.lang_to))
  ? [['reguler', 'Reguler'], ['non_reguler', 'Non Reguler']]
  : [['normal', 'Normal'], ['ekspres', 'Ekspres']])
/** Jenis dokumen disesuaikan saat bahasa berubah: jenis yang tidak berlaku lagi kembali ke pilihan pertama. */
const rapikanJenis = (sub) => {
  if (!isTerjemahan(sub.type) || !Array.isArray(sub.docs)) return Array.isArray(sub.docs) ? { ...sub, docs: sub.docs.map((d) => (d.file && d.file_name ? { ...d, file_name: tanpaNo(d.file_name) } : d)) } : sub
  const ops = opsiJenis(sub).map(([v]) => v)
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
 * Apostille & legalisasi (satu dokumen per sub): nomor urut otomatis di awal nama file, berurutan antar sub project
 * ("1. …", "2. …") — ikut bergeser saat sub ditambah / dihapus. Mengembalikan array yang sama bila tidak ada yang berubah.
 */
export function nomoriAntarSub(subs) {
  let n = 0; let ubah = false
  const hasil = subs.map((x) => {
    if (!['apostille', 'legalisasi'].includes(x.type) || !Array.isArray(x.docs)) return x
    const d = x.docs[0]; if (!d?.file) return x
    n += 1
    const nama = `${n}. ${tanpaNo(d.file_name ?? docFileName(d))}`; const desc = tanpaNo(d.desc)
    if (nama === d.file_name && desc === d.desc) return x
    ubah = true
    return { ...x, ...fromDocs([{ ...d, file_name: nama, desc }, ...x.docs.slice(1)]) }
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
  const jenis = isTerjemahan(sub.type) ? opsiJenis(sub)[0][0] : undefined
  list.forEach((f, n) => {
    if (maks && next.length >= maks) { sisa.push(f); return }
    const desc = namaDasar(f.name)
    next.push({ desc, pages: hal[n] > 0 ? hal[n] : 1, ...(jenis ? { kind: next[next.length - 1]?.kind || jenis } : {}), file: f, file_name: `${safeName(desc) || 'dokumen'}${extOf(f.name)}`, name_edited: false })
  })
  return { sub: { ...sub, ...fromDocs(next.length ? nomori(sub, next) : [{ desc: '', pages: 1 }]) }, sisa }
}

const inputCls = 'h-9 w-full min-w-0 rounded-[10px] border-0 bg-white px-2.5 text-sm text-ink ring-1 ring-[#D9DBE7] placeholder:text-slate-400 hover:ring-slate-400 focus:outline-none focus:ring-2 focus:ring-brand max-md:h-11 max-md:text-base'
const WARNA = { terjemahan: 'bg-[#EEF0F5] text-[#4A4F6A]', terjemahan_nt: 'bg-[#EEF0F5] text-[#4A4F6A]', apostille: 'bg-[#E2F5E8] text-[#17693A]', legalisasi: 'bg-[#FFF3C4] text-[#6B4E00]', jasa_lain: 'bg-[#EEEBFF] text-[#3B2F9E]' }

function Kol({ label, wajib, hp = 'full', className, style, children }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-[3px]', hp === 'half' ? 'max-md:!basis-[calc(50%-4px)] max-md:!grow' : 'max-md:!basis-full', className)} style={style}>
      <span className="truncate text-[11px] font-semibold text-[#5E6380]">{label}{wajib && <span className="text-[#B4233F]"> *</span>}</span>
      {children}
    </div>
  )
}

function TombolUnggah({ label, onFiles, banyak = true, salah, tinggi = 'h-9', data }) {
  return (
    <label {...(data ? { [data]: '' } : {})} className={cx('flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] px-3 text-[13px] font-bold text-white hover:opacity-90 max-md:h-11', tinggi, salah ? 'bg-[#B4233F]' : 'bg-[#3457D5]')}>
      <Upload className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span>
      <input type="file" multiple={banyak} className="hidden" accept="application/pdf,image/*,.doc,.docx" aria-label={label}
        onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) onFiles(fs) }} />
    </label>
  )
}

/** Satu dokumen: nama (sekaligus nama file) bisa diganti; × = lepas dokumen dari sub. */
function Berkas({ d, i, onUbah, onLepas, className }) {
  const adaFile = !!d.file
  return (
    <div className={cx('flex h-9 min-w-0 items-center gap-1.5 rounded-[10px] pl-2 pr-1 ring-1 max-md:h-11', adaFile ? 'bg-[#E2F5E8] text-[#17693A] ring-[#B9E3C6]' : 'bg-slate-50 text-ink-mute ring-slate-200', className)}>
      <Paperclip className="h-3.5 w-3.5 shrink-0" />
      {d.existing && !adaFile
        ? <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{d.desc}</span>
        : <input value={adaFile ? (d.file_name ?? docFileName(d)) : d.desc} aria-label={`Nama dokumen / file ${i + 1}`} title="Nama dokumen sekaligus nama file — bisa diganti" data-nama-file
            onChange={(e) => onUbah(adaFile ? { file_name: e.target.value, name_edited: true, desc: namaDasar(e.target.value) } : { desc: e.target.value })}
            className="h-[26px] min-w-0 flex-1 rounded-md border-0 bg-white px-1.5 text-sm font-semibold text-[#124D2B] focus:outline-none focus:ring-2 focus:ring-brand max-md:h-9 max-md:text-base" />}
      <button type="button" onClick={onLepas} aria-label={`Lepas dokumen ${i + 1}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-white hover:text-rose-600 max-md:h-9 max-md:w-9"><X className="h-3.5 w-3.5" /></button>
    </div>
  )
}

export default function SubBaris({ n, sub, onChange, onRemove, branch, error, onPecah, daftarTr = [], onKeduanya, onApostilleHasil }) {
  const { data } = useApp()
  const [seret, setSeret] = useState(false)
  const [bacaId, setBacaId] = useState(null)
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
  const pasang = async (files) => { const r = await pasangKeSub(sub, files); onChange(r.sub); if (r.sisa.length) onPecah?.(r.sisa, r.sub) }
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
    : bacaId?.ok ? `Terbaca otomatis (${bacaId.mesin}) — cocokkan dengan KTP.`
    : bacaId?.paspor ? 'Paspor: ketik nomor paspornya — dipakai sebagai ID pemohon.'
    : bacaId?.gagal ? 'Nomor tidak terbaca otomatis — ketik manual.' : ''
  const ketIkut = sub._id_ikut && sub.applicant_file ? 'Memakai ID pemohon yang sama dengan sub di atas — lepas (×) lalu unggah lagi bila pemohonnya berbeda.' : ''
  const lembaga = extra.includes('institution') ? of('lembaga').find((p) => p.id === sub.institution) : null
  const nHal = docs.reduce((a, d) => a + (Number(d.pages) || 0), 0)

  return (
    <div data-sub-baris={sub.type} data-n={n}
      onDragOver={pakaiDok ? (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.stopPropagation(); setSeret(true) } } : undefined}
      onDragLeave={pakaiDok ? () => setSeret(false) : undefined}
      onDrop={pakaiDok ? (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); e.stopPropagation(); setSeret(false); pasang(e.dataTransfer.files) } } : undefined}
      className={cx('rounded-xl bg-white px-2.5 py-2 ring-1', seret ? 'ring-2 ring-brand' : error ? 'ring-2 ring-rose-400' : 'ring-[#E7E8F0]')}>
      {/* ≥1200px: selalu satu baris ke samping (kolom menyusut, tidak turun). Di bawah itu kolom turun rapi; tombol hapus tetap di sebelah jenis. */}
      <div className="flex flex-wrap items-start gap-2 min-[1200px]:flex-nowrap">
      <div className="flex h-9 flex-none items-center gap-1.5 md:mt-[19px] max-[1199px]:order-[-2] max-md:h-11 max-md:min-w-0 max-md:flex-[1_1_0%]">
        <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-lg bg-[#17693A] text-[13px] font-bold text-white">{n}</span>
        <select value={sub.type} onChange={(e) => gantiJenisSub(e.target.value)} aria-label={`Jenis sub project ${n}`} title="Jenis sub project — bisa diganti" data-jenis-sub
          className={cx('h-[26px] !w-auto min-w-0 max-w-[150px] cursor-pointer rounded-lg border-0 py-0 pl-2 pr-7 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand max-md:h-11 max-md:!w-full max-md:max-w-none max-md:flex-1 max-md:text-base', WARNA[sub.type] || WARNA.jasa_lain)}>
          {Object.entries(SUB_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
        </select>
      </div>

      {isTerjemahan(sub.type) && (
        <Kol label={docs.length ? `Dokumen · ${docs.length} file · ${nHal} hlm · jenis: ${jenisOps.map(([, l]) => l).join(' / ')}` : 'Dokumen · belum ada file'} wajib style={{ flex: '4 0.4 340px' }}>
          <div className="flex flex-col gap-1">
            {docs.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5 max-[359px]:flex-wrap" data-baris-dok>
                <Berkas d={d} i={i} className="flex-1" onUbah={(p) => ubahDok(i, p)} onLepas={() => setDocs(docs.filter((_, j) => j !== i))} />
                <select value={jenisOps.some(([v]) => v === (d.kind || 'reguler')) ? (d.kind || 'reguler') : jenisOps[0][0]} onChange={(e) => ubahDok(i, { kind: e.target.value })} aria-label={`Jenis dokumen ${i + 1}`} data-jenis-dok
                  className={cx(inputCls, '!w-[104px] flex-none !px-1.5 !text-[13px] font-semibold max-md:!w-[96px]')}>
                  {jenisOps.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <input type="number" min="1" inputMode="numeric" value={d.pages} aria-label={`Jumlah halaman dokumen ${i + 1}`} title="Jumlah halaman"
                  onChange={(e) => ubahDok(i, { pages: Math.max(0, Number(e.target.value)) })} className={cx(inputCls, '!w-[54px] flex-none !px-1 text-center font-semibold')} />
              </div>
            ))}
            <TombolUnggah data="data-unggah-banyak" salah={errOn('dokumen')} label={seret ? 'Lepas file di sini' : docs.length ? 'Upload / tarik file lagi (bisa banyak)' : 'Upload / tarik file (bisa banyak)'} onFiles={pasang} />
            {onApostilleHasil && sub.type === 'terjemahan' && docs.length > 0 && <button type="button" onClick={onApostilleHasil} data-aksi="apostille-hasil" className="inline-flex min-h-9 items-center gap-1 self-start rounded-lg px-1 text-xs font-semibold text-[#17693A] hover:underline max-md:min-h-11">+ Apostille hasil terjemahan ini</button>}
          </div>
        </Kol>
      )}

      {['apostille', 'legalisasi'].includes(sub.type) && (
        <Kol label={tunggu ? 'Dokumen · menunggu hasil terjemahan' : 'Dokumen'} wajib style={{ flex: '4 0.4 240px' }}>
          {tunggu
            ? (daftarTr.length
              ? <select value={sub.sumber_sub ? String(sub.sumber_sub) : ''} onChange={(e) => pilihSumber(e.target.value)} aria-label="Hasil terjemahan dari sub project" aria-invalid={errOn('dokumen')} data-sumber-sub
                  className={cx(inputCls, '!px-2 font-semibold', !sub.sumber_sub && '!ring-[#B4233F]', errOn('dokumen') && '!ring-2')}>
                  <option value="">Pilih hasil terjemahan yang mana…</option>{daftarTr.map((t) => <option key={String(t.ref)} value={String(t.ref)}>Sub {t.n} · {t.nama}</option>)}
                </select>
              : <p className="flex min-h-9 items-center rounded-[10px] bg-amber-50 px-2.5 text-xs text-amber-900 ring-1 ring-amber-200 max-md:min-h-11" data-tanpa-tr>Tambahkan dulu sub Terjemahan — hasilnya yang akan diapostille.</p>)
            : docs[0]
            ? <Berkas d={docs[0]} i={0} onUbah={(p) => ubahDok(0, p)} onLepas={() => setDocs([])} />
            : <TombolUnggah data="data-unggah-banyak" salah={errOn('dokumen')} label={seret ? 'Lepas file di sini' : 'Upload / tarik file (bisa banyak)'} onFiles={pasang} />}
        </Kol>
      )}

      {!pakaiDok && (
        <>
          <Kol label="Deskripsi · pisahkan tiap dokumen dengan titik koma (;)" wajib style={{ flex: '4 0.4 320px' }}>
            <input value={teks} aria-invalid={errOn('deskripsi')} placeholder="mis. Akta Kelahiran; Kartu Keluarga" aria-label="Deskripsi dokumen"
              onChange={(e) => { setTeks(e.target.value); const raw = e.target.value.split(';').filter((t) => t.trim()); const description = raw.map((t, i) => `${i + 1}. ${t.replace(/^\s+/, '')}`).join('\n'); const jml = points(description).length; set({ description: e.target.value.trim() ? description : '', file_count: jml, ...(sub.pages_manual ? {} : { pages: jml }) }) }}
              className={cx(inputCls, errOn('deskripsi') && '!ring-2 !ring-rose-500')} />
          </Kol>
          <Kol label="Halaman" hp="half" style={{ flex: '0 0 76px' }}>
            <input type="number" min="0" inputMode="numeric" value={sub.pages} aria-label="Jumlah halaman" onChange={(e) => set({ pages: Number(e.target.value), pages_manual: true })} className={cx(inputCls, 'text-center font-semibold')} />
          </Kol>
        </>
      )}

      {extra.includes('lang') && (
        <Kol label="Bahasa · tujuan wajib diisi" wajib style={{ flex: '1 1 210px' }}>
          <div className="flex items-center gap-1">
            <select value={sub.lang_from} onChange={(e) => setBahasa({ lang_from: e.target.value })} aria-label="Bahasa asal" className={cx(inputCls, '!px-2')}>{LANGS.map((x) => <option key={x}>{x}</option>)}</select>
            <span aria-hidden className="text-[#5E6380]">→</span>
            <select value={sub.lang_to || ''} onChange={(e) => setBahasa({ lang_to: e.target.value })} aria-label="Bahasa tujuan" aria-invalid={!sub.lang_to} data-bahasa-tujuan
              className={cx(inputCls, '!px-2', !sub.lang_to && '!ring-[#B4233F]', errOn('bahasa tujuan') && '!ring-2')}>
              <option value="">Pilih tujuan…</option>{LANGS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
        </Kol>
      )}

      {extra.includes('translator') && (
        <Kol label="Penerjemah" style={{ flex: '1 1 150px' }}>
          <PilihCari ringkas label="Penerjemah" placeholder="Ditentukan Direktur"
            value={sub.translator ? `${sub.translator_kind || 'translator'}:${sub.translator}` : ''}
            onChange={(v) => { const [kind, id] = String(v).split(':'); set({ translator_kind: id ? (kind || '') : '', translator: id || '' }) }}
            options={[
              { value: '', label: 'Ditentukan Direktur', note: 'Biarkan kosong' },
              ...(perluVendor(sub) ? [] : data.users.filter((u) => u.role === 'penerjemah' && u.active !== false)).map((u) => ({ value: `translator:${u.id}`, label: u.name, note: `Penerjemah internal · ${placeOf(u)}` })),
              ...of('vendor').filter((p) => (perluVendor(sub) ? !p.biro : !!p.biro)).map((p) => ({ value: `vendor:${p.id}`, label: p.name, note: p.biro ? 'Biro rekanan' : 'Vendor eksternal' })),
            ]} kosong="Penerjemah / vendor tidak ditemukan" />
        </Kol>
      )}
      {extra.includes('translator_nt') && (
        <Kol label="Penerjemah" wajib style={{ flex: '1 1 150px' }}>
          <PilihCari ringkas label="Penerjemah" placeholder="— Pilih penerjemah —" invalid={errOn('penerjemah')} value={sub.translator || ''} onChange={(v) => set({ translator_kind: 'translator', translator: v })}
            options={data.users.filter((u) => u.role === 'penerjemah' && u.active !== false).map((u) => ({ value: u.id, label: u.name, note: placeOf(u) }))} kosong="Penerjemah tidak ditemukan" />
        </Kol>
      )}

      {['apostille', 'legalisasi'].includes(sub.type) && (
        <Kol label="ID pemohon · KTP / Paspor" wajib style={{ flex: '1.6 1 200px' }}>
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
      {extra.includes('country') && (
        <Kol label="Tujuan negara" wajib hp="half" style={{ flex: '1 1 118px' }}>
          <PilihCari ringkas label="Tujuan negara" invalid={errOn('negara')} value={sub.country} onChange={(v) => set({ country: v })} options={COUNTRIES} placeholder="Pilih negara…" kosong="Negara tidak ditemukan" />
        </Kol>
      )}
      {extra.includes('institution') && (
        <Kol label="Lembaga" wajib hp="half" style={{ flex: '1 1 118px' }}>
          <PilihCari ringkas label="Lembaga" invalid={errOn('lembaga')} value={sub.institution} onChange={(v) => set({ institution: v })} placeholder="Pilih lembaga…" kosong="Lembaga tidak ditemukan"
            options={of('lembaga').map((p) => ({ value: p.id, label: p.name, note: p.note || '' }))} />
        </Kol>
      )}
      {extra.includes('objek') && (
        <Kol label="Yang diapostille" wajib hp="half" style={{ flex: '1 1 118px' }}>
          <select value={sub.objek || ''} onChange={(e) => pilihObjek(e.target.value)} data-objek aria-label="Yang diapostille" aria-invalid={errOn('yang diapostille')} className={cx(inputCls, '!px-2', errOn('yang diapostille') && '!ring-2 !ring-rose-500')}>
            <option value="">Pilih…</option>{OBJEK_APOSTILLE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Kol>
      )}
      {extra.includes('executor') && (
        <Kol label="Eksekutor" wajib style={{ flex: '1.2 1 140px' }}>
          <select value={sub.executor_id ? `${sub.executor_kind}:${sub.executor_id}` : ''} aria-label="Eksekutor" aria-invalid={errOn('eksekutor')} data-eksekutor
            onChange={(e) => { const [kind, id] = e.target.value.split(':'); set({ executor_kind: kind || '', executor_id: id || '' }) }} className={cx(inputCls, '!px-2', errOn('eksekutor') && '!ring-2 !ring-rose-500')}>
            <option value="">Pilih eksekutor…</option>
            <optgroup label="Staf Apostille / Legalisasi (internal)">{data.users.filter((u) => u.role === 'staf_apostille' && u.active !== false).map((u) => <option key={u.id} value={`staff:${u.id}`}>{u.name} · Staf Apostille / Legalisasi</option>)}</optgroup>
            <optgroup label="Vendor (luar)">{of('vendor').map((p) => <option key={p.id} value={`vendor:${p.id}`}>{p.name}</option>)}</optgroup>
          </select>
        </Kol>
      )}

      {onRemove
        ? <button type="button" onClick={onRemove} aria-label={`Hapus sub project ${n}`} title="Hapus sub project" className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[#8A8FA8] hover:bg-rose-50 hover:text-rose-600 md:mt-[19px] max-[1199px]:order-[-1] max-md:h-11 max-md:w-11"><Trash2 className="h-[18px] w-[18px]" /></button>
        : <span className="w-9 flex-none max-[1199px]:hidden" />}
      </div>

      {(ketId || ketIkut || lembaga?.note || error) && (
        <div className="mt-1.5 space-y-1">
          {ketId && <p className="text-[11px] text-[#3B2F9E]" data-ket-id>{ketId}</p>}
          {!ketId && ketIkut && <p className="text-[11px] text-[#3B2F9E]" data-ket-ikut>{ketIkut}</p>}
          {lembaga?.note && <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-900 ring-1 ring-amber-200">{lembaga.note}</p>}
          {error && <FieldError>{error}</FieldError>}
        </div>
      )}
    </div>
  )
}
