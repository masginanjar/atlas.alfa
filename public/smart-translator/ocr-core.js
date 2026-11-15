/* ==========================================================================
   OCR CORE — Smart Translator (dipakai di browser DAN di edge function uji)
   Modul murni tanpa DOM/jaringan:
     1. kata → baris   (barisDariKata)      : struktur & posisi, koreksi kemiringan
     2. label → nilai  (petakanKTP)          : pemetaan berdasarkan label + posisi
     3. validasi       (validasi)            : bentuk data, TIDAK pernah mengubah nilai
     4. kualitas       (kualitasGambar, kualitasTeks) : indikasi heuristik, bukan skor
     5. jenis dokumen  (deteksiJenis)
     6. baca ulang     (perluBacaUlang, gabungKandidat)
   Aturan penting:
   - Nilai mentah (raw) tidak pernah ditimpa. Nomor identitas tidak "dibersihkan".
   - Skor OCR = skor TERENDAH per huruf (Vision) / per kata (Tesseract) pada nilai itu,
     dicatat bersama nama mesinnya. Skala mesin berbeda tidak dicampur.
   ========================================================================== */
(function (G) {
  'use strict';
  const lev = (a, b) => { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = Array.from({ length: n + 1 }, (_, i) => i); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c } return p[n] };
  const sim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length, 1);
  const med = (xs) => { const s = xs.filter((x) => isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 };

  /* ---------- 1. Kata → baris ----------
     kata: [{t, c (0-100 | null), s:[skor huruf 0-100]|null, q:[x0,y0,x1,y1,x2,y2,x3,y3] (4 titik sudut, urutan baca)}]
     Hasil baris: {text, words:[{t,c,cmin,box,off}], box, engine} — box dalam koordinat gambar ASLI yang dikirim. */
  function sudut(q) { return Math.atan2(q[3] - q[1], q[2] - q[0]) }
  function putar(x, y, cx, cy, a) { const c = Math.cos(a), s = Math.sin(a); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c] }
  function barisDariKata(kata, engine) {
    if (!kata || !kata.length) return { lines: [], miring: 0 };
    const sud = kata.filter((k) => k.q && k.t.length >= 3).map((k) => sudut(k.q));
    const a = med(sud); // kemiringan dominan (radian); 90° = dokumen diputar
    let cx = 0, cy = 0; kata.forEach((k) => { cx += (k.q[0] + k.q[4]) / 2; cy += (k.q[1] + k.q[5]) / 2 }); cx /= kata.length; cy /= kata.length;
    const W = kata.map((k) => {
      const xs = [k.q[0], k.q[2], k.q[4], k.q[6]], ys = [k.q[1], k.q[3], k.q[5], k.q[7]];
      const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      // koordinat yang sudah "diluruskan" untuk pengelompokan baris
      const r = [0, 1, 2, 3].map((i) => putar(k.q[i * 2], k.q[i * 2 + 1], cx, cy, -a));
      const rx = r.map((p) => p[0]), ry = r.map((p) => p[1]);
      const sc = k.s && k.s.length ? Math.min(...k.s) : (k.c == null ? null : k.c);
      return { t: k.t, ln: k.ln, c: k.c == null ? null : k.c, cmin: sc, box, x0: Math.min(...rx), x1: Math.max(...rx), y0: Math.min(...ry), y1: Math.max(...ry) };
    }).map((w) => ({ ...w, yc: (w.y0 + w.y1) / 2, h: Math.max(1, w.y1 - w.y0) })).sort((p, q) => p.yc - q.yc);
    const hMed = med(W.map((w) => w.h)) || 10;
    const rows = [];
    // Tesseract sudah mengelompokkan baris sendiri (ln) dan meluruskan miring — pakai itu bila tersedia.
    if (kata.every((k) => k.ln != null)) { const by = {}; W.forEach((w, i) => { const ln = w.ln; (by[ln] = by[ln] || { yc: w.yc, h: w.h, w: [] }).w.push(w) }); for (const k in by) { const r = by[k]; r.yc = r.w.reduce((a, w) => a + w.yc, 0) / r.w.length; rows.push(r) } }
    else for (const w of W) { const r = rows.find((r) => Math.abs(r.yc - w.yc) < Math.min(r.h, w.h) * 0.55); if (r) { r.w.push(w); r.yc = (r.yc * (r.w.length - 1) + w.yc) / r.w.length } else rows.push({ yc: w.yc, h: w.h, w: [w] }) }
    const xmin = Math.min(...W.map((w) => w.x0)), xmax = Math.max(...W.map((w) => w.x1)), lebar = Math.max(1, xmax - xmin);
    const lines = [];
    for (const r of rows.sort((p, q) => p.yc - q.yc)) {
      r.w.sort((p, q) => p.x0 - q.x0);
      // pecah baris pada celah sangat lebar (mis. teks di samping foto)
      const seg = [[r.w[0]]];
      for (let i = 1; i < r.w.length; i++) { const gap = r.w[i].x0 - r.w[i - 1].x1; if (gap > Math.max(7 * hMed, 0.16 * lebar)) seg.push([r.w[i]]); else seg[seg.length - 1].push(r.w[i]) }
      // gabungkan kembali segmen "label saja" dengan nilai di kanannya (mis. "NIK" ...... "5171...")
      const gab = [];
      for (const s of seg) { const prev = gab[gab.length - 1]; const pt = prev ? prev.map((w) => w.t).join(' ') : ''; if (prev && (cocokLabel(pt, true) || /:\s*$/.test(pt) || /^:/.test(s[0].t))) prev.push(...s); else gab.push(s.slice()) }
      for (const s of gab) lines.push(buatBaris(s, engine, (s[0].x0 - xmin) / lebar, (s[s.length - 1].x1 - xmin) / lebar));
    }
    return { lines, miring: a * 180 / Math.PI, hMed };
  }
  function buatBaris(ws, engine, rx0, rx1) {
    let text = ''; const words = [];
    ws.forEach((w, i) => { const gap = i ? w.x0 - ws[i - 1].x1 : 0; const rapat = i && gap < 0.18 * Math.max(w.h, ws[i - 1].h); const sp = i && !rapat && !/^[:.,)]/.test(w.t) && !/[(]$/.test(ws[i - 1].t) ? ' ' : ''; text += sp; words.push({ t: w.t, c: w.c, cmin: w.cmin, box: w.box, off: text.length }); text += w.t });
    const bx = (k) => ws.map((w) => w.box[k]);
    return { text, words, box: [Math.min(...bx(0)), Math.min(...bx(1)), Math.max(...bx(2)), Math.max(...bx(3))], engine, rx0, rx1 };
  }

  /* ---------- 2. Label ---------- */
  const LABELS = [['nik', ['NIK']], ['nama', ['NAMA']], ['ttl', ['TEMPAT/TGL LAHIR', 'TEMPAT TGL LAHIR', 'TEMPAT/TGL.LAHIR', 'TEMPAT/TANGGAL LAHIR']], ['jk', ['JENIS KELAMIN']], ['gol', ['GOL. DARAH', 'GOL DARAH', 'GOLDARAH']], ['alamat', ['ALAMAT']], ['rtrw', ['RT/RW', 'RTRW', 'RT / RW']], ['kel', ['KEL/DESA', 'KELDESA', 'KEL DESA', 'KELURAHAN/DESA']], ['kec', ['KECAMATAN']], ['agama', ['AGAMA']], ['status', ['STATUS PERKAWINAN']], ['kerja', ['PEKERJAAN']], ['wn', ['KEWARGANEGARAAN']], ['berlaku', ['BERLAKU HINGGA']]];
  /** Cocokkan awal teks dengan label (toleran salah eja). Hanya label — nilai TIDAK pernah dikoreksi. */
  function cocokLabel(line, saja) {
    const u = String(line).toUpperCase(), ci = u.indexOf(':'); let best = null;
    for (const [key, vars] of LABELS) for (const L of vars) {
      if (ci > 0 && ci <= L.length + 4) { const s = sim(u.slice(0, ci).replace(/[^A-Z\/. ]/g, '').trim(), L); if (s >= 0.72 && (!best || s > best.s)) best = { key, s, pos: ci + 1 } }
      const head = u.slice(0, L.length).replace(/[^A-Z\/. ]/g, ' ').trim(); const s2 = sim(head, L);
      if (s2 >= 0.8 && /[\s:.\-]|^$/.test(u.charAt(L.length) || '') && (!best || s2 > best.s)) best = { key, s: s2, pos: L.length };
    }
    if (!best) return null;
    let p = best.pos; while (p < line.length && /[\s:.\-=;]/.test(line.charAt(p))) p++;
    best.pos = p; best.rest = line.slice(p).trim();
    if (saja && best.rest) return null;
    return best;
  }
  const DATE = /(\d{2})\s*[-.\/]\s*(\d{2})\s*[-.\/]\s*(\d{4})/;

  /* ---------- 3. Pemetaan KTP ---------- */
  /** Nilai dari potongan teks baris [dari, sampai) → {v, raw, conf, box, mesin} — skor = minimum kata/huruf yang tercakup. */
  function ambil(l, dari, sampai, v) {
    sampai = sampai == null ? l.text.length : sampai;
    const ws = l.words.filter((w) => w.off + w.t.length > dari && w.off < sampai && !/^[:;]$/.test(w.t));
    const cs = ws.map((w) => w.cmin).filter((x) => x != null);
    const box = ws.length ? [Math.min(...ws.map((w) => w.box[0])), Math.min(...ws.map((w) => w.box[1])), Math.max(...ws.map((w) => w.box[2])), Math.max(...ws.map((w) => w.box[3]))] : l.box;
    const raw = l.text.slice(dari, sampai).trim();
    return { v: (v == null ? raw : v).replace(/\s+/g, ' ').trim(), raw, conf: cs.length ? Math.min(...cs) : null, box, mesin: l.engine };
  }
  function petakanKTP(lines) {
    const out = {}, label = {};
    const set = (k, o) => { if (o && o.v && !out[k]) out[k] = o };
    let last = null, seenBerlaku = false, alamatX = null, idxNik = -1;
    lines.forEach((l, i) => { if (/^\s*NIK\b/i.test(l.text) || cocokLabel(l.text)?.key === 'nik') { if (idxNik < 0) idxNik = i } });
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]; const t = l.text.replace(/[|_~`]/g, ' ').replace(/\s+/g, ' ').trim(); if (!t) continue; const u = t.toUpperCase();
      const kanan = l.rx0 != null && l.rx0 > 0.62; // zona kanan (di bawah foto): kota & tanggal terbit
      // kepala dokumen
      if (!out.provinsi && /^PR[O0]V[I1L]NS[I1L]\b/.test(u)) { const p = l.text.search(/\s/); set('provinsi', ambil(l, p < 0 ? l.text.length : p + 1)); label.provinsi = 1; last = null; continue }
      if (!out.kabkota && (idxNik < 0 || i < idxNik) && out.provinsi && /^[A-Z .]{4,40}$/.test(u) && !cocokLabel(t)) { set('kabkota', ambil(l, 0)); label.kabkota = 1; last = null; continue }
      if (kanan) { const d = l.text.match(DATE); if (d && !out.tgl_terbit && l.text.replace(DATE, '').trim().length < 3) { set('tgl_terbit', ambil(l, d.index, d.index + d[0].length)); label.tgl_terbit = 1; continue }
        if (!out.kota_terbit && /^[A-Z .]{4,30}$/.test(u) && !/SEUMUR|HIDUP|GOL/.test(u) && (out.agama || out.alamat || seenBerlaku || out.nama)) { set('kota_terbit', ambil(l, 0)); label.kota_terbit = 1; continue } }
      const m = cocokLabel(l.text);
      if (m) {
        last = m.key; label[m.key] = 1; let pos = m.pos, end = l.text.length;
        // nilai di baris berikutnya bila baris label kosong (label & nilai terpisah baris)
        let L = l;
        if (!m.rest && lines[i + 1] && !cocokLabel(lines[i + 1].text) && !(lines[i + 1].rx0 > 0.62)) { L = lines[i + 1]; pos = 0; end = L.text.length; i++ }
        const rest = L.text.slice(pos);
        if (m.key === 'nik') { const o = ambil(L, pos, end); o.v = o.raw.replace(/\s+/g, ''); set('nik', o) } // spasi saja yang dibuang; simbol dibiarkan agar terlihat
        else if (m.key === 'ttl') { const d = rest.match(DATE); if (d) { set('tanggal_lahir', ambil(L, pos + d.index, pos + d.index + d[0].length)); set('tempat_lahir', ambil(L, pos, pos + d.index, rest.slice(0, d.index).replace(/[,.\s]+$/, ''))) } else { const c = rest.lastIndexOf(','); if (c > 0) { set('tempat_lahir', ambil(L, pos, pos + c)); set('tanggal_lahir', ambil(L, pos + c + 1)) } else set('tempat_lahir', ambil(L, pos)) } label.tempat_lahir = label.tanggal_lahir = 1 }
        else if (m.key === 'jk') { const g = rest.search(/G[O0]L\.?\s*DARAH/i); if (g >= 0) { set('jk', ambil(L, pos, pos + g)); const gm = rest.slice(g).match(/DARAH\s*[:;]?\s*(\S*)/i); if (gm && gm[1]) { const st = pos + g + rest.slice(g).indexOf(gm[1], gm.index + 5); set('gol', ambil(L, st, st + gm[1].length)) } label.gol = 1 } else set('jk', ambil(L, pos)) }
        else if (m.key === 'wn') { const w = rest.match(/^(WNI|WNA)\b/i); set('wn', w ? ambil(L, pos, pos + w[0].length) : ambil(L, pos)) }
        else if (m.key === 'berlaku') { seenBerlaku = true; const sh = rest.match(/SEUMUR\s+HIDUP/i); const d = rest.match(DATE); if (sh) set('berlaku', ambil(L, pos + sh.index, pos + sh.index + sh[0].length)); else if (d) set('berlaku', ambil(L, pos + d.index, pos + d.index + d[0].length)); else set('berlaku', ambil(L, pos)) }
        else { set(m.key, ambil(L, pos, end)); if (m.key === 'alamat') alamatX = (L.words.find((w) => w.off >= pos) || {}).box?.[0] }
        continue;
      }
      // lanjutan alamat: baris tanpa label, rata kiri dengan nilai alamat, sebelum RT/RW
      if (last === 'alamat' && out.alamat && !out.rtrw && u.length > 2 && !kanan) {
        const x = l.box[0], tinggi = l.box[3] - l.box[1];
        if (alamatX == null || Math.abs(x - alamatX) < Math.max(3 * tinggi, 40)) { const o = ambil(l, 0); out.alamat = { ...out.alamat, v: out.alamat.v + ' ' + o.v, raw: out.alamat.raw + '\n' + o.raw, conf: [out.alamat.conf, o.conf].filter((c) => c != null).reduce((a, b) => Math.min(a, b), Infinity), box: [Math.min(out.alamat.box[0], o.box[0]), Math.min(out.alamat.box[1], o.box[1]), Math.max(out.alamat.box[2], o.box[2]), Math.max(out.alamat.box[3], o.box[3])] }; if (!isFinite(out.alamat.conf)) out.alamat.conf = null; continue }
      }
      // kota & tanggal terbit (format lama tanpa posisi): sesudah berlaku/kewarganegaraan
      if (seenBerlaku || out.wn) { const d = u.match(DATE); if (d && !out.tgl_terbit && u.replace(DATE, '').trim().length < 3) { set('tgl_terbit', ambil(l, d.index, d.index + d[0].length)); continue } if (!out.kota_terbit && /^[A-Z .]{4,30}$/.test(u) && !/SEUMUR|HIDUP/.test(u)) { set('kota_terbit', ambil(l, 0)); continue } }
    }
    for (const k in out) { if (!['nik', 'gol'].includes(k)) out[k].v = out[k].v.replace(/^[\s\-—–_,:;=]+|[\s\-—–_,:;=]+$/g, ''); if (!['nik', 'gol', 'nama', 'alamat'].includes(k)) out[k].v = out[k].v.replace(/^['"`.,]+\s*/, ''); if (k === 'gol') out[k].v = out[k].v.replace(/^[:;\s]+/, '') }
    return { nilai: out, label };
  }

  /* ---------- 4. Validasi bentuk (tidak mengubah nilai) ---------- */
  function tglValid(s) { const m = String(s).match(/^(\d{2})-(\d{2})-(\d{4})$/); if (!m) return false; const d = +m[1], b = +m[2], y = +m[3]; const t = new Date(Date.UTC(y, b - 1, d)); return t.getUTCDate() === d && t.getUTCMonth() === b - 1 && y >= 1900 && y <= 2100 }
  function validasi(key, v) {
    const s = String(v || '').trim(); if (!s) return { ok: true };
    if (key === 'nik') { const bad = [...new Set(s.replace(/\d/g, '').split(''))]; if (bad.length) return { ok: false, alasan: 'Ada karakter bukan angka: ' + bad.map((c) => '“' + c + '”').join(' ') + ' — cocokkan dengan dokumen' }; if (s.length !== 16) return { ok: false, alasan: s.length + ' digit (NIK berbentuk 16 digit)' }; return { ok: true, catatan: '16 digit (bentuk sesuai; kebenaran tetap dicek di dokumen)' } }
    if (['tanggal_lahir', 'tgl_terbit'].includes(key)) return tglValid(s) ? { ok: true } : { ok: false, alasan: 'Bukan tanggal DD-MM-YYYY yang valid' };
    if (key === 'berlaku') return /^SEUMUR HIDUP$/i.test(s) || tglValid(s) ? { ok: true } : { ok: false, alasan: 'Harus “SEUMUR HIDUP” atau tanggal DD-MM-YYYY' };
    if (key === 'jk') return /^(LAKI-LAKI|PEREMPUAN)$/i.test(s) ? { ok: true } : { ok: false, alasan: 'Harus LAKI-LAKI atau PEREMPUAN' };
    if (key === 'gol') return /^(A|B|AB|O)[+\-]?$|^-$/i.test(s) ? { ok: true } : { ok: false, alasan: 'Golongan darah tidak dikenal' };
    if (key === 'rtrw') return /^\d{3}\s*\/\s*\d{3}$/.test(s) ? { ok: true } : { ok: false, alasan: 'Format RT/RW biasanya 000/000' };
    if (key === 'nama') return /\d/.test(s) ? { ok: false, alasan: 'Ada angka di nama' } : /[^A-Z .,'\-]/i.test(s) ? { ok: false, alasan: 'Ada simbol tidak lazim di nama' } : { ok: true };
    if (key === 'wn') return /^(WNI|WNA)$/i.test(s) ? { ok: true } : { ok: false, alasan: 'Harus WNI atau WNA' };
    return { ok: true };
  }

  /* ---------- 5. Kualitas (indikasi heuristik) ---------- */
  /** img: {data (RGBA), width, height} versi kecil (~800 px). Mengembalikan daftar catatan, bukan skor. */
  function kualitasGambar(img) {
    const { data, width: w, height: h } = img, n = w * h, g = new Float32Array(n);
    let sum = 0; for (let i = 0; i < n; i++) { const v = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114; g[i] = v; sum += v }
    const mean = sum / n; let vs = 0; for (let i = 0; i < n; i++) vs += (g[i] - mean) ** 2; const sd = Math.sqrt(vs / n);
    let lap = 0, lm = 0, cnt = 0; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; const L = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]; lm += L; lap += L * L; cnt++ }
    const lapVar = lap / cnt - (lm / cnt) ** 2;
    let br = 0, bx = 0, by = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y * w + x] > 248) { br++; bx += x; by += y }
    const c = [];
    if (Math.min(w, h) < 360) c.push({ k: 'resolusi', x: 'Resolusi gambar rendah — tulisan kecil mungkin tidak terbaca andal' });
    if (lapVar < 60) c.push({ k: 'blur', x: 'Gambar tampak buram (indikasi) — foto ulang lebih fokus bila hasil meragukan' });
    if (sd < 35) c.push({ k: 'kontras', x: 'Kontras rendah (indikasi) — tulisan dan latar kurang berbeda' });
    if (mean < 60) c.push({ k: 'gelap', x: 'Gambar terlalu gelap (indikasi)' });
    if (br / n > 0.02) { const cx = bx / br / w, cy = by / br / h; const pos = (cy < 0.4 ? 'atas' : cy > 0.6 ? 'bawah' : 'tengah') + (cx < 0.4 ? ' kiri' : cx > 0.6 ? ' kanan' : ''); c.push({ k: 'pantulan', x: 'Ada area sangat terang di bagian ' + pos.trim() + ' — kemungkinan pantulan cahaya (indikasi)' }) }
    return { catatan: c, ukur: { terang: Math.round(mean), kontras: Math.round(sd), ketajaman: Math.round(lapVar), terang_berlebih: +(br / n).toFixed(3) } };
  }
  /** Dari posisi kata: tulisan terlalu kecil, tepi terpotong, kemiringan. W,H = ukuran gambar yang dibaca. */
  function kualitasTeks(kata, W, H, miring) {
    const c = []; if (!kata || !kata.length) return c;
    const hs = kata.map((k) => { const ys = [k.q[1], k.q[3], k.q[5], k.q[7]]; return Math.max(...ys) - Math.min(...ys) });
    if (med(hs) < 11) c.push({ k: 'kecil', x: 'Tulisan terlalu kecil untuk dibaca dengan andal — gunakan foto lebih dekat / resolusi lebih tinggi' });
    const tepi = { kiri: 0, kanan: 0, atas: 0, bawah: 0 }, m = 0.008;
    for (const k of kata) { const xs = [k.q[0], k.q[2], k.q[4], k.q[6]], ys = [k.q[1], k.q[3], k.q[5], k.q[7]]; if (Math.min(...xs) <= W * m) tepi.kiri++; if (Math.max(...xs) >= W * (1 - m)) tepi.kanan++; if (Math.min(...ys) <= H * m) tepi.atas++; if (Math.max(...ys) >= H * (1 - m)) tepi.bawah++ }
    for (const s in tepi) if (tepi[s] >= 2) c.push({ k: 'terpotong', x: 'Bagian ' + s + ' dokumen kemungkinan terpotong — ada tulisan menempel di tepi gambar' });
    const a = Math.abs(miring || 0); if (a > 2.5 && a < 87.5) c.push({ k: 'miring', x: 'Dokumen miring ±' + Math.round(a) + '° — posisi sudah diluruskan otomatis untuk pemetaan' });
    else if (a >= 87.5) c.push({ k: 'putar', x: 'Dokumen terbaca dalam posisi diputar ±' + Math.round(a / 90) * 90 + '° — sudah diluruskan otomatis' });
    return c;
  }

  /* ---------- 6. Jenis dokumen ---------- */
  const JENIS_DOK = [
    ['KTP', true, [['NIK', 3], ['BERLAKU HINGGA', 3], ['GOL. DARAH', 2], ['GOL DARAH', 2], ['KEWARGANEGARAAN', 1], ['RT/RW', 2], ['KEL/DESA', 2], ['KECAMATAN', 1]]],
    ['Kartu Keluarga', false, [['KARTU KELUARGA', 4], ['NO. KK', 3], ['KEPALA KELUARGA', 3], ['STATUS HUBUNGAN DALAM KELUARGA', 3], ['DOKUMEN IMIGRASI', 1]]],
    ['Akta Kelahiran', false, [['AKTA KELAHIRAN', 4], ['KELAHIRAN', 2], ['TELAH LAHIR', 3], ['ANAK KE', 2]]],
    ['Akta Perkawinan', false, [['AKTA PERKAWINAN', 4], ['PERKAWINAN', 2]]],
    ['Buku Nikah', false, [['BUKU NIKAH', 4], ['AKTA NIKAH', 4], ['KANTOR URUSAN AGAMA', 3], ['WALI NIKAH', 2], ['MAHAR', 2]]],
    ['Akta Perceraian', false, [['AKTA PERCERAIAN', 4], ['PERCERAIAN', 2]]],
    ['Akta Kematian', false, [['AKTA KEMATIAN', 4], ['KEMATIAN', 2], ['MENINGGAL', 2]]],
    ['Paspor', false, [['PASPOR', 4], ['PASSPORT', 4], ['P<IDN', 4]]],
    ['SIM', false, [['SURAT IZIN MENGEMUDI', 4], ['DRIVING LICENSE', 3]]],
    ['Ijazah', false, [['IJAZAH', 4], ['TELAH MENYELESAIKAN', 2], ['DINYATAKAN LULUS', 2]]],
    ['Transkrip Nilai', false, [['TRANSKRIP', 4], ['INDEKS PRESTASI', 3], ['MATA KULIAH', 2], ['SKS', 1]]],
    ['Rapor', false, [['RAPOR', 4], ['LAPORAN HASIL BELAJAR', 4], ['CAPAIAN KOMPETENSI', 2]]],
    ['SKCK', false, [['CATATAN KEPOLISIAN', 4], ['SKCK', 3]]],
    ['NPWP', false, [['NOMOR POKOK WAJIB PAJAK', 4], ['NPWP', 3]]],
    ['Surat Keterangan', false, [['SURAT KETERANGAN', 2], ['MENERANGKAN BAHWA', 2]]]
  ];
  function deteksiJenis(teks) {
    const u = ' ' + String(teks || '').toUpperCase().replace(/\s+/g, ' ') + ' ';
    const skor = JENIS_DOK.map(([nama, siap, kw]) => ({ nama, siap, s: kw.reduce((a, [k, w]) => a + (u.includes(k) ? w : 0), 0), cocok: kw.filter(([k]) => u.includes(k)).map(([k]) => k) })).sort((a, b) => b.s - a.s);
    const [a, b] = skor; if (!a || a.s < 3) return { nama: 'Tidak dikenali', siap: false, cocok: [] };
    return { nama: a.nama, siap: a.siap, cocok: a.cocok, kedua: b && b.s >= 3 ? b.nama : null };
  }

  /* ---------- 7. Baca ulang terarah ---------- */
  const PENTING = ['nik', 'nama', 'tempat_lahir', 'tanggal_lahir', 'jk', 'berlaku'];
  /** Kolom yang layak dibaca ulang dari potongan: penting & (tidak valid / skor rendah / label ada tapi nilai kosong). Maks n. */
  function perluBacaUlang(hasil, lines, ambang, n) {
    const r = [];
    for (const k of PENTING) {
      const o = hasil.nilai[k]; const ada = hasil.label[k];
      let alasan = null;
      if (!o && ada) alasan = 'label ada, nilai belum terbaca';
      else if (o && !validasi(k, o.v).ok) alasan = 'tidak lolos validasi';
      else if (o && o.conf != null && o.conf < ambang) alasan = 'skor OCR rendah';
      if (!alasan) continue;
      const box = o ? o.box : (lines.find((l) => { const m = cocokLabel(l.text); return m && (m.key === k || (m.key === 'ttl' && /lahir/.test(k))) }) || {}).box;
      if (box) r.push({ key: k, box, alasan });
    }
    // satu potongan per baris sumber
    const uniq = []; for (const x of r) if (!uniq.some((u) => Math.abs(u.box[1] - x.box[1]) < 5)) uniq.push(x);
    return uniq.slice(0, n || 3);
  }
  /** Potongan: area baris penuh (dari tepi kiri dokumen) + margin, dalam koordinat gambar. */
  function kotakPotong(box, W, H) { const h = box[3] - box[1]; const y0 = Math.max(0, box[1] - h * 0.8), y1 = Math.min(H, box[3] + h * 0.8); return [0, Math.round(y0), W, Math.round(y1)] }
  /** Petakan teks potongan untuk satu kolom. lines = baris hasil baca potongan. */
  function nilaiDariPotongan(key, lines) {
    const k2 = ['tempat_lahir', 'tanggal_lahir'].includes(key) ? 'ttl' : key;
    for (const l of lines) { const m = cocokLabel(l.text); if (m && m.key === k2) { const h = petakanKTP([l]); return h.nilai[key] || null } }
    // tanpa label di potongan: ambil baris dengan isi terpanjang
    return null;
  }
  /** Gabungkan kandidat: TIDAK memilih berdasarkan kecocokan format. Kosong → isi dari kandidat baru; berbeda → tandai. */
  function gabungKandidat(pertama, baru) {
    if (!baru || !baru.v) return { pilih: pertama, beda: false };
    if (!pertama || !pertama.v) return { pilih: baru, beda: false, dariUlang: true };
    const a = pertama.v.replace(/\s+/g, ''), b = baru.v.replace(/\s+/g, '');
    return { pilih: pertama, beda: a !== b };
  }

  G.OCRCORE = { lev, sim, barisDariKata, cocokLabel, petakanKTP, validasi, tglValid, kualitasGambar, kualitasTeks, deteksiJenis, perluBacaUlang, kotakPotong, nilaiDariPotongan, gabungKandidat, LABELS, PENTING, VERSI: '2026-11-15b' };
})(typeof globalThis !== 'undefined' ? globalThis : this);
