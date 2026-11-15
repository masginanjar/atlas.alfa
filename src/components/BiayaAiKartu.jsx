import { useCallback, useEffect, useState } from 'react'
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { aiInfo, FITUR_AI, KATALOG_CONTOH } from '../lib/ai.js'
import { Card, cx } from './ui.jsx'

// ============================================================
//  DASHBOARD → BIAYA AI (GEMINI) BULAN INI.
//  Sumber: catatan pemakaian di server (fungsi gemini-ai, aksi `info`) — sama dengan Pengaturan → AI.
//  Angka = PERKIRAAN (jumlah token × harga model × kurs), bukan tagihan resmi Google.
//  Tampil hanya bagi yang punya izin `pengaturan.ai.lihat` (bawaan: Superadmin); server hanya
//  mengirim rincian pemakaian kepada pemegang izin atur — tanpa itu kartu tidak tampil.
// ============================================================
const rp = (n) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const namaBulan = (b) => { try { return new Date(`${b || new Date().toISOString().slice(0, 7)}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) } catch { return '' } }

export default function BiayaAiKartu() {
  const { user } = useApp()
  const izin = boleh(user, 'pengaturan.ai.lihat')
  const [info, setInfo] = useState(null); const [muat, setMuat] = useState(false); const [galat, setGalat] = useState('')
  const ambil = useCallback(async () => {
    setMuat(true); setGalat('')
    const r = await aiInfo()
    if (r?.ok && r.setelan) setInfo(r); else if (r?.ok) setInfo({ kosong: true }); else setGalat(r?.alasan || 'Gagal memuat biaya AI')
    setMuat(false)
  }, [])
  useEffect(() => { if (izin) ambil() }, [izin, ambil])
  if (!izin || info?.kosong) return null

  const kurs = info?.setelan?.kurs || 17000
  const kat = info?.katalog?.length ? info.katalog : KATALOG_CONTOH
  const fiturId = [...new Set([...FITUR_AI.map((f) => f.id), ...Object.keys(info?.pakai || {}).filter((k) => k !== 'pengaturan')])]
  const baris = fiturId.map((id) => {
    const s = info?.setelan?.fitur?.[id] || {}; const p = info?.pakai?.[id] || {}
    const biaya = (p.usd || 0) * kurs; const batas = Number(s.batas_rp) || 0
    return { id, label: FITUR_AI.find((f) => f.id === id)?.label || info?.daftarFitur?.find((f) => f.id === id)?.label || (id === 'uji' ? 'Uji coba sistem' : id), model: s.model ? (kat.find((m) => m.id === s.model)?.label || s.model) : info?.setelan?.fitur?.[id] ? 'Tanpa AI' : 'beberapa model', n: p.n || 0, biaya, batas, persen: batas > 0 ? Math.min(100, Math.round((biaya / batas) * 100)) : 0 }
  })
  const total = baris.reduce((a, b) => a + b.biaya, 0); const totalN = baris.reduce((a, b) => a + b.n, 0); const totalBatas = baris.reduce((a, b) => a + b.batas, 0)

  return (
    <Card className="overflow-hidden" data-biaya-ai>
      <div className="card-head flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-50"><Sparkles className="h-4 w-4 text-violet-600" /></span>
        <h2 className="min-w-0 truncate font-bold">Biaya AI (Gemini)</h2>
        <button type="button" onClick={ambil} disabled={muat} title="Muat ulang" aria-label="Muat ulang biaya AI"
          className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-mute hover:bg-slate-100 disabled:opacity-50 max-md:h-11 max-md:w-11">
          {muat ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw className="h-4 w-4" />}
        </button>
        <a href="#/settings/ai" className="shrink-0 text-[11px] font-semibold text-brand hover:underline max-md:py-3">Atur →</a>
      </div>
      {galat ? <p className="px-4 py-3 text-xs text-rose-700" role="alert">{galat}</p>
        : !info ? <p className="px-4 py-3 text-xs text-ink-mute">Memuat…</p>
        : (
          <div className="px-4 py-3">
            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-ink-mute">{namaBulan(info.bulan)}</p>
                <p className="text-2xl font-extrabold tabular-nums text-ink" data-biaya-ai-total>±{rp(total)}</p>
              </div>
              <p className="text-right text-[11px] text-ink-mute"><b className="text-ink">{totalN}</b> dokumen dibaca AI{totalBatas > 0 && <><br />batas total {rp(totalBatas)} / bulan</>}</p>
            </div>
            <ul className="mt-3 space-y-2.5">
              {baris.map((b) => (
                <li key={b.id} data-biaya-ai-fitur={b.id}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate font-semibold text-ink">{b.label}</span>
                    <span className="shrink-0 font-bold tabular-nums text-ink">±{rp(b.biaya)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-[11px] text-ink-mute">
                    <span className="min-w-0 truncate">{b.model} · {b.n} dokumen</span>
                    {b.batas > 0 && <span className="shrink-0">{b.persen}% dari {rp(b.batas)}</span>}
                  </div>
                  {b.batas > 0 && <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={b.persen} aria-valuemin={0} aria-valuemax={100} aria-label={`Pemakaian ${b.label}`}>
                    <div className={cx('h-full rounded-full', b.persen >= 90 ? 'bg-rose-500' : b.persen >= 60 ? 'bg-amber-500' : 'bg-violet-500')} style={{ width: `${b.persen}%` }} />
                  </div>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[10.5px] leading-snug text-ink-mute">
              {info.demo ? 'Mode demo: AI tidak dipanggil, jadi biayanya nol. Angka sebenarnya tampil di ATLAS live.'
                : `Perkiraan dari jumlah token × harga model (kurs Rp ${kurs.toLocaleString('id-ID')}/USD). Tagihan resmi ada di Google.`}
            </p>
          </div>
        )}
    </Card>
  )
}
