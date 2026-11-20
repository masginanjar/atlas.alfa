// ============================================================
//  IMPOR DATA ATLAS LAMA (Pengaturan → Impor data lama) — hanya dengan izin pengaturan.impor-lama.atur.
//  • Berkas .json disiapkan dari ekspor ATLAS lama (project + pengajuan dana). Berkas dibaca di browser ini
//    dan dikirim ke server lewat sesi pengguna yang sedang masuk — RLS server tetap berlaku.
//  • Aman diulang: yang sudah ada (id / No. Invoice sama) dilewati, tidak pernah ditimpa.
//  • Project yang SUDAH ada dan nomornya masuk daftar `selesaikan` ditandai selesai (dengan catatan riwayat).
//  • Tidak mengirim notifikasi / email apa pun. Berhasil hanya dilaporkan setelah server menjawab.
// ============================================================
import { useMemo, useState } from 'react'
import { Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useApp } from '../lib/store.jsx'
import { Card, Button, cx } from './ui.jsx'
import { MODE } from '../lib/db.js'
import { sb } from '../lib/supabase.js'
import { boleh } from '../lib/izin.js'
import { DONE } from '../config/workflows.js'

const angka = (s) => String(s || '').replace(/\D/g, '')
const POTONG = 25

export default function ImporLama() {
  const { user, data, notify } = useApp()
  const [berkas, setBerkas] = useState(null)
  const [galat, setGalat] = useState('')
  const [jalan, setJalan] = useState(null) // { langkah, n, total }
  const [hasil, setHasil] = useState(null)
  const bisa = boleh(user, 'pengaturan.impor-lama.atur')
  const live = MODE === 'supabase'

  const baca = async (f) => {
    setGalat(''); setHasil(null); setBerkas(null)
    if (!f) return
    try {
      const j = JSON.parse(await f.text())
      if (j?.versi !== 1 || !Array.isArray(j.projects) || !Array.isArray(j.requests)) throw new Error('Bentuk berkas tidak dikenali — pakai berkas impor yang disiapkan untuk ATLAS.')
      setBerkas({ nama: f.name, ...j })
    } catch (e) { setGalat(e.message || 'Berkas tidak bisa dibaca') }
  }

  // Rencana (belum mengubah apa pun): dibandingkan dengan data yang sedang terbuka
  const rencana = useMemo(() => {
    if (!berkas) return null
    const adaInv = new Map((data.projects || []).filter((p) => !p.dummy).map((p) => [angka(p.invoice_no), p]))
    const adaId = new Set((data.projects || []).map((p) => p.id))
    const baru = berkas.projects.filter((p) => !adaInv.has(angka(p.invoice_no)) && !adaId.has(p.id))
    const set = new Set(berkas.selesaikan || [])
    const tutup = [...adaInv.entries()].filter(([no, p]) => set.has(no) && (p.sub_projects || []).some((s) => s.stage !== DONE)).map(([, p]) => p)
    const idReq = new Set((data.requests || []).map((r) => r.id))
    const idOrang = new Set((data.people || []).map((x) => x.id)); const idKurir = new Set((data.couriers || []).map((x) => x.id))
    return { baru, lewati: berkas.projects.length - baru.length, tutup,
      req: berkas.requests.filter((r) => !idReq.has(r.id)), reqLewati: berkas.requests.filter((r) => idReq.has(r.id)).length,
      orang: (berkas.people || []).filter((x) => !idOrang.has(x.id)), kurir: (berkas.couriers || []).filter((x) => !idKurir.has(x.id)) }
  }, [berkas, data.projects, data.requests, data.people, data.couriers])

  const baris = (x, bawaan) => { const { id, created_at, updated_at, ...doc } = x; const t = created_at || bawaan; return { id, created_at: t, updated_at: updated_at || t, doc } }
  const kirim = async (tabel, daftar, langkah, bawaan) => {
    let ok = 0; const gagal = []
    for (let i = 0; i < daftar.length; i += POTONG) {
      const potong = daftar.slice(i, i + POTONG)
      setJalan({ langkah, n: i, total: daftar.length })
      const { error } = await sb().from(tabel).upsert(potong.map((x) => baris(x, bawaan)), { onConflict: 'id', ignoreDuplicates: true })
      if (!error) { ok += potong.length; continue }
      // Satu baris bermasalah tidak boleh menggagalkan 25 baris lain → ulangi satu per satu
      for (const x of potong) {
        const r = await sb().from(tabel).upsert([baris(x, bawaan)], { onConflict: 'id', ignoreDuplicates: true })
        if (r.error) gagal.push(`${langkah} ${x.invoice_no || x.legacy?.no || x.id}: ${r.error.message}`); else ok += 1
      }
    }
    return { ok, gagal }
  }

  const jalankan = async () => {
    if (!rencana || jalan) return
    if (!live) { setHasil({ demo: true, ...Object.fromEntries(Object.entries({ project: rencana.baru.length, selesai: rencana.tutup.length, pengajuan: rencana.req.length }).map(([k, v]) => [k, { ok: v, gagal: [] }])) }); return }
    const kini = new Date().toISOString(); const h = {}
    try {
      h.master = await kirim('people', rencana.orang, 'Vendor/lembaga', kini)
      const k = await kirim('couriers', rencana.kurir, 'Kurir', kini); h.master = { ok: h.master.ok + k.ok, gagal: [...h.master.gagal, ...k.gagal] }
      h.project = await kirim('projects', rencana.baru, 'Project', kini)
      // Project yang sudah ada → semua bagiannya ditandai selesai (isi lain tidak diubah)
      h.selesai = { ok: 0, gagal: [] }
      for (let i = 0; i < rencana.tutup.length; i++) {
        const p = rencana.tutup[i]; setJalan({ langkah: 'Menyelesaikan project yang sudah ada', n: i, total: rencana.tutup.length })
        const subs = (p.sub_projects || []).map((s) => (s.stage === DONE ? s : { ...s, stage: DONE, data: { ...(s.data || {}), tahap_sebelum_impor: s.stage },
          history: [...(s.history || []), { at: kini, by: user.name, action: `Ditandai selesai — penyelarasan dengan ATLAS lama s.d. ${berkas.batas || '19 Nov 2026'} (tahap sebelumnya: ${s.stage})` }] }))
        const { error } = await sb().rpc('app_patch', { tbl: 'projects', row_id: p.id, patch: { sub_projects: subs } })
        if (error) h.selesai.gagal.push(`${p.invoice_no}: ${error.message}`); else h.selesai.ok++
      }
      h.pengajuan = await kirim('requests', rencana.req, 'Pengajuan dana', kini)
      setHasil(h)
      const nGagal = Object.values(h).reduce((a, x) => a + x.gagal.length, 0)
      notify(nGagal ? `Impor selesai dengan ${nGagal} bagian gagal — lihat rinciannya` : 'Impor selesai. Muat ulang halaman untuk melihat datanya.', nGagal ? 'err' : undefined)
    } catch (e) { setGalat(e.message || 'Impor terhenti'); setHasil(h) } finally { setJalan(null) }
  }

  if (!bisa) return <Card className="p-6 text-sm text-ink-mute">Tidak ada akses.</Card>
  const Angka = ({ n, label, ket }) => <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10"><b className="block text-xl font-extrabold tabular-nums">{n.toLocaleString('id-ID')}</b><span className="block text-[13px] font-semibold">{label}</span>{ket && <span className="block text-[11.5px] text-ink-mute">{ket}</span>}</div>
  return (
    <Card className="space-y-4 p-4 sm:p-5" data-impor-lama>
      <div><h2 className="text-[15px] font-bold">Impor data ATLAS lama</h2>
        <p className="text-[13px] text-ink-mute">Pilih berkas impor (.json). Yang sudah ada tidak ditimpa, jadi aman diulang. Tidak ada notifikasi atau email yang terkirim.</p></div>
      <label className={cx('flex min-h-[72px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 text-sm font-semibold text-ink-soft hover:border-brand', jalan && 'pointer-events-none opacity-60')}>
        <Upload className="h-4 w-4" aria-hidden="true" />{berkas ? berkas.nama : 'Pilih berkas impor (.json)'}
        <input type="file" accept="application/json,.json" className="sr-only" disabled={!!jalan} onChange={(e) => baca(e.target.files?.[0])} aria-label="Berkas impor" />
      </label>
      {galat && <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700 ring-1 ring-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{galat}</p>}
      {rencana && !hasil && <>
        <p className="text-[12.5px] font-bold uppercase tracking-wide text-ink-mute">Rencana (belum ada yang diubah)</p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-rencana-impor>
          <Angka n={rencana.baru.length} label="Project baru" ket={`${rencana.lewati} sudah ada → dilewati`} />
          <Angka n={rencana.tutup.length} label="Project yang ada → selesai" ket="yang masih berjalan" />
          <Angka n={rencana.req.length} label="Pengajuan dana" ket={`sudah terbayar · ${rencana.reqLewati} sudah ada`} />
          <Angka n={rencana.orang.length + rencana.kurir.length} label="Vendor/kurir baru" />
        </div>
        {!live && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900 ring-1 ring-amber-200">Mode demo: tombol di bawah hanya simulasi, tidak ada data yang disimpan.</p>}
        <Button variant="dark" className="w-full sm:w-auto" disabled={!!jalan} onClick={jalankan} data-aksi="jalankan-impor">
          {jalan ? <><Loader2 className="h-4 w-4 animate-spin" />{jalan.langkah} {jalan.n}/{jalan.total}</> : 'Jalankan impor'}
        </Button>
      </>}
      {hasil && (
        <div className="space-y-2 rounded-xl bg-emerald-50 p-3 text-[13px] ring-1 ring-emerald-200 dark:bg-emerald-500/10" role="status" data-hasil-impor>
          <p className="flex items-center gap-2 font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" />{hasil.demo ? 'Simulasi (demo) — tidak ada yang disimpan' : 'Jawaban server'}</p>
          <ul className="space-y-0.5">{[['project', 'Project baru'], ['selesai', 'Project yang ada ditandai selesai'], ['pengajuan', 'Pengajuan dana'], ['master', 'Vendor/kurir']].filter(([k]) => hasil[k]).map(([k, l]) => <li key={k}>{l}: <b>{hasil[k].ok}</b> berhasil{hasil[k].gagal.length ? <span className="font-semibold text-rose-700"> · {hasil[k].gagal.length} bagian gagal</span> : ''}</li>)}</ul>
          {Object.values(hasil).some((x) => x?.gagal?.length) && <details className="text-[12px] text-rose-800"><summary className="cursor-pointer font-semibold">Rincian yang gagal</summary><ul className="mt-1 list-disc pl-5">{Object.values(hasil).flatMap((x) => x?.gagal || []).slice(0, 60).map((g, i) => <li key={i} className="break-words">{g}</li>)}</ul></details>}
          {!hasil.demo && <p className="text-ink-soft">Muat ulang halaman untuk melihat datanya. Impor bisa dijalankan lagi dengan berkas yang sama — yang sudah masuk akan dilewati.</p>}
        </div>
      )}
    </Card>
  )
}
