import { ROLES } from '../src/config/access.js'
import { konfigAsal, KODE_INTI } from '../src/config/izin.js'
import { DESKRIPSI_BAWAAN } from '../src/lib/aksesKelola.js'
const rows = Object.keys(ROLES).filter(k=>k!=='superadmin').map(k => ({ kode:k, nama:ROLES[k].label, deskripsi:DESKRIPSI_BAWAAN[k]||'', aktif:true, ...konfigAsal(k), dibuat_oleh:'Migrasi (aturan lama)', dibuat_at:new Date().toISOString() }))
console.log(JSON.stringify({rows, inti:KODE_INTI}))
