// ============================================================
//  PORTAL VENDOR (tanpa login) — to-do, unduh sumber, unggah hasil.
//  Semua pemeriksaan di server: tautan (token acak) + kode akses vendor
//  (atau nomor HP vendor bila kode tidak diatur), salah 5x → kunci 15 menit.
//  Vendor hanya melihat pekerjaan miliknya. Kunci service role hanya ada
//  di lingkungan fungsi ini — tidak pernah dikirim ke browser.
//  Tidak mencatat isi dokumen / data pelanggan ke log.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "files";
const SESSION_HOURS = 2;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const FILE_TTL = 600;
const MAX_UNGGAH = 20;
const DONE = "selesai";
const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const enc = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
let keyP: Promise<CryptoKey> | null = null;
const key = () => keyP ||= crypto.subtle.importKey("raw", enc.encode("portal-vendor:" + SERVICE), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
async function sign(payload: Record<string, unknown>) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${b64url(await crypto.subtle.sign("HMAC", await key(), enc.encode(body)))}`;
}
async function buka(sess: unknown) {
  if (typeof sess !== "string" || !sess.includes(".")) return null;
  const [body, sig] = sess.split(".");
  if (b64url(await crypto.subtle.sign("HMAC", await key(), enc.encode(body))) !== sig) return null;
  try { const p = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))); return p.exp > Date.now() ? p : null; } catch { return null; }
}
function normPhone(v: unknown) {
  let d = String(v || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("62")) d = "0" + d.slice(2); else if (d.startsWith("8")) d = "0" + d;
  return d.replace(/\D/g, "");
}
// deno-lint-ignore no-explicit-any
type Baris = any;
function linkState(link: Baris, now = new Date()) {
  if (!link) return "missing";
  if (link.revoked_at) return "revoked";
  if (link.expires_at && new Date(link.expires_at) <= now) return "expired";
  if (link.locked_until && new Date(link.locked_until) > now) return "locked";
  return "active";
}
const flat = (r: Baris) => (r ? { ...(r.doc || {}), id: r.id } : null);
async function tautan(token: string) {
  if (!token || token.length < 16) return null;
  const { data } = await db.from("share_links").select("id,doc").eq("doc->>token", token).eq("doc->>kind", "vendor").limit(1);
  return data?.[0] || null;
}
async function vendorOf(link: Baris) {
  if (!link?.vendor_id) return null;
  const { data } = await db.from("people").select("id,doc").eq("id", link.vendor_id).limit(1);
  return flat(data?.[0]);
}
async function pekerjaan(vid: string) {
  const { data } = await db.from("projects").select("id,doc").contains("doc", { sub_projects: [{ data: { vendor: vid } }] }).limit(500);
  return (data || []).map(flat);
}
const poin = (t: unknown) => String(t || "").split("\n").map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
const sumberOf = (s: Baris) => (Array.isArray(s.data?.dokumen_sumber_list) && s.data.dokumen_sumber_list.length ? s.data.dokumen_sumber_list : s.data?.dokumen_sumber ? [s.data.dokumen_sumber] : []);
const hasilOf = (s: Baris) => (Array.isArray(s.data?.hasil_vendor_list) && s.data.hasil_vendor_list.length ? s.data.hasil_vendor_list : s.data?.hasil_vendor ? [s.data.hasil_vendor] : []);
const aman = (s: unknown) => String(s ?? "").replace(/[^\w.\-()\[\] ]+/g, "_").trim();

function todoOf(vendor: Baris, projects: Baris[]) {
  const todo = [];
  for (const p of projects) {
    const subs = (p.sub_projects || []).filter((s: Baris) => s.data?.vendor === vendor.id);
    if (!subs.length) continue;
    const docs = subs.flatMap((s: Baris) => {
      const lang = ["terjemahan", "terjemahan_nt"].includes(s.type) ? `${s.lang_from || "?"} → ${s.lang_to || "?"}` : "";
      const rows = Array.isArray(s.docs) && s.docs.some((d: Baris) => String(d.desc || "").trim())
        ? s.docs.filter((d: Baris) => String(d.desc || "").trim()).map((d: Baris) => ({ desc: d.desc, pages: Number(d.pages) || 0 }))
        : poin(s.description).map((desc) => ({ desc, pages: 0 }));
      return rows.map((d: Baris) => ({ ...d, lang }));
    });
    const sh = p.customer?.ship || {};
    const kirimVendor = p.about?.metode_kirim === "vendor";
    const hasil = subs.flatMap((s: Baris) => hasilOf(s).map((f: Baris) => ({ name: f.name, at: f.uploaded_at || "" })));
    todo.push({
      id: p.id, ref: p.invoice_no, nama: p.customer?.name || "", deadline: p.about?.deadline || null, jam: p.about?.deadline_time || "",
      dok: docs.length, hal: subs.reduce((a: number, s: Baris) => a + (Number(s.pages) || 0), 0),
      alamat: kirimVendor ? [sh.attention, sh.street1, sh.street2, sh.city, sh.state, sh.zip, sh.phone].filter(Boolean).join(", ") : "", kirim_vendor: kirimVendor,
      docs, sumber: subs.flatMap((s: Baris) => sumberOf(s).map((f: Baris, i: number) => ({ ref: `src:${s.id}:${i}`, name: f.name }))), hasil,
      status: subs.every((s: Baris) => s.stage === DONE) ? "Selesai" : hasil.length ? "Hasil diunggah" : "Dikerjakan",
    });
  }
  todo.sort((a, b) => Number(a.status === "Selesai") - Number(b.status === "Selesai") || String(a.deadline || "9").localeCompare(String(b.deadline || "9")));
  return todo;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: Baris;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const action = String(body.action || "");
  const token = String(body.token || "");
  try {
    const row = await tautan(token);
    const link = row ? { ...row.doc } : null;
    const st = linkState(link);
    const vendor = link ? await vendorOf(link) : null;
    const kode = String(vendor?.kode_portal || "").trim();

    if (action === "open") return json({ state: vendor ? st : "missing", kind: "vendor", gate: kode ? "kode" : "hp", expires_at: link?.expires_at || null });
    if (!link || !vendor) return json({ ok: false, error: "missing" });

    if (action === "verify") {
      if (st !== "active") return json({ ok: false, error: st });
      const now = new Date();
      const masuk = String(body.phone ?? "");
      const telp = normPhone(vendor.phone);
      const terdaftar = !!kode || telp.length >= 8;
      const cocok = kode ? masuk.trim() === kode : (telp.length >= 8 && normPhone(masuk) === telp);
      const baru = (link.fails || []).filter((t: string) => now.getTime() - new Date(t).getTime() < LOCK_MINUTES * 6e4);
      if (cocok) {
        await db.from("share_links").update({ doc: { ...link, fails: [], locked_until: null, last_open_at: now.toISOString(), opens: (link.opens || 0) + 1 } }).eq("id", row.id);
        const until = new Date(now.getTime() + SESSION_HOURS * 36e5).toISOString();
        return json({ ok: true, session: await sign({ t: token, v: vendor.id, exp: Date.parse(until) }), until });
      }
      const fails = [...baru, now.toISOString()];
      const kunci = fails.length >= MAX_FAILS;
      await db.from("share_links").update({ doc: { ...link, fails: kunci ? [] : fails, locked_until: kunci ? new Date(now.getTime() + LOCK_MINUTES * 6e4).toISOString() : (link.locked_until ?? null) } }).eq("id", row.id);
      return json({ ok: false, error: terdaftar ? (kunci ? "locked" : "wrong") : "no_phone", left: Math.max(0, MAX_FAILS - fails.length) });
    }

    const sess = await buka(body.session);
    if (!sess || sess.t !== token || sess.v !== vendor.id) return json({ error: "session" }, 401);
    if (st !== "active") return json({ error: st }, 403);
    const projects = await pekerjaan(vendor.id);

    if (action === "view") return json({ kind: "vendor", name: vendor.name, expires_at: link.expires_at, todo: todoOf(vendor, projects), jobs: null });

    if (action === "file") {
      const [jenis, subId, i] = String(body.ref || "").split(":");
      let f: Baris = null;
      if (jenis === "src") for (const p of projects) for (const s of p.sub_projects || []) if (s.id === subId && s.data?.vendor === vendor.id) f = sumberOf(s)[Number(i)] ?? null;
      if (!f) return json({ error: "not_found" }, 404);
      if (!f.path) return f.url ? json({ url: f.url, name: f.name }) : json({ error: "not_found" }, 404);
      const { data, error } = await db.storage.from(f.bucket || BUCKET).createSignedUrl(f.path, FILE_TTL, { download: f.name });
      if (error || !data?.signedUrl) return json({ error: "not_found" }, 404);
      return json({ url: data.signedUrl, name: f.name });
    }

    if (action === "upload_url" || action === "upload_done") {
      const project = projects.find((p: Baris) => p.id === String(body.project_id || ""));
      const milik = (project?.sub_projects || []).filter((s: Baris) => s.data?.vendor === vendor.id);
      if (!project || !milik.length) return json({ error: "forbidden" }, 403);
      const awalan = `${aman(project.branch || "umum")}/${aman(project.invoice_no || "tanpa-invoice")}/hasil-vendor/`;
      if (action === "upload_url") {
        const nama = aman(String(body.name || "hasil")).slice(0, 140) || "hasil";
        const path = `${awalan}${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}-${nama}`;
        const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
        if (error || !data?.token) return json({ error: "failed" }, 500);
        return json({ path, token: data.token, bucket: BUCKET, name: nama });
      }
      const masuk = (Array.isArray(body.files) ? body.files : []).slice(0, MAX_UNGGAH)
        .filter((f: Baris) => typeof f?.path === "string" && f.path.startsWith(awalan) && !f.path.includes(".."));
      if (!masuk.length) return json({ error: "bad_request" }, 400);
      // hanya file yang benar-benar sudah ada di penyimpanan yang dicatat
      const { data: ada } = await db.storage.from(BUCKET).list(awalan.replace(/\/$/, ""), { limit: 1000 });
      const namaAda = new Set((ada || []).map((o: Baris) => `${awalan}${o.name}`));
      const now = new Date().toISOString();
      const oleh = `${vendor.name} (portal vendor)`;
      const added = masuk.filter((f: Baris) => namaAda.has(f.path)).map((f: Baris) => ({
        id: crypto.randomUUID(), name: aman(String(f.name || "hasil")).slice(0, 160), size: Number(f.size) || 0, url: null, path: f.path, bucket: BUCKET, uploaded_at: now, sub_id: milik[0].id, by: oleh,
      }));
      if (!added.length) return json({ error: "not_found" }, 404);
      // baca ulang project tepat sebelum menulis supaya tidak menimpa perubahan staf yang baru masuk
      const { data: segar } = await db.from("projects").select("id,doc").eq("id", project.id).limit(1);
      const kini = segar?.[0]?.doc; if (!kini) return json({ error: "missing" }, 404);
      const sub_projects = (kini.sub_projects || []).map((s: Baris) => (s.id !== milik[0].id ? s : {
        ...s,
        data: { ...s.data, hasil_vendor: s.data?.hasil_vendor || added[0], hasil_vendor_list: [...hasilOf(s), ...added] },
        history: [...(s.history || []), { at: now, by: oleh, action: `Hasil diunggah vendor lewat portal · ${added.length} file` }],
      }));
      const up = await db.from("projects").update({ doc: { ...kini, sub_projects, files: [...(kini.files || []), ...added] } }).eq("id", project.id);
      if (up.error) return json({ error: "failed" }, 500);
      const tujuan = kini.created_by ? { to_user: kini.created_by } : { to_role: "cs" };
      await db.from("notifications").insert({ id: `n-${crypto.randomUUID()}`, doc: { ...tujuan, kind: "task", text: `${kini.invoice_no}: ${vendor.name} mengunggah ${added.length} file hasil lewat portal — periksa lalu lanjutkan`, project_id: project.id, sub_id: milik[0].id, by: oleh, read_by: [] } }).then(() => {}, () => {});
      return json({ ok: true, n: added.length });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("portal-vendor", action, (e as Error)?.message || "error");
    return json({ error: "server" }, 500);
  }
});
