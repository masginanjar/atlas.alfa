// "Laporkan masalah" — staf mengirim kendala ke Super Admin dengan konteks otomatis
// (halaman, waktu, perangkat, versi, error terakhir di perangkat ini). Tidak menyertakan
// kata sandi, token, atau isi dokumen. Dibuka dari menu profil (event 'atlas-lapor').
import { useEffect, useState } from 'react'
import { useApp } from '../lib/store.jsx'
import { Button, Sheet, Textarea } from './ui.jsx'
import { bacaMonitor } from '../lib/monitor.js'
import { VERSI_TERBARU } from '../config/changelog.js'

export const bukaLapor = () => window.dispatchEvent(new Event('atlas-lapor'))

/** Bersihkan teks dari pola yang mirip token/kunci sebelum dikirim. */
const bersih = (s) => String(s || '').replace(/(eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}|sb_[a-z]+_[\w-]{10,}|Bearer\s+\S+)/g, '[disembunyikan]').slice(0, 300)

export default function LaporMasalah() {
  const { user, save, notify } = useApp()
  const [buka, setBuka] = useState(false)
  const [f, setF] = useState({ apa: '', langkah: '' })
  const [sibuk, setSibuk] = useState(false)
  useEffect(() => { const h = () => setBuka(true); window.addEventListener('atlas-lapor', h); return () => window.removeEventListener('atlas-lapor', h) }, [])
  if (!buka || !user) return null
  const kirim = async () => {
    if (f.apa.trim().length < 5) return notify('Ceritakan singkat masalahnya (min. 5 huruf)', 'err')
    setSibuk(true)
    try {
      const err = bacaMonitor().filter((e) => e.jenis === 'error').slice(-8).map((e) => ({ at: e.at, kelas: e.kelas, sumber: e.sumber, pesan: bersih(e.pesan) }))
      await save('app_laporan', {
        user_id: user.id, nama: user.name, role: user.role, cabang: user.branch || '', status: 'baru',
        apa: f.apa.trim().slice(0, 1000), langkah: f.langkah.trim().slice(0, 1500),
        halaman: window.location.hash || '#/', waktu: new Date().toISOString(), versi: VERSI_TERBARU,
        perangkat: `${navigator.userAgent.slice(0, 160)} · ${window.innerWidth}×${window.innerHeight}`, online: navigator.onLine, error_terakhir: err,
      })
      notify('Laporan terkirim ke Super Admin. Terima kasih!')
      setF({ apa: '', langkah: '' }); setBuka(false)
    } catch { notify('Laporan belum terkirim — periksa koneksi lalu coba lagi', 'err') } finally { setSibuk(false) }
  }
  return (
    <Sheet open onClose={() => setBuka(false)} title="Laporkan masalah" subtitle="Halaman, waktu, dan perangkat ikut terlampir otomatis">
      <div className="grid gap-3 text-sm" data-lapor-masalah>
        <label className="grid gap-1"><span className="font-semibold">Apa yang terjadi?</span><Textarea rows={3} value={f.apa} onChange={(e) => setF({ ...f, apa: e.target.value })} placeholder="mis. Tombol Simpan tidak merespons saat membuat pengiriman" autoFocus /></label>
        <label className="grid gap-1"><span className="font-semibold">Langkah sebelum masalah muncul (opsional)</span><Textarea rows={3} value={f.langkah} onChange={(e) => setF({ ...f, langkah: e.target.value })} placeholder="1. Buka … 2. Klik … 3. Muncul …" /></label>
        <p className="text-[11px] text-ink-mute">Terlampir: {window.location.hash || '#/'} · {new Date().toLocaleString('id-ID')} · versi {VERSI_TERBARU}. Kata sandi & isi dokumen tidak ikut terkirim.</p>
        <div className="flex gap-2 [&>*]:flex-1 [&>*]:max-md:min-h-11"><Button variant="outline" onClick={() => setBuka(false)}>Batal</Button><Button loading={sibuk} onClick={kirim} data-aksi="kirim-laporan">Kirim laporan</Button></div>
      </div>
    </Sheet>
  )
}
