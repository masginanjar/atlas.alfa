// ============================================================
//  NOTIF-EMAIL — email "Tugas baru" ke penerjemah internal saat sebuah sub project ditetapkan kepadanya.
//  • Dikirim lewat Resend dari notifikasi@247translator.id. Kunci hanya di Supabase Secrets: RESEND_API_KEY.
//  • Browser hanya mengirim { project_id, sub_ids }. Penerima, isi, dan alamat ditentukan DI SINI dari data project
//    (dibaca atas nama pemanggil → RLS berlaku) dan dari akun penerjemah. Browser tidak bisa memilih alamat tujuan.
//  • Hanya terkirim bila akun penerjemah: aktif, `notif_email_aktif` = true, dan `notif_email` terisi
//    (keduanya dijaga trigger users_kunci_jaga — hanya admin pengelola pengguna yang bisa mengubah).
//  • Isi: No Invoice, judul dokumen, jumlah dokumen & halaman, arah bahasa, prioritas, deadline, tombol buka ATLAS.
//    TANPA lampiran, TANPA nama / kontak pelanggan.
//  • Satu email per penerjemah per project per panggilan. Pasangan project–sub–penerjemah yang sudah pernah
//    dikirimi tidak dikirimi lagi (notif_email_log) → aman dari kirim ganda.
//  • Log hanya metadata (project, sub, penerjemah, hasil) — tanpa isi email & tanpa alamat.
//  aksi: "tugas"  { project_id, sub_ids: [] }
//        "contoh" { user_id } — email CONTOH data buatan ke alamat notifikasi akun itu; izin pengaturan.pengguna.ubah
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const PENGIRIM = "ATLAS 247 <notifikasi@247translator.id>";
const TAUTAN = "https://app.247translator.id";
const samar = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, "$1•••$2");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const LABEL_PRIO: Record<string, string> = { Normal: "Normal", Ekspres: "Ekspres (Speed 50)", "Super Ekspres": "Super Ekspres (Speed 100)", Sameday: "Sameday" };
// deno-lint-ignore no-explicit-any
type Baris = Record<string, any>;

const tglJam = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  const tgl = d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Makassar" });
  return String(v).length > 10 ? `${tgl}, pukul ${d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" }).replace(":", ".")} WITA` : tgl;
};
const kosongNama = (t: unknown) => !String(t ?? "").replace(/^\s*\d+\s*[.)\-]?\s*/, "").trim();
const judulSub = (sb: Baris) => {
  const docs = (Array.isArray(sb.docs) ? sb.docs : []).map((d: Baris) => String(d?.desc ?? "").trim()).filter((x: string) => !kosongNama(x));
  return (docs.length ? docs.join(", ") : String(sb.title ?? "Dokumen")).slice(0, 300);
};
const jmlDok = (sb: Baris) => (Array.isArray(sb.docs) && sb.docs.length) || Number(sb.file_count) || 0;
const jmlHal = (sb: Baris) => (Array.isArray(sb.docs) && sb.docs.length ? sb.docs.reduce((a: number, d: Baris) => a + (Number(d?.pages) || 0), 0) : Number(sb.pages) || 0);
const pemegang = (s: Baris) => (s?.stage === "penerjemahan" && (s?.translator_kind || "translator") === "translator" ? String(s?.translator || s?.data?.translator || "") : "");

