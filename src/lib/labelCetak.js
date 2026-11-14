// Cetak label pengiriman langsung dari ATLAS (tanpa PDF Everpro).
// Barcode Code 128 dibuat sendiri (SVG, tajam di printer thermal maupun biasa).
// Isi label mengikuti data pengiriman di ATLAS; nomor resi = resi resmi dari kurir/Everpro.
import { resiOf } from './kirim.js'

// ---------- Code 128 (set B untuk teks, set C untuk angka genap) ----------
const POLA = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112']

/** Kode nilai Code128 untuk teks (otomatis C bila semua angka & genap, selain itu B). */
export function kode128(teks) {
  const s = String(teks ?? '')
  let kode
  if (/^\d+$/.test(s) && s.length % 2 === 0 && s.length >= 4) {
    kode = [105]
    for (let i = 0; i < s.length; i += 2) kode.push(Number(s.slice(i, i + 2)))
  } else {
    kode = [104]
    for (const ch of s) { const c = ch.charCodeAt(0); if (c < 32 || c > 126) throw new Error('Karakter resi tidak didukung barcode'); kode.push(c - 32) }
  }
  const cek = kode.reduce((a, v, i) => a + v * (i || 1), 0) % 103
  return [...kode, cek, 106]
}

/** SVG barcode (lebar mengikuti kotak, modul tetap proporsional). */
export function svgBarcode(teks, tinggi = 60) {
  const kode = kode128(teks)
  let x = 10; const bar = []
  for (const k of kode) {
    const p = POLA[k]
    for (let i = 0; i < p.length; i++) { const w = Number(p[i]); if (i % 2 === 0) bar.push(`<rect x="${x}" y="0" width="${w}" height="${tinggi}"/>`); x += w }
  }
  const lebar = x + 10
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lebar} ${tinggi}" preserveAspectRatio="none" shape-rendering="crispEdges" style="width:100%;height:100%"><g fill="#000">${bar.join('')}</g></svg>`
}

export const UKURAN_LABEL = [
  { id: 'a4', label: '1 label per halaman', ket: 'Kertas biasa (A4)', w: 100, h: 150, page: 'A4' },
  { id: '8x10', label: '8 × 10 cm', ket: 'Thermal', w: 80, h: 100 },
  { id: '8x15', label: '8 × 15 cm', ket: 'Thermal', w: 80, h: 150 },
  { id: '10x10', label: '10 × 10 cm', ket: 'Thermal', w: 100, h: 100 },
  { id: '10x15', label: '10 × 15 cm', ket: 'Thermal', w: 100, h: 150 },
]

