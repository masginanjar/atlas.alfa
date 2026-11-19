import { autoDeadline } from '../lib/waktu.js'
import { prioSub, prioTertinggi } from '../config/priority.js'
import { tarikData } from '../lib/tarikData.js'
import { tarikDrive } from '../lib/tarikDrive.js'
import { useEffect, useState } from 'react'
import { Search, Plus, Check, Loader2, UserRound, Receipt, Upload, X, FileText, RefreshCw, Headset, Building2, Printer, CalendarPlus, CalendarClock, Flag, ClipboardList, Truck, Layers, CloudUpload, StickyNote, Sparkles, FolderSearch, Pencil, Copy, ChevronDown, ChevronUp, ChevronLeft } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { go } from '../lib/router.js'
import { zoho } from '../lib/integrations.js'
import { parseInvoiceItems } from '../lib/zohoParse.js'
import { usesDocs } from '../components/SubProjectEditor.jsx'
import { copyText } from '../components/CopyText.jsx'
import { BRANCHES, PRINT_VENDOR, can, branchesOf, isMultiBranch, invoiceLabel} from '../config/access.js'
import { stagesOf, deriveFlow } from '../config/workflows.js'
import { Button, Field, FieldError, Input, Select, Sheet, SectionCard, cx, Textarea } from '../components/ui.jsx'
import SubProjectEditor, { newSub, validateSub, docFileName, safeName } from '../components/SubProjectEditor.jsx'
import { SUB_TYPES, points } from '../config/subtypes.js'
import SubBaris, { subBaru, pasangKeSub, nomoriAntarSub, bagikanId } from '../components/SubBaris.jsx'
import { uploadProjectFiles } from '../components/FileManager.jsx'
import { boleh as bolehIzin } from '../lib/izin.js'
import { kb } from '../lib/format.js'
import { PrioritySelect, PRIORITY_META } from '../components/Priority.jsx'
const LANGS_MIN = ['Indonesia', 'Inggris', 'Mandarin', 'Jepang', 'Korea', 'Arab', 'Belanda', 'Jerman', 'Prancis', 'Spanyol', 'Rusia', 'Lainnya']
import CustomerInfo from '../components/CustomerInfo.jsx'
import { DELIVERY_LABEL } from '../components/Delivery.jsx'
import { rupiah, tgl } from '../lib/format.js'


export { autoDeadline }

/**
 * Form project.
 *  • preset  : isian awal dari luar (mis. dibuka dari menu Faktur) — { customer, invoice_no, zoho_invoice_id }
 *  • side    : tampilkan sebagai panel geser dari samping, bukan dialog tengah
 *  • onSaved : dipanggil setelah tersimpan; bila ada, halaman tidak otomatis pindah ke detail project
 */
/**
 * Nomor invoice ditampilkan tanpa awalan "INV-", jadi CS bisa saja
 * mengetik atau menempel angkanya saja. Yang disimpan harus tetap
 * lengkap, kalau tidak kode cabang di menu Faktur tidak terbaca.
 */
const normInvoice = (v) => {
  const t = String(v ?? '').trim().toUpperCase()
  return /^\d+$/.test(t) ? `INV-${t}` : t
}

