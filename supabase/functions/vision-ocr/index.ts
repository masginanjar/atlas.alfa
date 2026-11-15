// ============================================================
//  VISION-OCR — baca teks dokumen dengan Google Cloud Vision (DOCUMENT_TEXT_DETECTION)
//  • Kunci hanya di Supabase Secrets: GOOGLE_VISION_KEY (tidak pernah ke front-end / log).
//  • Akses: login ATLAS + izin "smart-translator.lihat" (app_izin). Batas: 60 permintaan / 5 menit / orang.
//  • Kuota gratis 1.000 unit/bulan (tabel vision_kuota). Habis → { ok:false, cadangan:true }.
//  • Isi dokumen TIDAK disimpan dan TIDAK ditulis ke log; log hanya metadata (bulan, user, cabang, hasil).
//  aksi: "kuota" | "baca" (gambar base64, satu halaman/potongan)
//        "uji" (khusus pengujian otomatis dgn x-uji-token: membaca gambar SINTETIS dari cabang uji-ocr)
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import "./ocr-core.js";
import { decode, Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
// deno-lint-ignore no-explicit-any
const C = (globalThis as any).OCRCORE;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-uji-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const MAKS_BYTE = 8 * 1024 * 1024;
const UJI_BASE = "https://raw.githubusercontent.com/masginanjar/atlas.alfa/uji-ocr/uji/ocr/";
const bulanIni = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Los_Angeles" }).slice(0, 7);

/** Panggil Google Vision. Ulang 1× untuk gangguan sementara (429/5xx/jaringan). Pesan galat tanpa isi dokumen. */
async function panggilVision(kunci: string, b64: string) {
  const body = JSON.stringify({ requests: [{ image: { content: b64 }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], imageContext: { languageHints: ["id", "en"] } }] });
  let terakhir = "";
  for (let i = 0; i < 2; i++) {
    let r: Response;
    try { r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(kunci)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body }); }
    catch (_) { terakhir = "Tidak bisa menghubungi Google Vision (jaringan)"; await new Promise((s) => setTimeout(s, 700)); continue; }
    const j = await r.json().catch(() => ({}));
    const e = j?.responses?.[0]?.error || j?.error;
    if (r.ok && !e) return { ok: true, res: j.responses[0] };
    const st = r.status, kode = e?.status || "";
    if (st === 403 || kode === "PERMISSION_DENIED") return { ok: false, alasan: "Google menolak permintaan (kunci dibatasi / Vision API belum aktif / billing)", sementara: false };
    if (st === 400 || kode === "INVALID_ARGUMENT") return { ok: false, alasan: "Gambar ditolak Google (format/ukuran tidak valid)", sementara: false };
    if (st === 401) return { ok: false, alasan: "Kunci Google Vision tidak valid", sementara: false };
    terakhir = st === 429 || kode === "RESOURCE_EXHAUSTED" ? "Batas permintaan Google tercapai — coba lagi sebentar" : `Google Vision sedang bermasalah (${st})`;
    await new Promise((s) => setTimeout(s, 800));
  }
  return { ok: false, alasan: terakhir, sementara: true };
}
/** Respons Vision → kata (teks, skor kata & huruf 0-100, 4 titik sudut). Juga v=[x0,y0,x1,y1] untuk aplikasi versi lama. */
// deno-lint-ignore no-explicit-any
function kataDari(res: any) {
  const kata: { t: string; c: number | null; s: number[]; q: number[]; v: number[] }[] = [];
  for (const pg of res?.fullTextAnnotation?.pages ?? []) for (const bl of pg.blocks ?? []) for (const pa of bl.paragraphs ?? []) for (const w of pa.words ?? []) {
    // deno-lint-ignore no-explicit-any
    const sy = (w.symbols ?? []) as any[]; const t = sy.map((s) => s.text).join(""); if (!t) continue;
    // deno-lint-ignore no-explicit-any
    const vs = (w.boundingBox?.vertices ?? []).map((v: any) => [v.x ?? 0, v.y ?? 0]); while (vs.length < 4) vs.push(vs[vs.length - 1] ?? [0, 0]);
    const xs = vs.map((v: number[]) => v[0]), ys = vs.map((v: number[]) => v[1]);
    kata.push({ t, c: w.confidence == null ? null : Math.round(w.confidence * 100), s: sy.map((s) => s.confidence == null ? null : Math.round(s.confidence * 100)).filter((x) => x != null) as number[], q: vs.flat(), v: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
  }
  return kata;
}
const b64dari = (u8: Uint8Array) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, alasan: "metode tidak didukung" }, 405);
  const URL_ = Deno.env.get("SUPABASE_URL")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!, SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(URL_, SR, { auth: { persistSession: false } });
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { return json({ ok: false, alasan: "isi permintaan tidak valid" }, 400); }
  const aksi = String(b.aksi ?? "");
  const kunci = (Deno.env.get("GOOGLE_VISION_KEY") ?? "").trim();

  // ---------- Mode uji (otomatis, data sintetis saja) ----------
  const uji = req.headers.get("x-uji-token") ?? "";
  let user: { id: string; branch: string | null } | null = null;
  if (uji) {
    const { data: cfg } = await admin.from("pembayaran_gateway_config").select("value").eq("key", "uji_token").maybeSingle();
    if (!(cfg?.value && uji.length >= 20 && uji === cfg.value) || !["uji", "kuota"].includes(aksi)) return json({ ok: false, alasan: "tidak diizinkan" }, 401);
    user = { id: "uji-otomatis", branch: null };
  } else {
    const auth = req.headers.get("Authorization") ?? "";
    const db = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u } = await db.auth.getUser();
    if (!u?.user) return json({ ok: false, alasan: "silakan login ulang" }, 401);
    const { data: row } = await admin.from("users").select("id, doc, role, active").eq("auth_id", u.user.id).maybeSingle();
    const active = row ? (row.active ?? row.doc?.active) : false;
    if (!row || active === false) return json({ ok: false, alasan: "akun tidak dikenal" }, 403);
    const { data: izin } = await db.rpc("app_izin", { kode: "smart-translator.lihat" });
    if (izin !== true) return json({ ok: false, alasan: "Tidak ada akses Smart Translator" }, 403);
    user = { id: row.id, branch: row.doc?.branch ?? null };
  }

  if (aksi === "kuota") {
    const { data: k } = await admin.from("vision_kuota").select("halaman, batas, ingat").eq("bulan", bulanIni()).maybeSingle();
    return json({ ok: true, aktif: !!kunci, bulan: bulanIni(), halaman: k?.halaman ?? 0, batas: k?.batas ?? 1000, ingat: k?.ingat ?? 900 });
  }
  if (!kunci) return json({ ok: false, cadangan: true, alasan: "Kunci Google Vision belum dipasang di server" });

  // batas laju per orang (mencegah klik ganda / perulangan)
  const { count } = await admin.from("vision_pakai_log").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("at", new Date(Date.now() - 5 * 60e3).toISOString());
  if ((count ?? 0) >= (uji ? 200 : 60)) return json({ ok: false, cadangan: true, alasan: "Terlalu banyak permintaan dalam 5 menit — tunggu sebentar" }, 429);

  /** Satu unit Vision dengan kuota & log metadata. */
  async function satuBaca(b64: string) {
    const { data: jatah, error: eJ } = await admin.rpc("app_vision_ambil", { n: 1 });
    if (eJ) return { ok: false, cadangan: true, alasan: "Kuota tidak bisa dicek" };
    const kuota = { halaman: jatah.halaman, batas: jatah.batas, ingat: jatah.ingat };
    if (!jatah.boleh) return { ok: false, cadangan: true, habis: true, alasan: "Kuota gratis Google Vision bulan ini habis", kuota };
    const r = await panggilVision(kunci, b64);
    await admin.from("vision_pakai_log").insert({ bulan: jatah.bulan, user_id: user!.id, branch: user!.branch, halaman: 1, hasil: r.ok ? "ok" : "gagal" });
    if (!r.ok) { await admin.rpc("app_vision_kembali", { p_bulan: jatah.bulan, n: 1 }); return { ok: false, cadangan: true, alasan: r.alasan, kuota }; }
    return { ok: true, res: r.res, kuota };
  }

  if (aksi === "baca") {
    const g = String(b.gambar ?? "").replace(/^data:[^,]+,/, "");
    if (!g) return json({ ok: false, alasan: "gambar kosong" }, 400);
    if (g.length * 0.75 > MAKS_BYTE) return json({ ok: false, alasan: "gambar terlalu besar (maks 8 MB)" }, 400);
    const r = await satuBaca(g);
    if (!r.ok) return json(r);
    // deno-lint-ignore no-explicit-any
    const res: any = r.res;
    return json({ ok: true, mesin: "google-vision", fitur: "DOCUMENT_TEXT_DETECTION", teks: res?.fullTextAnnotation?.text ?? "", kata: kataDari(res), kuota: r.kuota });
  }

  if (aksi === "uji") {
    // Membaca KTP SINTETIS dari cabang uji-ocr, memetakan dengan modul yang sama dengan aplikasi, lalu membandingkan dengan kunci jawaban.
    const berkas = String(b.berkas ?? "");
    if (!/^[a-z0-9_\-]+\.jpg$/i.test(berkas)) return json({ ok: false, alasan: "nama berkas uji tidak valid" }, 400);
    const t0 = Date.now();
    const [ib, tr] = await Promise.all([fetch(UJI_BASE + "img/" + berkas), fetch(UJI_BASE + "truth.json")]);
    if (!ib.ok || !tr.ok) return json({ ok: false, alasan: "data uji tidak ditemukan" }, 404);
    const u8 = new Uint8Array(await ib.arrayBuffer()); const truth = (await tr.json())[berkas];
    let panggilan = 1;
    const r = await satuBaca(b64dari(u8));
    if (!r.ok) return json({ ...r, berkas });
    // deno-lint-ignore no-explicit-any
    const res: any = r.res; const kata = kataDari(res);
    const img = await decode(u8) as Image; const W = img.width, H = img.height;
    const bar = C.barisDariKata(kata, "vision"); const peta = C.petakanKTP(bar.lines);
    const awal: Record<string, unknown> = {}; for (const k in peta.nilai) awal[k] = peta.nilai[k].v;
    // Tahap D: baca ulang potongan (logika yang sama dengan aplikasi)
    const daftar = C.perluBacaUlang(peta, bar.lines, 90, 3); const ulang: unknown[] = [];
    const beda: Record<string, string> = {};
    for (const it of daftar) {
      const [x0, y0, x1, y1] = C.kotakPotong(it.box, W, H); const h = y1 - y0, sk = Math.min(3, Math.max(1, 160 / h));
      const pot = img.clone().crop(x0, y0, x1 - x0, h).resize(Math.round((x1 - x0) * sk), Math.round(h * sk));
      const rr = await satuBaca(b64dari(await pot.encodeJPEG(95))); panggilan++;
      if (!rr.ok) { ulang.push({ key: it.key, alasan: it.alasan, hasil: "gagal: " + rr.alasan }); continue; }
      // deno-lint-ignore no-explicit-any
      const kk = kataDari(rr.res as any).map((k) => ({ ...k, q: k.q.map((v, i) => i % 2 ? v / sk + y0 : v / sk + x0) }));
      const ls = C.barisDariKata(kk, "vision").lines;
      const keys = ["tempat_lahir", "tanggal_lahir"].includes(it.key) ? ["tempat_lahir", "tanggal_lahir"] : [it.key];
      for (const k of keys) { const o = C.nilaiDariPotongan(k, ls); const g = C.gabungKandidat(peta.nilai[k] || null, o); if (o) { if (g.pilih === o) peta.nilai[k] = o; if (g.beda) beda[k] = o.v; } ulang.push({ key: k, alasan: it.alasan, hasil: o ? o.v : "(tidak terbaca)" }); }
    }
    const KEYS = ["provinsi", "kabkota", "nik", "nama", "tempat_lahir", "tanggal_lahir", "jk", "gol", "alamat", "rtrw", "kel", "kec", "agama", "status", "kerja", "wn", "berlaku", "kota_terbit", "tgl_terbit"];
    const REQ = ["provinsi", "kabkota", "nik", "nama", "tempat_lahir", "tanggal_lahir", "jk", "alamat", "agama", "status", "kerja", "wn", "berlaku"];
    const N = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();
    const per: Record<string, unknown> = {}; let cerE = 0, cerN = 0;
    for (const k of KEYS) {
      const o = peta.nilai[k]; const g = N(o?.v), e = N(truth[k]);
      const ditandai = !g ? REQ.includes(k) : (!C.validasi(k, g).ok || !!beda[k] || (o?.conf != null && o.conf < 90));
      const lain = KEYS.filter((x) => x !== k && g && g === N(truth[x]));
      cerE += C.lev(g, e); cerN += e.length;
      per[k] = { ok: g === e, kosong: !g, salahpeta: lain.length > 0, ditandai, skor: o?.conf ?? null, dapat: g, harus: e, kandidat_beda: beda[k] ?? null };
    }
    const hasil = { ok: true, mesin: "google-vision", berkas, varian: truth.varian, panggilan_ocr: panggilan, ms: Date.now() - t0, miring: Math.round(bar.miring * 10) / 10, kualitas_teks: C.kualitasTeks(kata, W, H, bar.miring).map((c: { x: string }) => c.x), cer_kolom: +(cerE / Math.max(1, cerN)).toFixed(4), awal, ulang, per, kuota: r.kuota };
    await admin.from("vision_uji_hasil").insert({ berkas, versi: C.VERSI, hasil });
    return json(hasil);
  }
  return json({ ok: false, alasan: "aksi tidak dikenal" }, 400);
});