export const OPSI_LABEL = [
  ['ongkir', 'Ongkir'], ['alamat_pengirim', 'Alamat pengirim'], ['telp_pengirim', 'No telepon pengirim'],
  ['kel_penerima', 'Kelurahan penerima'], ['telp_penerima', 'No telepon penerima'], ['logo', 'Logo'], ['tanggal', 'Tanggal print'],
]
export const OPSI_BAWAAN = { ongkir: true, alamat_pengirim: true, telp_pengirim: true, kel_penerima: true, telp_penerima: true, logo: false, tanggal: false, templat: 'kurir', ukuran: '10x15' }
const KUNCI = 'atlas-label-opsi'
export function bacaOpsiLabel() { try { return { ...OPSI_BAWAAN, ...JSON.parse(localStorage.getItem(KUNCI) || '{}') } } catch { return { ...OPSI_BAWAAN } } }
export function simpanOpsiLabel(o) { try { localStorage.setItem(KUNCI, JSON.stringify(o)) } catch { /* abaikan */ } }

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const rp = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID')
const fmtTgl = (d) => new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** HTML satu label (bagian kurir). */
function satuLabel(r, o, merek) {
  const resi = resiOf(r) || ''
  const pg = r.pengirim || {}, pn = r.penerima || {}, pk = r.paket || {}, kr = r.kurir || {}
  const ongkir = r.biaya_aktual?.total || r.biaya?.total || kr.total || 0
  const cod = pk.cod ? Number(pk.cod_nilai || 0) : 0
  const alamatPn = [pn.alamat, o.kel_penerima ? (pn.kelurahan || pn.lokasi || '') : '', pn.kodepos].filter(Boolean).join(', ')
  const noOrder = r.everpro?.client_order_no || r.kode || ''
  return `<section class="lbl">
    <div class="top">
      <div class="kiri">${o.logo ? `<div class="merek">${esc(merek)}</div>` : ''}${kr.logo ? `<img class="kurir-logo" src="${esc(kr.logo)}" alt="">` : ''}<div class="kurir">${esc(kr.kurir || '')} <b>${esc(kr.layanan || '')}</b></div></div>
      <div class="jenis">${cod ? 'COD' : 'NON COD'}</div>
    </div>
    ${resi ? `<div class="bc">${svgBarcode(resi)}</div><div class="resi">${esc(resi)}</div>` : '<div class="resi kosong">RESI BELUM ADA</div>'}
    <div class="info">${noOrder ? `<span>No. order: <b>${esc(noOrder)}</b></span>` : ''}<span>Berat: <b>${pk.berat_gram ? (pk.berat_gram / 1000).toLocaleString('id-ID') + ' kg' : '-'}</b></span><span>Koli: <b>${esc(pk.jumlah || 1)}</b></span>${kr.jenis ? `<span>${kr.jenis === 'DROP' ? 'Drop-off' : 'Pickup'}</span>` : ''}</div>
    ${o.ongkir || cod ? `<div class="biaya">${o.ongkir ? `<span>Biaya pengiriman: <b>${rp(ongkir)}</b></span>` : ''}${cod ? `<span class="cod">Tagih COD: <b>${rp(cod)}</b></span>` : ''}</div>` : ''}
    <div class="pihak">
      <div><p class="kep">PENGIRIM</p><p class="nm">${esc(pg.nama || '')}</p>${o.telp_pengirim && pg.telp ? `<p><b>${esc(pg.telp)}</b></p>` : ''}${o.alamat_pengirim ? `<p>${esc([pg.alamat, pg.kodepos].filter(Boolean).join(', '))}</p>` : ''}</div>
      <div><p class="kep">PENERIMA</p><p class="nm">${esc(pn.nama || '')}</p>${o.telp_penerima && pn.telp ? `<p><b>${esc(pn.telp)}</b></p>` : ''}<p>${esc(alamatPn)}</p>${pn.catatan ? `<p class="cat">Patokan: ${esc(pn.catatan)}</p>` : ''}</div>
    </div>
    <div class="isi">Isi: ${esc(pk.isi || 'Dokumen')}${r.catatan_kurir ? ` · Catatan: ${esc(r.catatan_kurir)}` : ''}</div>
    ${o.tanggal ? `<div class="tgl">Dicetak ${esc(fmtTgl(Date.now()))}</div>` : ''}
  </section>`
}

/** Bagian untuk pelanggan (template "Resi Kurir & Pelanggan"). */
function bagianPelanggan(r, o, merek) {
  const resi = resiOf(r) || '', pn = r.penerima || {}, kr = r.kurir || {}
  return `<section class="lbl plg">
    <p class="kep">SALINAN PELANGGAN${o.logo ? ` · ${esc(merek)}` : ''}</p>
    <p>Kurir: <b>${esc(kr.kurir || '')} ${esc(kr.layanan || '')}</b></p>
    <p>No. resi: <b class="mono">${esc(resi || '-')}</b></p>
    <p>Penerima: <b>${esc(pn.nama || '')}</b></p>
    ${r.invoice_no ? `<p>Invoice: <b>${esc(r.invoice_no)}</b></p>` : ''}
    <p>Isi: ${esc(r.paket?.isi || 'Dokumen')}</p>
    ${o.ongkir ? `<p>Ongkir: <b>${rp(r.biaya_aktual?.total || r.biaya?.total || kr.total || 0)}</b></p>` : ''}
    <p class="cat">Lacak paket dengan nomor resi di situs kurir.</p>
  </section>`
}

