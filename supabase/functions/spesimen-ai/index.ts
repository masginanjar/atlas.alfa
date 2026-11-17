// ============================================================
//  SPESIMEN-AI — pembaca data pejabat & pencari alamat instansi untuk Alat → Pemisah Spesimen (ATLAS)
//  • Kunci hanya di Supabase Secrets: GEMINI_API_KEY (tidak pernah ke front-end / log).
//  • Izin: app_izin('pemisah-spesimen.lihat'). Prompt & bentuk jawaban ditentukan di server.
//  • Isi dokumen TIDAK disimpan dan TIDAK ditulis ke log; log hanya metadata (fitur, model, token, biaya) di ai_pakai_log.
//  • Model: ai_setelan.doc.fitur.spesimen.model bila diisi, selain itu bawaan di bawah. Batas biaya per bulan (rupiah, perkiraan).
//  aksi: "pejabat" (gambar satu halaman) | "alamat" (nama instansi + lokasi, teks) | "uji" (x-uji-token, data SINTETIS saja)
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-uji-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const MAKS_BYTE = 8 * 1024 * 1024;
const bulanIni = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Makassar" }).slice(0, 7);
const FITUR = "spesimen";
const MODEL_BAWAAN = "gemini-3.1-pro-preview"; // pemilik minta model yang lebih bagus (17 Nov 2026)
const BATAS_RP = 300000, KURS = 17000;
// Harga USD per 1 juta token (masuk / keluar) — perkiraan, sama dengan katalog fungsi gemini-ai.
const HARGA: Record<string, { masuk: number; keluar: number }> = {
  "gemini-3.1-flash-lite": { masuk: 0.25, keluar: 1.5 }, "gemini-3.5-flash-lite": { masuk: 0.3, keluar: 2.5 }, "gemini-3-flash-preview": { masuk: 0.5, keluar: 3 },
  "gemini-3.8-flash": { masuk: 0.75, keluar: 3.75 }, "gemini-3.1-pro-preview": { masuk: 2, keluar: 12 },
};
const S = (d: string) => ({ type: "STRING", description: d });
const KOTAK = { type: "OBJECT", properties: { y1: { type: "INTEGER" }, x1: { type: "INTEGER" }, y2: { type: "INTEGER" }, x2: { type: "INTEGER" } }, required: ["y1", "x1", "y2", "x2"] };
const KOLOM: [string, string][] = [
  ["nama", "Nama lengkap dan gelar pejabat penanda tangan, persis seperti tercetak"], ["jabatan", "Jabatan persis seperti tertulis di dokumen"],
  ["instansi", "Nama instansi dan unit kerja seperti tertulis (kop atau blok tanda tangan); kosong bila tidak tertulis"], ["alamat", "Alamat instansi yang TERCETAK di dokumen (kop surat); kosong bila tidak tercetak"],
  ["lokasi", "Kota/kabupaten instansi bila tercetak; kosong bila tidak"], ["label_nomor", "Label yang tercetak di depan nomor identitas pejabat, persis: NIP, NIDN, NIDK, NUPTK, NRP, NIK, NIY, atau lainnya; kosong bila tidak ada label"],
  ["nomor", "Nomor identitas pejabat persis seperti tercetak (termasuk spasi), sebagai teks; kosong bila tidak ada"], ["bertumpuk", "YA bila tanda tangan dan stempel saling menimpa, selain itu TIDAK"],
];
const PROMPT_PEJABAT = "Gambar ini satu halaman dokumen Indonesia (ijazah, akta, surat keterangan, transkrip, dan sejenisnya) yang ditandatangani pejabat. Temukan SETIAP pejabat penanda tangan di halaman ini (blok tanda tangan: jabatan, tanda tangan, nama, nomor identitas). " +
  "Untuk tiap pejabat salin isi kolom PERSIS seperti tercetak, huruf demi huruf, tanpa memperbaiki ejaan, tanpa melengkapi, tanpa menebak. Kolom yang tidak tercetak: string kosong. Kolom yang terbaca tetapi meragukan: salin apa adanya dan masukkan nama kolomnya ke \"ragu\". " +
  "Nomor identitas: label_nomor = label yang tercetak di depan nomor, apa adanya. JANGAN mengubah NIDN, NIDK, NUPTK, NRP, atau label lain menjadi NIP, dan jangan memberi label NIP bila kata NIP tidak tercetak. Jangan menyimpulkan apakah pejabat itu PNS. Jangan mengambil alamat rumah. " +
  "Kotak memakai skala 0–1000 terhadap gambar (y1,x1 = kiri atas; y2,x2 = kanan bawah). ttd = kotak tiap tanda tangan basah pejabat ini (goresan pena; bukan nama tercetak, bukan tanda tangan elektronik/QR). paraf = kotak paraf (tanda tangan singkat/inisial kecil yang TERPISAH dari tanda tangan utama); bila tidak ada, daftar kosong — tanda tangan TIDAK boleh dianggap paraf. stempel = kotak cap/stempel instansi yang menyertai pejabat ini. Kotak dibuat pas mengelilingi goresan/cap, sedikit longgar. " +
  "Halaman tanpa pejabat penanda tangan: \"pejabat\" daftar kosong.";
