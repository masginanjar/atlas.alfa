import { useEffect, useState } from 'react'
import { Loader2, SpellCheck, RefreshCw } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { rupiah } from '../lib/format.js'
import { laporanTypo, TYPO_LIVE } from '../lib/typo.js'
import { Card, Select, cx } from './ui.jsx'

// ============================================================
//  LAPORAN KOREKSI TYPO — seberapa sering tiap penerjemah typo (Pengaturan → Pengguna).
//  Izin: koreksi-typo.laporan (bawaan hanya Super Admin; server memeriksa ulang). Tanpa izin → tidak tampil & tanpa data.
//  Angka berasal dari pemeriksaan otomatis saat upload hasil terjemahan (hanya akun yang toggle-nya ON).
//  Yang dihitung "typo" = temuan yang meyakinkan; yang diragukan (kemungkinan nama) tidak ikut.
// ============================================================
const bulanLalu = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 7) }
const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const labelBulan = (b) => `${NAMA_BULAN[Number(b.slice(5)) - 1]} ${b.slice(0, 4)}`

export default function LaporanTypo() {
  const { user, data } = useApp()
  const izin = boleh(user, 'koreksi-typo.laporan')
  const [bulan, setBulan] = useState(bulanLalu(0))
  const [r, setR] = useState(null)
  const muat = async (b = bulan) => { setR(null); setR(await laporanTypo(b === 'semua' ? null : b, data.users)) }
  useEffect(() => { if (izin) muat(bulan) }, [izin, bulan]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!izin) return null
  const baris = r?.baris || []
  const tingkat = (x) => (x.file === 0 ? ['Belum ada data', 'text-ink-mute'] : x.per_1000 >= 5 ? ['Sering', 'text-rose-700'] : x.per_1000 >= 1.5 ? ['Kadang', 'text-amber-700'] : ['Jarang', 'text-emerald-700'])
  return (
    <Card className="mt-4 space-y-3 p-4" data-laporan-typo>
      <div className="flex flex-wrap items-center gap-2">
        <SpellCheck className="h-5 w-5 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1"><p className="text-sm font-bold">Laporan typo penerjemah</p><p className="text-[11px] text-ink-mute">Dari Koreksi Typo Otomatis saat upload hasil terjemahan — hanya akun yang dinyalakan.{!TYPO_LIVE ? ' Demo: angka dari contoh di perangkat ini, bukan AI.' : ''}</p></div>
        <Select value={bulan} onChange={(e) => setBulan(e.target.value)} aria-label="Periode laporan typo" className="!w-auto max-md:min-h-11 max-md:text-base">
          {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={bulanLalu(n)}>{labelBulan(bulanLalu(n))}</option>)}
          <option value="semua">Semua waktu</option>
        </Select>
        <button type="button" onClick={() => muat()} aria-label="Muat ulang laporan typo" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft ring-1 ring-slate-300 hover:bg-slate-50 max-md:h-11 max-md:w-11"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {!r ? <p className="flex items-center gap-2 text-sm text-ink-mute"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Memuat laporan…</p>
        : !r.ok ? <p className="text-sm text-rose-700" role="alert">{r.alasan || 'Laporan belum bisa dimuat'}</p>
        : !baris.length ? <p className="text-sm text-ink-mute" data-laporan-kosong>Belum ada akun penerjemah yang dinyalakan. Nyalakan “Koreksi Typo Otomatis” lewat Edit pengguna (role Penerjemah).</p>
        : <>
          {/* HP: kartu ringkas */}
          <ul className="space-y-2 md:hidden">
            {baris.map((x) => { const [t, w] = tingkat(x); return (
              <li key={x.user_id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="flex items-baseline justify-between gap-2"><span className="min-w-0 truncate text-sm font-bold">{x.nama}</span><span className={cx('shrink-0 text-xs font-bold', w)}>{t}</span></div>
                <p className="mt-1 text-xs text-ink-soft">{x.file_typo} dari {x.file} file ada typo · {x.typo} typo · {String(x.per_1000).replace('.', ',')} per 1.000 kata</p>
                <p className="text-[11px] text-ink-mute">{x.dipakai} koreksi dipakai · biaya AI ±{rupiah(x.biaya_rp || 0)}</p>
              </li>) })}
          </ul>
          {/* Tablet/desktop: tabel */}
          <div className="max-md:hidden overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-ink-mute"><tr><th className="py-1.5 pr-3 font-bold">Penerjemah</th><th className="px-3 font-bold">File diperiksa</th><th className="px-3 font-bold">File ada typo</th><th className="px-3 font-bold">Jumlah typo</th><th className="px-3 font-bold">Per 1.000 kata</th><th className="px-3 font-bold">Koreksi dipakai</th><th className="px-3 font-bold">Biaya AI</th><th className="pl-3 font-bold">Seberapa sering</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {baris.map((x) => { const [t, w] = tingkat(x); return (
                  <tr key={x.user_id}><td className="py-2 pr-3 font-semibold">{x.nama}</td><td className="px-3 tabular-nums">{x.file}</td><td className="px-3 tabular-nums">{x.file_typo}{x.file ? ` (${Math.round((x.file_typo / x.file) * 100)}%)` : ''}</td><td className="px-3 tabular-nums">{x.typo}</td><td className="px-3 tabular-nums">{String(x.per_1000).replace('.', ',')}</td><td className="px-3 tabular-nums">{x.dipakai}</td><td className="px-3 tabular-nums">±{rupiah(x.biaya_rp || 0)}</td><td className={cx('pl-3 font-bold', w)}>{t}</td></tr>) })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-ink-mute">Sering = 5 typo atau lebih per 1.000 kata · Kadang = 1,5–5 · Jarang = di bawah 1,5. Hanya salah ketik yang meyakinkan yang dihitung; tata bahasa dan nama tidak.</p>
        </>}
    </Card>
  )
}
