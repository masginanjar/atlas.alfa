// ============================================================
//  EMAIL-OTORISASI — kirim email otorisasi (1 invoice = 1 email) ke otorisator yang bekerja lewat email.
//  • Dikirim dari Gmail kantor lewat SMTP. Kata sandi aplikasi hanya di Supabase Secrets: GMAIL_OTO_APP_PASSWORD.
//  • Alamat tujuan, alamat tes & mode tes disimpan di tabel tertutup pembayaran_gateway_config (key 'oto_email'),
//    TIDAK pernah dikirim dari browser. Selama mode tes nyala, email HANYA ke alamat tes.
//  • Izin: app_izin('email-otorisasi.tambah') untuk kirim; app_izin('email-otorisasi.atur') untuk mode tes.
//  • Log hanya metadata (siapa, project, jumlah & ukuran lampiran, hasil) di email_oto_log — tanpa isi email / nama file.
//  aksi: info | kirim | atur | uji (x-uji-token; email SINTETIS hanya ke alamat tes, tidak pernah ke otorisator)
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-uji-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const MAKS_B64 = 25 * 1024 * 1024; // ≈ 18 MB lampiran
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const samar = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, "$1•••$2");
type Setel = { mode_tes: boolean; tes: string; pengirim?: string; users: Record<string, { email: string; sapaan?: string }> };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, alasan: "metode tidak didukung" }, 405);
  const URL_ = Deno.env.get("SUPABASE_URL")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!, SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(URL_, SR, { auth: { persistSession: false } });
  // deno-lint-ignore no-explicit-any
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { return json({ ok: false, alasan: "isi permintaan tidak valid" }, 400); }
  const sandi = (Deno.env.get("GMAIL_OTO_APP_PASSWORD") ?? "").replace(/\s+/g, "");
  const { data: cfg } = await admin.from("pembayaran_gateway_config").select("value").eq("key", "oto_email").maybeSingle();
  let setel: Setel = { mode_tes: true, tes: "", users: {} };
  try { const v = typeof cfg?.value === "string" ? JSON.parse(cfg.value) : cfg?.value; if (v && typeof v === "object") setel = { mode_tes: v.mode_tes !== false, tes: String(v.tes ?? ""), pengirim: String(v.pengirim ?? ""), users: v.users ?? {} }; } catch (_) { /* setelan rusak → dianggap kosong, mode tes tetap nyala */ }
  // Alamat Gmail pengirim: dari setelan tertutup (key oto_email), cadangan dari Secrets GMAIL_OTO_USER. Kata sandinya HANYA di Secrets.
  const pengirim = (EMAIL.test(setel.pengirim ?? "") ? setel.pengirim! : (Deno.env.get("GMAIL_OTO_USER") ?? "")).trim();
  const kirimSmtp = (to: string, subject: string, text: string, attachments: unknown[]) =>
    nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: pengirim, pass: sandi }, connectionTimeout: 20000, socketTimeout: 60000 })
      .sendMail({ from: `"Otorisasi 247" <${pengirim}>`, to, replyTo: pengirim, subject, text, attachments });
  const pesanGalat = (e: unknown) => { const m = String((e as Error)?.message ?? ""); return /Invalid login|Username and Password|535|534/i.test(m) ? "Gmail menolak login — kata sandi aplikasi salah / dicabut / bukan milik akun pengirim" : /timeout|ETIMEDOUT|ECONN/i.test(m) ? "Tidak bisa terhubung ke Gmail — coba lagi" : "Email gagal dikirim"; };

  // Uji otomatis: hanya email SINTETIS ke alamat tes. Tidak membaca project, tidak pernah ke otorisator.
  const uji = req.headers.get("x-uji-token") ?? "";
  if (uji) {
    const { data: tk } = await admin.from("pembayaran_gateway_config").select("value").eq("key", "uji_token").maybeSingle();
    if (!(tk?.value && uji.length >= 20 && uji === tk.value) || String(b.aksi ?? "") !== "uji") return json({ ok: false, alasan: "tidak diizinkan" }, 401);
    if (!pengirim || !sandi) return json({ ok: false, alasan: "belum disetel", ada_pengirim: !!pengirim, ada_sandi: !!sandi });
    if (!EMAIL.test(setel.tes)) return json({ ok: false, alasan: "alamat tes belum diisi" });
    try {
      await kirimSmtp(setel.tes, "[TES] Otorisasi BELANDA Kamis 19 November 2026, PK. 16.00 WITA",
        "Selamat Malam Pak Arifin, berikut kami kirimkan dokumen Belanda yang perlu diotorisasi:\n\n1. 0000000000000 NED-IND Pelanggan Contoh Sintetis\n\nTerima kasih Pak Arifin😊🙏\n\n— Email TES dari ATLAS dengan data buatan (bukan dokumen pelanggan). Belum dikirim ke otorisator.",
        [{ filename: "Contoh dokumen sumber (sintetis).txt", content: "Berkas contoh sintetis — dokumen sumber." }, { filename: "NED-IND Contoh hasil proofread (sintetis).txt", content: "Berkas contoh sintetis — hasil proofread." }]);
    } catch (e) { await admin.from("email_oto_log").insert({ user_id: "uji-otomatis", aksi: "uji", tes: true, lampiran: 2, hasil: "gagal" }); return json({ ok: false, alasan: pesanGalat(e) }); }
    await admin.from("email_oto_log").insert({ user_id: "uji-otomatis", aksi: "uji", tes: true, lampiran: 2, hasil: "ok" });
    return json({ ok: true, uji: true, ke: samar(setel.tes), dari: samar(pengirim) });
  }
  const db = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data: u } = await db.auth.getUser();
  if (!u?.user) return json({ ok: false, alasan: "silakan login ulang" }, 401);
  const { data: row } = await admin.from("users").select("id, doc, active").eq("auth_id", u.user.id).maybeSingle();
  if (!row || (row.active ?? row.doc?.active) === false) return json({ ok: false, alasan: "akun tidak dikenal" }, 403);
  const { data: izin } = await db.rpc("app_izin", { kode: "email-otorisasi.tambah" });
  if (izin !== true) return json({ ok: false, alasan: "Tidak ada akses Email Otorisasi" }, 403);

  const aksi = String(b.aksi ?? "");

  if (aksi === "info") {
    const ids = Object.keys(setel.users).filter((k) => EMAIL.test(setel.users[k]?.email ?? ""));
    const { data: us } = ids.length ? await admin.from("users").select("id, doc").in("id", ids) : { data: [] };
    // deno-lint-ignore no-explicit-any
    const penerima = (us ?? []).map((x: any) => ({ id: x.id, nama: String(x.doc?.name ?? x.id), sapaan: String(setel.users[x.id]?.sapaan ?? "Bapak/Ibu") }));
    return json({ ok: true, penerima, mode_tes: setel.mode_tes, tes_ke: setel.tes ? samar(setel.tes) : "", siap: !!(pengirim && sandi) });
  }
  if (aksi === "atur") {
    const { data: at } = await db.rpc("app_izin", { kode: "email-otorisasi.atur" });
    if (at !== true) return json({ ok: false, alasan: "Tidak ada izin mengubah mode tes" }, 403);
    const baru = { ...setel, mode_tes: b.mode_tes !== false };
    if (baru.mode_tes && !EMAIL.test(baru.tes)) return json({ ok: false, alasan: "Alamat tes belum diisi di server" }, 400);
    const { error } = await admin.from("pembayaran_gateway_config").upsert({ key: "oto_email", value: JSON.stringify(baru) }, { onConflict: "key" });
    if (error) return json({ ok: false, alasan: "Gagal menyimpan setelan" }, 500);
    await admin.from("email_oto_log").insert({ user_id: row.id, aksi: baru.mode_tes ? "tes_nyala" : "tes_mati", hasil: "ok" });
    return json({ ok: true, mode_tes: baru.mode_tes });
  }
  if (aksi !== "kirim") return json({ ok: false, alasan: "aksi tidak dikenal" }, 400);

  if (!pengirim || !sandi) return json({ ok: false, alasan: "Email belum disetel di server (kata sandi aplikasi Gmail belum dipasang)" });
  const project_id = String(b.project_id ?? ""), oto_id = String(b.oto_id ?? "");
  const tujuanAsli = String(setel.users[oto_id]?.email ?? "");
  if (!EMAIL.test(tujuanAsli)) return json({ ok: false, alasan: "Otorisator ini belum punya alamat email terdaftar" }, 400);
  const tes = setel.mode_tes;
  if (tes && !EMAIL.test(setel.tes)) return json({ ok: false, alasan: "Mode tes nyala tetapi alamat tes belum diisi di server" }, 400);
  // project harus terlihat oleh pemanggil (RLS atas nama pengguna)
  const { data: pr } = await db.from("projects").select("id").eq("id", project_id).maybeSingle();
  if (!pr) return json({ ok: false, alasan: "Project tidak ditemukan / tidak ada akses" }, 404);
  const subjek = String(b.subjek ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200), isi = String(b.isi ?? "").slice(0, 6000);
  if (subjek.length < 5 || isi.trim().length < 10) return json({ ok: false, alasan: "Judul / isi email kosong" }, 400);
  // deno-lint-ignore no-explicit-any
  const lamp = (Array.isArray(b.lampiran) ? b.lampiran : []).slice(0, 25) as any[];
  if (!lamp.length) return json({ ok: false, alasan: "Lampiran kosong" }, 400);
  let ukuran = 0;
  for (const l of lamp) { const s = String(l?.b64 ?? ""); if (!s || !/^[A-Za-z0-9+/=]+$/.test(s.slice(0, 2000))) return json({ ok: false, alasan: "Lampiran tidak valid" }, 400); ukuran += s.length; }
  if (ukuran > MAKS_B64) return json({ ok: false, alasan: "Lampiran melebihi 18 MB" }, 400);
  // batas laju: 40 email / jam per pengguna
  const { count } = await admin.from("email_oto_log").select("id", { count: "exact", head: true }).eq("user_id", row.id).eq("aksi", "kirim").gte("at", new Date(Date.now() - 3600e3).toISOString());
  if ((count ?? 0) >= 40) return json({ ok: false, alasan: "Terlalu banyak email dalam 1 jam — tunggu sebentar" });

  const catat = (hasil: string) => admin.from("email_oto_log").insert({ user_id: row.id, aksi: "kirim", project_id, oto_id, tes, lampiran: lamp.length, ukuran: Math.round(ukuran * 0.75), hasil });
  try {
    await kirimSmtp(tes ? setel.tes : tujuanAsli, (tes ? "[TES] " : "") + subjek, isi + (tes ? "\n\n— Email TES dari ATLAS. Tujuan sebenarnya: otorisator (belum dikirim ke beliau)." : ""),
      lamp.map((l) => ({ filename: String(l.nama ?? "lampiran").replace(/[\\/\r\n]+/g, " ").slice(0, 180), content: String(l.b64), encoding: "base64", contentType: /^[\w.+-]+\/[\w.+-]+$/.test(String(l.mime ?? "")) ? String(l.mime) : "application/octet-stream" })));
  } catch (e) {
    await catat("gagal");
    return json({ ok: false, alasan: pesanGalat(e) });
  }
  await catat("ok");
  return json({ ok: true, tes });
});
