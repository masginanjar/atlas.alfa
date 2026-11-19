// Prioritas project — urutan = tingkat urgensi. Tampilan (warna & ikon) ada di components/Priority.jsx
export const PRIORITIES = ['Normal', 'Ekspres', 'Super Ekspres', 'Sameday']

/** Nama tampilan (19 Nov 2026). Nilai yang TERSIMPAN tidak berubah — hanya tulisannya, supaya data lama, filter & aturan tetap jalan. */
export const LABEL_PRIORITAS = { Normal: 'Normal', Ekspres: 'Ekspres (Speed 50)', 'Super Ekspres': 'Super Ekspres (Speed 100)', Sameday: 'Sameday' }
const LAMA = { Tinggi: 'Super Ekspres', Speed: 'Ekspres', 'Super Speed': 'Super Ekspres' }
const baku = (p) => (PRIORITIES.includes(LAMA[p] || p) ? LAMA[p] || p : 'Normal')
/** Prioritas SATU sub project (19 Nov 2026): tiap sub boleh beda. Sub lama tanpa isian mengikuti prioritas project. */
export const prioSub = (project, sub) => baku(sub?.priority || project?.about?.priority)
/** Prioritas tertinggi dari sebuah daftar → dipakai sebagai prioritas project (urutan, lencana & aturan deadline tetap jalan). */
export const prioTertinggi = (list) => PRIORITIES[Math.max(0, ...list.map((p) => PRIORITIES.indexOf(baku(p))))]
/** Benar bila sub-sub dalam project ini prioritasnya tidak seragam → lencana per sub ditampilkan. */
export const prioSubBeda = (project) => new Set((project?.sub_projects || []).map((x) => prioSub(project, x))).size > 1
export const labelPrioritas = (p) => LABEL_PRIORITAS[LAMA[p] || p] || p || 'Normal'
