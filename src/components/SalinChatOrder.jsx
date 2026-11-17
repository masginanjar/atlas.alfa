import { useState } from 'react'
import { MessageCircle, Check } from 'lucide-react'
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
export const teksDraftPelanggan = (p, now = new Date()) => [
  `Selamat ${salamWaktu(p.branch, now)} kak 😊🙏🏻`,
  '',
  '📄 Berikut kami kirimkan *draft hasil terjemahannya*.',
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
  'Jika lebih dari jam tersebut, akan kami cetak keesokan harinya ya kak 🙏🏻😊',
].join('\n')
export const teksSelesaiPelanggan = () => [
  '✅ *DOKUMEN TELAH SELESAI* 🎉',
  '',
  'Halo kak 😊',
  'Kami ingin memberitahukan bahwa *dokumen sudah selesai*.',
  '',
  '🔎 Mohon diperiksa kembali dan pastikan dokumen tersebut *akurat serta sesuai dengan kebutuhan kakak*.',
  '',
  '✏️ Jika menemukan kesalahan atau ada hal yang ingin dikoreksi, silakan *segera hubungi kami* ya kak.',
  '',
  '📦 _Dokumen yang lebih dari 2 bulan tidak diambil akan masuk arsip kantor kami ya kak._',
  '',
  'Terima kasih atas kerja samanya 🙏🏻',
  '',
  '*Salam hangat,*',
  '*247 Sworn Translator*',
].join('\n')
export const teksReviewPelanggan = () => [
  'Halo kak 😊🙏🏻',
  '',
  'Terima kasih sudah mempercayakan dokumennya kepada *247 Sworn Translator*.',
  '',
  '⭐ Jika berkenan, mohon bantu berikan *review* di Google Maps kami ya kak:',
  REVIEW_URL,
  '',
  'Ulasan kakak sangat berarti untuk kami 🙏🏻✨',
  '',
  '*Salam hangat,*',
  '*247 Sworn Translator*',
].join('\n')

async function salin(teks) {
  try { await navigator.clipboard.writeText(teks) } catch {
    const t = document.createElement('textarea'); t.value = teks; t.style.position = 'fixed'; t.style.opacity = '0'
    document.body.appendChild(t); t.select(); try { document.execCommand('copy') } catch { /* abaikan */ } t.remove()
  }
}

function Tombol({ label, teks, jenis }) {
  const { notify } = useApp()
  const [ok, setOk] = useState(false)
  return (
    <button type="button" data-salin-chat={jenis} title="Salin teks pesan WhatsApp — tinggal tempel di chat"
      onClick={async (e) => { e.stopPropagation(); await salin(typeof teks === 'function' ? teks() : teks); setOk(true); notify?.('Teks pesan tersalin — tempel di WhatsApp'); setTimeout(() => setOk(false), 1800) }}
      className={cx('inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold ring-1 transition max-md:min-h-11',
        ok ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-[#141B34] ring-[#D9DBE7] hover:ring-[#141B34]')}>
      {ok ? <Check className="h-4 w-4" aria-hidden="true" /> : <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
      {ok ? 'Tersalin' : label}
      <span className="sr-only" aria-live="polite">{ok ? 'Teks pesan tersalin' : ''}</span>
    </button>
  )
}

export const nomorWa = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.startsWith('0') ? `62${d.slice(1)}` : d }
/** Tautan WhatsApp berisi teks Fix Order — hanya MEMBUKA WhatsApp; pesan baru terkirim setelah pengguna menekan kirim. Tanpa nomor → pengguna memilih kontaknya sendiri. */
export const tautanWa = (telp, teks) => `https://wa.me/${nomorWa(telp)}?text=${encodeURIComponent(teks)}`
export function TombolWa({ telp, teks, label = 'WhatsApp Fix Order', disabled, className }) {
  return (
    <a href={disabled ? undefined : tautanWa(telp, teks)} target="_blank" rel="noreferrer" aria-disabled={disabled || undefined} data-wa-fix-order onClick={(e) => { e.stopPropagation(); if (disabled) e.preventDefault() }}
      title={nomorWa(telp) ? 'Buka WhatsApp ke nomor ini — teks Fix Order sudah terisi' : 'Buka WhatsApp — pilih kontaknya, teks Fix Order sudah terisi'}
      className={cx('inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white transition max-md:min-h-11', disabled ? 'cursor-not-allowed bg-[#A9AEC4]' : 'bg-emerald-600 hover:bg-emerald-700', className)}>
      <MessageCircle className="h-4 w-4" aria-hidden="true" />{label}
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
  const tombol = [
    ...(vendorBoleh ? [...perVendor.entries()].map(([id, list]) => <Tombol key={id} jenis="vendor" label={`Copy chat: Fix Order ke ${perVendor.size > 1 ? namaVendor(id) : 'Penerjemah (vendor)'}`} teks={teksOrderVendor(p, list, namaVendor(id), { sapaan: vendorRec(id)?.sapaan, namaCs, portal: tautanPortal(id) })} />).concat([...perVendor.entries()].map(([id, list]) => <TombolWa key={`wa-${id}`} telp={vendorRec(id)?.phone} label={`WhatsApp Fix Order${perVendor.size > 1 ? ` · ${namaVendor(id)}` : ''}`} teks={teksOrderVendor(p, list, namaVendor(id), { sapaan: vendorRec(id)?.sapaan, namaCs, portal: tautanPortal(id) })} />)) : []),
    ...(boleh(user, 'project.tugaskan') || vendorBoleh ? [...perPenerjemah.entries()].map(([id, list]) => <Tombol key={`tr-${id}`} jenis="penerjemah" label={`Copy chat: Fix Order ke ${nameOf?.(id) || 'Penerjemah'}`} teks={teksOrderVendor(p, list, nameOf?.(id) || 'Penerjemah', { namaCs })} />).concat([...perPenerjemah.entries()].map(([id, list]) => <TombolWa key={`wa-tr-${id}`} telp={(data.users || []).find((u) => u.id === id)?.phone} label={`WhatsApp Fix Order${perPenerjemah.size > 1 ? ` · ${nameOf?.(id) || ''}` : ''}`} teks={teksOrderVendor(p, list, nameOf?.(id) || 'Penerjemah', { namaCs })} />)) : []),
    ...(apostilleBoleh && apostille.length ? [<Tombol key="ap" jenis="apostille" label="Copy chat: Order Fix ke Tim Apostille" teks={teksOrderApostille(p, apostille, namaCs, data.people || [])} />] : []),
  ]
  const pelanggan = boleh(user, 'chat-pelanggan.lihat') ? [
    <span key="pl-label" className="text-xs font-semibold text-[#5E6380]">Chat pelanggan:</span>,
    <Tombol key="pl-draft" jenis="pelanggan-draft" label="Draft" teks={() => teksDraftPelanggan(p)} />,
    <Tombol key="pl-selesai" jenis="pelanggan-selesai" label="Selesai" teks={teksSelesaiPelanggan} />,
    <Tombol key="pl-review" jenis="pelanggan-review" label="Review" teks={teksReviewPelanggan} />,
  ] : []
  if (!tombol.length && !pelanggan.length) return null
  return <div className={cx('flex flex-wrap items-center gap-2', className)} data-salin-chat-order>{tombol}{pelanggan.length > 0 && <span className="flex flex-wrap items-center gap-2" data-salin-chat-pelanggan>{pelanggan}</span>}</div>
}
