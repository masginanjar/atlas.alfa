// Pengaturan → Role & Hak Akses.
// Tab: Daftar Role · Pengaturan Izin · Pengguna · Simulasi Akses · Riwayat Perubahan.
// Desktop: matriks/tabel. HP: kartu & accordion (tanpa geser samping), tombol Simpan sticky di atas bar bawah.
import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, Search, Plus, Copy, Power, Trash2, ChevronDown, Users, Eye, History, KeyRound, AlertTriangle, Lock, X, Info } from 'lucide-react'
import { useApp } from '../../lib/store.jsx'
import { MODE } from '../../lib/db.js'
import { Button, Empty, Input, Select, Sheet, Tabs, Textarea, cx } from '../ui.jsx'
import { BRANCHES, roleLabel, rolesOf } from '../../config/access.js'
import { MODUL, FITUR, FIELD, AKSI, CAKUPAN, TINGKAT_FIELD, PRESET, terapkanPreset, pisahKode, KODE_INTI, AKSI_SENSITIF, SEMUA_KODE } from '../../config/izin.js'
import { izinEfektif, aksesField, boleh } from '../../lib/izin.js'
import { semuaRoleLengkap, slugKode, penggunaRole, superadminAktif, bolehKelola, bolehBeri, selisih, validasiSimpan, konfigBaru, kembalikanAsal, ROLE_SISTEM } from '../../lib/aksesKelola.js'

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-')
const salin = (x) => JSON.parse(JSON.stringify(x ?? {}))

/** Catat audit. Di live, trigger database juga mencatat (sumber kebenaran); di demo hanya dari sini. */
/** Simpan konfigurasi role: perbarui baris yang ada (dicari lewat kode), atau buat baru. */
async function simpanRole(save, data, doc) {
  const ada = (data.akses_role || []).find((r) => r.kode === doc.kode)
  const { id: _abaikan, ...isi } = doc
  return save('akses_role', ada ? { ...isi, id: ada.id } : isi)
}
async function catatAudit(save, user, rec) {
  if (MODE !== 'demo') return
  await save('akses_audit', { at: new Date().toISOString(), oleh: user.name, oleh_id: user.id, ...rec })
}

export default function AksesRole() {
  const { user } = useApp()
  const [tab, setTab] = useState('role')
  const [roleAktif, setRoleAktif] = useState(null)
  if (!boleh(user, 'pengaturan.role.lihat')) return <Empty icon={Lock} title="Tidak ada akses" text="Hanya pengelola role yang dapat membuka pengaturan ini." />
  const buka = (kode) => { setRoleAktif(kode); setTab('izin') }
  return (
    <div className="space-y-3" data-akses-role>
      <div className="flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-[12px] text-sky-900 ring-1 ring-sky-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Akses ditolak kecuali diberikan (default deny). <b>Tampilkan menu</b> hanya mengatur tampil-tidaknya menu; hak membuka data diatur terpisah. Izin dihitung untuk <b>role yang sedang aktif</b> — izin antar-role tidak digabung. Perubahan berlaku langsung tanpa login ulang.</p>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'role', label: 'Daftar Role' }, { value: 'izin', label: 'Pengaturan Izin' }, { value: 'pengguna', label: 'Pengguna' },
        { value: 'simulasi', label: 'Simulasi Akses' }, boleh(user, 'pengaturan.role.riwayat') && { value: 'riwayat', label: 'Riwayat Perubahan' },
      ].filter(Boolean)} />
      {tab === 'role' && <DaftarRole onAtur={buka} />}
      {tab === 'izin' && <EditorIzin kode={roleAktif} setKode={setRoleAktif} />}
      {tab === 'pengguna' && <PenggunaAkses />}
      {tab === 'simulasi' && <Simulasi />}
      {tab === 'riwayat' && <Riwayat />}
    </div>
  )
}

