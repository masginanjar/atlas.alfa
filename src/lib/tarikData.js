// ============================================================
//  TARIK DATA (beta) — menyusun usulan sub project dari item invoice Zoho.
//  LIVE: dianalisa AI di server (fungsi tarik-data-ai; kunci tidak pernah di browser).
//  DEMO: tidak ada server → disusun pembaca aturan sederhana (zohoParse) dan DIBERI TAHU di layar bahwa itu bukan AI.
//  Hasilnya hanya USULAN di form — tidak ada yang tersimpan sebelum CS menekan Buat Project. Input manual tetap ada.
//  Privasi: item pengiriman serta baris alamat / telepon / email dibuang sebelum dikirim ke AI.
// ============================================================
import { COUNTRIES } from '../config/subtypes.js'
import { PRIORITIES } from '../config/priority.js'
import { parseInvoiceItems } from './zohoParse.js'
import { AI_LIVE, aiTarikData } from './ai.js'

const BARIS_PRIBADI = /@|(\+?\d[\d\s().-]{8,}\d)|^\s*(alamat|address|nama(\s*penerima)?|penerima|nomor\s*hp|no\.?\s*hp|hp|telp|telepon|phone|wa|whatsapp|kec|kel|kota|kab|kode\s*pos|rt\s*\/?\s*rw)\b\s*[.:：]/i
const KIRIM = /delivery|ongkir|ongkos\s*kirim|pengiriman|shipping|ekspedisi/i
/** Item yang boleh dikirim ke AI: tanpa item pengiriman, tanpa baris alamat / telepon / email. Urutan (nomor item) dipertahankan. */
export function itemUntukAi(items = []) {
  return items.map((it) => (KIRIM.test(it?.name || '')
    ? { name: 'Delivery Fee', description: '', quantity: 0, unit: '' }
    : { name: String(it?.name || '').trim(), description: String(it?.description || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !BARIS_PRIBADI.test(l)).join('\n'), quantity: Number(it?.quantity) || 0, unit: String(it?.unit || '') }))
}

const BAHASA = ['Indonesia', 'Inggris', 'Mandarin', 'Jepang', 'Korea', 'Arab', 'Belanda', 'Jerman', 'Prancis', 'Spanyol', 'Rusia', 'Lainnya']
const BHS_REGULER = ['Indonesia', 'Inggris', 'Belanda']
const norm = (s = '') => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
/** Sebutan sehari-hari lembaga → kata kunci nama resminya. */
const SINONIM = [[/kemenkumham|kumham|kemenkum|kementerian hukum|ahu/, /hukum|ahu|kumham/], [/kemenlu|kemlu|kementerian luar negeri/, /luar negeri|kemlu|kemenlu/], [/kemenag|kementerian agama/, /agama|kemenag/],
  [/kemdikbud|kemendikbud|dikti|kementerian pendidikan/, /pendidikan|dikti|dikbud/], [/notaris/, /notaris/], [/mahkamah agung/, /mahkamah agung/]]
/** Cari lembaga di Master Data. "Kedutaan <negara>" hanya cocok dengan nama yang memuat negaranya — tidak dijatuhkan ke "Kedutaan Besar" umum. */
export function cocokLembaga(nama, daftar = []) {
  const n = norm(nama); if (!n) return null
  const tepat = daftar.find((p) => norm(p.name) === n); if (tepat) return tepat
  if (/kedutaan|embassy|konsulat|teto|kbri/.test(n)) {
    const kata = n.split(' ').filter((w) => w.length > 3 && !/kedutaan|besar|embassy|konsulat|republik/.test(w))
    return daftar.find((p) => /kedutaan|embassy|konsulat/i.test(p.name) && kata.length && kata.some((w) => norm(p.name).includes(w))) || null
  }
  for (const [dari, ke] of SINONIM) if (dari.test(n)) { const hit = daftar.find((p) => ke.test(norm(p.name))); if (hit) return hit }
  return daftar.find((p) => norm(p.name).includes(n) || n.includes(norm(p.name))) || null
}
const ALIAS_NEGARA = { china: 'tiongkok', cina: 'tiongkok', rrc: 'tiongkok', usa: 'amerika serikat', us: 'amerika serikat', amerika: 'amerika serikat', uk: 'inggris', england: 'inggris', korea: 'korea selatan', netherlands: 'belanda', holland: 'belanda', germany: 'jerman', japan: 'jepang', spain: 'spanyol', france: 'prancis', perancis: 'prancis', turkey: 'turki', turkiye: 'turki', uae: 'uni emirat arab', dubai: 'uni emirat arab', saudi: 'arab saudi' }
export function cocokNegara(nama) {
  const n = norm(nama); if (!n) return ''
  const cari = ALIAS_NEGARA[n] || n
  return COUNTRIES.find((c) => norm(c) === cari) || COUNTRIES.find((c) => norm(c).startsWith(cari)) || ''
}

