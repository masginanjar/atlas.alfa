import { useEffect, useState } from 'react'
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { rupiah } from '../lib/format.js'
import { Button, Card, Field, Input, Select, cx } from './ui.jsx'
import { aiInfo, aiAtur, FITUR_AI, TINGKAT, kiraBiaya } from '../lib/ai.js'

// ============================================================
//  PENGATURAN → AI (Gemini). Pilih model per fitur, batas biaya per bulan, dan lihat pemakaian.
//  Izin: pengaturan.ai.lihat (buka) · pengaturan.ai.atur (ubah). Server memeriksa ulang izin "atur".
//  Kunci Gemini TIDAK ada di sini — hanya di Supabase Secrets.
// ============================================================
const rp = (n) => (n > 0 && n < 1 ? `Rp ${n.toFixed(2).replace('.', ',')}` : n < 100 ? `Rp ${Math.round(n * 10) / 10}`.replace('.', ',') : rupiah(Math.round(n)))

export default function AiSettings() {
  const { user, notify } = useApp()
  const bisaAtur = boleh(user, 'pengaturan.ai.atur')
  const [info, setInfo] = useState(null)
  const [f, setF] = useState(null) // salinan yang sedang diedit
  const [sibuk, setSibuk] = useState(false)
  const muat = async () => { setInfo(null); const r = await aiInfo(); setInfo(r); if (r.ok && r.setelan) setF(structuredClone(r.setelan)) }
  useEffect(() => { muat() }, [])

  if (!boleh(user, 'pengaturan.ai.lihat')) return <Card className="p-5 text-sm text-ink-mute" data-ai-tanpa-akses>Tidak ada akses ke pengaturan AI.</Card>
  if (!info) return <Card className="flex items-center gap-2 p-5 text-sm text-ink-mute"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Memuat pengaturan AI…</Card>
  if (!info.ok || !f) return <Card className="space-y-3 p-5" role="alert"><p className="text-sm text-rose-700">{info.alasan || 'Pengaturan AI tidak bisa dimuat (akun ini tidak punya izin mengatur AI di server).'}</p><Button variant="outline" onClick={muat}><RefreshCw className="h-4 w-4" />Coba lagi</Button></Card>

  const kat = info.katalog || []
  const berubah = JSON.stringify(f) !== JSON.stringify(info.setelan)
  const ubah = (id, patch) => setF((s) => ({ ...s, fitur: { ...s.fitur, [id]: { ...s.fitur[id], ...patch } } }))
  const simpan = async () => {
    if (sibuk) return; setSibuk(true)
    try {
      const r = await aiAtur({ kurs: f.kurs, fitur: f.fitur })
      if (!r.ok) return notify(r.alasan || 'Gagal menyimpan', 'err')
      notify('Pengaturan AI disimpan'); setInfo({ ...info, setelan: r.setelan }); setF(structuredClone(r.setelan))
    } finally { setSibuk(false) }
  }

  return (
    <div className="space-y-4" data-ai-pengaturan>
      <Card className="space-y-2 p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Sparkles className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 className="font-bold">AI (Google Gemini)</h2>
            <p className="text-sm text-ink-mute">Satu kunci Gemini dipakai untuk semua model. Pilih model untuk tiap fitur di bawah — yang hemat untuk pekerjaan sederhana, yang lebih bagus untuk pekerjaan yang butuh ketelitian.</p>
          </div>
        </div>
        <p data-ai-status className={cx('rounded-xl px-3 py-2 text-sm', info.demo ? 'bg-amber-50 text-amber-800' : info.aktif ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700')}>
          {info.demo ? 'Mode demo: pilihan di sini hanya tersimpan di perangkat ini dan AI tidak dipanggil. Di ATLAS live, pengaturan ini berlaku untuk semua pengguna.' : info.aktif ? 'Kunci Gemini terpasang di server. AI siap dipakai.' : 'Kunci Gemini belum terpasang di server (Supabase Secrets → GEMINI_API_KEY). Semua fitur memakai cara cadangan.'}
        </p>
      </Card>

      <p className="text-sm text-ink-mute" data-ai-jumlah>Ada <b className="text-ink">{FITUR_AI.length} fitur</b> ATLAS yang memakai AI. Fitur lain (OCR Google Vision, Zoho, Everpro, email) tidak memakai Gemini.</p>

      {FITUR_AI.map((ft) => {
        const s = f.fitur[ft.id]
        if (!s) return <Card key={ft.id} className="space-y-1 p-5" data-ai-fitur={ft.id}><h3 className="font-bold">{ft.label}</h3><p className="text-sm text-amber-800">{info.lainGagal || 'Pengaturan fitur ini belum bisa dimuat.'} Fitur tetap berjalan dengan pengaturan terakhir.</p></Card>
        const m = kat.find((x) => x.id === s.model); const p = info.pakai?.[ft.id]; const terpakai = (p?.usd || 0) * f.kurs
        const persen = s.batas_rp > 0 ? Math.min(100, Math.round((terpakai / s.batas_rp) * 100)) : 0
        return (
          <Card key={ft.id} className="space-y-3 p-5" data-ai-fitur={ft.id}>
            <div><h3 className="font-bold">{ft.label}</h3>{ft.di && <p className="text-xs font-semibold text-brand">{ft.di}</p>}<p className="text-sm text-ink-mute">{ft.ket}</p></div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Model AI" hint={!m ? 'Tidak ada biaya AI' : ft.token ? `±${rp(kiraBiaya(m, ft, f.kurs))} per dokumen (perkiraan)` : p?.n ? `Rata-rata ±${rp(terpakai / p.n)} per pemakaian bulan ini` : 'Belum dipakai bulan ini — biaya per pemakaian belum diketahui'}>
                <Select value={s.model} disabled={!bisaAtur} onChange={(e) => ubah(ft.id, { model: e.target.value })} className="max-md:min-h-11 max-md:text-base" data-ai-model={ft.id} aria-label={`Model AI untuk ${ft.label}`}>
                  {!ft.lain && <option value="">{ft.tanpa}</option>}
                  {Object.entries(TINGKAT).map(([t, l]) => <optgroup key={t} label={l}>{kat.filter((x) => x.tingkat === t).map((x) => <option key={x.id} value={x.id}>{l} — {x.label}</option>)}</optgroup>)}
                  {s.model && !m && <option value={s.model}>{s.model} (tidak ada di daftar)</option>}
                </Select>
              </Field>
              <Field label="Batas biaya per bulan (Rp)" hint={ft.lain ? 'Tercapai → fitur ini berhenti sampai bulan berikutnya (tidak ada cara tanpa AI). Minimal Rp 10.000' : 'Tercapai → fitur ini kembali ke cara tanpa AI sampai bulan berikutnya'}>
                <Input type="number" inputMode="numeric" min={ft.lain ? 10000 : 0} step={10000} value={s.batas_rp} disabled={!bisaAtur || !s.model} onChange={(e) => ubah(ft.id, { batas_rp: Math.max(0, Number(e.target.value) || 0) })} className="max-md:min-h-11 max-md:text-base" data-ai-batas={ft.id} />
              </Field>
            </div>
            {ft.id === 'bukti' && (
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <input type="checkbox" className="mt-1" checked={!!s.otomatis} disabled={!bisaAtur} onChange={(e) => ubah(ft.id, { otomatis: e.target.checked })} data-ai-otomatis />
                <span><b className="text-sm">Proses otomatis bila cocok</b><span className="block text-xs text-ink-mute">Baris yang nominal, sumber dana, dan status banknya cocok dengan tepat satu pengajuan langsung ditandai sudah ditransfer tanpa menekan Konfirmasi. Baris yang ragu tetap menunggu diperiksa.</span></span>
              </label>
            )}
            {!info.demo && (
              <div className="text-xs text-ink-mute" data-ai-pakai={ft.id}>
                <div className="flex flex-wrap justify-between gap-x-3"><span>Bulan ini: <b className="text-ink">{p?.n || 0}</b> {ft.lain ? 'kali dipakai' : 'dokumen'} · ±<b className="text-ink">{rp(terpakai)}</b></span>{s.batas_rp > 0 && <span>{persen}% dari batas</span>}</div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={persen} aria-valuemin={0} aria-valuemax={100} aria-label={`Pemakaian ${ft.label}`}><div className={cx('h-full', persen >= 90 ? 'bg-rose-500' : 'bg-brand')} style={{ width: `${persen}%` }} /></div>
              </div>
            )}
          </Card>
        )
      })}

      <Card className="space-y-3 p-5">
        <Field label="Kurs perkiraan (Rp per 1 USD)" hint="Google menagih dalam dolar. Kurs ini hanya untuk menampilkan perkiraan rupiah dan menghitung batas biaya." className="md:max-w-xs">
          <Input type="number" inputMode="numeric" min={10000} max={40000} step={100} value={f.kurs} disabled={!bisaAtur} onChange={(e) => setF({ ...f, kurs: Number(e.target.value) || 0 })} className="max-md:min-h-11 max-md:text-base" data-ai-kurs />
        </Field>
        <ul className="space-y-1 text-xs text-ink-mute">
          <li>• Angka biaya adalah perkiraan dari jumlah token; tagihan resmi ada di Google.</li>
          <li>• Hasil AI tetap perlu dicek — AI bisa salah baca, terutama pada foto buram atau terpotong.</li>
          <li>• Isi dokumen tidak disimpan di server ATLAS; yang dicatat hanya jumlah pemakaian.</li>
        </ul>
      </Card>

      {bisaAtur && (
        <div className="sticky bottom-0 z-10 -mx-1 flex gap-2 bg-gradient-to-t from-white via-white to-transparent px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 max-md:bottom-16">
          <Button variant="outline" disabled={!berubah || sibuk} onClick={() => setF(structuredClone(info.setelan))} className="max-md:min-h-11">Batal</Button>
          <Button className="flex-1 max-md:min-h-11 md:flex-none" disabled={!berubah} loading={sibuk} onClick={simpan} data-ai-simpan>Simpan pengaturan AI</Button>
        </div>
      )}
    </div>
  )
}
