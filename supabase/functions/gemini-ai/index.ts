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
const AKTA_KOLOM: [string, string][] = [
  ["nik", "NIK di pojok atas (bila ada)"], ["wn", "Baris kewarganegaraan di kepala, mis. WARGA NEGARA INDONESIA"], ["no", "Nomor akta kelahiran (setelah kata Nomor)"],
  ["stbld", "Dasar hukum/Staatsblad setelah kata menurut stbld (bila ada)"], ["tempat_lahir", "Tempat lahir (setelah: bahwa di)"], ["tgl_lahir", "Tanggal dan bulan lahir seperti tertulis"], ["thn_lahir", "Tahun lahir seperti tertulis"],
  ["nama", "Nama anak yang lahir"], ["anak_ke", "Urutan anak seperti tertulis, mis. SATU atau KESATU"], ["jk", "Jenis kelamin anak: LAKI-LAKI atau PEREMPUAN"], ["ayah", "Nama ayah (kosong bila hanya ibu)"], ["ibu", "Nama ibu"],
  ["kota_terbit", "Tempat kutipan dikeluarkan, mis. KOTA DEPOK"], ["tgl_terbit", "Tanggal dan bulan kutipan dikeluarkan seperti tertulis"], ["thn_terbit", "Tahun kutipan dikeluarkan seperti tertulis"],
  ["jabatan", "Jabatan penanda tangan seperti tercetak, mis. PEJABAT PENCATATAN SIPIL atau KEPALA DINAS KEPENDUDUKAN DAN PENCATATAN SIPIL KOTA ..."], ["pejabat", "Nama pejabat penanda tangan"], ["nip", "NIP pejabat (angka saja)"],
  ["tte", "YA atau TIDAK"], ["catatan", "Isi catatan pinggir (bila ada), disalin apa adanya"],
];
const KK_KEPALA: [string, string][] = [
  ["no_kk", "Nomor KK (16 angka di bawah judul)"], ["kepala", "Nama Kepala Keluarga"], ["alamat", "Alamat"], ["rtrw", "RT/RW"], ["kodepos", "Kode Pos"], ["kel", "Desa/Kelurahan"], ["kec", "Kecamatan"], ["kab", "Kabupaten/Kota seperti tercetak"], ["prov", "Provinsi"],
  ["tgl_terbit", "Tanggal dikeluarkan DD-MM-YYYY"], ["jabatan", "Jabatan penanda tangan dinas, mis. KEPALA DINAS KEPENDUDUKAN DAN PENCATATAN SIPIL KOTA ..."], ["pejabat", "Nama pejabat penanda tangan"], ["nip", "NIP pejabat (angka saja)"], ["tte", "YA atau TIDAK"],
  ["baris", "Hitung baris yang BENAR-BENAR tergambar pada tabel anggota (tabel atas): baris terisi + baris kosong, tanpa baris judul dan baris nomor kolom. Bila tidak ada baris kosong, nilainya sama dengan jumlah anggota. Jangan mengasumsikan 10. Angka saja"], ["kosong_no", "YA bila baris kosong tetap dicetak nomor urutnya, TIDAK bila baris kosong tanpa nomor, kosong bila tidak ada baris kosong"],
];
const KK_ANGGOTA: [string, string][] = [
  ["nama", "Nama Lengkap"], ["nik", "NIK"], ["jk", "Jenis Kelamin"], ["tempat_lahir", "Tempat Lahir"], ["tgl_lahir", "Tanggal Lahir DD-MM-YYYY"], ["agama", "Agama"], ["pendidikan", "Pendidikan"], ["kerja", "Jenis Pekerjaan"], ["gol", "Golongan Darah"],
  ["status", "Status Perkawinan"], ["tgl_kawin", "Tanggal Perkawinan"], ["hub", "Status Hubungan Dalam Keluarga"], ["wn", "Kewarganegaraan"], ["paspor", "No. Paspor"], ["kitap", "No. KITAP"], ["ayah", "Nama Ayah"], ["ibu", "Nama Ibu"],
];
const TUGAS: Record<string, { prompt: string; skema: unknown; maksKeluar: number; batasMs?: number }> = {
  ktp: {
    prompt: "Gambar ini seharusnya KTP Indonesia (boleh miring, terputar, atau buram). Salin isi tiap kolom PERSIS seperti tercetak, huruf demi huruf, tanpa memperbaiki ejaan, tanpa melengkapi, tanpa menebak. " +
      "Kolom yang tidak terlihat, terpotong, atau tidak bisa dibaca dengan yakin: isi string kosong dan masukkan nama kolomnya ke daftar \"ragu\". Kolom yang terbaca tetapi ada huruf/angka yang meragukan: tetap salin apa adanya dan masukkan juga ke \"ragu\". " +
      "NIK: salin karakter yang terlihat saja; jangan menambah, membuang, atau mengganti karakter agar menjadi 16 angka. \"jenis\": tulis KTP bila ini KTP, selain itu nama jenis dokumennya.",
    skema: { type: "OBJECT", properties: { jenis: S("KTP atau jenis dokumen lain"), ...Object.fromEntries(KTP_KOLOM.map(([k, d]) => [k, S(d)])), ragu: { type: "ARRAY", items: { type: "STRING" } } }, required: ["jenis", "ragu", ...KTP_KOLOM.map(([k]) => k)] },
    maksKeluar: 1200,
  },
  akta: {
    prompt: "Gambar ini seharusnya Kutipan Akta Kelahiran Indonesia (format lama berblangko atau format baru ber-QR; boleh miring atau buram). Salin isi tiap kolom PERSIS seperti tercetak/tertulis, huruf demi huruf, tanpa memperbaiki ejaan, tanpa menerjemahkan, tanpa melengkapi, tanpa menebak. Titik-titik pengisi blangko tidak disalin. " +
      "Kolom yang tidak ada di dokumen: string kosong (bukan ragu). Kolom yang ada tetapi tidak terbaca dengan yakin: salin yang terlihat atau kosongkan, lalu masukkan nama kolomnya ke daftar \"ragu\". " +
      "tgl_lahir dan tgl_terbit = hanya tanggal dan bulan seperti tertulis (mis. DUA PULUH FEBRUARI); thn_lahir dan thn_terbit = hanya tahun seperti tertulis (mis. DUA RIBU SEMBILAN BELAS). NIK dan nomor akta: salin karakter yang terlihat saja. " +
      "tte = YA bila ada kode QR / keterangan ditandatangani secara elektronik, selain itu TIDAK. \"jenis\": tulis AKTA KELAHIRAN bila ini kutipan akta kelahiran, selain itu nama jenis dokumennya.",
    skema: { type: "OBJECT", properties: { jenis: S("AKTA KELAHIRAN atau jenis dokumen lain"), ...Object.fromEntries(AKTA_KOLOM.map(([k, d]) => [k, S(d)])), ragu: { type: "ARRAY", items: { type: "STRING" } } }, required: ["jenis", "ragu", ...AKTA_KOLOM.map(([k]) => k)] },
    maksKeluar: 1600,
  },
  kk: {
    prompt: "Gambar ini seharusnya Kartu Keluarga (KK) Indonesia. Salin isi tiap kolom PERSIS seperti tercetak, huruf demi huruf, tanpa memperbaiki ejaan, tanpa menerjemahkan, tanpa melengkapi, tanpa menebak. " +
      "\"anggota\" = SEMUA baris anggota keluarga yang TERISI, urut dari nomor 1 (baris kosong tidak dimasukkan, tetapi dihitung di \"baris\"); gabungkan tabel atas (nama s.d. golongan darah) dan tabel bawah (status perkawinan s.d. nama ibu) berdasarkan nomor urut baris. Sel yang tercetak tanda strip tulis -. " +
      "Kolom yang tidak ada: string kosong. Yang tidak terbaca dengan yakin: salin yang terlihat atau kosongkan, lalu masukkan ke daftar \"ragu\" dengan bentuk nama kolom untuk bagian kepala (mis. no_kk) atau m<nomor urut>_<kolom> untuk anggota (mis. m2_nik). " +
      "NIK dan nomor KK: salin karakter yang terlihat saja; jangan menambah, membuang, atau mengganti karakter. Tanggal ditulis seperti tercetak (DD-MM-YYYY). tte = YA bila ada kode QR / keterangan tanda tangan elektronik, selain itu TIDAK. " +
      "\"jenis\": tulis KARTU KELUARGA bila ini KK, selain itu nama jenis dokumennya.",
    skema: { type: "OBJECT", properties: { jenis: S("KARTU KELUARGA atau jenis dokumen lain"), ...Object.fromEntries(KK_KEPALA.map(([k, d]) => [k, S(d)])),
      anggota: { type: "ARRAY", items: { type: "OBJECT", properties: Object.fromEntries(KK_ANGGOTA.map(([k, d]) => [k, S(d)])), required: KK_ANGGOTA.map(([k]) => k) } },
      ragu: { type: "ARRAY", items: { type: "STRING" } } }, required: ["jenis", "ragu", "anggota", ...KK_KEPALA.map(([k]) => k)] },
    maksKeluar: 9000,
  },
  ijazah: {
    prompt: "Gambar ini seharusnya ijazah / sertifikat kelulusan Indonesia (sekolah atau perguruan tinggi). Salin SEMUA teks yang tercetak, baris demi baris dari atas ke bawah, PERSIS seperti tertulis (tanpa memperbaiki ejaan, tanpa melengkapi, tanpa menebak). Bila ijazah dwibahasa, salin hanya teks bahasa Indonesia. " +
      "Untuk tiap baris isi juga \"en\": terjemahan bahasa Inggris yang setia dan formal untuk baris itu. Nama orang, nomor, NIK, NIM/NISN, NIP, dan gelar di belakang nama TIDAK diterjemahkan (disalin apa adanya); NIP ditulis REG. NO. diikuti angkanya. " +
      "Elemen bukan teks ditulis sebagai baris tersendiri dengan teks dan en yang sama: (Logo), (Photograph), (Signature and stamp), (QR Code), (Hologram seal). " +
      "jenis baris: judul (nama lembaga, judul IJAZAH, nama pemilik yang dicetak menonjol), ttd (baris di blok tanda tangan: jabatan, tanda tangan, nama, NIP), selain itu isi. kolom: untuk baris ttd isi nomor blok tanda tangan dihitung dari kiri (1, 2, atau 3); selain itu 0. " +
      "nama = nama pemilik ijazah. orientasi = MENDATAR atau TEGAK sesuai bentuk kertas. ragu = nomor urut baris (mulai 1, sebagai teks) yang tidak terbaca dengan yakin. \"jenis\" (di luar baris): tulis IJAZAH bila ini ijazah/sertifikat kelulusan, selain itu nama jenis dokumennya.",
    skema: { type: "OBJECT", properties: { jenis: S("IJAZAH atau jenis dokumen lain"), nama: S("Nama pemilik ijazah"), orientasi: S("MENDATAR atau TEGAK"),
      baris: { type: "ARRAY", items: { type: "OBJECT", properties: { teks: S("teks baris persis seperti tercetak"), en: S("terjemahan Inggris baris itu"), jenis: S("judul | isi | ttd"), kolom: S("0, 1, 2, atau 3") }, required: ["teks", "en", "jenis", "kolom"] } },
      ragu: { type: "ARRAY", items: { type: "STRING" } } }, required: ["jenis", "nama", "orientasi", "baris", "ragu"] },
    maksKeluar: 7000,
  },
  transkrip: {
    prompt: "Gambar ini seharusnya transkrip nilai akademik / daftar nilai Indonesia (perguruan tinggi atau sekolah). Salin SEMUA teks PERSIS seperti tercetak (tanpa memperbaiki ejaan, tanpa melengkapi, tanpa menebak) dan beri terjemahan bahasa Inggris yang setia dan formal. Bila dwibahasa, salin hanya teks bahasa Indonesia. " +
      "atas = baris teks di atas tabel nilai (kop, judul, identitas), urut dari atas. kolom = judul kolom tabel nilai dari kiri ke kanan (satu set saja). " +
      "baris = SEMUA baris tabel nilai, urut; bila tabel dicetak dua lajur berdampingan, gabungkan menjadi satu daftar (lajur kiri dulu, lalu lajur kanan). sel = isi tiap sel persis seperti tercetak, sejumlah kolom; en = sel yang sama tetapi nama mata kuliah / mata pelajaran diterjemahkan ke bahasa Inggris, sedangkan nomor, kode, SKS, angka, dan huruf nilai disalin apa adanya. Baris subjudul di dalam tabel (mis. SEMESTER I) ditulis sebagai baris dengan SATU sel. " +
      "bawah = baris teks di bawah tabel (jumlah SKS, IPK, predikat, judul skripsi, tempat dan tanggal, blok tanda tangan), urut dari atas; jenis ttd untuk baris di blok tanda tangan (jabatan, tanda tangan, nama, NIP) dengan kolom = nomor blok dari kiri (1, 2, atau 3), selain itu jenis isi dan kolom 0. " +
      "Nama orang, nomor, NIM, NIP, dan gelar di belakang nama tidak diterjemahkan; NIP ditulis REG. NO. diikuti angkanya. Elemen bukan teks ditulis sebagai baris: (Logo), (Photograph), (Signature and stamp), (QR Code). " +
      "nama = nama pemilik transkrip. orientasi = MENDATAR atau TEGAK. ragu = yang tidak terbaca dengan yakin, ditulis a<nomor> untuk baris atas, t<nomor> untuk baris tabel, b<nomor> untuk baris bawah (nomor mulai 1). \"jenis\": tulis TRANSKRIP NILAI bila ini transkrip/daftar nilai, selain itu nama jenis dokumennya.",
    skema: { type: "OBJECT", properties: { jenis: S("TRANSKRIP NILAI atau jenis dokumen lain"), nama: S("Nama pemilik transkrip"), orientasi: S("MENDATAR atau TEGAK"),
      atas: { type: "ARRAY", items: { type: "OBJECT", properties: { teks: S("teks baris"), en: S("terjemahan Inggris"), jenis: S("judul | isi") }, required: ["teks", "en", "jenis"] } },
      kolom: { type: "ARRAY", items: { type: "OBJECT", properties: { teks: S("judul kolom"), en: S("terjemahan Inggris") }, required: ["teks", "en"] } },
      baris: { type: "ARRAY", items: { type: "OBJECT", properties: { sel: { type: "ARRAY", items: { type: "STRING" } }, en: { type: "ARRAY", items: { type: "STRING" } } }, required: ["sel", "en"] } },
      bawah: { type: "ARRAY", items: { type: "OBJECT", properties: { teks: S("teks baris"), en: S("terjemahan Inggris"), jenis: S("isi | ttd"), kolom: S("0, 1, 2, atau 3") }, required: ["teks", "en", "jenis", "kolom"] } },
      ragu: { type: "ARRAY", items: { type: "STRING" } } }, required: ["jenis", "nama", "orientasi", "atas", "kolom", "baris", "bawah", "ragu"] },
    maksKeluar: 16000, batasMs: 100000,
  },
  nonreg: {
    prompt: "Gambar ini satu halaman dokumen yang BELUM punya template (surat keterangan, surat pernyataan, akta, sertifikat, kontrak, putusan, dan sejenisnya). Tugas: salin SEMUA teks halaman ini PERSIS seperti tercetak (huruf demi huruf, termasuk tanda baca, nomor, dan huruf besar/kecil; tanpa memperbaiki ejaan, tanpa melengkapi, tanpa menebak, tanpa meringkas) dan beri terjemahan bahasa Inggris yang setia, formal, dan lengkap dengan gaya penerjemah tersumpah (tanpa parafrasa bebas, tanpa menambah atau mengurangi informasi). " +
      "blok = isi halaman dari atas ke bawah. SATU paragraf = SATU blok (jangan memecah paragraf per baris cetak, jangan menggabungkan paragraf yang berbeda). Baris identitas berbentuk label dan isi (mis. Nama : ...) = satu blok per baris. Butir bernomor/berhuruf = satu blok per butir, nomornya ikut disalin. " +
      "jenis blok: judul (kop, nama lembaga, judul dokumen yang dicetak di tengah/menonjol), sub (subjudul/judul bagian rata kiri yang tebal), paragraf (teks biasa), tabel_kepala (baris judul kolom tabel), tabel (baris isi tabel), ttd (baris di blok tanda tangan: tempat dan tanggal, jabatan, tanda tangan/cap, nama, NIP). " +
      "sel = untuk tabel_kepala dan tabel: isi tiap sel dari kiri ke kanan; untuk jenis lain: SATU elemen berisi teks blok. en = terjemahan dengan jumlah elemen yang SAMA dengan sel. Pertahankan tanda baca sedekat mungkin dengan sumber (titik dua, titik koma, tanda kurung, tanda kutip, garis miring). " +
      "rata = perataan teks blok di sumber: kiri, tengah, kanan, atau rata (rata kiri-kanan). kolom = hanya untuk ttd: letak blok tanda tangan, 1 kiri, 2 tengah, 3 kanan; selain itu 0. " +
      "TIDAK diterjemahkan (disalin apa adanya di en): nama orang, nama jalan/alamat, nomor dokumen, NIK, NIP, nomor apa pun, dan gelar di belakang nama. Tanggal diterjemahkan tanpa mengubah angkanya. Nominal uang dan angka tidak boleh berubah. " +
      "Elemen bukan teks ditulis sebagai blok tersendiri dengan sel dan en yang sama: (Logo), (Emblem), (Photograph), (Signature), (Stamp), (Signature and stamp), (Duty stamp), (QR Code). Teks pada cap yang terbaca disalin sebagai blok setelahnya. " +
      "Bagian yang tidak terbaca dengan yakin: salin yang terlihat saja, tulis [illegible] untuk bagian yang hilang, dan masukkan nomor urut bloknya (mulai 1, sebagai teks) ke ragu. Jangan mengarang. " +
      "jenis (di luar blok) = nama jenis dokumen dalam bahasa Indonesia seperti tertulis (mis. SURAT KETERANGAN DOMISILI). judul_en = nama jenis dokumen itu dalam bahasa Inggris, singkat (mis. Certificate of Domicile). nama = nama orang/pihak utama yang diterangkan dokumen (kosong bila tidak ada). orientasi = MENDATAR atau TEGAK sesuai bentuk kertas.",
    skema: { type: "OBJECT", properties: { jenis: S("nama jenis dokumen (Indonesia)"), judul_en: S("nama jenis dokumen (Inggris), singkat"), nama: S("nama orang/pihak utama, boleh kosong"), orientasi: S("MENDATAR atau TEGAK"),
      blok: { type: "ARRAY", items: { type: "OBJECT", properties: { jenis: S("judul | sub | paragraf | tabel_kepala | tabel | ttd"), rata: S("kiri | tengah | kanan | rata"), sel: { type: "ARRAY", items: { type: "STRING" } }, en: { type: "ARRAY", items: { type: "STRING" } }, kolom: S("0, 1, 2, atau 3") }, required: ["jenis", "rata", "sel", "en", "kolom"] } },
      ragu: { type: "ARRAY", items: { type: "STRING" } } }, required: ["jenis", "judul_en", "nama", "orientasi", "blok", "ragu"] },
    maksKeluar: 16000, batasMs: 100000,
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
  // Model yang "berpikir" (bukan Flash-Lite): sisakan ruang token berpikir, dan batasi berpikir ke "low" — menyalin dokumen tidak butuh penalaran panjang;
  // bawaan Gemini 3 Flash adalah "high" (jawaban 20–30 detik, sering putus di HP, dan lebih mahal).
  if (!/flash-lite/.test(model)) { cfg.maxOutputTokens = T.maksKeluar + 6000; cfg.thinkingConfig = { thinkingLevel: "low" }; }
  const buat = () => JSON.stringify({ contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime, data: b64 } }, { text: T.prompt }] }], generationConfig: cfg });
  let body = buat();
  let terakhir = "";
  for (let i = 0; i < 2; i++) {
    let r: Response;
    try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": kunci }, body, signal: AbortSignal.timeout(T.batasMs ?? 40000) }); }
    catch (_) { terakhir = `Gemini tidak menjawab dalam ${Math.round((T.batasMs ?? 40000) / 1000)} detik (jaringan/antrean)`; if (T.batasMs) break; await new Promise((s) => setTimeout(s, 700)); continue; }
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
    if (st === 400 && cfg.thinkingConfig && /thinking/i.test(rinci)) { delete cfg.thinkingConfig; body = buat(); continue; } // model tidak mengenal tingkat berpikir → ulang tanpa
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
    // Smart Translator: jenis dokumen boleh dipilih pemanggil (akta kelahiran / kartu keluarga / ijazah / transkrip / non-reguler); selain itu tugas bawaan fitur.
    const tugasJalan = fitur === "penerjemah" && ["akta", "kk", "ijazah", "transkrip", "nonreg"].includes(String(b.tugas ?? "")) ? String(b.tugas) : F.tugas;
    return json(await satu(fitur, model, tugasJalan, m[2], m[1]));
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
    if (["ktp", "akta", "kk", "ijazah", "transkrip", "nonreg"].includes(tugas) && /^[a-z0-9_\-]+\.jpg$/i.test(String(b.berkas ?? ""))) url = "https://raw.githubusercontent.com/masginanjar/atlas.alfa/uji-ocr/uji/ocr/img/" + b.berkas;
    else if (tugas === "bukti") url = "https://raw.githubusercontent.com/masginanjar/atlas.alfa/main/public/contoh/contoh-klikbca-transfer.png";
    else return json({ ok: false, alasan: "tugas uji tidak dikenal" }, 400);
    const ib = await fetch(url); if (!ib.ok) return json({ ok: false, alasan: "data uji tidak ditemukan" }, 404);
    const r = await satu("uji", model, tugas, b64dari(new Uint8Array(await ib.arrayBuffer())), tugas === "bukti" ? "image/png" : "image/jpeg");
    return json({ ...r, berkas: b.berkas ?? null });
  }

  return json({ ok: false, alasan: "aksi tidak dikenal" }, 400);
});
