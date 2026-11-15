import { Languages, Lock, ExternalLink } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { Card, Empty } from '../components/ui.jsx'

// ============================================================
//  SMART TRANSLATOR — aplikasi mandiri (public/smart-translator/app.html)
//  ditampilkan di dalam ATLAS. Proses dokumen (OCR KTP), Referensi kota,
//  Daftar pekerjaan, Glosarium, Template. Ruang kerja tiga panel (sumber | ekstraksi | terjemahan).
//  Gambar dibaca lewat server ATLAS (AI Gemini / Vision) bila login; cadangan Tesseract di perangkat. Akses: izin smart-translator.lihat (bawaan Superadmin).
// ============================================================
export default function SmartTranslator() {
  const { user } = useApp()
  if (!boleh(user, 'smart-translator.lihat')) return <Card><Empty icon={Lock} title="Tidak ada akses" text="Smart Translator hanya untuk yang diberi izin." /></Card>
  const src = 'smart-translator/app.html?embed=1'
  return (
    <div className="space-y-2" data-halaman-smart-translator>
      <div className="flex items-center justify-end gap-2">
        <a href="smart-translator/app.html" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-semibold ring-1 ring-slate-200 hover:text-brand md:min-h-8"><ExternalLink className="h-4 w-4" />Buka layar penuh</a>
      </div>
      <iframe title="Smart Translator" src={src} className="block w-full rounded-2xl bg-[#F4F5F9] ring-1 ring-[#E7E8F0]" style={{ height: 'calc(100dvh - 158px)', minHeight: 480 }} />
    </div>
  )
}
