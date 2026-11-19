import { useLayoutEffect, useRef, useState, useEffect } from 'react'
import PilihLembaga from './PilihLembaga.jsx'
import { PrioritasSub } from './Priority.jsx'
import { Trash2, Plus, RotateCcw, Files, BookOpen, Languages, ArrowLeftRight, UserPen, Globe2, Landmark, UserCog, Stamp, ScrollText, Shapes, Lock, Upload, Paperclip, X, IdCard } from 'lucide-react'

const TYPE_ICON = { terjemahan: Languages, terjemahan_nt: Languages, apostille: Stamp, legalisasi: ScrollText, jasa_lain: Shapes }
import { useApp } from '../lib/store.jsx'
import { SUB_TYPES, COUNTRIES, OBJEK_APOSTILLE, points, renumber } from '../config/subtypes.js'
import { Field, FieldError, Input, Select, cx } from './ui.jsx'
import { placeOf } from '../config/access.js'
import { DONE, VENDOR_PAID_STAGES } from '../config/workflows.js'
import { boleh } from '../lib/izin.js'
import PilihCari from './PilihCari.jsx'
import { LANGS } from '../config/bahasa.js'


export const newSub = (type = 'terjemahan') => ({
  _k: Math.random(), type, description: '', file_count: 0, pages: 0, pages_manual: false, docs: usesDocs(type) ? [{ desc: '', pages: 1 }] : undefined,
  translator: '', translator_kind: '', lang_from: 'Indonesia', lang_to: 'Inggris', country: '', objek: '', institution: '', executor_kind: '', executor_id: '', applicant_id: '',
})

/** Textarea bernomor: Enter → baris baru dengan nomor berikutnya. */
function NumberedTextarea({ value, onChange, placeholder, invalid }) {
  const ref = useRef(null)
  const caretRef = useRef(null)
  // Pasang posisi kursor tepat setelah nilai baru dirender (sebelum ketikan berikutnya)
  useLayoutEffect(() => {
    if (caretRef.current !== null && ref.current) { ref.current.setSelectionRange(caretRef.current, caretRef.current); caretRef.current = null }
  }, [value])
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    const el = e.currentTarget
    const before = value.slice(0, el.selectionStart)
    const after = value.slice(el.selectionEnd)
    const next = renumber(before + '\n' + after)
    const lineIdx = before.split('\n').length // indeks baris baru
    const caret = next.split('\n').slice(0, lineIdx).join('\n').length + 1 + `${lineIdx + 1}. `.length
    caretRef.current = caret
    onChange(next)
  }
  return (
    <textarea ref={ref} rows={3} value={value} placeholder={placeholder} aria-invalid={invalid}
      onFocus={() => { if (!value) onChange('1. ') }}
      onBlur={() => { if (value.trim() && value.trim() !== '1.') onChange(renumber(value.split('\n').filter((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).join('\n'))) }}
      onKeyDown={onKeyDown} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border-0 bg-white px-3 py-2.5 text-sm leading-relaxed text-ink ring-1 ring-slate-300 placeholder:text-slate-400 hover:ring-slate-400 focus:outline-none focus:ring-2 focus:ring-brand aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-rose-500" />
  )
}

/** Jenis sub project yang detail dokumennya per baris (deskripsi + upload file per dokumen). */
/** Terjemahan tersumpah & non tersumpah: banyak dokumen dalam satu sub project (jenis + halaman per dokumen). */
export const isTerjemahan = (type) => type === 'terjemahan' || type === 'terjemahan_nt'
export const usesDocs = (type) => isTerjemahan(type) || type === 'apostille' || type === 'legalisasi'
/** Baris dokumen. Data lama tanpa `docs` diturunkan dari deskripsi. */
export function docsOf(sub) {
  if (Array.isArray(sub.docs) && sub.docs.length) return sub.docs
  const pts = points(sub.description)
  if (!pts.length) return [{ desc: '', pages: 1 }]
  return pts.map((desc) => ({ desc, pages: pts.length === 1 ? Math.max(1, Number(sub.pages) || 1) : 1 }))
}
/** Turunan otomatis dari baris dokumen: deskripsi bernomor, jumlah file & total halaman. */
export function fromDocs(docs) {
  const filled = docs.filter((d) => d.desc.trim())
  return {
    docs,
    description: filled.map((d, i) => `${i + 1}. ${d.desc.trim()}`).join('\n'),
    file_count: filled.length,
    pages: filled.reduce((a, d) => a + (Number(d.pages) || 0), 0),
    pages_manual: false,
  }
}

