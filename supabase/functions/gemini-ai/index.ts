// ============================================================
//  GEMINI-AI — pembaca dokumen berbasis AI (Google Gemini) untuk ATLAS
//  • Kunci hanya di Supabase Secrets: GEMINI_API_KEY (tidak pernah ke front-end / log).
//  • Model dipilih PER FITUR di tabel ai_setelan (Pengaturan → AI). Model "" = fitur tidak memakai AI.
//  • Prompt & bentuk jawaban ditentukan di server (fungsi ini bukan pintu bebas ke Gemini).
//  • Batas biaya per fitur per bulan (rupiah, perkiraan). Tercapai → { ok:false, cadangan:true, habis:true }.
//  • Isi dokumen TIDAK disimpan dan TIDAK ditulis ke log; log hanya metadata (fitur, model, token, biaya).
//  aksi: "info" | "atur" | "jalan" (fitur + gambar) | "uji" (x-uji-token, data SINTETIS saja)
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-uji-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const MAKS_BYTE = 8 * 1024 * 1024;
const bulanIni = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Makassar" }).slice(0, 7);

/** Katalog model (yang benar-benar bisa dipakai kunci ini, dicoba 15 Nov 2026). Harga USD per 1 juta token (masuk / keluar) — perkiraan:
 *  3.1 Flash-Lite, 3 Flash, 3.1 Pro dari ai.google.dev/gemini-api/docs/pricing; 3.5 Flash-Lite & 3.8 Flash dari pelacak harga pihak ketiga (belum tercantum di halaman resmi saat dicek).
 *  Model 2.5 tidak dimasukkan: Google menolaknya untuk kunci baru. Katalog bisa diubah lewat ai_setelan.doc.katalog tanpa memasang ulang. */
const KATALOG: Record<string, { label: string; tingkat: "hemat" | "menengah" | "bagus"; masuk: number; keluar: number }> = {
  "gemini-3.1-flash-lite": { label: "Gemini 3.1 Flash-Lite", tingkat: "hemat", masuk: 0.25, keluar: 1.50 },
  "gemini-3.5-flash-lite": { label: "Gemini 3.5 Flash-Lite", tingkat: "hemat", masuk: 0.30, keluar: 2.50 },
  "gemini-3-flash-preview": { label: "Gemini 3 Flash", tingkat: "menengah", masuk: 0.50, keluar: 3.00 },
  "gemini-3.8-flash": { label: "Gemini 3.8 Flash", tingkat: "menengah", masuk: 0.75, keluar: 3.75 },
  "gemini-3.1-pro-preview": { label: "Gemini 3.1 Pro", tingkat: "bagus", masuk: 2.00, keluar: 12.00 },
};
/** Fitur → izin yang dibutuhkan (salah satu) + tugas yang boleh dijalankan + bawaan. */
const FITUR: Record<string, { label: string; izin: string[]; tugas: string; model: string; batas_rp: number }> = {
  penerjemah: { label: "Smart Translator", izin: ["smart-translator.lihat"], tugas: "ktp", model: "gemini-3.8-flash", batas_rp: 100000 },
  surat_kuasa: { label: "Surat Kuasa (baca KTP)", izin: ["surat-kuasa.tambah", "surat-kuasa.ubah"], tugas: "ktp", model: "gemini-3.1-flash-lite", batas_rp: 50000 },
  bukti: { label: "Bukti transfer massal", izin: ["pengajuan.setujui"], tugas: "bukti", model: "gemini-3.1-flash-lite", batas_rp: 50000 },
};
const IZIN_ATUR = "pengaturan.ai.atur";
const BAWAAN = () => ({ kurs: 17000, fitur: Object.fromEntries(Object.entries(FITUR).map(([k, f]) => [k, { model: f.model, batas_rp: f.batas_rp, ...(k === "bukti" ? { otomatis: true } : {}) }])) });

