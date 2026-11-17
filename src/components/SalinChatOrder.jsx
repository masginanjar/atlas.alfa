import { useState } from 'react'
import { MessageCircle, Check, Copy } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { invoiceLabel } from '../config/access.js'
import { flowOf } from '../config/workflows.js'
import { REVIEW_URL } from '../lib/portalCust.js'
import { SUB_TYPES, points } from '../config/subtypes.js'
import { boleh } from '../lib/izin.js'
import { cx } from './ui.jsx'
import { portalUrl } from '../lib/portalClient.js'

// ============================================================
//  SALIN CHAT WHATSAPP "ORDER FIX"
//  • ke Vendor        — untuk dokumen yang dikerjakan vendor
//  • ke Tim Apostille — untuk dokumen apostille/legalisasi yang
//    dikerjakan tim sendiri (pengingat di grup WA)
//  Hanya MENYALIN teks ke clipboard: tidak mengirim apa pun dan
//  tidak membuka WhatsApp. HPP / biaya vendor tidak ikut ditulis.
// ============================================================

const tglJam = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  const tgl = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const jam = String(v).length > 10 ? ` pukul ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')}` : ''
  return `${tgl}${jam}`
}
const PROSES = { Normal: 'NORMAL', Ekspres: 'EKSPRESS', 'Super Ekspres': 'SUPER EKSPRESS', Sameday: 'SAMEDAY' }
const jmlDok = (sb) => sb.docs?.length || sb.file_count || 0
const jmlHal = (sb) => (sb.docs?.length ? sb.docs.reduce((a, d) => a + (Number(d.pages) || 0), 0) : Number(sb.pages) || 0)
const barisDok = (sb, i, denganLayanan) => {
  const rinci = [jmlDok(sb) && `${jmlDok(sb)} dok`, jmlHal(sb) && `${jmlHal(sb)} hal`, sb.lang_from && sb.lang_to && `${sb.lang_from} → ${sb.lang_to}`, (sb.country || sb.data?.country) && `tujuan ${sb.country || sb.data?.country}`].filter(Boolean).join(' · ')
  return [`${i + 1}. ${sb.title || SUB_TYPES[sb.type]?.label || 'Dokumen'}`, rinci && `   ${rinci}`, denganLayanan && sb.data?.vendor_service && `   Layanan: ${sb.data.vendor_service}`, denganLayanan && sb.data?.vendor_note && `   Catatan: ${sb.data.vendor_note}`].filter(Boolean).join('\n')
}

/** Nama dokumen untuk chat. Data lama sering hanya berisi nomor ("1", "2") atau kosong → pakai nama file sumbernya (tanpa ekstensi & nomor urut). */
const kosongNama = (t) => !String(t || '').replace(/^\s*\d+\s*[.)\-]?\s*/, '').trim()
const dariFile = (f) => String(f?.name || '').replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/^\s*\d+\s*[.)]\s+/, '').replace(/[_]+/g, ' ').trim()
export function daftarDokChat(sb, denganHal) {
  const hal = (d) => (denganHal && Number(d?.pages) ? ` (${d.pages} hal)` : '')
  const sumber = (Array.isArray(sb.data?.dokumen_sumber_list) && sb.data.dokumen_sumber_list.length ? sb.data.dokumen_sumber_list : sb.data?.dokumen_sumber ? [sb.data.dokumen_sumber] : []).map(dariFile).filter(Boolean)
  const docs = Array.isArray(sb.docs) ? sb.docs : []
  if (docs.length) {
    const sejajar = sumber.length === docs.length
    if (docs.every((d) => kosongNama(d.desc)) && sumber.length && !sejajar) return sumber
    const isi = docs.map((d, i) => { const n = kosongNama(d.desc) ? (sejajar ? sumber[i] : '') : String(d.desc).trim(); return n ? `${n}${hal(d)}` : '' }).filter(Boolean)
    if (isi.length) return isi
  }
  const pts = points(sb.description).filter((x) => !kosongNama(x))
  return pts.length ? pts : sumber.length ? sumber : [sb.title || 'Dokumen']
}

