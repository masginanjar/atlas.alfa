// ============================================================
//  PESAN "READY TO PROOF / READY TO OTO" — copy chat WhatsApp.
//  Penerjemah → daftar dokumennya yang sudah menunggu proofreader.
//  Proofreader → daftar dokumennya yang sudah menunggu otorisator;
//  saat disalin, Admin Pusat ikut mendapat notifikasi di ATLAS.
//  Mode ditentukan dari PENUGASAN di dokumen (bukan nama role).
// ============================================================
import { useMemo, useState } from 'react'
import { MessageCircle, Check } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { invoiceLabel } from '../config/access.js'
import { Sheet, cx } from './ui.jsx'

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const tglWita = (iso) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date(iso)) : '')
const labelTgl = (ymd) => (ymd ? `${Number(ymd.slice(8, 10))} ${BULAN[Number(ymd.slice(5, 7)) - 1]}` : 'tanpa deadline')
const namaPendek = (n) => String(n || '').replace(/^\s*(ny|tn|nn|bpk|bapak|ibu|sdr|sdri|mr|mrs|ms)\.?\s+/i, '').trim() || '—'
const cepat = (pr) => (!pr || /^(normal|reguler)$/i.test(pr) ? '' : ` (Speed ${pr})`)
const MODE = {
  proof: { judul: 'Ready to proof', kalimat: 'ready to proof', assignee: 'translator', stage: 'proofread', ket: 'Dokumen Anda yang sudah menunggu proofreader' },
  oto: { judul: 'Ready to oto', kalimat: 'ready to oto', assignee: 'proofreader', stage: 'otorisasi', ket: 'Dokumen Anda yang sudah menunggu otorisator' },
}

/** Project yang punya dokumen milik user di tahap `mode` — satu baris per project. */
export function daftarSiap(projects, uid, mode, semuaOrang) {
  const m = MODE[mode]
  return (projects || []).filter((p) => !p.cancelled && (p.sub_projects || []).some((s) => !s.cancelled && s.stage === m.stage && (semuaOrang || s.data?.[m.assignee] === uid)))
    .map((p) => ({ id: p.id, inv: invoiceLabel(p.invoice_no), nama: namaPendek(p.customer?.name), tgl: tglWita(p.about?.deadline), prio: p.about?.priority || '' }))
    .sort((a, b) => (a.tgl || '9').localeCompare(b.tgl || '9') || a.inv.localeCompare(b.inv))
}
/** Teks WhatsApp: satu blok per tanggal deadline (+ prioritas cepat). */
export function teksSiap(rows, mode) {
  const g = new Map()
  for (const r of rows) { const k = `DL ${labelTgl(r.tgl)}${cepat(r.prio)} ${MODE[mode].kalimat}:`; g.set(k, [...(g.get(k) || []), r]) }
  return [...g.entries()].map(([k, list]) => [k, ...list.map((r) => `✅ ${r.inv} - ${r.nama}`)].join('\n')).join('\n\n')
}
const kunci = (uid, mode) => `atlas-pesan-siap:${uid}:${mode}`
const muat = (uid, mode) => { try { return new Set(JSON.parse(localStorage.getItem(kunci(uid, mode)) || '[]')) } catch { return new Set() } }