function susun(nama: string, no: string, deadline: string, baris: { judul: string; rinci: string }[], contoh: boolean) {
  const subjek = `${contoh ? "[CONTOH] " : ""}Tugas baru: ${no} · deadline ${deadline}`;
  const teks = [`Halo ${nama},`, "", "Ada tugas terjemahan baru untuk Anda di ATLAS.", "", `No Invoice : ${no}`, `Deadline   : ${deadline}`, "",
    ...baris.map((b, i) => `${i + 1}. ${b.judul}${b.rinci ? `\n   ${b.rinci}` : ""}`), "", `Buka di ATLAS: ${TAUTAN}`, "",
    "Dokumen tidak dilampirkan di email ini — silakan buka dan unduh di ATLAS. Email ini dikirim otomatis, mohon tidak dibalas.",
    ...(contoh ? ["", "— Ini email CONTOH dengan data buatan, bukan tugas sungguhan."] : [])].join("\n");
  const html = `<!doctype html><html lang="id"><body style="margin:0;padding:0;background:#f1f3f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#141b34">
<div style="max-width:560px;margin:0 auto;padding:16px">
<div style="background:#ffffff;border-radius:16px;padding:20px;border:1px solid #e7e8f0">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.04em;color:#6b7280">ATLAS · 247 SWORN TRANSLATOR</p>
<p style="margin:12px 0 0;font-size:16px">Halo ${esc(nama)},</p>
<p style="margin:8px 0 16px;font-size:16px">Ada tugas terjemahan baru untuk Anda di ATLAS.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;border-radius:12px;font-size:15px"><tr><td style="padding:12px 14px">
<p style="margin:0;color:#6b7280;font-size:12px">No Invoice</p><p style="margin:2px 0 10px;font-weight:600">${esc(no)}</p>
<p style="margin:0;color:#6b7280;font-size:12px">Deadline</p><p style="margin:2px 0 0;font-weight:600">${esc(deadline)}</p>
</td></tr></table>
${baris.map((b, i) => `<div style="margin-top:10px;padding:12px 14px;border:1px solid #e7e8f0;border-radius:12px"><p style="margin:0;font-size:15px;font-weight:600">${i + 1}. ${esc(b.judul)}</p>${b.rinci ? `<p style="margin:4px 0 0;font-size:14px;color:#4b5563">${esc(b.rinci)}</p>` : ""}</div>`).join("")}
<p style="margin:18px 0 0"><a href="${TAUTAN}" style="display:inline-block;background:#141b34;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;border-radius:10px">Buka di ATLAS</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#6b7280">Dokumen tidak dilampirkan di email ini — silakan buka dan unduh di ATLAS. Email ini dikirim otomatis, mohon tidak dibalas.</p>
${contoh ? `<p style="margin:10px 0 0;font-size:12px;color:#b45309">Ini email CONTOH dengan data buatan, bukan tugas sungguhan.</p>` : ""}
</div></div></body></html>`;
  return { subjek, teks, html };
}

