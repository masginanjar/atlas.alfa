import { useEffect, useMemo, useRef, useState } from 'react'
import { FileSignature, Plus, Trash2, ArrowUp, ArrowDown, Printer, Download, Save, ScanLine, Upload, UserCog, ArrowLeft, AlertTriangle, CheckCircle2, Settings2, Lock, Loader2, FolderOpen, FolderInput } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { go } from '../lib/router.js'
import { scopeByBranch, invoiceLabel } from '../config/access.js'
import { SUB_TYPES } from '../config/subtypes.js'
import { collect, uploadProjectFiles } from '../components/FileManager.jsx'
import { drive } from '../lib/integrations.js'
import { saveBlob, dataUrlToBlob } from '../lib/download.js'
import { printBlob } from '../lib/printing.js'
import { renderPdf } from '../lib/pdfRender.js'
import { buatPdf, suratBaru, rangkaiAlamat, cekNik, kekurangan, namaFile, tglIndo, LAYANAN, STATUS_SK, REDAKSI_BAWAAN, TPL_VERSI, KOLOM_BAWAAN, KOLOM_MIN, KOLOM_NAMA, kolomDari } from '../lib/suratKuasa.js'
import { bacaKtp } from '../lib/ktpOcr.js'
import { Button, Card, Empty, Input, Textarea, Select, Sheet, cx } from '../components/ui.jsx'

// ============================================================
//  SURAT KUASA (menu Alat) — buat surat kuasa satu halaman A4 dari data KTP + daftar dokumen.
//  Izin: surat-kuasa.lihat / tambah / ubah / hapus / cetak / atur (Pengaturan → Role & Hak Akses).
//  Data: tabel surat_kuasa (per pekerjaan/cabang) & surat_kuasa_penerima (master penerima kuasa).
// ============================================================
const KOLOM_KTP = [['nama', 'Nama lengkap'], ['nik', 'NIK'], ['pekerjaan', 'Pekerjaan'], ['alamat', 'Alamat (jalan)'], ['rtrw', 'RT/RW'], ['kel', 'Kel/Desa'], ['kec', 'Kecamatan'], ['kabkota', 'Kabupaten/Kota'], ['provinsi', 'Provinsi'], ['kodepos', 'Kode pos (opsional)']]
const WARNA_ST = { draf: 'bg-slate-100 text-slate-700', perlu_diperiksa: 'bg-amber-100 text-amber-900', siap_cetak: 'bg-emerald-100 text-emerald-800' }
const Lbl = ({ children, htmlFor }) => <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-ink-soft">{children}</label>
const Bagian = ({ no, judul, sisi, children }) => <Card className="space-y-3 p-4"><div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 flex-1 text-sm font-extrabold tracking-tight"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-[#141B34] text-[11px] text-white">{no}</span>{judul}</h2>{sisi}</div>{children}</Card>
const TanpaAkses = () => <Card><Empty icon={Lock} title="Tidak ada akses" text="Surat Kuasa hanya untuk yang diberi izin." /></Card>

export default function SuratKuasa({ param, param2 }) {
  const { user } = useApp()
  if (!boleh(user, 'surat-kuasa.lihat')) return <TanpaAkses />
  if (param === 'penerima') return <MasterPenerima />
  if (param) return <Editor key={`${param}:${param2 || ''}`} id={param === 'new' ? null : param} projectId={param === 'new' ? param2 : null} />
  return <Daftar />
}

