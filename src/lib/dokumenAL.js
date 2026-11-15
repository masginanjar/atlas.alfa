// ============================================================
//  Dokumen Apostille & Legalisasi — folder sendiri di setiap project.
//  Lokasi penyimpanan: <cabang>/<no. invoice>/apostille-legalisasi/<berkas>
//  Hanya role dengan izin `dokumen-al.lihat` yang melihatnya (default: semua
//  kecuali penerjemah, proofreader, otorisator). Server menegakkan aturan yang
//  sama di storage (policy files_proyek_jaga).
// ============================================================
import { boleh } from './izin.js'

export const TIPE_AL = ['apostille', 'legalisasi']
export const FOLDER_AL = 'apostille-legalisasi'
export const LABEL_AL = 'Apostille & Legalisasi'

export const subAL = (sub) => TIPE_AL.includes(sub?.type)
export const bolehAL = (user) => boleh(user, 'dokumen-al.lihat')
export const bolehKelolaAL = (user) => boleh(user, 'dokumen-al.lampiran_kelola')

/** Berkas ini dokumen Apostille/Legalisasi? (dari folder simpan, atau sub project asalnya) */
export function fileAL(project, f) {
  if (!f) return false
  if (f.folder === FOLDER_AL || String(f.path || '').split('/')[2] === FOLDER_AL) return true
  const sid = f.subId ?? f.sub_id
  return !!sid && subAL((project?.sub_projects || []).find((s) => s.id === sid))
}

/** Folder tujuan unggah untuk sebuah sub project ('' = folder project biasa). */
export const folderUnggah = (subs, subId) => (subId && subAL((subs || []).find((s) => s.id === subId)) ? FOLDER_AL : '')

/** Sub project yang boleh terlihat oleh orang ini. */
export const subTerlihat = (user, subs) => (bolehAL(user) ? subs || [] : (subs || []).filter((s) => !subAL(s)))