// ===================== DAFTAR ROLE =====================
function DaftarRole({ onAtur }) {
  const { user, data, save, notify, ask } = useApp()
  const [q, setQ] = useState(''); const [saring, setSaring] = useState('semua')
  const [baru, setBaru] = useState(null); const [lihatPengguna, setLihatPengguna] = useState(null)
  const kelola = bolehKelola(user)
  const roles = semuaRoleLengkap()
  const tampil = roles.filter((r) => (!q || `${r.nama} ${r.kode} ${r.deskripsi}`.toLowerCase().includes(q.toLowerCase()))
    && (saring === 'semua' || (saring === 'aktif' && r.aktif !== false) || (saring === 'nonaktif' && r.aktif === false) || (saring === 'bawaan' && r.bawaan) || (saring === 'buatan' && !r.bawaan)))

  const ubahAktif = async (r) => {
    if (r.kode === ROLE_SISTEM) return notify('Role Super Admin tidak dapat dinonaktifkan', 'err')
    if (r.kode === user.role) return notify('Anda tidak dapat menonaktifkan role yang sedang Anda pakai', 'err')
    const n = penggunaRole(data.users, r.kode).length
    if (r.aktif !== false && !(await ask(`Nonaktifkan role ${r.nama}? ${n ? `${n} pengguna dengan role ini akan kehilangan semua akses sampai dipindah atau role diaktifkan lagi.` : ''}`))) return
    const doc = { ...salin(r), id: r.kode, aktif: r.aktif === false, diubah_at: new Date().toISOString(), diubah_oleh: user.name }
    delete doc.bawaan; delete doc._asal; delete doc.sistem
    await simpanRole(save, data, doc)
    await catatAudit(save, user, { jenis: 'role', target: r.kode, aksi: doc.aktif ? 'aktifkan' : 'nonaktifkan', ringkas: [doc.aktif ? 'Role diaktifkan' : 'Role dinonaktifkan'] })
    notify(doc.aktif ? 'Role diaktifkan' : 'Role dinonaktifkan')
  }
  const hapus = async (r) => {
    const n = penggunaRole(data.users, r.kode).length
    if (r.bawaan) return notify('Role bawaan tidak dapat dihapus — nonaktifkan saja', 'err')
    if (n) return notify(`Pindahkan dulu ${n} pengguna dari role ini (tab Pengguna)`, 'err')
    if (!(await ask(`Hapus role ${r.nama}? Tindakan ini tercatat di riwayat.`))) return
    await simpanRole(save, data, { ...salin(r), dihapus: true, aktif: false, dihapus_at: new Date().toISOString(), dihapus_oleh: user.name })
    await catatAudit(save, user, { jenis: 'role', target: r.kode, aksi: 'hapus', ringkas: [`Role ${r.nama} dihapus`] })
    notify('Role dihapus')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 md:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari role" className="pl-8" aria-label="Cari role" /></div>
        <Select value={saring} onChange={(e) => setSaring(e.target.value)} className="w-auto" aria-label="Filter role">
          <option value="semua">Semua</option><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option><option value="bawaan">Bawaan</option><option value="buatan">Buatan sendiri</option>
        </Select>
        {kelola && <Button size="sm" className="ml-auto max-md:min-h-11" onClick={() => setBaru({ nama: '', kode: '', deskripsi: '', salinDari: '' })} data-aksi="role-baru"><Plus className="h-4 w-4" />Role baru</Button>}
      </div>
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {tampil.map((r) => {
          const n = penggunaRole(data.users, r.kode).length
          return (
            <li key={r.kode} className={cx('flex flex-col rounded-2xl bg-white p-3 ring-1 ring-[#E7E8F0] dark:bg-white/5', r.aktif === false && 'opacity-70')} data-kartu-role={r.kode}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold">{r.nama}
                    {r.sistem && <span className="rounded-full bg-[#141B34] px-2 py-0.5 text-[10px] font-semibold text-white">Sistem</span>}
                    {r.aktif === false && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Nonaktif</span>}
                    {!r.bawaan && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Buatan</span>}
                  </p>
                  <p className="font-mono text-[11px] text-ink-mute">{r.kode}</p>
                </div>
                <button type="button" onClick={() => setLihatPengguna(r)} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-[12px] font-semibold text-brand md:min-h-8" aria-label={`${n} pengguna dengan role ${r.nama}`}><Users className="h-4 w-4" />{n}</button>
              </div>
              {r.deskripsi && <p className="mt-1 text-[12px] text-ink-soft">{r.deskripsi}</p>}
              <p className="mt-1 text-[11px] text-ink-mute">{r.sistem ? 'Semua izin' : `${Object.values(r.izin || {}).filter((x) => x?.aktif).length} izin aktif`}{r.sistem ? '' : r._asal ? ' · mengikuti aturan lama (belum pernah diubah)' : r.diubah_at ? ` · diubah ${fmt(r.diubah_at)}` : ''}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 [&>*]:max-md:min-h-11">
                <Button size="sm" variant="outline" onClick={() => onAtur(r.kode)}><KeyRound className="h-4 w-4" />{r.sistem || !kelola ? 'Lihat izin' : 'Atur izin'}</Button>
                {kelola && <Button size="sm" variant="ghost" onClick={() => setBaru({ nama: `${r.nama} (salinan)`, kode: slugKode(`${r.kode}_salinan`), deskripsi: r.deskripsi, salinDari: r.kode })} aria-label={`Duplikat ${r.nama}`}><Copy className="h-4 w-4" />Duplikat</Button>}
                {kelola && !r.sistem && <Button size="sm" variant="ghost" onClick={() => ubahAktif(r)}><Power className="h-4 w-4" />{r.aktif === false ? 'Aktifkan' : 'Nonaktifkan'}</Button>}
                {kelola && !r.bawaan && <Button size="sm" variant="ghost" onClick={() => hapus(r)} aria-label={`Hapus ${r.nama}`}><Trash2 className="h-4 w-4" />Hapus</Button>}
              </div>
            </li>
          )
        })}
      </ul>
      {!tampil.length && <Empty icon={ShieldCheck} title="Tidak ada role yang cocok" />}
      {baru && <RoleBaru awal={baru} roles={roles} onClose={() => setBaru(null)} onDibuat={(kode) => { setBaru(null); onAtur(kode) }} />}
      {lihatPengguna && (
        <Sheet open onClose={() => setLihatPengguna(null)} title={`Pengguna · ${lihatPengguna.nama}`}>
          {penggunaRole(data.users, lihatPengguna.kode).length ? <ul className="divide-y divide-slate-100">{penggunaRole(data.users, lihatPengguna.kode).map((u) => <li key={u.id} className="flex min-h-11 items-center justify-between gap-2 py-2 text-sm"><span>{u.name}<span className="block text-[11px] text-ink-mute">{u.role === lihatPengguna.kode ? 'Role utama' : 'Role tambahan'} · {u.branch || '—'}{u.active === false ? ' · nonaktif' : ''}</span></span></li>)}</ul> : <p className="text-sm text-ink-mute">Belum ada pengguna.</p>}
        </Sheet>
      )}
    </div>
  )
}