const S = (d: string) => ({ type: "STRING", description: d });
const KTP_KOLOM: [string, string][] = [
  ["provinsi", "Nama provinsi di kepala kartu, tanpa kata PROVINSI"], ["kabkota", "Baris kedua kepala kartu, mis. KABUPATEN DEMAK atau KOTA DENPASAR"],
  ["nik", "NIK persis seperti tercetak"], ["nama", "Nama"], ["tempat_lahir", "Tempat lahir"], ["tanggal_lahir", "Tanggal lahir DD-MM-YYYY"],
  ["jk", "Jenis kelamin: LAKI-LAKI atau PEREMPUAN"], ["gol", "Golongan darah; bila tercetak tanda strip tulis -"], ["alamat", "Baris Alamat saja (tanpa RT/RW, Kel/Desa, Kecamatan)"],
  ["rtrw", "RT/RW, mis. 003/007"], ["kel", "Kel/Desa"], ["kec", "Kecamatan"], ["agama", "Agama"], ["status", "Status perkawinan"], ["kerja", "Pekerjaan"],
  ["wn", "Kewarganegaraan"], ["berlaku", "Berlaku hingga"], ["kota_terbit", "Kota penerbitan (di atas tanggal, kanan bawah)"], ["tgl_terbit", "Tanggal penerbitan DD-MM-YYYY"],
];
const TUGAS: Record<string, { prompt: string; skema: unknown; maksKeluar: number }> = {
  ktp: {
    prompt: "Gambar ini seharusnya KTP Indonesia (boleh miring, terputar, atau buram). Salin isi tiap kolom PERSIS seperti tercetak, huruf demi huruf, tanpa memperbaiki ejaan, tanpa melengkapi, tanpa menebak. " +
      "Kolom yang tidak terlihat, terpotong, atau tidak bisa dibaca dengan yakin: isi string kosong dan masukkan nama kolomnya ke daftar \"ragu\". Kolom yang terbaca tetapi ada huruf/angka yang meragukan: tetap salin apa adanya dan masukkan juga ke \"ragu\". " +
      "NIK: salin karakter yang terlihat saja; jangan menambah, membuang, atau mengganti karakter agar menjadi 16 angka. \"jenis\": tulis KTP bila ini KTP, selain itu nama jenis dokumennya.",
    skema: { type: "OBJECT", properties: { jenis: S("KTP atau jenis dokumen lain"), ...Object.fromEntries(KTP_KOLOM.map(([k, d]) => [k, S(d)])), ragu: { type: "ARRAY", items: { type: "STRING" } } }, required: ["jenis", "ragu", ...KTP_KOLOM.map(([k]) => k)] },
    maksKeluar: 1200,
  },
  bukti: {
    prompt: "Gambar ini tangkapan layar daftar transaksi transfer dari internet banking (tabel dengan baris judul kolom). Untuk SETIAP baris transaksi, dari atas ke bawah, salin isi selnya PERSIS seperti tertulis (tanpa mengubah angka, tanpa menebak). Baris judul kolom tidak dihitung. " +
      "jumlah = nominal transfer persis seperti tertulis; dari = rekening sumber (nomor dan nama); ke = rekening tujuan (nomor dan nama); status = status transaksi; tgl = tanggal transfer; berita = berita/keterangan; ref = nomor referensi. Sel yang tidak ada atau tidak terbaca: string kosong.",
    skema: { type: "OBJECT", properties: { baris: { type: "ARRAY", items: { type: "OBJECT", properties: { jumlah: S("nominal"), dari: S("rekening sumber"), ke: S("rekening tujuan"), status: S("status"), tgl: S("tanggal transfer"), berita: S("berita"), ref: S("nomor referensi") }, required: ["jumlah", "dari", "ke", "status", "tgl", "berita", "ref"] } } }, required: ["baris"] },
    maksKeluar: 6000,
  },
};

