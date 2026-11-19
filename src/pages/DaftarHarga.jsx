import { useMemo, useState } from 'react'
import { Pencil, Check, Plus, Trash2, AlertTriangle, Copy, Link2 } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { Button, Card, cx } from '../components/ui.jsx'
import { canEditHarga, KATEGORI, SATUAN, rupiah, belumDiisi } from '../lib/harga.js'
import { KeAtas } from '../components/SlotAtas.jsx'
import { useTabel, Th, CariTabel } from '../components/TabelSortir.jsx'
import { cekOpsi } from '../lib/katalogOpsi.js'
import { boleh } from '../lib/izin.js'
import { LANGS, BHS_INTERNAL } from '../config/bahasa.js'
import { PRIORITIES, labelPrioritas } from '../config/priority.js'
import { SUB_TYPES } from '../config/subtypes.js'

const BAHASA_PILIH = LANGS.filter((x) => x !== 'Lainnya')
const pilihCls = 'h-8 min-w-0 rounded-lg border-0 bg-white px-1.5 text-[12px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand max-md:h-11 max-md:text-base'

/** Tautan baris Katalog → pilihan di form project. Hijau = opsinya ada di form; kuning = belum ada / belum ditautkan. */
function OpsiProject({ cek, onTambahLembaga, sibuk }) {
  const saran = cek.masalah.find((m) => m.kode === 'lembaga')?.lembaga
  if (!cek.masalah.length) return (
    <span data-opsi="ada" className="inline-flex max-w-full items-start gap-1 text-[12px] leading-snug text-emerald-800" title={cek.perkiraan ? 'Diperkirakan dari nama layanan — tekan “Ubah harga” untuk memastikan' : 'Pilihan ini ada di form project'}>
      <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0">{cek.teks}{cek.perkiraan && <span className="text-ink-mute"> · perkiraan</span>}</span>
    </span>
  )
  return (
    <span data-opsi="belum" className="block text-[12px] leading-snug text-amber-800">
      <span className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0">{cek.masalah.map((m) => m.teks).join(' · ')}</span></span>
      {saran && onTambahLembaga && (
        <button type="button" disabled={sibuk} onClick={() => onTambahLembaga(saran)} data-aksi="tambah-lembaga-katalog"
          className="mt-1 inline-flex min-h-8 items-center gap-1 rounded-lg bg-white px-2 text-[12px] font-semibold text-brand ring-1 ring-[#D9DBE7] hover:ring-brand disabled:opacity-50 max-md:min-h-11">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />Tambah “{saran}” ke lembaga
        </button>
      )}
    </span>
  )
}

