// ============================================================
//  PEMISAH DATA & SPESIMEN PEJABAT — pembaca berkas, pemotong gambar, dan pembuat Word (.docx asli).
//  • Semua pengolahan gambar di perangkat (canvas). Potongan = bagian gambar ASLI; tidak ada yang digambar ulang.
//  • .docx dirakit sendiri (OOXML + JSZip) — teks bisa diedit, gambar tertanam, proporsi dipertahankan.
//  • Tidak ada isi dokumen yang ditulis ke log.
// ============================================================
export const JENIS_SPESIMEN = { ttd: 'Tanda tangan', paraf: 'Paraf', stempel: 'Stempel / cap instansi' }
export const JENIS_NOMOR = ['NIDN', 'NIDK', 'NUPTK', 'NRP', 'NIK', 'NIY', 'Lainnya']
export const STATUS_PNS = { tidak_tahu: 'Belum diketahui', pns: 'PNS', bukan: 'Bukan PNS' }
const MAKS_SISI = 2200
let seq = 0
export const idBaru = (p = 'x') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`

const kanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c }
const muatGambar = (src) => new Promise((ok, gagal) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => gagal(new Error('Gambar tidak bisa dibuka')); im.src = src })
const keUrl = (c, mutu = 0.9) => c.toDataURL('image/jpeg', mutu)
function kecilkan(sumber, w, h) {
  const k = Math.min(1, MAKS_SISI / Math.max(w, h)); const c = kanvas(w * k, h * k); const g = c.getContext('2d')
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high'; g.drawImage(sumber, 0, 0, c.width, c.height); return c
}
const halaman = (file, no, c, ket = '') => ({ id: idBaru('h'), fileName: file.name, no, url: keUrl(c), w: c.width, h: c.height, ket })

async function dariGambar(file) {
  const url = URL.createObjectURL(file)
  try { const im = await muatGambar(url); return [halaman(file, 1, kecilkan(im, im.naturalWidth, im.naturalHeight))] } finally { URL.revokeObjectURL(url) }
}
async function dariPdf(file, onProgres) {
  const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?raw')])
  if (!dariPdf.siap) { lib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([worker.default], { type: 'text/javascript' })), { type: 'module' }); dariPdf.siap = true }
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const out = []
  for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) {
    const page = await pdf.getPage(i); const base = page.getViewport({ scale: 1 })
    const vp = page.getViewport({ scale: Math.min(3, MAKS_SISI / Math.max(base.width, base.height)) })
    const c = kanvas(vp.width, vp.height); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
    await page.render({ canvasContext: g, viewport: vp }).promise
    out.push(halaman(file, i, c)); onProgres?.(i / pdf.numPages)
  }
  const total = pdf.numPages; pdf.destroy?.()
  return Object.assign(out, { terpotong: total > 40 ? total : 0 })
}
/** DOCX: halaman 1 = teks dokumen digambar ke kanvas (supaya nama/jabatan terbaca), berikutnya = tiap gambar di dalam dokumen. */
async function dariDocx(file) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) throw new Error('Bukan file Word yang valid')
  const para = xml.split(/<\/w:p>/).map((p) => (p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim()).filter(Boolean)
  const out = []
  if (para.length) {
    const W = 1240, pad = 70, lh = 30; const ukur = kanvas(10, 10).getContext('2d'); ukur.font = '22px Arial, sans-serif'
    const baris = []
    for (const p of para) { let b = ''; for (const kata of p.split(/\s+/)) { const coba = b ? `${b} ${kata}` : kata; if (ukur.measureText(coba).width > W - pad * 2 && b) { baris.push(b); b = kata } else b = coba } baris.push(b); baris.push('') }
    for (let i = 0, no = 1; i < baris.length && no <= 6; i += 54, no++) {
      const bag = baris.slice(i, i + 54); const c = kanvas(W, 1754); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#111'; g.font = '22px Arial, sans-serif'
      bag.forEach((t, k) => g.fillText(t, pad, pad + 24 + k * lh)); out.push(halaman(file, no, c, 'teks dokumen'))
    }
  }
  const media = Object.keys(zip.files).filter((n) => /^word\/media\/[^/]+\.(png|jpe?g|gif|bmp|webp)$/i.test(n)).sort()
  let no = out.length
  for (const n of media.slice(0, 30)) {
    const blob = await zip.file(n).async('blob'); const url = URL.createObjectURL(blob)
    try { const im = await muatGambar(url); if (im.naturalWidth < 40 || im.naturalHeight < 40) continue; out.push(halaman(file, ++no, kecilkan(im, im.naturalWidth, im.naturalHeight), `gambar di dalam dokumen (${n.split('/').pop()})`)) } catch { /* gambar tak didukung browser — dilewati */ } finally { URL.revokeObjectURL(url) }
  }
  if (!out.length) throw new Error('Dokumen Word ini tidak berisi teks maupun gambar yang bisa dibaca')
  return out
}
/** Berkas → daftar halaman bergambar. Melempar Error berisi alasan yang bisa ditampilkan (tanpa isi dokumen). */
export async function bacaBerkas(file, onProgres) {
  const nama = file.name.toLowerCase()
  if (file.size > 40 * 1024 * 1024) throw new Error('File terlalu besar (maks 40 MB)')
  if (/\.pdf$/.test(nama) || file.type === 'application/pdf') return dariPdf(file, onProgres)
  if (/\.docx$/.test(nama)) return dariDocx(file)
  if (/\.(jpe?g|png)$/.test(nama) || /^image\/(jpeg|png)$/.test(file.type)) return dariGambar(file)
  if (/\.doc$/.test(nama)) throw new Error('Format .doc lama belum didukung — simpan ulang sebagai .docx atau PDF')
  throw new Error('Jenis file tidak didukung (pakai PDF, JPG, JPEG, PNG, atau DOCX)')
}

/** Potong bagian gambar ASLI. kotak = {x,y,w,h} dalam piksel halaman; rot = 0/90/180/270. Hasil PNG (data URL) + ukurannya. */
export async function potongGambar(urlHalaman, kotak, rot = 0) {
  const im = await muatGambar(urlHalaman)
  const x = Math.max(0, Math.round(kotak.x)), y = Math.max(0, Math.round(kotak.y))
  const w = Math.max(4, Math.min(im.naturalWidth - x, Math.round(kotak.w))), h = Math.max(4, Math.min(im.naturalHeight - y, Math.round(kotak.h)))
  const miring = rot === 90 || rot === 270; const c = kanvas(miring ? h : w, miring ? w : h); const g = c.getContext('2d')
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.translate(c.width / 2, c.height / 2); g.rotate((rot * Math.PI) / 180); g.drawImage(im, x, y, w, h, -w / 2, -h / 2, w, h)
  return { url: c.toDataURL('image/png'), w: c.width, h: c.height }
}
/** Kotak AI (skala 0–1000) → piksel halaman, dengan sedikit kelonggaran. null bila tidak masuk akal. */
export function kotakDariAi(k, hal, longgar = 0.012) {
  const n = (v) => Math.max(0, Math.min(1000, Number(v)))
  if (!k || [k.x1, k.y1, k.x2, k.y2].some((v) => !Number.isFinite(Number(v)))) return null
  const x1 = Math.min(n(k.x1), n(k.x2)), x2 = Math.max(n(k.x1), n(k.x2)), y1 = Math.min(n(k.y1), n(k.y2)), y2 = Math.max(n(k.y1), n(k.y2))
  if (x2 - x1 < 8 || y2 - y1 < 8) return null
  const px = hal.w * longgar, py = hal.h * longgar
  const x = Math.max(0, (x1 / 1000) * hal.w - px), y = Math.max(0, (y1 / 1000) * hal.h - py)
  return { x, y, w: Math.min(hal.w - x, ((x2 - x1) / 1000) * hal.w + px * 2), h: Math.min(hal.h - y, ((y2 - y1) / 1000) * hal.h + py * 2) }
}
export const tumpang = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

export const pejabatKosong = (extra = {}) => ({ id: idBaru('p'), nama: '', status_pns: 'tidak_tahu', nip: '', jenis_lain: '', nomor_lain: '', jabatan: '', instansi: '', lokasi: '', alamat: '', alamat_ok: false, alamat_sumber: [], alamat_dicari_at: '', alamat_asal: '', sumber: [], spesimen: [], ragu: [], diperiksa: false, ...extra })
/** Hasil AI satu halaman → daftar pejabat (belum ada potongan; potongan dibuat pemanggil dari kotak). NIDN dkk. TIDAK pernah menjadi NIP. */
export function pejabatDariAi(data, hal) {
  return (Array.isArray(data?.pejabat) ? data.pejabat : []).filter((x) => x && (String(x.nama || '').trim() || (x.ttd || []).length || (x.stempel || []).length)).map((x) => {
    const label = String(x.label_nomor || '').trim().replace(/[.:]+$/, ''); const nomor = String(x.nomor || '').trim()
    const adaNip = /^nip$/i.test(label)
    const jenis = !label ? '' : JENIS_NOMOR.find((j) => j.toLowerCase() === label.toLowerCase()) || label
    return {
      p: pejabatKosong({
        nama: String(x.nama || '').trim(), jabatan: String(x.jabatan || '').trim(), instansi: String(x.instansi || '').trim(), lokasi: String(x.lokasi || '').trim(),
        alamat: String(x.alamat || '').trim(), alamat_asal: String(x.alamat || '').trim() ? 'dokumen' : '',
        // Label "NIP" tercetak → nomor ditaruh di kolom NIP, tetapi status PNS tetap "Belum diketahui" sampai dikonfirmasi pengguna.
        nip: adaNip ? nomor : '', nip_tercetak: adaNip && !!nomor, jenis_lain: adaNip ? '' : (nomor ? (jenis || 'Lainnya') : ''), nomor_lain: adaNip ? '' : nomor,
        sumber: [{ fileName: hal.fileName, no: hal.no, pageId: hal.id }], ragu: Array.isArray(x.ragu) ? x.ragu.map(String) : [],
      }),
      kotak: { ttd: (x.ttd || []).map((k) => kotakDariAi(k, hal)).filter(Boolean), paraf: (x.paraf || []).map((k) => kotakDariAi(k, hal)).filter(Boolean), stempel: (x.stempel || []).map((k) => kotakDariAi(k, hal)).filter(Boolean) },
      bertumpuk: /^ya$/i.test(String(x.bertumpuk || '')),
    }
  })
}
const normNama = (s) => String(s || '').toLowerCase().replace(/[,.]/g, ' ').replace(/\b(s\.?\s?\w{1,4}|m\.?\s?\w{1,4}|dr|drs|dra|ir|prof|h|hj)\b/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
/** Pasangan pejabat yang NAMANYA mirip — hanya SARAN; penggabungan diputuskan pengguna setelah membandingkan nomor/jabatan/instansi. */
export function saranGabung(list) {
  const out = []
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = normNama(list[i].nama), b = normNama(list[j].nama)
    if (a && a.length >= 4 && a === b) out.push([list[i].id, list[j].id])
  }
  return out
}
/** Kekurangan seorang pejabat (untuk status & daftar sebelum ekspor). */
export function kekurangan(p) {
  const k = []
  if (!p.nama.trim()) k.push('nama')
  if (!p.jabatan.trim()) k.push('jabatan')
  if (!p.instansi.trim()) k.push('instansi')
  if (!p.alamat.trim()) k.push('alamat instansi'); else if (!p.alamat_ok) k.push('alamat belum dikonfirmasi')
  if (p.status_pns === 'tidak_tahu') k.push('status PNS belum dikonfirmasi')
  if (p.status_pns === 'pns' && !p.nip.trim()) k.push('NIP')
  if (p.nomor_lain.trim() && !p.jenis_lain.trim()) k.push('jenis nomor identitas')
  const pakai = (j) => p.spesimen.filter((s) => s.jenis === j && s.pakai)
  if (!pakai('ttd').length) k.push('tanda tangan')
  if (!pakai('stempel').length) k.push('stempel')
  if (p.spesimen.some((s) => s.pakai && s.tinjau)) k.push('spesimen bertumpuk belum ditinjau')
  return k
}
export const statusPejabat = (p) => (p.diperiksa ? 'sudah' : kekurangan(p).length ? 'kurang' : 'belum')
/** Baris nomor untuk formulir: NIP hanya untuk PNS yang dikonfirmasi; nomor lain memakai labelnya sendiri. */
export function barisNomor(p) {
  const out = [['NIP', p.status_pns === 'pns' && p.nip.trim() ? p.nip.trim() : '-']]
  if (p.nomor_lain.trim()) out.push([p.jenis_lain.trim() || 'Nomor identitas', p.nomor_lain.trim()])
  return out
}

// ---------- Word (.docx) ----------
const x = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const run = (t, { b, sz = 22, color, i } = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`
const par = (isi, { jc, after = 120, before = 0, ind } = {}) => `<w:p><w:pPr>${jc ? `<w:jc w:val="${jc}"/>` : ''}<w:spacing w:before="${before}" w:after="${after}"/>${ind ? `<w:ind w:left="${ind}" w:hanging="${ind}"/>` : ''}</w:pPr>${isi}</w:p>`
const EMU = 9525 // 1 px (96 dpi)
function gambarXml(rid, n, w, h, maksWcm, maksHcm) {
  const k = Math.min((maksWcm * 360000) / (w * EMU), (maksHcm * 360000) / (h * EMU), 1.6) // jangan diperbesar berlebihan
  const cx = Math.round(w * EMU * k), cy = Math.round(h * EMU * k)
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Spesimen ${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="spesimen${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
}
const BORDER = (v) => ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="${v}" w:sz="8" w:space="0" w:color="000000"/>`).join('')
const sel = (isi, w, { span, tinggi } = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span ? `<w:gridSpan w:val="${span}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>${isi}</w:tc>`
const brs = (sels, tinggi) => `<w:tr><w:trPr>${tinggi ? `<w:trHeight w:val="${tinggi}" w:hRule="atLeast"/>` : ''}<w:cantSplit/></w:trPr>${sels}</w:tr>`
const KEPADA = 'Direktur Jenderal Administrasi Hukum Umum Kementerian Hukum, d/a. Jl. H.R. Rasuna Said Kav 6-7 Kuningan Jakarta 12940'

/** Rakit .docx. `daftar` = pejabat berurutan. Mengembalikan Blob. Koreksi pengguna (form) adalah satu-satunya sumber isi. */
export async function buatDocx(daftar) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip(); const rels = []; let n = 0
  const tanam = (s, maksW, maksH) => { n += 1; const rid = `rImg${n}`; zip.file(`word/media/spesimen${n}.png`, (s.urlBersih || s.url).split(',')[1], { base64: true }); rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/spesimen${n}.png"/>`); return gambarXml(rid, n, s.w, s.h, maksW, maksH) }
  const kosong = (t) => par(run(t, { sz: 18, color: '666666', i: true }), { jc: 'center', after: 0 })
  const badan = daftar.map((p, idx) => {
    const pakai = (j) => p.spesimen.filter((s) => s.jenis === j && s.pakai)
    const ttd = pakai('ttd').slice(0, 2), prf = pakai('paraf').slice(0, 2), cap = pakai('stempel').slice(0, 1)
    const data = [['Nama Pejabat', p.nama.trim() || '-'], ...barisNomor(p), ['Jabatan', p.jabatan.trim() || '-'], ['Alamat Instansi', [p.instansi.trim(), p.alamat.trim()].filter(Boolean).join(' — ') || '-']]
    const tabelData = `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblInd w:w="200" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="2300"/><w:gridCol w:w="300"/><w:gridCol w:w="6400"/></w:tblGrid>${data.map(([l, v]) => brs(sel(par(run(l), { after: 60 }), 2300) + sel(par(run(':'), { after: 60 }), 300) + sel(par(run(v), { after: 60 }), 6400))).join('')}</w:tbl>`
    const dua = (list, teksKosong, maksH) => [0, 1].map((i) => sel(list[i] ? par(tanam(list[i], 5.4, maksH), { jc: 'center', after: 0 }) : kosong(i === 0 || list.length ? teksKosong : teksKosong), 3550)).join('')
    const label = (a, b) => sel(par(run(a), { after: 600 }) + (b ? par(run(b, { sz: 18 }), { after: 0 }) : ''), 1900)
    const tabel = `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${BORDER('single')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="1900"/><w:gridCol w:w="3550"/><w:gridCol w:w="3550"/></w:tblGrid>`
      + brs(label('Tanda Tangan', '*mohon bubuhkan 2 tanda tangan') + dua(ttd, 'Tanda tangan tidak tersedia', 3.2), 2700)
      + brs(label('Paraf', '*mohon bubuhkan 2 paraf') + dua(prf, 'Paraf tidak tersedia', 3.0), 2700)
      + brs(label('Cap/Stempel') + sel(cap[0] ? par(tanam(cap[0], 6.5, 4.2), { jc: 'left', after: 0 }) : kosong('Stempel tidak tersedia'), 7100, { span: 2 }), 2800)
      + '</w:tbl>'
    return par(run('LAMPIRAN FORMULIR 01', { b: true }), { jc: 'center', after: 240 })
      + par(run('Kepada: ', { b: true }) + run(KEPADA, { b: true }), { jc: 'both', ind: 900, after: 300 })
      + par(run('Perihal : PENYAMPAIAN SPESIMEN TANDA TANGAN', { b: true, sz: 24 }), { jc: 'center', after: 240 })
      + par(run('Dengan ini menyampaikan spesimen (contoh tanda tangan) dan cap pejabat sebagai berikut.'), { after: 120 })
      + tabelData + par('', { after: 160 }) + tabel
      + par(run('Demikian Disampaikan dengan sebenar-benarnya.'), { before: 200, after: 120 })
      + par(run('* (tanggal)', { b: true, sz: 18 }), { after: 0 }) + par(run('** (nama/jabatan/tanda tangan/stempel)', { b: true, sz: 18 }), { after: 0 })
      + (idx < daftar.length - 1 ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '')
  }).join('')
  return rakit(zip, badan, rels)
}
/** Catatan pemeriksaan — dokumen TERPISAH dari formulir: sumber data, sumber & tanggal pencarian alamat, tanda tinjauan. */
export async function buatCatatanDocx(daftar, pemeriksa = '') {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const tgl = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }) }
  const badan = par(run('CATATAN PEMERIKSAAN — PEMISAH DATA & SPESIMEN PEJABAT', { b: true, sz: 24 }), { after: 120 })
    + par(run(`Dibuat ${tgl(new Date().toISOString())}${pemeriksa ? ` oleh ${pemeriksa}` : ''}. Dokumen ini terpisah dari formulir spesimen.`, { sz: 20, color: '555555' }), { after: 240 })
    + daftar.map((p, i) => {
      const kur = kekurangan(p)
      const baris = [
        `Status: ${{ sudah: 'Sudah diperiksa', kurang: 'Perlu dilengkapi', belum: 'Belum diperiksa' }[statusPejabat(p)]}${kur.length ? ` — kurang: ${kur.join(', ')}` : ''}`,
        `Sumber data: ${p.sumber.length ? p.sumber.map((s) => `${s.fileName} hal. ${s.no}`).join('; ') : 'diisi manual'}`,
        `Status PNS: ${STATUS_PNS[p.status_pns]}${p.nip_tercetak ? ' (label NIP tercetak di dokumen)' : ''}`,
        `Alamat instansi: ${p.alamat.trim() ? (p.alamat_ok ? 'dikonfirmasi pengguna' : 'BELUM dikonfirmasi') : 'kosong'} · asal: ${{ dokumen: 'tercetak di dokumen', cari: 'pencarian internet', manual: 'diisi manual', '': '-' }[p.alamat_asal || '']}${p.alamat_dicari_at ? ` · dicari ${tgl(p.alamat_dicari_at)}` : ''}`,
        ...(p.alamat_sumber || []).map((s) => `Sumber alamat: ${s.judul ? `${s.judul} — ` : ''}${s.url}`),
        ...p.spesimen.map((s) => `${JENIS_SPESIMEN[s.jenis]}: ${s.fileName || '-'} hal. ${s.no || '-'}${s.pakai ? ' · dipakai di Word' : ' · tidak dipakai'}${s.asal === 'ai' ? ' · area dari deteksi AI' : ' · area dipilih manual'}${s.bertumpuk ? ' · BERTUMPUK dengan goresan/cap lain' : ''}${s.tinjau ? ' · belum ditinjau' : ''}`),
        ...(p.spesimen.some((s) => s.jenis === 'paraf') ? [] : ['Paraf: tidak tersedia di dokumen sumber']),
        ...(p.ragu?.length ? [`Kolom yang ditandai ragu oleh pembaca AI: ${p.ragu.join(', ')}`] : []),
      ]
      return par(run(`${i + 1}. ${p.nama.trim() || '(nama belum diisi)'}`, { b: true }), { before: 160, after: 60 }) + baris.map((t) => par(run(t, { sz: 20 }), { after: 40, ind: 300 })).join('')
    }).join('')
  return rakit(zip, badan, [])
}
async function rakit(zip, badan, rels) {
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join('')}</Relationships>`)
  zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>')
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${badan}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1418" w:bottom="1134" w:left="1418" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' })
}
export function unduhBlob(blob, nama) {
  const a = document.createElement('a'); const url = URL.createObjectURL(blob); a.href = url; a.download = nama; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000)
}
export const namaBerkas = (s) => String(s || 'pejabat').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'pejabat'

// ---------- Hapus latar (kertas → transparan) ----------
// Bukan AI dan bukan gambar ulang: tiap piksel goresan/cap tetap piksel dari gambar asli; yang dibuang hanya warna kertas.
// Cara: (1) warna kertas diperkirakan per wilayah (kisi kasar, diinterpolasi) supaya bayangan/kertas tidak rata tetap bersih,
// (2) tingkat "tinta" tiap piksel = seberapa jauh lebih gelap/berwarna dari kertas → jadi transparansi yang halus (bukan ambang keras),
// (3) warna tepi dipisahkan dari warna kertas supaya tidak ada pinggiran putih/abu saat ditempel di Word.
export const TINGKAT_LATAR = { halus: 'Halus', sedang: 'Sedang', kuat: 'Kuat' }
const FAKTOR_LATAR = { halus: 0.65, sedang: 1, kuat: 1.7 }
export async function hapusLatar(url, tingkat = 'sedang') {
  const im = await muatGambar(url); const w = im.naturalWidth, h = im.naturalHeight
  const c = kanvas(w, h); const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0)
  const id = g.getImageData(0, 0, w, h); const d = id.data
  // (1) kertas per kisi: rata-rata piksel paling terang (persentil ~75–97) di tiap sel
  const GX = Math.max(2, Math.min(8, Math.round(w / 90))), GY = Math.max(2, Math.min(8, Math.round(h / 90)))
  const kisi = new Float32Array(GX * GY * 3); const sah = new Uint8Array(GX * GY)
  const terang = (i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
  let globalL = []; const langkah = Math.max(1, Math.round(Math.sqrt((w * h) / 40000)))
  for (let y = 0; y < h; y += langkah) for (let x = 0; x < w; x += langkah) globalL.push(terang((y * w + x) * 4))
  globalL.sort((a, b) => a - b); const kertasGlobal = globalL[Math.floor(globalL.length * 0.9)] || 255
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    const x0 = Math.floor((gx * w) / GX), x1 = Math.floor(((gx + 1) * w) / GX), y0 = Math.floor((gy * h) / GY), y1 = Math.floor(((gy + 1) * h) / GY)
    const L = []; for (let y = y0; y < y1; y += langkah) for (let x = x0; x < x1; x += langkah) L.push(terang((y * w + x) * 4))
    L.sort((a, b) => a - b); const lo = L[Math.floor(L.length * 0.75)] ?? 255, hi = L[Math.floor(L.length * 0.97)] ?? 255
    let r = 0, gg = 0, b = 0, n = 0
    for (let y = y0; y < y1; y += langkah) for (let x = x0; x < x1; x += langkah) { const i = (y * w + x) * 4, t = terang(i); if (t >= lo && t <= hi) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++ } }
    const k = (gy * GX + gx) * 3
    // sel yang hampir seluruhnya tertutup tinta (jauh lebih gelap dari kertas umum) tidak dipercaya → diisi dari tetangga
    if (n && lo >= kertasGlobal * 0.8) { kisi[k] = r / n; kisi[k + 1] = gg / n; kisi[k + 2] = b / n; sah[gy * GX + gx] = 1 }
  }
  let sr = 0, sg = 0, sb = 0, sn = 0
  for (let i = 0; i < GX * GY; i++) if (sah[i]) { sr += kisi[i * 3]; sg += kisi[i * 3 + 1]; sb += kisi[i * 3 + 2]; sn++ }
  if (!sn) { sr = sg = sb = kertasGlobal; sn = 1 }
  for (let i = 0; i < GX * GY; i++) if (!sah[i]) { kisi[i * 3] = sr / sn; kisi[i * 3 + 1] = sg / sn; kisi[i * 3 + 2] = sb / sn }
  const B = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    const fy = Math.min(GY - 1, Math.max(0, ((y + 0.5) * GY) / h - 0.5)), y0 = Math.floor(fy), y1 = Math.min(GY - 1, y0 + 1), ty = fy - y0
    for (let x = 0; x < w; x++) {
      const fx = Math.min(GX - 1, Math.max(0, ((x + 0.5) * GX) / w - 0.5)), x0 = Math.floor(fx), x1 = Math.min(GX - 1, x0 + 1), tx = fx - x0
      const a = (y0 * GX + x0) * 3, b2 = (y0 * GX + x1) * 3, c2 = (y1 * GX + x0) * 3, e = (y1 * GX + x1) * 3, o = (y * w + x) * 3
      for (let k = 0; k < 3; k++) B[o + k] = (kisi[a + k] * (1 - tx) + kisi[b2 + k] * tx) * (1 - ty) + (kisi[c2 + k] * (1 - tx) + kisi[e + k] * tx) * ty
    }
  }
  // (2) tingkat tinta & derau kertas
  const T = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) { const i = p * 4, o = p * 3; let m = 0; for (let k = 0; k < 3; k++) { const v = (B[o + k] - d[i + k]) / Math.max(40, B[o + k]); if (v > m) m = v } T[p] = m }
  const contoh = []; for (let p = 0; p < w * h; p += langkah * 3 + 1) contoh.push(T[p]); contoh.sort((a, b) => a - b)
  const derau = contoh[Math.floor(contoh.length * 0.6)] || 0 // lebih dari separuh potongan biasanya kertas
  const f = FAKTOR_LATAR[tingkat] || 1
  const t0 = Math.min(0.22, Math.max(0.035, derau * 2.2 + 0.02) * f), t1 = t0 + 0.2 / Math.sqrt(f)
  const A = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) { const u = Math.min(1, Math.max(0, (T[p] - t0) / (t1 - t0))); A[p] = u * u * (3 - 2 * u) }
  // bintik lepas (debu / butir kertas): piksel samar tanpa tetangga bertinta dibuang
  const A2 = new Float32Array(A)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const p = y * w + x; if (A[p] > 0 && A[p] < 0.6) { const s = A[p - 1] + A[p + 1] + A[p - w] + A[p + w] + A[p - w - 1] + A[p - w + 1] + A[p + w - 1] + A[p + w + 1]; if (s < 0.35) A2[p] = 0 } }
  // (3) pisahkan warna tinta dari warna kertas di tepi yang setengah transparan
  let isi = 0
  for (let p = 0; p < w * h; p++) {
    const i = p * 4, o = p * 3, a = A2[p]
    if (a <= 0.004) { d[i + 3] = 0; continue }
    if (a < 0.995) for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, Math.round((d[i + k] - (1 - a) * B[o + k]) / a)))
    d[i + 3] = Math.round(a * 255); isi++
  }
  g.putImageData(id, 0, 0)
  return { url: c.toDataURL('image/png'), w, h, kosong: isi < w * h * 0.002 }
}
