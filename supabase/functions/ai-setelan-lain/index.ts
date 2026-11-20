// ATLAS — pengaturan AI untuk fitur yang punya fungsi server sendiri (spesimen-ai, tarik-data-ai, typo-ai).
//  • Hanya MENGATUR (model + batas biaya per bulan); tidak pernah memanggil Gemini dan tidak menyentuh kunci.
//  • Disimpan di ai_setelan.doc.fitur.<id> (tempat kedua fungsi itu membaca) DAN salinannya di doc.fitur_lain.<id>:
//    fungsi gemini-ai menulis ulang doc.fitur saat pengaturannya disimpan, jadi salinan dipakai untuk memulihkan.
//  • Izin: pengaturan.ai.atur (diperiksa di server lewat app_izin).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const bulanIni = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Makassar" }).slice(0, 7);
// Bawaan = sama dengan bawaan di fungsi masing-masing.
const FITUR: Record<string, { model: string; batas_rp: number }> = {
  spesimen: { model: "gemini-3.1-pro-preview", batas_rp: 300000 },
  tarik_data: { model: "gemini-3-flash-preview", batas_rp: 100000 },
  typo: { model: "gemini-3.5-flash-lite", batas_rp: 100000 },
};
const MODEL = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3-flash-preview", "gemini-3.8-flash", "gemini-3.1-pro-preview"]; // yang harganya dikenal kedua fungsi

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, alasan: "metode tidak didukung" }, 405);
  const URL_ = Deno.env.get("SUPABASE_URL")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!, SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(URL_, SR, { auth: { persistSession: false } });
  // deno-lint-ignore no-explicit-any
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { return json({ ok: false, alasan: "isi permintaan tidak valid" }, 400); }
  const aksi = String(b.aksi ?? "");
  const db = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data: u } = await db.auth.getUser();
  if (!u?.user) return json({ ok: false, alasan: "silakan login ulang" }, 401);
  const { data: row } = await admin.from("users").select("id, doc, active").eq("auth_id", u.user.id).maybeSingle();
  if (!row || (row.active ?? row.doc?.active) === false) return json({ ok: false, alasan: "akun tidak dikenal" }, 403);
  const { data: izin } = await db.rpc("app_izin", { kode: "pengaturan.ai.atur" });
  if (izin !== true) return json({ ok: false, alasan: "Tidak ada akses mengatur AI" }, 403);

  const { data: st } = await admin.from("ai_setelan").select("doc").eq("id", 1).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const doc: Record<string, any> = st?.doc ?? {};
  const kini = Object.fromEntries(Object.keys(FITUR).map((k) => [k, { ...FITUR[k], ...(doc.fitur_lain?.[k] ?? {}), ...(doc.fitur?.[k] ?? {}) }])) as Record<string, { model: string; batas_rp: number }>;
  const simpan = (fitur: typeof kini) => admin.from("ai_setelan").upsert({ id: 1, doc: { ...doc, fitur: { ...(doc.fitur ?? {}), ...fitur }, fitur_lain: fitur }, updated_at: new Date().toISOString(), updated_by: row.id });

  if (aksi === "info") {
    // pulihkan bila doc.fitur kehilangan isian fitur ini (tertimpa saat pengaturan lain disimpan)
    if (doc.fitur_lain && Object.keys(FITUR).some((k) => doc.fitur_lain[k] && !doc.fitur?.[k])) await simpan(kini);
    return json({ ok: true, fitur: kini, model: MODEL });
  }
  if (aksi === "atur") {
    const baru = structuredClone(kini);
    for (const [k, v] of Object.entries((b.fitur ?? {}) as Record<string, { model?: string; batas_rp?: number }>)) {
      if (!FITUR[k]) return json({ ok: false, alasan: `Fitur ${k} tidak dikenal` }, 400);
      if (v.model != null) { if (!MODEL.includes(v.model)) return json({ ok: false, alasan: "Model tidak ada di daftar" }, 400); baru[k].model = v.model; }
      if (v.batas_rp != null) { const n = Number(v.batas_rp); if (!(n >= 10000 && n <= 20000000)) return json({ ok: false, alasan: "Batas biaya harus Rp 10.000 sampai 20 juta" }, 400); baru[k].batas_rp = Math.round(n); }
    }
    const { error } = await simpan(baru);
    if (error) return json({ ok: false, alasan: "Pengaturan gagal disimpan" }, 500);
    if (JSON.stringify(baru) !== JSON.stringify(kini)) await admin.from("ai_pakai_log").insert({ bulan: bulanIni(), fitur: "pengaturan", model: "", user_id: row.id, branch: row.doc?.branch ?? null, token_masuk: 0, token_keluar: 0, biaya_usd: 0, hasil: "atur", catatan: JSON.stringify({ dari: kini, ke: baru }) });
    return json({ ok: true, fitur: baru });
  }
  return json({ ok: false, alasan: "aksi tidak dikenal" }, 400);
});
