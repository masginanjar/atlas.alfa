// Penjaga aturan "setiap fitur baru wajib punya pengaturan role" (CLAUDE.md).
// Build GAGAL bila ada menu/halaman di App.jsx yang belum terdaftar di katalog izin (src/config/izin.js).
import fs from 'node:fs'
import { RUTE_FITUR, FITUR, AKSI, MODUL } from '../src/config/izin.js'

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const menu = app.slice(app.indexOf('const MENU = ['), app.indexOf('const bolehItem'))
const SEGERA_ATAU_UMUM = new Set(['pesan']) // pesan = chat (dimatikan); item `segera: true` dilewati otomatis
const galat = []
for (const m of menu.matchAll(/\{[^{}]*?key: '([^']+)'[^{}]*?\}/g)) {
  const teks = m[0]; const key = m[1]
  if (/segera: true/.test(teks) || SEGERA_ATAU_UMUM.has(key)) continue
  const sub = /sub: '([^']+)'/.exec(teks)?.[1]
  const rute = sub ? `${key}/${sub}` : key
  if (!RUTE_FITUR[rute] && !RUTE_FITUR[key]) galat.push(`Menu "${rute}" belum terdaftar di RUTE_FITUR (src/config/izin.js)`)
}
for (const [r, f] of Object.entries(RUTE_FITUR)) if (!FITUR[f]) galat.push(`RUTE_FITUR["${r}"] → fitur "${f}" tidak ada di katalog`)
for (const m of MODUL) for (const x of m.fitur) for (const a of x.aksi) if (!AKSI[a]) galat.push(`Tindakan "${a}" pada ${x.id} tidak dikenal di AKSI`)
const kode = new Set()
for (const m of MODUL) for (const x of m.fitur) { if (kode.has(x.id)) galat.push(`Fitur ganda: ${x.id}`); kode.add(x.id) }
if (galat.length) { console.error('✗ Katalog izin belum lengkap:\n- ' + galat.join('\n- ')); process.exit(1) }
console.log(`✓ Katalog izin lengkap: ${Object.keys(FITUR).length} fitur, ${Object.keys(RUTE_FITUR).length} rute`)
