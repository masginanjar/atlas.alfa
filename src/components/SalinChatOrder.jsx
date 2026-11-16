import { useState } from 'react'
import { MessageCircle, Check } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { invoiceLabel } from '../config/access.js'
import { flowOf } from '../config/workflows.js'
import { SUB_TYPES } from '../config/subtypes.js'
import { boleh } from '../lib/izin.js'
import { cx } from './ui.jsx'

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
const jmlDok = (sb) => sb.docs?.length || sb.file_count || 0
const jmlHal = (sb) => (sb.docs?.length ? sb.docs.reduce((a, d) => a + (Number(d.pages) || 0), 0) : Number(sb.pages) || 0)
const barisDok = (sb, i, denganLayanan) => {
  const rinci = [jmlDok(sb) && `${jmlDok(sb)} dok`, jmlHal(sb) && `${jmlHal(sb)} hal`, sb.lang_from && sb.lang_to && `${sb.lang_from} → ${sb.lang_to}`, (sb.country || sb.data?.country) && `tujuan ${sb.country || sb.data?.country}`].filter(Boolean).join(' · ')
  return [`${i + 1}. ${sb.title || SUB_TYPES[sb.type]?.label || 'Dokumen'}`, rinci && `   ${rinci}`, denganLayanan && sb.data?.vendor_service && `   Layanan: ${sb.data.vendor_service}`, denganLayanan && sb.data?.vendor_note && `   Catatan: ${sb.data.vendor_note}`].filter(Boolean).join('\n')
}

/** Teks order untuk satu vendor (tanpa biaya). */
export function teksOrderVendor(p, subs, namaVendor) {
  return [
    '*ORDER FIX — 247 Sworn Translator*',
    `Kepada: ${namaVendor}`,
    `No. Invoice: ${invoiceLabel(p.invoice_no)}`,
    `Prioritas: ${p.about?.priority || 'Normal'}`,
    `Deadline: ${tglJam(p.about?.deadline)}`,
    '',
    `Dokumen (${subs.length}):`,
    ...subs.map((sb, i) => barisDok(sb, i, true)),
    '',
    'Mohon konfirmasi order ini dan kabari bila ada kendala. Terima kasih.',
  ].join('\n')
}
/** Teks pengingat untuk tim Apostille / Legalisasi. */
export function teksOrderApostille(p, subs, namaCs) {
  return [
    '*ORDER FIX — APOSTILLE / LEGALISASI*',
    `No. Invoice: ${invoiceLabel(p.invoice_no)}`,
    `Pelanggan: ${p.customer?.name || '—'}`,
    `Cabang: ${p.branch || '—'}${namaCs ? ` · CS ${namaCs}` : ''}`,
    `Prioritas: ${p.about?.priority || 'Normal'}`,
    `Deadline: ${tglJam(p.about?.deadline)}`,
    '',
    `Dokumen (${subs.length}):`,
    ...subs.map((sb, i) => barisDok(sb, i, false)),
    ...(p.about?.notes ? ['', `Catatan: ${p.about.notes}`] : []),
    '',
    'Mohon diproses ya. Terima kasih.',
  ].join('\n')
}

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
      onClick={async (e) => { e.stopPropagation(); await salin(teks); setOk(true); notify?.('Teks pesan tersalin — tempel di WhatsApp'); setTimeout(() => setOk(false), 1800) }}
      className={cx('inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold ring-1 transition max-md:min-h-11',
        ok ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-[#141B34] ring-[#D9DBE7] hover:ring-[#141B34]')}>
      {ok ? <Check className="h-4 w-4" aria-hidden="true" /> : <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
      {ok ? 'Tersalin' : label}
      <span className="sr-only" aria-live="polite">{ok ? 'Teks pesan tersalin' : ''}</span>
    </button>
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
  const vendorBoleh = boleh(user, 'pengajuan.lihat')
  const apostilleBoleh = boleh(user, 'dokumen-al.lihat')
  const namaVendor = (id) => (data.people || []).find((x) => x.id === id)?.name || nameOf?.(id) || 'Vendor'
  const namaCs = nameOf?.(p.about?.cs_id || p.created_by) || ''
  const tombol = [
    ...(vendorBoleh ? [...perVendor.entries()].map(([id, list]) => <Tombol key={id} jenis="vendor" label={`Copy chat: Order Fix ke ${perVendor.size > 1 ? namaVendor(id) : 'Vendor'}`} teks={teksOrderVendor(p, list, namaVendor(id))} />) : []),
    ...(apostilleBoleh && apostille.length ? [<Tombol key="ap" jenis="apostille" label="Copy chat: Order Fix ke Tim Apostille" teks={teksOrderApostille(p, apostille, namaCs)} />] : []),
  ]
  if (!tombol.length) return null
  return <div className={cx('flex flex-wrap items-center gap-2', className)} data-salin-chat-order>{tombol}</div>
}