/**
 * Teks "FIX ORDER" untuk penerjemah — vendor luar maupun penerjemah internal. Format sama dengan grup WA tim.
 * Tanpa biaya. Bila vendor punya tautan portal aktif, tautannya ikut ditulis (unduh sumber & unggah hasil di sana).
 */
export function teksOrderVendor(p, subs, nama, { sapaan = '', namaCs = '', portal = '' } = {}) {
  const bahasa = [...new Set(subs.map((sb) => (sb.lang_from && sb.lang_to ? `${sb.lang_from} → ${sb.lang_to}` : '')).filter(Boolean))]
  const jenis = [...new Set(subs.map((sb) => SUB_TYPES[sb.type]?.label || 'Terjemahan'))]
  const dok = subs.flatMap((sb) => daftarDokChat(sb, true))
  const prio = PROSES[p.about?.priority] || String(p.about?.priority || 'NORMAL').toUpperCase()
  return [
    'FIX ORDER TERJEMAHAN \u2705',
    `${invoiceLabel(p.invoice_no)} ${p.customer?.name || ''}`.trim(),
    '',
    `Kepada : ${/^(bapak|ibu|pak|bu|mr|mrs|ms)\b/i.test(String(nama).trim()) ? '' : `${sapaan || 'Bapak/Ibu'} `}${nama}`,
    `Deadline : ${tglJam(p.about?.deadline)}`,
    `CS : ${namaCs || ''}`,
    '',
    ...(bahasa.length ? [`Bahasa   : ${bahasa.join(', ')}`] : []),
    `Proses   : ${jenis.join(' & ')} ${prio}`,
    '',
    `Dokumen (${dok.length})`,
    ...dok.map((d, k) => `${k + 1}. ${d}`),
    ...(portal ? ['', 'Unduh sumber & unggah hasil di portal:', portal] : []),
  ].join('\n')
}
/**
 * Teks "FIX ORDER" untuk tim Apostille / Legalisasi — format grup WA yang dipakai tim.
 * "SUPORTING SPESIMEN" belum ada datanya di ATLAS → dibiarkan kosong untuk diisi CS saat menempel.
 */
export function teksOrderApostille(p, subs, namaCs, people = []) {
  const ap = subs.some((sb) => sb.type === 'apostille'); const lg = subs.some((sb) => sb.type === 'legalisasi')
  const jenis = ap && lg ? 'APOSTILLE & LEGALISASI' : lg ? 'LEGALISASI' : 'APOSTILLE'
  const unik = (arr) => [...new Set(arr.map((x) => String(x || '').trim()).filter(Boolean))]
  const negara = unik(subs.map((sb) => sb.country || sb.data?.country)).map((x) => x.toUpperCase())
  const lembaga = unik(subs.map((sb) => (people.find((x) => x.id === sb.institution)?.name) || ''))
  const dok = subs.flatMap((sb) => daftarDokChat(sb, false))
  const prio = PROSES[p.about?.priority] || String(p.about?.priority || 'NORMAL').toUpperCase()
  return [
    `FIX ORDER ${jenis} \u2705`,
    `${invoiceLabel(p.invoice_no)} ${p.customer?.name || ''}`.trim(),
    '',
    `Deadline : ${tglJam(p.about?.deadline)}`,
    `CS : ${namaCs || ''}`,
    '',
    'SUPORTING SPESIMEN',
    '1. ',
    '',
    ...(negara.length ? [`Negara Tujuan  : ${negara.join(', ')}`] : []),
    ...(lembaga.length ? [`Lembaga            : ${lembaga.join(', ')}`] : []),
    `Proses                : ${ap && lg ? 'Apostille & Legalisasi' : lg ? 'Legalisasi' : 'Apostille'} ${prio}`,
    '',
    `Dokumen (${dok.length})`,
    ...dok.map((d, i) => `${i + 1}. ${d}`),
  ].join('\n')
}