function RoleBaru({ awal, roles, onClose, onDibuat }) {
  const { user, data, save, notify } = useApp()
  const [f, setF] = useState(awal); const [galat, setGalat] = useState('')
  const [kodeManual, setKodeManual] = useState(!!awal.kode)
  const kode = kodeManual ? f.kode : slugKode(f.nama)
  const simpan = async () => {
    if (!f.nama.trim()) return setGalat('Nama role wajib diisi')
    if (!/^[a-z][a-z0-9_]{2,39}$/.test(kode)) return setGalat('Kode 3–40 huruf kecil/angka/garis bawah, diawali huruf')
    if (roles.some((r) => r.kode === kode)) return setGalat('Kode sudah dipakai role lain')
    const doc = { ...konfigBaru({ ...f, kode }), dibuat_at: new Date().toISOString(), dibuat_oleh: user.name }
    // anti eskalasi: salinan tidak boleh membawa izin yang tidak dimiliki pembuat
    for (const k of Object.keys(doc.izin)) if (!bolehBeri(user, k)) delete doc.izin[k]
    await simpanRole(save, data, doc)
    await catatAudit(save, user, { jenis: 'role', target: kode, aksi: 'buat', ringkas: [`Role ${doc.nama} dibuat${f.salinDari ? ` (salinan ${f.salinDari})` : ' dari awal'}`], sesudah: { izin: Object.keys(doc.izin).length } })
    notify('Role dibuat — atur izinnya')
    onDibuat(kode)
  }
  return (
    <Sheet open onClose={onClose} title={f.salinDari ? 'Duplikat role' : 'Role baru'}>
      <div className="grid gap-3 text-sm">
        <label className="grid gap-1"><span className="font-semibold">Nama role</span><Input value={f.nama} onChange={(e) => { setF({ ...f, nama: e.target.value }); setGalat('') }} placeholder="mis. Kurir Internal" autoFocus /></label>
        <label className="grid gap-1"><span className="font-semibold">Kode unik</span><Input value={kode} onChange={(e) => { setKodeManual(true); setF({ ...f, kode: slugKode(e.target.value) }) }} className="font-mono" /><span className="text-[11px] text-ink-mute">Dipakai sistem; tidak bisa diubah setelah dibuat.</span></label>
        <label className="grid gap-1"><span className="font-semibold">Deskripsi</span><Textarea value={f.deskripsi} onChange={(e) => setF({ ...f, deskripsi: e.target.value })} rows={2} /></label>
        <label className="grid gap-1"><span className="font-semibold">Mulai dari</span>
          <Select value={f.salinDari} onChange={(e) => setF({ ...f, salinDari: e.target.value })}><option value="">Kosong (tanpa akses)</option>{roles.filter((r) => !r.sistem).map((r) => <option key={r.kode} value={r.kode}>Salin dari {r.nama}</option>)}</Select>
        </label>
        {galat && <p role="alert" className="text-[12px] font-semibold text-rose-600">{galat}</p>}
        <div className="flex gap-2 [&>*]:flex-1 [&>*]:max-md:min-h-11"><Button variant="outline" onClick={onClose}>Batal</Button><Button onClick={simpan} data-aksi="simpan-role-baru">Buat role</Button></div>
      </div>
    </Sheet>
  )
}