const SKEMA_PEJABAT = { type: "OBJECT", properties: { pejabat: { type: "ARRAY", items: { type: "OBJECT", properties: { ...Object.fromEntries(KOLOM.map(([k, d]) => [k, S(d)])), ttd: { type: "ARRAY", items: KOTAK }, paraf: { type: "ARRAY", items: KOTAK }, stempel: { type: "ARRAY", items: KOTAK }, ragu: { type: "ARRAY", items: { type: "STRING" } } }, required: [...KOLOM.map(([k]) => k), "ttd", "paraf", "stempel", "ragu"] } } }, required: ["pejabat"] };

type Hasil = { ok: boolean; data?: unknown; alasan?: string; rinci?: string; pakai: { masuk: number; keluar: number } };
// deno-lint-ignore no-explicit-any
const galat = (st: number, j: any, model: string, pakai: Hasil["pakai"]): Hasil | null => {
  const kode = j?.error?.status || "", rinci = String(j?.error?.message || "").slice(0, 300);
  const g = (alasan: string): Hasil => ({ ok: false, alasan, pakai, rinci });
  if (st === 404 || kode === "NOT_FOUND") return g(`Model ${model} tidak tersedia untuk kunci ini`);
  if (st === 403 || kode === "PERMISSION_DENIED") return g("Google menolak permintaan (kunci dibatasi / Gemini API belum aktif)");
  if (st === 401 || (st === 400 && /API key/i.test(rinci))) return g("Kunci Gemini tidak valid");
  if (st === 400 && /search|tool|grounding/i.test(rinci)) return g("Model ini tidak mendukung pencarian Google — isi alamat manual");
  if (st === 400 || kode === "INVALID_ARGUMENT") return g("Permintaan ditolak Gemini (gambar/format tidak valid)");
  return null; // sementara → boleh diulang
};
// deno-lint-ignore no-explicit-any
const tokenDari = (j: any) => { const u = j?.usageMetadata ?? {}; return { masuk: (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0), keluar: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) }; };
const urlModel = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;