async function kirimResend(kunci: string, ke: string, isi: { subjek: string; teks: string; html: string }, idem: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${kunci}`, "Content-Type": "application/json", "Idempotency-Key": idem },
    body: JSON.stringify({ from: PENGIRIM, to: [ke], subject: isi.subjek, text: isi.teks, html: isi.html }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`resend ${r.status}`);
}
const pesanGalat = (e: unknown) => { const m = String((e as Error)?.message ?? ""); return /resend 40[13]/.test(m) ? "Resend menolak kunci — kunci salah / dicabut / domain belum terverifikasi" : /resend 429/.test(m) ? "Batas kirim harian Resend tercapai" : /resend 422/.test(m) ? "Alamat email ditolak" : "Email gagal dikirim — coba lagi"; };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, alasan: "metode tidak didukung" }, 405);
  const URL_ = Deno.env.get("SUPABASE_URL")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!, SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const kunci = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
  const admin = createClient(URL_, SR, { auth: { persistSession: false } });
  let b: Baris = {};
  try { b = await req.json(); } catch (_) { return json({ ok: false, alasan: "isi permintaan tidak valid" }, 400); }
  const db = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data: u } = await db.auth.getUser();
  if (!u?.user) return json({ ok: false, alasan: "silakan login ulang" }, 401);
  const { data: saya } = await admin.from("users").select("id, doc, active").eq("auth_id", u.user.id).maybeSingle();
  if (!saya || (saya.active ?? saya.doc?.active) === false) return json({ ok: false, alasan: "akun tidak dikenal" }, 403);
  const aksi = String(b.aksi ?? "");

  if (aksi === "contoh") {
    const { data: izin } = await db.rpc("app_izin", { kode: "pengaturan.pengguna.ubah" });
    if (izin !== true && saya.doc?.role !== "superadmin") return json({ ok: false, alasan: "Tidak ada izin mengirim email contoh" }, 403);
    if (!kunci) return json({ ok: false, alasan: "Email belum disetel di server (kunci Resend belum dipasang)" });
    const { data: t } = await admin.from("users").select("id, doc").eq("id", String(b.user_id ?? "")).maybeSingle();
    const ke = String(t?.doc?.notif_email ?? "").trim();
    if (!t || !EMAIL.test(ke)) return json({ ok: false, alasan: "Alamat email notifikasi akun ini belum tersimpan" }, 400);
    const { count } = await admin.from("notif_email_log").select("id", { count: "exact", head: true }).eq("oleh", saya.id).eq("jenis", "contoh").gte("at", new Date(Date.now() - 3600e3).toISOString());
    if ((count ?? 0) >= 10) return json({ ok: false, alasan: "Terlalu banyak email contoh dalam 1 jam — tunggu sebentar" });
    const besok = new Date(Date.now() + 86400e3).toISOString();
    const isi = susun(String(t.doc?.nickname || t.doc?.name || "Penerjemah"), "1090000000123", tglJam(besok), [{ judul: "Akta Kelahiran, Kartu Keluarga", rinci: "2 dokumen · 3 halaman · Indonesia → Inggris · Ekspres (Speed 50)" }], true);
    try { await kirimResend(kunci, ke, isi, `contoh-${t.id}-${Date.now()}`); }
    catch (e) { await admin.from("notif_email_log").insert({ jenis: "contoh", oleh: saya.id, penerima: t.id, hasil: "gagal" }); return json({ ok: false, alasan: pesanGalat(e) }); }
    await admin.from("notif_email_log").insert({ jenis: "contoh", oleh: saya.id, penerima: t.id, hasil: "ok" });
    return json({ ok: true, ke: samar(ke) });
  }

  if (aksi !== "tugas") return json({ ok: false, alasan: "aksi tidak dikenal" }, 400);
  const project_id = String(b.project_id ?? "");
  const diminta = new Set((Array.isArray(b.sub_ids) ? b.sub_ids : []).slice(0, 100).map((x: unknown) => String(x)));
  if (!project_id || !diminta.size) return json({ ok: false, alasan: "data tidak lengkap" }, 400);
  // project harus terlihat oleh pemanggil (RLS atas nama pengguna)
  const { data: pr } = await db.from("projects").select("id, doc").eq("id", project_id).maybeSingle();
  if (!pr) return json({ ok: false, alasan: "Project tidak ditemukan / tidak ada akses" }, 404);
  const p: Baris = pr.doc ?? {};
  if (p.dummy) return json({ ok: true, terkirim: 0, dilewati: diminta.size });
  // kelompokkan per penerjemah yang SEKARANG memegang sub tersebut (dibaca dari data tersimpan, bukan dari browser)
  const per = new Map<string, Baris[]>();
  for (const s of (Array.isArray(p.sub_projects) ? p.sub_projects : []) as Baris[]) {
    const id = pemegang(s);
    if (!diminta.has(String(s.id)) || !id || id === saya.id) continue;
    per.set(id, [...(per.get(id) ?? []), s]);
  }
  if (!per.size) return json({ ok: true, terkirim: 0, dilewati: diminta.size });
  if (!kunci) return json({ ok: false, alasan: "Email belum disetel di server (kunci Resend belum dipasang)" });
  const { data: us } = await admin.from("users").select("id, doc, active").in("id", [...per.keys()]);
  const { data: sudah } = await admin.from("notif_email_log").select("sub_id, penerima").eq("project_id", project_id).eq("jenis", "tugas").eq("hasil", "ok");
  const pernah = new Set((sudah ?? []).map((x: Baris) => `${x.sub_id}:${x.penerima}`));
  const no = String(p.invoice_no ?? "—"), deadline = tglJam(p.about?.deadline);
  let terkirim = 0, dilewati = 0, gagal = "";
  for (const [id, subsSemua] of per) {
    // deno-lint-ignore no-explicit-any
    const t = (us ?? []).find((x: any) => x.id === id);
    const ke = String(t?.doc?.notif_email ?? "").trim();
    const subs = subsSemua.filter((s) => !pernah.has(`${s.id}:${id}`));
    if (!t || (t.active ?? t.doc?.active) === false || t.doc?.notif_email_aktif !== true || !EMAIL.test(ke) || !subs.length) { dilewati += subsSemua.length; continue; }
    const baris = subs.map((s) => ({ judul: judulSub(s), rinci: [jmlDok(s) && `${jmlDok(s)} dokumen`, jmlHal(s) && `${jmlHal(s)} halaman`, s.lang_from && s.lang_to && `${s.lang_from} → ${s.lang_to}`, LABEL_PRIO[String(s.priority || p.about?.priority || "Normal")] ?? String(s.priority || p.about?.priority || "Normal")].filter(Boolean).join(" · ") }));
    const catat = (hasil: string) => admin.from("notif_email_log").insert(subs.map((s) => ({ jenis: "tugas", oleh: saya.id, penerima: id, project_id, sub_id: String(s.id), hasil })));
    try {
      await kirimResend(kunci, ke, susun(String(t.doc?.nickname || t.doc?.name || "Penerjemah"), no, deadline, baris, false), `tugas-${project_id}-${id}-${subs.map((s) => s.id).join(".")}`.slice(0, 250));
      await catat("ok"); terkirim += 1;
    } catch (e) { await catat("gagal"); gagal = pesanGalat(e); }
  }
  if (!terkirim && gagal) return json({ ok: false, alasan: gagal });
  return json({ ok: true, terkirim, dilewati });
});
