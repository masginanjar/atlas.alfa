import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import PilihCari from './PilihCari.jsx'

/** Sebutan sehari-hari → supaya "kemenkumham", "kemenlu", "kedubes" tetap ketemu walau nama resminya berbeda. */
const ALIAS = [[/hukum|ahu/i, 'kemenkumham kemenkum kumham ahu'], [/luar negeri/i, 'kemenlu kemlu'], [/kedutaan|embassy|konsulat/i, 'kedubes kedutaan embassy konsulat'],
  [/agama/i, 'kemenag'], [/pendidikan/i, 'kemendikbud kemdikbud dikti'], [/mahkamah/i, 'ma'], [/kesehatan/i, 'kemenkes']]
const aliasOf = (nama = '') => ALIAS.filter(([re]) => re.test(nama)).map(([, a]) => a).join(' ')

/**
 * Pemilih lembaga (legalisasi) + "Lembaga lain": tim bisa menambah lembaga / kedutaan yang belum ada langsung dari form project.
 * Lembaga baru masuk Master Data (berlaku semua cabang) dan ditandai "ditambah dari form" supaya Super Admin bisa merapikan namanya.
 * Izin: lembaga.tambah (Role & Hak Akses) — diperiksa lagi di server.
 */
export default function PilihLembaga({ value, onChange, branch, invalid, ringkas }) {
  const { data, user, save } = useApp()
  const semua = data.people.filter((p) => p.type === 'lembaga' && (p.branch === branch || p.branch === 'Semua'))
  const tambah = async (nama) => {
    const ada = data.people.find((p) => p.type === 'lembaga' && String(p.name || '').trim().toLowerCase() === nama.toLowerCase())
    if (ada) return ada.id
    const row = await save('people', { name: nama, type: 'lembaga', branch: 'Semua', phone: '', note: '', dari_form: true, dibuat_oleh: user?.name || '', dibuat_oleh_id: user?.id || '' })
    if (!row?.id) throw new Error('Lembaga belum tersimpan — coba lagi')
    return row.id
  }
  return (
    <PilihCari ringkas={ringkas} label="Lembaga" invalid={invalid} value={value} onChange={onChange} placeholder="Pilih lembaga…" kosong="Lembaga tidak ditemukan"
      onTambah={boleh(user, 'lembaga.tambah') ? tambah : undefined} labelTambah="Tambah lembaga lain"
      options={semua.map((p) => ({ value: p.id, label: p.name, note: p.note || '', alias: `${aliasOf(p.name)} ${p.alias || ''}` }))} />
  )
}
