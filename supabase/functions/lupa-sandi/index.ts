// ATLAS — "Lupa kata sandi": mencatat PERMINTAAN reset ke Superadmin (tanpa login, tanpa email).
// Email @247.id belum punya kotak surat, jadi tautan reset lewat email tidak dipakai.
// • Jawaban selalu sama, terdaftar atau tidak (tidak membocorkan email mana yang ada).
// • Satu permintaan aktif per akun per 12 jam; paling banyak 40 permintaan per jam untuk seluruh sistem.
// • Fungsi ini TIDAK mengubah kata sandi apa pun.
import { createClient } from "jsr:@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const PESAN = "Bila email itu terdaftar, permintaan sudah diteruskan ke Superadmin. Kata sandi sementara akan diberikan langsung oleh Superadmin.";
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);
  let email = "";
  try { email = String((await req.json())?.email ?? "").trim().toLowerCase(); } catch (_) { /* kosong */ }
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) || email.length > 120) return json({ ok: false, alasan: "Isi email login Anda." }, 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const sejam = new Date(Date.now() - 3600e3).toISOString();
    const { count } = await admin.from("permintaan_sandi").select("id", { count: "exact", head: true }).gte("dibuat_at", sejam);
    if ((count ?? 0) < 40) {
      const { data: u } = await admin.from("users").select("id, doc, role, branch, active, email").eq("email", email).maybeSingle();
      const aktif = u ? (u.active ?? u.doc?.active) !== false : false;
      if (u && aktif) {
        const batas = new Date(Date.now() - 12 * 3600e3).toISOString();
        const { count: ada } = await admin.from("permintaan_sandi").select("id", { count: "exact", head: true }).eq("user_id", u.id).eq("status", "baru").gte("dibuat_at", batas);
        if (!ada) await admin.from("permintaan_sandi").insert({ user_id: u.id, email, nama: u.doc?.name ?? null, cabang: u.branch ?? u.doc?.branch ?? null, role: u.role ?? u.doc?.role ?? null });
      }
    }
  } catch (_) { /* jawaban tetap sama */ }
  return json({ ok: true, pesan: PESAN });
});
