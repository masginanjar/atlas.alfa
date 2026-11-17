// ============================================================
//  Pemeriksa latar Inbox Otorisasi (tidak menampilkan apa-apa).
//  Berjalan selama ATLAS terbuka untuk pengguna berizin `inbox-otorisasi.lihat`:
//   1) mengecek balasan email berkala → angka di menu "Inbox Otorisasi";
//   2) balasan yang isinya hanya "OK" → dokumen di-ACC otomatis (izin `inbox-otorisasi.tambah`):
//      hasil proofread dipakai sebagai Hasil Otorisasi, tercatat atas nama otorisatornya, lalu masuk tahap Nomor Registrasi
//      (nomor register dipesan seperti ACC biasa; Admin Pusat tetap mengecek & menerbitkan).
//   3) balasan BERLAMPIRAN → lampirannya otomatis diunduh & disambungkan sebagai Hasil Otorisasi dokumen itu (folder "Balasan Otorisator"),
//      Admin Pusat diberi notifikasi, lalu dokumen di-ACC seperti butir 2.
//  Selama mode tes (live), balasan dari alamat tes hanya DISAMBUNGKAN filenya — status tidak diubah otomatis.
//  Tidak ada yang diproses bila ATLAS tidak sedang dibuka oleh pengguna berizin.
// ============================================================
import { useEffect, useRef } from 'react'
import { useApp } from '../lib/store.jsx'
import { boleh } from '../lib/izin.js'
import { invoiceLabel } from '../config/access.js'
import { fieldFiles, uploadProjectFiles } from './FileManager.jsx'
import { INBOX_LIVE, cekInbox, useInboxOto, balasanOk, petaProject, projectPesan, sudahAcc, panggilInbox, lampiranTersimpan } from '../lib/inboxOto.js'

const JEDA_MS = 5 * 60 * 1000
const sedang = new Set() // uid yang sedang di-ACC (cegah proses ganda di tab ini)

export const FOLDER_BALASAN = 'Balasan Otorisator'
const dariB64 = (b, mime) => { const bin = atob(b); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type: mime || 'application/octet-stream' }) }
/** Unduh lampiran balasan lalu sambungkan ke project: satu dokumen di tahap Otorisasi → jadi Hasil Otorisasi dokumen itu; selain itu File project.
 *  Semua diunggah dulu, project disimpan SEKALI. Mengembalikan { tersimpan, gagal:[nama], target }. */