// ---------- Chat ke PELANGGAN: Draft · Selesai · Review ----------
const ZONA_WITA = ['Bali', 'Makassar']
const jamDi = (d, tz) => new Intl.DateTimeFormat('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(':', '.')
/** Batas konfirmasi draft: 3 jam setelah teks disalin, paling lambat 17.00 WITA — ditulis dalam zona waktu cabang project. */
export function batasDraft(cabang, now = new Date()) {
  const tglWita = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(now)
  const tutup = new Date(`${tglWita}T17:00:00+08:00`)
  const batas = new Date(Math.min(now.getTime() + 3 * 3600e3, tutup.getTime()))
  const wita = ZONA_WITA.includes(cabang)
  return `${jamDi(batas, wita ? 'Asia/Makassar' : 'Asia/Jakarta')} ${wita ? 'WITA' : 'WIB'}`
}
const salamWaktu = (cabang, now = new Date()) => { const j = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_WITA.includes(cabang) ? 'Asia/Makassar' : 'Asia/Jakarta', hour: '2-digit', hour12: false }).format(now)); return j < 11 ? 'pagi' : j < 15 ? 'siang' : j < 18 ? 'sore' : 'malam' }
/** Sapaan pelanggan dari awalan namanya: Tn./Bpk → Bapak, Ny./Nn./Ibu → Ibu, selain itu Bapak/Ibu. */
export const sapaanPelanggan = (nama) => (/^\s*(tn|bpk|bapak|mr)\b\.?/i.test(nama || '') ? 'Bapak' : /^\s*(ny|nn|ibu|mrs|ms|miss)\b\.?/i.test(nama || '') ? 'Ibu' : 'Bapak/Ibu')
/** Daftar dokumen per layanan untuk chat pelanggan. `hanyaTerjemahan` = untuk Draft (yang dikonfirmasi hanya hasil terjemahan). */
export function rincianPelanggan(p, hanyaTerjemahan) {
  const subs = (p.sub_projects || []).filter((sb) => !sb.cancelled && (!hanyaTerjemahan || ['terjemahan', 'terjemahan_nt'].includes(sb.type)))
  const pakai = subs.length ? subs : (p.sub_projects || []).filter((sb) => !sb.cancelled)
  const out = []
  for (const sb of pakai) {
    const jenis = SUB_TYPES[sb.type]?.label || 'Layanan'
    const ket = sb.lang_from && sb.lang_to ? ` ${sb.lang_from} → ${sb.lang_to}` : (sb.country || sb.data?.country) ? ` — tujuan ${sb.country || sb.data?.country}` : ''
    out.push(`*${jenis}${ket}*`, ...daftarDokChat(sb, false).map((d, i) => `${i + 1}. ${d}`), '')
  }
  if (out[out.length - 1] === '') out.pop()
  return out
}
const kepalaPelanggan = (p) => [`🧾 *${invoiceLabel(p.invoice_no)} - ${p.customer?.name || ''}*`.replace(' - *', '*')]
export const teksDraftPelanggan = (p, now = new Date()) => { const S = sapaanPelanggan(p.customer?.name); return [
  `Selamat ${salamWaktu(p.branch, now)} ${S} 😊🙏🏻`,
  '',
  ...kepalaPelanggan(p),
  '',
  '📄 Berikut kami kirimkan *draft hasil terjemahannya*:',
  ...rincianPelanggan(p, true),
  '',
  '🔎 Mohon dibantu *konfirmasi kesesuaian* untuk bagian:',
  '• *nama-nama*',
  '• *angka-angka*',
  '',
  '✅ Jika sudah sesuai, dokumen akan kami *proses cetak untuk distempel dan ditandatangani oleh penerjemah tersumpah*.',
  '',
  '✏️ *Jika masih ada yang perlu direvisi, mohon diinfokan ke kami.*',
  'Bisa ditandai di draft yang kami kirimkan, atau dituliskan kata/kalimat yang harus direvisi.',
  '',
  '⚠️ *Catatan:* kami *tidak bisa mengganti/menambahkan kata dan kalimat* di hasil terjemahan yang *tidak ada di dalam dokumen sumber* 🙏🏻',
  '',
  `⏰ *Maksimal konfirmasi draft: pukul ${batasDraft(p.branch, now)}*`,
  `Jika lebih dari jam tersebut, akan kami cetak keesokan harinya ya ${S} 🙏🏻😊`,
].join('\n') }
export const teksSelesaiPelanggan = (p) => { const S = sapaanPelanggan(p?.customer?.name); return [
  '✅ *DOKUMEN TELAH SELESAI* 🎉',
  '',
  `Halo ${S} 😊`,
  'Kami ingin memberitahukan bahwa *dokumen sudah selesai*.',
  '',
  ...(p ? [...kepalaPelanggan(p), '', '📑 Dokumen yang diproses:', ...rincianPelanggan(p, false), ''] : []),
  `🔎 Mohon diperiksa kembali dan pastikan dokumen tersebut *akurat serta sesuai dengan kebutuhan ${S}*.`,
  '',
  `✏️ Jika menemukan kesalahan atau ada hal yang ingin dikoreksi, silakan *segera hubungi kami* ya ${S}.`,
  '',
  `📦 _Dokumen yang lebih dari 2 bulan tidak diambil akan masuk arsip kantor kami ya ${S}._`,
  '',
  'Terima kasih atas kerja samanya 🙏🏻',
  '',
  '*Salam hangat,*',
  '*247 Sworn Translator*',
].join('\n') }
export const teksReviewPelanggan = (p) => { const S = sapaanPelanggan(p?.customer?.name); return [
  `Halo ${S} 😊🙏🏻`,
  '',
  'Terima kasih sudah mempercayakan dokumennya kepada *247 Sworn Translator*.',
  '',
  `⭐ Jika berkenan, mohon bantu berikan *review* di Google Maps kami ya ${S}:`,
  REVIEW_URL,
  '',
  `Ulasan ${S} sangat berarti untuk kami 🙏🏻✨`,
  '',
  '*Salam hangat,*',
  '*247 Sworn Translator*',
].join('\n') }