/** Bentuk seragam (hasil AI maupun pembaca aturan) → sub project form. `buatSub(type)` = pembuat sub kosong milik form. */
function keSubForm(u, { buatSub, lembaga }) {
  const type = ['terjemahan', 'terjemahan_nt', 'apostille', 'legalisasi', 'jasa_lain'].includes(u.jenis) ? u.jenis : 'jasa_lain'
  const s = buatSub(type); const catatan = []
  const dok = (u.dokumen || []).map((d) => ({ nama: String(d?.nama || '').replace(/^\s*\d{1,3}\s*[.)]\s*/, '').trim(), hal: Math.max(0, Math.round(Number(d?.halaman) || 0)) })).filter((d) => d.nama)
  if (type === 'terjemahan' || type === 'terjemahan_nt') {
    const a = BAHASA.includes(u.bahasa_asal) ? u.bahasa_asal : '', t = BAHASA.includes(u.bahasa_tujuan) ? u.bahasa_tujuan : ''
    s.lang_from = a || 'Indonesia'; s.lang_to = t && t !== s.lang_from ? t : ''
    if (!u.arah_pasti || !s.lang_to) catatan.push('Arah bahasa tidak tertulis jelas di invoice — periksa bahasa asal & tujuan')
    if (u.bahasa_lain) catatan.push(`Bahasa di invoice: ${u.bahasa_lain}`)
    const reguler = BHS_REGULER.includes(s.lang_from) && (!s.lang_to || BHS_REGULER.includes(s.lang_to))
    // Reguler / Non Reguler hanya untuk bahasa tim internal; bahasa vendor tanpa jenis per dokumen (pakai Prioritas sub)
    const kind = reguler ? (u.jenis_dokumen === 'non_reguler' ? 'non_reguler' : 'reguler') : undefined
    s.docs = dok.length ? dok.map((d) => ({ desc: d.nama, pages: d.hal || 1, ...(kind ? { kind } : {}) })) : [{ desc: '', pages: 1 }]
  } else if (type === 'apostille' || type === 'legalisasi') {
    s.docs = dok.length ? dok.map((d) => ({ desc: d.nama, pages: d.hal || 1 })) : [{ desc: '', pages: 1 }]
    if (type === 'legalisasi' && u.lembaga) {
      const l = cocokLembaga(u.lembaga, lembaga)
      if (l) s.institution = l.id; else catatan.push(`Lembaga di invoice: “${u.lembaga}” belum ada di daftar — buka kolom Lembaga, ketik namanya, lalu “Tambah lembaga lain”`)
    }
    if (type === 'apostille' && u.negara) { const n = cocokNegara(u.negara); if (n) s.country = n; else catatan.push(`Negara tujuan di invoice: “${u.negara}” — pilih di kolom Tujuan negara`) }
  }
  if (type === 'jasa_lain') { s.docs = undefined; const nama = dok.length ? dok.map((d) => d.nama) : [u.judul || ''].filter(Boolean); s.description = nama.map((x, i) => `${i + 1}. ${x}`).join('\n'); s.file_count = nama.length; s.pages = nama.length }
  else { const isi = s.docs.filter((d) => d.desc.trim()); s.description = isi.map((d, i) => `${i + 1}. ${d.desc}`).join('\n'); s.file_count = isi.length; s.pages = isi.reduce((n, d) => n + (Number(d.pages) || 0), 0) }
  if (!dok.length && type !== 'jasa_lain') catatan.push('Nama dokumen tidak tertulis di invoice — isi manual')
  if (PRIORITIES.includes(u.prioritas)) s.priority = u.prioritas
  if (u.catatan) catatan.push(`Keterangan invoice: ${String(u.catatan).slice(0, 160)}`)
  if (u.ragu) catatan.push('AI ragu pada item ini — periksa lebih teliti')
  s._tarik = { item: Number(u.item) || 0, judul: u.judul || '', catatan }
  return s
}

