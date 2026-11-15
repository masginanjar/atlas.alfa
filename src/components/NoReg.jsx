import { BadgeCheck, Copy } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { copyText } from './CopyText.jsx'
import { cx } from './ui.jsx'

/** Centang biru "Official" — penanda baris dokumen yang nomor registernya sudah terbit. */
export function CentangOfficial({ teks = true, className }) {
  return (
    <span data-centang-official title="Official — nomor register sudah terbit"
      className={cx('inline-flex shrink-0 items-center gap-0.5 align-middle text-[11px] font-bold text-sky-700', className)}>
      <BadgeCheck className="h-4 w-4 fill-sky-500 text-white" aria-hidden="true" />
      {teks ? 'Official' : <span className="sr-only">Official</span>}
    </span>
  )
}

/**
 * Nomor register dokumen — dibuat BESAR supaya mudah disalin tangan ke hasil cetak.
 * Ketuk ikon salin untuk menyalin angkanya saja.
 */
export default function NoReg({ n, className }) {
  const { notify } = useApp()
  if (!n) return null
  return (
    <span data-no-reg className={cx('mt-1 flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-amber-50 px-2.5 py-1 ring-1 ring-amber-200', className)} title="Nomor registrasi">
      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">No. Reg</span>
      <span className="select-all break-all font-mono text-lg font-bold leading-tight tracking-wider text-amber-900 sm:text-xl">{n}</span>
      <button type="button" title="Salin nomor register" aria-label={`Salin nomor register ${n}`}
        onClick={async (e) => { e.preventDefault(); e.stopPropagation(); const ok = await copyText(String(n)); notify(ok ? 'Nomor register disalin' : 'Gagal menyalin — salin manual', ok ? 'ok' : 'err') }}
        className="-my-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-amber-700 transition hover:bg-amber-100 active:scale-90 max-md:h-11 max-md:w-11">
        <Copy className="h-4 w-4" />
      </button>
    </span>
  )
}
