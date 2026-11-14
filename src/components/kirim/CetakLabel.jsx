// Dialog "Cetak Label" — print langsung dari ATLAS (pengaturan seperti di dashboard Everpro),
// dengan cadangan: buka label resmi Everpro (PDF).
import { useMemo, useState } from 'react'
import { Printer, FileDown } from 'lucide-react'
import { useApp } from '../../lib/store.jsx'
import { Button, Sheet, cx } from '../ui.jsx'
import { resiOf, isEverpro } from '../../lib/kirim.js'
import { bukaLabelKirim } from '../../lib/kirimApi.js'
import { UKURAN_LABEL, OPSI_LABEL, bacaOpsiLabel, simpanOpsiLabel, cetakLabelAtlas, svgBarcode } from '../../lib/labelCetak.js'

function Pratinjau({ r, o }) {
  const pg = r?.pengirim || {}, pn = r?.penerima || {}, kr = r?.kurir || {}
  const resi = resiOf(r) || '0000000000000'
  const ongkir = r?.biaya_aktual?.total || r?.biaya?.total || kr.total || 0
  return (
    <div className="rounded-lg border-2 border-black bg-white p-3 text-[10px] leading-snug text-black" data-pratinjau-label>
      <div className="flex items-center justify-between border-b border-black pb-1">
        <span className="flex items-center gap-1.5">{o.logo && <b className="text-[11px]">247 Translator</b>}<span>{kr.kurir || 'Kurir'} <b>{kr.layanan || ''}</b></span></span>
        <span className="border border-black px-1 font-bold">{r?.paket?.cod ? 'COD' : 'NON COD'}</span>
      </div>
      <div className="mx-auto my-1.5 h-10 w-11/12" dangerouslySetInnerHTML={{ __html: svgBarcode(resi, 50) }} />
      <p className="text-center font-mono text-[12px] font-bold">{resi}</p>
      {o.ongkir && <p className="mt-1 border-t border-dashed border-black pt-1">Biaya pengiriman: <b>Rp {Math.round(ongkir).toLocaleString('id-ID')}</b></p>}
      <div className="mt-1 grid grid-cols-2 gap-2 border-t border-black pt-1">
        <div><p className="text-[8px] text-slate-600">PENGIRIM</p><p className="font-bold">{pg.nama || 'Nama pengirim'}</p>{o.telp_pengirim && <p className="font-semibold">{pg.telp || '08xx'}</p>}{o.alamat_pengirim && <p>{pg.alamat || 'Alamat pengirim'}</p>}</div>
        <div><p className="text-[8px] text-slate-600">PENERIMA</p><p className="font-bold">{pn.nama || 'Nama penerima'}</p>{o.telp_penerima && <p className="font-semibold">{pn.telp || '08xx'}</p>}<p>{[pn.alamat || 'Alamat penerima', o.kel_penerima ? pn.kelurahan : '', pn.kodepos].filter(Boolean).join(', ')}</p></div>
      </div>
      {o.tanggal && <p className="mt-1 border-t border-dashed border-black pt-1 text-right">Dicetak {new Date().toLocaleDateString('id-ID')}</p>}
      {o.templat === 'pelanggan' && <p className="mt-2 border-t border-dashed border-slate-400 pt-1 text-center text-slate-500">+ salinan untuk pelanggan</p>}
    </div>
  )
}