// ===================== EDITOR IZIN =====================
function EditorIzin({ kode, setKode }) {
  const { user, data, save, notify } = useApp()
  const roles = semuaRoleLengkap()
  const role = roles.find((r) => r.kode === kode) || roles.find((r) => r.kode !== ROLE_SISTEM) || roles[0]
  const [draf, setDraf] = useState(() => salin(role))
  const [q, setQ] = useState(''); const [saring, setSaring] = useState('semua')
  const [buka, setBuka] = useState({}); const [tinjau, setTinjau] = useState(false); const [sibuk, setSibuk] = useState(false)
  useEffect(() => { setDraf(salin(role)); setTinjau(false) }, [role.kode, role.diubah_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const kunci = role.sistem || !bolehKelola(user) || role.kode === user.role
  const alasanKunci = role.sistem ? 'Role sistem Super Admin selalu memiliki semua izin dan tidak dapat diubah.' : !bolehKelola(user) ? 'Anda hanya dapat melihat.' : role.kode === user.role ? 'Anda tidak dapat mengubah role yang sedang Anda pakai sendiri.' : ''
  const ubahan = useMemo(() => selisih(role, draf), [role, draf])
  const diubah = (k) => !!role.izin?.[k]?.aktif !== !!draf.izin?.[k]?.aktif || (role.izin?.[k]?.cakupan !== draf.izin?.[k]?.cakupan && draf.izin?.[k]?.aktif)
  const aktif = (k) => role.sistem || !!draf.izin?.[k]?.aktif

  const setIzin = (k, nyala, cakupan) => setDraf((d) => {
    const izin = { ...d.izin }; const [fitur, aksi] = pisahKode(k)
    if (nyala) {
      izin[k] = aksi === 'menu' ? { aktif: true } : { aktif: true, cakupan: cakupan || izin[k]?.cakupan || d.cakupan_bawaan || 'cabang', cabang: izin[k]?.cabang }
      // dependensi: tindakan apa pun butuh "lihat"
      if (!['menu', 'lihat'].includes(aksi) && FITUR[fitur].aksi.includes('lihat') && !izin[`${fitur}.lihat`]?.aktif) izin[`${fitur}.lihat`] = { aktif: true, cakupan: izin[k].cakupan }
    } else {
      delete izin[k]
      if (aksi === 'lihat') for (const a of FITUR[fitur].aksi) if (!['menu', 'lihat'].includes(a)) delete izin[`${fitur}.${a}`] // tanpa lihat, tindakan lain tak berguna
    }
    return { ...d, izin }
  })
  const setCakupan = (k, cakupan, cabang) => setDraf((d) => ({ ...d, izin: { ...d.izin, [k]: { ...d.izin[k], cakupan, cabang: cakupan === 'cabang_pilihan' ? cabang ?? d.izin[k]?.cabang ?? [] : undefined } } }))
  const cocok = (x, a) => {
    const k = `${x.id}.${a}`
    if (q && !`${x.label} ${AKSI[a]?.label} ${k}`.toLowerCase().includes(q.toLowerCase())) return false
    if (saring === 'izin') return aktif(k)
    if (saring === 'tolak') return !aktif(k)
    if (saring === 'ubah') return diubah(k)
    return true
  }
  const simpan = async () => {
    const g = validasiSimpan({ user, role, baru: draf, users: data.users })
    if (g) return notify(g, 'err')
    setSibuk(true)
    try {
      const doc = { ...salin(draf), id: role.kode, kode: role.kode, diubah_at: new Date().toISOString(), diubah_oleh: user.name }
      delete doc.bawaan; delete doc._asal; delete doc.sistem
      await simpanRole(save, data, doc)
      await catatAudit(save, user, { jenis: 'role', target: role.kode, aksi: 'ubah_izin', ringkas: ubahan.map((u) => u.teks), sebelum: { izin: role.izin, field: role.field }, sesudah: { izin: doc.izin, field: doc.field } })
      notify(`Izin ${role.nama} disimpan · berlaku langsung`)
      setTinjau(false)
    } finally { setSibuk(false) }
  }

  return (
    <div className="space-y-3 pb-24 md:pb-20" data-editor-izin>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={role.kode} onChange={(e) => setKode(e.target.value)} className="w-auto min-w-[200px]" aria-label="Pilih role">{roles.map((r) => <option key={r.kode} value={r.kode}>{r.nama}{r.aktif === false ? ' (nonaktif)' : ''}</option>)}</Select>
        <div className="relative min-w-[180px] flex-1 md:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari modul, fitur, izin" className="pl-8" aria-label="Cari izin" /></div>
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Saring izin">
          {[['semua', 'Semua'], ['izin', 'Diizinkan'], ['tolak', 'Tidak diizinkan'], ['ubah', `Diubah${ubahan.length ? ` (${ubahan.length})` : ''}`]].map(([v, l]) => <button key={v} type="button" onClick={() => setSaring(v)} aria-pressed={saring === v} className={cx('min-h-11 shrink-0 rounded-full px-3 text-[12px] font-semibold ring-1 md:min-h-8', saring === v ? 'bg-[#141B34] text-white ring-[#141B34]' : 'bg-white ring-slate-200')}>{l}</button>)}
        </div>
      </div>
      {alasanKunci && <p className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-[12px] text-ink-soft ring-1 ring-slate-200"><Lock className="h-4 w-4 shrink-0" />{alasanKunci}</p>}
      {!kunci && !role.bawaan ? null : !kunci && <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-mute"><span>Role bawaan.</span><button type="button" className="min-h-11 font-semibold text-brand underline md:min-h-0" onClick={() => setDraf((d) => ({ ...d, ...kembalikanAsal(role.kode) }))}>Kembalikan ke aturan lama</button></div>}

      {MODUL.map((m) => {
        const kodeModul = m.fitur.flatMap((x) => x.aksi.map((a) => `${x.id}.${a}`))
        const nyala = kodeModul.filter(aktif).length
        const fiturTampil = m.fitur.filter((x) => x.aksi.some((a) => cocok(x, a)))
        const fieldTampil = (m.field || []).filter((x) => !q || x.label.toLowerCase().includes(q.toLowerCase()))
        if (!fiturTampil.length && !(fieldTampil.length && saring === 'semua')) return null
        const terbuka = buka[m.id] ?? (!!q || saring !== 'semua')
        return (
          <section key={m.id} className="rounded-2xl bg-white ring-1 ring-[#E7E8F0] dark:bg-white/5" data-modul={m.id}>
            <div className="flex items-center gap-2 p-2 pl-3">
              <input type="checkbox" className="h-5 w-5" aria-label={`Pilih semua izin modul ${m.label}`} disabled={kunci} checked={nyala === kodeModul.length} ref={(el) => { if (el) el.indeterminate = nyala > 0 && nyala < kodeModul.length }}
                onChange={(e) => setDraf((d) => ({ ...d, izin: terapkanPreset(d.izin, m.id, e.target.checked ? 'penuh' : 'tanpa', d.cakupan_bawaan) }))} />
              <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setBuka((b) => ({ ...b, [m.id]: !terbuka }))} aria-expanded={terbuka}>
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-bold">{m.label}</span><span className="text-[11px] text-ink-mute">{nyala}/{kodeModul.length} izin</span></span>
                <ChevronDown className={cx('h-4 w-4 shrink-0 transition', terbuka && 'rotate-180')} />
              </button>
              {!kunci && <Select aria-label={`Preset modul ${m.label}`} className="w-auto max-w-[150px] text-[12px]" value="" onChange={(e) => { if (e.target.value) setDraf((d) => ({ ...d, izin: terapkanPreset(d.izin, m.id, e.target.value, d.cakupan_bawaan) })) }}>
                <option value="">Preset…</option>{Object.entries(PRESET).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </Select>}
            </div>
            {terbuka && (
              <div className="border-t border-slate-100 p-2 md:p-3">
                {fiturTampil.map((x) => (
                  <div key={x.id} className="mb-2 rounded-xl bg-slate-50/70 p-2 last:mb-0 dark:bg-white/5" data-fitur={x.id}>
                    <p className="mb-1 px-1 text-[13px] font-bold">{x.label}{x.inti && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">hak inti</span>}</p>
                    <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-3">
                      {x.aksi.filter((a) => cocok(x, a)).map((a) => {
                        const k = `${x.id}.${a}`; const on = aktif(k); const i = draf.izin?.[k]
                        const tidakBoleh = !kunci && !on && !bolehBeri(user, k)
                        return (
                          <div key={a} className={cx('flex flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1 ring-1 dark:bg-transparent', diubah(k) ? 'ring-amber-300' : 'ring-slate-200')}>
                            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-[13px] md:min-h-8">
                              <input type="checkbox" className="h-5 w-5 shrink-0 md:h-4 md:w-4" checked={on} disabled={kunci || tidakBoleh} onChange={(e) => setIzin(k, e.target.checked)} data-izin={k} />
                              <span className="min-w-0">{AKSI[a]?.label || a}{AKSI_SENSITIF.includes(a) && <AlertTriangle className="ml-1 inline h-3 w-3 text-amber-600" aria-label="izin sensitif" />}{tidakBoleh && <span className="block text-[10px] text-ink-mute">Anda sendiri tidak punya izin ini</span>}{a === 'menu' && <span className="block text-[10px] text-ink-mute">tidak memberi akses data</span>}</span>
                            </label>
                            {on && a !== 'menu' && !role.sistem && (
                              <Select aria-label={`Cakupan ${x.label} ${AKSI[a]?.label}`} disabled={kunci} value={i?.cakupan || 'cabang'} onChange={(e) => setCakupan(k, e.target.value)} className="w-auto max-w-[170px] py-1 text-[12px] max-md:w-full max-md:max-w-none">
                                {Object.entries(CAKUPAN).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                              </Select>
                            )}
                            {on && i?.cakupan === 'cabang_pilihan' && !kunci && (
                              <div className="flex w-full flex-wrap gap-1">{BRANCHES.map((b) => { const ada = (i.cabang || []).includes(b); return <button key={b} type="button" aria-pressed={ada} onClick={() => setCakupan(k, 'cabang_pilihan', ada ? i.cabang.filter((c) => c !== b) : [...(i.cabang || []), b])} className={cx('min-h-9 rounded-full px-2.5 text-[11px] font-semibold ring-1', ada ? 'bg-[#141B34] text-white ring-[#141B34]' : 'ring-slate-300')}>{b}</button> })}</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {fieldTampil.length > 0 && saring === 'semua' && (
                  <div className="rounded-xl bg-amber-50/60 p-2 ring-1 ring-amber-200" data-field-modul={m.id}>
                    <p className="mb-1 px-1 text-[13px] font-bold">Field sensitif</p>
                    <p className="mb-1.5 px-1 text-[11px] text-ink-mute">Berlaku di tampilan, pencarian, laporan, ekspor, cetak, dan notifikasi.</p>
                    {fieldTampil.map((fl) => (
                      <label key={fl.id} className="flex flex-wrap items-center gap-2 py-1 text-[13px]">
                        <span className="min-w-0 flex-1">{fl.label}</span>
                        <Select disabled={kunci} value={role.sistem ? 'edit' : draf.field?.[fl.id] || 'sembunyi'} onChange={(e) => setDraf((d) => ({ ...d, field: { ...d.field, [fl.id]: e.target.value } }))} className={cx('w-auto py-1 text-[12px]', (draf.field?.[fl.id] || 'sembunyi') !== (role.field?.[fl.id] || 'sembunyi') && 'ring-amber-400')} aria-label={`Akses field ${fl.label}`}>
                          {Object.entries(TINGKAT_FIELD).map(([t, l]) => <option key={t} value={t}>{l}</option>)}
                        </Select>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )
      })}

      {!kunci && ubahan.length > 0 && (
        <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 rounded-2xl bg-[#141B34] p-2 pl-4 text-white shadow-xl md:inset-x-auto md:bottom-4 md:right-6 md:max-w-xl" data-bar-simpan-izin>
          <span className="mr-auto text-[13px] font-semibold"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />{ubahan.length} perubahan belum disimpan</span>
          <button type="button" className="min-h-11 rounded-xl px-3 text-[13px] font-semibold text-white/80" onClick={() => setDraf(salin(role))}>Batal</button>
          <button type="button" className="min-h-11 rounded-xl bg-white px-4 text-[13px] font-bold text-[#141B34]" onClick={() => setTinjau(true)} data-aksi="tinjau-izin">Simpan…</button>
        </div>
      )}
      {tinjau && (
        <Sheet open onClose={() => setTinjau(false)} title={`Simpan perubahan · ${role.nama}`} subtitle={`${ubahan.length} perubahan · berlaku untuk ${penggunaRole(data.users, role.kode).length} pengguna`}>
          {ubahan.some((u) => u.sensitif) && <p className="mb-2 flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-[12px] text-amber-900 ring-1 ring-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Ada izin sensitif (hapus/setujui/ekspor/pengaturan, cakupan seluruh data, atau field sensitif). Pastikan memang diperlukan.</p>}
          {draf.aktif === false && <p className="mb-2 text-[12px] text-rose-700">Role nonaktif: semua penggunanya tidak punya akses.</p>}
          <ul className="max-h-[50dvh] space-y-1 overflow-y-auto text-[13px]">{ubahan.map((u) => <li key={u.kode} className={cx('rounded-lg px-2 py-1.5', u.jenis === 'cabut' ? 'bg-rose-50 text-rose-800' : u.jenis === 'tambah' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50')}>{u.sensitif && '⚠ '}{u.teks}</li>)}</ul>
          <div className="mt-3 flex gap-2 [&>*]:flex-1 [&>*]:max-md:min-h-11"><Button variant="outline" onClick={() => setTinjau(false)}>Kembali</Button><Button loading={sibuk} onClick={simpan} data-aksi="simpan-izin">Simpan</Button></div>
        </Sheet>
      )}
    </div>
  )
}

// ===================== PENGGUNA =====================
function PenggunaAkses() {
  const { user, data } = useApp()
  const [q, setQ] = useState(''); const [fRole, setFRole] = useState(''); const [pilih, setPilih] = useState(null)
  const roles = semuaRoleLengkap()
  const daftar = (data.users || []).filter((u) => (!q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())) && (!fRole || rolesOf(u).includes(fRole)))
  const ex = (u) => (data.akses_pengecualian || []).filter((k) => k.user_id === u.id && !k.dicabut)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1 md:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari pengguna" className="pl-8" aria-label="Cari pengguna" /></div>
        <Select value={fRole} onChange={(e) => setFRole(e.target.value)} className="w-auto" aria-label="Filter role"><option value="">Semua role</option>{roles.map((r) => <option key={r.kode} value={r.kode}>{r.nama}</option>)}</Select>
      </div>
      <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-[#E7E8F0] dark:bg-white/5">
        {daftar.map((u) => (
          <li key={u.id}><button type="button" onClick={() => setPilih(u.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left">
            <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold">{u.name}{u.id === user.id && <span className="ml-1 text-[11px] text-ink-mute">(Anda)</span>}</span>
              <span className="block truncate text-[12px] text-ink-mute">{roleLabel(u, u.role)}{(u.extra_roles || []).length ? ` + ${u.extra_roles.map((r) => roleLabel(u, r)).join(', ')}` : ''} · {u.branch || '—'}{u.active === false ? ' · nonaktif' : ''}</span></span>
            {ex(u).length > 0 && <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{ex(u).length} pengecualian</span>}
          </button></li>
        ))}
      </ul>
      {pilih && <DetailPengguna id={pilih} onClose={() => setPilih(null)} />}
    </div>
  )
}

function DetailPengguna({ id, onClose }) {
  const { user, data, save, notify, ask } = useApp()
  const u = (data.users || []).find((x) => x.id === id)
  const roles = semuaRoleLengkap().filter((r) => r.aktif !== false)
  const [roleBaru, setRoleBaru] = useState(u?.role || '')
  const [form, setForm] = useState(null)
  if (!u) return null
  const ex = (data.akses_pengecualian || []).filter((k) => k.user_id === u.id && !k.dicabut)
  const bisaTetapkan = boleh(user, 'pengguna.role.kelola') && u.id !== user.id
  const alasan = u.id === user.id ? 'Anda tidak dapat mengubah role sendiri.' : !boleh(user, 'pengguna.role.kelola') ? 'Anda tidak berwenang menetapkan role.' : ''
  const tetapkan = async () => {
    if (roleBaru === u.role) return
    if (u.role === ROLE_SISTEM && superadminAktif(data.users).length <= 1) return notify('Ini Super Admin aktif terakhir — tetapkan Super Admin lain dulu', 'err')
    if (roleBaru === ROLE_SISTEM && user.role !== ROLE_SISTEM) return notify('Hanya Super Admin yang dapat menetapkan role Super Admin', 'err')
    if (!(await ask(`Ganti role ${u.name}: ${roleLabel(u, u.role)} → ${roleLabel(u, roleBaru)}? Berlaku langsung.`))) return
    await save('users', { id: u.id, role: roleBaru })
    await catatAudit(save, user, { jenis: 'pengguna', target: u.id, target_nama: u.name, aksi: 'tetapkan_role', ringkas: [`Role ${u.name}: ${roleLabel(u, u.role)} → ${roleLabel(u, roleBaru)}`], sebelum: { role: u.role }, sesudah: { role: roleBaru } })
    notify('Role pengguna diganti')
  }
  const cabut = async (k) => {
    if (!(await ask('Cabut pengecualian ini?'))) return
    await save('akses_pengecualian', { id: k.id, dicabut: true, dicabut_at: new Date().toISOString(), dicabut_oleh: user.name })
    await catatAudit(save, user, { jenis: 'pengecualian', target: u.id, target_nama: u.name, aksi: 'cabut', ringkas: [`Pengecualian ${k.nilai} ${k.kode} untuk ${u.name} dicabut`] })
  }
  return (
    <Sheet open onClose={onClose} title={u.name} subtitle={`${u.email || ''} · ${u.branch || '—'}`} wide>
      <div className="space-y-4 text-sm">
        <section>
          <p className="mb-1 font-bold">Role</p>
          <p className="text-[12px] text-ink-mute">Role utama: <b className="text-ink">{roleLabel(u, u.role)}</b>{(u.extra_roles || []).length ? <> · role tambahan: {u.extra_roles.map((r) => roleLabel(u, r)).join(', ')}</> : null}</p>
          {(u.extra_roles || []).length > 0 && <p className="mt-1 rounded-lg bg-slate-50 p-2 text-[12px] text-ink-soft">Pengguna ini punya beberapa role dan berganti peran lewat menu profil. Izin dihitung per role yang sedang aktif — <b>tidak digabung</b>, jadi cakupan luas satu role tidak menempel ke tindakan role lain.</p>}
          {bisaTetapkan ? (
            <div className="mt-2 flex flex-wrap gap-2"><Select value={roleBaru} onChange={(e) => setRoleBaru(e.target.value)} className="w-auto min-w-[200px]" aria-label="Role utama baru">{roles.filter((r) => r.kode !== ROLE_SISTEM || user.role === ROLE_SISTEM).map((r) => <option key={r.kode} value={r.kode}>{r.nama}</option>)}</Select><Button size="sm" className="max-md:min-h-11" disabled={roleBaru === u.role} onClick={tetapkan} data-aksi="tetapkan-role">Tetapkan</Button></div>
          ) : <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-mute"><Lock className="h-3.5 w-3.5" />{alasan}</p>}
        </section>
        <section>
          <div className="mb-1 flex items-center gap-2"><p className="mr-auto font-bold">Pengecualian akses</p>{boleh(user, 'pengaturan.role.kelola') && u.id !== user.id && <Button size="sm" variant="outline" className="max-md:min-h-11" onClick={() => setForm({ kode: '', nilai: 'larang', cakupan: 'cabang', sampai: '', alasan: '' })}><Plus className="h-4 w-4" />Tambah</Button>}</div>
          <p className="mb-1 text-[11px] text-ink-mute">Ikuti role (default) · Izinkan · Larang. Larangan selalu mengalahkan izin. Bisa diberi masa berlaku — otomatis tidak berlaku setelahnya.</p>
          {ex.length ? <ul className="space-y-1">{ex.map((k) => { const [fi, a] = pisahKode(k.kode); const habis = k.sampai && new Date(k.sampai) < new Date(); return (
            <li key={k.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[12px]">
              <span className={cx('rounded-full px-2 py-0.5 font-bold', k.nilai === 'larang' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800')}>{k.nilai === 'larang' ? 'Larang' : 'Izinkan'}</span>
              <span className="min-w-0 flex-1">{FITUR[fi]?.label} · {AKSI[a]?.label}{k.nilai === 'izinkan' && k.cakupan ? ` (${CAKUPAN[k.cakupan]})` : ''}{k.sampai ? ` · s.d. ${k.sampai.slice(0, 10)}` : ''}{habis ? ' · kedaluwarsa' : ''}{k.alasan ? <span className="block text-ink-mute">{k.alasan}</span> : null}</span>
              {boleh(user, 'pengaturan.role.kelola') && <button type="button" onClick={() => cabut(k)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-ink-mute md:min-h-8 md:min-w-8" aria-label="Cabut pengecualian"><X className="h-4 w-4" /></button>}
            </li>) })}</ul> : <p className="text-[12px] text-ink-mute">Tidak ada — mengikuti role.</p>}
          {form && <FormPengecualian u={u} awal={form} onClose={() => setForm(null)} />}
        </section>
        <section><p className="mb-1 font-bold">Izin efektif</p><IzinEfektif u={u} /></section>
      </div>
    </Sheet>
  )
}

function FormPengecualian({ u, awal, onClose }) {
  const { user, save, notify } = useApp()
  const [f, setF] = useState(awal); const [q, setQ] = useState('')
  const opsi = SEMUA_KODE.filter((k) => !KODE_INTI.includes(k) || user.role === ROLE_SISTEM).filter((k) => { const [fi, a] = pisahKode(k); return !q || `${FITUR[fi].label} ${AKSI[a]?.label} ${k}`.toLowerCase().includes(q.toLowerCase()) })
  const simpan = async () => {
    if (!f.kode) return notify('Pilih izin', 'err')
    if (f.nilai === 'izinkan' && !bolehBeri(user, f.kode)) return notify('Anda tidak dapat memberikan izin yang tidak Anda miliki', 'err')
    const doc = { user_id: u.id, kode: f.kode, nilai: f.nilai, cakupan: f.nilai === 'izinkan' ? f.cakupan : undefined, sampai: f.sampai ? new Date(`${f.sampai}T23:59:59`).toISOString() : '', alasan: f.alasan.trim(), oleh: user.name, oleh_id: user.id, at: new Date().toISOString() }
    await save('akses_pengecualian', doc)
    await catatAudit(save, user, { jenis: 'pengecualian', target: u.id, target_nama: u.name, aksi: 'tambah', ringkas: [`${f.nilai === 'larang' ? 'Larang' : 'Izinkan'} ${f.kode} untuk ${u.name}${f.sampai ? ` s.d. ${f.sampai}` : ''}`], sesudah: doc })
    notify('Pengecualian disimpan · berlaku langsung'); onClose()
  }
  return (
    <div className="mt-2 rounded-xl p-3 ring-2 ring-[#141B34]/15" data-form-pengecualian>
      <p className="mb-2 text-[13px] font-bold">Pengecualian baru untuk {u.name}</p>
      <div className="grid gap-3 text-sm">
        <div className="grid grid-cols-2 gap-2">{[['larang', 'Larang'], ['izinkan', 'Izinkan']].map(([v, l]) => <button key={v} type="button" aria-pressed={f.nilai === v} onClick={() => setF({ ...f, nilai: v })} className={cx('min-h-11 rounded-xl font-semibold ring-1', f.nilai === v ? (v === 'larang' ? 'bg-rose-600 text-white ring-rose-600' : 'bg-emerald-600 text-white ring-emerald-600') : 'ring-slate-300')}>{l}</button>)}</div>
        <label className="grid gap-1"><span className="font-semibold">Izin</span><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari fitur / tindakan" />
          <Select value={f.kode} onChange={(e) => setF({ ...f, kode: e.target.value })} size={1}><option value="">— pilih —</option>{opsi.slice(0, 300).map((k) => { const [fi, a] = pisahKode(k); return <option key={k} value={k}>{FITUR[fi].label} · {AKSI[a]?.label}</option> })}</Select></label>
        {f.nilai === 'izinkan' && <label className="grid gap-1"><span className="font-semibold">Cakupan data</span><Select value={f.cakupan} onChange={(e) => setF({ ...f, cakupan: e.target.value })}>{Object.entries(CAKUPAN).filter(([c]) => c !== 'cabang_pilihan').map(([c, l]) => <option key={c} value={c}>{l}</option>)}</Select></label>}
        <label className="grid gap-1"><span className="font-semibold">Berlaku sampai (opsional)</span><Input type="date" value={f.sampai} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, sampai: e.target.value })} /></label>
        <label className="grid gap-1"><span className="font-semibold">Alasan</span><Input value={f.alasan} onChange={(e) => setF({ ...f, alasan: e.target.value })} placeholder="mis. menggantikan CS yang cuti" /></label>
        <div className="flex gap-2 [&>*]:flex-1 [&>*]:max-md:min-h-11"><Button variant="outline" onClick={onClose}>Batal</Button><Button onClick={simpan} data-aksi="simpan-pengecualian">Simpan</Button></div>
      </div>
    </div>
  )
}

function IzinEfektif({ u, roleKode }) {
  const [q, setQ] = useState('')
  const baris = SEMUA_KODE.map((k) => ({ k, ...izinEfektif(u, k, roleKode) })).filter((x) => x.boleh).filter((x) => { const [fi, a] = pisahKode(x.k); return !q || `${FITUR[fi].label} ${AKSI[a]?.label}`.toLowerCase().includes(q.toLowerCase()) })
  return (
    <div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari izin" className="mb-2" aria-label="Cari izin efektif" />
      <ul className="max-h-[40dvh] divide-y divide-slate-100 overflow-y-auto rounded-xl ring-1 ring-slate-200">{baris.map((x) => { const [fi, a] = pisahKode(x.k); return <li key={x.k} className="flex flex-wrap items-center gap-x-2 px-2 py-1.5 text-[12px]"><span className="min-w-0 flex-1">{FITUR[fi].label} · {AKSI[a]?.label}</span>{x.cakupan && <span className="text-ink-mute">{CAKUPAN[x.cakupan]}</span>}<span className={cx('rounded-full px-1.5 text-[10px] font-semibold', x.sumber === 'pengecualian' ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600')}>{x.sumber}</span></li> })}</ul>
      <p className="mt-1 text-[11px] text-ink-mute">{baris.length} izin diizinkan. Sisanya ditolak.</p>
    </div>
  )
}

// ===================== SIMULASI =====================
function Simulasi() {
  const { data } = useApp()
  const roles = semuaRoleLengkap()
  const [mode, setMode] = useState('role')
  const [roleK, setRoleK] = useState(roles.find((r) => r.kode === 'cs')?.kode || roles[0].kode)
  const [uid, setUid] = useState('')
  const [kodeCek, setKodeCek] = useState('pengiriman.daftar.lihat')
  const u = mode === 'pengguna' ? (data.users || []).find((x) => x.id === uid) : null
  const subjek = u || { id: '__simulasi__', role: roleK, branch: 'Bali', name: 'Simulasi' }
  const roleSim = u ? undefined : roleK
  const jawab = izinEfektif(subjek, kodeCek, roleSim)
  return (
    <div className="space-y-3" data-simulasi>
      <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-2.5 text-[12px] text-ink-soft ring-1 ring-slate-200"><Eye className="mt-0.5 h-4 w-4 shrink-0" />Simulasi hanya untuk memeriksa. Tidak masuk sebagai pengguna lain dan tidak menjalankan tindakan apa pun.</p>
      <div className="flex flex-wrap gap-2">
        <Select value={mode} onChange={(e) => setMode(e.target.value)} className="w-auto" aria-label="Simulasi berdasarkan"><option value="role">Lihat sebagai role</option><option value="pengguna">Lihat sebagai pengguna</option></Select>
        {mode === 'role' ? <Select value={roleK} onChange={(e) => setRoleK(e.target.value)} className="w-auto min-w-[200px]" aria-label="Role">{roles.map((r) => <option key={r.kode} value={r.kode}>{r.nama}</option>)}</Select>
          : <Select value={uid} onChange={(e) => setUid(e.target.value)} className="w-auto min-w-[200px]" aria-label="Pengguna"><option value="">— pilih pengguna —</option>{(data.users || []).map((x) => <option key={x.id} value={x.id}>{x.name} · {roleLabel(x)}</option>)}</Select>}
      </div>
      {(mode === 'role' || u) && <>
        <section className="rounded-2xl bg-white p-3 ring-1 ring-[#E7E8F0] dark:bg-white/5">
          <p className="mb-1 font-bold">Mengapa {u ? u.name : `role ${roles.find((r) => r.kode === roleK)?.nama}`} punya / tidak punya akses?</p>
          <Select value={kodeCek} onChange={(e) => setKodeCek(e.target.value)} aria-label="Izin yang diperiksa">{SEMUA_KODE.map((k) => { const [fi, a] = pisahKode(k); return <option key={k} value={k}>{FITUR[fi].label} · {AKSI[a]?.label}</option> })}</Select>
          <div className={cx('mt-2 rounded-xl p-3 text-[13px] ring-1', jawab.boleh ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-rose-50 text-rose-900 ring-rose-200')} data-hasil-cek>
            <p className="font-bold">{jawab.boleh ? 'Diizinkan' : 'Ditolak'}</p>
            <p>{jawab.alasan}</p>
            {jawab.boleh && jawab.cakupan && <p>Cakupan data: <b>{CAKUPAN[jawab.cakupan]}</b>{jawab.cabang?.length ? ` (${jawab.cabang.join(', ')})` : ''}</p>}
            <p className="text-[11px] opacity-80">Sumber aturan: {jawab.sumber}</p>
          </div>
        </section>
        <section className="grid gap-2 md:grid-cols-2">
          {MODUL.map((m) => {
            const fit = m.fitur.map((x) => ({ x, menu: x.aksi.includes('menu') ? izinEfektif(subjek, `${x.id}.menu`, roleSim).boleh : null, aksi: x.aksi.filter((a) => a !== 'menu' && izinEfektif(subjek, `${x.id}.${a}`, roleSim).boleh) }))
            return (
              <div key={m.id} className="rounded-2xl bg-white p-3 ring-1 ring-[#E7E8F0] dark:bg-white/5">
                <p className="mb-1 font-bold">{m.label}</p>
                <ul className="space-y-1 text-[12px]">{fit.map(({ x, menu, aksi }) => <li key={x.id}><span className={cx('font-semibold', !aksi.length && 'text-ink-mute line-through')}>{x.label}</span>{menu === true && <span className="ml-1 rounded bg-sky-50 px-1 text-[10px] text-sky-700">menu tampil</span>}{menu === false && aksi.length > 0 && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px]">menu disembunyikan</span>}
                  {aksi.length > 0 && <span className="block text-ink-mute">{aksi.map((a) => AKSI[a]?.label).join(' · ')}</span>}</li>)}</ul>
                {(m.field || []).length > 0 && <ul className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5 text-[11px]">{m.field.map((fl) => <li key={fl.id}>{fl.label}: <b>{TINGKAT_FIELD[aksesField(subjek, fl.id, roleSim)]}</b></li>)}</ul>}
              </div>
            )
          })}
        </section>
      </>}
    </div>
  )
}

// ===================== RIWAYAT =====================
function Riwayat() {
  const { data } = useApp()
  const [q, setQ] = useState(''); const [jenis, setJenis] = useState('')
  const rows = [...(data.akses_audit || [])].sort((a, b) => String(b.at || b.created_at).localeCompare(String(a.at || a.created_at)))
    .filter((r) => (!jenis || r.jenis === jenis) && (!q || `${r.oleh} ${r.target} ${r.target_nama || ''} ${(r.ringkas || []).join(' ')}`.toLowerCase().includes(q.toLowerCase())))
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1 md:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari pelaku, role, izin" className="pl-8" aria-label="Cari riwayat" /></div>
        <Select value={jenis} onChange={(e) => setJenis(e.target.value)} className="w-auto" aria-label="Filter jenis"><option value="">Semua</option><option value="role">Role</option><option value="pengguna">Role pengguna</option><option value="pengecualian">Pengecualian</option></Select>
      </div>
      <p className="text-[11px] text-ink-mute">Riwayat hanya dapat dibaca — tidak dapat diubah atau dihapus.</p>
      {!rows.length ? <Empty icon={History} title="Belum ada perubahan" /> : (
        <ul className="space-y-2">{rows.slice(0, 300).map((r) => (
          <li key={r.id} className="rounded-2xl bg-white p-3 text-[12px] ring-1 ring-[#E7E8F0] dark:bg-white/5">
            <p className="flex flex-wrap gap-x-2"><b>{r.oleh || r.pelaku || '-'}</b><span className="text-ink-mute">{fmt(r.at || r.created_at)}</span><span className="rounded-full bg-slate-100 px-2 font-semibold">{r.jenis} · {r.aksi}</span><span className="font-mono text-ink-mute">{r.target_nama || r.target}</span></p>
            <ul className="mt-1 list-disc pl-4">{(r.ringkas || []).slice(0, 20).map((t, i) => <li key={i}>{t}</li>)}{(r.ringkas || []).length > 20 && <li>…{r.ringkas.length - 20} lainnya</li>}</ul>
          </li>
        ))}</ul>
      )}
    </div>
  )
}
