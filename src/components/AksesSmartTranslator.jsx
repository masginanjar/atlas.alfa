import { useMemo, useState } from 'react'
import { Languages, Search, Lock } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { MODE } from '../lib/db.js'
import { boleh, izinEfektif } from '../lib/izin.js'
import { roleLabel, branchLabel } from '../config/access.js'
import { Card, Input, cx } from './ui.jsx'

// ============================================================
//  PENGATURAN → AKSES SMART TRANSLATOR — pilih pengguna yang boleh memakai Smart Translator.
//  Memakai mesin izin yang sudah ada: pengecualian per pengguna (akses_pengecualian) untuk
//  `smart-translator.menu` + `smart-translator.lihat`. Server memeriksa izin yang sama (app_izin)
//  pada fungsi OCR/AI, jadi tanpa izin ini panggilan API ditolak — bukan sekadar menu disembunyikan.
//  Bawaan: ditolak (hanya Superadmin). Perubahan tercatat di riwayat akses (audit).
// ============================================================
const KODE = ['smart-translator.menu', 'smart-translator.lihat']

export default function AksesSmartTranslator() {
  const { user, data, save, notify } = useApp()
  const bisaUbah = boleh(user, 'pengaturan.role.kelola')
  const [q, setQ] = useState(''); const [saring, setSaring] = useState('semua'); const [sibuk, setSibuk] = useState('')
  const kecuali = data.akses_pengecualian || []
  const aktifKecuali = (u, nilai) => kecuali.filter((k) => k.user_id === u.id && !k.dicabut && KODE.includes(k.kode) && k.nilai === nilai && (!k.sampai || new Date(k.sampai) > new Date()))
  const baris = useMemo(() => (data.users || []).filter((u) => u.active !== false).map((u) => {
    const e = izinEfektif(u, 'smart-translator.lihat')
    return { u, punya: e.boleh, sumber: u.role === 'superadmin' ? 'superadmin' : e.boleh ? (e.sumber === 'pengecualian' ? 'khusus' : 'role') : (e.sumber === 'pengecualian' ? 'dilarang' : 'tidak') }
  }).sort((a, b) => Number(b.punya) - Number(a.punya) || String(a.u.name).localeCompare(String(b.u.name))), [data.users, data.akses_pengecualian, data.akses_role]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!boleh(user, 'pengaturan.role.lihat')) return <Card className="p-5 text-sm text-ink-mute" data-st-akses-tanpa>Tidak ada akses ke pengaturan ini.</Card>
  const tampil = baris.filter((x) => (saring === 'semua' || (saring === 'punya') === x.punya) && (!q || `${x.u.name} ${x.u.email || ''} ${roleLabel(x.u)} ${x.u.branch || ''}`.toLowerCase().includes(q.toLowerCase())))
  const nPunya = baris.filter((x) => x.punya).length

  const audit = async (u, aksi, ringkas) => { if (MODE === 'demo') await save('akses_audit', { at: new Date().toISOString(), oleh: user.name, oleh_id: user.id, jenis: 'pengecualian', target: u.id, target_nama: u.name, aksi, ringkas: [ringkas] }) }
  const ubah = async (x, beri) => {
    if (!bisaUbah || sibuk) return
    if (x.u.id === user.id) return notify('Akses Anda sendiri tidak bisa diubah dari sini', 'err')
    setSibuk(x.u.id)
    try {
      const kini = new Date().toISOString(); const tulis = (nilai, kode) => save('akses_pengecualian', { user_id: x.u.id, kode, nilai, cakupan: nilai === 'izinkan' ? 'sendiri' : undefined, sampai: '', alasan: 'Akses Smart Translator', oleh: user.name, oleh_id: user.id, at: kini })
      const cabut = async (nilai) => { for (const k of aktifKecuali(x.u, nilai)) await save('akses_pengecualian', { id: k.id, dicabut: true, dicabut_at: kini, dicabut_oleh: user.name }) }
      if (beri) {
        await cabut('larang') // buka larangan khusus bila ada
        if (!roleMemberi(x.u) && !aktifKecuali(x.u, 'izinkan').length) for (const k of KODE) await tulis('izinkan', k)
        await audit(x.u, 'tambah', `Izinkan Smart Translator untuk ${x.u.name}`); notify(`${x.u.name} sekarang boleh memakai Smart Translator`)
      } else {
        await cabut('izinkan')
        if (roleMemberi(x.u)) for (const k of KODE) await tulis('larang', k) // role-nya memberi akses → larang khusus orang ini
        await audit(x.u, 'cabut', `Cabut Smart Translator dari ${x.u.name}`); notify(`Akses Smart Translator ${x.u.name} dicabut`)
      }
    } catch (e) { notify(e.message || 'Gagal menyimpan', 'err') } finally { setSibuk('') }
  }
  /** Apakah role pengguna ini (tanpa pengecualian) sudah memberi akses. */
  const roleMemberi = (u) => izinEfektif({ ...u, id: `__role__${u.role}` }, 'smart-translator.lihat').boleh

  const LABEL = { superadmin: ['Superadmin · selalu', 'bg-slate-100 text-slate-700'], role: ['Dari role-nya', 'bg-sky-50 text-sky-700'], khusus: ['Diizinkan khusus', 'bg-emerald-50 text-emerald-700'], dilarang: ['Dilarang khusus', 'bg-rose-50 text-rose-700'], tidak: ['Belum diberi akses', 'bg-slate-50 text-slate-500'] }
  return (
    <div className="space-y-4" data-st-akses>
      <Card className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Languages className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0"><h2 className="font-bold">Akses Smart Translator</h2>
            <p className="text-sm text-ink-mute">Pilih siapa yang boleh memakai Smart Translator. Yang belum diberi akses tidak melihat menunya, tidak bisa membukanya lewat alamat langsung, dan permintaan baca dokumennya ditolak server. Izin ini tidak membuka akses ke berkas pekerjaan lain.</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 md:max-w-sm"><span className="sr-only">Cari pengguna</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden="true" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, role, atau cabang" className="pl-9 max-md:min-h-11 max-md:text-base" data-st-cari /></label>
          <div className="flex gap-1" role="group" aria-label="Saring">{[['semua', `Semua · ${baris.length}`], ['punya', `Punya akses · ${nPunya}`], ['belum', `Belum · ${baris.length - nPunya}`]].map(([k, l]) => <button key={k} type="button" onClick={() => setSaring(k)} aria-pressed={saring === k} className={cx('h-9 rounded-full px-3 text-xs font-semibold ring-1 max-md:h-11', saring === k ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-soft ring-slate-200 hover:ring-brand')}>{l}</button>)}</div>
        </div>
        {!bisaUbah && <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-ink-mute"><Lock className="h-3.5 w-3.5" aria-hidden="true" />Anda hanya bisa melihat. Mengubah akses butuh izin “Role &amp; Hak Akses — Kelola”.</p>}
      </Card>
      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-slate-100" data-st-daftar>
          {tampil.map((x) => { const [lbl, cls] = LABEL[x.sumber]; const kunci = !bisaUbah || x.sumber === 'superadmin' || x.u.id === user.id; return (
            <li key={x.u.id} className="flex items-center gap-3 px-4 py-2.5 max-md:min-h-14" data-st-baris={x.u.id}>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{x.u.name}</p><p className="truncate text-xs text-ink-mute">{roleLabel(x.u) || x.u.role}{x.u.branch ? ` · ${branchLabel(x.u) || x.u.branch}` : ''}</p></div>
              <span className={cx('hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline', cls)}>{lbl}</span>
              <button type="button" role="switch" aria-checked={x.punya} aria-label={`Smart Translator untuk ${x.u.name}`} disabled={kunci || sibuk === x.u.id} onClick={() => ubah(x, !x.punya)} data-st-saklar={x.punya ? 'ya' : 'tidak'}
                className={cx('relative h-7 w-12 shrink-0 rounded-full transition max-md:h-8 max-md:w-14', x.punya ? 'bg-emerald-600' : 'bg-slate-300', kunci && 'cursor-not-allowed opacity-50')}>
                <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all max-md:h-6 max-md:w-6', x.punya ? 'left-6 max-md:left-7' : 'left-1')} />
              </button>
            </li>) })}
          {!tampil.length && <li className="px-4 py-8 text-center text-sm text-ink-mute">Tidak ada pengguna yang cocok.</li>}
        </ul>
      </Card>
      <p className="text-xs text-ink-mute">Perubahan berlaku langsung dan tercatat di Role &amp; Hak Akses → Riwayat. Untuk memberi akses ke satu role sekaligus, atur di Role &amp; Hak Akses.</p>
    </div>
  )
}