/** Panggil Gemini. Ulang 1× untuk gangguan sementara. Pesan galat tanpa isi dokumen. */
async function panggilGemini(kunci: string, model: string, tugas: string, b64: string, mime: string) {
  const T = TUGAS[tugas];
  // deno-lint-ignore no-explicit-any
  const cfg: any = { temperature: 0, responseMimeType: "application/json", responseSchema: T.skema, maxOutputTokens: T.maksKeluar };
  if (!/flash-lite/.test(model)) cfg.maxOutputTokens = T.maksKeluar + 6000; // model yang "berpikir": sisakan ruang untuk token berpikir
  const body = JSON.stringify({ contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime, data: b64 } }, { text: T.prompt }] }], generationConfig: cfg });
  let terakhir = "";
  for (let i = 0; i < 2; i++) {
    let r: Response;
    try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": kunci }, body, signal: AbortSignal.timeout(40000) }); }
    catch (_) { terakhir = "Gemini tidak menjawab dalam 40 detik (jaringan/antrean)"; await new Promise((s) => setTimeout(s, 700)); continue; }
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json().catch(() => ({}));
    const u = j?.usageMetadata ?? {};
    const pakai = { masuk: u.promptTokenCount ?? 0, keluar: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) };
    if (r.ok && !j.error) {
      const c = j?.candidates?.[0]; const teks = (c?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
      if (c?.finishReason === "MAX_TOKENS") return { ok: false, alasan: "Jawaban AI terpotong (dokumen terlalu padat)", sementara: false, pakai };
      try { return { ok: true, data: JSON.parse(teks), pakai }; } catch (_) { return { ok: false, alasan: c?.finishReason && c.finishReason !== "STOP" ? `AI tidak menjawab (${c.finishReason})` : "Jawaban AI tidak bisa dibaca", sementara: false, pakai }; }
    }
    const st = r.status, kode = j?.error?.status || "", rinci = String(j?.error?.message || "").slice(0, 300);
    const g = (alasan: string) => ({ ok: false, alasan, sementara: false, pakai, rinci });
    if (st === 404 || kode === "NOT_FOUND") return g(`Model ${model} tidak tersedia untuk kunci ini — pilih model lain di Pengaturan → AI`);
    if (st === 403 || kode === "PERMISSION_DENIED") return g("Google menolak permintaan (kunci dibatasi / Gemini API belum aktif)");
    if (st === 400 && /API key/i.test(rinci)) return g("Kunci Gemini tidak valid");
    if (st === 400 || kode === "INVALID_ARGUMENT") return g("Permintaan ditolak Gemini (gambar/format tidak valid)");
    if (st === 401) return g("Kunci Gemini tidak valid");
    terakhir = st === 429 || kode === "RESOURCE_EXHAUSTED" ? (/billing|plan/i.test(rinci) ? "Kuota kunci Gemini habis / model ini butuh billing aktif di Google" : "Batas pemakaian Gemini tercapai — coba lagi sebentar") : `Gemini sedang bermasalah (${st})`;
    await new Promise((s) => setTimeout(s, 900));
  }
  return { ok: false, alasan: terakhir, sementara: true, pakai: { masuk: 0, keluar: 0 } };
}
type Kat = typeof KATALOG;
const biayaUsd = (KAT: Kat, model: string, p: { masuk: number; keluar: number }) => { const k = KAT[model]; return k ? (p.masuk * k.masuk + p.keluar * k.keluar) / 1e6 : 0; };
const b64dari = (u8: Uint8Array) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, alasan: "metode tidak didukung" }, 405);
  const URL_ = Deno.env.get("SUPABASE_URL")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!, SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(URL_, SR, { auth: { persistSession: false } });
  // deno-lint-ignore no-explicit-any
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { return json({ ok: false, alasan: "isi permintaan tidak valid" }, 400); }
  const aksi = String(b.aksi ?? "");
  const kunci = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();

  const uji = req.headers.get("x-uji-token") ?? "";
  let user: { id: string; branch: string | null; nama: string } | null = null;
  // deno-lint-ignore no-explicit-any
  let db: any = null;
  if (uji) {
    const { data: cfg } = await admin.from("pembayaran_gateway_config").select("value").eq("key", "uji_token").maybeSingle();
    if (!(cfg?.value && uji.length >= 20 && uji === cfg.value) || aksi !== "uji") return json({ ok: false, alasan: "tidak diizinkan" }, 401);
    user = { id: "uji-otomatis", branch: null, nama: "uji" };
  } else {
    const auth = req.headers.get("Authorization") ?? "";
    db = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u } = await db.auth.getUser();
    if (!u?.user) return json({ ok: false, alasan: "silakan login ulang" }, 401);
    const { data: row } = await admin.from("users").select("id, doc, role, active").eq("auth_id", u.user.id).maybeSingle();
    const active = row ? (row.active ?? row.doc?.active) : false;
    if (!row || active === false) return json({ ok: false, alasan: "akun tidak dikenal" }, 403);
    user = { id: row.id, branch: row.doc?.branch ?? null, nama: row.doc?.name ?? "" };
    if (aksi === "uji") return json({ ok: false, alasan: "tidak diizinkan" }, 401);
  }
  const boleh = async (kode: string) => { if (!db) return false; const { data } = await db.rpc("app_izin", { kode }); return data === true; };

  const { data: st } = await admin.from("ai_setelan").select("doc").eq("id", 1).maybeSingle();
  const B = BAWAAN();
  // Katalog bisa ditambah/dikurangi dari database (ai_setelan.doc.katalog; nilai null = sembunyikan) tanpa memasang ulang fungsi.
  const KAT: Kat = Object.fromEntries(Object.entries({ ...KATALOG, ...(st?.doc?.katalog ?? {}) }).filter(([, v]) => v)) as Kat;
  const setelan = { kurs: Number(st?.doc?.kurs) || B.kurs, fitur: Object.fromEntries(Object.keys(FITUR).map((k) => [k, { ...B.fitur[k], ...(st?.doc?.fitur?.[k] ?? {}) }])) as Record<string, { model: string; batas_rp: number; otomatis?: boolean }> };
  const pakaiBulan = async () => {
    const { data } = await admin.from("ai_pakai_log").select("fitur, biaya_usd, hasil").eq("bulan", bulanIni());
    const o: Record<string, { n: number; usd: number }> = {};
    for (const r of data ?? []) { const x = (o[r.fitur] ||= { n: 0, usd: 0 }); if (r.hasil === "ok") x.n++; x.usd += Number(r.biaya_usd) || 0; }
    return o;
  };

  if (aksi === "info") {
    const atur = await boleh(IZIN_ATUR);
    const ringkas = Object.fromEntries(Object.entries(setelan.fitur).map(([k, f]) => [k, { model: f.model, otomatis: f.otomatis ?? null }]));
    if (!atur) return json({ ok: true, aktif: !!kunci, atur: false, fitur: ringkas });
    return json({ ok: true, aktif: !!kunci, atur: true, bulan: bulanIni(), setelan, pakai: await pakaiBulan(), katalog: Object.entries(KAT).map(([id, k]) => ({ id, ...k })), daftarFitur: Object.entries(FITUR).map(([id, f]) => ({ id, label: f.label })) });
  }

  if (aksi === "atur") {
    if (!(await boleh(IZIN_ATUR))) return json({ ok: false, alasan: "Tidak ada akses mengatur AI" }, 403);
    const baru = { ...(st?.doc ?? {}), ...structuredClone(setelan) };
    const kurs = Number(b.kurs); if (b.kurs != null) { if (!(kurs >= 10000 && kurs <= 40000)) return json({ ok: false, alasan: "Kurs harus antara 10.000 dan 40.000" }, 400); baru.kurs = Math.round(kurs); }
    for (const [k, v] of Object.entries((b.fitur ?? {}) as Record<string, { model?: string; batas_rp?: number; otomatis?: boolean }>)) {
      if (!FITUR[k]) return json({ ok: false, alasan: `Fitur ${k} tidak dikenal` }, 400);
      if (v.model != null) { if (v.model !== "" && !KAT[v.model]) return json({ ok: false, alasan: "Model tidak ada di daftar" }, 400); baru.fitur[k].model = v.model; }
      if (v.batas_rp != null) { const n = Number(v.batas_rp); if (!(n >= 0 && n <= 20000000)) return json({ ok: false, alasan: "Batas biaya harus 0 sampai 20 juta rupiah" }, 400); baru.fitur[k].batas_rp = Math.round(n); }
      if (v.otomatis != null && k === "bukti") baru.fitur[k].otomatis = !!v.otomatis;
    }
    const { error } = await admin.from("ai_setelan").upsert({ id: 1, doc: baru, updated_at: new Date().toISOString(), updated_by: user.id });
    if (error) return json({ ok: false, alasan: "Pengaturan gagal disimpan" }, 500);
    await admin.from("ai_pakai_log").insert({ bulan: bulanIni(), fitur: "pengaturan", model: "", user_id: user.id, branch: user.branch, token_masuk: 0, token_keluar: 0, biaya_usd: 0, hasil: "atur", catatan: JSON.stringify({ dari: setelan, ke: baru }) });
    return json({ ok: true, setelan: baru });
  }

  /** Satu panggilan AI dengan batas biaya, batas laju, dan log metadata. */
  async function satu(fitur: string, model: string, tugas: string, b64: string, mime: string) {
    if (!kunci) return { ok: false, cadangan: true, alasan: "Kunci Gemini belum dipasang di server" };
    const { count } = await admin.from("ai_pakai_log").select("id", { count: "exact", head: true }).eq("user_id", user!.id).gte("at", new Date(Date.now() - 5 * 60e3).toISOString());
    if ((count ?? 0) >= 60) return { ok: false, cadangan: true, alasan: "Terlalu banyak permintaan dalam 5 menit — tunggu sebentar" };
    const batas = fitur === "uji" ? 20000 : setelan.fitur[fitur].batas_rp;
    const terpakai = ((await pakaiBulan())[fitur]?.usd ?? 0) * setelan.kurs;
    if (terpakai >= batas) return { ok: false, cadangan: true, habis: true, alasan: `Batas biaya AI bulan ini untuk ${FITUR[fitur]?.label ?? fitur} sudah tercapai` };
    const t0 = Date.now();
    const r = await panggilGemini(kunci, model, tugas, b64, mime);
    const usd = biayaUsd(KAT, model, r.pakai);
    await admin.from("ai_pakai_log").insert({ bulan: bulanIni(), fitur, model, user_id: user!.id, branch: user!.branch, token_masuk: r.pakai.masuk, token_keluar: r.pakai.keluar, biaya_usd: usd, hasil: r.ok ? "ok" : "gagal", ms: Date.now() - t0 });
    // deno-lint-ignore no-explicit-any
    if (!r.ok) return { ok: false, cadangan: true, alasan: r.alasan, model, ...(uji ? { rinci: (r as any).rinci ?? null } : {}) };
    return { ok: true, mesin: "gemini", model, modelLabel: KAT[model]?.label ?? model, data: r.data, biaya_rp: Math.round(usd * setelan.kurs * 100) / 100, ...(uji ? { token: r.pakai } : {}) };
  }

  if (aksi === "jalan") {
    const fitur = String(b.fitur ?? ""); const F = FITUR[fitur];
    if (!F) return json({ ok: false, alasan: "fitur tidak dikenal" }, 400);
    let izin = false; for (const k of F.izin) if (await boleh(k)) { izin = true; break; }
    if (!izin) return json({ ok: false, alasan: `Tidak ada akses ${F.label}` }, 403);
    const model = setelan.fitur[fitur].model;
    if (!model) return json({ ok: false, cadangan: true, mati: true, alasan: "AI dimatikan untuk fitur ini" });
    const m = String(b.gambar ?? "").match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
    if (!m) return json({ ok: false, alasan: "gambar harus JPG/PNG/WebP" }, 400);
    if (m[2].length * 0.75 > MAKS_BYTE) return json({ ok: false, alasan: "gambar terlalu besar (maks 8 MB)" }, 400);
    return json(await satu(fitur, model, F.tugas, m[2], m[1]));
  }

  if (aksi === "uji") {
    // Hanya data SINTETIS: KTP karangan di cabang uji-ocr, dan contoh screenshot karangan di repo.
    const tugas = String(b.tugas ?? "");
    if (tugas === "model") {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": kunci } });
      // deno-lint-ignore no-explicit-any
      const j: any = await r.json().catch(() => ({}));
      const ada = (j.models ?? []).map((x: { name: string }) => x.name.replace(/^models\//, ""));
      return json({ ok: r.ok, status: r.status, kunciAda: !!kunci, galat: j?.error?.status ?? null, katalog: Object.keys(KAT).map((id) => ({ id, ada: ada.includes(id) })), flash: ada.filter((x: string) => /flash|pro/.test(x) && !/tts|image|audio|live|embedding/.test(x)) });
    }
    if (tugas === "coba") {
      // Panggilan teks sangat kecil ke tiap model: memastikan model benar-benar bisa dipakai kunci ini.
      const daftar: string[] = (Array.isArray(b.daftar) ? b.daftar : Object.keys(KAT)).filter((x: unknown) => typeof x === "string" && /^gemini-[\w.\-]+$/.test(x)).slice(0, 12);
      const hasil = await Promise.all(daftar.map(async (id) => {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${id}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": kunci }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Balas satu kata: OK" }] }] }) });
        // deno-lint-ignore no-explicit-any
        const j: any = await r.json().catch(() => ({}));
        return { id, status: r.status, galat: j?.error ? String(j.error.message || "").slice(0, 200) : null, token: j?.usageMetadata ? [j.usageMetadata.promptTokenCount ?? 0, (j.usageMetadata.candidatesTokenCount ?? 0) + (j.usageMetadata.thoughtsTokenCount ?? 0)] : null };
      }));
      return json({ ok: true, hasil });
    }
    const model = String(b.model ?? ""); if (!/^gemini-[\w.\-]+$/.test(model)) return json({ ok: false, alasan: "model tidak dikenal" }, 400);
    let url = "";
    if (tugas === "ktp" && /^[a-z0-9_\-]+\.jpg$/i.test(String(b.berkas ?? ""))) url = "https://raw.githubusercontent.com/masginanjar/atlas.alfa/uji-ocr/uji/ocr/img/" + b.berkas;
    else if (tugas === "bukti") url = "https://raw.githubusercontent.com/masginanjar/atlas.alfa/main/public/contoh/contoh-klikbca-transfer.png";
    else return json({ ok: false, alasan: "tugas uji tidak dikenal" }, 400);
    const ib = await fetch(url); if (!ib.ok) return json({ ok: false, alasan: "data uji tidak ditemukan" }, 404);
    const r = await satu("uji", model, tugas, b64dari(new Uint8Array(await ib.arrayBuffer())), tugas === "bukti" ? "image/png" : "image/jpeg");
    return json({ ...r, berkas: b.berkas ?? null });
  }

  return json({ ok: false, alasan: "aksi tidak dikenal" }, 400);
});
