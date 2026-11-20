// ============================================================
//  PEMBACA PASTI item invoice — aturan tetap (bukan AI) untuk hal yang polanya jelas di invoice tim:
//  negara tujuan apostille, prioritas, dan "yang diapostille". Dipakai Tarik Data (beta) SETELAH AI menjawab
//  dan oleh pembaca aturan (zohoParse), supaya hasilnya sama di semua tempat dan tidak bergantung pada AI.
// ============================================================
import { COUNTRIES } from '../config/subtypes.js'

const norm = (s = '') => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
/** Sebutan di invoice (Indonesia / Inggris / singkatan) → nama PERSIS di daftar negara ATLAS. */
const ALIAS = {
  cina: 'China', tiongkok: 'China', rrc: 'China', rrt: 'China', prc: 'China', chinese: 'China', // 20 Nov 2026: di ATLAS ditulis "China" (bukan Tiongkok)
  usa: 'Amerika Serikat', us: 'Amerika Serikat', as: 'Amerika Serikat', amerika: 'Amerika Serikat', america: 'Amerika Serikat', 'united states': 'Amerika Serikat',
  uk: 'Inggris (Britania Raya)', inggris: 'Inggris (Britania Raya)', england: 'Inggris (Britania Raya)', 'united kingdom': 'Inggris (Britania Raya)', britania: 'Inggris (Britania Raya)',
  korea: 'Korea Selatan', korsel: 'Korea Selatan', 'south korea': 'Korea Selatan', netherlands: 'Belanda', holland: 'Belanda', dutch: 'Belanda',
  germany: 'Jerman', german: 'Jerman', deutschland: 'Jerman', japan: 'Jepang', spain: 'Spanyol', spanish: 'Spanyol',
  prancis: 'Perancis', france: 'Perancis', french: 'Perancis', italy: 'Italia', italian: 'Italia', turkey: 'Turki', turkiye: 'Turki',
  singapore: 'Singapura', hongkong: 'Hong Kong', hk: 'Hong Kong', macau: 'Makau', macao: 'Makau', canada: 'Kanada', switzerland: 'Swiss', swis: 'Swiss',
  belgium: 'Belgia', russia: 'Rusia', philippines: 'Filipina', egypt: 'Mesir', brazil: 'Brasil', mexico: 'Meksiko', chile: 'Chili', czech: 'Ceko', ceska: 'Ceko',
  ireland: 'Irlandia', norway: 'Norwegia', poland: 'Polandia', sweden: 'Swedia', finland: 'Finlandia', greece: 'Yunani', hungary: 'Hongaria', romania: 'Rumania',
  'new zealand': 'Selandia Baru', nz: 'Selandia Baru', brunei: 'Brunei Darussalam', saudi: 'Arab Saudi', 'saudi arabia': 'Arab Saudi', ksa: 'Arab Saudi',
  uae: 'Uni Emirat Arab', uea: 'Uni Emirat Arab', dubai: 'Uni Emirat Arab', 'abu dhabi': 'Uni Emirat Arab', emirat: 'Uni Emirat Arab', jordan: 'Yordania', jordania: 'Yordania',
  croatia: 'Kroasia', cyprus: 'Siprus', morocco: 'Maroko', 'south africa': 'Afrika Selatan', colombia: 'Kolombia', cambodia: 'Kamboja', lebanon: 'Lebanon',
  luxembourg: 'Luksemburg', lithuania: 'Lituania', ukraine: 'Ukraina', syria: 'Suriah', iraq: 'Irak', yemen: 'Yaman', ecuador: 'Ekuador', cuba: 'Kuba',
}
const jarak = (a, b) => { // jarak edit (Levenshtein) untuk salah ketik kecil
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}
/** Satu sebutan negara → nama di daftar ATLAS ('' bila tidak dikenal). Tahan ejaan Inggris & salah ketik kecil. */
export function cocokNegara(nama) {
  const n = norm(nama); if (!n) return ''
  if (ALIAS[n]) return ALIAS[n]
  const tepat = COUNTRIES.find((c) => norm(c) === n); if (tepat) return tepat
  const awal = COUNTRIES.find((c) => norm(c).startsWith(n) && n.length >= 4); if (awal) return awal
  if (n.length >= 5) {
    const calon = [...COUNTRIES.map((c) => [norm(c), c]), ...Object.entries(ALIAS)].map(([k, v]) => [jarak(n, k), v]).sort((a, b) => a[0] - b[0])[0]
    if (calon && calon[0] <= 2) return calon[1]
  }
  return ''
}
/** Negara tujuan dari teks item ("APOSTILLE REGULER TUJUAN PERANCIS", "Tujuan negara Singapura", "TUJUAN BOLIVIA DAN CHILE"). → { negara, lain:[], mentah } */
export function negaraDariTeks(teks = '') {
  const m = String(teks).match(/tujuan(?:\s+negara)?\s*[:：]?\s*([A-Za-z][A-Za-z .'-]{1,60})/i)
  if (!m) return { negara: '', lain: [], mentah: '' }
  const mentah = m[1].replace(/\s+(normal|reguler|regular|express|ekspres+|super.*|speed.*|estimasi.*|\d.*)$/i, '').trim()
  const semua = mentah.split(/\s+dan\s+|\s*[,&/+]\s*|\s+and\s+/i).map((x) => x.trim()).filter(Boolean)
  const cocok = semua.map(cocokNegara)
  return { negara: cocok[0] || '', lain: cocok.slice(1).filter(Boolean), mentah, takDikenal: semua.filter((_, i) => !cocok[i]) }
}

const URUT = ['Normal', 'Ekspres', 'Super Ekspres', 'Sameday']
/** Prioritas dari satu teks: SAMEDAY → Sameday; Super Express / Speed 100% → Super Ekspres; Express / Speed 50% → Ekspres; selain itu ''. */
export function prioritasDariTeks(teks = '') {
  const t = String(teks).toLowerCase()
  if (/same\s*-?\s*day/.test(t)) return 'Sameday'
  if (/speed\s*100|super\s*e[kxs]{1,2}pres+|kilat/.test(t)) return 'Super Ekspres'
  if (/speed\s*(50|75)|\be[kxs]{1,2}pres+/.test(t)) return 'Ekspres'
  return ''
}
export const prioritasTertinggi = (daftar = []) => daftar.filter(Boolean).sort((a, b) => URUT.indexOf(b) - URUT.indexOf(a))[0] || ''
/**
 * Prioritas satu item invoice dari NAMA produk + baris pertama deskripsi (yang lebih cepat yang dipakai).
 * `bentrok` = nama produk menyebut Express tetapi deskripsi menulis NORMAL / REGULER (atau sebaliknya) — CS perlu memeriksa.
 */
export function prioritasItem(nama = '', deskripsi = '') {
  const baris1 = String(deskripsi).split(/\r?\n/).map((l) => l.trim()).find(Boolean) || ''
  const pNama = prioritasDariTeks(nama), pDesk = prioritasDariTeks(baris1)
  const lambat = /\b(normal|reguler|regular)\b/i
  const layanan = /apostil|legalis/i.test(nama) // "Reguler" pada nama produk terjemahan = jenis dokumen, bukan kecepatan
  const bentrok = layanan && ((pNama && !pDesk && lambat.test(baris1)) || (pDesk && !pNama && lambat.test(nama)))
  return { prioritas: prioritasTertinggi([pNama, pDesk]) || 'Normal', bentrok: bentrok ? `Nama produk “${nama.trim()}” tetapi deskripsi menulis “${baris1.slice(0, 60)}” — periksa prioritas` : '' }
}

/** Nama dokumen apostille/legalisasi dirapikan + tebakan "yang diapostille" dari awalan baris. → { nama, objek: 'asli' | 'terjemahan' | '' } */
export function rapikanDokLayanan(nama = '') {
  let n = String(nama).trim(), objek = ''
  n = n.replace(/^(apostil+e?|legalisasi|legalisir)\s+(?=\S)/i, '')
  if (/^(dokumen\s+)?asli\s+/i.test(n)) { objek = 'asli'; n = n.replace(/^(dokumen\s+)?asli\s+/i, '') }
  else if (/^(hasil\s+)?terjemahan\b/i.test(n)) objek = 'terjemahan'
  return { nama: n.trim() || String(nama).trim(), objek }
}
