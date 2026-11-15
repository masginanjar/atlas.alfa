// Pita "Belum dibayar di Everpro" — order prepaid dari ATLAS harus dibayar di dashboard Everpro
// (API Everpro prepaid tidak menyediakan pembayaran). Setelah dibayar, ATLAS mengecek otomatis
// (tiap 45 detik selama halaman terbuka & saat kembali ke tab ATLAS) lalu mengambil resi.
import { useCallback, useEffect, useRef, useState } from 'react'
import { CreditCard, ExternalLink, RefreshCw } from 'lucide-react'
import { useApp } from '../../lib/store.jsx'
import { Button } from '../ui.jsx'
import { IS_DEMO } from '../../lib/kirim.js'
import { sinkronKirim } from '../../lib/kirimApi.js'
import { useKirim } from './bersama.jsx'

export const EVERPRO_BAYAR = 'https://app.everpro.id'

export default function BelumBayar() {
  const { save, notify } = useApp()
  const { kirim } = useKirim()
  const rows = kirim.filter((r) => r.tahap === 'belum_bayar')
  const [sibuk, setSibuk] = useState(false)
  const jalan = useRef(false)
  const ids = rows.map((r) => r.id).join(',')

  const cek = useCallback(async (diam) => {
    if (jalan.current || !rows.length) return
    jalan.current = true; if (!diam) setSibuk(true)
    let lunas = 0
    try {
      for (const r of rows.slice(0, 10)) { const x = await sinkronKirim(r, save); if (x.ok && x.tahap && x.tahap !== 'belum_bayar') lunas++ }
    } finally { jalan.current = false; setSibuk(false) }
    if (lunas) notify(`${lunas} order sudah dibayar — resi diambil dari Everpro`)
    else if (!diam) notify('Belum ada pembayaran baru di Everpro', 'err')
  }, [ids]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (IS_DEMO || !rows.length) return undefined
    const t = setInterval(() => cek(true), 45000)
    const fokus = () => { if (document.visibilityState === 'visible') cek(true) }
    document.addEventListener('visibilitychange', fokus)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', fokus) }
  }, [ids, cek]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows.length) return null
  const total = rows.reduce((a, r) => a + Number(r.biaya_aktual?.total || r.biaya?.total || 0), 0)
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-rose-200" data-belum-bayar>
      <CreditCard className="h-4 w-4 shrink-0" />
      <p className="mr-auto min-w-[220px]"><b>{rows.length} order belum dibayar di Everpro</b>{total ? ` · Rp ${Math.round(total).toLocaleString('id-ID')}` : ''} — kurir belum dipanggil sampai dibayar. <span className="text-rose-700/80">{rows.map((r) => r.everpro?.client_order_no).filter(Boolean).slice(0, 3).join(', ')}</span></p>
      <a href={EVERPRO_BAYAR} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-[13px] font-semibold text-white hover:bg-rose-700"><ExternalLink className="h-4 w-4" />Bayar di Everpro</a>
      <Button size="sm" variant="outline" loading={sibuk} onClick={() => cek(false)}><RefreshCw className="h-4 w-4" />Sudah bayar? Cek</Button>
    </div>
  )
}
