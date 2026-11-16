import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LayoutDashboard, GripVertical, ChevronLeft, ChevronRight, EyeOff, Plus, RotateCcw, Check } from 'lucide-react'
import { cx } from './ui.jsx'

// ============================================================
//  TATA DASBOR — tiap orang menata kartu dasbornya sendiri.
//  Bebas menggeser urutan & memilih ukuran, tetapi ukurannya PAKEM:
//  lebar hanya ⅓ · ½ · ⅔ · penuh (kisi 6 kolom), tinggi hanya 4 pilihan
//  (kelipatan baris tetap) — jadi susunan selalu rata & simetris.
//  Kartu yang isinya lebih panjang dari tingginya digulir di dalam kartu.
//  • Berlaku di layar lebar (≥1024px). Di HP/tablet kartu tetap satu kolom
//    setinggi isinya; yang ikut hanyalah urutan & kartu yang disembunyikan.
//  • Tersimpan di akun pengguna (ikut pindah perangkat) + salinan di perangkat ini.
//  • Selama belum pernah ditata, dasbor tampil persis seperti bawaan.
// ============================================================
export const LEBAR = [[2, '⅓'], [3, '½'], [4, '⅔'], [6, 'Penuh']]
export const TINGGI = [[2, 'Pendek'], [3, 'Sedang'], [5, 'Tinggi'], [7, 'Jangkung']]
const kunci = (uid) => `atlas-dasbor-tata:${uid}`
const sah = (v, daftar, bawaan) => (daftar.some(([n]) => n === v) ? v : bawaan)

/**
 * Tataan tersimpan di AKUN (baris pengguna sendiri → ikut ke laptop & HP) dan disalin ke perangkat ini
 * sebagai cadangan cepat. Saat menyamar sebagai orang lain (mode hantu) tataan tidak disimpan ke akun.
 */
export function useTataDasbor(user, data, save) {
  const userId = user.id
  const baris = (data?.users || []).find((u) => u.id === userId)
  const diAkun = baris && baris.tata_dasbor !== undefined ? baris.tata_dasbor : undefined
  const sahTata = (v) => (v && Array.isArray(v.urut) ? v : null)
  const [tata, setTataMentah] = useState(() => { if (diAkun !== undefined) return sahTata(diAkun); try { return sahTata(JSON.parse(localStorage.getItem(kunci(userId)) || 'null')) } catch { return null } })
  const [atur, setAtur] = useState(false)
  const tunda = useRef(null); const menunggu = useRef(false)
  const setTata = useCallback((v) => {
    setTataMentah(v)
    try { if (v) localStorage.setItem(kunci(userId), JSON.stringify(v)); else localStorage.removeItem(kunci(userId)) } catch { /* penyimpanan penuh / diblokir */ }
    if (!save || user._actor) return
    menunggu.current = true
    clearTimeout(tunda.current)
    tunda.current = setTimeout(async () => {
      try { const row = (data?.users || []).find((u) => u.id === userId); if (row) await save('users', { ...row, tata_dasbor: v || null }) } catch { /* gagal simpan ke akun — tataan tetap ada di perangkat ini */ } finally { menunggu.current = false }
    }, 900)
  }, [userId, save, data, user._actor])
  // Tataan diubah dari perangkat lain → ikut, selama tidak sedang menata di sini.
  const teksAkun = diAkun === undefined ? undefined : JSON.stringify(diAkun || null)
  useEffect(() => {
    if (teksAkun === undefined || atur || menunggu.current) return
    setTataMentah((kini) => (JSON.stringify(kini || null) === teksAkun ? kini : sahTata(JSON.parse(teksAkun))))
  }, [teksAkun, atur]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(tunda.current), [])
  return { tata, setTata, atur, setAtur }
}

