// Label kecil "Tersumpah" / "Non Tersumpah" untuk pekerjaan terjemahan —
// supaya pelaksana langsung tahu jenisnya (non tersumpah: tanpa proofreader, otorisasi, dan nomor register).
import { cx } from './ui.jsx'

/** 'nt' = non tersumpah, 'ts' = tersumpah, '' = bukan terjemahan. Dari daftar sub: 'campur' bila keduanya ada. */
export const jenisTerjemahan = (subs = []) => {
  const nt = subs.some((s) => s?.type === 'terjemahan_nt' || s?.flow === 'tr_nt'); const ts = subs.some((s) => s?.type === 'terjemahan' && s?.flow !== 'tr_nt')
  return nt && ts ? 'campur' : nt ? 'nt' : ts ? 'ts' : ''
}

export default function JenisTerjemahan({ subs, className }) {
  const j = jenisTerjemahan(subs)
  if (!j) return null
  const nt = <span className="inline-flex items-center whitespace-nowrap rounded-md bg-[#F3ECFF] px-1.5 py-0.5 text-[11px] font-bold text-[#5B21B6] ring-1 ring-[#D9C8F8]" title="Non tersumpah: tanpa proofreader, otorisasi, dan nomor register">Non Tersumpah</span>
  const ts = <span className="inline-flex items-center whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-ink-soft ring-1 ring-slate-200">Tersumpah</span>
  return <span className={cx('inline-flex flex-wrap items-center gap-1', className)} data-jenis-terjemahan={j}>{j !== 'nt' && ts}{j !== 'ts' && nt}</span>
}
