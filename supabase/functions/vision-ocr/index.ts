// ============================================================
//  VISION-OCR — baca teks dokumen dengan Google Cloud Vision
//  • Kunci hanya di Supabase Secrets: GOOGLE_VISION_KEY (tidak pernah ke front-end).
//  • Hak akses: izin "smart-translator.lihat" (Pengaturan → Role & Hak Akses) lewat app_izin.
//  • Kuota gratis 1.000 halaman/bulan dihitung di tabel vision_kuota. Bila jatah habis
//    → { ok:false, cadangan:true } dan aplikasi memakai Tesseract (gratis, di perangkat).
//  aksi: "kuota" (lihat sisa) | "baca" (gambar base64 JPEG/PNG, satu halaman)
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const MAKS_BYTE = 6 * 1024 * 1024;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, alasan: "metode tidak didukung" }, 405);
  const URL_ = Deno.env.get("SUPABASE_URL")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!, SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(URL_, SR, { auth: { persistSession: false } });
  const auth = req.headers.get("Authorization") ?? "";
  const db = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u } = await db.auth.getUser();
  if (!u?.user) return json({ ok: false, alasan: "silakan login ulang" }, 401);
  const { data: row } = await admin.from("users").select("id, doc, role, active").eq("auth_id", u.user.id).maybeSingle();
  const active = row ? (row.active ?? row.doc?.active) : false;
  if (!row || active === false) return json({ ok: false, alasan: "akun tidak dikenal" }, 403);
  const { data: izin } = await db.rpc("app_izin", { kode: "smart-translator.lihat" });
  if (izin !== true) return json({ ok: false, alasan: "Tidak ada akses Smart Translator" }, 403);

  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { return json({ ok: false, alasan: "isi permintaan tidak valid" }, 400); }
  const aksi = String(b.aksi ?? "");
  const kunci = (Deno.env.get("GOOGLE_VISION_KEY") ?? "").trim();

  if (aksi === "kuota") {
    const bulan = new Date().toLocaleString("sv-SE", { timeZone: "America/Los_Angeles" }).slice(0, 7);
    const { data: k } = await admin.from("vision_kuota").select("halaman, batas, ingat").eq("bulan", bulan).maybeSingle();
    return json({ ok: true, aktif: !!kunci, bulan, halaman: k?.halaman ?? 0, batas: k?.batas ?? 1000, ingat: k?.ingat ?? 900 });
  }
  if (aksi !== "baca") return json({ ok: false, alasan: "aksi tidak dikenal" }, 400);
  if (!kunci) return json({ ok: false, cadangan: true, alasan: "Kunci Google Vision belum dipasang" });
  const gambar = String(b.gambar ?? "").replace(/^data:[^,]+,/, "");
  if (!gambar || gambar.length * 0.75 > MAKS_BYTE) return json({ ok: false, alasan: "gambar kosong atau terlalu besar (maks 6 MB)" }, 400);

  const { data: jatah, error: eJatah } = await admin.rpc("app_vision_ambil", { n: 1 });
  if (eJatah) return json({ ok: false, cadangan: true, alasan: "kuota tidak bisa dicek" });
  const kuota = { halaman: jatah.halaman, batas: jatah.batas, ingat: jatah.ingat };
  if (!jatah.boleh) return json({ ok: false, cadangan: true, habis: true, alasan: "Kuota gratis Google Vision bulan ini habis — memakai Tesseract", kuota });

  const catat = (hasil: string) => admin.from("vision_pakai_log").insert({ bulan: jatah.bulan, user_id: row.id, branch: row.doc?.branch ?? null, halaman: 1, hasil });
  try {
    const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(kunci)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ image: { content: gambar }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], imageContext: { languageHints: ["id", "en"] } }] }),
    });
    const j = await r.json().catch(() => ({}));
    const res = j?.responses?.[0];
    if (!r.ok || res?.error) throw new Error(res?.error?.message || j?.error?.message || `Google Vision ${r.status}`);
    // Kata + kotak + keyakinan → disusun jadi baris di aplikasi
    const kata: { t: string; c: number; v: number[] }[] = [];
    for (const pg of res?.fullTextAnnotation?.pages ?? []) for (const bl of pg.blocks ?? []) for (const pa of bl.paragraphs ?? []) for (const w of pa.words ?? []) {
      const t = (w.symbols ?? []).map((s: any) => s.text).join("");
      const vs = w.boundingBox?.vertices ?? [];
      const xs = vs.map((v: any) => v.x ?? 0), ys = vs.map((v: any) => v.y ?? 0);
      if (t) kata.push({ t, c: Math.round((w.confidence ?? 0.9) * 100), v: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    }
    await catat("ok");
    return json({ ok: true, teks: res?.fullTextAnnotation?.text ?? "", kata, kuota });
  } catch (e) {
    await admin.rpc("app_vision_kembali", { p_bulan: jatah.bulan, n: 1 });
    await catat("gagal");
    return json({ ok: false, cadangan: true, alasan: `Google Vision gagal: ${(e as Error).message}`.slice(0, 300), kuota });
  }
});
