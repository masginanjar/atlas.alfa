import { useState } from 'react'
import { KeyRound, Eye, EyeOff, Loader2, LogOut } from 'lucide-react'
import { db } from '../lib/db.js'
import { useApp } from '../lib/store.jsx'

/** Layar wajib setelah login dengan kata sandi sementara: buat kata sandi sendiri + catat email asli.
 *  Tidak ada jalan ke halaman lain sebelum selesai (kecuali Keluar). */
export default function GantiSandiWajib() {
  const { user, signOut, notify } = useApp()
  const [p1, setP1] = useState(''); const [p2, setP2] = useState(''); const [email, setEmail] = useState('')
  const [lihat, setLihat] = useState(false); const [busy, setBusy] = useState(false); const [salah, setSalah] = useState({})
  const periksa = () => {
    const s = {}
    if (p1.length < 8) s.p1 = 'Kata sandi minimal 8 karakter'
    if (p2 !== p1) s.p2 = 'Tidak sama dengan kata sandi di atas'
    const em = email.trim().toLowerCase()
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(em)) s.email = 'Isi alamat email yang benar'
    else if (em.endsWith('@247.id')) s.email = 'Isi email pribadi yang aktif, bukan email @247.id'
    return s
  }
  const simpan = async (e) => {
    e.preventDefault()
    if (busy) return
    const s = periksa(); setSalah(s)
    if (Object.keys(s).length) return
    setBusy(true)
    try {
      await db.selesaiGantiSandi(p1, email.trim().toLowerCase())
      notify('Kata sandi baru tersimpan')
      window.location.reload()
    } catch (err) { setSalah({ umum: err.message || 'Gagal menyimpan. Coba lagi.' }); setBusy(false) }
  }
  const kelas = 'h-12 w-full rounded-xl border border-[#D9DCE8] bg-white px-3.5 text-[16px] text-[#141B34] outline-none focus:border-[#2F4BC6] focus:ring-2 focus:ring-[#2F4BC6]/20'
  const Galat = ({ k }) => (salah[k] ? <span className="mt-1 block text-[13px] font-semibold text-[#B42318]" role="alert">{salah[k]}</span> : null)
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#EEF0F6] px-4 py-6" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }} data-ganti-sandi-wajib>
      <form onSubmit={simpan} noValidate className="w-full max-w-[420px] rounded-[20px] bg-white p-5 shadow-[0_10px_40px_rgba(20,27,52,.10)] sm:p-7">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#141B34] text-white"><KeyRound className="h-5 w-5" /></span>
        <h1 className="mt-4 text-[22px] font-extrabold leading-tight text-[#141B34]">Buat kata sandi Anda sendiri</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[#5B6178]">Halo {user?.name || ''}. Kata sandi yang Anda pakai barusan hanya sementara. Ganti sekarang dan catat email aktif Anda untuk melanjutkan.</p>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold text-[#141B34]">Kata sandi baru</span>
            <span className="relative block">
              <input type={lihat ? 'text' : 'password'} value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" className={kelas + ' pr-12'} data-isi="sandi1" />
              <button type="button" onClick={() => setLihat((v) => !v)} aria-label={lihat ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'} className="absolute right-0 top-0 grid h-12 w-12 place-items-center text-[#5B6178]">{lihat ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
            </span>
            <span className="mt-1 block text-[12px] text-[#5B6178]">Minimal 8 karakter. Jangan pakai kata sandi sementara tadi.</span>
            <Galat k="p1" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold text-[#141B34]">Ulangi kata sandi baru</span>
            <input type={lihat ? 'text' : 'password'} value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" className={kelas} data-isi="sandi2" />
            <Galat k="p2" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold text-[#141B34]">Email aktif Anda</span>
            <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" placeholder="nama@gmail.com" className={kelas} data-isi="email" />
            <span className="mt-1 block text-[12px] text-[#5B6178]">Hanya dicatat sebagai kontak. Login tetap memakai <b className="font-semibold text-[#141B34]">{user?.email}</b>.</span>
            <Galat k="email" />
          </label>
        </div>
        {salah.umum && <p className="mt-4 rounded-xl bg-[#FEF3F2] px-3.5 py-3 text-[13px] font-semibold text-[#B42318]" role="alert">{salah.umum}</p>}
        <button type="submit" disabled={busy} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#141B34] text-[15px] font-bold text-white disabled:opacity-60" data-aksi="simpan-sandi-wajib">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? 'Menyimpan…' : 'Simpan & lanjutkan'}
        </button>
        <button type="button" onClick={signOut} className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-[#5B6178] hover:bg-[#F3F4F9]"><LogOut className="h-4 w-4" />Keluar</button>
        <p className="mt-3 text-center text-[12px] text-[#5B6178]">Lupa kata sandi di kemudian hari? Minta reset ke Superadmin lewat “Lupa Password?” di halaman masuk.</p>
      </form>
    </div>
  )
}
