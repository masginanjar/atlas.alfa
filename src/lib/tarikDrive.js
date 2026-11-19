// ============================================================
//  TARIK DARI DRIVE (masa transisi) — menyusun usulan sub project dari NAMA FILE di folder Google Drive lama.
//  Terpisah dari "Tarik Data (beta)" (yang membaca item invoice Zoho). Tanpa AI, tanpa biaya.
//  Pola Drive tim:  2026 / <arah bahasa, mis. "1 IND - ENG"> / <bulan> / <tanggal> / "<nomor invoice> <nama klien>" / file
//                   2026 / APOSTILLE … / "AP-<nomor invoice> <nama klien>" / file
//  File SUMBER bernama "<nomor>. <jenis dokumen> <nama>" (PDF / foto) → satu baris dokumen. File Word (hasil terjemahan) dilewati.
//  LIVE: nama folder & file dibaca server (fungsi drive-files, aksi "tarik-nama") — yang dikirim ke browser hanya NAMA, bukan isi file.
//  DEMO: tidak ada server → memakai folder CONTOH (nama karangan) dan DIBERI TAHU di layar.
//  Hasilnya hanya USULAN di form — tidak ada yang tersimpan sebelum CS menekan Buat Project. Filenya sendiri tetap dipilih / diunggah CS.
// ============================================================
import { db, MODE } from './db.js'
import { SUPABASE_URL } from './supabase.js'
import { LANGS as BAHASA } from '../config/bahasa.js'

export const DRIVE_LIVE = MODE === 'supabase'
const BHS_REGULER = ['Indonesia', 'Inggris', 'Belanda']
/** Kode di nama folder arah bahasa → nama bahasa di ATLAS. */
const KODE = { ind: 'Indonesia', indo: 'Indonesia', id: 'Indonesia', idn: 'Indonesia', eng: 'Inggris', en: 'Inggris', ing: 'Inggris', ned: 'Belanda', nl: 'Belanda', dutch: 'Belanda', bld: 'Belanda',
  man: 'Mandarin', chn: 'Mandarin', chi: 'Mandarin', mdr: 'Mandarin', jpn: 'Jepang', jep: 'Jepang', kor: 'Korea', arb: 'Arab', ara: 'Arab', ger: 'Jerman', deu: 'Jerman', jer: 'Jerman',
  fra: 'Prancis', fre: 'Prancis', pra: 'Prancis', spa: 'Spanyol', esp: 'Spanyol', rus: 'Rusia', tur: 'Turki' }
const bahasaDari = (kode) => { const b = KODE[String(kode || '').toLowerCase()]; return b && BAHASA.includes(b) ? b : '' }

/** Angka nomor invoice ("INV-1012611197417" → "1012611197417"). */
export const angkaInvoice = (no) => String(no || '').replace(/\D/g, '')

/** Baca arah bahasa dari jalur folder (mis. "1 IND - ENG"). → { asal, tujuan, teks } | null */
export function arahDariJalur(jalur = []) {
  for (const nama of jalur) {
    const m = String(nama).match(/\b([A-Za-z]{2,5})\s*[-–]\s*([A-Za-z]{2,5})\b/)
    if (!m) continue
    const asal = bahasaDari(m[1]), tujuan = bahasaDari(m[2])
    if (asal || tujuan) return { asal, tujuan, teks: `${m[1].toUpperCase()} - ${m[2].toUpperCase()}` }
  }
  return null
}

const WORD = /\.(docx?|rtf|odt)$/i
const EKST = /\.(pdf|jpe?g|png|heic|webp|tiff?|docx?|rtf|odt|xlsx?|zip|rar)$/i
/** Nama file → { no, nama, hasil }. `hasil` = file Word (hasil terjemahan), bukan dokumen sumber. */
export function bacaNamaFile(f) {
  const asli = String(f?.name || '').trim()
  const hasil = WORD.test(asli) || /wordprocessingml|msword|google-apps\.document/.test(String(f?.mime || ''))
  const polos = asli.replace(EKST, '').trim()
  const m = polos.match(/^\s*(\d{1,3})\s*[.)]\s*(.+)$/) || polos.match(/^\s*(\d{1,3})\s+(.+)$/)
  return { no: m ? Number(m[1]) : 0, nama: (m ? m[2] : polos).replace(/\s+/g, ' ').trim(), hasil }
}