async function salin(teks) {
  try { await navigator.clipboard.writeText(teks) } catch {
    const t = document.createElement('textarea'); t.value = teks; t.style.position = 'fixed'; t.style.opacity = '0'
    document.body.appendChild(t); t.select(); try { document.execCommand('copy') } catch { /* abaikan */ } t.remove()
  }
}

// Penanda "sudah diklik" — disimpan di perangkat ini (tidak mengubah data project), supaya tombol berubah warna & ada jamnya.
const KUNCI_SUDAH = 'atlas-chat-sudah'
const muatSudah = () => { try { return JSON.parse(localStorage.getItem(KUNCI_SUDAH) || '{}') || {} } catch { return {} } }
const tandaiSudah = (k) => { if (!k) return ''; const at = new Date().toISOString(); try { const m = muatSudah(); m[k] = at; const e = Object.entries(m).sort((a, b) => (a[1] < b[1] ? 1 : -1)).slice(0, 600); localStorage.setItem(KUNCI_SUDAH, JSON.stringify(Object.fromEntries(e))) } catch { /* abaikan */ } return at }
const jamSudah = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')}` }

function Tombol({ label, teks, jenis, judul, kunci }) {
  const { notify } = useApp()
  const [ok, setOk] = useState(false)
  const [sudah, setSudah] = useState(() => (kunci ? muatSudah()[kunci] || '' : ''))
  return (
    <button type="button" data-salin-chat={jenis} title={`${judul || 'Salin teks pesan WhatsApp — tinggal tempel di chat'}${sudah ? ` · sudah disalin ${jamSudah(sudah)} (di perangkat ini)` : ''}`} aria-label={judul ? `${judul}${sudah ? ' (sudah disalin)' : ''}` : undefined} data-sudah={sudah ? '1' : undefined}
      onClick={async (e) => { e.stopPropagation(); await salin(typeof teks === 'function' ? teks() : teks); setOk(true); if (kunci) setSudah(tandaiSudah(kunci)); notify?.('Teks pesan tersalin — tempel di WhatsApp'); setTimeout(() => setOk(false), 1800) }}
      className={cx('inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold ring-1 transition max-md:h-11 max-md:px-3',
        ok ? 'bg-emerald-600 text-white ring-emerald-600' : sudah ? 'bg-[#DFF1FB] text-[#0B5C8A] ring-[#9CCFEA] hover:ring-[#0B5C8A]' : 'bg-white text-[#141B34] ring-[#D9DBE7] hover:ring-[#141B34]')}>
      {ok || sudah ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5 text-[#5E6380]" aria-hidden="true" />}
      {ok ? 'Tersalin' : label}
      <span className="sr-only" aria-live="polite">{ok ? 'Teks pesan tersalin' : ''}</span>
    </button>
  )
}

export const nomorWa = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.startsWith('0') ? `62${d.slice(1)}` : d }
/** Tautan WhatsApp berisi teks Fix Order — hanya MEMBUKA WhatsApp; pesan baru terkirim setelah pengguna menekan kirim. Tanpa nomor → pengguna memilih kontaknya sendiri. */
export const tautanWa = (telp, teks) => `https://wa.me/${nomorWa(telp)}?text=${encodeURIComponent(teks)}`
export function TombolWa({ telp, teks, label = 'WhatsApp Fix Order', disabled, className, ikon, kunci }) {
  const [sudah, setSudah] = useState(() => (kunci ? muatSudah()[kunci] || '' : ''))
  return (
    <a href={disabled ? undefined : tautanWa(telp, teks)} target="_blank" rel="noreferrer" aria-disabled={disabled || undefined} aria-label={ikon ? label : undefined} data-wa-fix-order data-sudah={sudah ? '1' : undefined} onClick={(e) => { e.stopPropagation(); if (disabled) { e.preventDefault(); return } if (kunci) setSudah(tandaiSudah(kunci)) }}
      title={`${ikon ? `${label} — ` : ''}${nomorWa(telp) ? 'buka WhatsApp ke nomor ini, teks sudah terisi' : 'buka WhatsApp, pilih kontaknya, teks sudah terisi'}${sudah ? ` · sudah dibuka ${jamSudah(sudah)} (di perangkat ini)` : ''}`}
      className={cx(ikon ? 'inline-grid h-8 w-8 place-items-center rounded-lg text-white transition max-md:h-11 max-md:w-11' : 'inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white transition max-md:min-h-11', disabled ? 'cursor-not-allowed bg-[#A9AEC4]' : sudah ? 'bg-[#0B5C8A] hover:bg-[#094a70]' : 'bg-emerald-600 hover:bg-emerald-700', className)}>
      {sudah && ikon ? <Check className="h-4 w-4" aria-hidden="true" /> : <MessageCircle className="h-4 w-4" aria-hidden="true" />}{!ikon && label}
    </a>
  )
}

/** Deretan tombol salin chat untuk satu project — muncul hanya bila ada dokumen vendor / apostille tim. */
export default function SalinChatOrder({ project: p, className }) {
  const { user, data, nameOf } = useApp()
  const subs = p.sub_projects || []
  // dokumen yang dikerjakan vendor, dikelompokkan per vendor
  const perVendor = new Map()
  for (const sb of subs) {
    const id = sb.data?.vendor || (sb.translator_kind === 'vendor' ? sb.translator : '')
    if (id) perVendor.set(id, [...(perVendor.get(id) || []), sb])
  }
  const apostille = subs.filter((sb) => ['ap_int', 'lg_int'].includes(flowOf(sb, p)))
  const vendorBoleh = boleh(user, 'pengajuan.lihat') || boleh(user, 'vendor-order.tambah')
  const apostilleBoleh = boleh(user, 'dokumen-al.lihat')
  const namaVendor = (id) => (data.people || []).find((x) => x.id === id)?.name || nameOf?.(id) || 'Vendor'
  const namaCs = nameOf?.(p.about?.cs_id || p.created_by) || p.about?.cs_name || ''
  // penerjemah internal yang sudah ditetapkan, dikelompokkan per orang
  const perPenerjemah = new Map()
  for (const sb of subs) {
    const id = sb.data?.translator || (sb.translator && sb.translator_kind !== 'vendor' ? sb.translator : '')
    if (id && !sb.data?.vendor) perPenerjemah.set(id, [...(perPenerjemah.get(id) || []), sb])
  }
  const vendorRec = (id) => (data.people || []).find((x) => x.id === id)
  const tautanPortal = (id) => { const l = (data.share_links || []).find((x) => x.kind === 'vendor' && x.vendor_id === id && !x.revoked_at && (!x.expires_at || new Date(x.expires_at) > new Date())); return l ? portalUrl(l.token) : '' }
  // Ringkas: satu baris "Fix Order:" (nama tujuan = salin teks, ikon hijau = buka WhatsApp) + "Pelanggan:" Draft · Selesai · Review
  const pendek = (n) => String(n || '').replace(/\s*\(.*\)\s*$/, '').split(/\s+/).slice(0, 2).join(' ')
  const pasangan = (key, jenis, nama, telp, teks) => (
    <span key={key} className="inline-flex items-center gap-1">
      <Tombol jenis={jenis} label={pendek(nama)} judul={`Salin chat Fix Order ke ${nama}`} teks={teks} kunci={`${p.id}:salin:${key}`} />
      <TombolWa ikon telp={telp} label={`WhatsApp Fix Order ke ${nama}`} teks={teks} kunci={`${p.id}:wa:${key}`} />
    </span>
  )
  const tombol = [
    ...(vendorBoleh ? [...perVendor.entries()].map(([id, list]) => pasangan(id, 'vendor', namaVendor(id), vendorRec(id)?.phone, teksOrderVendor(p, list, namaVendor(id), { sapaan: vendorRec(id)?.sapaan, namaCs, portal: tautanPortal(id) }))) : []),
    ...(boleh(user, 'project.tugaskan') || vendorBoleh ? [...perPenerjemah.entries()].map(([id, list]) => pasangan(`tr-${id}`, 'penerjemah', nameOf?.(id) || 'Penerjemah', (data.users || []).find((u) => u.id === id)?.phone, teksOrderVendor(p, list, nameOf?.(id) || 'Penerjemah', { namaCs }))) : []),
    ...(apostilleBoleh && apostille.length ? [<Tombol key="ap" jenis="apostille" label="Apostille" kunci={`${p.id}:salin:apostille`} judul="Salin chat Order Fix ke Tim Apostille" teks={teksOrderApostille(p, apostille, namaCs, data.people || [])} />] : []),
  ]
  const pelanggan = boleh(user, 'chat-pelanggan.lihat') ? [
    <span key="pl-label" className="text-[11px] font-semibold text-[#5E6380]">Pelanggan:</span>,
    <Tombol key="pl-draft" jenis="pelanggan-draft" label="Draft" kunci={`${p.id}:pelanggan:draft`} judul="Salin chat Draft untuk pelanggan" teks={() => teksDraftPelanggan(p)} />,
    <Tombol key="pl-selesai" jenis="pelanggan-selesai" label="Selesai" kunci={`${p.id}:pelanggan:selesai`} judul="Salin chat Selesai untuk pelanggan" teks={() => teksSelesaiPelanggan(p)} />,
    <Tombol key="pl-review" jenis="pelanggan-review" label="Review" kunci={`${p.id}:pelanggan:review`} judul="Salin chat Review untuk pelanggan" teks={() => teksReviewPelanggan(p)} />,
  ] : []
  if (!tombol.length && !pelanggan.length) return null
  return (
    <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-1.5', className)} data-salin-chat-order>
      {tombol.length > 0 && <span className="flex flex-wrap items-center gap-1.5"><span className="text-[11px] font-semibold text-[#5E6380]">Fix Order:</span>{tombol}</span>}
      {pelanggan.length > 0 && <span className="flex flex-wrap items-center gap-1.5" data-salin-chat-pelanggan>{pelanggan}</span>}
    </div>
  )
}