const extOf = (n = '') => (n.match(/\.[^.]+$/)?.[0] || '')
export const safeName = (n = '') => n.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
/** Nama file otomatis dari deskripsi dokumen (ekstensi file asli dipertahankan). */
export const docFileName = (d) => d.file_name?.trim() || `${safeName(d.desc) || (d.file?.name || 'dokumen').replace(/\.[^.]+$/, '')}${extOf(d.file?.name)}`

const namaDasar = (n = '') => n.replace(/\.[^.]+$/, '')
/** Perkiraan jumlah halaman PDF (dibaca di perangkat, tidak dikirim ke mana pun). Gagal / bukan PDF → 0 (pakai bawaan 1). */
export async function hitungHalaman(file) {
  try {
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return 0
    if (file.size > 40 * 1024 * 1024) return 0
    const teks = new TextDecoder('latin1').decode(await file.arrayBuffer())
    return (teks.match(/\/Type\s*\/Page(?![s\w])/g) || []).length
  } catch { return 0 }
}

function DocTable({ docs, onChange, invalid, tanpaJenis = false, simple = false, uploadLabel = 'Upload file (opsional)', maks = 0, onLebih }) {
  const [seret, setSeret] = useState(false)
  /**
   * Pasang 1–banyak file sekaligus: tiap file = 1 baris dokumen (nama file jadi nama dokumen, bisa diganti).
   * Baris kosong dipakai dulu; sisanya jadi baris baru. Bila sudah mencapai batas (apostille/legalisasi = 1),
   * file berikutnya diteruskan ke onLebih → jadi sub project sendiri.
   */
  const pasang = async (fileList, mulai = null) => {
    const list = [...(fileList || [])]; if (!list.length) return
    const hal = await Promise.all(list.map(hitungHalaman))
    const next = [...docs]; const sisa = []; let at = mulai
    list.forEach((f, n) => {
      let i = at != null && next[at] && !next[at].file && !next[at].existing ? at : next.findIndex((d) => !d.file && !d.existing && !d.desc.trim())
      at = null
      if (i < 0) { if (maks && next.length >= maks) { sisa.push(f); return } next.push({ desc: '', pages: 1, kind: next[next.length - 1]?.kind || 'reguler' }); i = next.length - 1 }
      const d = next[i]; const desc = d.desc.trim() || namaDasar(f.name)
      next[i] = { ...d, desc, file: f, file_name: `${safeName(desc) || 'dokumen'}${extOf(f.name)}`, name_edited: false, ...(hal[n] > 0 ? { pages: hal[n] } : {}) }
    })
    onChange(next)
    if (sisa.length) onLebih?.(sisa)
  }
  const [focus, setFocus] = useState(null)
  const refs = useRef([])
  useEffect(() => { if (focus !== null) { refs.current[focus]?.focus(); setFocus(null) } }, [focus, docs.length])
  const upd = (i, patch) => onChange(docs.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const penuh = !!maks && docs.length >= maks
  const add = (at = docs.length) => { if (penuh) return; const next = [...docs]; next.splice(at, 0, { desc: '', pages: 1, kind: docs[at - 1]?.kind || 'reguler' }); onChange(next); setFocus(at) }
  const del = (i) => onChange(docs.length > 1 ? docs.filter((_, j) => j !== i) : [{ desc: '', pages: 1 }])
  const total = docs.filter((d) => d.desc.trim()).reduce((a, d) => a + (Number(d.pages) || 0), 0)
  const count = docs.filter((d) => d.desc.trim()).length
  const nonReg = docs.filter((d) => d.desc.trim() && d.kind === 'non_reguler').reduce((a, d) => a + (Number(d.pages) || 0), 0)

  return (
    <div className={cx('overflow-hidden rounded-xl bg-white ring-1', seret ? 'ring-2 ring-brand' : invalid ? 'ring-2 ring-rose-500' : 'ring-slate-300')} data-tabel-dokumen
      onDragOver={(e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); setSeret(true) } }} onDragLeave={() => setSeret(false)}
      onDrop={(e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); setSeret(false); pasang(e.dataTransfer.files) } }}>
      <div className={cx('grid items-center gap-1.5 bg-emerald-50 px-1.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-900 sm:gap-2 sm:px-2', simple ? 'grid-cols-[26px_1fr_30px] sm:grid-cols-[32px_1fr_32px]' : 'grid-cols-[26px_1fr_64px_48px_30px] sm:grid-cols-[32px_1fr_116px_72px_32px]')}>
        <span className="text-center">No</span><span>Deskripsi<span className="hidden sm:inline"> Dokumen</span> & File</span>{!simple && <span className="text-center">Jenis</span>}{!simple && <span className="text-center">Hlm</span>}<span />
      </div>
      {docs.map((d, i) => (
        <div key={i} className={cx('grid items-center gap-1.5 border-t border-slate-100 px-1.5 py-1.5 transition hover:bg-slate-50/60 sm:gap-2 sm:px-2', simple ? 'grid-cols-[26px_1fr_30px] sm:grid-cols-[32px_1fr_32px]' : 'grid-cols-[26px_1fr_64px_48px_30px] sm:grid-cols-[32px_1fr_116px_72px_32px]')}>
          <span className="grid h-6 w-6 place-items-center justify-self-center rounded-md bg-slate-100 text-xs font-semibold text-ink-soft">{i + 1}</span>
          <div className={cx('min-w-0 space-y-1', !simple && 'max-sm:col-span-4')}>
            {!d.file && <input ref={(el) => (refs.current[i] = el)} value={d.desc} placeholder="mis. KTP a.n. …" aria-label={`Deskripsi dokumen ${i + 1}`}
              onChange={(e) => upd(i, { desc: e.target.value, ...(d.file && !d.name_edited ? { file_name: `${safeName(e.target.value) || 'dokumen'}${extOf(d.file.name)}` } : {}) })}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !penuh) { e.preventDefault(); add(i + 1) } }}
              className="h-9 w-full min-w-0 rounded-lg border-0 bg-white px-2.5 text-sm text-ink ring-1 ring-slate-200 placeholder:text-slate-400 hover:ring-slate-300 focus:outline-none focus:ring-2 focus:ring-brand max-md:h-11 max-md:text-base" />}
            {d.file ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 ring-1 ring-emerald-200">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                <input value={d.file_name ?? docFileName(d)} onChange={(e) => upd(i, { file_name: e.target.value, name_edited: true, desc: namaDasar(e.target.value) })} aria-label={`Nama dokumen / file ${i + 1}`} title="Nama dokumen sekaligus nama file — bisa diganti" data-nama-file
                  className="h-8 min-w-0 flex-1 rounded-md border-0 bg-white px-2 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200 focus:outline-none focus:ring-2 focus:ring-brand max-md:h-10 max-md:text-base" />
                <span className="hidden shrink-0 text-[10px] text-emerald-700 sm:inline">{Math.max(1, Math.round((d.file.size || 0) / 1024))} KB</span>
                <button type="button" onClick={() => upd(i, { file: null, file_name: '', name_edited: false })} aria-label={`Hapus file dokumen ${i + 1}`} className="grid h-6 w-6 place-items-center rounded-md text-emerald-700 hover:bg-white hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : d.existing ? (
              <p className="flex items-center gap-1.5 px-1 text-[11px] text-ink-mute"><Paperclip className="h-3 w-3" />{d.existing}</p>
            ) : (
              <label className={cx('inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ring-1', invalid && !d.file ? 'bg-rose-50 text-rose-700 ring-rose-300' : 'bg-white text-brand ring-brand/30 hover:bg-brand-soft')}>
                <Upload className="h-3.5 w-3.5" />{uploadLabel}
                <input type="file" multiple className="hidden" accept="application/pdf,image/*,.doc,.docx" aria-label={`File dokumen ${i + 1}`}
                  onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) pasang(fs, i) }} />
              </label>
            )}
          </div>
          {!simple && tanpaJenis && <span className="max-sm:col-span-2 max-sm:col-start-2 text-center text-[11px] text-ink-mute" title="Bahasa ke vendor: tanpa jenis per dokumen — pakai Prioritas sub project">ikut prioritas</span>}
          {!simple && !tanpaJenis && <select value={d.kind || 'reguler'} onChange={(e) => upd(i, { kind: e.target.value })} aria-label={`Jenis dokumen ${i + 1}`} title="Reguler / Non Reguler"
            className={cx('max-sm:col-span-2 max-sm:col-start-2 max-sm:h-11 max-sm:text-sm h-9 w-full min-w-0 rounded-lg border-0 px-1 text-xs font-semibold ring-1 focus:outline-none focus:ring-2 focus:ring-brand', d.kind === 'non_reguler' ? 'bg-violet-50 text-violet-800 ring-violet-200' : 'bg-white text-ink ring-slate-200')}>
            <option value="reguler">Reguler</option><option value="non_reguler">Non Reguler</option>
          </select>}
          {!simple && <input type="number" min="1" inputMode="numeric" value={d.pages} aria-label={`Jumlah halaman dokumen ${i + 1}`}
            onChange={(e) => upd(i, { pages: Math.max(0, Number(e.target.value)) })}
            className="h-9 w-full rounded-lg border-0 bg-white px-1 text-center text-sm font-semibold text-ink ring-1 ring-slate-200 hover:ring-slate-300 focus:outline-none focus:ring-2 focus:ring-brand" />}
          <button type="button" onClick={() => del(i)} title="Hapus dokumen" aria-label={`Hapus dokumen ${i + 1}`}
            className="grid h-8 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-2 py-2">
        {penuh ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-[13px] font-semibold text-ink-mute" data-maks-dokumen={maks}>
            Maksimal {maks} dokumen per sub project
          </span>
        ) : (
          <button type="button" onClick={() => add()} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold text-brand ring-1 ring-brand/30 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <Plus className="h-4 w-4" />Tambah Dokumen
          </button>
        )}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90 max-md:min-h-11" data-unggah-banyak title={maks ? 'File ke-2 dan seterusnya otomatis jadi sub project sendiri' : 'Tiap file otomatis jadi 1 baris dokumen'}>
          <Upload className="h-4 w-4" />{seret ? 'Lepas file di sini' : 'Upload / tarik file (bisa banyak)'}
          <input type="file" multiple className="hidden" accept="application/pdf,image/*,.doc,.docx" aria-label="Unggah beberapa file sekaligus" onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) pasang(fs) }} />
        </label>
        <span className="flex items-center gap-2 text-[13px] text-ink-soft">
          <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 ring-1 ring-slate-200" title="Jumlah file/dokumen"><Files className="h-3.5 w-3.5 text-emerald-600" /><b className="font-bold text-ink">{count}</b> dokumen</span>
          {!simple && <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 ring-1 ring-slate-200" title="Total halaman"><BookOpen className="h-3.5 w-3.5 text-emerald-600" /><b className="font-bold text-ink">{total}</b> halaman{nonReg > 0 && <span className="text-violet-700"> · {nonReg} non reguler</span>}</span>}
        </span>
      </div>
    </div>
  )
}

