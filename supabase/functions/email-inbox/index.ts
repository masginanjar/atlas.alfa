// ============================================================
//  EMAIL-INBOX — Inbox Otorisasi: membaca BALASAN email dari otorisator di kotak masuk Gmail pengirim (IMAP).
//  • Hanya email yang PENGIRIMNYA alamat otorisator terdaftar (dan alamat tes selama mode tes) yang dibaca. Email lain tidak disentuh.
//  • Baca-saja: tidak menghapus, tidak memindahkan, tidak menandai sudah dibaca (mailbox dibuka readOnly).
//  • Kata sandi aplikasi hanya di Supabase Secrets (GMAIL_OTO_APP_PASSWORD); alamat & daftar otorisator di tabel tertutup (key 'oto_email').
//  • Izin: app_izin('inbox-otorisasi.lihat') untuk daftar; app_izin('inbox-otorisasi.tambah') untuk mengambil lampiran.
//  • Tidak ada isi email / nama file yang ditulis ke log.
//  aksi: inbox | lampiran {uid, part} | uji (x-uji-token; hanya mengembalikan JUMLAH, tanpa isi)
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ImapFlow } from "npm:imapflow@1.0.171";
import { Buffer } from "node:buffer";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-uji-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const MAKS_LAMPIRAN = 15 * 1024 * 1024, HARI = 30, MAKS_PESAN = 40;
// deno-lint-ignore no-explicit-any
type Any = any;

