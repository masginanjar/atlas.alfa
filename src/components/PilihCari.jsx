import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check, Search, Plus } from 'lucide-react'
import { cx } from './ui.jsx'

/**
 * Pemilih yang bisa dicari — untuk daftar panjang seperti negara tujuan
 * atau lembaga. Pola yang sama dipakai pemilih kurir, supaya di seluruh
 * aplikasi cara memilihnya seragam.
 *
 * @param {{value:string, onChange:(v:string)=>void,
 *          options:Array<string|{value:string,label:string,note?:string}>,
 *          placeholder?:string, label:string, kosong?:string, invalid?:boolean}} p
 */
export default function PilihCari({ value, onChange, options = [], placeholder = 'Pilih…', label, kosong = 'Tidak ditemukan', invalid, disabled, ringkas, onTambah, labelTambah = 'Tambah' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const ref = useRef(null)
  const cariRef = useRef(null)

  const list = useMemo(() => options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)), [options])
  const cur = list.find((o) => o.value === value)
  const cocok = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? list.filter((o) => `${o.label} ${o.alias || ''}`.toLowerCase().includes(s)) : list
  }, [list, q])

  useEffect(() => {
    if (!open) return
    const tutup = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', tutup)
    return () => document.removeEventListener('pointerdown', tutup)
  }, [open])
  useEffect(() => {
    if (!open) { setQ(''); return }
    const t = setTimeout(() => cariRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open])

  // Tambah pilihan baru dari sini (mis. kedutaan yang belum ada). Baru dianggap berhasil setelah tersimpan.
  const baru = q.trim().replace(/\s+/g, ' ')
  const sudahAda = list.some((o) => o.label.trim().toLowerCase() === baru.toLowerCase())
  const tambah = async () => {
    if (!onTambah || sibuk || baru.length < 3 || sudahAda) return
    setSibuk(true); setGalat('')
    try { const v = await onTambah(baru); if (v) { onChange(v); setOpen(false) } }
    catch (e) { setGalat(String(e?.message || 'Gagal menyimpan — coba lagi')) }
    finally { setSibuk(false) }
  }
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    if (e.key === 'Enter' && cocok.length === 1) { e.preventDefault(); onChange(cocok[0].value); setOpen(false) }
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} disabled={disabled}
        aria-invalid={invalid || undefined} aria-label={label} data-pilihcari={label}
        className={cx('flex min-h-[44px] w-full items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left text-sm ring-1 transition',
          invalid ? 'ring-rose-400' : 'ring-slate-300 hover:ring-brand/50', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          disabled && 'cursor-not-allowed bg-slate-50 opacity-60', ringkas && 'md:!min-h-9 md:h-9 md:rounded-[10px] md:px-2.5 md:py-0')}>
        <span className={cx('min-w-0 flex-1 truncate', !cur && 'text-ink-mute')}>{cur?.label ?? placeholder}</span>
        <ChevronDown className={cx('h-4 w-4 shrink-0 text-ink-mute transition', open && 'rotate-180')} />
      </button>
      {open && !disabled && (
        <div className={cx('absolute z-30 mt-1 w-full rounded-xl bg-white shadow-xl ring-1 ring-slate-200', ringkas ? 'md:w-max md:min-w-full md:max-w-[320px]' : 'max-w-full', onTambah && 'max-md:w-[min(86vw,20rem)] max-md:max-w-none')}>
          <div className="border-b border-slate-100 p-2">
            <label className="relative block min-w-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden="true" />
              <input ref={cariRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
                placeholder="Ketik untuk mencari…" aria-label={`Cari ${label}`}
                className="w-full max-w-full rounded-lg border-0 bg-slate-50 py-2 pl-8 pr-2.5 text-sm ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-brand" />
            </label>
          </div>
          <ul role="listbox" className="max-h-60 w-full overflow-y-auto overscroll-contain p-1">
            {cocok.map((o) => (
              <li key={o.value}>
                <button type="button" role="option" aria-selected={o.value === value}
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  className={cx('flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50', o.value === value && 'bg-brand-soft')}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{o.label}</span>
                    {o.note && <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-mute">{o.note}</span>}
                  </span>
                  {o.value === value && <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />}
                </button>
              </li>
            ))}
            {!cocok.length && <li className="px-3 py-4 text-center text-xs text-ink-mute">{kosong}</li>}
          </ul>
          {onTambah && (
            <div className="border-t border-slate-100 p-1.5" data-pilihcari-tambah>
              {baru.length >= 3 && !sudahAda
                ? <button type="button" onClick={tambah} disabled={sibuk} data-aksi="tambah-pilihan"
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-brand hover:bg-brand-soft disabled:opacity-60 md:min-h-9">
                    <Plus className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 break-words leading-snug">{sibuk ? 'Menyimpan…' : `${labelTambah}: “${baru}”`}</span>
                  </button>
                : <p className="px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-mute">{sudahAda ? 'Nama itu sudah ada di daftar — pilih di atas.' : `Tidak ada di daftar? Ketik namanya di kolom cari (mis. “Kedutaan Besar Jepang”), lalu tekan ${labelTambah}.`}</p>}
              {galat && <p role="alert" className="px-2.5 pb-1 text-[11px] font-semibold text-rose-700">{galat}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
