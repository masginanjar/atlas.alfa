// ============================================================
//  NOTIF-EMAIL — email "Tugas baru" ke penerjemah internal saat sebuah sub project ditetapkan kepadanya.
//  • Dikirim lewat Resend dari notifikasi@247translator.id. Kunci hanya di Supabase Secrets: RESEND_API_KEY.
//  • Browser hanya mengirim { project_id, sub_ids }. Penerima, isi, dan alamat ditentukan DI SINI dari data project
//    (dibaca atas nama pemanggil → RLS berlaku) dan dari akun penerjemah. Browser tidak bisa memilih alamat tujuan.
//  • Hanya terkirim bila akun penerjemah: aktif, `notif_email_aktif` = true, dan `notif_email` terisi
//    (keduanya dijaga trigger users_kunci_jaga — hanya admin pengelola pengguna yang bisa mengubah).
//  • Isi SINGKAT (diminta pemilik 20 Nov): No Invoice, judul dokumen, jumlah dokumen & halaman, arah bahasa, prioritas, deadline, tombol buka ATLAS.
//    TANPA lampiran, TANPA nama / kontak pelanggan.
//  • Satu email per penerjemah per project per panggilan. Pasangan project–sub–penerjemah yang sudah pernah
//    dikirimi tidak dikirimi lagi (notif_email_log) → aman dari kirim ganda.
//  • Log hanya metadata (project, sub, penerjemah, hasil) — tanpa isi email & tanpa alamat.
//  • PROOFREADER (21 Nov): sub di tahap Pemeriksaan dengan proofreader yang sudah ditunjuk → email "Tugas periksa baru" ke proofreader itu, syarat akun sama.
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
// deno-lint-ignore no-explicit-any
type Baris = Record<string, any>;

const tglJam = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  const tgl = d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Makassar" });
  return String(v).length > 10 ? `${tgl}, ${d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" }).replace(":", ".")} WITA` : tgl;
};
const kosongNama = (t: unknown) => !String(t ?? "").replace(/^\s*\d+\s*[.)\-]?\s*/, "").trim();
const judulSub = (sb: Baris) => {
  const docs = (Array.isArray(sb.docs) ? sb.docs : []).map((d: Baris) => String(d?.desc ?? "").trim()).filter((x: string) => !kosongNama(x));
  return (docs.length ? docs.join(", ") : String(sb.title ?? "Dokumen")).slice(0, 300);
};
const jmlDok = (sb: Baris) => (Array.isArray(sb.docs) && sb.docs.length) || Number(sb.file_count) || 0;
const jmlHal = (sb: Baris) => (Array.isArray(sb.docs) && sb.docs.length ? sb.docs.reduce((a: number, d: Baris) => a + (Number(d?.pages) || 0), 0) : Number(sb.pages) || 0);
// Jenis terjemahan disebut di email supaya penerjemah langsung tahu (non tersumpah: tanpa proofreader, otorisasi, nomor register).
const jenisTr = (s: Baris) => (s?.type === "terjemahan_nt" || s?.flow === "tr_nt" ? "Non Tersumpah" : s?.type === "terjemahan" ? "Tersumpah" : "");
const pemegang = (s: Baris) => (s?.stage === "penerjemahan" && (s?.translator_kind || "translator") === "translator" ? String(s?.translator || s?.data?.translator || "")
  : s?.stage === "proofread" ? String(s?.data?.proofreader || "") : ""); // proofreader yang ditunjuk (tahap Pemeriksaan)

function susun(nama: string, no: string, deadline: string, baris: { judul: string; rinci: string }[], contoh: boolean, periksa = false) {
  const tugas = periksa ? "tugas periksa baru" : "tugas baru";
  const subjek = `${contoh ? "[CONTOH] " : ""}${periksa ? "Tugas periksa baru" : "Tugas baru"} ${no} · DL ${deadline}`;
  const teks = [`Halo ${nama}, ada ${tugas}:`, `${no} · DL ${deadline}`, ...baris.map((b, i) => `${i + 1}. ${b.judul}${b.rinci ? ` — ${b.rinci}` : ""}`), `Buka di ATLAS: ${TAUTAN}`,
    ...(contoh ? ["(Email contoh, bukan tugas sungguhan.)"] : [])].join("\n");
  const html = `<!doctype html><html lang="id"><body style="margin:0;padding:16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#141b34;font-size:15px;line-height:1.5">
<p style="margin:0 0 6px">Halo ${esc(nama)}, ada ${tugas}:</p>
<p style="margin:0 0 6px;font-weight:600">${esc(no)} · DL ${esc(deadline)}</p>
${baris.map((b, i) => `<p style="margin:0 0 2px">${i + 1}. ${esc(b.judul)}${b.rinci ? ` <span style="color:#4b5563">— ${esc(b.rinci)}</span>` : ""}</p>`).join("")}
<p style="margin:14px 0 0"><a href="${TAUTAN}" style="display:inline-block;background:#141b34;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Buka di ATLAS</a></p>
${contoh ? `<p style="margin:10px 0 0;font-size:12px;color:#b45309">Email contoh, bukan tugas sungguhan.</p>` : ""}
</body></html>`;
  return { subjek, teks, html };
}