export default function PesanSiap({ className }) {
  const { user, data, save, notify } = useApp()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('proof')
  const [pilih, setPilih] = useState(new Set())
  const [sibuk, setSibuk] = useState(false)
  const [ok, setOk] = useState(false)
  // izin `pesan-siap.massal` (Admin Pusat / Super Admin): melihat SEMUA dokumen yang menunggu proofreader / otorisator, bukan hanya miliknya
  const lihatSemua = boleh(user, 'pesan-siap.massal')
  const semua = useMemo(() => ({ proof: daftarSiap(data.projects, user?.id, 'proof', lihatSemua), oto: daftarSiap(data.projects, user?.id, 'oto', lihatSemua) }), [data.projects, user?.id, lihatSemua])
  if (!boleh(user, 'pesan-siap.tambah')) return null
  const modeAda = ['proof', 'oto'].filter((k) => semua[k].length)
  const buka = () => {
    const m = lihatSemua && modeAda.includes('oto') && !open && mode === 'proof' ? 'oto' : modeAda.includes(mode) ? mode : (modeAda[0] || 'proof')
    setMode(m); setPilih(new Set()); setOk(false); setOpen(true) // tidak ada yang tercentang dulu — pengguna menandai sendiri
  }
  const ganti = (m) => { setMode(m); setPilih(new Set()); setOk(false) }
  const rows = semua[mode]
  const sudah = open ? muat(user.id, mode) : new Set()
  const terpilih = rows.filter((r) => pilih.has(r.id))
  const teks = teksSiap(terpilih, mode)
  const salin = async () => {
    if (!terpilih.length || sibuk) return
    setSibuk(true)
    try {
      try { await navigator.clipboard.writeText(teks) } catch {
        const t = document.createElement('textarea'); t.value = teks; t.style.position = 'fixed'; t.style.opacity = '0'
        document.body.appendChild(t); t.select(); try { document.execCommand('copy') } catch { /* abaikan */ } t.remove()
      }
      // Ready to oto → Admin Pusat mendapat notifikasi di ATLAS (hanya untuk dokumen yang belum pernah dilaporkan)
      const baru = terpilih.filter((r) => !sudah.has(r.id))
      let terkirim = false
      if (mode === 'oto' && baru.length && !lihatSemua) {
        try {
          await save('notifications', { to_role: 'admin_pusat', kind: 'task', by: user.name, read_by: [],
            text: `Ready to oto dari ${user.name} — ${[...new Set(baru.map((r) => `DL ${labelTgl(r.tgl)}`))].join(', ')}: ${baru.map((r) => `${r.inv} (${r.nama})`).join(', ')}` })
          terkirim = true
        } catch (e) { notify(`Teks tersalin, tetapi notifikasi ke Admin Pusat gagal: ${e.message}`, 'err') }
      }
      if (mode !== 'oto' || terkirim || !baru.length || lihatSemua) {
        try { localStorage.setItem(kunci(user.id, mode), JSON.stringify([...new Set([...sudah, ...terpilih.map((r) => r.id)])].slice(-400))) } catch { /* abaikan */ }
        notify(mode === 'oto' && terkirim ? 'Teks tersalin — Admin Pusat sudah diberi notifikasi' : 'Teks tersalin — tempel di WhatsApp')
      }
      setOk(true); setTimeout(() => setOk(false), 2000)
    } finally { setSibuk(false) }
  }
  return (
    <>
      <button type="button" onClick={buka} data-aksi="pesan-siap" aria-label="Chat Notifikasi" title="Chat Notifikasi — pesan ready to proof / ready to oto (copy chat WhatsApp)"
        className={cx('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#D9DBE7] bg-white text-[#141B34] transition hover:border-[#B9BDD0] md:h-8 md:w-8 dark:border-white/15 dark:bg-white/5 dark:text-slate-100', className)}>
        <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden="true" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Pesan notifikasi (copy chat)" subtitle={lihatSemua ? `Semua dokumen yang sudah menunggu ${mode === 'oto' ? 'otorisator' : 'proofreader'}` : MODE[mode].ket}
        footer={(
          <div className="flex w-full flex-col gap-2">
            {mode === 'oto' && !lihatSemua && <p className="text-[11px] text-[#5E6380]">Saat disalin, Admin Pusat ikut mendapat notifikasi di ATLAS (sekali per dokumen).</p>}
            <button type="button" onClick={salin} disabled={!terpilih.length || sibuk} data-aksi="salin-pesan-siap"
              className={cx('inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white disabled:cursor-not-allowed', !terpilih.length ? 'bg-[#A9AEC4]' : ok ? 'bg-emerald-600' : 'bg-[#141B34]')}>
              {ok ? <Check className="h-4 w-4" aria-hidden="true" /> : <MessageCircle className="h-4 w-4" aria-hidden="true" />}{sibuk ? 'Menyalin…' : ok ? 'Tersalin' : `Copy chat (${terpilih.length})`}
            </button>
          </div>
        )}>
        <div className="flex flex-col gap-3" data-pesan-siap>
          {modeAda.length > 1 && (
            <div className="flex gap-1.5" role="tablist" aria-label="Jenis pesan">
              {modeAda.map((k) => <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => ganti(k)} className={cx('min-h-11 flex-1 rounded-xl px-3 text-sm font-bold ring-1', mode === k ? 'bg-[#141B34] text-white ring-[#141B34]' : 'bg-white text-[#141B34] ring-[#D9DBE7]')}>{MODE[k].judul} · {semua[k].length}</button>)}
            </div>
          )}
          {!rows.length ? <p className="rounded-xl bg-[#F3F4F9] px-3 py-4 text-sm text-[#5E6380]">Belum ada dokumen{lihatSemua ? '' : ' Anda'} yang menunggu {mode === 'oto' ? 'otorisator' : 'proofreader'}.</p> : (<>
            <div className="flex items-center justify-between gap-2 text-xs text-[#5E6380]">
              <span>Tandai project yang mau dilaporkan</span>
              <button type="button" onClick={() => setPilih(pilih.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))} className="min-h-9 font-semibold text-[#0B5C8A] hover:underline">{pilih.size === rows.length ? 'Kosongkan' : 'Tandai semua'}</button>
            </div>
            <ul className="flex flex-col gap-1.5">
              {rows.map((r) => (
                <li key={r.id}>
                  <label className={cx('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-1.5 ring-1', pilih.has(r.id) ? 'bg-[#EAF7EE] ring-emerald-300' : 'bg-white ring-[#E7E8F0]')}>
                    <input type="checkbox" checked={pilih.has(r.id)} onChange={() => setPilih((v) => { const n = new Set(v); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })} className="h-5 w-5 rounded border-[#B9BDD0] text-emerald-600" />
                    <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-sm font-bold tabular-nums">{r.inv} <span className="font-medium">- {r.nama}</span></span><span className="text-[11px] text-[#5E6380]">DL {labelTgl(r.tgl)}{cepat(r.prio)}{sudah.has(r.id) && ' · sudah pernah dilaporkan'}</span></span>
                  </label>
                </li>
              ))}
            </ul>
            {terpilih.length > 0 && <pre className="whitespace-pre-wrap break-words rounded-xl bg-[#F3F4F9] p-3 font-sans text-[13px] leading-relaxed text-[#141B34]" data-pratinjau-pesan>{teks}</pre>}
          </>)}
        </div>
      </Sheet>
    </>
  )
}