export default function SubProjectEditor({ n, sub, onChange, onRemove, branch, locked, error, ringkas, onPecah, prioProject = 'Normal' }) {
  const { data, user } = useApp()
  // Salah bahasa / harus ganti vendor padahal alur sudah berjalan: yang berizin boleh membuka kunci (alur diulang saat disimpan). Tidak untuk dokumen yang sudah dibayar / selesai.
  const sudahBayar = [DONE, ...VENDOR_PAID_STAGES].includes(sub.stage) || !!sub.data?.paid_date
  const bisaUlang = locked && !!sub.id && boleh(user, 'penugasan-ulang.ubah')
  const BukaKunci = () => (!bisaUlang ? null : sudahBayar
    ? <p className="mt-1 text-[11px] text-ink-mute" data-ulang-tolak>Sudah dibayar / selesai — tidak bisa diganti dari sini.</p>
    : <button type="button" data-ulang-buka onClick={() => onChange({ ...sub, _ulang: true })} className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-50 px-3 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100 max-md:min-h-11"><Lock className="h-3.5 w-3.5" />Buka kunci: ganti bahasa / penerjemah / vendor</button>)
  // KTP pemohon diunggah → nomornya dibaca otomatis (AI di live). Nomor TIDAK dirapikan/ditebak: hanya dipakai bila tepat 16 angka, dan tetap bisa dikoreksi.
  const [bacaId, setBacaId] = useState(null)
  const unggahId = async (f) => {
    onChange({ ...sub, applicant_file: f })
    if (String(sub.applicant_id || '').trim()) return // sudah diketik → jangan ditimpa
    setBacaId('baca')
    try {
      const { bacaKtp } = await import('../lib/ktpOcr.js')
      const r = await bacaKtp(f, f.name)
      const nik = String(r?.nilai?.nik?.v || '').replace(/\s/g, '')
      if (/^\d{16}$/.test(nik)) { onChange({ ...sub, applicant_file: f, applicant_id: nik }); setBacaId({ ok: true, mesin: r.mesinLabel || 'pembaca otomatis' }) } else setBacaId({ gagal: true })
    } catch { setBacaId({ gagal: true }) }
  }
  const of = (type) => data.people.filter((p) => p.type === type && (p.branch === branch || p.branch === 'Semua'))
  const set = (patch) => onChange({ ...sub, ...patch })
  const extra = (SUB_TYPES[sub.type] ?? SUB_TYPES.jasa_lain).extra
  const errOn = (word) => !!error && error.toLowerCase().includes(word)

  const setDesc = (description) => {
    const count = points(description).length
    set({ description, file_count: count, ...(sub.pages_manual ? {} : { pages: count }) })
  }

  return (
    <div data-sub-ringkas={ringkas ? '' : undefined} className={cx('rounded-xl bg-white shadow-sm ring-1', ringkas ? 'p-3' : 'p-3 sm:p-5', error ? 'ring-2 ring-rose-400' : 'ring-emerald-200')}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-emerald-600 px-2 text-xs font-bold text-white">{n}</span>
        <div className="order-last flex min-w-0 flex-1 basis-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 [scrollbar-width:none] sm:order-none sm:basis-0" role="tablist" aria-label="Jenis sub project">
          {Object.entries(SUB_TYPES).map(([k, t]) => {
            const Icon = TYPE_ICON[k]; const on = sub.type === k
            return (
              <button key={k} type="button" role="tab" disabled={locked} aria-selected={on}
                onClick={() => set(usesDocs(k) ? { type: k, ...fromDocs(docsOf(sub)) } : { type: k })} title={t.label} aria-label={t.label} aria-pressed={on}
                className={cx('flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50',
                  on ? 'flex-[2] bg-brand text-white shadow-sm' : 'flex-1 text-ink-soft hover:bg-brand-soft hover:text-brand')}>
                <Icon className="h-4 w-4 shrink-0" /><span className={on ? '' : 'hidden sm:inline'}>{t.label}</span>
              </button>
            )
          })}
        </div>
        <span className="flex-1 sm:hidden" />
        {locked && <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-ink-mute"><Lock className="h-3 w-3" />Alur berjalan</span>}
        {onRemove && <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50" aria-label={`Hapus sub project ${n}`}><Trash2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Hapus</span></button>}
      </div>

      {error && <FieldError className="-mt-2 mb-3">{error}</FieldError>}

      <div className="space-y-5">
        <label className="flex flex-wrap items-center gap-2" data-prio-sub-baris>
          <span className="text-[13px] font-semibold text-ink-soft">Prioritas sub project ini</span>
          <PrioritasSub value={sub.priority || prioProject} onChange={(v) => onChange({ ...sub, priority: v })} className="!w-auto max-md:!w-full" />
        </label>
        {usesDocs(sub.type) ? (
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">{isTerjemahan(sub.type) ? 'Detail Dokumen' : `Dokumen yang akan di-${sub.type === 'apostille' ? 'apostille' : 'legalisasi'}`} <span className="text-rose-500" aria-hidden>*</span></span>
            {/* Apostille & legalisasi: satu sub project boleh berisi beberapa dokumen. */}
            <DocTable docs={docsOf(sub)} invalid={errOn('dokumen')} simple={!isTerjemahan(sub.type)} tanpaJenis={isTerjemahan(sub.type) && !(BHS_INTERNAL.includes(sub.lang_from) && (!sub.lang_to || BHS_INTERNAL.includes(sub.lang_to)))} maks={MAKS_DOK[sub.type] || 0}
              uploadLabel={isTerjemahan(sub.type) ? 'Upload file (opsional)' : 'Upload scan (opsional)'} onChange={(docs) => set(fromDocs(docs))}
              onLebih={onPecah ? (files) => onPecah(files) : undefined} />
          </div>
        ) : (
          <>
            <Field label="Deskripsi" required hint="1 poin = 1 file">
              <NumberedTextarea value={sub.description} invalid={errOn('deskripsi')} onChange={setDesc} placeholder="1. Nama dokumen" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Jumlah File" icon={Files} hint="Otomatis dari deskripsi">
                <Input value={sub.file_count} readOnly tabIndex={-1} disabled />
              </Field>
              <Field label="Jumlah Halaman" icon={BookOpen} hint={sub.pages_manual
                ? <button type="button" onClick={() => set({ pages_manual: false, pages: sub.file_count })} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"><RotateCcw className="h-3 w-3" />Kembali otomatis</button>
                : 'Otomatis, bisa diubah'}>
                <Input type="number" min="0" inputMode="numeric" value={sub.pages} onChange={(e) => set({ pages: Number(e.target.value), pages_manual: true })} />
              </Field>
            </div>
          </>
        )}

        {(extra.includes('lang') || extra.includes('translator')) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {extra.includes('lang') && (
              <Field label="Bahasa" icon={Languages}>
                <div className="flex items-center gap-2">
                  <Select value={sub.lang_from} onChange={(e) => set({ lang_from: e.target.value })} aria-label="Bahasa asal" className="min-w-0 flex-1">{LANGS.map((x) => <option key={x}>{x}</option>)}</Select>
                  <button type="button" onClick={() => set({ lang_from: sub.lang_to, lang_to: sub.lang_from })} aria-label="Tukar bahasa asal dan tujuan" title="Tukar arah bahasa (asal ⇄ tujuan)"
                    className="group inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-ink-mute ring-1 ring-slate-300 transition hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-400 active:scale-90">
                    <ArrowLeftRight className="h-4 w-4 transition-transform duration-300 group-hover:rotate-180" />
                  </button>
                  <Select value={sub.lang_to} onChange={(e) => set({ lang_to: e.target.value })} aria-label="Bahasa tujuan" className="min-w-0 flex-1">{LANGS.map((x) => <option key={x}>{x}</option>)}</Select>
                </div>
              </Field>
            )}
            {extra.includes('translator_nt') && (
              <Field label="Penerjemah" icon={UserPen} required hint={locked ? 'Terkunci — alur sudah berjalan' : 'Tanpa Direktur, proofreader & otorisasi'}>
                <PilihCari label="Penerjemah" placeholder="— Pilih penerjemah —" disabled={locked} invalid={errOn('penerjemah')}
                  value={sub.translator || ''} onChange={(v) => set({ translator_kind: 'translator', translator: v })}
                  options={data.users.filter((u) => u.role === 'penerjemah' && u.active !== false).map((u) => ({ value: u.id, label: u.name, note: placeOf(u) }))}
                  kosong="Penerjemah tidak ditemukan" />
              </Field>
            )}
            {extra.includes('translator') && (
              <Field label="Penerjemah" icon={UserPen} hint={locked ? 'Terkunci — alur sudah berjalan' : 'Kosong = Direktur yang menetapkan. Bila dipilih langsung (dan dokumen diunggah), pekerjaan langsung masuk ke penerjemah.'}>
                <PilihCari label="Penerjemah" placeholder="Ditentukan Direktur" disabled={locked}
                  value={sub.translator ? `${sub.translator_kind || 'translator'}:${sub.translator}` : ''}
                  onChange={(v) => { const [kind, id] = String(v).split(':'); set({ translator_kind: id ? (kind || '') : '', translator: id || '' }) }}
                  options={[
                    { value: '', label: 'Ditentukan Direktur', note: 'Biarkan kosong' },
                    ...data.users.filter((u) => u.role === 'penerjemah' && u.active !== false).map((u) => ({ value: `translator:${u.id}`, label: u.name, note: `Penerjemah internal · ${placeOf(u)}` })),
                    ...of('vendor').map((p) => ({ value: `vendor:${p.id}`, label: p.name, note: 'Vendor eksternal' })),
                  ]}
                  kosong="Penerjemah / vendor tidak ditemukan" />
                <BukaKunci />
                {sub._ulang && (
                  <div className="mt-2 space-y-1.5 rounded-lg bg-amber-50 p-2.5 ring-1 ring-amber-200" data-ulang-alasan>
                    <label className="block text-[11px] font-semibold text-amber-900">Alasan ganti (wajib)
                      <input type="text" value={sub._ulang_alasan || ''} onChange={(x) => set({ _ulang_alasan: x.target.value })} placeholder="mis. salah bahasa, vendor harus diganti"
                        className="mt-1 block w-full rounded-lg border-0 bg-white px-2.5 py-2 text-sm text-ink ring-1 ring-amber-300 focus:ring-2 focus:ring-amber-500 max-md:min-h-11 max-md:text-base" />
                    </label>
                    <p className="text-[11px] text-amber-900">Kunci dibuka. Saat disimpan, alur dokumen ini diulang dari awal dan pengajuan vendor yang lama dibatalkan.</p>
                    <button type="button" onClick={() => onChange({ ...sub, _ulang: false, _ulang_alasan: '' })} className="text-[11px] font-semibold text-amber-900 underline max-md:min-h-11">Batal buka kunci</button>
                  </div>
                )}
              </Field>
            )}
          </div>
        )}

        {['apostille', 'legalisasi'].includes(sub.type) && (
          <Field label={`Nomor ID Pemohon / No. NIB / SK Kemenkumham Perusahaan${sub.type === 'legalisasi' ? ' (tidak wajib)' : ''}`} icon={IdCard} required={sub.type === 'apostille'}
            hint={bacaId === 'baca' ? 'Membaca nomor dari KTP…' : bacaId?.ok ? `Nomor terbaca otomatis (${bacaId.mesin}) — cocokkan dengan KTP sebelum disimpan.` : bacaId?.gagal ? 'Nomor tidak terbaca otomatis — ketik manual.' : 'Unggah KTP: nomornya dibaca otomatis (tanpa mengetik) dan dipakai untuk Surat Kuasa. NIB / SK Kemenkumham diketik manual.'}>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input value={sub.applicant_id || ''} onChange={(e) => set({ applicant_id: e.target.value })} placeholder="mis. 5171xxxxxxxxxxxx / NIB 1234567890123 / AHU-0012345.AH.01.01.2024" />
              {sub.applicant_file ? (
                <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-2.5 ring-1 ring-emerald-200">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                  <span className="max-w-[180px] truncate text-xs font-semibold text-emerald-900" title={sub.applicant_file.name}>{sub.applicant_file.name}</span>
                  <button type="button" onClick={() => set({ applicant_file: null })} aria-label="Hapus file ID pemohon" className="grid h-6 w-6 place-items-center rounded-md text-emerald-700 hover:bg-white hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : sub.data?.dokumen_id ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 text-xs text-ink-mute ring-1 ring-slate-200"><Paperclip className="h-3.5 w-3.5" />{sub.data.dokumen_id.name}</span>
              ) : (
                <label className={cx('inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ring-1 md:min-h-0',
                  errOn('id / dokumen pemohon') ? 'bg-rose-50 text-rose-700 ring-rose-300' : 'bg-white text-brand ring-brand/30 hover:bg-brand-soft')} data-upload-id>
                  <Upload className="h-3.5 w-3.5 shrink-0" />Upload KTP / ID pemohon{sub.type === 'apostille' ? ' *' : ''} <span className="font-normal">· nomor dibaca otomatis</span>
                  <input type="file" className="hidden" accept="image/*,application/pdf" aria-label="File ID pemohon" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) unggahId(f) }} />
                </label>
              )}
            </div>
          </Field>
        )}
        {(extra.includes('country') || extra.includes('institution') || extra.includes('executor')) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {extra.includes('country') && (
              <Field label="Tujuan Negara" icon={Globe2} required>
                <PilihCari label="Tujuan negara" invalid={errOn('negara')} value={sub.country}
                  onChange={(v) => set({ country: v })} options={COUNTRIES}
                  placeholder="Pilih negara…" kosong="Negara tidak ditemukan" />
              </Field>
            )}
            {extra.includes('institution') && (
              <Field label="Lembaga" icon={Landmark} required hint={!of('lembaga').length ? 'Belum ada lembaga — ketik namanya lalu "Tambah lembaga lain"' : undefined}>
                <PilihLembaga branch={branch} invalid={errOn('lembaga')} value={sub.institution} onChange={(v) => set({ institution: v })} />
                {/* Persyaratan lembaga — diisi di Setting → Master Data, bukan di kode. */}
                {(() => { const l = of('lembaga').find((p) => p.id === sub.institution); return l?.note
                  ? <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-900 ring-1 ring-amber-200">{l.note}</p>
                  : null })()}
              </Field>
            )}
            {extra.includes('objek') && (
              <Field label="Yang diapostille" icon={Stamp} required>
                <div className="flex flex-wrap gap-1.5">
                  {OBJEK_APOSTILLE.map(([v, l]) => (
                    <button key={v} type="button" onClick={() => set({ objek: v })} aria-pressed={sub.objek === v}
                      className={cx('min-h-[44px] rounded-xl px-3 text-sm font-semibold ring-1 transition',
                        sub.objek === v ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-soft ring-slate-300 hover:ring-brand')}>
                      {l}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            {extra.includes('executor') && (
              <Field label="Eksekutor" icon={UserCog} required hint={locked ? 'Terkunci — alur sudah berjalan' : 'Staf Apostille (internal) atau vendor luar'}>
                <Select value={sub.executor_id ? `${sub.executor_kind}:${sub.executor_id}` : ''} disabled={locked} aria-invalid={errOn('eksekutor')}
                  onChange={(e) => { const [kind, id] = e.target.value.split(':'); set({ executor_kind: kind || '', executor_id: id || '' }) }}>
                  <option value="">Pilih eksekutor…</option>
                  <optgroup label="Staf Apostille (internal)">{data.users.filter((u) => u.role === 'staf_apostille' && u.active !== false).map((u) => <option key={u.id} value={`staff:${u.id}`}>{u.name} · {placeOf(u)}</option>)}</optgroup>
                  <optgroup label="Vendor (luar)">{of('vendor').map((p) => <option key={p.id} value={`vendor:${p.id}`}>{p.name}</option>)}</optgroup>
                </Select>
              </Field>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Bahasa yang dikerjakan tim internal → punya jenis Reguler / Non Reguler per dokumen. Bahasa lain (vendor) memakai Prioritas sub project. */
const BHS_INTERNAL = ['Indonesia', 'Inggris', 'Belanda']

/** Batas jumlah dokumen per sub project. 19 Nov 2026: apostille & legalisasi TIDAK lagi dibatasi 1 dokumen —
 *  satu sub boleh berisi beberapa dokumen (seperti terjemahan), dengan pengaturan yang sama untuk semuanya. */
export const MAKS_DOK = {}

/** Validasi sub project sebelum disimpan. Mengembalikan pesan error atau null. */
export function validateSub(s, i) {
  const label = `Sub ${i + 1}`
  if (!points(s.description).length) return usesDocs(s.type) ? `${label}: isi minimal 1 dokumen` : `${label}: isi deskripsi minimal 1 poin`
  const extra = (SUB_TYPES[s.type] ?? SUB_TYPES.jasa_lain).extra
  if (extra.includes('lang') && !s.lang_to) return `${label}: pilih bahasa tujuan`
  if (extra.includes('translator_nt') && !s.translator) return `${label}: pilih penerjemah`
  if (extra.includes('country') && !s.country.trim()) return `${label}: pilih tujuan negara`
  if (extra.includes('institution') && !s.institution) return `${label}: pilih lembaga`
  if (extra.includes('objek') && !s.objek) return `${label}: pilih yang diapostille (asli / terjemahan / keduanya)`
  // Apostille tidak bisa jalan tanpa scan ID / dokumen pemohon. Legalisasi: tidak wajib (19 Nov 2026).
  if (s.type === 'apostille' && !s.applicant_file && !s.data?.dokumen_id) return `${label}: upload scan ID / dokumen pemohon dulu (wajib)`
  const maks = MAKS_DOK[s.type]
  if (maks && points(s.description).length > maks) return `${label}: apostille/legalisasi maksimal ${maks} dokumen per sub project — pisahkan jadi sub project sendiri`
  if (extra.includes('executor') && !s.executor_id) return `${label}: pilih eksekutor`
  // Penerjemah internal dipilih langsung → pekerjaan langsung masuk ke dia, jadi dokumen sumbernya wajib ada
  if (s.type === 'terjemahan' && s.translator && s.translator_kind !== 'vendor' && !s.id) {
    const adaFile = (s.docs || []).some((d) => d.file || d.existing) || s.data?.dokumen_sumber
    if (!adaFile) return `${label}: unggah dokumen sumber dulu — wajib bila penerjemah dipilih langsung (pekerjaan langsung masuk ke penerjemah)`
  }
  return null
}