/** Penyunting tautan (mode Ubah harga): jenis sub project + pilihan yang mengikutinya. */
function OpsiSunting({ row, cek, lembaga, onSimpan }) {
  const o = cek.opsi
  const set = (patch) => onSimpan({ opsi: { ...o, ...patch } })
  const ids = Array.isArray(o.lembaga) ? o.lembaga : o.lembaga ? [o.lembaga] : []
  const gantiJenis = (sub) => onSimpan({ opsi: sub === 'terjemahan' || sub === 'terjemahan_nt' ? { sub, bahasa: o.bahasa || '', pasangan: o.pasangan || 'Indonesia' }
    : sub === 'apostille' ? { sub, prioritas: o.prioritas || 'Normal' } : sub === 'legalisasi' ? { sub, lembaga: ids, prioritas: o.prioritas || 'Normal' } : { sub } })
  const internal = BHS_INTERNAL.includes(o.bahasa) && BHS_INTERNAL.includes(o.pasangan)
  return (
    <span className="flex flex-wrap items-center gap-1" data-opsi-sunting>
      <select value={SUB_TYPES[o.sub] ? o.sub : ''} onChange={(e) => gantiJenis(e.target.value)} aria-label={`Jenis sub project untuk ${row.layanan}`} className={pilihCls}>
        <option value="" disabled>Jenis…</option>
        {Object.entries(SUB_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
      </select>
      {(o.sub === 'terjemahan' || o.sub === 'terjemahan_nt') && <>
        <select value={BAHASA_PILIH.includes(o.bahasa) ? o.bahasa : ''} onChange={(e) => set({ bahasa: e.target.value })} aria-label="Bahasa" className={pilihCls}>
          <option value="" disabled>Bahasa…</option>{BAHASA_PILIH.map((x) => <option key={x}>{x}</option>)}
        </select>
        <span aria-hidden="true" className="text-ink-mute">⇄</span>
        <select value={BAHASA_PILIH.includes(o.pasangan) ? o.pasangan : ''} onChange={(e) => set({ pasangan: e.target.value })} aria-label="Bahasa pasangan" className={pilihCls}>
          <option value="" disabled>Bahasa…</option>{BAHASA_PILIH.map((x) => <option key={x}>{x}</option>)}
        </select>
        {internal && o.sub === 'terjemahan' && (
          <select value={o.jenis_dok || ''} onChange={(e) => { const { jenis_dok, ...r } = o; onSimpan({ opsi: e.target.value ? { ...r, jenis_dok: e.target.value } : r }) }} aria-label="Jenis dokumen" className={pilihCls}>
            <option value="">Reguler & Non Reguler</option><option value="reguler">Reguler</option><option value="non_reguler">Non Reguler</option>
          </select>
        )}
      </>}
      {o.sub === 'legalisasi' && (
        <select value={ids[0] && lembaga.some((p) => p.id === ids[0]) ? ids[0] : ''} onChange={(e) => set({ lembaga: [e.target.value, ...ids.slice(1).filter((x) => x !== e.target.value)] })} aria-label="Lembaga" className={cx(pilihCls, 'max-w-[190px]')}>
          <option value="" disabled>Lembaga…</option>{lembaga.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {o.sub === 'legalisasi' && ids.length > 1 && <span className="text-[11px] text-ink-mute">+{ids.length - 1} lembaga</span>}
      {(o.sub === 'apostille' || o.sub === 'legalisasi') && (
        <select value={PRIORITIES.includes(o.prioritas) ? o.prioritas : 'Normal'} onChange={(e) => set({ prioritas: e.target.value })} aria-label="Prioritas" className={pilihCls}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{labelPrioritas(p)}</option>)}
        </select>
      )}
    </span>
  )
}

/** Satu angka harga — "Belum diisi" bila kosong, supaya tidak ada yang salah menawar. */
function Harga({ nilai, kuat }) {
  const t = rupiah(nilai)
  if (t === null) return <span className="text-xs font-semibold text-amber-700">Belum diisi</span>
  return <span className={cx('tabular-nums', kuat ? 'text-sm font-bold text-ink' : 'text-sm text-ink-soft')}>{t}</span>
}

/** Kolom tabel Katalog — judulnya bisa diklik untuk mengurutkan. */
const KOLOM = [
  { key: 'kategori', label: 'Kategori', w: '13%', sort: (r) => String(r.kategori || '').toLowerCase() },
  { key: 'layanan', label: 'Layanan', w: '19%', sort: (r) => String(r.layanan || '').toLowerCase() },
  { key: 'satuan', label: 'Satuan', w: '9%', sort: (r) => String(r.satuan || '').toLowerCase() },
  { key: 'normal', label: 'Harga Normal', w: '11%', num: true, sort: (r) => (r.harga_normal == null ? -1 : Number(r.harga_normal)) },
  { key: 'kilat', label: 'Harga Kilat', w: '11%', num: true, sort: (r) => (r.harga_kilat == null ? -1 : Number(r.harga_kilat)) },
  { key: 'opsi', label: 'Opsi di form project', w: '23%', sort: (r) => String(r._cek?.teks || '').toLowerCase() },
  { key: 'catatan', label: 'Catatan', w: '14%', sort: (r) => String(r.catatan || '').toLowerCase() },
]

export default function DaftarHarga() {
  const { user, data, save, remove, notify } = useApp()
  const bolehUbah = canEditHarga(user)
  const [sunting, setSunting] = useState(false)
  const [fKat, setFKat] = useState('')
  const [fIsi, setFIsi] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const lembaga = useMemo(() => (data.people || []).filter((p) => p.type === 'lembaga').sort((a, b) => String(a.name).localeCompare(String(b.name), 'id')), [data.people])
  // _cek = hasil pemeriksaan tautan ke form project (tidak ikut tersimpan)
  const rows = useMemo(() => (data.daftar_harga || []).map((r) => ({ ...r, _cek: cekOpsi(r, lembaga) })), [data.daftar_harga, lembaga])
  const belumOpsi = rows.filter((r) => r._cek.masalah.length).length
  const kategoriAda = useMemo(
    () => [...new Set(rows.map((r) => r.kategori).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')),
    [rows],
  )
  const tersaring = useMemo(() => rows.filter((r) => {
    if (fKat && r.kategori !== fKat) return false
    if (fIsi === 'ada' && r.harga_normal == null) return false
    if (fIsi === 'kosong' && r.harga_normal != null) return false
    if (fIsi === 'opsi' && !r._cek.masalah.length) return false
    return true
  }), [rows, fKat, fIsi])
  // Pencarian, filter & urutan disimpan di sini, jadi tidak hilang saat mode ubah dinyalakan.
  const { rows: baris, sortKey, sortDir, klikJudul, cari, setCari } = useTabel(tersaring, KOLOM, { awalKey: 'kategori' })
  const kosong = belumDiisi(rows)

  const simpan = async (baris, patch) => {
    const { _cek, ...r } = baris
    const nilai = { ...r, ...patch }
    if (JSON.stringify(nilai) === JSON.stringify(r)) return
    try { await save('daftar_harga', nilai); notify('Harga diperbarui') }
    catch (e) { notify(e.message || 'Gagal menyimpan', 'err') }
  }
  const hapus = async (r) => {
    try { await remove('daftar_harga', r.id); notify('Baris dihapus') }
    catch (e) { notify(e.message || 'Gagal menghapus', 'err') }
  }
  const tambah = async (kategori) => {
    const urut = Math.max(0, ...rows.map((x) => Number(x.urutan) || 0)) + 1
    try { await save('daftar_harga', { kategori, layanan: 'Layanan baru', satuan: 'per halaman', harga_normal: null, harga_kilat: null, catatan: '', urutan: urut }) }
    catch (e) { notify(e.message || 'Gagal menambah', 'err') }
  }
  /** Tambah lembaga yang belum ada (mis. kedutaan baru) → langsung bisa dipilih di form project, lalu baris ditautkan. */
  const tambahLembaga = async (baris, nama) => {
    if (sibuk) return
    setSibuk(true)
    try {
      const ada = lembaga.find((p) => String(p.name || '').trim().toLowerCase() === nama.toLowerCase())
      const row = ada || await save('people', { name: nama, type: 'lembaga', branch: 'Semua', phone: '', note: '', dari_form: true, dibuat_oleh: user?.name || '', dibuat_oleh_id: user?.id || '' })
      if (!row?.id) throw new Error('Lembaga belum tersimpan — coba lagi')
      if (bolehUbah) { const { _cek, ...r } = baris; await save('daftar_harga', { ...r, opsi: { sub: 'legalisasi', lembaga: [row.id], prioritas: baris._cek.opsi.prioritas || 'Normal' } }) }
      notify(`Lembaga “${nama}” ditambahkan`)
    } catch (e) { notify(e.message || 'Gagal menambah lembaga', 'err') }
    finally { setSibuk(false) }
  }
  const bolehLembaga = boleh(user, 'lembaga.tambah')
  const salin = async (r) => {
    const n = rupiah(r.harga_normal), k = rupiah(r.harga_kilat)
    const teks = `${r.layanan} — ${n ?? 'harga belum diisi'}${r.satuan ? ` ${r.satuan}` : ''}${k ? ` · kilat ${k}` : ''}`
    try { await navigator.clipboard.writeText(teks); notify('Teks harga disalin') }
    catch { notify('Tidak bisa menyalin di perangkat ini', 'err') }
  }

  const angka = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

  return (
    <div className="min-w-0 space-y-4">
      {bolehUbah && <KeAtas slot="sesudah">
        <button type="button" onClick={() => setSunting((v) => !v)} aria-pressed={sunting} data-aksi="ubah-harga"
          className={cx('inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold ring-1 transition md:h-8', sunting ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-[#141B34] ring-[#D9DBE7] hover:ring-[#B9BDD0] dark:bg-white/5 dark:text-slate-100')}>
          {sunting ? <><Check className="h-4 w-4" aria-hidden="true" />Selesai</> : <><Pencil className="h-4 w-4" aria-hidden="true" />Ubah harga</>}
        </button>
      </KeAtas>}


      {kosong > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900 ring-1 ring-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <b>{kosong} layanan belum ada harganya.</b> Jangan dipakai menawar ke pelanggan sebelum diisi —
            tanyakan dulu ke Direktur. {bolehUbah && 'Tekan “Ubah harga” untuk mengisinya.'}
          </span>
        </p>
      )}

      {belumOpsi > 0 && (
        <p data-peringatan-opsi className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900 ring-1 ring-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span><b>{belumOpsi} layanan belum punya pilihan di form project.</b> Pilih filter “Belum ada opsi di project” untuk melihatnya{bolehUbah ? ', lalu tautkan lewat “Ubah harga”.' : '.'}</span>
        </p>
      )}

      {/* Baris 2 ringkas: judul · filter */}
      <div className="flex flex-wrap items-center gap-2" data-baris-dua>
        <h1 className="text-[17px] font-extrabold leading-tight tracking-tight" title="Harga jual ke pelanggan — panduan saat menawarkan. Bisa dilihat semua staf; yang mengubah hanya Superadmin dan Direktur.">Katalog</h1>
        <CariTabel atas value={cari} onChange={setCari} label="Cari layanan, kategori, catatan…" />
        <select value={fKat} onChange={(e) => setFKat(e.target.value)} aria-label="Filter kategori"
          className="h-11 w-auto max-w-full rounded-[10px] border-0 bg-white pl-2.5 pr-7 text-[13px] font-semibold text-ink ring-1 ring-[#D9DBE7] focus:outline-none focus:ring-2 focus:ring-brand md:h-8">
          <option value="">Semua kategori</option>
          {kategoriAda.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={fIsi} onChange={(e) => setFIsi(e.target.value)} aria-label="Filter kelengkapan harga"
          className="h-11 w-auto max-w-full rounded-[10px] border-0 bg-white pl-2.5 pr-7 text-[13px] font-semibold text-ink ring-1 ring-[#D9DBE7] focus:outline-none focus:ring-2 focus:ring-brand md:h-8">
          <option value="">Semua harga</option>
          <option value="ada">Sudah ada harga</option>
          <option value="kosong">Belum diisi</option>
          <option value="opsi">Belum ada opsi di project</option>
        </select>
        {bolehUbah && sunting && (
          <Button size="sm" variant="outline" onClick={() => tambah(fKat || kategoriAda[0] || KATEGORI[0])}>
            <Plus className="h-3.5 w-3.5" />Tambah baris
          </Button>
        )}
        <span className="ml-auto text-[11px] text-ink-mute">{baris.length} dari {rows.length} layanan</span>
      </div>

      {baris.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-ink-mute ring-1 ring-slate-200">Tidak ada yang cocok.</p>
      ) : (
        <>
        {/* HP (mode baca): kartu ringkas — tabel lebar hanya untuk desktop & mode ubah */}
        {!sunting && (
          <ul className="space-y-2 md:hidden" data-katalog-kartu>
            {baris.map((r) => (
              <li key={r.id} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-mute">{r.kategori}</p>
                    <p className="break-words text-[15px] font-bold leading-snug text-ink">{r.layanan}</p>
                  </div>
                  <button type="button" onClick={() => salin(r)} aria-label={`Salin harga ${r.layanan}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-mute ring-1 ring-slate-200 active:bg-slate-100"><Copy className="h-4 w-4" /></button>
                </div>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Harga nilai={r.harga_normal} kuat /><span className="text-[12px] text-ink-mute">{r.satuan}</span>
                  {rupiah(r.harga_kilat) && <span className="whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">Kilat {rupiah(r.harga_kilat)}</span>}
                </p>
                <div className="mt-2 border-t border-slate-100 pt-2"><OpsiProject cek={r._cek} sibuk={sibuk} onTambahLembaga={bolehLembaga ? (n) => tambahLembaga(r, n) : undefined} /></div>
                {r.catatan && <p className="mt-1 break-words text-[12px] text-ink-mute">{r.catatan}</p>}
              </li>
            ))}
          </ul>
        )}
        {sunting && <p className="text-[12px] text-ink-mute md:hidden">Geser tabel ke samping untuk melihat semua kolom.</p>}
        <Card className={cx('overflow-hidden', !sunting && 'max-md:hidden')}>
          <div className="min-w-0 max-w-full overflow-x-auto">
            <table className="tbl-rapat" style={{ minWidth: '1120px' }}>
              <thead>
                <tr>
                  {KOLOM.map((c) => <Th key={c.key} kolom={c} sortKey={sortKey} sortDir={sortDir} onKlik={klikJudul} />)}
                  <th style={{ width: '96px' }} className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {baris.map((r) => (
                  <tr key={r.id}>
                    <td><span className="text-ink-soft">{r.kategori}</span></td>
                    <td>
                      {sunting ? (
                        <input defaultValue={r.layanan} aria-label={`Nama layanan ${r.layanan}`}
                          onBlur={(e) => simpan(r, { layanan: e.target.value })}
                          className="h-8 w-full min-w-0 rounded-lg border-0 bg-white px-2 text-[13px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand" />
                      ) : <span className="font-semibold text-ink">{r.layanan}</span>}
                    </td>
                    <td>
                      {sunting ? (
                        <select defaultValue={r.satuan} aria-label={`Satuan ${r.layanan}`} onChange={(e) => simpan(r, { satuan: e.target.value })}
                          className="h-8 w-full min-w-0 rounded-lg border-0 bg-white px-1.5 text-[12px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand">
                          {SATUAN.map((x) => <option key={x}>{x}</option>)}
                        </select>
                      ) : <span className="text-[12px] text-ink-mute">{r.satuan}</span>}
                    </td>
                    <td className="num">
                      {sunting ? (
                        <input type="number" inputMode="numeric" defaultValue={r.harga_normal ?? ''} placeholder="Normal"
                          aria-label={`Harga normal ${r.layanan}`} onBlur={(e) => simpan(r, { harga_normal: angka(e.target.value) })}
                          className="h-8 w-full min-w-0 rounded-lg border-0 bg-white px-2 text-right text-[13px] tabular-nums ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand" />
                      ) : <Harga nilai={r.harga_normal} kuat />}
                    </td>
                    <td className="num">
                      {sunting ? (
                        <input type="number" inputMode="numeric" defaultValue={r.harga_kilat ?? ''} placeholder="Kilat"
                          aria-label={`Harga kilat ${r.layanan}`} onBlur={(e) => simpan(r, { harga_kilat: angka(e.target.value) })}
                          className="h-8 w-full min-w-0 rounded-lg border-0 bg-white px-2 text-right text-[13px] tabular-nums ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand" />
                      ) : (rupiah(r.harga_kilat)
                        ? <span className="whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">{rupiah(r.harga_kilat)}</span>
                        : <span className="text-ink-mute">—</span>)}
                    </td>
                    <td>
                      {sunting
                        ? <OpsiSunting row={r} cek={r._cek} lembaga={lembaga} onSimpan={(patch) => simpan(r, patch)} />
                        : <OpsiProject cek={r._cek} sibuk={sibuk} onTambahLembaga={bolehLembaga ? (n) => tambahLembaga(r, n) : undefined} />}
                    </td>
                    <td>
                      {sunting ? (
                        <input defaultValue={r.catatan || ''} placeholder="mis. minimal 2 halaman" aria-label={`Catatan ${r.layanan}`}
                          onBlur={(e) => simpan(r, { catatan: e.target.value })}
                          className="h-8 w-full min-w-0 rounded-lg border-0 bg-white px-2 text-[12px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand" />
                      ) : <span className="text-[12px] text-ink-mute">{r.catatan || '—'}</span>}
                    </td>
                    <td>
                      <span className="aksi">
                        <button type="button" onClick={() => salin(r)} title="Salin teks harga untuk dikirim ke pelanggan"
                          aria-label={`Salin harga ${r.layanan}`} className="text-ink-mute hover:bg-slate-100 hover:text-brand">
                          <Copy className="h-4 w-4" />
                        </button>
                        {sunting && (
                          <button type="button" onClick={() => hapus(r)} aria-label={`Hapus ${r.layanan}`} title="Hapus baris"
                            className="text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        </>
      )}
    </div>
  )
}
