// ATLAS Alfa — jembatan ke Google Drive perusahaan.
//
// Kunci akun layanan Google TIDAK pernah ada di kode front-end. Fungsi ini
// berjalan di server Supabase; kuncinya diambil dari env rahasia project.
//
// Struktur folder yang dipakai:  <ROOT> / <Cabang> / <No. Invoice>
// Setiap panggilan diverifikasi: token pemanggil dicek ke Supabase Auth, lalu
// perannya dan cabangnya dibaca ULANG dari tabel users.
// Audit 15 Nov 2026: unduh/ganti nama/buang berkas kini diperiksa — berkas harus
// berada di dalam folder ATLAS (ROOT) dan di cabang yang boleh diakses pemanggil.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const URL_ = Deno.env.get("SUPABASE_URL")!
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!

const SA_EMAIL = Deno.env.get("GOOGLE_SA_EMAIL") || ""
const SA_KEY = Deno.env.get("GOOGLE_SA_PRIVATE_KEY") || ""
const ROOT = Deno.env.get("GOOGLE_DRIVE_ROOT_FOLDER_ID") || ""

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } })

/** Nama aman untuk folder/berkas Drive. */
const aman = (s: unknown) => String(s ?? "").replace(/['\\\/]/g, "-").trim().slice(0, 120) || "tanpa-nama"

// ---------- token akun layanan Google (JWT RS256, ditandatangani di server) ----------
let cache = { token: "", exp: 0 }
const b64url = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ""
  for (const x of u) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function gToken(): Promise<string> {
  if (cache.token && Date.now() < cache.exp) return cache.token
  if (!SA_EMAIL || !SA_KEY) throw new Error("Akun layanan Google belum disetel di server.")

  const pem = SA_KEY.replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "")
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"])

  const now = Math.floor(Date.now() / 1000)
  const head = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })))
  const body = b64url(new TextEncoder().encode(JSON.stringify({
    iss: SA_EMAIL, scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })))
  const sig = b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`)))

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${body}.${sig}` }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error("Gagal mendapat token Google")
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 }
  return cache.token
}