const rata = (n: Any, out: Any[] = []): Any[] => { if (!n) return out; if (n.childNodes?.length) n.childNodes.forEach((c: Any) => rata(c, out)); else out.push(n); return out; };
const namaBagian = (p: Any) => String(p?.dispositionParameters?.filename ?? p?.parameters?.name ?? "").replace(/[\\/\r\n]+/g, " ").trim().slice(0, 180);
const lampiranDari = (bs: Any) => rata(bs).filter((p) => namaBagian(p) && (String(p.disposition ?? "").toLowerCase() === "attachment" || !/^text\//i.test(String(p.type ?? "")))).map((p) => ({ part: String(p.part ?? "1"), nama: namaBagian(p), ukuran: Number(p.size) || 0, mime: String(p.type ?? "application/octet-stream") }));
const teksDari = (bs: Any) => { const p = rata(bs).find((x) => /^text\/plain/i.test(String(x.type ?? "")) && String(x.disposition ?? "").toLowerCase() !== "attachment"); return p ? String(p.part ?? "1") : ""; };
async function isi(stream: Any, maks: number): Promise<Uint8Array> { const bag: Uint8Array[] = []; let n = 0; for await (const c of stream) { const u = c instanceof Uint8Array ? c : new TextEncoder().encode(String(c)); n += u.length; if (n > maks) throw new Error("terlalu besar"); bag.push(u); } const out = new Uint8Array(n); let o = 0; for (const u of bag) { out.set(u, o); o += u.length; } return out; }
/** Buang kutipan email sebelumnya, sisakan tulisan pembalas. */
const tanpaKutipan = (t: string) => { const b: string[] = []; for (const l of t.replace(/\r/g, "").split("\n")) { if (/^(On|Pada) .*(wrote|menulis):?\s*$/i.test(l.trim()) || /^-{2,}\s*(Forwarded|Original)/i.test(l.trim())) break; if (l.trim().startsWith(">")) continue; b.push(l); } return b.join("\n").replace(/\n{3,}/g, "\n\n").trim(); };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, alasan: "metode tidak didukung" }, 405);
  const URL_ = Deno.env.get("SUPABASE_URL")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!, SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(URL_, SR, { auth: { persistSession: false } });
  let b: Record<string, Any> = {};
  try { b = await req.json(); } catch (_) { return json({ ok: false, alasan: "isi permintaan tidak valid" }, 400); }
  let aksi = String(b.aksi ?? "");
  const sandi = (Deno.env.get("GMAIL_OTO_APP_PASSWORD") ?? "").replace(/\s+/g, "");
  const { data: cfg } = await admin.from("pembayaran_gateway_config").select("value").eq("key", "oto_email").maybeSingle();
  let setel: Any = {};
  try { setel = (typeof cfg?.value === "string" ? JSON.parse(cfg.value) : cfg?.value) ?? {}; } catch (_) { setel = {}; }
  const pengirim = (EMAIL.test(String(setel.pengirim ?? "")) ? String(setel.pengirim) : (Deno.env.get("GMAIL_OTO_USER") ?? "")).trim();
  const modeTes = setel.mode_tes !== false;
  // alamat yang boleh dibaca: otorisator terdaftar (+ alamat tes selama mode tes)
  const boleh = new Map<string, { oto_id: string; tes: boolean }>();
  for (const [id, v] of Object.entries(setel.users ?? {})) { const e = String((v as Any)?.email ?? "").toLowerCase(); if (EMAIL.test(e)) boleh.set(e, { oto_id: id, tes: false }); }
  if (modeTes && EMAIL.test(String(setel.tes ?? ""))) { const e = String(setel.tes).toLowerCase(); if (!boleh.has(e)) boleh.set(e, { oto_id: "", tes: true }); }

  const uji = req.headers.get("x-uji-token") ?? "";
  let bisaAmbil = false;
  if (uji) {
    const { data: tk } = await admin.from("pembayaran_gateway_config").select("value").eq("key", "uji_token").maybeSingle();
    if (!(tk?.value && uji.length >= 20 && uji === tk.value) || aksi !== "uji") return json({ ok: false, alasan: "tidak diizinkan" }, 401);
  } else {
    if (aksi === "uji") return json({ ok: false, alasan: "tidak diizinkan" }, 401);
    const db = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
    const { data: u } = await db.auth.getUser();
    if (!u?.user) return json({ ok: false, alasan: "silakan login ulang" }, 401);
    const { data: row } = await admin.from("users").select("id, doc, active").eq("auth_id", u.user.id).maybeSingle();
    if (!row || (row.active ?? row.doc?.active) === false) return json({ ok: false, alasan: "akun tidak dikenal" }, 403);
    const { data: izin } = await db.rpc("app_izin", { kode: "inbox-otorisasi.lihat" });
    if (izin !== true) return json({ ok: false, alasan: "Tidak ada akses Inbox Otorisasi" }, 403);
    const { data: t } = await db.rpc("app_izin", { kode: "inbox-otorisasi.tambah" }); bisaAmbil = t === true;
    if (aksi === "lampiran" && !bisaAmbil) return json({ ok: false, alasan: "Tidak ada izin mengambil lampiran" }, 403);
  }
  if (!pengirim || !sandi) return json({ ok: false, alasan: "Email belum disetel di server" });
  if (!boleh.size) return json({ ok: true, data: [], mode_tes: modeTes, bisa_ambil: bisaAmbil });

  const c = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: pengirim, pass: sandi }, logger: false, socketTimeout: 60000 });
  c.on("error", () => { /* ditangani lewat try/catch di bawah */ });
  try { await c.connect(); } catch (e) {
    const m = String((e as Error)?.message ?? "") + " " + String((e as Any)?.responseText ?? "");
    return json({ ok: false, alasan: /auth|credential|password|login/i.test(m) ? "Gmail menolak login — kata sandi aplikasi salah / dicabut" : /imap.*(disabled|not enabled)/i.test(m) ? "IMAP belum aktif di akun Gmail pengirim" : "Tidak bisa terhubung ke Gmail — coba lagi" });
  }
  try {
    const kunci = await c.getMailboxLock("INBOX", { readOnly: true });
    try {
      if (aksi === "lampiran") {
        const uid = String(b.uid ?? ""), part = String(b.part ?? "");
        if (!/^\d{1,12}$/.test(uid) || !/^[\d.]{1,20}$/.test(part)) return json({ ok: false, alasan: "permintaan tidak valid" }, 400);
        const m: Any = await c.fetchOne(uid, { uid: true, envelope: true, bodyStructure: true }, { uid: true });
        const dari = String(m?.envelope?.from?.[0]?.address ?? "").toLowerCase();
        if (!m || !boleh.has(dari)) return json({ ok: false, alasan: "Email tidak ditemukan" }, 404);
        const l = lampiranDari(m.bodyStructure).find((x) => x.part === part);
        if (!l) return json({ ok: false, alasan: "Lampiran tidak ditemukan" }, 404);
        if (l.ukuran > MAKS_LAMPIRAN * 1.4) return json({ ok: false, alasan: "Lampiran lebih dari 15 MB — unduh langsung dari Gmail" });
        const d: Any = await c.download(uid, part, { uid: true });
        let u8: Uint8Array;
        try { u8 = await isi(d.content, MAKS_LAMPIRAN); } catch (_) { return json({ ok: false, alasan: "Lampiran lebih dari 15 MB — unduh langsung dari Gmail" }); }
        return json({ ok: true, nama: l.nama, mime: l.mime, ukuran: u8.length, b64: Buffer.from(u8).toString("base64") });
      }
      // daftar balasan
      const sejak = new Date(Date.now() - HARI * 864e5);
      let uids: number[] = [];
      for (const alamat of boleh.keys()) { const r: Any = await c.search({ from: alamat, since: sejak }, { uid: true }); if (Array.isArray(r)) uids.push(...r); }
      uids = [...new Set(uids)].sort((x, y) => y - x).slice(0, MAKS_PESAN);
      const pesan: Any[] = [];
      if (uids.length) for await (const m of c.fetch(uids, { uid: true, envelope: true, bodyStructure: true, internalDate: true }, { uid: true }) as Any) {
        const dari = String(m?.envelope?.from?.[0]?.address ?? "").toLowerCase(); const siapa = boleh.get(dari);
        if (!siapa) continue; // pengaman ganda: hanya pengirim terdaftar
        pesan.push({ uid: m.uid, message_id: String(m.envelope?.messageId ?? "").slice(0, 300), oto_id: siapa.oto_id, tes: siapa.tes, subjek: String(m.envelope?.subject ?? "").slice(0, 250), tanggal: m.internalDate ? new Date(m.internalDate).toISOString() : null, lampiran: lampiranDari(m.bodyStructure), _teks: teksDari(m.bodyStructure) });
      }
      if (aksi === "uji") return json({ ok: true, uji: true, pesan: pesan.length, dengan_lampiran: pesan.filter((p) => p.lampiran.length).length, pengirim_dipantau: boleh.size });
      for (const p of pesan) {
        let teks = "";
        if (p._teks) { try { const d: Any = await c.download(String(p.uid), p._teks, { uid: true, maxBytes: 12000 }); teks = new TextDecoder().decode(await isi(d.content, 20000)); } catch (_) { teks = ""; } }
        delete p._teks;
        p.invoice = [...new Set((p.subjek + "\n" + teks).match(/\b\d{13}\b/g) ?? [])].slice(0, 6); // nomor invoice dicari juga di kutipan email asal
        p.cuplikan = tanpaKutipan(teks).slice(0, 500);
      }
      pesan.sort((x, y) => String(y.tanggal).localeCompare(String(x.tanggal)));
      const ids = [...new Set(pesan.map((p) => p.oto_id).filter(Boolean))];
      const { data: us } = ids.length ? await admin.from("users").select("id, doc").in("id", ids) : { data: [] };
      const nama = new Map((us ?? []).map((x: Any) => [x.id, String(x.doc?.name ?? x.id)]));
      for (const p of pesan) p.dari = p.tes ? "Alamat tes" : (nama.get(p.oto_id) ?? "Otorisator");
      return json({ ok: true, data: pesan, mode_tes: modeTes, bisa_ambil: bisaAmbil, dicek_at: new Date().toISOString() });
    } finally { kunci.release(); }
  } catch (_) {
    return json({ ok: false, alasan: "Gagal membaca kotak masuk — coba lagi" });
  } finally { try { await c.logout(); } catch (_) { /* abaikan */ } }
});