async function bacaPejabat(kunci: string, model: string, b64: string, mime: string): Promise<Hasil> {
  // deno-lint-ignore no-explicit-any
  const cfg: any = { temperature: 0, responseMimeType: "application/json", responseSchema: SKEMA_PEJABAT, maxOutputTokens: 3000 };
  if (!/flash-lite/.test(model)) { cfg.maxOutputTokens = 9000; cfg.thinkingConfig = { thinkingLevel: "low" }; }
  let terakhir = "";
  for (let i = 0; i < 2; i++) {
    let r: Response;
    try { r = await fetch(urlModel(model), { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": kunci }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime, data: b64 } }, { text: PROMPT_PEJABAT }] }], generationConfig: cfg }), signal: AbortSignal.timeout(90000) }); }
    catch (_) { terakhir = "Gemini tidak menjawab dalam 90 detik (jaringan/antrean)"; break; }
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json().catch(() => ({})); const pakai = tokenDari(j);
    if (r.ok && !j.error) {
      const c = j?.candidates?.[0]; const teks = (c?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
      if (c?.finishReason === "MAX_TOKENS") return { ok: false, alasan: "Jawaban AI terpotong (dokumen terlalu padat)", pakai };
      try { return { ok: true, data: JSON.parse(teks), pakai }; } catch (_) { return { ok: false, alasan: "Jawaban AI tidak bisa dibaca", pakai }; }
    }
    if (r.status === 400 && cfg.thinkingConfig && /thinking/i.test(String(j?.error?.message || ""))) { delete cfg.thinkingConfig; continue; }
    const g = galat(r.status, j, model, pakai); if (g) return g;
    terakhir = r.status === 429 ? "Batas pemakaian Gemini tercapai — coba lagi sebentar" : `Gemini sedang bermasalah (${r.status})`;
    await new Promise((s) => setTimeout(s, 900));
  }
  return { ok: false, alasan: terakhir, pakai: { masuk: 0, keluar: 0 } };
}
/** Cari alamat KANTOR instansi (Gemini + Google Search). Masukan hanya nama instansi & lokasi. Sumber = tautan dari hasil pencarian (groundingMetadata), bukan karangan model. */
async function cariAlamat(kunci: string, model: string, instansi: string, lokasi: string): Promise<Hasil> {
  const prompt = "Cari di web alamat KANTOR resmi instansi Indonesia berikut. Utamakan situs resmi instansi itu, situs pemerintah (.go.id), atau institusi pendidikan (.ac.id / .sch.id). " +
    "Yang dicari alamat kantor instansi, BUKAN alamat rumah atau data pribadi pejabat. Jangan mengarang: bila tidak menemukan alamat dengan yakin, kembalikan daftar kosong. " +
    "Bila ada beberapa instansi/cabang/kampus bernama serupa yang cocok, berikan masing-masing (maksimal 4) supaya bisa dipilih. " +
    `Instansi: ${instansi}. ` + (lokasi ? `Lokasi yang tertulis di dokumen: ${lokasi}. ` : "") +
    "Jawab HANYA dengan JSON tanpa teks lain, bentuk: {\"pilihan\":[{\"nama\":\"nama instansi/cabang\",\"alamat\":\"alamat lengkap kantor termasuk kota dan kode pos bila ada\"}]}";
  let terakhir = "";
  for (let i = 0; i < 2; i++) {
    let r: Response;
    try { r = await fetch(urlModel(model), { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": kunci }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0, maxOutputTokens: 10000 } }), signal: AbortSignal.timeout(80000) }); }
    catch (_) { terakhir = "Pencarian tidak menjawab dalam 80 detik"; break; }
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json().catch(() => ({})); const pakai = tokenDari(j);
    if (r.ok && !j.error) {
      const c = j?.candidates?.[0]; const teks = (c?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
      // deno-lint-ignore no-explicit-any
      const sumber = ((c?.groundingMetadata?.groundingChunks ?? []) as any[]).map((g) => ({ url: String(g?.web?.uri ?? ""), judul: String(g?.web?.title ?? "") })).filter((x) => /^https?:\/\//.test(x.url)).slice(0, 8);
      const m = teks.match(/\{[\s\S]*\}/);
      // deno-lint-ignore no-explicit-any
      let pilihan: any[] = [];
      try { pilihan = JSON.parse(m ? m[0] : "{}").pilihan ?? []; } catch (_) { return { ok: false, alasan: "Jawaban pencarian tidak bisa dibaca", pakai }; }
      pilihan = pilihan.filter((x) => x && typeof x.alamat === "string" && x.alamat.trim()).slice(0, 4).map((x) => ({ nama: String(x.nama ?? "").slice(0, 200), alamat: String(x.alamat).slice(0, 400) }));
      return { ok: true, data: { pilihan, sumber, dicari_at: new Date().toISOString() }, pakai };
    }
    const g = galat(r.status, j, model, pakai); if (g) return g;
    terakhir = r.status === 429 ? "Batas pemakaian Gemini tercapai — coba lagi sebentar" : `Gemini sedang bermasalah (${r.status})`;
    await new Promise((s) => setTimeout(s, 900));
  }
  return { ok: false, alasan: terakhir, pakai: { masuk: 0, keluar: 0 } };
}
const b64dari = (u8: Uint8Array) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, alasan: "metode tidak didukung" }, 405);
  const URL_ = Deno.env.get("SUPABASE_URL")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!, SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(URL_, SR, { auth: { persistSession: false } });
  // deno-lint-ignore no-explicit-any
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { return json({ ok: false, alasan: "isi permintaan tidak valid" }, 400); }
  let aksi = String(b.aksi ?? "");
  const kunci = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
  const uji = req.headers.get("x-uji-token") ?? "";
  let user: { id: string; branch: string | null };
  if (uji) {
    const { data: cfg } = await admin.from("pembayaran_gateway_config").select("value").eq("key", "uji_token").maybeSingle();
    if (!(cfg?.value && uji.length >= 20 && uji === cfg.value) || aksi !== "uji") return json({ ok: false, alasan: "tidak diizinkan" }, 401);
    user = { id: "uji-otomatis", branch: null };
  } else {
    if (aksi === "uji") return json({ ok: false, alasan: "tidak diizinkan" }, 401);
    const db = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
    const { data: u } = await db.auth.getUser();
    if (!u?.user) return json({ ok: false, alasan: "silakan login ulang" }, 401);
    const { data: row } = await admin.from("users").select("id, doc, active").eq("auth_id", u.user.id).maybeSingle();
    if (!row || (row.active ?? row.doc?.active) === false) return json({ ok: false, alasan: "akun tidak dikenal" }, 403);
    const { data: izin } = await db.rpc("app_izin", { kode: "pemisah-spesimen.lihat" });
    if (izin !== true) return json({ ok: false, alasan: "Tidak ada akses Pemisah Spesimen" }, 403);
    user = { id: row.id, branch: row.doc?.branch ?? null };
  }
  if (!kunci) return json({ ok: false, alasan: "Kunci Gemini belum dipasang di server" });
  const { data: st } = await admin.from("ai_setelan").select("doc").eq("id", 1).maybeSingle();
  const setel = st?.doc?.fitur?.[FITUR] ?? {};
  let model = typeof setel.model === "string" && /^gemini-[\w.\-]+$/.test(setel.model) ? setel.model : MODEL_BAWAAN;
  const batas = uji ? 20000 : Number(setel.batas_rp) || BATAS_RP, kurs = Number(st?.doc?.kurs) || KURS;
  const fiturLog = uji ? "uji" : FITUR;

  // deno-lint-ignore no-explicit-any
  let jalankan: () => Promise<Hasil>; let ekstra: Record<string, any> = {};
  if (aksi === "uji") {
    // Hanya data SINTETIS: gambar karangan di repo, dan nama instansi publik (bukan data pelanggan).
    if (typeof b.model === "string" && /^gemini-[\w.\-]+$/.test(b.model)) model = b.model;
    const tugas = String(b.tugas ?? "");
    if (tugas === "pejabat") {
      const ib = await fetch("https://raw.githubusercontent.com/masginanjar/atlas.alfa/main/public/contoh/contoh-pejabat-sintetis.png");
      if (!ib.ok) return json({ ok: false, alasan: "data uji tidak ditemukan" }, 404);
      const g = b64dari(new Uint8Array(await ib.arrayBuffer())); jalankan = () => bacaPejabat(kunci, model, g, "image/png");
    } else if (tugas === "alamat") jalankan = () => cariAlamat(kunci, model, "Kementerian Hukum Republik Indonesia", "Jakarta");
    else return json({ ok: false, alasan: "tugas uji tidak dikenal" }, 400);
    aksi = tugas; ekstra = { uji: true };
  } else if (aksi === "pejabat") {
    const m = String(b.gambar ?? "").match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
    if (!m) return json({ ok: false, alasan: "gambar harus JPG/PNG/WebP" }, 400);
    if (m[2].length * 0.75 > MAKS_BYTE) return json({ ok: false, alasan: "gambar terlalu besar (maks 8 MB)" }, 400);
    jalankan = () => bacaPejabat(kunci, model, m[2], m[1]);
  } else if (aksi === "alamat") {
    const instansi = String(b.instansi ?? "").replace(/\s+/g, " ").trim().slice(0, 200), lokasi = String(b.lokasi ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (instansi.length < 3) return json({ ok: false, alasan: "Isi nama instansi dulu" }, 400);
    jalankan = () => cariAlamat(kunci, model, instansi, lokasi);
  } else return json({ ok: false, alasan: "aksi tidak dikenal" }, 400);

  // batas laju & batas biaya bulanan (metadata saja)
  const { count } = await admin.from("ai_pakai_log").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("at", new Date(Date.now() - 5 * 60e3).toISOString());
  if ((count ?? 0) >= 60) return json({ ok: false, alasan: "Terlalu banyak permintaan dalam 5 menit — tunggu sebentar" });
  const { data: log } = await admin.from("ai_pakai_log").select("biaya_usd").eq("bulan", bulanIni()).eq("fitur", fiturLog);
  const terpakai = (log ?? []).reduce((a: number, r: { biaya_usd: number }) => a + (Number(r.biaya_usd) || 0), 0) * kurs;
  if (terpakai >= batas) return json({ ok: false, habis: true, alasan: "Batas biaya AI bulan ini untuk Pemisah Spesimen sudah tercapai" });
  const t0 = Date.now();
  const r = await jalankan();
  const h = HARGA[model] ?? HARGA[MODEL_BAWAAN]; const usd = (r.pakai.masuk * h.masuk + r.pakai.keluar * h.keluar) / 1e6;
  await admin.from("ai_pakai_log").insert({ bulan: bulanIni(), fitur: fiturLog, model, user_id: user.id, branch: user.branch, token_masuk: r.pakai.masuk, token_keluar: r.pakai.keluar, biaya_usd: usd, hasil: r.ok ? "ok" : "gagal", ms: Date.now() - t0 });
  if (!r.ok) return json({ ok: false, alasan: r.alasan, model, ...(uji ? { rinci: r.rinci ?? null } : {}) });
  return json({ ok: true, model, data: r.data, biaya_rp: Math.round(usd * kurs * 100) / 100, ms: Date.now() - t0, ...ekstra, ...(uji ? { token: r.pakai } : {}) });
});