/** Satu folder Drive → sub project form. */
function keSub(folder, buatSub) {
  const jalur = folder.jalur || []
  const apostille = /^\s*ap\s*-/i.test(folder.name) || jalur.some((j) => /apostil/i.test(j))
  const legalisasi = !apostille && jalur.some((j) => /legalisasi/i.test(j))
  const type = apostille ? 'apostille' : legalisasi ? 'legalisasi' : 'terjemahan'
  const terbaca = (folder.files || []).map(bacaNamaFile)
  const sumber = terbaca.filter((x) => !x.hasil && x.nama).sort((a, b) => (a.no || 999) - (b.no || 999))
  const unik = sumber.filter((x, i) => sumber.findIndex((y) => y.nama.toLowerCase() === x.nama.toLowerCase()) === i)
  const nHasil = terbaca.filter((x) => x.hasil).length
  const s = buatSub(type); const catatan = []
  let kind
  if (type === 'terjemahan') {
    const arah = arahDariJalur(jalur)
    s.lang_from = arah?.asal || 'Indonesia'; s.lang_to = arah?.tujuan && arah.tujuan !== s.lang_from ? arah.tujuan : ''
    if (!arah) catatan.push('Arah bahasa tidak terbaca dari nama folder — periksa bahasa asal & tujuan')
    else if (!arah.asal || !arah.tujuan) catatan.push(`Folder arah bahasa “${arah.teks}” belum dikenal sepenuhnya — periksa bahasa asal & tujuan`)
    if (BHS_REGULER.includes(s.lang_from) && (!s.lang_to || BHS_REGULER.includes(s.lang_to))) kind = 'reguler'
  }
  s.docs = unik.length ? unik.map((d) => ({ desc: d.nama, pages: 1, ...(kind ? { kind } : {}) })) : [{ desc: '', pages: 1 }]
  const isi = s.docs.filter((d) => d.desc.trim())
  s.description = isi.map((d, i) => `${i + 1}. ${d.desc}`).join('\n'); s.file_count = isi.length; s.pages = isi.length
  if (!unik.length) catatan.push('Folder ini belum berisi file sumber — isi dokumen manual')
  else catatan.push('Jumlah halaman tidak ada di nama file — terisi otomatis saat filenya dipasang, atau isi manual')
  if (kind) catatan.push('Reguler / Non Reguler tidak tertulis di Drive — semua diisi Reguler, ubah bila perlu')
  if (nHasil) catatan.push(`${nHasil} file Word (hasil terjemahan) di folder ini tidak dijadikan dokumen`)
  s._tarik = { sumber: 'drive', item: 0, judul: [...jalur.slice(-3), folder.name].filter(Boolean).join(' / '), catatan }
  return s
}

// Folder CONTOH untuk demo — nama karangan, mengikuti pola penamaan tim di Drive.
const CONTOH = [
  { name: 'Contoh Budi Santoso', jalur: ['2026', '1 IND - ENG', '11 NOVEMBER 2026', '19 NOVEMBER 2026'], files: [
    { name: '1. Akta Lahir Budi.jpg' }, { name: '2. Akta Lahir Sari.jpg' }, { name: '3. Akta Kawin (istri) Sari.jpg' }, { name: '4. Akta Kawin (suami) Budi.jpg' },
    { name: '5. KK Budi.jpg' }, { name: '6. KTP Budi.jpg' }, { name: '7. KTP Sari.jpg' }, { name: '1 Birth Certificate 2026 Jakarta Budi.docx' } ] },
  { name: 'AP-Contoh Budi Santoso', jalur: ['2026', 'APOSTILLE ( AP-Nomor Invoice (spasi) Nama Klien)'], files: [{ name: '1. Akta Lahir Budi.pdf' }, { name: '2. Ijazah S1 Budi.pdf' }] },
]

async function panggilServer(invoice) {
  try {
    const token = await db.token?.()
    if (!token) return { error: 'Sesi berakhir — silakan masuk ulang' }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/drive-files`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'tarik-nama', invoice }) })
    return await r.json().catch(() => ({ error: `Server ${r.status}` }))
  } catch { return { error: 'Koneksi ke server Drive gagal — periksa internet' } }
}

/**
 * Susun usulan sub project dari nama file di folder Drive milik nomor invoice ini.
 * → { ok, subs, folder:[nama], mesin: 'drive' | 'contoh', alasan? }
 */
export async function tarikDrive(invoiceNo, { buatSub }) {
  const angka = angkaInvoice(invoiceNo)
  if (angka.length < 6) return { ok: false, alasan: 'Isi nomor invoice dulu' }
  let folders; let mesin = 'drive'
  if (DRIVE_LIVE) {
    const r = await panggilServer(String(invoiceNo).trim().toUpperCase())
    if (!r.ok) return { ok: false, alasan: r.error || 'Drive tidak bisa dibaca' }
    folders = r.folders || []
  } else { mesin = 'contoh'; folders = CONTOH.map((f) => ({ ...f, name: f.name.replace('Contoh', angka) })) }
  if (!folders.length) return { ok: false, alasan: `Folder bernomor ${angka} tidak ditemukan di Drive` }
  // folder kembar (nama sama di dua tempat, mis. apostille harian & induk): pakai yang filenya paling banyak
  const pakai = []
  for (const f of [...folders].sort((a, b) => (b.files?.length || 0) - (a.files?.length || 0))) if (!pakai.some((p) => p.name.trim().toLowerCase() === f.name.trim().toLowerCase())) pakai.push(f)
  const subs = pakai.map((f) => keSub(f, buatSub)).sort((a, b) => (a.type === 'terjemahan' ? 0 : 1) - (b.type === 'terjemahan' ? 0 : 1))
  return { ok: true, subs, folder: pakai.map((f) => f.name.trim()), mesin }
}
