// ============================================================
//  KATALOG ↔ OPSI DI FORM PROJECT (20 Nov 2026)
//  Setiap baris Katalog ditautkan ke pilihan yang benar-benar ada di form project:
//    Terjemahan → jenis sub + arah bahasa (+ Reguler / Non Reguler untuk bahasa tim internal) + prioritas
//    Apostille  → jenis sub + prioritas
//    Legalisasi → jenis sub + lembaga (Master Data) + prioritas
//    Jasa Lain  → jenis sub Jasa Lain
//  Tautan disimpan di baris (`opsi`). Baris lama tanpa `opsi` DIPERKIRAKAN dari nama — ditandai "perkiraan".
//  File ini juga memetakan item Zoho Books → baris Katalog (dipakai saat menarik harga dari Zoho).
// ============================================================
import { LANGS, BHS_INTERNAL } from '../config/bahasa.js'
import { PRIORITIES, labelPrioritas } from '../config/priority.js'
import { SUB_TYPES } from '../config/subtypes.js'

const norm = (s = '') => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const BAHASA_PILIH = LANGS.filter((x) => x !== 'Lainnya')
/** Ejaan lain di Zoho → nama bahasa di form. */
const ALIAS_BAHASA = { english: 'Inggris', arabic: 'Arab', dutch: 'Belanda', japanese: 'Jepang', german: 'Jerman', korean: 'Korea', chinese: 'Mandarin', china: 'Mandarin', french: 'Prancis', perancis: 'Prancis', russian: 'Rusia', spanish: 'Spanyol', spain: 'Spanyol', turkish: 'Turki', indonesian: 'Indonesia' }
const bahasaDari = (teks = '') => {
  const out = []
  for (const w of norm(teks).split(' ')) {
    const b = BAHASA_PILIH.find((x) => x.toLowerCase() === w) || ALIAS_BAHASA[w]
    if (b && !out.includes(b)) out.push(b)
  }
  return out
}
const prioDari = (teks = '') => (/same\s*day/i.test(teks) ? 'Sameday' : /super/i.test(teks) ? 'Super Ekspres' : /express|ekspres|kilat|speed/i.test(teks) ? 'Ekspres' : 'Normal')

/** Sebutan lembaga sehari-hari → kata kunci nama resminya di Master Data. */
const SINONIM = [[/kemenkumham|kumham|kemenkum|kementerian hukum|ahu/, /hukum|ahu|kumham/], [/kemenlu|kemlu|luar negeri/, /luar negeri|kemlu|kemenlu/], [/kemenag|kementerian agama/, /agama|kemenag/],
  [/kemdikbud|kemendikbud|dikti|pendidikan/, /pendidikan|dikti|dikbud/], [/notaris/, /notaris/], [/mahkamah agung|\bma\b/, /mahkamah agung/]]
const kunciLembaga = (p) => norm(`${p.name || ''} ${p.alias || ''}`)
/** Cari SATU lembaga di Master Data dari sebutannya. Kedutaan hanya cocok bila negaranya sama. */
export function cariLembaga(nama, daftar = []) {
  const n = norm(nama); if (!n) return null
  const tepat = daftar.find((p) => norm(p.name) === n); if (tepat) return tepat
  if (/kedutaan|embassy|konsulat|teto/.test(n)) {
    const kata = n.split(' ').filter((w) => w.length > 2 && !/^(kedutaan|besar|embassy|konsulat|republik|legalisasi)$/.test(w))
    return daftar.find((p) => /kedutaan|embassy|konsulat/i.test(p.name) && kata.length && kata.some((w) => kunciLembaga(p).split(' ').includes(w))) || null
  }
  for (const [dari, ke] of SINONIM) if (dari.test(n)) { const hit = daftar.find((p) => ke.test(kunciLembaga(p))); if (hit) return hit }
  return null
}

/** Perkiraan tautan untuk baris yang belum punya `opsi` (baris lama / ditambah manual). */
export function tebakOpsi(row, lembaga = []) {
  const kat = norm(row?.kategori), lay = String(row?.layanan || '')
  const semua = `${kat} ${norm(lay)}`
  if (/apostille/.test(semua) && !/supporting|akomodasi/.test(semua)) return { sub: 'apostille', prioritas: prioDari(lay) }
  if (/legalisasi/.test(semua) && !/akomodasi/.test(semua)) {
    const sebut = /kedutaan/.test(kat) && !/kedutaan/i.test(lay) ? `Kedutaan ${lay}` : lay
    const bagian = sebut.replace(/express|ekspres|reguler/gi, '').split(/&|\+| dan /i).map((x) => cariLembaga(x, lembaga)).filter(Boolean)
    return { sub: 'legalisasi', lembaga: [...new Set(bagian.map((p) => p.id))], prioritas: prioDari(lay) }
  }
  if (/terjemah|sworn|sumpah/.test(kat)) {
    const b = bahasaDari(lay)
    const nt = /non\s*(ter)?(sworn|sumpah)/.test(semua)
    const [bahasa, pasangan] = b.length >= 2 ? b : [b[0] || '', 'Indonesia']
    return { sub: nt ? 'terjemahan_nt' : 'terjemahan', bahasa, pasangan, ...(/non\s*reguler/i.test(lay) ? { jenis_dok: 'non_reguler' } : /reguler/i.test(lay) ? { jenis_dok: 'reguler' } : {}) }
  }
  return { sub: 'jasa_lain' }
}

