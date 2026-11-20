// Foto kecil di depan nama orang (CS / penerjemah) pada daftar project.
// Nama dicocokkan ke akun pengguna; bila bukan akun (mis. vendor) dipakai foto tim bawaan / inisial.
import { useMemo } from 'react'
import { useApp } from '../lib/store.jsx'
import { cx } from './ui.jsx'
import Avatar from './Avatar.jsx'

const bersih = (n) => String(n || '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase()

export function FotoNama({ nama, size = 20, className }) {
  const { data } = useApp()
  const u = useMemo(() => { const k = bersih(nama); return k ? (data.users || []).find((x) => bersih(x.name) === k || bersih(x.nickname) === k) : null }, [data.users, nama])
  if (!bersih(nama)) return null
  return <Avatar user={u || { name: nama }} size={size} ring={false} className={cx('ring-1 ring-slate-200', className)} />
}

/** Foto + nama dalam satu baris; nama terpotong rapi bila sempit. */
export default function NamaFoto({ nama, awalan = '', size = 20, className, kelasNama = '' }) {
  if (!bersih(nama)) return <span className="text-ink-mute">—</span>
  return (
    <span className={cx('flex min-w-0 items-center gap-1.5', className)} title={nama} data-nama-foto>
      <FotoNama nama={nama} size={size} />
      <span className={cx('min-w-0 truncate', kelasNama)}>{awalan}{nama}</span>
    </span>
  )
}