export async function simpanLampiranBalasan(m, daftar, p, { save, user, oleh, onMaju }) {
  const dOto = (p.sub_projects || []).filter((s) => s.stage === 'otorisasi' && !s.cancelled); const target = dOto.length === 1 ? dOto[0] : null
  const added = [], catat = [], gagal = []
  for (let i = 0; i < daftar.length; i++) {
    const l = daftar[i]; onMaju?.(i + 1, daftar.length)
    try {
      let blob
      if (INBOX_LIVE) { const r = await panggilInbox('lampiran', { uid: m.uid, part: l.part }); if (!r.ok) throw new Error(r.alasan || 'gagal mengambil'); blob = dariB64(r.b64, r.mime) }
      else blob = new Blob(['Berkas contoh sintetis untuk demo Inbox Otorisasi (bukan dokumen pelanggan).'], { type: 'text/plain' })
      const up = await uploadProjectFiles([{ file: new File([blob], l.nama, { type: blob.type }), name: l.nama, sub_id: target?.id || '' }], { branch: p.branch, invoice: p.invoice_no, by: oleh || user.name, subs: p.sub_projects })
      added.push(...up.map((f) => ({ ...f, fdr: FOLDER_BALASAN }))); catat.push({ uid: m.uid, part: l.part, nama: l.nama, at: new Date().toISOString(), by_name: oleh || user.name })
    } catch (e) { gagal.push(`${l.nama} (${e.message || 'gagal'})`) }
  }
  if (added.length) {
    const next = { id: p.id, email_oto_balasan: [...(p.email_oto_balasan || []), ...catat].slice(-80), file_folders: [...new Set([...(p.file_folders || []), FOLDER_BALASAN])] }
    if (target) next.sub_projects = p.sub_projects.map((s) => { if (s.id !== target.id) return s; const list = [...fieldFiles(s.data, 'file_final'), ...added]; return { ...s, data: { ...s.data, file_final: list[0], file_final_list: list } } })
    else next.files = [...(p.files || []), ...added]
    await save('projects', next)
  }
  return { tersimpan: added.length, gagal, target }
}
/** Mengapa balasan OK ini belum/tidak bisa di-ACC otomatis ('' = bisa). Dipakai juga oleh halaman Inbox. */
export function halanganAcc(m, p) {
  if (!p) return 'Project belum dikenali'
  if (sudahAcc(p, m)) return 'Sudah di-ACC'
  const d = (p.sub_projects || []).filter((s) => s.stage === 'otorisasi' && !s.cancelled)
  if (!d.length) return 'Tidak ada dokumen di tahap Otorisasi'
  if (d.length > 1) return 'Ada lebih dari satu dokumen di tahap Otorisasi — pilih manual di project'
  if (!(m.lampiran || []).length && !fieldFiles(d[0].data, 'hasil_proofread').filter((f) => f && !f.trashed_at).length) return 'Belum ada file hasil proofread'
  if ((m.lampiran || []).length && !fieldFiles(d[0].data, 'file_final').filter((f) => f && !f.trashed_at).length) return 'Lampiran balasan belum tersambung sebagai Hasil Otorisasi'
  if (!(m.oto_id || [...(p.email_oto || [])].reverse().find((x) => x.oto_id)?.oto_id)) return 'Otorisatornya tidak diketahui'
  return ''
}
/** ACC satu dokumen dari balasan "OK". Mengembalikan { ok, alasan? }. */
export async function accDariBalasan(m, p, { processStage, save, user, otomatis }) {
  const halang = halanganAcc(m, p); if (halang) return { ok: false, alasan: halang }
  const kunci = String(m.uid); if (sedang.has(kunci)) return { ok: false, alasan: 'Sedang diproses' }
  sedang.add(kunci)
  try {
    const sub = p.sub_projects.find((s) => s.stage === 'otorisasi' && !s.cancelled)
    const berlampiran = (m.lampiran || []).length > 0
    const hp = fieldFiles(sub.data, berlampiran ? 'file_final' : 'hasil_proofread').filter((f) => f && !f.trashed_at) // balasan berlampiran: pakai file dari balasan; balasan "OK": pakai hasil proofread
    const otoId = m.oto_id || [...(p.email_oto || [])].reverse().find((x) => x.oto_id)?.oto_id
    await processStage(p, sub.id, { file_final: hp[0], file_final_list: hp, __atas_nama: otoId, __override: `Balasan email ${berlampiran ? 'berlampiran' : '"OK"'} dari otorisator${otomatis ? ' (ACC otomatis)' : ''}` }, true)
    const catat = { uid: m.uid, part: 'ok', acc: true, at: new Date().toISOString(), by_name: otomatis ? 'ATLAS (otomatis)' : user.name }
    await save('projects', { id: p.id, email_oto_balasan: [...(p.email_oto_balasan || []), catat].slice(-80) })
    await save('notifications', { to_role: 'admin_pusat', kind: 'task', by: 'ATLAS (otomatis)', read_by: [], project_id: p.id,
      text: `${invoiceLabel(p.invoice_no)} di-ACC ${otomatis ? 'otomatis ' : ''}dari balasan email ${berlampiran ? `(${hp.length} file hasil otorisasi)` : '"OK"'} ${m.dari || 'otorisator'} — cek & terbitkan nomor register` }).catch(() => {})
    return { ok: true }
  } catch (e) { return { ok: false, alasan: e.message || 'Gagal ACC' } } finally { sedang.delete(kunci) }
}