/**
 * Periksa tautan satu baris Katalog ke form project.
 * → { opsi, perkiraan, teks, masalah: [{ kode, teks, lembaga? }] }  — masalah kosong = opsinya ADA di form project.
 */
export function cekOpsi(row, people = []) {
  const lembaga = people.filter((p) => p.type === 'lembaga')
  const perkiraan = !row?.opsi?.sub
  const o = perkiraan ? tebakOpsi(row, lembaga) : row.opsi
  const masalah = []
  const jenis = SUB_TYPES[o.sub]
  if (!jenis) return { opsi: o, perkiraan, teks: 'Belum ditautkan', masalah: [{ kode: 'jenis', teks: 'Belum ditautkan ke jenis sub project' }] }
  const bagian = [jenis.label]
  if (o.sub === 'terjemahan' || o.sub === 'terjemahan_nt') {
    for (const b of [o.bahasa, o.pasangan]) if (!BAHASA_PILIH.includes(b)) masalah.push({ kode: 'bahasa', teks: b ? `Bahasa “${b}” belum ada di form project` : 'Bahasa belum dipilih' })
    bagian.push(`${o.bahasa || '?'} ⇄ ${o.pasangan || '?'}`)
    if (o.jenis_dok) {
      if (!(BHS_INTERNAL.includes(o.bahasa) && BHS_INTERNAL.includes(o.pasangan))) masalah.push({ kode: 'jenis_dok', teks: 'Reguler / Non Reguler hanya ada untuk Indonesia, Inggris, Belanda' })
      bagian.push(o.jenis_dok === 'non_reguler' ? 'Non Reguler' : 'Reguler')
    }
  }
  if (o.sub === 'legalisasi') {
    const ids = Array.isArray(o.lembaga) ? o.lembaga : o.lembaga ? [o.lembaga] : []
    const ada = ids.map((id) => lembaga.find((p) => p.id === id)).filter(Boolean)
    if (!ids.length) masalah.push({ kode: 'lembaga', teks: 'Lembaganya belum ada di Master Data', lembaga: saranLembaga(row) })
    else if (ada.length < ids.length) masalah.push({ kode: 'lembaga', teks: 'Lembaga yang ditautkan sudah dihapus dari Master Data', lembaga: saranLembaga(row) })
    bagian.push(ada.length ? ada.map((p) => p.name).join(' + ') : '?')
  }
  if ((o.sub === 'apostille' || o.sub === 'legalisasi' || o.prioritas) && o.sub !== 'jasa_lain') {
    const p = o.prioritas || 'Normal'
    if (!PRIORITIES.includes(p)) masalah.push({ kode: 'prioritas', teks: `Prioritas “${p}” tidak ada di form project` })
    else if (p !== 'Normal' || o.sub === 'apostille') bagian.push(labelPrioritas(p))
  }
  return { opsi: o, perkiraan, teks: bagian.join(' · '), masalah }
}
/** Nama lembaga yang diusulkan untuk ditambahkan (dari nama layanan). */
export function saranLembaga(row) {
  const lay = String(row?.layanan || '').replace(/\b(legalisasi|express|ekspres|reguler)\b/gi, '').replace(/\s+/g, ' ').trim()
  if (!lay) return ''
  return /kedutaan/i.test(row?.kategori || '') && !/kedutaan/i.test(lay) ? `Kedutaan ${lay}` : lay
}

// ---------- Item Zoho Books → baris Katalog ----------
const SATUAN_ZOHO = { page: 'per halaman', pcs: 'per dokumen', doc: 'per dokumen' }
/** Item yang bukan layanan berharga tetap (ongkir, pajak) — tidak masuk Katalog. */
const LEWATI = /delivery fee|ongkos kirim|^pph\b/i

/**
 * Satu item Zoho → { kunci, kategori, layanan, satuan, tingkat: 'normal' | 'kilat', harga, opsi_dasar, zoho_item_id, zoho_item }
 * `kunci` sama untuk pasangan Normal/Ekspres bahasa yang sama → digabung jadi SATU baris (Harga Normal + Harga Kilat).
 * Lembaga legalisasi belum dicari di sini (butuh Master Data) — `opsi_dasar.lembaga_nama` berisi sebutannya.
 */
