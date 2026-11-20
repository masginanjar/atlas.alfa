// ============================================================
//  KOREKSI TYPO OTOMATIS — sisi browser.
//  • Hanya untuk akun yang toggle-nya dinyalakan admin (user.koreksi_typo === true). Akun OFF: tidak ada panggilan sama sekali.
//  • Browser membaca teks paragraf dari file (.docx penuh; .pdf hanya saran), mengirim HANYA teks itu ke server (fungsi typo-ai).
//    Kunci AI tidak pernah ada di browser. AI tidak menulis ulang dokumen — ia hanya menunjuk kata → koreksi.
//  • Koreksi diterapkan di browser, kata demi kata, langsung pada teks di dalam .docx (format, tabel, header/footer tidak disentuh).
//  • DEMO: tidak ada server/AI — memakai daftar contoh kecil dan diberi label jelas "contoh, bukan AI".
// ============================================================
import { db, MODE } from './db.js'
import { SUPABASE_URL } from './supabase.js'

export const TYPO_LIVE = MODE === 'supabase'
export const typoAktif = (user) => user?.koreksi_typo === true
export const ekst = (nama) => (String(nama || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
/** 'docx' = bisa dikoreksi langsung · 'saran' = hanya ditunjukkan (belum aman diedit) · null = tidak diperiksa */
export const jenisTypo = (nama) => (ekst(nama) === 'docx' ? 'docx' : ekst(nama) === 'pdf' ? 'saran' : null)
export const namaKoreksi = (nama) => { const e = String(nama).match(/\.[^.]+$/)?.[0] || ''; return `${String(nama).slice(0, String(nama).length - e.length).replace(/ \(koreksi typo\)$/i, '')} (koreksi typo)${e}` }

const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Batas kata — HARUS sama dengan saringan di server (typo-ai) supaya urutan kemunculan (k) cocok. */
const reKata = (kata) => new RegExp(`(?<![\\p{L}\\p{N}_'’\\-./@])${esc(kata)}(?![\\p{L}\\p{N}_'’\\-/@])`, 'gu')

async function panggil(aksi, body) {
  try {
    const token = await db.token?.()
    if (!token) return { ok: false, alasan: 'Sesi berakhir — silakan masuk ulang' }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/typo-ai`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ aksi, ...body }) })
    const x = await r.json().catch(() => ({ ok: false, alasan: `Server ${r.status}` }))
    if (r.status === 401) return { ok: false, alasan: 'Sesi berakhir — silakan masuk ulang' }
    return x
  } catch { return { ok: false, alasan: 'Koneksi ke server gagal — periksa internet lalu coba lagi' } }
}

const sha256 = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('')

// ---------- .docx ----------
const indukP = (n) => { let x = n.parentNode; while (x && !(x.localName === 'p' && x.namespaceURI === NS)) x = x.parentNode; return x }
/** Potongan teks satu paragraf, berurutan: { node (w:t) | null (tab / ganti baris), teks, awal }. */
function potongan(p) {
  const out = []; let pos = 0
  const jalan = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType !== 1) continue
      if (c.namespaceURI === NS && c.localName === 'p') continue // paragraf bersarang (kotak teks) dihitung sendiri
      if (c.namespaceURI === NS && c.localName === 't') { const t = c.textContent || ''; out.push({ node: c, teks: t, awal: pos }); pos += t.length; continue }
      if (c.namespaceURI === NS && ['tab', 'br', 'cr', 'noBreakHyphen'].includes(c.localName)) { out.push({ node: null, teks: ' ', awal: pos }); pos += 1; continue }
      if (c.namespaceURI === NS && ['del', 'moveFrom', 'instrText', 'delText'].includes(c.localName)) continue // teks yang sudah dihapus (tracked changes) / kode field
      jalan(c)
    }
  }
  jalan(p)
  return out
}
const teksP = (p) => potongan(p).map((s) => s.teks).join('')

async function bukaDocx(blob) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const berkas = zip.file('word/document.xml')
  if (!berkas) throw new Error('File .docx ini tidak bisa dibaca')
  const xml = await berkas.async('string')
  const dom = new DOMParser().parseFromString(xml, 'application/xml')
  if (dom.getElementsByTagName('parsererror').length) throw new Error('File .docx ini tidak bisa dibaca')
  const ps = [...dom.getElementsByTagNameNS(NS, 'p')]
  return { zip, xml, dom, ps }
}

async function teksPdf(blob) {
  const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?raw')])
  if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([worker.default], { type: 'text/javascript' }))
  const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
  const out = []
  for (let h = 1; h <= Math.min(pdf.numPages, 60); h++) {
    const isi = await (await pdf.getPage(h)).getTextContent()
    let baris = ''
    for (const it of isi.items) { baris += it.str; if (it.hasEOL) { out.push(baris); baris = '' } else if (it.str && !/\s$/.test(it.str)) baris += ' ' }
    if (baris.trim()) out.push(baris)
  }
  return out.map((t) => t.replace(/\s+/g, ' ').trim())
}

/** Baca teks file → { jenis, paragraf:[{i,t}], n_kata, hash }. Tidak mengirim apa pun. */
export async function bacaFile(blob, nama) {
  const jenis = jenisTypo(nama)
  if (!jenis) throw new Error('Format file ini belum bisa diperiksa (hanya .docx dan .pdf)')
  const buf = await blob.arrayBuffer()
  const hash = await sha256(buf)
  const semua = jenis === 'docx' ? (await bukaDocx(blob)).ps.map(teksP) : await teksPdf(blob)
  const paragraf = semua.map((t, i) => ({ i, t })).filter((x) => /\p{L}{4,}/u.test(x.t))
  const n_kata = semua.reduce((a, t) => a + (t.match(/\p{L}[\p{L}'’-]*/gu) || []).length, 0)
  return { jenis, paragraf, n_kata, hash }
}

/** Potongan kalimat di sekitar kemunculan ke-k sebuah kata. */
export function kutipan(t, kata, k) {
  const re = reKata(kata); let m, n = 0
  while ((m = re.exec(t))) { n++; if (n === k) { const a = Math.max(0, m.index - 48), b = Math.min(t.length, m.index + kata.length + 48); return { ada: true, sebelum: (a > 0 ? '…' : '') + t.slice(a, m.index), kata, sesudah: t.slice(m.index + kata.length, b) + (b < t.length ? '…' : '') } } }
  return { ada: false, sebelum: '', kata, sesudah: '' }
}

// ---------- DEMO: contoh lokal (bukan AI) ----------
const CONTOH = { terjemhaan: 'terjemahan', certifciate: 'certificate', documnet: 'document', informaton: 'information', bulna: 'bulan', recieve: 'receive', goverment: 'government', adress: 'address', seperate: 'separate', occured: 'occurred', tanggla: 'tanggal', dokumne: 'dokumen', keterangna: 'keterangan', pendidkan: 'pendidikan', translaton: 'translation' }
const KUNCI_DEMO = 'atlas_typo_demo'
const demoBaca = () => { try { return JSON.parse(localStorage.getItem(KUNCI_DEMO) || '[]') } catch { return [] } }
const demoTulis = (x) => { try { localStorage.setItem(KUNCI_DEMO, JSON.stringify(x.slice(-300))) } catch { /* penuh */ } }
function periksaDemo(paragraf) {
  const out = []
  for (const { i, t } of paragraf) {
    const hitung = {}
    for (const m of t.matchAll(/\p{L}+/gu)) {
      const w = m[0]; const ganti = CONTOH[w.toLowerCase()]; if (!ganti) continue
      if (!reKata(w).test(t)) continue
      hitung[w] = (hitung[w] || 0) + 1
      const kapital = w === w.toUpperCase(), awal = w[0] !== w[0].toLowerCase()
      const koreksi = kapital ? ganti.toUpperCase() : awal ? ganti[0].toUpperCase() + ganti.slice(1) : ganti
      const awalKalimat = /(^|[.!?:;]\s+)$/.test(t.slice(0, m.index))
      const ragu = kapital ? 'huruf besar semua — bisa nama atau teks stempel' : awal && !awalKalimat ? 'huruf besar di tengah kalimat — bisa nama' : ''
      out.push({ p: i, k: hitung[w], asli: w, koreksi, yakin: !ragu, ...(ragu ? { sebab: ragu } : {}) })
    }
  }
  return out
}

/**
 * Periksa satu file hasil terjemahan. Mengembalikan { ok, jenis, temuan:[{id,p,k,asli,koreksi,yakin,sebab,kutip}], cek_id, ulang, sebagian, demo } atau { ok:false, alasan, mati }.
 * Akun OFF tidak pernah sampai ke server.
 */
export async function periksaTypo({ user, project, sub, blob, nama }) {
  if (!typoAktif(user)) return { ok: false, mati: true, alasan: 'Koreksi Typo Otomatis tidak aktif untuk akun ini' }
  let baca
  try { baca = await bacaFile(blob, nama) } catch (e) { return { ok: false, alasan: e.message || 'File tidak bisa dibaca' } }
  if (!baca.paragraf.length) return { ok: false, kosong: true, jenis: baca.jenis, alasan: baca.jenis === 'saran' ? 'PDF ini tidak punya teks yang bisa dibaca (hasil scan) — tidak diperiksa' : 'Tidak ada teks yang bisa diperiksa di file ini' }
  let r
  if (!TYPO_LIVE) {
    const log = demoBaca(); const lama = log.find((x) => x.project_id === project.id && x.sub_id === sub.id && x.hash === baca.hash)
    await new Promise((s) => setTimeout(s, 700))
    if (lama) r = { ok: true, ulang: true, cek_id: lama.id, temuan: lama.temuan }
    else {
      const temuan = periksaDemo(baca.paragraf); const id = `demo-${Date.now()}`
      demoTulis([...log, { id, at: new Date().toISOString(), bulan: new Date().toISOString().slice(0, 7), project_id: project.id, sub_id: sub.id, user_id: user.id, hash: baca.hash, n_kata: baca.n_kata, temuan, n_yakin: temuan.filter((x) => x.yakin).length, n_dipakai: 0 }])
      r = { ok: true, cek_id: id, temuan }
    }
    r.demo = true
  } else {
    r = await panggil('periksa', { project_id: project.id, sub_id: sub.id, hash: baca.hash, ekstensi: ekst(nama), bahasa: sub.lang_to || '', n_kata: baca.n_kata, paragraf: baca.paragraf })
    if (!r.ok) return { ...r, jenis: baca.jenis }
  }
  const peta = new Map(baca.paragraf.map((x) => [x.i, x.t]))
  const temuan = (r.temuan || []).map((x, n) => ({ ...x, id: `${x.p}:${x.asli}:${x.k}:${n}`, kutip: kutipan(peta.get(x.p) || '', x.asli, x.k) })).filter((x) => x.kutip.ada)
  return { ok: true, jenis: baca.jenis, temuan, cek_id: r.cek_id || null, ulang: !!r.ulang, sebagian: !!r.sebagian, demo: !!r.demo, biaya_rp: r.biaya_rp || 0 }
}

/** Catat berapa koreksi yang dipakai (untuk laporan). Gagal mencatat tidak mengganggu pekerjaan. */
export async function catatDipakai(cek_id, dipakai) {
  if (!cek_id) return
  if (!TYPO_LIVE) { const log = demoBaca(); const x = log.find((y) => y.id === cek_id); if (x) { x.n_dipakai = dipakai; demoTulis(log) } return }
  await panggil('terapkan', { cek_id, dipakai })
}

/**
 * Terapkan koreksi terpilih ke .docx — HANYA pada kemunculan yang ditunjuk (paragraf p, kemunculan ke-k).
 * Teks diganti di dalam run aslinya, jadi font, spasi, tabel, header/footer, dan tata letak tidak berubah.
 * Setelah itu hasil diperiksa ulang: bila ada paragraf lain yang ikut berubah → dibatalkan (lempar galat).
 */
export async function terapkanDocx(blob, dipilih) {
  const d = await bukaDocx(blob)
  const sebelum = d.ps.map(teksP)
  const harap = [...sebelum]
  const urut = [...dipilih].sort((a, b) => a.p - b.p || (a.asli === b.asli ? b.k - a.k : 0))
  let n = 0
  for (const t of urut) {
    const p = d.ps[t.p]; if (!p) continue
    const seg = potongan(p); const teks = seg.map((s) => s.teks).join('')
    const re = reKata(t.asli); let m, ke = 0, awal = -1
    while ((m = re.exec(teks))) { ke++; if (ke === t.k) { awal = m.index; break } }
    if (awal < 0) continue
    const akhir = awal + t.asli.length; let pertama = true
    for (const s of seg) {
      const a = Math.max(awal, s.awal), b = Math.min(akhir, s.awal + s.teks.length)
      if (a >= b) continue
      if (!s.node) throw new Error('Kata ini terpotong tab/ganti baris — tidak aman diubah otomatis')
      const baru = s.teks.slice(0, a - s.awal) + (pertama ? t.koreksi : '') + s.teks.slice(b - s.awal)
      s.node.textContent = baru
      if (/^\s|\s$/.test(baru)) s.node.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve')
      pertama = false
    }
    harap[t.p] = harap[t.p].slice(0, awal) + t.koreksi + harap[t.p].slice(akhir); n++
  }
  if (!n) throw new Error('Tidak ada koreksi yang bisa diterapkan')
  let keluar = new XMLSerializer().serializeToString(d.dom)
  const kepala = d.xml.match(/^\s*<\?xml[^>]*\?>/)?.[0]
  if (kepala && !/^\s*<\?xml/.test(keluar)) keluar = `${kepala}\n${keluar}`
  // periksa ulang: baca kembali hasilnya; selain kata yang dikoreksi tidak boleh ada yang berubah
  const cek = new DOMParser().parseFromString(keluar, 'application/xml')
  if (cek.getElementsByTagName('parsererror').length) throw new Error('Hasil koreksi tidak lolos pemeriksaan — file asli dipakai')
  const sesudah = [...cek.getElementsByTagNameNS(NS, 'p')].map(teksP)
  if (sesudah.length !== sebelum.length || sesudah.some((x, i) => x !== harap[i])) throw new Error('Hasil koreksi tidak lolos pemeriksaan — file asli dipakai')
  const diubah = new Set(urut.map((t) => t.p))
  if (sebelum.some((x, i) => !diubah.has(i) && x !== sesudah[i])) throw new Error('Hasil koreksi tidak lolos pemeriksaan — file asli dipakai')
  d.zip.file('word/document.xml', keluar, { createFolders: false }) // tanpa entri folder baru di ZIP (Word daring bisa menolak)
  const hasil = await d.zip.generateAsync({ type: 'blob', mimeType: MIME_DOCX, compression: 'DEFLATE' })
  return { blob: hasil, n }
}

/** Laporan per penerjemah (Super Admin / pemegang izin koreksi-typo.laporan). */
export async function laporanTypo(bulan, users = []) {
  if (TYPO_LIVE) return panggil('laporan', { bulan })
  const per = new Map()
  for (const u of users.filter((x) => typoAktif(x) && x.active !== false)) per.set(u.id, { user_id: u.id, nama: u.name, file: 0, file_typo: 0, typo: 0, kata: 0, dipakai: 0, biaya_rp: 0 })
  for (const r of demoBaca().filter((x) => !bulan || x.bulan === bulan)) {
    const e = per.get(r.user_id) || { user_id: r.user_id, nama: users.find((u) => u.id === r.user_id)?.name || '—', file: 0, file_typo: 0, typo: 0, kata: 0, dipakai: 0, biaya_rp: 0 }
    e.file++; if (r.n_yakin > 0) e.file_typo++; e.typo += r.n_yakin || 0; e.kata += r.n_kata || 0; e.dipakai += r.n_dipakai || 0; per.set(r.user_id, e)
  }
  const baris = [...per.values()].map((e) => ({ ...e, per_1000: e.kata ? Math.round((e.typo / e.kata) * 10000) / 10 : 0 })).sort((a, b) => b.per_1000 - a.per_1000 || b.typo - a.typo)
  return { ok: true, demo: true, bulan: bulan || 'semua', baris, akun_aktif: [...per.values()].length }
}