const gfetch = async (url: string, init: RequestInit = {}) => {
  const t = await gToken()
  return fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${t}` } })
}

/** Cari folder bernama `nama` di dalam `induk`; buat kalau belum ada. */
async function folder(nama: string, induk: string): Promise<string> {
  const q = `name='${aman(nama).replace(/'/g, "\\'")}' and '${induk}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const r = await gfetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`)
  const j = await r.json()
  if (j.files?.[0]?.id) return j.files[0].id
  const c = await gfetch("https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: aman(nama), mimeType: "application/vnd.google-apps.folder", parents: [induk] }),
  })
  const cj = await c.json()
  if (!cj.id) throw new Error("Gagal membuat folder di Drive")
  return cj.id
}

/** Nama folder cabang tempat berkas berada (anak langsung ROOT), atau null bila di luar folder ATLAS. */
async function cabangBerkas(id: string): Promise<string | null> {
  let node = id
  for (let i = 0; i < 8; i++) {
    const r = await gfetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(node)}?fields=id,name,parents&supportsAllDrives=true`)
    if (!r.ok) return null
    const m = await r.json()
    const induk: string[] = m.parents || []
    if (induk.includes(ROOT)) return String(m.name || "")
    if (!induk[0]) return null
    node = induk[0]
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "method" }, 405)

  try {
    const auth = req.headers.get("Authorization") || ""
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
    if (!token || token === ANON) return json({ error: "Harus masuk dulu." }, 401)

    const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: me, error: meErr } = await asUser.auth.getUser()
    const email = me?.user?.email?.toLowerCase()
    if (meErr || !email) return json({ error: "Sesi tidak sah. Masuk ulang." }, 401)

    const admin = createClient(URL_, SERVICE)
    const { data: rows } = await admin.from("users").select("id, doc").limit(2000)
    const akun = (rows || []).find((r: any) => String(r.doc?.email || "").toLowerCase() === email)
    if (!akun || akun.doc?.active === false) return json({ error: "Akun tidak terdaftar atau nonaktif." }, 403)

    if (!ROOT) return json({ error: "Folder induk Drive belum disetel di server." }, 503)

    const body = await req.json().catch(() => ({}))
    const aksi = String(body.action || "")

    // Cabang yang boleh diakses orang ini — dibaca dari database, bukan dari browser.
    const peran = String(akun.doc?.role || "")
    const semuaCabang = ["superadmin", "direktur", "admin_pusat", "akunting", "supervisor"].includes(peran)
    const pelaksana = ["penerjemah", "proofreader", "otorisator"].includes(peran) // bekerja lintas cabang pada berkas tugasnya
    const cabangSaya: string[] = [akun.doc?.branch, ...(akun.doc?.branches || [])].filter(Boolean)
    const bolehCabang = (c: string) => semuaCabang || cabangSaya.includes(c)

    if (aksi === "upload-url") {
      const cabang = String(body.branch || "")
      if (!bolehCabang(cabang) && !pelaksana) return json({ error: `Anda tidak berhak mengunggah ke cabang ${cabang}.` }, 403)
      const fCabang = await folder(cabang || "Umum", ROOT)
      const fInvoice = await folder(String(body.invoice || "tanpa-invoice"), fCabang)
      const r = await gfetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Upload-Content-Type": String(body.mime || "application/octet-stream") },
        body: JSON.stringify({ name: aman(body.name), parents: [fInvoice] }),
      })
      const uploadUrl = r.headers.get("location")
      if (!uploadUrl) return json({ error: "Drive menolak sesi unggah." }, 502)
      return json({ ok: true, uploadUrl, folderId: fInvoice })
    }

    if (aksi === "download") {
      const id = String(body.id || "")
      if (!id) return json({ error: "ID berkas kosong." }, 400)
      const cab = semuaCabang ? "" : await cabangBerkas(id) // pimpinan & kantor pusat: semua berkas (termasuk folder lama di luar ROOT)
      if (cab === null) return json({ error: "Berkas tidak ditemukan di folder ATLAS." }, 404)
      if (!semuaCabang && !pelaksana && !bolehCabang(cab)) return json({ error: "Anda tidak berhak membuka berkas cabang ini." }, 403)
      const r = await gfetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`)
      if (!r.ok) return json({ error: "Berkas tidak bisa diambil dari Drive." }, 404)
      return new Response(r.body, {
        headers: { ...CORS, "Content-Type": r.headers.get("content-type") || "application/octet-stream" },
      })
    }

    if (aksi === "rename" || aksi === "trash") {
      const id = String(body.id || "")
      if (!id || (aksi === "rename" && !body.name)) return json({ error: "ID atau nama kosong." }, 400)
      if (pelaksana) return json({ error: "Peran Anda tidak boleh mengubah berkas." }, 403)
      const cab = semuaCabang ? "" : await cabangBerkas(id)
      if (cab === null) return json({ error: "Berkas tidak ditemukan di folder ATLAS." }, 404)
      if (!semuaCabang && !bolehCabang(cab)) return json({ error: "Anda tidak berhak mengubah berkas cabang ini." }, 403)
      if (aksi === "rename") {
        const r = await gfetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: aman(body.name) }),
        })
        const j = await r.json()
        if (!j.id) return json({ error: "Gagal mengganti nama di Drive." }, 502)
        return json({ ok: true, name: j.name })
      }
      // Dipindahkan ke Trash Drive, bukan dihapus permanen — masih bisa dipulihkan.
      const r = await gfetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
      })
      if (!r.ok) return json({ error: "Gagal memindahkan ke Trash Drive." }, 502)
      return json({ ok: true })
    }

    // TARIK DARI DRIVE (masa transisi): NAMA folder & file milik satu nomor invoice — untuk menyusun usulan sub project di form.
    // Hanya nama yang dikembalikan (bukan isi / tautan file). Izin: app_izin('tarik-drive.tambah'); invoicenya harus terlihat oleh pemanggil (RLS zoho_invoices).
    if (aksi === "tarik-nama") {
      const { data: izin } = await asUser.rpc("app_izin", { kode: "tarik-drive.tambah" })
      if (izin !== true) return json({ error: "Tidak ada akses Tarik dari Drive." }, 403)
      const noInv = String(body.invoice || "").trim().toUpperCase()
      const angka = noInv.replace(/\D/g, "")
      if (!/^\d{8,16}$/.test(angka)) return json({ error: "Nomor invoice tidak sah." }, 400)
      const { data: inv } = await asUser.from("zoho_invoices").select("invoice_no").eq("invoice_no", noInv).limit(1)
      if (!inv?.length) return json({ error: "Invoice ini tidak ada di daftar faktur Anda." }, 403)
      const q = `name contains '${angka}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      const r = await gfetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents)&pageSize=20&corpora=allDrives&supportsAllDrives=true&includeItemsFromAllDrives=true`)
      const j = await r.json()
      if (!r.ok) return json({ error: "Drive lama tidak bisa dibaca. Pastikan Drive sudah dibagikan ke akun layanan ATLAS." }, 502)
      const cocok = (j.files || []).filter((f: any) => new RegExp(`(^|\\D)${angka}(\\D|$)`).test(String(f.name || ""))).slice(0, 6)
      const namaInduk = new Map<string, { name: string; parent: string }>()
      const jalur = async (id: string) => {
        const out: string[] = []; let node = id
        for (let i = 0; i < 4 && node; i++) {
          if (!namaInduk.has(node)) {
            const m = await (await gfetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(node)}?fields=name,parents&supportsAllDrives=true`)).json()
            namaInduk.set(node, { name: String(m.name || ""), parent: m.parents?.[0] || "" })
          }
          const x = namaInduk.get(node)!
          if (!x.name) break
          out.unshift(x.name); node = x.parent
        }
        return out
      }
      const folders = []
      for (const f of cocok) {
        const fq = `'${f.id}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`
        const fr = await (await gfetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(fq)}&fields=files(name,mimeType)&pageSize=200&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json()
        folders.push({ name: String(f.name || ""), jalur: f.parents?.[0] ? await jalur(f.parents[0]) : [], files: (fr.files || []).map((x: any) => ({ name: String(x.name || ""), mime: String(x.mimeType || "") })) })
      }
      return json({ ok: true, folders })
    }

    // Dipakai saat mencocokkan project lama dengan foldernya di Drive (khusus pimpinan/kantor pusat).
    if (aksi === "cari-folder") {
      if (!semuaCabang) return json({ error: "Khusus pimpinan & kantor pusat." }, 403)
      const kunci = String(body.q || "").trim()
      if (kunci.length < 3) return json({ error: "Kata kunci terlalu pendek." }, 400)
      const q = `name contains '${kunci.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      const r = await gfetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents)&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true`)
      const j = await r.json()
      return json({ ok: true, folders: j.files || [] })
    }

    // Pemeriksaan sambungan — dipakai saat setup, tidak menyentuh berkas apa pun.
    if (aksi === "cek") {
      const r = await gfetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ROOT)}?fields=id,name&supportsAllDrives=true`)
      const j = await r.json()
      if (!j.id) return json({ error: "Folder induk tidak bisa dibuka. Pastikan sudah dibagikan ke akun layanan." }, 502)
      return json({ ok: true, folder: j.name, sebagai: SA_EMAIL })
    }

    return json({ error: "Aksi tidak dikenal." }, 400)
  } catch (e) {
    console.error("drive-files", (e as Error).message)
    return json({ error: "Gagal memproses permintaan berkas. Coba lagi." }, 500)
  }
})