function Daftar() {
  const { user, data, remove, notify, ask } = useApp()
  const rows = useMemo(() => scopeByBranch(user, data.surat_kuasa || []).sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''))), [user, data.surat_kuasa])
  const hapus = async (r) => { if (!(await ask?.({ title: 'Hapus surat kuasa?', text: `${r.pemberi?.nama || 'Tanpa nama'} — tidak bisa dikembalikan.`, danger: true }) ?? window.confirm('Hapus surat kuasa ini?'))) return; try { await remove('surat_kuasa', r.id); notify('Surat kuasa dihapus') } catch (e) { notify(e.message, 'err') } }
  return (
    <div className="space-y-3" data-halaman-surat-kuasa>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex min-w-0 flex-1 items-center gap-2 text-[17px] font-extrabold tracking-tight"><FileSignature className="h-5 w-5 text-brand" />Surat Kuasa</h1>
        {boleh(user, 'surat-kuasa.atur') && <Button variant="outline" className="max-md:min-h-11" onClick={() => go('surat-kuasa/penerima')}><UserCog className="h-4 w-4" />Master Penerima Kuasa</Button>}
        {boleh(user, 'surat-kuasa.tambah') && <Button variant="dark" className="max-md:min-h-11" onClick={() => go('surat-kuasa/new')} data-aksi="sk-baru"><Plus className="h-4 w-4" />Buat Surat Kuasa</Button>}
      </div>
      {rows.length === 0 ? <Card><Empty icon={FileSignature} title="Belum ada surat kuasa" text="Buat dari sini, atau dari tombol “Buat Surat Kuasa” di detail project." /></Card> : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <button type="button" onClick={() => go(`surat-kuasa/${r.id}`)} className="min-w-0 flex-1 basis-56 text-left max-md:min-h-11">
                <span className="block truncate text-sm font-bold text-ink">{r.pemberi?.nama || '(tanpa nama)'}</span>
                <span className="block truncate text-xs text-ink-mute">{r.invoice_no ? invoiceLabel(r.invoice_no) + ' · ' : ''}{LAYANAN[r.layanan] || '-'} · {(r.dokumen || []).length} dokumen · {r.tanggal ? tglIndo(r.tanggal) : 'tanggal belum diisi'} · versi {r.versi || 1}</span>
              </button>
              <span className={cx('rounded-full px-2.5 py-1 text-[11px] font-bold', WARNA_ST[r.status] || WARNA_ST.draf)}>{STATUS_SK[r.status] || 'Draf'}</span>
              {boleh(user, 'surat-kuasa.hapus') && <button type="button" onClick={() => hapus(r)} aria-label={`Hapus surat ${r.pemberi?.nama || ''}`} className="grid h-9 w-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50 max-md:h-11 max-md:w-11"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

function MasterPenerima() {
  const { user, data, save, remove, notify } = useApp()
  const bolehAtur = boleh(user, 'surat-kuasa.atur')
  const rows = data.surat_kuasa_penerima || []
  const [edit, setEdit] = useState(null)
  const [sibuk, setSibuk] = useState(false)
  const simpan = async () => {
    if (!edit.nama?.trim()) return notify('Nama wajib diisi', 'err')
    setSibuk(true)
    try { await save('surat_kuasa_penerima', { ...edit, aktif: edit.aktif !== false, urutan: Number(edit.urutan) || 0 }); notify('Penerima kuasa disimpan'); setEdit(null) } catch (e) { notify(e.message, 'err') } finally { setSibuk(false) }
  }
  return (
    <div className="space-y-3">
      <button onClick={() => go('surat-kuasa')} className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-ink-mute hover:text-ink max-md:min-h-11"><ArrowLeft className="h-4 w-4" />Surat Kuasa</button>
      <div className="flex flex-wrap items-center gap-2"><h1 className="min-w-0 flex-1 text-[17px] font-extrabold tracking-tight">Master Penerima Kuasa</h1>
        {bolehAtur && <Button variant="dark" className="max-md:min-h-11" onClick={() => setEdit({ nama: '', nik: '', pekerjaan: '', alamat: '', aktif: true, bawaan: 0 })}><Plus className="h-4 w-4" />Tambah</Button>}</div>
      <p className="text-xs text-ink-mute">Profil yang sering dipakai sebagai penerima kuasa. “Bawaan 1 / 2” otomatis terisi di surat baru; staf tetap memeriksa sebelum mencetak.</p>
      {rows.length === 0 ? <Card><Empty icon={UserCog} title="Belum ada penerima kuasa" text={bolehAtur ? 'Tambahkan profil penerima kuasa yang sudah dikonfirmasi.' : 'Minta admin menambahkan profil penerima kuasa.'} /></Card> : (
        <Card className="divide-y divide-slate-100 overflow-hidden">{rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <div className="min-w-0 flex-1 basis-56"><span className="block truncate text-sm font-bold">{r.nama}</span><span className="block truncate text-xs text-ink-mute">{r.pekerjaan || '-'} · {r.alamat || '-'}</span></div>
            {r.bawaan ? <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-800">Bawaan {r.bawaan}</span> : null}
            <span className={cx('rounded-full px-2.5 py-1 text-[11px] font-bold', r.aktif !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>{r.aktif !== false ? 'Aktif' : 'Nonaktif'}</span>
            {bolehAtur && <Button size="sm" variant="outline" className="max-md:min-h-11" onClick={() => setEdit({ ...r })}>Ubah</Button>}
          </div>))}</Card>
      )}
      {edit && (
        <Sheet open onClose={() => setEdit(null)} title={edit.id ? 'Ubah penerima kuasa' : 'Tambah penerima kuasa'}
          footer={<>{edit.id && <Button variant="outline" className="!text-rose-700" onClick={async () => { try { await remove('surat_kuasa_penerima', edit.id); setEdit(null); notify('Dihapus') } catch (e) { notify(e.message, 'err') } }}>Hapus</Button>}<Button variant="outline" className="flex-1" onClick={() => setEdit(null)}>Batal</Button><Button variant="dark" className="flex-[2]" loading={sibuk} onClick={simpan}>Simpan</Button></>}>
          <div className="space-y-3">
            {[['nama', 'Nama lengkap'], ['nik', 'NIK'], ['pekerjaan', 'Pekerjaan']].map(([k, l]) => <div key={k}><Lbl htmlFor={`mp-${k}`}>{l}</Lbl><Input id={`mp-${k}`} value={edit[k] || ''} inputMode={k === 'nik' ? 'numeric' : undefined} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className="max-md:text-base" />{k === 'nik' && edit.nik ? <p className={cx('mt-1 text-[11px]', cekNik(edit.nik).ok ? 'text-ink-mute' : 'text-amber-700')}>{cekNik(edit.nik).x}</p> : null}</div>)}
            <div><Lbl htmlFor="mp-alamat">Alamat lengkap (seperti akan tertulis di surat)</Lbl><Textarea id="mp-alamat" rows={3} value={edit.alamat || ''} onChange={(e) => setEdit({ ...edit, alamat: e.target.value })} className="max-md:text-base" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl htmlFor="mp-bawaan">Jadikan bawaan</Lbl><Select id="mp-bawaan" value={edit.bawaan || 0} onChange={(e) => setEdit({ ...edit, bawaan: Number(e.target.value) })}><option value={0}>Bukan bawaan</option><option value={1}>Bawaan 1</option><option value={2}>Bawaan 2</option></Select></div>
              <div><Lbl htmlFor="mp-aktif">Status</Lbl><Select id="mp-aktif" value={edit.aktif !== false ? '1' : '0'} onChange={(e) => setEdit({ ...edit, aktif: e.target.value === '1' })}><option value="1">Aktif</option><option value="0">Nonaktif</option></Select></div>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function Editor({ id, projectId }) {
  const { user, data, save, notify } = useApp()
  const lama = id ? (data.surat_kuasa || []).find((r) => r.id === id) : null
  const project = (data.projects || []).find((p) => p.id === (lama?.project_id || projectId)) || null
  const master = (data.surat_kuasa_penerima || []).filter((r) => r.aktif !== false)
  const setelan = (data.app_settings || []).find((x) => x.key === 'surat_kuasa')
  const bolehUbah = boleh(user, id ? 'surat-kuasa.ubah' : 'surat-kuasa.tambah')
  const bolehCetak = boleh(user, 'surat-kuasa.cetak')
  const [s, setS] = useState(() => {
    if (lama) return { ...suratBaru(), ...lama }
    const b = suratBaru()
    b.penerima = [1, 2].map((n) => master.find((m) => m.bawaan === n)).filter(Boolean).map((m) => ({ master_id: m.id, nama: m.nama, nik: m.nik, pekerjaan: m.pekerjaan, alamat: m.alamat }))
    if (project) {
      const subs = project.sub_projects || []
      const ap = subs.some((x) => x.type === 'apostille'), lg = subs.some((x) => x.type === 'legalisasi')
      b.layanan = ap && lg ? 'keduanya' : lg ? 'legalisasi' : 'apostille'; b.layanan_dari = ap || lg ? 'pekerjaan' : ''
      // Nomor ID dari form Apostille/Legalisasi (bila berbentuk NIK 16 angka) → NIK pemberi kuasa; tetap dicocokkan dengan KTP.
      const idForm = subs.map((x) => String(x.applicant_id || '').replace(/\s/g, '')).find((t) => /^\d{16}$/.test(t))
      if (idForm) b.pemberi.nik = idForm
    }
    return b
  })
  const red = useMemo(() => ({ ...REDAKSI_BAWAAN, ...(lama?.redaksi || setelan?.redaksi || {}), kolom: setelan?.kolom }), [lama, setelan])
  const [ktp, setKtp] = useState(null) // { gambar (dataURL), mesin, catatan, cek: {kolom: alasan} }
  const [sibuk, setSibuk] = useState('')
  const [hasil, setHasil] = useState(null)
  const [aturRed, setAturRed] = useState(false)
  const pratinjau = useRef(null)
  const kotor = useRef(false)

  /** Ubah isi. Perubahan substansi setelah “Siap dicetak” → kembali “Perlu diperiksa”. */
  const ubah = (patch) => { kotor.current = true; setS((v) => ({ ...v, ...(typeof patch === 'function' ? patch(v) : patch), status: v.status === 'siap_cetak' ? 'perlu_diperiksa' : v.status })) }
  const ubahPemberi = (k, val, manual = true) => ubah((v) => { const p = { ...v.pemberi, [k]: val }; const alamatManual = k === 'alamat_surat' ? true : v.alamat_manual; if (!alamatManual) p.alamat_surat = rangkaiAlamat(p); return { pemberi: p, alamat_manual: alamatManual, pemberi_diedit: manual ? [...new Set([...(v.pemberi_diedit || []), k])] : v.pemberi_diedit } })

  // Pratinjau = PDF yang sama dengan yang diunduh/dicetak
  useEffect(() => {
    const t = setTimeout(async () => { const r = buatPdf(s, red); setHasil(r); if (pratinjau.current) { try { await renderPdf(r.blob || r.pratinjau, pratinjau.current, { maxPages: 1 }) } catch { /* pratinjau gagal: ekspor tetap memeriksa ulang */ } } }, 350)
    return () => clearTimeout(t)
  }, [s, red])

  const tarikKtp = async (blob, nama) => {
    setSibuk('ktp')
    try {
      const r = await bacaKtp(blob, nama)
      const k = Math.min(1, 900 / r.kanvas.width); const c = document.createElement('canvas'); c.width = Math.round(r.kanvas.width * k); c.height = Math.round(r.kanvas.height * k); c.getContext('2d').drawImage(r.kanvas, 0, 0, c.width, c.height)
      const cek = {}; let terisi = 0, dilewati = 0
      const idForm = (project?.sub_projects || []).map((x) => String(x.applicant_id || '').replace(/\s/g, '')).find((t) => /^\d{16}$/.test(t))
      setS((v) => { const p = { ...v.pemberi }; for (const [kol, o] of Object.entries(r.nilai)) { if ((v.pemberi_diedit || []).includes(kol)) { dilewati++; continue } if (o.v) { p[kol] = o.v; terisi++ } if (o.perlu_cek) cek[kol] = o.alasan }
        if (idForm && p.nik && p.nik !== idForm && !(v.pemberi_diedit || []).includes('nik')) cek.nik = `Berbeda dengan Nomor ID di form project (${idForm}) — cocokkan dengan KTP`
        if (!v.alamat_manual) p.alamat_surat = rangkaiAlamat(p); return { ...v, pemberi: p, ktp_sumber: nama || 'unggahan', ktp_mesin: r.mesin, ktp_mesin_label: r.mesinLabel, status: v.status === 'siap_cetak' ? 'perlu_diperiksa' : v.status } })
      kotor.current = true
      setKtp({ gambar: c.toDataURL('image/jpeg', 0.85), mesin: r.mesin, catatan: r.catatan, cek })
      notify(`KTP dibaca (${r.mesinLabel}) — periksa setiap kolom${dilewati ? `; ${dilewati} koreksi Anda tidak ditimpa` : ''}`)
    } catch (e) { notify(`KTP tidak bisa dibaca: ${e.message}. Isi manual.`, 'err') } finally { setSibuk('') }
  }
  const berkasProject = useMemo(() => (project ? collect(project, { user }).filter((f) => /\.(jpe?g|png|pdf)$/i.test(f.name || '')) : []), [project, user])
  const suratLain = useMemo(() => (project ? (data.surat_kuasa || []).filter((r) => r.project_id === project.id && r.id !== id && r.pemberi?.nama) : []), [project, data.surat_kuasa, id])

  // Sambungan otomatis dari form Apostille/Legalisasi: surat baru untuk sebuah project → dokumen diambil dari pekerjaan
  // dan scan ID pemohon langsung dibaca sebagai KTP. Sekali saja; hasilnya tetap harus diperiksa.
  const sambung = useRef(false)
  useEffect(() => {
    if (id || !project || sambung.current || !bolehUbah) return
    sambung.current = true
    if ((project.sub_projects || []).some((x) => ['apostille', 'legalisasi'].includes(x.type))) ambilDok()
    const f = (project.sub_projects || []).map((x) => ['apostille', 'legalisasi'].includes(x.type) && x.data?.dokumen_id).find(Boolean)
    if (!f) return
    if (!/\.(jpe?g|png|webp|pdf)$/i.test(f.name || '')) { notify('Scan ID pemohon bukan gambar/PDF — unggah KTP manual di bawah'); return }
    ;(async () => { setSibuk('ktp'); try { await tarikKtp(f.url?.startsWith('data:') ? dataUrlToBlob(f.url) : await drive.blob(f), f.name) } catch { notify('Scan ID pemohon tidak bisa dibuka otomatis — pilih dari lampiran atau unggah KTP', 'err') } finally { setSibuk('') } })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Simpan PDF surat kuasa ke File Project milik invoice-nya (PDF dibangun ulang dari isi terakhir). */
  const bolehBerkas = !!project && bolehCetak && boleh(user, 'project.lampiran_kelola')
  const simpanKeInvoice = async () => {
    if (!project) return notify('Surat ini belum terhubung ke project / nomor invoice', 'err')
    if (kurang.length) return notify(`Lengkapi dulu: ${kurang.join(', ')}`, 'err')
    const r = buatPdf(s, red)
    if (!r.muat || r.halaman !== 1) return notify('Isi melebihi satu halaman A4 — lihat peringatan di pratinjau', 'err')
    setSibuk('invoice')
    try {
      const nama = namaFile({ ...s, invoice_no: project.invoice_no })
      const subAL = (project.sub_projects || []).find((x) => ['apostille', 'legalisasi'].includes(x.type))
      const [f] = await uploadProjectFiles([{ file: new File([r.blob], nama, { type: 'application/pdf' }), name: nama, sub_id: subAL?.id || null }], { branch: project.branch, invoice: project.invoice_no, by: user.name, subs: project.sub_projects })
      const kini = (data.projects || []).find((p) => p.id === project.id) || project
      await save('projects', { id: project.id, files: [...(kini.files || []), { ...f, jenis: 'surat_kuasa', surat_kuasa_id: s.id }] })
      const saved = await save('surat_kuasa', { id: s.id, file_invoice: { name: f.name, at: new Date().toISOString(), by: user.name, versi: s.versi || 0 } })
      setS((v) => ({ ...v, file_invoice: saved?.file_invoice || { name: f.name, at: new Date().toISOString(), by: user.name, versi: v.versi || 0 } }))
      notify(`Surat Kuasa tersimpan di File Project ${invoiceLabel(project.invoice_no)}`)
    } catch (e) { notify(`Gagal menyimpan ke invoice: ${e.message}`, 'err') } finally { setSibuk('') }
  }

  const kurang = kekurangan(s)
  const nik = cekNik(s.pemberi.nik)
  const n = s.jumlah_penerima === 1 ? 1 : 2
  const setPenerima = (i, mid) => ubah((v) => { const m = master.find((x) => x.id === mid); const arr = [...(v.penerima || [])]; arr[i] = m ? { master_id: m.id, nama: m.nama, nik: m.nik, pekerjaan: m.pekerjaan, alamat: m.alamat } : { nama: '', nik: '', pekerjaan: '', alamat: '' }; return { penerima: arr } })
  const setDok = (i, k, val) => ubah((v) => ({ dokumen: v.dokumen.map((d, j) => (j === i ? { ...d, [k]: val } : d)) }))
  const geser = (i, d) => ubah((v) => { const a = [...v.dokumen]; const j = i + d; if (j < 0 || j >= a.length) return {}; [a[i], a[j]] = [a[j], a[i]]; return { dokumen: a } })
  const ambilDok = () => ubah((v) => { const baru = (project.sub_projects || []).filter((x) => ['apostille', 'legalisasi'].includes(x.type) || !(project.sub_projects || []).some((y) => ['apostille', 'legalisasi'].includes(y.type))).map((x) => ({ jenis: '', nama: x.title || SUB_TYPES[x.type]?.label || '', pemilik: '', tanggal: '', nomor: '', dari: 'pekerjaan' })); const ada = v.dokumen.filter((d) => [d.jenis, d.nama, d.pemilik, d.nomor].some((t) => String(t || '').trim())); return { dokumen: [...ada, ...baru] } })

  const simpan = async (status) => {
    if (!bolehUbah) return notify('Tidak ada izin menyimpan', 'err')
    setSibuk('simpan')
    try {
      const row = { ...s, status: status || s.status, project_id: project?.id || s.project_id || '', invoice_no: project?.invoice_no || s.invoice_no || '', branch: project?.branch || s.branch || user.branch || '', customer: project?.customer?.name || s.customer || '', redaksi: red, tpl_versi: TPL_VERSI, versi: (s.versi || 0) + 1, by: user.name, by_id: user.id }
      const saved = await save('surat_kuasa', row); kotor.current = false; setS((v) => ({ ...v, ...saved })); notify(status === 'siap_cetak' ? 'Disimpan — Siap dicetak (belum berarti sudah ditandatangani)' : 'Draf disimpan')
      if (!id && saved?.id) go(`surat-kuasa/${saved.id}`)
    } catch (e) { notify(e.message, 'err') } finally { setSibuk('') }
  }
  /** Ekspor selalu membangun ulang dari isi formulir terakhir, lalu memeriksa: satu halaman & muat. */
  const ekspor = async (cara) => {
    if (kurang.length) return notify(`Lengkapi dulu: ${kurang.join(', ')}`, 'err')
    const r = buatPdf(s, red)
    if (!r.muat || r.halaman !== 1) return notify('Isi melebihi satu halaman A4 — lihat peringatan di pratinjau', 'err')
    setSibuk(cara)
    try { if (cara === 'cetak') await printBlob(r.blob, 'pdf'); else await saveBlob(namaFile({ ...s, invoice_no: project?.invoice_no }), r.blob) } catch (e) { notify(e.message, 'err') } finally { setSibuk('') }
  }

  if (id && !lama) return <Card><Empty title="Surat kuasa tidak ditemukan" action={<Button variant="outline" onClick={() => go('surat-kuasa')}>Kembali</Button>} /></Card>
  return (
    <div className="space-y-3 max-md:pb-24" data-editor-surat-kuasa>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => go(project && !id ? `projects/${project.id}` : 'surat-kuasa')} className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-ink-mute hover:text-ink max-md:min-h-11"><ArrowLeft className="h-4 w-4" />{project && !id ? 'Project' : 'Surat Kuasa'}</button>
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-extrabold tracking-tight">{id ? 'Surat Kuasa' : 'Buat Surat Kuasa'}{project ? <span className="ml-2 text-xs font-semibold text-ink-mute">{invoiceLabel(project.invoice_no)} · {project.customer?.name}</span> : null}</h1>
        <span className={cx('rounded-full px-2.5 py-1 text-[11px] font-bold', WARNA_ST[s.status])}>{STATUS_SK[s.status]}</span>
        {boleh(user, 'surat-kuasa.atur') && <Button size="sm" variant="outline" className="max-md:min-h-11" onClick={() => setAturRed(true)}><Settings2 className="h-4 w-4" />Redaksi</Button>}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="space-y-3">
          <Bagian no="1" judul="Pemberi kuasa (dari KTP)" sisi={<span className="text-[11px] text-ink-mute">{s.ktp_mesin ? `Dibaca ${s.ktp_mesin_label || (s.ktp_mesin === 'gemini' ? 'AI Gemini' : 'Tesseract (di perangkat)')}` : 'Belum ada KTP dibaca'}</span>}>
            <div className="flex flex-wrap gap-2">
              <label className={cx('inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[#141B34] px-3 text-sm font-semibold text-white max-md:min-h-11', sibuk === 'ktp' && 'pointer-events-none opacity-60')}>{sibuk === 'ktp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{sibuk === 'ktp' ? 'Membaca KTP…' : 'Unggah KTP'}<input type="file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" className="hidden" aria-label="Unggah KTP" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) tarikKtp(f, f.name) }} /></label>
              {berkasProject.length > 0 && <Select aria-label="Pilih KTP dari lampiran pekerjaan" value="" disabled={sibuk === 'ktp'} onChange={async (e) => { const f = berkasProject.find((x) => x.key === e.target.value); if (!f) return; setSibuk('ktp'); try { await tarikKtp(f.url?.startsWith('data:') ? dataUrlToBlob(f.url) : await drive.blob(f), f.name) } catch (er) { notify(er.message, 'err'); setSibuk('') } }} className="!w-auto min-w-0 max-w-full flex-1 basis-48"><option value="">Pilih KTP dari lampiran pekerjaan…</option>{berkasProject.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}</Select>}
              {suratLain.length > 0 && <Select aria-label="Pakai identitas yang sudah diperiksa" value="" onChange={(e) => { const r = suratLain.find((x) => x.id === e.target.value); if (r) { ubah({ pemberi: { ...r.pemberi }, alamat_manual: r.alamat_manual, pemberi_diedit: Object.keys(r.pemberi), ktp_sumber: 'surat sebelumnya' }); notify('Identitas diambil dari surat sebelumnya (tanpa OCR ulang)') } }} className="!w-auto min-w-0 max-w-full flex-1 basis-48"><option value="">Pakai identitas yang sudah diperiksa…</option>{suratLain.map((r) => <option key={r.id} value={r.id}>{r.pemberi.nama}</option>)}</Select>}
            </div>
            {ktp?.catatan && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">{ktp.catatan}</p>}
            <div className={cx('grid gap-3', ktp?.gambar && 'md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]')}>
              {ktp?.gambar && <div className="md:sticky md:top-24 md:self-start"><img src={ktp.gambar} alt="KTP yang dibaca" className="w-full rounded-xl ring-1 ring-slate-200" /><p className="mt-1 text-[11px] text-ink-mute">Cocokkan setiap kolom dengan KTP. Koreksi Anda tidak ditimpa bila KTP dibaca ulang.</p></div>}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {KOLOM_KTP.map(([k, l]) => { const al = k === 'nik' && s.pemberi.nik && !nik.ok ? nik.x : ktp?.cek?.[k] && !(s.pemberi_diedit || []).includes(k) ? ktp.cek[k] : ''; return (
                  <div key={k} className={cx(['nama', 'alamat'].includes(k) && 'sm:col-span-2')}><Lbl htmlFor={`pk-${k}`}>{l}{(s.pemberi_diedit || []).includes(k) && <span className="ml-1 font-normal text-ink-mute">· dikoreksi</span>}</Lbl>
                    <Input id={`pk-${k}`} value={s.pemberi[k] || ''} inputMode={['nik', 'kodepos'].includes(k) ? 'numeric' : undefined} autoComplete="off" spellCheck={false} disabled={!bolehUbah} onChange={(e) => ubahPemberi(k, e.target.value)} className={cx('max-md:text-base', al && '!ring-amber-400')} />
                    {al ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{al}</p> : k === 'nik' && s.pemberi.nik ? <p className="mt-1 text-[11px] text-ink-mute">{nik.x}</p> : null}</div>) })}
                <div className="sm:col-span-2"><div className="flex items-center justify-between"><Lbl htmlFor="pk-as">Alamat di surat</Lbl>{s.alamat_manual && <button type="button" className="mb-1 text-[11px] font-semibold text-brand" onClick={() => ubah((v) => ({ alamat_manual: false, pemberi: { ...v.pemberi, alamat_surat: rangkaiAlamat(v.pemberi) } }))}>Rangkai ulang dari kolom</button>}</div>
                  <Textarea id="pk-as" rows={2} value={s.pemberi.alamat_surat || ''} disabled={!bolehUbah} onChange={(e) => ubahPemberi('alamat_surat', e.target.value)} className="max-md:text-base" /></div>
              </div>
            </div>
          </Bagian>

          <Bagian no="2" judul="Penerima kuasa" sisi={<Select aria-label="Jumlah penerima kuasa" value={n} onChange={(e) => ubah({ jumlah_penerima: Number(e.target.value) })} className="!h-9 !w-auto max-md:!h-11"><option value={1}>1 penerima</option><option value={2}>2 penerima</option></Select>}>
            {master.length === 0 && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-ink-mute">Master Penerima Kuasa masih kosong — isi manual di bawah, atau minta admin menambahkannya.</p>}
            {Array.from({ length: n }, (_, i) => { const p = s.penerima?.[i] || {}; const np = cekNik(p.nik); return (
              <div key={i} className="space-y-2 rounded-xl bg-slate-50/70 p-3 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center gap-2"><b className="text-xs">Penerima kuasa {n === 2 ? i + 1 : ''}</b>{master.length > 0 && <Select aria-label={`Pilih penerima kuasa ${i + 1} dari master`} value={p.master_id || ''} onChange={(e) => setPenerima(i, e.target.value)} className="!h-9 !w-auto min-w-0 max-w-full flex-1 basis-40 max-md:!h-11"><option value="">— isi manual —</option>{master.map((m) => <option key={m.id} value={m.id}>{m.nama}{m.bawaan ? ` (bawaan ${m.bawaan})` : ''}</option>)}</Select>}</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[['nama', 'Nama'], ['nik', 'NIK'], ['pekerjaan', 'Pekerjaan']].map(([k, l]) => <div key={k}><Lbl htmlFor={`pn-${i}-${k}`}>{l}</Lbl><Input id={`pn-${i}-${k}`} value={p[k] || ''} disabled={!bolehUbah} inputMode={k === 'nik' ? 'numeric' : undefined} onChange={(e) => ubah((v) => { const a = [...(v.penerima || [])]; a[i] = { ...(a[i] || {}), [k]: e.target.value }; return { penerima: a } })} className="max-md:text-base" />{k === 'nik' && p.nik && !np.ok ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{np.x}</p> : null}</div>)}
                  <div className="sm:col-span-2"><Lbl htmlFor={`pn-${i}-al`}>Alamat</Lbl><Textarea id={`pn-${i}-al`} rows={2} value={p.alamat || ''} disabled={!bolehUbah} onChange={(e) => ubah((v) => { const a = [...(v.penerima || [])]; a[i] = { ...(a[i] || {}), alamat: e.target.value }; return { penerima: a } })} className="max-md:text-base" /></div>
                </div>
              </div>) })}
          </Bagian>

          <Bagian no="3" judul="Layanan & dokumen yang dikuasakan" sisi={project && <Button size="sm" variant="outline" className="max-md:min-h-11" onClick={ambilDok}><FolderOpen className="h-4 w-4" />Ambil dari pekerjaan</Button>}>
            <div><Lbl htmlFor="sk-layanan">Jenis layanan{s.layanan_dari ? <span className="ml-1 font-normal text-ink-mute">· usulan dari pekerjaan, periksa</span> : null}</Lbl><Select id="sk-layanan" value={s.layanan} disabled={!bolehUbah} onChange={(e) => ubah({ layanan: e.target.value, layanan_dari: '' })}>{Object.entries(LAYANAN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
            <div className="space-y-2">
              {s.dokumen.map((d, i) => { const beda = d.pemilik?.trim() && s.pemberi.nama?.trim() && d.pemilik.trim().toUpperCase() !== s.pemberi.nama.trim().toUpperCase(); return (
                <div key={i} className="rounded-xl p-3 ring-1 ring-slate-200" data-baris-dokumen>
                  <div className="mb-2 flex items-center gap-1"><b className="flex-1 text-xs">Dokumen {i + 1}{d.dari ? <span className="ml-1 font-normal text-ink-mute">· dari pekerjaan, lengkapi</span> : null}</b>
                    <button type="button" aria-label="Naikkan" disabled={i === 0} onClick={() => geser(i, -1)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-30 max-md:h-11 max-md:w-11"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" aria-label="Turunkan" disabled={i === s.dokumen.length - 1} onClick={() => geser(i, 1)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-30 max-md:h-11 max-md:w-11"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" aria-label={`Hapus dokumen ${i + 1}`} onClick={() => ubah((v) => ({ dokumen: v.dokumen.filter((_, j) => j !== i) }))} className="grid h-9 w-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50 max-md:h-11 max-md:w-11"><Trash2 className="h-4 w-4" /></button></div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div><Lbl htmlFor={`d-${i}-j`}>Jenis dokumen</Lbl><Input id={`d-${i}-j`} value={d.jenis} placeholder="mis. Ijazah" onChange={(e) => setDok(i, 'jenis', e.target.value)} className="max-md:text-base" /></div>
                    <div><Lbl htmlFor={`d-${i}-n`}>Nama dokumen</Lbl><Input id={`d-${i}-n`} value={d.nama} onChange={(e) => setDok(i, 'nama', e.target.value)} className="max-md:text-base" /></div>
                    <div className="sm:col-span-2"><Lbl htmlFor={`d-${i}-p`}>Pemilik / nama yang tertera pada dokumen</Lbl><Input id={`d-${i}-p`} value={d.pemilik} onChange={(e) => setDok(i, 'pemilik', e.target.value)} className={cx('max-md:text-base', beda && '!ring-amber-400')} />{beda && <p className="mt-1 text-[11px] font-semibold text-amber-700">Berbeda dari nama pemberi kuasa — pastikan memang demikian.</p>}</div>
                    <div><Lbl htmlFor={`d-${i}-t`}>Tanggal dokumen</Lbl><Input id={`d-${i}-t`} type="date" value={d.tanggal} onChange={(e) => setDok(i, 'tanggal', e.target.value)} className="max-md:text-base" /></div>
                    <div><Lbl htmlFor={`d-${i}-no`}>Nomor dokumen</Lbl><Input id={`d-${i}-no`} value={d.nomor} autoComplete="off" spellCheck={false} onChange={(e) => setDok(i, 'nomor', e.target.value)} className="max-md:text-base" /></div>
                  </div>
                </div>) })}
              <Button variant="outline" className="w-full max-md:min-h-11" onClick={() => ubah((v) => ({ dokumen: [...v.dokumen, { jenis: '', nama: '', pemilik: '', tanggal: '', nomor: '' }] }))} data-aksi="tambah-dokumen"><Plus className="h-4 w-4" />Tambah baris dokumen</Button>
              <LebarKolom nilai={s.kolom || setelan?.kolom || KOLOM_BAWAAN} khusus={!!s.kolom} bisa={bolehUbah} onUbah={(k) => ubah({ kolom: k })}
                onBawaan={boleh(user, 'surat-kuasa.atur') ? async (k) => { try { await save('app_settings', { ...(setelan || { key: 'surat_kuasa' }), kolom: k }); ubah({ kolom: null }); notify('Ukuran kolom dijadikan bawaan semua surat') } catch (e) { notify(e.message, 'err') } } : null} />
            </div>
          </Bagian>

          <Bagian no="4" judul="Tempat, tanggal & tanda tangan">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div><Lbl htmlFor="sk-tempat">Tempat penandatanganan</Lbl><Input id="sk-tempat" value={s.tempat} placeholder="mis. Denpasar" onChange={(e) => ubah({ tempat: e.target.value })} className="max-md:text-base" /></div>
              <div><Lbl htmlFor="sk-tgl">Tanggal surat</Lbl><Input id="sk-tgl" type="date" value={s.tanggal} onChange={(e) => ubah({ tanggal: e.target.value })} className="max-md:text-base" /></div>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={!!s.meterai} onChange={(e) => ubah({ meterai: e.target.checked })} />Beri penanda tempat meterai di kolom Pemberi Kuasa</label>
          </Bagian>
        </div>

        <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-3 p-4" data-pratinjau-sk>
            <div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 flex-1 text-sm font-extrabold">Pratinjau (PDF yang sama dengan hasil cetak)</h2>
              {hasil?.muat ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" />1 halaman A4 · huruf {String(hasil.huruf).replace('.', ',')} pt</span> : hasil ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-800"><AlertTriangle className="h-3.5 w-3.5" />Melebihi 1 halaman</span> : null}</div>
            {hasil && !hasil.muat && <div className="space-y-1 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-900 ring-1 ring-rose-200" role="alert"><b>Isi melebihi satu halaman A4 (±{hasil.lebihBaris} baris) meski huruf sudah di batas terkecil yang masih terbaca. Cetak & unduh dinonaktifkan.</b>{hasil.sebab.map((x, i) => <p key={i}>• {x}</p>)}<p>Tidak ada isi yang dipotong atau dihapus otomatis.</p></div>}
            {hasil?.muat && hasil.tingkat > 0 && <p className="text-[11px] text-ink-mute">Jarak{hasil.tingkat >= 2 ? ' dan ukuran huruf' : ''} dirapatkan otomatis supaya muat satu halaman (isi {String(hasil.huruf).replace('.', ',')} pt, tabel {String(hasil.hurufTabel).replace('.', ',')} pt).</p>}
            {kurang.length > 0 && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">Belum lengkap: {kurang.join(' · ')}</p>}
            <div ref={pratinjau} className="max-h-[70vh] overflow-auto rounded-xl bg-slate-100 p-2" aria-label="Pratinjau surat kuasa" />
            <p className="text-[11px] text-ink-mute">Template {TPL_VERSI} · dokumen bersih tanpa tanda tangan/meterai. “Siap dicetak” bukan berarti sudah ditandatangani atau sah.</p>
          </Card>
          <div className="z-30 flex flex-wrap gap-2 max-md:fixed max-md:inset-x-0 max-md:bottom-[calc(64px+env(safe-area-inset-bottom))] max-md:border-t max-md:border-slate-200 max-md:bg-white max-md:px-3 max-md:py-2">
            {bolehUbah && <Button variant="outline" className="flex-1 max-md:min-h-11" loading={sibuk === 'simpan'} onClick={() => simpan()} data-aksi="sk-simpan"><Save className="h-4 w-4" />Simpan draf</Button>}
            {bolehUbah && s.status !== 'siap_cetak' && <Button variant="outline" className="flex-1 max-md:min-h-11" disabled={kurang.length > 0 || !hasil?.muat || !nik.ok} title={!nik.ok ? 'NIK pemberi kuasa belum valid' : ''} onClick={() => simpan('siap_cetak')}><CheckCircle2 className="h-4 w-4" />Sudah diperiksa</Button>}
            {bolehCetak && <Button variant="outline" className="flex-1 max-md:min-h-11" disabled={kurang.length > 0 || !hasil?.muat} loading={sibuk === 'cetak'} onClick={() => ekspor('cetak')} data-aksi="sk-cetak"><Printer className="h-4 w-4" />Cetak</Button>}
            {bolehCetak && <Button variant="dark" className="flex-1 max-md:min-h-11" disabled={kurang.length > 0 || !hasil?.muat} loading={sibuk === 'pdf'} onClick={() => ekspor('pdf')} data-aksi="sk-pdf"><Download className="h-4 w-4" />Unduh PDF</Button>}
            {bolehBerkas && <Button variant="outline" className="basis-full max-md:min-h-11" disabled={!s.id || kotor.current || kurang.length > 0 || !hasil?.muat || sibuk === 'invoice'} loading={sibuk === 'invoice'} title={!s.id || kotor.current ? 'Simpan draf dulu, lalu simpan ke invoice' : ''} onClick={simpanKeInvoice} data-aksi="sk-ke-invoice"><FolderInput className="h-4 w-4" />Simpan ke No. Invoice {invoiceLabel(project.invoice_no)}</Button>}
            {bolehBerkas && (s.file_invoice ? <p className="basis-full text-[11px] text-emerald-700" data-sk-di-invoice>✓ Tersimpan di File Project {invoiceLabel(project.invoice_no)} · {tglIndo(String(s.file_invoice.at).slice(0, 10))} oleh {s.file_invoice.by}{(s.versi || 0) > (s.file_invoice.versi || 0) ? ' — isi surat berubah sesudahnya, simpan ulang bila perlu' : ''}</p> : (!s.id || kotor.current) ? <p className="basis-full text-[11px] text-ink-mute">Simpan draf dulu, baru bisa disimpan ke invoice.</p> : null)}
          </div>
        </div>
      </div>
      {aturRed && <AturRedaksi awal={setelan} onClose={() => setAturRed(false)} />}
    </div>
  )
}

/** Ukuran (lebar) kolom tabel dokumen di PDF. Total selalu 100% — kolom lain menyesuaikan secara proporsional. */
function LebarKolom({ nilai, khusus, bisa, onUbah, onBawaan }) {
  const persen = kolomDari(nilai).map((x) => Math.round(x * 100))
  const sama = JSON.stringify(nilai) === JSON.stringify(KOLOM_BAWAAN)
  return (
    <details className="rounded-xl ring-1 ring-slate-200" data-lebar-kolom>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-xs font-semibold text-ink"><Settings2 className="h-4 w-4 text-ink-mute" aria-hidden="true" />Ukuran kolom tabel<span className="font-normal text-ink-mute">{khusus ? '· diatur khusus surat ini' : sama ? '· bawaan' : '· bawaan kantor'}</span></summary>
      <div className="space-y-1 px-3 pb-3">
        {KOLOM_NAMA.map((nm, i) => (
          <label key={nm} className="grid grid-cols-[96px_minmax(0,1fr)_40px] items-center gap-2 text-xs text-ink-soft">
            <span>{nm}</span>
            <input type="range" min={KOLOM_MIN[i]} max={i === 0 ? 12 : 50} step={1} value={Math.round(nilai[i])} disabled={!bisa} onChange={(e) => onUbah(nilai.map((x, j) => (j === i ? Number(e.target.value) : x)))} className="h-11 w-full accent-[var(--brand,#2563eb)] md:h-7" aria-label={`Lebar kolom ${nm}`} data-kolom={i} />
            <b className="text-right tabular-nums text-ink">{persen[i]}%</b>
          </label>
        ))}
        <p className="pt-1 text-[11px] text-ink-mute">Geser lalu lihat hasilnya di pratinjau. Jumlah selalu 100%, jadi melebarkan satu kolom menyempitkan kolom lain. Surat tetap dijaga satu halaman A4.</p>
        {bisa && <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" className="max-md:min-h-11" disabled={sama && !khusus} onClick={() => onUbah(khusus ? null : KOLOM_BAWAAN)} data-aksi="kolom-reset">{khusus ? 'Ikuti bawaan' : 'Kembalikan ukuran awal'}</Button>
          {onBawaan && <Button size="sm" variant="outline" className="max-md:min-h-11" onClick={() => onBawaan(nilai)} data-aksi="kolom-bawaan">Jadikan bawaan semua surat</Button>}
        </div>}
      </div>
    </details>
  )
}

function AturRedaksi({ awal, onClose }) {
  const { save, notify } = useApp()
  const [r, setR] = useState({ ...REDAKSI_BAWAAN, ...(awal?.redaksi || {}) })
  const [sibuk, setSibuk] = useState(false)
  const simpan = async () => { if (!r.tujuan.includes('{layanan}')) return notify('Paragraf tujuan harus memuat {layanan}', 'err'); setSibuk(true); try { await save('app_settings', { ...(awal || { key: 'surat_kuasa' }), redaksi: r }); notify('Redaksi template disimpan — berlaku untuk surat baru'); onClose() } catch (e) { notify(e.message, 'err') } finally { setSibuk(false) } }
  return (
    <Sheet open onClose={onClose} title="Redaksi template surat kuasa" subtitle="Berlaku untuk surat baru. Surat yang sudah disimpan memakai redaksi saat disimpan."
      footer={<><Button variant="outline" onClick={() => setR({ ...REDAKSI_BAWAAN })}>Kembalikan bawaan</Button><Button variant="outline" className="flex-1" onClick={onClose}>Batal</Button><Button variant="dark" className="flex-[2]" loading={sibuk} onClick={simpan}>Simpan</Button></>}>
      <div className="space-y-3">{[['tujuan', 'Butir 1 — tujuan. {layanan} dan {hasil} diisi otomatis sesuai pilihan layanan'], ['wewenang', 'Butir 2 — kewenangan penerima kuasa'], ['penutup', 'Kalimat penutup']].map(([k, l]) => <div key={k}><Lbl htmlFor={`rd-${k}`}>{l}</Lbl><Textarea id={`rd-${k}`} rows={k === 'wewenang' ? 5 : 2} value={r[k]} onChange={(e) => setR({ ...r, [k]: e.target.value })} className="max-md:text-base" /></div>)}</div>
    </Sheet>
  )
}