export function bacaItemZoho(it) {
  const nama = String(it?.name || '').trim()
  if (!nama || it?.status === 'inactive' || LEWATI.test(nama) || !(Number(it?.rate) > 0)) return null
  const dasar = { harga: Number(it.rate), zoho_item_id: String(it.item_id || ''), zoho_item: nama, satuan: SATUAN_ZOHO[it.unit] || 'per pesanan', tingkat: 'normal' }
  const mitra = /^(mitra|b2b)\s+/i.test(nama)
  const inti = nama.replace(/^(mitra|b2b)\s+/i, '')
  if (inti.includes('⇄')) {
    const [arah, ...tanda] = inti.split('|').map((x) => x.trim())
    const b = bahasaDari(arah.replace(/\([^)]*\)/g, ' '))
    const [bahasa, pasangan] = b.length >= 2 ? b : [b[0] || '', 'Indonesia']
    const t = tanda.join(' | ')
    if (/proofread/i.test(t)) return { ...dasar, kunci: norm(nama), kategori: mitra ? 'Harga Mitra (B2B)' : 'Jasa Lain', layanan: `Proofreading ${bahasa} ⇄ ${pasangan}`, opsi_dasar: { sub: 'jasa_lain' } }
    const nt = /non\s*sworn/i.test(t)
    const jenis_dok = /non\s*reguler/i.test(t) ? 'non_reguler' : /reguler/i.test(t) ? 'reguler' : undefined
    const kilat = /ekspres|express/i.test(t)
    const layanan = `Bahasa ${bahasa}${pasangan !== 'Indonesia' ? `–${pasangan}` : ''}${jenis_dok ? ` (${jenis_dok === 'non_reguler' ? 'Non Reguler' : 'Reguler'})` : ''}`
    return { ...dasar, tingkat: kilat ? 'kilat' : 'normal', satuan: 'per halaman',
      kunci: [mitra ? 'mitra' : 'umum', nt ? 'nt' : 'sworn', bahasa, pasangan, jenis_dok || ''].join('|').toLowerCase(),
      kategori: mitra ? 'Harga Mitra (B2B)' : nt ? 'Penerjemah Non Tersumpah' : 'Penerjemah Tersumpah', layanan: mitra ? `${layanan}${nt ? ' — non tersumpah' : ''}` : layanan,
      opsi_dasar: { sub: nt ? 'terjemahan_nt' : 'terjemahan', bahasa, pasangan, ...(jenis_dok ? { jenis_dok } : {}) } }
  }
  if (/^apostille(\s+(super\s+)?express)?$/i.test(inti)) {
    const p = prioDari(inti)
    return { ...dasar, satuan: 'per dokumen', kunci: `apostille|${p}`.toLowerCase(), kategori: 'Apostille', layanan: p === 'Normal' ? 'Apostille Reguler' : inti, opsi_dasar: { sub: 'apostille', prioritas: p } }
  }
  if (/^legalisasi\s+/i.test(inti)) {
    const sebut = inti.replace(/^legalisasi\s+/i, '')
    const kedutaan = /kedutaan/i.test(sebut)
    const p = prioDari(sebut)
    const bersih = sebut.replace(/\s+(ekspres|express)$/i, '')
    return { ...dasar, satuan: 'per dokumen', kunci: `legalisasi|${norm(bersih)}|${p}`.toLowerCase(), kategori: kedutaan ? 'Legalisasi Kedutaan' : 'Legalisasi Kementerian',
      layanan: kedutaan ? bersih.replace(/^kedutaan\s+/i, '') : `${bersih}${p !== 'Normal' ? ' Express' : ''}`,
      opsi_dasar: { sub: 'legalisasi', prioritas: p, lembaga_nama: bersih.split(/&|\+/).map((x) => x.trim()).filter(Boolean) } }
  }
  if (/non\s*sworn/i.test(inti)) return { ...dasar, satuan: 'per halaman', kunci: norm(nama), kategori: 'Penerjemah Non Tersumpah', layanan: inti.replace(/\s*\|\s*non\s*sworn/i, ''), opsi_dasar: { sub: 'terjemahan_nt', bahasa: 'Inggris', pasangan: 'Indonesia' } }
  return { ...dasar, kunci: norm(nama), kategori: 'Jasa Lain', layanan: inti, opsi_dasar: { sub: 'jasa_lain' } }
}

/** Semua item Zoho → daftar baris Katalog (Normal + Ekspres bahasa yang sama digabung). */
export function barisDariZoho(items = []) {
  const peta = new Map()
  for (const it of items) {
    const b = bacaItemZoho(it); if (!b) continue
    const r = peta.get(b.kunci) || { kunci: b.kunci, kategori: b.kategori, layanan: b.layanan, satuan: b.satuan, harga_normal: null, harga_kilat: null, opsi_dasar: b.opsi_dasar, zoho: {} }
    if (b.tingkat === 'kilat') { r.harga_kilat = b.harga; r.zoho.kilat = { id: b.zoho_item_id, nama: b.zoho_item } }
    else { r.harga_normal = b.harga; r.zoho.normal = { id: b.zoho_item_id, nama: b.zoho_item } }
    peta.set(b.kunci, r)
  }
  return [...peta.values()]
}