/** rows: daftar pengiriman yang akan dicetak. */
export default function CetakLabel({ rows, onClose }) {
  const { user, save, notify } = useApp()
  const [o, setO] = useState(bacaOpsiLabel)
  const [sibuk, setSibuk] = useState(false)
  const ubah = (p) => setO((x) => { const n = { ...x, ...p }; simpanOpsiLabel(n); return n })
  const siap = useMemo(() => rows.filter((r) => resiOf(r)), [rows])
  const adaEverpro = siap.some((r) => isEverpro(r) && r.everpro?.awb)

  const cetak = async () => {
    if (!siap.length) return notify('Belum ada pengiriman terpilih yang punya resi', 'err')
    if (!cetakLabelAtlas(siap, o)) return notify('Izinkan pop-up di browser untuk mencetak', 'err')
    const at = new Date().toISOString()
    for (const r of siap) await Promise.resolve(save('kirim', { id: r.id, label_log: [...(r.label_log || []), { at, by: user.name, jenis: 'atlas', ukuran: o.ukuran, jumlah: siap.length }].slice(-30), label_terakhir_at: at })).catch(() => null)
    notify(`Jendela cetak dibuka · ${siap.length} label${rows.length > siap.length ? ` (${rows.length - siap.length} dilewati, belum ada resi)` : ''}. Cetak skala 100%.`)
  }

  return (
    <Sheet open onClose={onClose} wide title="Cetak Label" subtitle={`${siap.length} label siap${rows.length > siap.length ? ` · ${rows.length - siap.length} belum ada resi` : ''}`}>
      <div className="grid gap-5 text-sm md:grid-cols-[1fr_1fr]" data-cetak-label>
        <div className="space-y-4">
          <div>
            <p className="mb-2 font-bold">Pengaturan</p>
            {OPSI_LABEL.map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 py-1"><input type="checkbox" className="h-4 w-4 accent-[#3E8E9E]" checked={!!o[k]} onChange={(e) => ubah({ [k]: e.target.checked })} />{l}</label>
            ))}
          </div>
          <div>
            <p className="mb-2 font-bold">Template resi</p>
            {[['kurir', 'Resi Kurir'], ['pelanggan', 'Resi Kurir & Pelanggan']].map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 py-1"><input type="radio" name="templat" className="h-4 w-4 accent-[#3E8E9E]" checked={o.templat === v} onChange={() => ubah({ templat: v })} />{l}</label>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 font-bold">Pratinjau</p>
          <Pratinjau r={siap[0] || rows[0]} o={o} />
        </div>
        <div className="md:col-span-2">
          <p className="mb-2 font-bold">Pilih ukuran</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <div><p className="mb-1 text-[12px] text-ink-mute">Kertas biasa</p>
              {UKURAN_LABEL.filter((u) => u.page).map((u) => <button key={u.id} type="button" onClick={() => ubah({ ukuran: u.id })} className={cx('w-full rounded-lg px-3 py-2.5 text-left font-semibold ring-1', o.ukuran === u.id ? 'bg-[#3E8E9E]/10 ring-2 ring-[#3E8E9E]' : 'ring-slate-300')}>{u.label}</button>)}
            </div>
            <div><p className="mb-1 text-[12px] text-ink-mute">Kertas thermal</p>
              <div className="grid grid-cols-2 gap-2">{UKURAN_LABEL.filter((u) => !u.page).map((u) => <button key={u.id} type="button" onClick={() => ubah({ ukuran: u.id })} className={cx('rounded-lg px-3 py-2.5 text-left ring-1', o.ukuran === u.id ? 'bg-[#3E8E9E]/10 font-semibold ring-2 ring-[#3E8E9E]' : 'ring-slate-300')} data-ukuran={u.id}>{u.label}</button>)}</div>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-ink-mute">Pengaturan tersimpan di perangkat ini. Saat dialog print muncul: pilih printer, ukuran kertas sama dengan pilihan di atas, skala <b>100%</b>, margin <b>None</b>.</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
        {adaEverpro && <Button variant="outline" loading={sibuk} onClick={async () => { setSibuk(true); await bukaLabelKirim(siap.filter((r) => isEverpro(r) && r.everpro?.awb).map((r) => r.id), notify); setSibuk(false) }}><FileDown className="h-4 w-4" />Label resmi Everpro (PDF)</Button>}
        <Button onClick={cetak} disabled={!siap.length} data-aksi="cetak-label"><Printer className="h-4 w-4" />Cetak {siap.length > 1 ? `${siap.length} label` : 'label'}</Button>
      </div>
    </Sheet>
  )
}