/** Pembaca aturan (demo / tanpa AI) → bentuk seragam. */
function dariAturan(items) {
  // biaya & ongkos (Fee Akomodasi, Printout, materai…) bukan pekerjaan → tidak dijadikan sub
  const p = parseInvoiceItems(items.filter((it) => !/\bfee\b|akomodasi|printout|hard\s*copy|materai|diskon/i.test(it.name || '')))
  return p.subs.map((x) => ({
    item: items.findIndex((it) => it.name === x.zoho_item) + 1, judul: x.zoho_item, jenis: x.type, bahasa_asal: x.lang_from, bahasa_tujuan: x.lang_to, arah_pasti: !!x.lang_sure,
    lembaga: x.type === 'legalisasi' ? String(x.zoho_item || '').replace(/^\s*legalisasi\s*/i, '').replace(/\s*(super\s*)?(ekspres|express|espress)\s*$/i, '').trim() : '', negara: x.country || '',
    prioritas: /same\s*-?\s*day/i.test(`${x.zoho_item} ${x.notes}`) ? 'Sameday' : /speed\s*100|super/i.test(`${x.zoho_item} ${x.notes}`) ? 'Super Ekspres' : /speed\s*50|express|ekspres|espress/i.test(`${x.zoho_item} ${x.notes}`) ? 'Ekspres' : 'Normal',
    dokumen: (x.docs || []).map((d) => ({ nama: d.desc, halaman: d.pages })), jenis_dokumen: x.docs?.[0]?.kind || '', catatan: x.notes || '', ragu: false,
  }))
}

/**
 * Susun usulan sub project dari item invoice.
 * → { ok, subs, dilewati, mesin: 'ai' | 'aturan', model?, biaya_rp?, alasan? }
 */
export async function tarikData(items, { buatSub, lembaga = [] }) {
  const bersih = itemUntukAi(items)
  if (!bersih.some((it) => it.name !== 'Delivery Fee' && (it.name || it.description))) return { ok: false, alasan: 'Invoice ini belum punya item layanan untuk ditarik' }
  let usulan; let info
  if (AI_LIVE) {
    const r = await aiTarikData(bersih, lembaga.map((p) => p.name))
    if (!r.ok) return { ok: false, alasan: r.alasan || 'AI gagal — isi sub project manual' }
    usulan = (r.data?.subs || []).map((u) => ({ ...u, judul: bersih[(Number(u.item) || 0) - 1]?.name || '' }))
    info = { mesin: 'ai', model: r.model, biaya_rp: r.biaya_rp, dilewati: (r.data?.dilewati || []).map((d) => bersih[(Number(d.item) || 0) - 1]?.name).filter(Boolean) }
  } else {
    usulan = dariAturan(bersih)
    const dipakai = new Set(usulan.map((u) => u.judul))
    info = { mesin: 'aturan', dilewati: bersih.filter((it) => it.name && !dipakai.has(it.name)).map((it) => it.name) }
  }
  const subs = usulan.map((u) => keSubForm(u, { buatSub, lembaga }))
  if (!subs.length) return { ok: false, alasan: 'Tidak ada item layanan yang bisa dijadikan sub project — isi manual' }
  return { ok: true, subs, ...info }
}