/** Buka jendela cetak berisi label untuk `rows`. Kembalikan false bila pop-up diblokir. */
export function cetakLabelAtlas(rows, o, merek = '247 Translator') {
  const u = UKURAN_LABEL.find((x) => x.id === o.ukuran) || UKURAN_LABEL[4]
  const w = window.open('', '_blank'); if (!w) return false
  const halaman = rows.map((r) => {
    const a = satuLabel(r, o, merek)
    if (o.templat !== 'pelanggan') return `<div class="hal">${a}</div>`
    return u.page ? `<div class="hal">${a}<div class="potong">✂ potong di sini</div>${bagianPelanggan(r, o, merek)}</div>` : `<div class="hal">${a}</div><div class="hal">${bagianPelanggan(r, o, merek)}</div>`
  }).join('')
  const kecil = u.w <= 80 || u.h <= 100
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Label ${rows.length} pengiriman</title><style>
    @page{size:${u.page ? 'A4' : `${u.w}mm ${u.h}mm`};margin:${u.page ? '12mm' : '0'}}
    *{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .hal{width:${u.w}mm;${u.page ? '' : `height:${u.h}mm;`}padding:${kecil ? '2.5mm' : '3.5mm'};page-break-after:always;overflow:hidden}
    .hal:last-child{page-break-after:auto}
    .lbl{border:1.5px solid #000;padding:${kecil ? '2mm' : '3mm'};font-size:${kecil ? '8.5px' : '10px'};line-height:1.3;display:flex;flex-direction:column;gap:${kecil ? '1.5mm' : '2mm'}}
    .top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #000;padding-bottom:1.5mm;gap:2mm}
    .kiri{display:flex;align-items:center;gap:2mm;flex-wrap:wrap}.merek{font-weight:800;font-size:1.15em}.kurir{font-size:1.25em}.kurir-logo{height:${kecil ? '6mm' : '8mm'};max-width:22mm;object-fit:contain}
    .jenis{border:1.5px solid #000;padding:.5mm 2mm;font-weight:800;font-size:1.2em;white-space:nowrap}
    .bc{height:${kecil ? '12mm' : '16mm'};margin:0 auto;width:92%}.resi{text-align:center;font-family:'Courier New',monospace;font-weight:800;font-size:${kecil ? '13px' : '16px'};letter-spacing:1px}.kosong{padding:4mm;border:1px dashed #000}
    .info,.biaya{display:flex;flex-wrap:wrap;gap:1mm 3mm;border-top:1px dashed #000;padding-top:1.2mm}.cod{font-size:1.2em}
    .pihak{display:grid;grid-template-columns:1fr 1.25fr;gap:2.5mm;border-top:1px solid #000;padding-top:1.5mm}.pihak p{margin:0 0 .6mm}.kep{font-size:.85em;color:#333;letter-spacing:.5px;margin:0 0 .5mm}.nm{font-weight:800;font-size:1.15em}.cat{font-style:italic}
    .isi,.tgl{border-top:1px dashed #000;padding-top:1.2mm}.tgl{text-align:right;font-size:.9em}
    .plg p{margin:0 0 .8mm}.mono{font-family:'Courier New',monospace}.potong{text-align:center;border-top:1px dashed #000;margin:4mm 0;font-size:10px;color:#555}
    @media screen{body{background:#eee;padding:10px}.hal{background:#fff;margin:0 auto 10px;box-shadow:0 1px 4px #0003}}
  </style></head><body>${halaman}<script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`)
  w.document.close()
  return true
}