export default function ProjectForm({ onClose, project, preset, side, page, onSaved, minimal }) {
  const { user, data, save, notify } = useApp()
  const editing = !!project
  const [customer, setCustomer] = useState(project?.customer ?? preset?.customer ?? null)
  const [invoice, setInvoice] = useState(project?.invoice_no ?? preset?.invoice_no ?? '')
  const [branch, setBranch] = useState(project?.branch ?? user.branch)
  const [about, setAbout] = useState(() => {
    const today = new Date().toISOString().slice(0, 10)
    return { print_location: user.branch, priority: 'Normal', received_at: today, deadline: project?.about?.deadline || autoDeadline(today, 'Normal'), cs_name: user.name, ...(project?.about ?? {}) }
  })
  // sub project lama: tandai dokumen yang sudah punya file sumber agar tidak diminta upload ulang
  const [subs, setSubs] = useState(() => project?.sub_projects
    ? project.sub_projects.map((sp) => {
      if (!usesDocs(sp.type) || !Array.isArray(sp.docs)) return sp
      const list = sp.data?.dokumen_sumber_list || (sp.data?.dokumen_sumber ? [sp.data.dokumen_sumber] : [])
      return { ...sp, docs: sp.docs.map((d, i) => ({ ...d, existing: list[i]?.name || list[0]?.name || (sp.stage !== 'cs_input' ? 'sudah berjalan' : '') })) }
    })
    : [page ? subBaru('terjemahan', data) : newSub('terjemahan')])
  const [busy, setBusy] = useState(false)
  const [queue, setQueue] = useState([]) // file yang akan diunggah: {_k, file, name, sub_ref}
  const [progress, setProgress] = useState('')
  /** Pasang pelanggan pemilik invoice (dari nomor invoice yang diketik) — nomor invoicenya tidak diubah. */
  const pakaiPemilik = async (r) => { try { const c = await zoho.contact(r.customer_id); if (c) setCustomer(c) } catch { /* biarkan CS memilih pelanggan sendiri */ } }
  // Tarik Data (beta): usulan sub project dari item invoice — { sibuk } | { ok, n, mesin, dilewati, sebelum } | { galat }
  const [tarikSt, setTarikSt] = useState(null)
  const subTerisi = (x) => !!x.id || points(x.description).length > 0 || (x.docs || []).some((d) => d.file || String(d.desc || '').trim()) || !!x.applicant_file
  const jalankanTarik = async () => {
    if (!invoiceItems?.items?.length || tarikSt?.sibuk) return
    setTarikSt({ sibuk: true })
    const r = await tarikData(invoiceItems.items, { buatSub: (t) => (page ? subBaru(t, data) : newSub(t)), lembaga: data.people.filter((p) => p.type === 'lembaga' && (p.branch === branch || p.branch === 'Semua')) })
      .catch(() => ({ ok: false, alasan: 'Tarik Data gagal — isi sub project manual' }))
    if (!r.ok) return setTarikSt({ galat: r.alasan })
    const sebelum = subs
    setSubs([...subs.filter(subTerisi), ...r.subs]) // sub yang sudah diisi manual dipertahankan; baris kosong diganti usulan
    // Data pengiriman (item Delivery Fee: kurir, penerima, HP, alamat) ikut ditarik. Dibaca DI PERANGKAT INI — tidak dikirim ke AI.
    const k = applyInvoice({ invoice_no: invoiceItems.invoice_no, items: invoiceItems.items }, { force: true }) || {}
    const kirim = [k.alamat && (customer ? 'alamat & penerima' : 'alamat ada di invoice — pilih pelanggan dulu supaya terpasang'), k.kurir && `kurir ${k.kurir}`, k.kantor && `via kantor ${k.kantor}`].filter(Boolean).join(' · ')
    setTarikSt({ ok: true, n: r.subs.length, mesin: r.mesin, dilewati: r.dilewati || [], sebelum, kirim })
  }
  const urungTarik = () => { if (tarikSt?.sebelum) setSubs(tarikSt.sebelum); setTarikSt(null) }
  const propTarik = !editing && bolehIzin(user, 'tarik-data.tambah') ? { onTarik: jalankanTarik, onUrung: urungTarik, tarik: tarikSt } : {}
  // Tarik dari Drive (masa transisi): usulan sub project dari NAMA FILE di folder Drive lama — terpisah dari Tarik Data (beta)
  const [driveSt, setDriveSt] = useState(null)
  const jalankanDrive = async () => {
    if (driveSt?.sibuk) return
    setDriveSt({ sibuk: true })
    const r = await tarikDrive(invoiceItems?.invoice_no || invoice, { buatSub: (t) => (page ? subBaru(t, data) : newSub(t)) }).catch(() => ({ ok: false, alasan: 'Tarik dari Drive gagal' }))
    if (!r.ok) return setDriveSt({ galat: r.alasan })
    const sebelum = subs
    setSubs([...subs.filter(subTerisi), ...r.subs]) // sub yang sudah terisi dipertahankan; baris kosong diganti usulan
    setDriveSt({ ok: true, n: r.subs.length, dok: r.subs.reduce((n, x) => n + (x.file_count || 0), 0), folder: r.folder, mesin: r.mesin, sebelum })
  }
  const urungDrive = () => { if (driveSt?.sebelum) setSubs(driveSt.sebelum); setDriveSt(null) }
  const propDrive = !editing && bolehIzin(user, 'tarik-drive.tambah') ? { onDrive: jalankanDrive, onUrungDrive: urungDrive, drive: driveSt } : {}
  const [autoFill, setAutoFill] = useState(null) // ringkasan isian otomatis dari item invoice Zoho (alamat/kurir/prioritas)
  const [invoiceItems, setInvoiceItems] = useState(null) // item invoice Zoho — hanya ditampilkan (view) untuk dibaca/disalin saat mengisi sub project
  const [editShip, setEditShip] = useState(false)
  const [seretBawah, setSeretBawah] = useState(false)
  const [lengkap, setLengkap] = useState(() => new Set()) // versi minimalis: sub yang dibuka isian lengkapnya
  // Simpan draf (F7): isian project baru disimpan di perangkat ini supaya tidak hilang saat pindah halaman.
  // File (dokumen) tidak bisa disimpan sebagai draf — hanya teks & pilihannya.
  const DRAF_KEY = `atlas-draf-project:${user.id}`
  const [drafTersedia, setDrafTersedia] = useState(() => { if (editing || preset) return null; try { const v = JSON.parse(localStorage.getItem(DRAF_KEY) || 'null'); return v && v.at ? v : null } catch { return null } })
  useEffect(() => {
    if (editing || drafTersedia) return
    const t = setTimeout(() => {
      const kosong = !customer && !invoice && !(about.notes || '').trim() && subs.every((x) => !(x.description || x.title || x.docs?.some((d) => d.desc?.trim())))
      try {
        if (kosong) localStorage.removeItem(DRAF_KEY)
        else localStorage.setItem(DRAF_KEY, JSON.stringify({ at: new Date().toISOString(), customer, invoice, branch, about, subs: subs.map(({ applicant_file, ...x }) => ({ ...x, docs: x.docs?.map(({ file, ...d }) => d) })) }))
      } catch { /* abaikan */ }
    }, 600)
    return () => clearTimeout(t)
  }, [customer, invoice, branch, about, subs, editing, drafTersedia]) // eslint-disable-line react-hooks/exhaustive-deps
  // Halaman penuh Project Baru: nama file apostille / legalisasi dinomori berurutan antar sub project.
  useEffect(() => { if (!page || editing) return; const rapi = bagikanId(nomoriAntarSub(subs)); if (rapi !== subs) setSubs(rapi) }, [subs, page, editing])
  const pakaiDraf = () => { const v = drafTersedia; setCustomer(v.customer || null); setInvoice(v.invoice || ''); if (v.branch) setBranch(v.branch); if (v.about) setAbout((a) => ({ ...a, ...v.about })); if (v.subs?.length) setSubs(v.subs); setDrafTersedia(null) }
  const buangDraf = () => { try { localStorage.removeItem(DRAF_KEY) } catch { /* abaikan */ } setDrafTersedia(null) }

  /**
   * Dari item invoice Zoho: alamat kirim, kurir & prioritas diisi otomatis (tetap bisa diedit).
   * Sub project TIDAK lagi dibuat otomatis (sering salah/tidak tertarik) — item invoice ditampilkan apa adanya
   * di seksi Sub Project supaya mudah dibaca & disalin, lalu diinput manual.
   */
  const applyInvoice = (detail, { force = false } = {}) => {
    const p = parseInvoiceItems(detail.items)
    const inv = detail.invoice_no
    setInvoiceItems({ invoice_no: inv, items: detail.items || [] })
    // alamat pengiriman dari item "Delivery Fee" → hanya mengisi kolom yang masih kosong di data Zoho
    let shipFilled = false
    setCustomer((c) => {
      if (!c) return c
      const cur = c.ship || {}
      const next = { ...cur }
      // alamat di item invoice = alamat untuk order ini → menggantikan alamat umum di data Zoho (kolom yang tak ada di invoice dipertahankan)
      if (p.ship && p.hasAddress) {
        for (const k of ['attention', 'street1', 'street2', 'city', 'state', 'zip', 'phone']) if (p.ship[k]) { next[k] = p.ship[k]; shipFilled = true }
        if (shipFilled && p.ship.street1 && !p.ship.city) { next.city = ''; next.state = next.state && cur.street1 !== next.street1 ? '' : next.state }
      }
      const phone = c.phone || detail.contact?.mobile || p.ship?.phone || ''
      const email = c.email || p.email || detail.contact?.email || ''
      return { ...c, ship: next, phone, email, ...(shipFilled ? { ship_source: 'invoice' } : {}) }
    })
    // kurir & prioritas
    const courierRow = p.courier ? (data.couriers || []).find((k) => k.name.toLowerCase() === p.courier.toLowerCase()) || (data.couriers || []).find((k) => k.name.toLowerCase().includes(p.courier.toLowerCase().split(' ')[0])) : null
    setAbout((a) => {
      const next = { ...a }
      if (courierRow && (force || !a.courier)) { next.courier = courierRow.id; next.metode_kirim = courierRow.type }
      if (p.priority && (force || a.priority === 'Normal')) { next.priority = p.priority; const auto = autoDeadline(a.received_at, p.priority); if (auto && (!a.deadline || a.deadline === autoDeadline(a.received_at, a.priority))) next.deadline = auto }
      const extra = [...p.others.map((o) => [o.name, o.description.replace(/\s+/g, ' ').trim()].filter(Boolean).join(': ')), ...(p.office ? [`Ambil/kirim via kantor ${p.office}`] : [])].filter(Boolean)
      if (extra.length && !String(a.notes || '').includes('Dari invoice')) next.notes = [a.notes, `Dari invoice: ${extra.join(' · ')}`].filter(Boolean).join('\n')
      return next
    })
    setAutoFill({ invoice_no: inv, ship: !!(p.ship && p.hasAddress), courier: courierRow?.name || '', priority: p.priority, others: p.others.length })
    return { alamat: !!(p.ship && p.hasAddress), kurir: courierRow?.name || '', kantor: p.office || '' }
  }
  // Pelanggan baru terpasang SETELAH invoice dibaca (mis. invoice diketik dulu, pelanggan terisi dari pemilik invoice)
  // → data pengiriman dari item invoice dipasang ke pelanggan itu. Tanpa ini alamat kirim dari invoice terlewat.
  useEffect(() => {
    if (editing || !customer?.zoho_id || !invoiceItems?.items?.length || customer.ship_source === 'invoice') return
    applyInvoice({ invoice_no: invoiceItems.invoice_no, items: invoiceItems.items })
  }, [customer?.zoho_id, invoiceItems?.invoice_no]) // eslint-disable-line react-hooks/exhaustive-deps
  // Begitu invoice dipilih/diketik → baca item invoice dari salinan Zoho (debounce)
  useEffect(() => {
    if (editing) return
    const no = normInvoice(invoice)
    if (!/^INV-\d{4,}$/i.test(no) || autoFill?.invoice_no === no) return
    let dead = false
    const t = setTimeout(() => zoho.invoiceDetail(no).then((d) => { if (dead) return; if (d) applyInvoice(d); else setInvoiceItems({ invoice_no: no, items: [] }) }).catch(() => {}), 350)
    return () => { dead = true; clearTimeout(t) }
  }, [invoice]) // eslint-disable-line react-hooks/exhaustive-deps
  // Sub project yang alurnya sudah berjalan: jenis & pelaksana dikunci
  const vendorOf = (s) => (s.translator_kind === 'vendor' ? data.people.find((p) => p.id === s.translator) : null)
  // s._ulang = kunci dibuka dari editor (ganti bahasa/penerjemah/vendor) → diperlakukan seperti belum berjalan: alur & tahap dihitung ulang saat disimpan.
  const isStarted = (s) => !s._ulang && !!s.id && s.stage !== stagesOf(s.flow || project?.category || deriveFlow(s, vendorOf(s)))[0].key

  // Prioritas per sub project (19 Nov 2026). Pilihan di bagian Project = berlaku untuk SEMUA sub;
  // tiap sub boleh diubah sendiri, dan prioritas project otomatis mengikuti yang tertinggi.
  const pilihPrio = (v) => { setA('priority')({ target: { value: v } }); setSubs((arr) => arr.map((x) => (x.priority ? { ...x, priority: v } : x))) }
  useEffect(() => {
    if (!subs.some((x) => x.priority)) return
    if (subs.some((x) => !x.priority)) { setSubs((arr) => arr.map((x) => (x.priority ? x : { ...x, priority: about.priority || 'Normal' }))); return }
    const maks = prioTertinggi(subs.map((x) => x.priority))
    if (maks !== (about.priority || 'Normal')) setA('priority')({ target: { value: maks } })
  }, [subs, about.priority]) // eslint-disable-line react-hooks/exhaustive-deps
  const setA = (k) => (e) => setAbout((a) => {
    const next = { ...a, [k]: e.target.value }
    // Deadline otomatis mengikuti prioritas (tetap bisa diubah): Sameday = hari masuk, Super Ekspres +1, Ekspres +2, Normal +3 hari kerja
    if (k === 'priority' || k === 'received_at') { const auto = autoDeadline(next.received_at, next.priority); if (auto && (!a.deadline || a.deadline === autoDeadline(a.received_at, a.priority))) next.deadline = auto }
    return next
  })

  const [tried, setTried] = useState(false)
  // (Dulu: apostille / legalisasi 1 sub = 1 dokumen. Sejak 19 Nov 2026 tidak dibatasi → fungsi ini hanya terpakai bila suatu jenis diberi batas lagi di MAKS_DOK.)
  // File ke-2 dst. yang ditarik sekaligus otomatis jadi sub project baru
  // dengan jenis, negara/lembaga, objek & eksekutor yang sama — ID pemohon tetap diisi per dokumen.
  const pecahJadiSub = (i) => (files) => {
    setSubs((arr) => {
      const asal = arr[i]; if (!asal) return arr
      const baru = [...files].map((f) => {
        const desc = f.name.replace(/\.[^.]+$/, '')
        return { ...(page ? subBaru(asal.type, data, asal) : newSub(asal.type)), country: asal.country, institution: asal.institution, objek: asal.objek, executor_kind: asal.executor_kind, executor_id: asal.executor_id,
          docs: [{ desc, pages: 1, file: f, file_name: `${safeName(desc) || 'dokumen'}${(f.name.match(/\.[^.]+$/) || [''])[0]}`, name_edited: false }], description: `1. ${desc}`, file_count: 1, pages: 1 }
      })
      return [...arr.slice(0, i + 1), ...baru, ...arr.slice(i + 1)]
    })
    notify(`${files.length} file berikutnya dijadikan ${files.length} sub project baru — lengkapi ID pemohon tiap dokumen`)
  }
  // Metode pengiriman dipilih di awal (project baru wajib). Softcopy / ambil di kantor / dari penerjemah langsung
  // tersimpan sebagai "kurir" jenis itu; "Dikirim Kurir" → ekspedisi & resinya tetap dipilih nanti di tahap Siap Kirim.
  const metodeKirim = about.metode_kirim || (data.couriers || []).find((k) => k.id === about.courier)?.type || ''
  const pilihMetode = (t) => setAbout((a) => {
    const kini = (data.couriers || []).find((k) => k.id === a.courier)
    const baris = t === 'courier' ? (kini?.type === 'courier' ? kini : null) : (data.couriers || []).find((k) => k.type === t)
    return { ...a, metode_kirim: t, courier: baris?.id || '' }
  })
  const perluAlamat = metodeKirim !== 'pickup' && metodeKirim !== 'softcopy'
  // Validasi per field — ditampilkan di bawah field setelah tombol simpan ditekan
  const inv0 = normInvoice(invoice)
  const errs = {
    customer: !customer && 'Pilih pelanggan dari Zoho',
    invoice: !inv0 ? 'Isi nomor invoice' : data.projects.some((p) => p.invoice_no === inv0 && p.id !== project?.id) ? `Project ${inv0} sudah ada` : (data.projects_arsip || []).some((p) => p.invoice_no === inv0) && `Project ${inv0} ada di Arsip / Sampah — pulihkan atau hapus paksa dulu`,
    deadline: !about.deadline ? 'Isi deadline' : about.received_at && about.deadline.slice(0, 10) < about.received_at.slice(0, 10) && 'Deadline tidak boleh sebelum tanggal masuk',
    metode: !editing && !metodeKirim && 'Pilih metode pengiriman',
    subs: subs.map((x, i) => validateSub(x, i)),
  }
  const E = (k) => (tried ? errs[k] || null : null)

  const submit = async () => {
    setTried(true)
    const inv = normInvoice(invoice)
    if (!customer) return notify('Pilih pelanggan dari Zoho', 'err')
    if (!inv) return notify('Isi nomor invoice', 'err')
    if (subs.some((x) => x._ulang && !String(x._ulang_alasan || '').trim())) return notify('Isi alasan ganti penerjemah / vendor', 'err')
    if (errs.metode) return notify(errs.metode, 'err')
    if (!about.deadline) return notify('Isi deadline', 'err')
    if (about.received_at && about.deadline.slice(0, 10) < about.received_at.slice(0, 10)) return notify('Deadline tidak boleh sebelum tanggal masuk', 'err')
    if (data.projects.some((p) => p.invoice_no === inv && p.id !== project?.id)) return notify(`Project ${inv} sudah ada`, 'err')
    if (errs.invoice) return notify(errs.invoice, 'err')
    if (!subs.length) return notify('Tambahkan minimal 1 sub project', 'err')
    for (let i = 0; i < subs.length; i++) { const err = validateSub(subs[i], i); if (err) return notify(err, 'err') }
    setBusy(true)
    try {
      const now = new Date().toISOString()
      const sub_projects = subs.map(({ _k, ...s }) => {
        const pts = points(s.description || s.title)
        // Judul otomatis = poin pertama deskripsi (+ jumlah poin lain)
        const title = `${(SUB_TYPES[s.type] ?? SUB_TYPES.jasa_lain).label}: ${pts[0]}${pts.length > 1 ? ` +${pts.length - 1}` : ''}`
        // Pilihan di form diteruskan ke tahap alur kerja (penerjemah / vendor)
        const data = { ...(s.data || {}) }
        if (s.translator && s.translator_kind !== 'vendor' && !data.translator) data.translator = s.translator
        const vendorId = s.translator_kind === 'vendor' ? s.translator : s.executor_kind === 'vendor' ? s.executor_id : ''
        if (vendorId && !data.vendor) data.vendor = vendorId
        if (s.executor_kind === 'staff' && s.executor_id) data.staff_apostille = s.executor_id
        // Alur ditentukan dari jenis + pelaksana; dihitung ulang selama belum berjalan
        const flow = isStarted(s) ? (s.flow || project?.category || deriveFlow(s, vendorOf(s))) : deriveFlow(s, vendorOf(s))
        const first = stagesOf(flow)[0].key
        const docs = usesDocs(s.type) && s.docs ? s.docs.filter((d) => d.desc.trim()).map(({ file, file_name, name_edited, existing, ...d }) => d) : undefined
        const { applicant_file, _ulang, _ulang_alasan, _id_ikut, _id_lepas, _tarik, ...rest } = s // file ID pemohon diunggah terpisah (lihat idUploads)
        const base = { ...rest, title, file_count: pts.length, data, flow, docs, priority: prioSub({ about }, s) } // prioritas per sub; kosong = ikut pilihan project
        if (s.id && _ulang) {
          // Penugasan diulang: data pelaksana & pengajuan lama dibuang, tahap kembali ke awal alur yang baru, alasan masuk riwayat.
          const bersih = { ...data, translator: s.translator && s.translator_kind !== 'vendor' ? s.translator : '', vendor: vendorId || '', coordinator: '',
            vendor_service: '', vendor_cost: 0, total_pengajuan: 0, ongkir_cost: 0, ongkir_to: '', sumber_dana: '', rekening: '', vendor_note: '', submitted_by: '', submitted_name: '', submitted_at: '', ordered_by: '', ordered_name: '', ordered_at: '', penerjemahan_work_started_at: '' }
          return { ...base, data: bersih, stage: first, stage_at: now,
            history: [...(s.history || []), { at: now, by: user.name, role: user.role, action: `Penugasan diulang (ganti bahasa / penerjemah / vendor) → ${stagesOf(flow)[0].label} · alasan: ${String(_ulang_alasan || '').trim()}`, reason: String(_ulang_alasan || '').trim() }] }
        }
        return s.id ? { ...base, ...(isStarted(s) ? {} : { stage: first }) }
          : { ...base, id: crypto.randomUUID?.() ?? String(Math.random()), stage: first, history: [{ at: now, by: user.name, action: 'Dibuat' }] }
      })
      // Apostille atas hasil terjemahan: catat sub terjemahan yang ditunggu (id final) — filenya diteruskan otomatis saat hasil scan terjemahan diunggah.
      subs.forEach((x, i) => {
        if (x.type !== 'apostille' || x.objek !== 'terjemahan' || !x.sumber_sub) return
        const [refSub, noDok] = String(x.sumber_sub).split('#')
        const j = subs.findIndex((y) => String(y.id ?? y._k) === refSub)
        if (j >= 0) sub_projects[i] = { ...sub_projects[i], sumber_sub: `${sub_projects[j].id}#${noDok || 0}`, data: { ...sub_projects[i].data, menunggu_sub: sub_projects[j].id, menunggu_dok: Number(noDok) || 0 } }
      })
      const row = {
        ...(project ?? {}), invoice_no: inv, branch, customer, sub_projects,
        about: { ...about, priority: prioTertinggi(sub_projects.map((x) => x.priority)), deadline: about.deadline ? new Date(about.deadline).toISOString() : null, received_at: about.received_at?.slice(0, 10) || null },
        ...(editing ? {} : { created_by: user.id }),
        // penghubung ke invoice Zoho (dipakai menu Faktur & badge pembayaran)
        ...(project?.zoho_invoice_id || preset?.zoho_invoice_id ? { zoho_invoice_id: project?.zoho_invoice_id || preset.zoho_invoice_id } : {}),
      }
      // File per dokumen terjemahan → diunggah, masuk File Project & menjadi Dokumen Sumber tahap CS Input
      const docUploads = subs.flatMap((s, si) => (usesDocs(s.type) && s.docs ? s.docs : []).filter((d) => d.desc.trim() && d.file)
        .map((d) => ({ file: d.file, name: docFileName(d), sub_id: sub_projects[si].id, si })))
      if (docUploads.length) {
        const added = await uploadProjectFiles(docUploads, { branch, invoice: inv, by: user.name, subs: sub_projects }, (i, n) => setProgress(`Mengunggah dokumen ${i}/${n}…`))
        added.forEach((f, k) => {
          const sp = sub_projects[docUploads[k].si]; const list = [...(sp.data.dokumen_sumber_list || (sp.data.dokumen_sumber ? [sp.data.dokumen_sumber] : [])), f]
          sp.data = { ...sp.data, dokumen_sumber: sp.data.dokumen_sumber || f, dokumen_sumber_list: list }
        })
        row.files = [...(project?.files || []), ...added]
      }
      // Scan ID / dokumen pemohon (apostille & legalisasi) → File Project + data.dokumen_id
      // File ID yang sama dipakai beberapa sub (satu pemohon) → diunggah sekali saja, lalu disambungkan ke tiap sub.
      const idSemua = subs.flatMap((s, si) => (s.applicant_file ? [{ file: s.applicant_file, name: `ID Pemohon - ${safeName(s.applicant_file.name)}`, sub_id: sub_projects[si].id, si }] : []))
      const idUploads = idSemua.filter((x, k) => idSemua.findIndex((y) => y.file === x.file) === k)
      if (idUploads.length) {
        const added = await uploadProjectFiles(idUploads, { branch, invoice: inv, by: user.name, subs: sub_projects }, (i, n) => setProgress(`Mengunggah ID pemohon ${i}/${n}…`))
        idSemua.forEach((x) => { const f = added[idUploads.findIndex((y) => y.file === x.file)]; const sp = sub_projects[x.si]; if (f) sp.data = { ...sp.data, dokumen_id: f } })
        row.files = [...(row.files || project?.files || []), ...added]
      }
      if (queue.length) {
        const refToId = (ref) => { const i = subs.findIndex((x) => String(x.id ?? x._k) === String(ref)); return i < 0 ? null : sub_projects[i].id }
        const added = await uploadProjectFiles(queue.map((q) => ({ file: q.file, name: q.name.trim() || q.file.name, sub_id: refToId(q.sub_ref) })),
          { branch, invoice: inv, by: user.name, subs: sub_projects }, (i, n) => setProgress(`Mengunggah file ${i}/${n}…`))
        row.files = [...(row.files || project?.files || []), ...added]
      }
      // Dokumen sudah diunggah saat project dibuat → tahap "CS Input/Upload" dianggap selesai:
      //  • terjemahan tanpa penerjemah  → Pilih Penerjemah (Direktur)
      //  • terjemahan + penerjemah dipilih langsung → langsung Penerjemahan (lewati Direktur), penerjemah diberi tahu
      //  • apostille/legalisasi → antrean staf
      const autoNotes = []
      if (!editing) for (const sp of sub_projects) {
        const st = stagesOf(sp.flow); const first = st[0]; const second = st[1]
        if (!second || !sp.data?.dokumen_sumber) continue
        const toSpv = sp.flow === 'tr_int' && first.key === 'cs_input' && !sp.data.translator
        const toTr = sp.flow === 'tr_int' && first.key === 'cs_input' && !!sp.data.translator && st.some((x) => x.key === 'penerjemahan')
        const toStaf = first.key === 'cs_upload'
        if (!toSpv && !toTr && !toStaf) continue
        const target = toTr ? st.find((x) => x.key === 'penerjemahan') : second
        sp.stage = target.key; sp.stage_at = now
        sp.history = [...(sp.history || []), { at: now, by: user.name, action: `${first.label} → ${target.label} · otomatis (dokumen sudah diunggah saat project dibuat${toTr ? ', penerjemah dipilih langsung oleh CS' : ''})` }]
        if (toStaf && first.notify) autoNotes.push(...first.notify(row, sp, user).map((n) => ({ ...n, text: `${inv} · ${sp.title}: ${n.text}` })))
        if (toTr) autoNotes.push({ to_user: sp.data.translator, kind: 'task', text: `${inv} · ${sp.title}: Tugas terjemahan baru untuk Anda` })
      }
      const saved = await save('projects', row)
      for (const n of autoNotes) await save('notifications', { ...n, project_id: saved.id, by: user.name, read_by: [] }).catch(() => {})
      // Terjemahan yang belum punya penerjemah/vendor → otomatis minta Direktur (tembusan Direktur & Superadmin) membagi penerjemah
      if (!editing) {
        const need = sub_projects.filter((s) => s.type === 'terjemahan' && !s.data?.translator && !s.data?.vendor && !s.translator)
        for (const s of need) {
          const text = `${inv} · ${s.title}: Perlu penerjemah — ${s.lang_from || '?'} → ${s.lang_to || '?'}, ${s.pages || s.file_count || 0} hlm, ${(about.priority || 'Normal')}${about.deadline ? `, deadline ${new Date(about.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}` : ''}`
          for (const role of ['supervisor', 'direktur', 'superadmin']) await save('notifications', { to_role: role, kind: 'need_translator', text, project_id: saved.id, sub_id: s.id, by: user.name, read_by: [] }).catch(() => {})
        }
      }
      if (!editing) { try { localStorage.removeItem(DRAF_KEY) } catch { /* abaikan */ } }
      notify(editing ? 'Project diperbarui' : `Project ${inv} dibuat`)
      // Apostille/Legalisasi dengan scan ID pemohon baru → langsung sambung ke pembuatan Surat Kuasa (KTP & nomor ID terbawa).
      const keSK = idUploads.length > 0 && bolehIzin(user, 'surat-kuasa.tambah') && !(data.surat_kuasa || []).some((r) => r.project_id === saved.id)
      if (onSaved) onSaved(saved); onClose()
      if (keSK) { notify('Lanjut ke Surat Kuasa — scan ID & nomor ID dari form sudah disambungkan'); go(`surat-kuasa/new/${saved.id}`) }
      else if (!onSaved && !editing) go(`projects/${saved.id}`)
    } catch (e) { notify(e.message, 'err') } finally { setBusy(false); setProgress('') }
  }

  const judul = editing ? `Edit ${invoiceLabel(project.invoice_no)}` : 'Project Baru'
  const kaki = (
    <>
      <Button variant="outline" className="flex-1 sm:flex-none sm:px-6" onClick={onClose}>Batal</Button>
      <Button className="flex-1" loading={busy} onClick={submit}>{progress || (editing ? 'Simpan Perubahan' : 'Buat Project')}</Button>
    </>
  )
  // Ringkasan kekurangan — tampil di atas tombol begitu tombol ditekan (bukan hanya toast)
  const kurang = tried ? [errs.customer, errs.invoice, errs.metode, errs.deadline, !subs.length && 'Tambahkan minimal 1 sub project', ...errs.subs].filter(Boolean) : []
  const langkah1Ok = !!customer && !!inv0 && !errs.invoice && !errs.metode
  const langkah2Ok = !!about.deadline && !errs.deadline
  const printBeda = about.print_location !== branch
  const [ubahPrint, setUbahPrint] = useState(printBeda)
  const LangkahChip = ({ n, label, ok, count }) => (
    <span className={cx('flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold ring-1', ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-white text-ink-soft ring-slate-200')} data-langkah={n} data-ok={ok ? '1' : '0'}>
      <span className={cx('grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold', ok ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-ink-soft')}>{ok ? <Check className="h-3 w-3" /> : n}</span>{label}{count !== undefined && <span className="text-ink-mute">({count})</span>}
    </span>
  )
  const isi = (
      <div className="space-y-5">
        {drafTersedia && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 px-3.5 py-2.5 text-xs text-sky-900 ring-1 ring-sky-200" data-draf>
            <span className="min-w-0 flex-1">Ada <b>draf project</b> yang belum selesai ({tgl(drafTersedia.at)}{drafTersedia.invoice ? ` · ${invoiceLabel(drafTersedia.invoice)}` : ''}). File dokumen perlu dipilih ulang.</span>
            <Button size="sm" onClick={pakaiDraf}>Lanjutkan draf</Button><Button size="sm" variant="outline" onClick={buangDraf}>Buang</Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5" data-langkah-bar>
          <LangkahChip n={1} label="Pelanggan & invoice" ok={langkah1Ok} />
          <LangkahChip n={2} label="Project" ok={langkah2Ok} />
          <LangkahChip n={3} label="Sub project" ok={subs.length > 0 && subs.every((x, i) => !validateSub(x, i))} count={subs.length} />
        </div>

        {/* ===== 1 · Pelanggan & invoice ===== */}
        <SectionCard tone="sky" icon={UserRound} title="1 · Pelanggan & invoice" aside="Zoho Books">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <CustomerPicker value={customer} invalid={!!E('customer')} onChange={(c, inv) => { setCustomer(c); if (!editing) setInvoice(inv || '') }} />
                {E('customer') && <FieldError>{E('customer')}</FieldError>}
              </div>
              {preset?.invoice_no && !editing
                ? (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-ink-mute">No. Invoice</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-bold">{invoice}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-ink-soft ring-1 ring-slate-200">dari menu Faktur</span></p>
                    {E('invoice') && <FieldError>{E('invoice')}</FieldError>}
                  </div>
                )
                : <InvoicePicker customer={customer} value={invoice} onChange={setInvoice} error={E('invoice')} onPemilik={pakaiPemilik} />}
            </div>
            <div>
              <MetodeKirim value={metodeKirim} onPilih={pilihMetode} error={E('metode')} kantor={about.print_location} />
              <p className="mb-1.5 mt-3 text-[11px] font-bold uppercase tracking-wide text-ink-mute">Alamat pengiriman</p>
              {!perluAlamat
                ? <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-4 text-center text-xs text-ink-mute" data-tanpa-alamat>{metodeKirim === 'pickup' ? `Diambil di Kantor ${about.print_location || ''} — alamat kirim tidak diperlukan.` : 'Softcopy saja — tidak ada pengiriman fisik, alamat tidak diperlukan.'}</p>
                : customer
                ? (
                  <div className="space-y-2 rounded-xl bg-white/70 p-3 ring-1 ring-slate-200">
                    {editShip
                      ? <ShipEditor ship={customer.ship || {}} onChange={(ship) => setCustomer((c) => ({ ...c, ship }))} onDone={() => setEditShip(false)} />
                      : <CustomerInfo c={customer} part="shipping" />}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {customer.ship_source === 'invoice' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800"><Sparkles className="h-3 w-3" />Alamat dibaca dari item invoice — periksa</span>}
                      {!editShip && <button type="button" onClick={() => setEditShip(true)} className="inline-flex items-center gap-1 font-semibold text-orange-700 hover:underline"><Pencil className="h-3 w-3" />Edit alamat</button>}
                    </div>
                  </div>
                )
                : <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-5 text-center text-xs text-ink-mute">Alamat tampil otomatis setelah pelanggan dipilih.</p>}
              {metodeKirim === 'courier' && <p className="mt-1.5 text-[11px] text-ink-mute">Kurir & nomor resi dipilih nanti di tahap <b>Siap Kirim</b> (detail project → Pengiriman & kurir).</p>}
            </div>
          </div>
        </SectionCard>

        {/* ===== 2 · Project ===== */}
        <SectionCard tone="lavender" icon={ClipboardList} title="2 · Project" aside={`CS ${about.cs_name || user.name}`}>
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Cabang" icon={Building2}>
              {can.seeAllBranches(user) || isMultiBranch(user)
                ? <Select value={branch} onChange={(e) => { setBranch(e.target.value); if (!ubahPrint) setAbout((a) => ({ ...a, print_location: e.target.value })) }}>{(can.seeAllBranches(user) ? BRANCHES : branchesOf(user)).map((b) => <option key={b}>{b}</option>)}</Select>
                : <Input value={branch} readOnly tabIndex={-1} disabled />}
            </Field>
            <Field label="Print" icon={Printer} hint={about.print_location === PRINT_VENDOR ? 'Dicetak oleh vendor / pihak eksternal.' : undefined}>
              {ubahPrint
                ? <Select value={about.print_location} onChange={setA('print_location')} data-print-pilih>
                    <optgroup label="Cabang">{BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}</optgroup>
                    <optgroup label="Eksternal"><option value={PRINT_VENDOR}>Vendor (dikerjakan eksternal)</option></optgroup>
                  </Select>
                : <div className="flex h-10 items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 text-sm ring-1 ring-slate-200"><span>Sama dengan cabang <b>{branch}</b></span><button type="button" onClick={() => setUbahPrint(true)} className="text-xs font-semibold text-brand hover:underline" data-aksi="print-beda">beda?</button></div>}
            </Field>
            <Field label="Prioritas" icon={Flag} hint="Tenggat terisi otomatis dari prioritas; tetap bisa diubah.">
              <PrioritySelect value={about.priority} onChange={pilihPrio} />
            </Field>
            <Field label="Tanggal Masuk" icon={CalendarPlus} required><Input type="date" value={about.received_at?.slice(0, 10) || ''} onChange={setA('received_at')} /></Field>
            <Field label="Deadline" icon={CalendarClock} required error={E('deadline')} hint={about.priority === 'Sameday' ? 'Sameday: sama dengan tanggal masuk · jam WITA' : 'Jam WITA — bawaan 17.00 (jam kerja)'} className="sm:col-span-2">
              <div className="flex gap-2">
                <Input type="date" aria-invalid={!!E('deadline')} value={about.deadline?.slice(0, 10) || ''} min={about.received_at?.slice(0, 10)} onChange={setA('deadline')} />
                <Input type="time" value={about.deadline_time || '17:00'} onChange={setA('deadline_time')} className="!w-28" aria-label="Jam deadline" title="Jam deadline (WITA)" data-jam-deadline />
              </div>
            </Field>
            <Field label="Catatan" icon={StickyNote} hint="Opsional — tersemat di dasbor & detail project." className="sm:col-span-2">
              <Textarea rows={1} value={about.notes || ''} onChange={setA('notes')} placeholder="mis. Pelanggan minta hasil dikirim ke alamat kantor; nama di ijazah berbeda dengan KTP" />
            </Field>
          </div>
        </SectionCard>

        {/* ===== 3 · Sub project ===== */}
        <SectionCard tone="mint" icon={Layers} title="3 · Sub project & dokumen" aside={`${subs.length} sub project`}>
          <div className="space-y-4">
            {!editing && invoiceItems && <InvoiceItemsView inv={invoiceItems} {...propTarik} {...propDrive} />}
            {autoFill && (autoFill.ship || autoFill.courier || autoFill.priority) && (
              <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
                <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
                <span><b className="font-semibold">Diisi otomatis dari {invoiceLabel(autoFill.invoice_no)}</b>: {[autoFill.ship && 'alamat kirim', autoFill.courier && `kurir ${autoFill.courier} (dipakai saat Siap Kirim)`, autoFill.priority && `prioritas ${autoFill.priority}`].filter(Boolean).join(' · ')}</span>
                <button type="button" className="ml-auto inline-flex items-center gap-1 font-semibold text-amber-800 hover:underline" onClick={() => zoho.invoiceDetail(autoFill.invoice_no).then((d) => d && applyInvoice(d, { force: true }))}><RefreshCw className="h-3 w-3" />Isi ulang dari invoice</button>
              </div>
            )}
            {subs.map((s, i) => (
              <SubProjectEditor prioProject={about.priority || 'Normal'} key={s.id ?? s._k} n={i + 1} sub={s} branch={branch} error={tried ? errs.subs[i] : null}
                locked={isStarted(s)} onPecah={pecahJadiSub(i)}
                onChange={(next) => setSubs((arr) => arr.map((x, j) => (j === i ? next : x)))}
                onRemove={subs.length > 1 && !isStarted(s) ? () => setSubs((a) => a.filter((_, j) => j !== i)) : null} />
            ))}
            <div className="flex flex-wrap gap-2">
              {Object.entries(SUB_TYPES).slice(0, 4).map(([k, t]) => (
                <Button key={k} type="button" variant="outline" size="sm" className="border-dashed text-emerald-700 ring-emerald-300 hover:bg-emerald-50" onClick={() => setSubs((a) => [...a, newSub(k)])} data-aksi={`tambah-sub-${k}`}><Plus className="h-4 w-4" />{t.label}</Button>
              ))}
            </div>
            <details className="rounded-xl bg-white/60 ring-1 ring-slate-200 open:bg-white">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-ink-soft"><CloudUpload className="mr-1 inline h-3.5 w-3.5" />File tambahan (opsional){queue.length ? ` · ${queue.length} file` : ''}</summary>
              <div className="px-3 pb-3"><FileQueue queue={queue} setQueue={setQueue} subs={subs} />
              {editing && (project.files?.length > 0) && <p className="mt-3 text-xs text-ink-mute">{project.files.length} file sudah ada — kelola di halaman detail (File Project).</p>}</div>
            </details>
          </div>
        </SectionCard>

        {kurang.length > 0 && (
          <div role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 ring-1 ring-rose-200" data-kurang>
            <p className="font-bold">Belum bisa disimpan — lengkapi dulu:</p>
            <ul className="mt-1 list-disc pl-4">{kurang.map((k, i) => <li key={i}>{k}</li>)}</ul>
          </div>
        )}
      </div>
  )

  // ============================================================
  //  VERSI MINIMALIS (Mode Klasik): 3 isian + "Lainnya". Logika simpan,
  //  validasi & alur tetap sama dengan form lengkap di atas.
  // ============================================================
  if (minimal) {
    const hari = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
    const dl = String(about.deadline || '').slice(0, 10)
    const autoDl = autoDeadline(about.received_at, about.priority)
    const setDl = (v) => setAbout((a) => ({ ...a, deadline: v }))
    const setPrio = pilihPrio
    const chip = (on) => cx('inline-flex h-9 items-center rounded-lg px-3 text-[12.5px] font-semibold ring-1', on ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-soft ring-slate-300 hover:ring-ink')
    const ubahSub = (i, patch) => setSubs((arr) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x)))
    const setDok = (i, x, patch) => {
      const d0 = { ...((x.docs || [])[0] || { desc: '', pages: 1 }), ...patch }
      const desc = String(d0.desc || '').trim()
      ubahSub(i, { docs: [d0, ...(x.docs || []).slice(1)], description: desc ? `1. ${desc}` : '', pages: Number(d0.pages) || 1, file_count: desc ? 1 : 0 })
    }
    const tambahDok = (nama = '', type = 'terjemahan') => setSubs((a) => {
      const kosong = a.length === 1 && !a[0].id && !points(a[0].description).length
      const baru = newSub(type)
      if (nama && usesDocs(type)) Object.assign(baru, { docs: [{ desc: nama, pages: 1 }], description: `1. ${nama}`, pages: 1, file_count: 1 })
      return kosong ? [baru] : [...a, baru]
    })
    const itemInv = (invoiceItems?.items || []).map((it) => String(it.name || it.item_name || '').trim()).filter((n) => n && !/delivery|ongkir|kurir|pengiriman|fee/i.test(n))
    const nDok = subs.filter((x) => points(x.description).length).length
    const isiMin = (
      <div className="space-y-5 text-[13px]" data-form-minimal>
        {drafTersedia && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200" data-draf>
            <span className="min-w-0 flex-1">Ada <b>draf</b> yang belum selesai{drafTersedia.invoice ? ` · ${invoiceLabel(drafTersedia.invoice)}` : ''}.</span>
            <Button size="sm" onClick={pakaiDraf}>Lanjutkan</Button><Button size="sm" variant="outline" onClick={buangDraf}>Buang</Button>
          </div>
        )}
        {/* 1 · Invoice / pelanggan */}
        <section>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-mute"><span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] text-white">1</span>Pelanggan & invoice</p>
          <div className="space-y-2">
            <CustomerPicker ringkas value={customer} invalid={!!E('customer')} onChange={(c, inv) => { setCustomer(c); if (!editing) setInvoice(inv || '') }} />
            {E('customer') && <FieldError>{E('customer')}</FieldError>}
            {customer && (preset?.invoice_no ? <p className="text-sm font-bold">{invoiceLabel(invoice)}</p> : <InvoicePicker ringkas customer={customer} value={invoice} onChange={setInvoice} error={E('invoice')} onPemilik={pakaiPemilik} />)}
            <MetodeKirim value={metodeKirim} onPilih={pilihMetode} error={E('metode')} kantor={about.print_location} />
          </div>
        </section>
        {/* 2 · Deadline */}
        <section>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-mute"><span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] text-white">2</span>Deadline</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.keys(PRIORITY_META).map((k) => <button key={k} type="button" onClick={() => setPrio(k)} aria-pressed={about.priority === k} data-prio={k} className={chip(about.priority === k)}>{k}</button>)}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setDl(hari(0))} aria-pressed={dl === hari(0)} className={chip(dl === hari(0))}>Hari ini</button>
            <button type="button" onClick={() => setDl(hari(1))} aria-pressed={dl === hari(1)} className={chip(dl === hari(1))}>Besok</button>
            {autoDl && autoDl !== hari(0) && autoDl !== hari(1) && <button type="button" onClick={() => setDl(autoDl)} aria-pressed={dl === autoDl} className={chip(dl === autoDl)}>Sesuai prioritas · {tgl(autoDl)}</button>}
            <input type="date" value={dl} onChange={(e) => setDl(e.target.value)} aria-label="Tanggal deadline" className="h-9 rounded-lg border-0 px-2 text-[12.5px] ring-1 ring-slate-300 focus:ring-2 focus:ring-brand" />
            <input type="time" value={about.deadline_time || '17:00'} onChange={setA('deadline_time')} aria-label="Jam deadline" className="h-9 w-[92px] rounded-lg border-0 px-2 text-[12.5px] ring-1 ring-slate-300 focus:ring-2 focus:ring-brand" data-jam-deadline />
          </div>
          {E('deadline') && <FieldError>{E('deadline')}</FieldError>}
        </section>
        {/* 3 · Dokumen */}
        <section>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-mute"><span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] text-white">3</span>Dokumen</p>
          {itemInv.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5" data-item-invoice>
              <span className="text-[11px] text-ink-mute">Dari invoice:</span>
              {itemInv.slice(0, 8).map((n, k) => <button key={k} type="button" onClick={() => tambahDok(n)} className="h-7 max-w-[220px] truncate rounded-md bg-emerald-50 px-2 text-[11.5px] font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100">+ {n}</button>)}
            </div>
          )}
          <div className="space-y-2">
            {subs.map((x, i) => {
              const err = tried ? errs.subs[i] : null
              const sederhana = x.type === 'terjemahan' && (x.docs || []).length <= 1 && !lengkap.has(x._k ?? x.id) && !isStarted(x) && !(tried && errs.subs[i] && !/dokumen/i.test(errs.subs[i]))
              if (!sederhana) return (
                <div key={x.id ?? x._k}>
                  <SubProjectEditor prioProject={about.priority || 'Normal'} ringkas n={i + 1} sub={x} branch={branch} error={err} locked={isStarted(x)} onPecah={pecahJadiSub(i)}
                    onChange={(next) => setSubs((arr) => arr.map((y, j) => (j === i ? next : y)))}
                    onRemove={subs.length > 1 && !isStarted(x) ? () => setSubs((a) => a.filter((_, j) => j !== i)) : null} />
                </div>
              )
              const d0 = (x.docs || [])[0] || { desc: '', pages: 1 }
              return (
                <div key={x.id ?? x._k} data-baris-dok>
                  <div className="grid grid-cols-[1fr_auto] gap-1.5 sm:grid-cols-[1fr_96px_96px_56px_auto] sm:items-center">
                    <input value={d0.desc} onChange={(e) => setDok(i, x, { desc: e.target.value })} placeholder="Nama dokumen, mis. Akta Kelahiran…" aria-label={`Dokumen ${i + 1}`} autoComplete="off"
                      className={cx('h-9 min-w-0 rounded-lg border-0 px-2.5 text-[13px] ring-1 focus:ring-2 focus:ring-brand', err ? 'ring-rose-400' : 'ring-slate-300')} />
                    <span className="flex items-center gap-1 sm:contents">
                      <select value={x.lang_from} onChange={(e) => ubahSub(i, { lang_from: e.target.value })} aria-label="Bahasa asal" className="h-9 min-w-0 rounded-lg border-0 px-1.5 text-[12.5px] ring-1 ring-slate-300">{LANGS_MIN.map((l) => <option key={l}>{l}</option>)}</select>
                      <select value={x.lang_to} onChange={(e) => ubahSub(i, { lang_to: e.target.value })} aria-label="Bahasa tujuan" className="h-9 min-w-0 rounded-lg border-0 px-1.5 text-[12.5px] ring-1 ring-slate-300">{LANGS_MIN.map((l) => <option key={l}>{l}</option>)}</select>
                      <input type="number" min="1" inputMode="numeric" value={d0.pages} onChange={(e) => setDok(i, x, { pages: e.target.value })} aria-label="Jumlah halaman" title="Halaman" className="h-9 w-14 rounded-lg border-0 px-2 text-right text-[12.5px] tabular-nums ring-1 ring-slate-300" />
                    </span>
                    <span className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1">
                      <button type="button" onClick={() => setLengkap((m) => new Set([...m, x._k ?? x.id]))} title="Isian lengkap (file, penerjemah, jenis lain)" className="h-8 rounded-md px-1.5 text-[11.5px] font-semibold text-ink-soft hover:bg-slate-100">⋯</button>
                      {subs.length > 1 && <button type="button" onClick={() => setSubs((a) => a.filter((_, j) => j !== i))} aria-label="Hapus dokumen" className="grid h-8 w-8 place-items-center rounded-md text-ink-mute hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>}
                    </span>
                  </div>
                  {err && <p className="mt-0.5 text-[11.5px] text-rose-600">{err}</p>}
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] font-semibold">
            <button type="button" onClick={() => tambahDok()} className="text-brand hover:underline" data-aksi="tambah-dok">+ Terjemahan</button>
            {['apostille', 'legalisasi', 'jasa_lain'].filter((k) => SUB_TYPES[k]).map((k) => <button key={k} type="button" onClick={() => tambahDok('', k)} className="text-ink-soft hover:text-ink hover:underline">+ {SUB_TYPES[k].label}</button>)}
          </div>
        </section>
        {/* Lainnya */}
        <details className="border-t border-dashed border-slate-200 pt-3" data-lainnya>
          <summary className="cursor-pointer text-[12.5px] text-ink-soft"><b className="text-ink">Lainnya</b> — Print di <b>{about.print_location}</b> · catatan · tanggal masuk · file</summary>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2"><span className="w-24 text-ink-mute">Print di</span>
              <select value={about.print_location} onChange={setA('print_location')} className="h-9 flex-1 rounded-lg border-0 px-2 ring-1 ring-slate-300">{[...BRANCHES, PRINT_VENDOR].filter(Boolean).map((b) => <option key={b}>{b}</option>)}</select></label>
            <label className="flex items-center gap-2"><span className="w-24 text-ink-mute">Tanggal masuk</span>
              <input type="date" value={String(about.received_at || '').slice(0, 10)} onChange={setA('received_at')} className="h-9 flex-1 rounded-lg border-0 px-2 ring-1 ring-slate-300" /></label>
            <label className="block"><span className="text-ink-mute">Catatan</span>
              <Textarea rows={2} value={about.notes || ''} onChange={setA('notes')} placeholder="Opsional" /></label>
            <FileQueue queue={queue} setQueue={setQueue} subs={subs} />
          </div>
        </details>
        {kurang.length > 0 && (
          <div role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-200" data-kurang>
            <b>Lengkapi dulu:</b> {kurang.join(' · ')}
          </div>
        )}
      </div>
    )
    return (
      <Sheet open side onClose={onClose} title={judul}
        footer={<><span className="min-w-0 flex-1 truncate text-xs text-ink-mute">{nDok} dokumen{dl ? ` · deadline ${tgl(dl)} ${about.deadline_time || '17:00'}` : ''}</span><Button loading={busy} onClick={submit} data-aksi="simpan-project">{progress || 'Simpan project →'}</Button></>}>
        {isiMin}
      </Sheet>
    )
  }

  // ============================================================
  //  PROJECT BARU — satu halaman penuh (bukan panel samping). Tiap sub project satu baris,
  //  diisi ke samping; dokumen cukup ditarik / diunggah. Logika simpan & validasi sama.
  // ============================================================
  if (page && !editing) {
    const sh = customer?.ship || {}
    const alamatRingkas = [sh.attention, sh.street1, sh.street2, sh.city, sh.state, sh.zip].filter(Boolean).join(' · ')
    const nDokumen = subs.reduce((a, x) => a + (Number(x.file_count) || 0), 0)
    const nHalaman = subs.reduce((a, x) => a + (Number(x.pages) || 0), 0)
    const tambahSub = (k) => setSubs((a) => [...a, subBaru(k, data, [...a].reverse().find((x) => x.type === k))])
    // File ditarik ke area bawah → masuk ke sub project terakhir yang memakai dokumen (aturan per jenis tetap berlaku).
    const tarikKeBawah = async (files) => {
      let i = subs.map((x) => usesDocs(x.type)).lastIndexOf(true)
      const daftar = i < 0 ? [...subs, subBaru('terjemahan', data)] : subs
      if (i < 0) i = daftar.length - 1
      const hasil = await pasangKeSub(daftar[i], files)
      setSubs(daftar.map((x, j) => (j === i ? hasil.sub : x)))
      if (hasil.sisa.length) pecahJadiSub(i)(hasil.sisa)
    }
    const kelas = 'h-9 w-full min-w-0 rounded-[10px] border-0 bg-white px-2.5 text-sm text-ink ring-1 ring-[#D9DBE7] placeholder:text-slate-400 hover:ring-slate-400 focus:outline-none focus:ring-2 focus:ring-brand max-md:h-11 max-md:text-base'
    // Daftar sub terjemahan — pilihan "hasil terjemahan yang mana" untuk apostille.
    // Satu pilihan per DOKUMEN (bukan per sub): ref = "<sub>#<urutan dokumen>" — satu sub apostille tetap satu dokumen.
    const daftarTr = subs.flatMap((x, i) => (['terjemahan', 'terjemahan_nt'].includes(x.type) ? points(x.description).map((d, di) => ({ ref: `${x.id ?? x._k}#${di}`, sub: i, n: i + 1, nama: `${di + 1}. ${d}` })) : []))
    const apostilleHasil = (i, asal, di = 0) => {
      const t = daftarTr.find((d) => d.sub === i && d.ref.endsWith(`#${di}`))
      return { ...subBaru('apostille', data, asal), ...(asal ? { country: asal.country, applicant_file: asal.applicant_file, applicant_id: asal.applicant_id, applicant_id_type: asal.applicant_id_type } : {}), objek: 'terjemahan', sumber_sub: t?.ref || '', docs: [{ desc: t ? `Hasil terjemahan — ${t.nama}` : '', pages: 1 }], description: t ? `1. Hasil terjemahan — ${t.nama}` : '', file_count: t ? 1 : 0, pages: t ? 1 : 0 }
    }
    // "Keduanya": dipecah jadi dua sub — dokumen asli (langsung jalan) + hasil terjemahan (menunggu). Satu sub tetap satu dokumen.
    const pecahKeduanya = (i) => () => {
      setSubs((arr) => { const asal = { ...arr[i], objek: 'asli', sumber_sub: '' }; const tr = daftarTr.length === 1 ? daftarTr[0].sub : -1
        const baru = tr >= 0 ? apostilleHasil(tr, asal) : { ...apostilleHasil(i, asal), sumber_sub: '', docs: [{ desc: '', pages: 1 }], description: '', file_count: 0, pages: 0 }
        return [...arr.slice(0, i), asal, baru, ...arr.slice(i + 1)] })
      notify('Dipecah jadi 2 sub: dokumen asli + hasil terjemahan (menunggu terjemahan selesai)')
    }
    // Satu sub apostille per dokumen terjemahan (satu sub = satu dokumen) — dokumen yang tidak perlu tinggal dihapus.
    const tambahApostilleHasil = (i) => () => { const jml = daftarTr.filter((d) => d.sub === i).length; setSubs((arr) => { const asal = [...arr].reverse().find((y) => y.type === 'apostille'); return [...arr.slice(0, i + 1), ...Array.from({ length: jml }, (_, di) => apostilleHasil(i, asal, di)), ...arr.slice(i + 1)] }); if (jml > 1) notify(`${jml} sub apostille dibuat — satu per dokumen terjemahan. Hapus yang tidak perlu.`) }
    const tombolSimpan = progress || 'Buat Project'
    return (
      <div className="space-y-3.5 pb-2" data-project-baru>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onClose} aria-label="Kembali ke daftar project" className="grid h-11 w-11 flex-none place-items-center rounded-xl text-ink hover:bg-white"><ChevronLeft className="h-[22px] w-[22px]" /></button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#5E6380]">Project{preset?.invoice_no ? ` · dari faktur ${invoiceLabel(preset.invoice_no)}` : ''}</p>
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight">Project Baru</h1>
          </div>
          {!drafTersedia && <span className="text-xs font-semibold text-[#17693A] max-sm:hidden" title="Isian teks tersimpan di perangkat ini. File dokumen tidak ikut tersimpan.">Draf tersimpan otomatis</span>}
          <div className="hidden gap-2 md:flex">
            <Button variant="outline" onClick={onClose} className="!h-11 px-5">Batal</Button>
            <Button loading={busy} onClick={submit} className="!h-11 px-6" data-aksi="buat-project-atas"><Check className="h-[18px] w-[18px]" />{tombolSimpan}</Button>
          </div>
        </div>

        {drafTersedia && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 px-3.5 py-2.5 text-xs text-sky-900 ring-1 ring-sky-200" data-draf>
            <span className="min-w-0 flex-1">Ada <b>draf project</b> yang belum selesai ({tgl(drafTersedia.at)}{drafTersedia.invoice ? ` · ${invoiceLabel(drafTersedia.invoice)}` : ''}). File dokumen perlu dipilih ulang.</span>
            <Button size="sm" onClick={pakaiDraf}>Lanjutkan draf</Button><Button size="sm" variant="outline" onClick={buangDraf}>Buang</Button>
          </div>
        )}

        {/* 1 · Pelanggan, invoice & pengiriman — satu pita */}
        <div className="flex flex-col gap-2.5 rounded-2xl bg-white px-4 py-3.5" data-bagian="1">
          <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-[#5E6380]">1 · Pelanggan, invoice & pengiriman</h2>
          <div className="flex flex-wrap items-start gap-2.5">
            <KolBaru label="Pelanggan" wajib style={{ flex: '1.4 1 220px' }} error={E('customer')}>
              <CustomerPicker ringkas value={customer} invalid={!!E('customer')} onChange={(c, inv) => { setCustomer(c); setInvoice(preset?.invoice_no || inv || '') }} />
            </KolBaru>
            <KolBaru label="No. invoice" wajib style={{ flex: '1 1 170px' }} error={preset?.invoice_no ? E('invoice') : null}>
              {preset?.invoice_no
                ? <p className="flex h-9 items-center text-sm font-bold max-md:h-11">{invoiceLabel(invoice)}</p>
                : <InvoicePicker ringkas customer={customer} value={invoice} onChange={setInvoice} error={E('invoice')} onPemilik={pakaiPemilik} />}
            </KolBaru>
            <KolBaru label="Metode pengiriman" wajib style={{ flex: '1 1 190px' }} error={E('metode')}>
              <select value={metodeKirim} onChange={(e) => pilihMetode(e.target.value)} aria-label="Metode pengiriman" aria-invalid={!!E('metode')} data-metode-kirim className={cx(kelas, '!px-2', E('metode') && '!ring-2 !ring-rose-500')}>
                <option value="" disabled>Pilih metode…</option>
                {METODE_URUT.map((t) => <option key={t} value={t}>{t === 'pickup' && about.print_location ? `Diambil di Kantor ${about.print_location}` : DELIVERY_LABEL[t]}</option>)}
              </select>
            </KolBaru>
            <KolBaru label="Alamat kirim" style={{ flex: '2 1 300px' }}>
              {!perluAlamat
                ? <p className="flex min-h-9 items-center rounded-[10px] bg-slate-50 px-2.5 text-xs text-ink-mute ring-1 ring-slate-200 max-md:min-h-11" data-tanpa-alamat>{metodeKirim === 'pickup' ? 'Diambil di kantor — alamat tidak diperlukan.' : 'Softcopy saja — alamat tidak diperlukan.'}</p>
                : !customer
                ? <p className="flex min-h-9 items-center rounded-[10px] bg-slate-50 px-2.5 text-xs text-ink-mute ring-1 ring-slate-200 max-md:min-h-11">Tampil otomatis setelah pelanggan dipilih.</p>
                : (
                  <div className="flex min-h-9 items-center gap-2 rounded-[10px] bg-white px-2.5 ring-1 ring-[#D9DBE7] max-md:min-h-11" data-alamat-ringkas>
                    <span className="min-w-0 flex-1 truncate text-sm" title={alamatRingkas}>{alamatRingkas || <span className="text-ink-mute">Belum ada alamat</span>}</span>
                    {customer.ship_source === 'invoice' && <span className="hidden flex-none items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 sm:inline-flex"><Sparkles className="h-3 w-3" />dari invoice — periksa</span>}
                    <button type="button" onClick={() => setEditShip((v) => !v)} className="inline-flex min-h-9 flex-none items-center gap-1 text-xs font-semibold text-brand hover:underline max-md:min-h-11"><Pencil className="h-3 w-3" />{editShip ? 'Tutup' : 'Edit'}</button>
                  </div>
                )}
            </KolBaru>
          </div>
          {perluAlamat && customer && editShip && <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><ShipEditor ship={customer.ship || {}} onChange={(ship) => setCustomer((c) => ({ ...c, ship }))} onDone={() => setEditShip(false)} /></div>}
        </div>

        {/* 2 · Project */}
        <div className="flex flex-col gap-2.5 rounded-2xl bg-white px-4 py-3.5" data-bagian="2">
          <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-[#5E6380]">2 · Project</h2>
          <div className="flex flex-wrap items-start gap-2.5">
            <KolBaru label="Prioritas" wajib hp="half" style={{ flex: '1 1 140px' }}>
              <PrioritySelect value={about.priority} onChange={pilihPrio} />
            </KolBaru>
            <KolBaru label="Deadline (WITA)" wajib style={{ flex: '1.6 1 236px' }} error={E('deadline')}>
              <div className="flex gap-1.5">
                <input type="date" aria-label="Tanggal deadline" aria-invalid={!!E('deadline')} value={about.deadline?.slice(0, 10) || ''} min={about.received_at?.slice(0, 10)} onChange={setA('deadline')} className={kelas} />
                <input type="time" aria-label="Jam deadline" value={about.deadline_time || '17:00'} onChange={setA('deadline_time')} className={cx(kelas, '!w-[110px] flex-none')} data-jam-deadline />
              </div>
            </KolBaru>
            <KolBaru label="Tanggal masuk" hp="half" style={{ flex: '1 1 136px' }}>
              <input type="date" aria-label="Tanggal masuk" value={about.received_at?.slice(0, 10) || ''} onChange={setA('received_at')} className={kelas} />
            </KolBaru>
            <KolBaru label="Cabang" hp="half" style={{ flex: '1 1 120px' }}>
              {can.seeAllBranches(user) || isMultiBranch(user)
                ? <select aria-label="Cabang" value={branch} onChange={(e) => { const lama = branch; setBranch(e.target.value); setAbout((a) => (a.print_location === lama ? { ...a, print_location: e.target.value } : a)) }} className={cx(kelas, '!px-2')}>{(can.seeAllBranches(user) ? BRANCHES : branchesOf(user)).map((b) => <option key={b}>{b}</option>)}</select>
                : <input aria-label="Cabang" value={branch} readOnly disabled tabIndex={-1} className={cx(kelas, 'bg-slate-50 text-ink-mute')} />}
            </KolBaru>
            <KolBaru label="Lokasi print" hp="half" style={{ flex: '1 1 120px' }}>
              <select aria-label="Lokasi print" value={about.print_location} onChange={setA('print_location')} data-print-pilih className={cx(kelas, '!px-2')}>
                <optgroup label="Cabang">{BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}</optgroup>
                <optgroup label="Eksternal"><option value={PRINT_VENDOR}>Vendor</option></optgroup>
              </select>
            </KolBaru>
            <KolBaru label="Catatan" style={{ flex: '3 1 200px' }}>
              <input aria-label="Catatan" value={about.notes || ''} onChange={setA('notes')} placeholder="Opsional" className={kelas} />
            </KolBaru>
          </div>
        </div>

        {/* 3 · Sub project — satu baris per sub, jarak rapat */}
        <div className="flex flex-col gap-1.5 rounded-2xl bg-white px-4 py-3.5 max-md:px-2.5" data-bagian="3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-[#5E6380]">3 · Sub project & dokumen</h2>
            <span className="text-xs text-[#5E6380]" data-ringkasan-sub>{subs.length} sub project · {nDokumen} dokumen · {nHalaman} halaman</span>
          </div>
          {invoiceItems && <InvoiceItemsView inv={invoiceItems} {...propTarik} {...propDrive} />}
          {autoFill && (autoFill.ship || autoFill.courier || autoFill.priority) && (
            <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-amber-50 px-3.5 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
              <span><b className="font-semibold">Diisi otomatis dari {invoiceLabel(autoFill.invoice_no)}</b>: {[autoFill.ship && 'alamat kirim', autoFill.courier && `kurir ${autoFill.courier}`, autoFill.priority && `prioritas ${autoFill.priority}`].filter(Boolean).join(' · ')}</span>
            </div>
          )}
          {subs.map((s, i) => (
            <SubBaris prioProject={about.priority || 'Normal'} key={s.id ?? s._k} n={i + 1} sub={s} branch={branch} error={tried ? errs.subs[i] : null} onPecah={pecahJadiSub(i)}
              daftarTr={daftarTr} onKeduanya={pecahKeduanya(i)} onApostilleHasil={tambahApostilleHasil(i)}
              onChange={(next) => setSubs((arr) => arr.map((x, j) => (j === i ? next : x)))}
              onRemove={subs.length > 1 ? () => setSubs((a) => a.filter((_, j) => j !== i)) : null} />
          ))}
          <div data-tarik-bawah className={cx('mt-1.5 flex flex-wrap items-center gap-2 rounded-xl border-2 border-dashed px-3 py-2.5', seretBawah ? 'border-brand bg-brand-soft' : 'border-[#B9BEDA] bg-[#F8F9FD]')}
            onDragOver={(e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); setSeretBawah(true) } }} onDragLeave={() => setSeretBawah(false)}
            onDrop={(e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); setSeretBawah(false); tarikKeBawah(e.dataTransfer.files) } }}>
            <span className="inline-flex items-center gap-2 text-sm font-semibold"><Upload className="h-[18px] w-[18px]" />{seretBawah ? 'Lepas file di sini' : 'Tarik file ke sini'}</span>
            <span className="min-w-0 flex-[1_1_280px] text-xs text-[#5E6380]">Jenis dokumen Reguler / Non Reguler hanya untuk bahasa Indonesia, Inggris, Belanda; bahasa lain (ke vendor) cukup pakai Prioritas. Terjemahan, apostille & legalisasi: tiap file jadi satu baris dokumen dalam sub yang sama.</span>
            {Object.entries(SUB_TYPES).map(([k, t]) => (
              <button key={k} type="button" onClick={() => tambahSub(k)} data-aksi={`tambah-sub-${k}`} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-white px-3 text-[13px] font-semibold text-ink ring-1 ring-[#D9DBE7] hover:ring-ink max-md:h-11"><Plus className="h-3.5 w-3.5" />{t.short || t.label}</button>
            ))}
          </div>
          <details className="rounded-xl ring-1 ring-slate-200">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-ink-soft max-md:py-3"><CloudUpload className="mr-1 inline h-3.5 w-3.5" />File tambahan (opsional){queue.length ? ` · ${queue.length} file` : ''}</summary>
            <div className="px-3 pb-3"><FileQueue queue={queue} setQueue={setQueue} subs={subs} /></div>
          </details>
        </div>

        {kurang.length > 0 && (
          <div role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 ring-1 ring-rose-200" data-kurang>
            <p className="font-bold">Belum bisa disimpan — lengkapi dulu:</p>
            <ul className="mt-1 list-disc pl-4">{kurang.map((k, i) => <li key={i}>{k}</li>)}</ul>
          </div>
        )}

        <div className="sticky bottom-0 z-20 -mx-1 flex gap-2 border-t border-slate-200 bg-white/95 px-1 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
          <Button variant="outline" onClick={onClose} className="!h-12 flex-1">Batal</Button>
          <Button loading={busy} onClick={submit} className="!h-12 flex-[2]" data-aksi="buat-project-bawah"><Check className="h-[18px] w-[18px]" />{tombolSimpan}</Button>
        </div>
      </div>
    )
  }

  // Halaman penuh — dipakai saat dibuka dari menu / ikon +, bukan panel geser,
  // supaya formnya lebar dan mudah dibaca sambil mengisi.
  if (page) return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-extrabold tracking-tight sm:text-xl">{judul}</h1>
        {preset?.invoice_no && <span className="text-sm text-ink-mute">dari faktur {invoiceLabel(preset.invoice_no)}</span>}
        <div className="ml-auto hidden gap-2 md:flex">
          <Button variant="outline" onClick={onClose} className="px-5">Batal</Button>
          <Button loading={busy} onClick={submit} className="px-6" data-aksi="buat-project-atas">{progress || (editing ? 'Simpan Perubahan' : 'Buat Project')}</Button>
        </div>
      </div>
      <div className="form-rapat rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:px-6 sm:py-5">{isi}</div>
      {/* Tombol seukuran wajar & rata kiri — seperti bilah aksi Zoho */}
      <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap gap-2 border-t border-slate-200 bg-white/95 px-1 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <Button loading={busy} onClick={submit} className="flex-1 px-6">{progress || (editing ? 'Simpan Perubahan' : 'Buat Project')}</Button>
        <Button variant="outline" onClick={onClose} className="px-5">Batal</Button>
      </div>
    </div>
  )

  return (
    <Sheet open xwide tinted side={side ? 'right' : undefined} onClose={onClose} title={judul} footer={kaki}>
      {isi}
    </Sheet>
  )
}

/** Kolom isian ringkas di halaman penuh Project Baru: label kecil di atas, isian di bawah; di HP penuh / setengah lebar. */
function KolBaru({ label, wajib, hp = 'full', style, error, children }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-[3px]', hp === 'half' ? 'max-md:!basis-[calc(50%-5px)] max-md:!grow' : 'max-md:!basis-full')} style={style}>
      <span className="text-[11px] font-semibold text-[#5E6380]">{label}{wajib && <span className="text-[#B4233F]"> *</span>}</span>
      {children}
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

/** Item & deskripsi invoice Zoho — hanya tampilan (tidak mengisi apa pun), untuk dibaca / disalin saat mengisi sub project secara manual. */
function InvoiceItemsView({ inv, onTarik, onUrung, tarik, onDrive, onUrungDrive, drive }) {
  const { notify } = useApp()
  const [open, setOpen] = useState(true)
  const items = inv.items || []
  const textOf = (it) => [it.name, it.description].filter((x) => String(x || '').trim()).join('\n')
  const copy = async (text, label) => { const ok = await copyText(text); notify(ok ? `${label} disalin` : 'Gagal menyalin — salin manual', ok ? 'ok' : 'err') }
  return (
    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-emerald-200" data-testid="invoice-items">
      <div className="flex flex-wrap items-center gap-2 bg-emerald-50 px-3.5 py-2">
        <Receipt className="h-4 w-4 shrink-0 text-emerald-700" />
        <p className="min-w-0 flex-1 text-xs text-emerald-900"><b className="font-semibold">Item invoice {invoiceLabel(inv.invoice_no)}</b> <span className="text-emerald-800/80">· {onTarik ? 'isi sub project manual, atau coba Tarik Data (beta)' : 'hanya tampilan — baca/salin lalu isi sub project di bawah secara manual'}</span></p>
        {onTarik && items.length > 0 && <button type="button" onClick={onTarik} disabled={!!tarik?.sibuk} data-aksi="tarik-data" title="Susun sub project otomatis dari item invoice ini — hasilnya tetap bisa diubah"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1 text-[11.5px] font-bold text-white hover:bg-violet-700 disabled:opacity-60 max-md:min-h-11 max-md:px-3 max-md:text-[13px]">
          {tarik?.sibuk ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Sparkles className="h-3.5 w-3.5" />}{tarik?.sibuk ? 'Menganalisa…' : 'Tarik Data (beta)'}</button>}
        {onDrive && <button type="button" onClick={onDrive} disabled={!!drive?.sibuk} data-aksi="tarik-drive" title="Masa transisi: susun sub project dari nama file di folder Drive bernomor invoice ini — hasilnya tetap bisa diubah"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-sky-700 px-2.5 py-1 text-[11.5px] font-bold text-white hover:bg-sky-800 disabled:opacity-60 max-md:min-h-11 max-md:px-3 max-md:text-[13px]">
          {drive?.sibuk ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <FolderSearch className="h-3.5 w-3.5" />}{drive?.sibuk ? 'Membaca Drive…' : 'Tarik dari Drive (transisi)'}</button>}
        {items.length > 0 && <button type="button" onClick={() => copy(items.map((it, i) => `${i + 1}. ${textOf(it)}`).join('\n\n'), 'Semua item')} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-100"><Copy className="h-3 w-3" />Salin semua</button>}
        <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-lg p-1 text-emerald-800 hover:bg-emerald-100" aria-label={open ? 'Sembunyikan item invoice' : 'Tampilkan item invoice'} aria-expanded={open}>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
      </div>
      {tarik?.galat && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800" data-tarik-galat>{tarik.galat}. Sub project tidak diubah — isi manual seperti biasa.</p>}
      {tarik?.ok && (
        <div role="status" className="flex flex-wrap items-center gap-2 border-t border-violet-100 bg-violet-50 px-3.5 py-2 text-xs text-violet-900" data-tarik-hasil={tarik.mesin}>
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <p className="min-w-0 flex-1"><b className="font-bold">{tarik.n} sub project disusun dari invoice (beta)</b> — {tarik.mesin === 'ai' ? 'dianalisa AI' : 'DEMO: disusun dengan aturan sederhana, bukan AI (AI hanya berjalan di ATLAS live)'}. Periksa lagi tiap sub, lalu tinggal pilih filenya. Belum ada yang tersimpan.<span className="block" data-tarik-kirim>{tarik.kirim ? <>Pengiriman ikut ditarik: <b className="font-bold">{tarik.kirim}</b> — periksa di bagian 1.</> : 'Pengiriman: tidak ada data kirim di invoice ini — isi manual.'}</span>{tarik.dilewati?.length > 0 && <span className="block text-violet-800/80">Tidak dijadikan sub: {tarik.dilewati.join(' · ')}</span>}</p>
          <button type="button" onClick={onUrung} data-aksi="urung-tarik" className="inline-flex min-h-8 items-center rounded-lg bg-white px-2.5 py-1 text-[11.5px] font-bold text-violet-800 ring-1 ring-violet-300 hover:bg-violet-100 max-md:min-h-11 max-md:px-3">Urungkan</button>
        </div>
      )}
      {drive?.galat && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800" data-drive-galat>{drive.galat}. Sub project tidak diubah — isi manual seperti biasa.</p>}
      {drive?.ok && (
        <div role="status" className="flex flex-wrap items-center gap-2 border-t border-sky-100 bg-sky-50 px-3.5 py-2 text-xs text-sky-900" data-drive-hasil={drive.mesin}>
          <FolderSearch className="h-3.5 w-3.5 shrink-0" />
          <p className="min-w-0 flex-1"><b className="font-bold">{drive.n} sub project · {drive.dok} dokumen disusun dari nama file Drive</b>{drive.mesin === 'contoh' ? ' — DEMO: memakai folder contoh (nama karangan); Drive asli hanya dibaca di ATLAS live' : ''}. Periksa lagi tiap sub, lalu pasang filenya. Belum ada yang tersimpan.<span className="block break-words text-sky-800/80">Folder: {drive.folder.join(' · ')}</span></p>
          <button type="button" onClick={onUrungDrive} data-aksi="urung-drive" className="inline-flex min-h-8 items-center rounded-lg bg-white px-2.5 py-1 text-[11.5px] font-bold text-sky-800 ring-1 ring-sky-300 hover:bg-sky-100 max-md:min-h-11 max-md:px-3">Urungkan</button>
        </div>
      )}
      {open && (items.length === 0
        ? <p className="px-3.5 py-3 text-xs text-ink-mute">Item invoice belum ada di salinan Zoho (disinkron tiap 10 menit) — isi sub project manual dari invoice.</p>
        : (
          <ol className="divide-y divide-slate-100">
            {items.map((it, i) => (
              <li key={i} className="flex gap-3 px-3.5 py-2.5">
                <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-bold text-ink-mute">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-sm font-semibold text-ink">{it.name || 'Item'}</p>
                    {(it.quantity || it.rate) && <span className="text-[11px] text-ink-mute">{it.quantity ? `${it.quantity} ${it.unit || ''}`.trim() : ''}{it.rate ? ` × ${rupiah(it.rate)}` : ''}</span>}
                  </div>
                  {String(it.description || '').trim() && <pre className="mt-1 cursor-text select-text whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-2.5 py-2 font-sans text-[13px] leading-relaxed text-ink-soft ring-1 ring-slate-100">{it.description.trim()}</pre>}
                </div>
                <button type="button" onClick={() => copy(textOf(it), `Item ${i + 1}`)} title="Salin item ini" aria-label={`Salin item ${i + 1}`} className="h-fit shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-brand-soft hover:text-brand"><Copy className="h-4 w-4" /></button>
              </li>
            ))}
          </ol>
        ))}
    </div>
  )
}

function FileQueue({ queue, setQueue, subs }) {
  const [over, setOver] = useState(false)
  const add = (list) => { const files = [...(list || [])]; setQueue((q) => [...q, ...files.map((file) => ({ _k: Math.random(), file, name: file.name, sub_ref: '' }))]) }
  const set = (k, patch) => setQueue((q) => q.map((x) => (x._k === k ? { ...x, ...patch } : x)))
  return (
    <div className="space-y-2.5">
      <label onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files) }}
        className={cx('flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed bg-white px-4 py-6 text-sm font-semibold transition focus-within:ring-2 focus-within:ring-cyan-500',
          over ? 'border-cyan-500 bg-cyan-50 text-cyan-800' : 'border-cyan-300 text-cyan-800 hover:border-cyan-500 hover:bg-cyan-50')}>
        <Upload className="h-5 w-5" />Pilih atau tarik file ke sini
        <span className="text-xs font-normal text-ink-mute">Bisa beberapa file sekaligus · kaitkan tiap file ke sub project</span>
        <input type="file" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      </label>
      {queue.map((q) => (
        <div key={q._k} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
          <FileText className="h-4 w-4 shrink-0 text-brand" />
          <Input value={q.name} onChange={(e) => set(q._k, { name: e.target.value })} className="min-w-0 flex-1" aria-label="Nama file" />
          <span className="text-[11px] text-ink-mute">{kb(q.file.size)}</span>
          <Select value={q.sub_ref} onChange={(e) => set(q._k, { sub_ref: e.target.value })} className="w-full sm:w-48" aria-label="Sub project">
            <option value="">Umum (project)</option>
            {subs.map((s, i) => <option key={s.id ?? s._k} value={s.id ?? s._k}>Sub {i + 1} · {(SUB_TYPES[s.type] ?? SUB_TYPES.jasa_lain).label}</option>)}
          </Select>
          <button type="button" onClick={() => setQueue((x) => x.filter((y) => y._k !== q._k))} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" aria-label="Batalkan file"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  )
}

/** Form kecil untuk mengoreksi alamat pengiriman (tersimpan di project, bukan ke Zoho). */
/** Pilihan metode pengiriman di awal pengisian project — satu ketuk, target sentuh 44px di HP. */
const METODE_URUT = ['courier', 'pickup', 'softcopy', 'vendor']
function MetodeKirim({ value, onPilih, error, kantor }) {
  return (
    <div data-metode-kirim>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-mute"><Truck className="h-3.5 w-3.5" />Metode pengiriman <span className="text-rose-600">*</span></p>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Metode pengiriman" aria-invalid={!!error}>
        {METODE_URUT.map((t) => {
          const on = value === t
          return (
            <button key={t} type="button" role="radio" aria-checked={on} onClick={() => onPilih(t)} data-metode={t}
              className={cx('flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-center text-xs font-semibold leading-tight ring-1 transition',
                on ? 'bg-ink text-white ring-ink' : error ? 'bg-white text-ink-soft ring-rose-300 hover:ring-ink' : 'bg-white text-ink-soft ring-slate-300 hover:ring-ink')}>
              {on && <Check className="h-3.5 w-3.5 shrink-0" />}{t === 'pickup' && kantor ? `Diambil di Kantor ${kantor}` : DELIVERY_LABEL[t]}
            </button>
          )
        })}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

function ShipEditor({ ship, onChange, onDone }) {
  const set = (k) => (e) => onChange({ ...ship, [k]: e.target.value })
  return (
    <div className="grid gap-x-3 gap-y-2.5 rounded-xl bg-white p-3 ring-1 ring-orange-200 sm:grid-cols-2">
      <Field label="Nama penerima"><Input value={ship.attention || ''} onChange={set('attention')} /></Field>
      <Field label="No. HP penerima"><Input value={ship.phone || ''} onChange={set('phone')} inputMode="tel" /></Field>
      <div className="sm:col-span-2"><Field label="Alamat"><Textarea rows={2} value={ship.street1 || ''} onChange={set('street1')} /></Field></div>
      <Field label="Kec/Kab/Kota"><Input value={ship.city || ''} onChange={set('city')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Provinsi"><Input value={ship.state || ''} onChange={set('state')} /></Field>
        <Field label="Kode pos"><Input value={ship.zip || ''} onChange={set('zip')} inputMode="numeric" /></Field>
      </div>
      <div className="sm:col-span-2 flex justify-end"><Button size="sm" onClick={onDone}><Check className="h-4 w-4" />Selesai</Button></div>
    </div>
  )
}

function CustomerPicker({ value, onChange, invalid, ringkas }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [inv, setInv] = useState([]) // hasil cari lewat NOMOR INVOICE (≥ 4 angka)
  const [invNama, setInvNama] = useState({}) // invoice terbaru tiap pelanggan di hasil cari nama

  useEffect(() => {
    if (value || q.trim().length < 2) { setRes([]); setInv([]); return }
    const t = setTimeout(async () => {
      setLoading(true); setErr('')
      const angka = q.replace(/\D/g, '')
      try {
        const [k, iv] = await Promise.all([zoho.searchContacts(q.trim()), angka.length >= 4 ? zoho.cariInvoice(angka).catch(() => []) : []])
        setRes(k); setInv(iv); setInvNama({})
        zoho.invoiceTerbaru(k.map((c) => c.zoho_id)).then(setInvNama).catch(() => {})
      } catch (e) { setErr(e.message) } finally { setLoading(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [q, value])

  /** Pilih lewat nomor invoice: pelanggan pemilik invoice dipasang, nomor invoicenya langsung terpilih. */
  const pickInvoice = async (r) => {
    setLoading(true); setErr('')
    try {
      const c = await zoho.contact(r.customer_id)
      if (!c) { setErr('Pelanggan invoice ini belum ada di salinan Zoho — cari lewat namanya atau isi manual'); return }
      onChange(c, r.invoice_no)
    } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }

  const pick = async (c, noInv) => {
    setLoading(true); setErr('')
    try { onChange({ ...c, ...((await zoho.contact(c.zoho_id)) || {}) }, noInv) } catch (e) { setErr(e.message); onChange(c, noInv) } finally { setLoading(false) }
  }

  if (value && ringkas) return (
    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200" data-pelanggan-terpilih>
      <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate font-bold text-ink">{value.name}<span className="ml-1.5 text-xs font-normal text-ink-mute">{value.city || ''}</span></p>
      <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-brand hover:underline">Ganti</button>
    </div>
  )
  if (value) return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex items-center gap-3">
        <UserRound className="h-4 w-4 shrink-0 text-ink-mute" />
        <p className="min-w-0 flex-1 truncate text-base font-bold text-ink">{value.name}</p>
        <button type="button" onClick={() => pick(value)} className="rounded-lg p-1.5 text-brand hover:bg-white" aria-label="Tarik ulang dari Zoho" title="Tarik ulang dari Zoho">
          <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
        </button>
        <Button size="sm" variant="outline" onClick={() => onChange(null)}>Ganti</Button>
      </div>
      <CustomerInfo c={value} part="customer" plain className="mt-3 border-t border-slate-100 pt-3" />
    </div>
  )
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input className="h-11 pl-9" aria-invalid={invalid} placeholder="Cari nama / email / no. invoice" value={q} onChange={(e) => setQ(e.target.value)} />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand" />}
      </div>
      {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
      {inv.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-emerald-200" data-hasil-invoice>
          {inv.map((r) => (
            <li key={r.invoice_no}><button type="button" onClick={() => pickInvoice(r)} disabled={loading} className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-emerald-50 disabled:opacity-60">
              <Receipt className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{r.customer_name || 'Pelanggan'}</span><span className="block text-xs text-ink-mute">Invoice {invoiceLabel(r.invoice_no)}{r.date ? ` · ${tgl(r.date)}` : ''}</span></span>
            </button></li>
          ))}
        </ul>
      )}
      {res.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200">
          {res.map((c) => (
            <li key={c.zoho_id}><button type="button" onClick={() => pick(c)} className="w-full px-3 py-2.5 text-left hover:bg-slate-50">
              <p className="text-sm font-semibold">{c.name}</p><p className="text-xs text-ink-mute">{c.email || '—'}</p>
            </button>
              {invNama[c.zoho_id]?.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5" data-invoice-nama={c.zoho_id}>
                  <span className="text-[11px] text-ink-mute">Invoice:</span>
                  {invNama[c.zoho_id].map((iv) => (
                    <button key={iv.invoice_no} type="button" onClick={() => pick(c, iv.invoice_no)} disabled={loading} title={`Pilih ${c.name} dengan invoice ${invoiceLabel(iv.invoice_no)}`}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-emerald-50 px-2 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-60 max-md:min-h-11 max-md:px-3">
                      {invoiceLabel(iv.invoice_no)}<span className="font-normal text-emerald-800/70">{iv.date ? tgl(iv.date) : ''}</span></button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!loading && q.trim().length >= 2 && !res.length && !inv.length && !err && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          <span className="min-w-0 flex-1">Tidak ditemukan di data Zoho (disinkron berkala). Pelanggan baru di Zoho muncul paling lama 1 jam — atau isi manual dulu.</span>
          <Button size="sm" variant="outline" onClick={() => onChange({ zoho_id: null, name: q.trim(), email: '', phone: '', city: '', ship: { attention: q.trim() }, manual: true })}>Isi manual: “{q.trim()}”</Button>
        </div>
      )}
    </div>
  )
}

function InvoicePicker({ customer, value, onChange, error, ringkas, onPemilik }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  // Pemilik invoice yang diketik: supaya jelas invoice ini milik siapa. Pelanggan kosong → langsung diisi; pelanggan berbeda → diperingatkan.
  const [pemilik, setPemilik] = useState(null)
  const idPel = customer?.zoho_id || ''
  useEffect(() => {
    const no = String(value || '').trim().toUpperCase()
    if (no.replace(/\D/g, '').length < 6) { setPemilik(null); return }
    let batal = false
    const t = setTimeout(() => zoho.cariInvoice(no).then((l) => {
      if (batal) return
      // cocokkan ANGKANYA saja: "1012611197431" dan "INV-1012611197431" adalah invoice yang sama
      const angka = no.replace(/\D/g, '')
      const r = l.find((x) => String(x.invoice_no).replace(/\D/g, '') === angka) || null
      setPemilik(r)
      if (r && !idPel) onPemilik?.(r)
    }).catch(() => {}), 400)
    return () => { batal = true; clearTimeout(t) }
  }, [value, idPel]) // eslint-disable-line react-hooks/exhaustive-deps
  const beda = pemilik && idPel && pemilik.customer_id !== idPel
  useEffect(() => {
    if (!customer?.zoho_id) { setList([]); return }
    setLoading(true)
    zoho.invoicesOf(customer.zoho_id).then(setList).catch(() => setList([])).finally(() => setLoading(false))
  }, [customer?.zoho_id])

  return (
    <div>
      {!ringkas && <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft"><Receipt className="h-3.5 w-3.5 text-ink-mute" />No. Invoice<span className="text-rose-500" aria-hidden>*</span><span className="ml-auto text-xs font-normal text-ink-mute">dipakai sebagai nama project</span></span>}
      <div className="space-y-2">
      {loading && <p className="flex items-center gap-2 text-xs text-ink-mute"><Loader2 className="h-3 w-3 animate-spin" />Memuat invoice dari Zoho…</p>}
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.map((iv) => (
            <button key={invoiceLabel(iv.invoice_no)} type="button" onClick={() => onChange(iv.invoice_no)}
              title={ringkas ? `${tgl(iv.date)} · ${iv.status}` : `${tgl(iv.date)} · ${rupiah(iv.total)} · ${iv.status}`} aria-pressed={value === iv.invoice_no} className={cx('flex items-center gap-1.5 rounded-lg px-3 py-2 text-left ring-1 transition', value === iv.invoice_no ? 'bg-brand text-white ring-brand' : 'bg-white ring-slate-300 hover:ring-brand')}>
              <span className="text-sm font-semibold">{invoiceLabel(iv.invoice_no)}</span><span className={cx('text-xs', value === iv.invoice_no ? 'text-white/80' : 'text-ink-mute')}>{ringkas ? tgl(iv.date) : rupiah(iv.total)}</span>
              {value === iv.invoice_no && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
      {(!ringkas || !list.length || !list.some((iv) => iv.invoice_no === value)) && <Input aria-invalid={!!error} placeholder={customer ? (ringkas ? 'Ketik no. invoice' : 'atau ketik manual, mis. INV-000245') : 'Pilih pelanggan dulu, atau ketik manual'} value={value} onChange={(e) => onChange(e.target.value)} className={ringkas ? '!h-9' : ''} />}
      {pemilik && !beda && idPel && <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-800" data-pemilik-invoice="cocok"><Check className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="min-w-0 truncate">Invoice milik {pemilik.customer_name || customer?.name}</span></p>}
      {beda && (
        <div role="alert" className="flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 ring-1 ring-amber-200" data-pemilik-invoice="beda">
          <span className="min-w-0 flex-1">Invoice ini milik <b>{pemilik.customer_name || 'pelanggan lain'}</b>, bukan {customer?.name}.</span>
          {onPemilik && <button type="button" onClick={() => onPemilik(pemilik)} className="inline-flex min-h-8 items-center rounded-lg bg-white px-2 font-bold ring-1 ring-amber-300 hover:bg-amber-100 max-md:min-h-11 max-md:px-3">Ganti pelanggan</button>}
        </div>
      )}
      {error && <FieldError>{error}</FieldError>}
      </div>
    </div>
  )
}