/** Tombol pembuka mode atur (ditaruh di atas papan). */
export function TombolTata({ atur, onKlik, adaTata }) {
  return (
    <button type="button" onClick={onKlik} aria-pressed={atur} data-aksi="tata-dasbor"
      className={cx('inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold ring-1 transition max-md:min-h-11', atur ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-soft ring-[#D9DBE7] hover:text-ink hover:ring-ink dark:bg-white/5 dark:ring-white/10')}>
      {atur ? <Check className="h-4 w-4" aria-hidden="true" /> : <LayoutDashboard className="h-4 w-4" aria-hidden="true" />}{atur ? 'Selesai menata' : adaTata ? 'Atur tampilan' : 'Atur tampilan dasbor'}
    </button>
  )
}

/**
 * Papan kartu. `kartu` = [{ id, label, el, w, h }] (w/h = ukuran bawaan). Kartu tanpa `el` dilewati.
 */
export default function PapanDasbor({ kartu, tata, setTata, atur, setAtur }) {
  const ada = useMemo(() => kartu.filter((k) => k.el), [kartu])
  const [seret, setSeret] = useState(null)
  const [sasaran, setSasaran] = useState(null)
  // susunan efektif: urutan tersimpan dulu, kartu baru (belum pernah ditata) menyusul di belakang
  const urut = useMemo(() => {
    const dikenal = (tata?.urut || []).filter((id) => ada.some((k) => k.id === id))
    return [...dikenal, ...ada.map((k) => k.id).filter((id) => !dikenal.includes(id))]
  }, [tata, ada])
  const sembunyi = (tata?.sembunyi || []).filter((id) => ada.some((k) => k.id === id))
  const ukuran = (k) => ({ w: sah(tata?.ukuran?.[k.id]?.w, LEBAR, k.w), h: sah(tata?.ukuran?.[k.id]?.h, TINGGI, k.h) })
  const simpan = (patch) => setTata({ urut, sembunyi, ukuran: tata?.ukuran || {}, ...patch })
  const pindah = (id, ke) => { const a = urut.filter((x) => x !== id); a.splice(Math.max(0, Math.min(a.length, ke)), 0, id); simpan({ urut: a }) }
  const geser = (id, d) => { const tampil = urut.filter((x) => !sembunyi.includes(x)); const i = tampil.indexOf(id); const j = i + d; if (j < 0 || j >= tampil.length) return; pindah(id, urut.indexOf(tampil[j])) }
  const setUkuran = (k, p) => simpan({ ukuran: { ...(tata?.ukuran || {}), [k.id]: { ...ukuran(k), ...p } } })
  const tampil = urut.filter((id) => !sembunyi.includes(id)).map((id) => ada.find((k) => k.id === id))
  const chip = (on) => cx('grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-[11px] font-bold ring-1 transition', on ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-soft ring-slate-300 hover:ring-ink')

  return (
    <div className="space-y-3" data-papan-dasbor={atur ? 'atur' : 'tata'}>
      {atur && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-[#EEEBFF] px-3.5 py-2.5 text-xs text-[#2A2170] ring-1 ring-[#D4CEFA]">
          <span className="min-w-0 flex-1 basis-64"><b>Mode atur tampilan.</b> <span className="max-lg:hidden">Seret kartu untuk memindah, pilih lebar & tingginya. Ukuran dikunci pada pilihan tetap supaya susunan selalu rata.</span><span className="lg:hidden">Pakai panah untuk mengurutkan dan tombol mata untuk menyembunyikan. Ukuran kartu hanya berlaku di layar lebar.</span></span>
          <button type="button" onClick={() => { setTata(null) }} data-aksi="tata-bawaan" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-white px-3 font-semibold ring-1 ring-[#D4CEFA] hover:ring-[#2A2170] max-md:min-h-11"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Kembalikan bawaan</button>
          <button type="button" onClick={() => setAtur(false)} data-aksi="tata-selesai" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[#2A2170] px-3 font-semibold text-white max-md:min-h-11"><Check className="h-3.5 w-3.5" aria-hidden="true" />Selesai</button>
        </div>
      )}
      {atur && sembunyi.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs" data-kartu-sembunyi>
          <span className="font-semibold text-ink-mute">Disembunyikan:</span>
          {sembunyi.map((id) => <button key={id} type="button" onClick={() => simpan({ sembunyi: sembunyi.filter((x) => x !== id) })} className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-white px-3 font-semibold ring-1 ring-slate-300 hover:ring-ink max-md:min-h-11"><Plus className="h-3.5 w-3.5" aria-hidden="true" />{ada.find((k) => k.id === id)?.label}</button>)}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-6 lg:[grid-auto-flow:dense] lg:[grid-auto-rows:112px]">
        {tampil.map((k) => {
          const u = ukuran(k)
          return (
            <section key={k.id} data-kartu-dasbor={k.id} data-w={u.w} data-h={u.h} aria-label={k.label} style={{ '--w': u.w, '--h': u.h }}
              draggable={atur || undefined}
              onDragStart={atur ? (e) => { setSeret(k.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', k.id) } catch { /* abaikan */ } } : undefined}
              onDragEnd={atur ? () => { setSeret(null); setSasaran(null) } : undefined}
              onDragOver={atur && seret && seret !== k.id ? (e) => { e.preventDefault(); setSasaran(k.id) } : undefined}
              onDrop={atur && seret && seret !== k.id ? (e) => { e.preventDefault(); pindah(seret, urut.filter((x) => x !== seret).indexOf(k.id)); setSeret(null); setSasaran(null) } : undefined}
              className={cx('relative min-w-0 lg:flex lg:flex-col lg:overflow-hidden lg:rounded-[20px] lg:bg-white lg:ring-1 lg:ring-[#E7E8F0] lg:[grid-column:span_var(--w)] lg:[grid-row:span_var(--h)] dark:lg:bg-white/5 dark:lg:ring-white/10',
                atur && 'rounded-[20px] outline-dashed outline-2 outline-offset-2 outline-[#8C7FE6]', seret === k.id && 'opacity-50', sasaran === k.id && '!outline-4 !outline-[#2A2170]')}>
              {atur && (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-[#D4CEFA] bg-[#EEEBFF] px-2 py-1.5 text-[#2A2170] max-lg:rounded-t-[20px]" data-alat-kartu>
                  <GripVertical className="h-4 w-4 flex-none cursor-grab max-lg:hidden" aria-hidden="true" />
                  <b className="min-w-0 flex-1 truncate text-xs">{k.label}</b>
                  <button type="button" onClick={() => geser(k.id, -1)} aria-label={`Majukan ${k.label}`} className="grid h-8 w-8 place-items-center rounded-lg bg-white ring-1 ring-slate-300 hover:ring-ink max-md:h-11 max-md:w-11"><ChevronLeft className="h-4 w-4 max-lg:rotate-90" /></button>
                  <button type="button" onClick={() => geser(k.id, 1)} aria-label={`Mundurkan ${k.label}`} className="grid h-8 w-8 place-items-center rounded-lg bg-white ring-1 ring-slate-300 hover:ring-ink max-md:h-11 max-md:w-11"><ChevronRight className="h-4 w-4 max-lg:rotate-90" /></button>
                  <span className="flex items-center gap-1 max-lg:hidden" role="group" aria-label={`Lebar ${k.label}`}><span className="text-[10px] font-semibold uppercase">Lebar</span>{LEBAR.map(([n, l]) => <button key={n} type="button" onClick={() => setUkuran(k, { w: n })} aria-pressed={u.w === n} data-lebar={n} className={chip(u.w === n)}>{l}</button>)}</span>
                  <span className="flex items-center gap-1 max-lg:hidden" role="group" aria-label={`Tinggi ${k.label}`}><span className="text-[10px] font-semibold uppercase">Tinggi</span>{TINGGI.map(([n, l]) => <button key={n} type="button" onClick={() => setUkuran(k, { h: n })} aria-pressed={u.h === n} data-tinggi={n} className={chip(u.h === n)}>{l}</button>)}</span>
                  <button type="button" onClick={() => simpan({ sembunyi: [...sembunyi, k.id] })} aria-label={`Sembunyikan ${k.label}`} title="Sembunyikan kartu ini" className="grid h-8 w-8 place-items-center rounded-lg bg-white text-rose-600 ring-1 ring-slate-300 hover:ring-rose-500 max-md:h-11 max-md:w-11"><EyeOff className="h-4 w-4" /></button>
                </div>
              )}
              {/* isi kartu: kartu aslinya dilebur ke bingkai (tanpa bayangan/garis ganda) dan digulir bila lebih panjang */}
              <div className={cx('min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-auto lg:[&>*]:!rounded-none lg:[&>*]:!shadow-none lg:[&>*]:!ring-0', atur && 'pointer-events-none select-none')}>
                {k.el}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