async function kirimResend(kunci: string, ke: string, isi: { subjek: string; teks: string; html: string }, idem: string) {
  // Kunci yang sah hanya berisi huruf/angka/_ — bila tidak, fetch akan menolak header-nya. Dicatat TANPA menulis kuncinya.
  if (!/^re_[A-Za-z0-9_]{10,}$/.test(kunci)) { console.error("notif-email: bentuk RESEND_API_KEY tidak seperti kunci Resend", { panjang: kunci.length, awalan_re: kunci.startsWith("re_") }); throw new Error("resend kunci-bentuk"); }
  let r: Response;
  try {
    r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${kunci}`, "Content-Type": "application/json", "Idempotency-Key": idem.replace(/[^A-Za-z0-9._-]/g, "_") },
      body: JSON.stringify({ from: PENGIRIM, to: [ke], subject: isi.subjek, text: isi.teks, html: isi.html }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) { console.error("notif-email: tidak bisa menghubungi Resend", String((e as Error)?.name), String((e as Error)?.message).slice(0, 200)); throw new Error("resend jaringan"); }
  if (!r.ok) {
    // Badan galat Resend hanya berisi nama & pesan galat (bukan kunci, bukan isi email).
    const badan = (await r.text().catch(() => "")).slice(0, 300);
    console.error("notif-email: Resend menolak", r.status, badan);
    throw new Error(`resend ${r.status}`);
  }
}
const pesanGalat = (e: unknown) => {
  const m = String((e as Error)?.message ?? "");
  return /kunci-bentuk/.test(m) ? "Kunci Resend di server tidak valid (bukan kunci lengkap berawalan re_) — buat kunci baru dan simpan ulang"
    : /resend 401/.test(m) ? "Resend menolak kunci (401) — kunci salah / tidak lengkap / sudah dihapus"
    : /resend 403/.test(m) ? "Resend menolak (403) — kunci tidak berhak mengirim dari domain ini"
    : /resend 429/.test(m) ? "Batas kirim Resend tercapai (429)"
    : /resend 422/.test(m) ? "Resend menolak isi / alamat email (422)"
    : /jaringan/.test(m) ? "Server tidak bisa menghubungi Resend — coba lagi"
    : `Email gagal dikirim (${m.replace(/^resend /, "kode ") || "tidak diketahui"})`;
};

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
    const isi = susun(String(t.doc?.nickname || t.doc?.name || "Penerjemah"), "1090000000123", tglJam(besok), [{ judul: "Akta Kelahiran, Kartu Keluarga", rinci: "2 dok · 3 hal · Indonesia → Inggris · Ekspres" }], true);
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
    const baris = subs.map((s) => ({ judul: judulSub(s), rinci: [jmlDok(s) && `${jmlDok(s)} dok`, jmlHal(s) && `${jmlHal(s)} hal`, s.lang_from && s.lang_to && `${s.lang_from} → ${s.lang_to}`, jenisTr(s), String(s.priority || p.about?.priority || "Normal")].filter(Boolean).join(" · ") }));
    const catat = (hasil: string) => admin.from("notif_email_log").insert(subs.map((s) => ({ jenis: "tugas", oleh: saya.id, penerima: id, project_id, sub_id: String(s.id), hasil })));
    try {
      await kirimResend(kunci, ke, susun(String(t.doc?.nickname || t.doc?.name || "Rekan"), no, deadline, baris, false, subs.every((x) => x.stage === "proofread")), `tugas-${project_id}-${id}-${subs.map((s) => s.id).join(".")}`.slice(0, 250));
      await catat("ok"); terkirim += 1;
    } catch (e) { await catat("gagal"); gagal = pesanGalat(e); }
  }
  if (!terkirim && gagal) return json({ ok: false, alasan: gagal });
  return json({ ok: true, terkirim, dilewati });
});
