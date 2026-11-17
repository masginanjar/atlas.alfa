// ============================================================
//  SPESIMEN-RIWAYAT — riwayat file Word dari Alat → Pemisah Spesimen (ATLAS)
//  • Tabel spesimen_riwayat tertutup (RLS aktif tanpa policy) → hanya bisa diakses lewat fungsi ini.
//  • Izin: app_izin('pemisah-spesimen.lihat') → riwayat milik sendiri; app_izin('pemisah-spesimen.kelola') → semua.
//  • Tidak ada isi dokumen / nama pejabat yang ditulis ke log.
//  aksi: simpan | daftar | unduh | hapus
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const MAKS_B64 = 8.2 * 1024 * 1024; // ≈ 6 MB file
const KOLOM = "id, dibuat_at, user_id, user_nama, branch, nama_file, pejabat, ukuran";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, alasan: "metode tidak didukung" }, 405);
  const URL_ = Deno.env.get("SUPABASE_URL")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!, SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(URL_, SR, { auth: { persistSession: false } });
  // deno-lint-ignore no-explicit-any
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { return json({ ok: false, alasan: "isi permintaan tidak valid" }, 400); }
  const db = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data: u } = await db.auth.getUser();
  if (!u?.user) return json({ ok: false, alasan: "silakan login ulang" }, 401);
  const { data: row } = await admin.from("users").select("id, doc, active").eq("auth_id", u.user.id).maybeSingle();
  if (!row || (row.active ?? row.doc?.active) === false) return json({ ok: false, alasan: "akun tidak dikenal" }, 403);
  const { data: izin } = await db.rpc("app_izin", { kode: "pemisah-spesimen.lihat" });
  if (izin !== true) return json({ ok: false, alasan: "Tidak ada akses Pemisah Spesimen" }, 403);
  const { data: kel } = await db.rpc("app_izin", { kode: "pemisah-spesimen.kelola" });
  const kelola = kel === true;
  const aksi = String(b.aksi ?? "");

  if (aksi === "simpan") {
    const berkas = String(b.berkas ?? "");
    if (!berkas || berkas.length > MAKS_B64 || !/^[A-Za-z0-9+/=]+$/.test(berkas.slice(0, 2000)) || !berkas.startsWith("UEsD")) return json({ ok: false, alasan: "file Word tidak valid atau terlalu besar (maks 6 MB)" }, 400);
    const nama_file = String(b.nama_file ?? "Spesimen.docx").replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 140) || "Spesimen.docx";
    // deno-lint-ignore no-explicit-any
    const pejabat = (Array.isArray(b.pejabat) ? b.pejabat : []).slice(0, 60).map((p: any) => ({ nama: String(p?.nama ?? "").slice(0, 160), jabatan: String(p?.jabatan ?? "").slice(0, 200), instansi: String(p?.instansi ?? "").slice(0, 200) }));
    const { data, error } = await admin.from("spesimen_riwayat").insert({ user_id: row.id, user_nama: String(row.doc?.name ?? "").slice(0, 120), branch: row.doc?.branch ?? null, nama_file, pejabat, ukuran: Math.round(berkas.length * 0.75), berkas }).select("id").single();
    if (error) return json({ ok: false, alasan: "Gagal menyimpan riwayat" }, 500);
    return json({ ok: true, id: data.id });
  }
  if (aksi === "daftar") {
    let q = admin.from("spesimen_riwayat").select(KOLOM).order("dibuat_at", { ascending: false }).limit(200);
    if (!kelola) q = q.eq("user_id", row.id);
    const { data, error } = await q;
    if (error) return json({ ok: false, alasan: "Gagal memuat riwayat" }, 500);
    return json({ ok: true, data: data ?? [], semua: kelola });
  }
  if (aksi === "unduh" || aksi === "hapus") {
    const id = String(b.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, alasan: "id tidak valid" }, 400);
    const { data: r } = await admin.from("spesimen_riwayat").select("id, user_id, nama_file" + (aksi === "unduh" ? ", berkas" : "")).eq("id", id).maybeSingle();
    // deno-lint-ignore no-explicit-any
    const rr = r as any;
    if (!rr || (!kelola && rr.user_id !== row.id)) return json({ ok: false, alasan: "Dokumen tidak ditemukan" }, 404);
    if (aksi === "unduh") return json({ ok: true, nama_file: rr.nama_file, berkas: rr.berkas });
    const { error } = await admin.from("spesimen_riwayat").delete().eq("id", id);
    if (error) return json({ ok: false, alasan: "Gagal menghapus" }, 500);
    return json({ ok: true });
  }
  return json({ ok: false, alasan: "aksi tidak dikenal" }, 400);
});