export default function InboxOtoLatar() {
  const { user, data, processStage, save, notify } = useApp()
  const inbox = useInboxOto()
  const lihat = boleh(user, 'inbox-otorisasi.lihat'), tambah = boleh(user, 'inbox-otorisasi.tambah')
  const terkini = useRef({}); terkini.current = { projects: data.projects, processStage, save, user, notify }
  // 1) cek berkala (live: tiap 5 menit; demo: saat data email simulasi berubah)
  const tandaDemo = INBOX_LIVE ? '' : (data.projects || []).map((p) => (p.email_oto || []).length).join('')
  useEffect(() => {
    if (!lihat) return undefined
    const jalan = () => { if (document.visibilityState !== 'hidden') cekInbox(terkini.current.projects) }
    const awal = setTimeout(jalan, INBOX_LIVE ? 4000 : 300)
    const t = INBOX_LIVE ? setInterval(jalan, JEDA_MS) : null
    return () => { clearTimeout(awal); if (t) clearInterval(t) }
  }, [lihat, tandaDemo])
  // 2) & 3) balasan "OK" / berlampiran → proses otomatis. Dijalankan ulang saat catatan balasan di project berubah (mis. file baru saja tersambung).
  const tandaBalasan = (data.projects || []).reduce((a, p) => a + (p.email_oto_balasan || []).length, 0)
  useEffect(() => {
    if (!lihat || !tambah || !inbox.data?.length) return undefined
    let batal = false
    const tunda = setTimeout(async () => { // jeda acak: bila beberapa Admin Pusat sedang membuka ATLAS, kecil kemungkinan memproses bersamaan
      for (const m of inbox.data) {
        if (batal) break
        const c = terkini.current; let p = projectPesan(m, petaProject(c.projects)) // selalu pakai data project TERBARU
        const tesLive = INBOX_LIVE && m.tes // mode tes di live: file boleh disambungkan, tetapi status dokumen sungguhan TIDAK diubah otomatis
        const L = m.lampiran || []
        if (L.length) {
          // 3) balasan berlampiran → sambungkan lampiran yang belum tersimpan sebagai Hasil Otorisasi
          if (!p || sudahAcc(p, m)) continue
          const dOto = (p.sub_projects || []).filter((s) => s.stage === 'otorisasi' && !s.cancelled)
          if (dOto.length !== 1) continue // tidak jelas dokumen yang mana → biarkan di Inbox untuk ditangani manual
          const belum = L.filter((l) => !lampiranTersimpan(p, m, l))
          if (belum.length) {
            if (INBOX_LIVE && !inbox.bisa_ambil) continue
            const kunci = `${m.uid}:lampiran`; if (sedang.has(kunci)) continue
            sedang.add(kunci)
            try {
              const r = await simpanLampiranBalasan(m, belum, p, { save: c.save, user: c.user, oleh: 'ATLAS (otomatis)' })
              if (r.tersimpan) {
                c.notify(`${r.tersimpan} file balasan ${invoiceLabel(p.invoice_no)} otomatis tersambung sebagai Hasil Otorisasi`)
                if (tesLive) await c.save('notifications', { to_role: 'admin_pusat', kind: 'task', by: 'ATLAS (otomatis)', read_by: [], project_id: p.id, text: `Balasan email (mode tes) untuk ${invoiceLabel(p.invoice_no)}: ${r.tersimpan} file tersambung sebagai Hasil Otorisasi — status belum diubah` }).catch(() => {})
              }
              if (r.gagal.length) { c.notify(`${r.gagal.length} file balasan ${invoiceLabel(p.invoice_no)} gagal diambil — buka Inbox Otorisasi`, 'err'); continue }
            } catch (e) { c.notify(`Gagal menyambungkan balasan ${invoiceLabel(p.invoice_no)}: ${e.message || ''}`, 'err'); continue } finally { sedang.delete(kunci) }
            continue // ACC dilakukan pada putaran berikutnya, setelah data project terbaru (berisi file tadi) masuk
          }
          if (tesLive || halanganAcc(m, p)) continue
          const r = await accDariBalasan(m, p, { ...c, otomatis: true })
          if (r.ok) c.notify(`${invoiceLabel(p.invoice_no)} di-ACC otomatis dari balasan email — lanjut ke Nomor Registrasi`)
          else if (r.alasan !== 'Sedang diproses') c.notify(`ACC otomatis ${invoiceLabel(p.invoice_no)} gagal: ${r.alasan}`, 'err')
          continue
        }
        if (!balasanOk(m)) continue
        if (tesLive) continue // balasan "OK" dari alamat tes: tersedia tombol "ACC sekarang" di Inbox
        if (halanganAcc(m, p)) continue
        const r = await accDariBalasan(m, p, { ...c, otomatis: true })
        if (r.ok) c.notify(`${invoiceLabel(p.invoice_no)} di-ACC otomatis dari balasan "OK" — lanjut ke Nomor Registrasi`)
        else if (r.alasan !== 'Sedang diproses') c.notify(`ACC otomatis ${invoiceLabel(p.invoice_no)} gagal: ${r.alasan}`, 'err')
      }
    }, 800 + Math.floor(Math.random() * (INBOX_LIVE ? 4000 : 200)))
    return () => { batal = true; clearTimeout(tunda) }
  }, [lihat, tambah, inbox.data, tandaBalasan]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
