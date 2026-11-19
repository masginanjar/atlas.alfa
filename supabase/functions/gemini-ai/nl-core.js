/* ==========================================================================
   NL CORE — Smart Translator: Bahasa Belanda (dipakai di browser DAN di edge function gemini-ai)
   Modul murni tanpa DOM/jaringan. Salinan yang sama ada di supabase/functions/gemini-ai/nl-core.js.

   Sumber: arsip terjemahan tersumpah 247 tahun 2026 (dipelajari 19 Nov 2026):
     • Indonesia → Belanda : 133 berkas Word + 122 scan hasil jadi
     • Belanda → Indonesia : 134 berkas Word + 221 PDF terjemahan + 201 scan hasil jadi
   Istilah baku = bentuk yang PALING SERING dipakai di arsip (aturan pemilik, 15 Nov 2026),
   kecuali tiga butir bertanda "PILIHAN" di bawah, yang perlu diputuskan penerjemah tersumpah.

     1. ARAH   : arah bahasa + penanda halaman (VERTALING / TERJEMAHAN)
     2. JENIS  : jenis dokumen per arah (judul baku + petunjuk susunan)
     3. ISTILAH: istilah baku per arah (ditampilkan di menu Template, dikirim ke AI)
     4. cek()  : pemeriksa hasil — salah ketik berulang & varian yang bukan baku
     5. prompt(): teks panduan untuk AI (dipakai server; klien tidak bisa mengirim prompt sendiri)
   ========================================================================== */
(function (G) {
  'use strict';

  const VERSI = 'NL v1 (19 Nov 2026)';

  /** Arah bahasa. tanda = tulisan kotak kanan atas; kode = awalan nama berkas di arsip. */
  const ARAH = {
    'id-nl': { label: 'Indonesia → Belanda', sumber: 'Indonesia', tujuan: 'Belanda', tanda: 'VERTALING', kode: 'IND-NED', sambung: 'namens', bahasa: 'ID' },
    'nl-id': { label: 'Belanda → Indonesia', sumber: 'Belanda', tujuan: 'Indonesia', tanda: 'TERJEMAHAN', kode: 'NED-IND', sambung: 'atas nama', bahasa: 'NL' },
  };

  /** Jenis dokumen. [kode, nama di menu, judul baku (bahasa tujuan), petunjuk susunan untuk AI] */
  const JENIS = {
    'id-nl': [
      ['akta-lahir', 'Akta Kelahiran', 'Uittreksel uit de Geboorteakte',
        'Kutipan akta kelahiran. Kepala: REPUBLIEK INDONESIË / BURGERLIJKE STAND / INDONESISCHE NATIONALITEIT / UITTREKSEL UIT DE GEBOORTEAKTE. Tanggal dan tahun yang ditulis dengan huruf tetap ditulis dengan huruf (mis. ZEVEN MEI, NEGENTIENHONDERD NEGENENNEGENTIG). Garis pengisi blangko lama (-----) dipertahankan. Catatan pinggir diterjemahkan lengkap.'],
      ['skbm', 'Surat Keterangan Belum Menikah', 'Verklaring van Ongehuwd Zijn',
        'Surat keterangan belum menikah (kelurahan/desa, KUA, atau Disdukcapil). Baris identitas berbentuk label : isi. Penutup baku: "Aldus is deze verklaring naar waarheid opgesteld, opdat zij naar behoren kan worden gebruikt."'],
      ['domisili', 'Surat Keterangan Domisili', 'Verklaring van Woonplaats',
        'Surat keterangan domisili. "De ondergetekende:" untuk "Yang bertanda tangan di bawah ini", "Verklaart hierbij dat:" untuk "menerangkan bahwa".'],
      ['kk', 'Kartu Keluarga', 'Gezinskaart',
        'Kartu Keluarga, kertas MENDATAR. Dua tabel anggota (kolom 1–9 dan 10–17) disalin sebagai tabel; jumlah baris SAMA dengan sumber, baris kosong tidak dibuang, data tiap anggota tidak boleh tertukar. Judul kolom: Volledige Naam, Bevolkingsregistratienummer, Geslacht, Geboorteplaats, Geboortedatum, Godsdienst, Opleiding, Beroep, Bloedgroep, Burgerlijke Staat, Datum van Huwelijk, Familierelatie binnen het Gezin, Nationaliteit, Paspoortnr., Naam van de Ouders (Vader, Moeder).'],
      ['buku-nikah', 'Buku Nikah / Akta Perkawinan', 'Huwelijksakte',
        'Buku nikah (KUA) atau kutipan akta perkawinan (Dukcapil). Kutipan Dukcapil berjudul UITTREKSEL UIT DE HUWELIJKSAKTE. Teks beraksara Arab ditulis (Andere schrifttaal). Sighat taklik diterjemahkan lengkap.'],
      ['akta-cerai', 'Akta Cerai', 'Echtscheidingsakte',
        'Akta cerai Pengadilan Agama / kutipan akta perceraian. Pengadilan Agama = Religieuze Rechtbank; Panitera = Griffier; berkekuatan hukum tetap = in kracht van gewijsde gegaan.'],
      ['skck', 'SKCK', 'Verklaring van de Politie',
        'Surat Keterangan Catatan Kepolisian. Judul VERKLARING VAN DE POLITIE. Singkatan jabatan kepolisian yang tidak punya padanan dibiarkan seperti tertulis.'],
      ['ktp', 'KTP', 'Identiteitskaart',
        'KTP. Baris label : isi. Berlaku hingga SEUMUR HIDUP = LEVENSLANG.'],
      ['paspor', 'Paspor', 'Paspoort',
        'Halaman data paspor. Baris MRZ (deret huruf dan tanda <) disalin apa adanya.'],
      ['ijazah', 'Ijazah / Transkrip Nilai', 'Diploma / Cijferlijst',
        'Ijazah = DIPLOMA, transkrip nilai = CIJFERLIJST. Nama lembaga pendidikan dibiarkan dalam bahasa Indonesia. Tabel nilai disalin sebagai tabel; kode, SKS, angka dan huruf nilai tidak diubah.'],
      ['apostille', 'Sertifikat Apostille', 'Apostille',
        'Sertifikat apostille Kemenkumham (10 butir bernomor). Baris "(Convention de La Haye du 5 octobre 1961)" TIDAK diterjemahkan. Bila apostille menyatu dengan dokumen yang dilegalisasi, keduanya diterjemahkan berurutan.'],
      ['lain', 'Dokumen lain', '', ''],
    ],
    'nl-id': [
      ['akta-lahir', 'Akta Kelahiran Belanda (geboorteakte)', 'Akta Kelahiran',
        'Akta kelahiran Belanda model daftar. Judul bagian baku: ANAK, ORANG TUA, KETERANGAN LAINNYA, DATA KELAHIRAN ORANG TUA, PELAPOR, DATA RESMI DAN TANDA TANGAN, PERUBAHAN DAN CATATAN KEMUDIAN. "Uur en minuut van geboorte" = Jam dan menit kelahiran. Jenis kelamin ditulis L (laki-laki) / P (perempuan). Lembar lanjutan (vervolgblad) ditulis "Lembar lanjutan 1".'],
      ['akta-intl', 'Kutipan akta internasional (formulir multibahasa)', 'Kutipan Akta',
        'Formulir kutipan akta multibahasa dengan kotak bernomor (Konvensi Wina 8 September 1976). Nomor kotak dipertahankan. Simbol baku: H = Hari, B = Bulan, T = Tahun, L = Laki-laki, P = Perempuan, Mar = Status perkawinan, Sc = Pisah tempat tinggal, Div = Bercerai, A = Pernyataan tidak sah, D = Wafat, Dm = Suami telah wafat, Df = Istri telah wafat. Isian yang diakhiri "--" disalin dengan "--". Hanya teks bahasa Belanda yang diterjemahkan; bahasa lain tidak diulang.'],
      ['cni', 'Surat keterangan tidak ada halangan menikah', 'Surat Keterangan Tidak Ada Halangan untuk Menikah',
        'Verklaring van huwelijksbevoegdheid, formulir kotak bernomor 1–13. Nomor kotak dan daftar simbol dipertahankan (H/B/T, L/P). "berlaku selama enam bulan" untuk "zes maanden geldig".'],
      ['brp', 'Kutipan data penduduk (BRP)', 'Kutipan dari Registrasi Dasar Penduduk (BRP)',
        'Uittreksel uit de Basisregistratie Personen. Kalimat pengaman di tepi halaman diterjemahkan satu kali saja: "JIKA ANDA RAGU TENTANG KEASLIAN DOKUMEN INI, SELALU LIHAT DAFTAR FITUR YANG TERTERA DI BAGIAN BELAKANG". Teks dalam bahasa selain Belanda ditulis (Aksara bahasa lain).'],
      ['akta-kawin', 'Akta Perkawinan (huwelijksakte)', 'Akta Perkawinan',
        'Akta/kutipan akta perkawinan Belanda atau Belgia. "Geslachtsnaam voor het huwelijk" = Nama keluarga sebelum perkawinan.'],
      ['akta-mati', 'Akta Kematian (overlijdensakte)', 'Kutipan dari Akta Kematian',
        'Kutipan akta kematian. Judul bagian: MENDIANG. Tanggal kematian, Waktu kematian, Tempat kematian.'],
      ['paspor', 'Paspor Belanda', 'Paspor',
        'Halaman data paspor. Nomor kolom (1–14) dipertahankan. Baris MRZ (deret huruf dan tanda <) disalin apa adanya.'],
      ['apostille', 'Apostille', 'Apostille',
        'Apostille Belanda/Belgia (10 butir bernomor). Baris "(Convention de La Haye du 5 octobre 1961)" TIDAK diterjemahkan. Butir 9 dan 10: "Segel/stempel" dan "Tanda tangan".'],
      ['ijazah', 'Ijazah / daftar nilai', 'Ijazah / Daftar Nilai',
        'Diploma = Ijazah, cijferlijst = Daftar Nilai. Nama lembaga dan nama program dibiarkan dalam bahasa Belanda; padanan Indonesia boleh ditambahkan dalam kurung.'],
      ['vog', 'Surat Keterangan Perilaku (VOG)', 'Surat Keterangan Perilaku',
        'Verklaring Omtrent het Gedrag atau formulir permohonannya. Bagian bernomor dipertahankan.'],
      ['notaris', 'Akta notaris / akta tanah lama', '',
        'Akta notaris, surat kuasa, atau akta tanah (termasuk era Hindia Belanda). Nomor halaman, kop notaris, dan garis pengisi (-----) dipertahankan. Ejaan nama orang dan tempat lama (mis. BANDOENG, BATAVIA) TIDAK dimodernkan. Staatsblad = Lembaran Negara; comparant = penghadap; "verschenen voor mij" = menghadap kepada saya.'],
      ['lain', 'Dokumen lain', '', ''],
    ],
  };

  /** Istilah baku: [sumber, baku, catatan?]. Ditampilkan di menu Template dan dikirim ke AI. */
  const ISTILAH = {
    'id-nl': [
      ['NIK', 'Bevolkingsregistratienummer', 'PILIHAN — arsip lebih sering memakai "Burgerservicenummer" (23 berkas vs 14), tetapi itu nama nomor resmi warga Belanda (BSN)'],
      ['NIP', 'Personeelsnummer'],
      ['Provinsi', 'Provincie'],
      ['Kabupaten', 'Regentschap'],
      ['Kota', 'Stad'],
      ['Kecamatan', 'District', 'PILIHAN — di arsip "District" dan "Subdistrict" dipakai bergantian'],
      ['Kelurahan', 'Wijk', 'PILIHAN — di arsip juga "Subdistrict" dan "Dorp"'],
      ['Desa', 'Dorp'],
      ['RT/RW', 'RT/RW (tidak diterjemahkan)'],
      ['Dinas Kependudukan dan Pencatatan Sipil', 'Dienst van Burgerzaken en Burgerlijke Stand'],
      ['Pejabat Pencatatan Sipil', 'Ambtenaar van de Burgerlijke Stand'],
      ['Kementerian Agama', 'Ministerie van Religieuze Zaken'],
      ['Kantor Urusan Agama (KUA)', 'Kantoor van Religieuze Zaken'],
      ['Pengadilan Agama', 'Religieuze Rechtbank'],
      ['Agama', 'Godsdienst'],
      ['Jenis kelamin', 'Geslacht: Man / Vrouw'],
      ['Kewarganegaraan: WNI', 'Nationaliteit: Indonesische'],
      ['Warga Negara Indonesia (kepala akta)', 'Indonesische Nationaliteit'],
      ['Belum kawin / belum menikah', 'Ongehuwd'],
      ['Kawin', 'Gehuwd'],
      ['Kutipan Akta Kelahiran', 'Uittreksel uit de Geboorteakte'],
      ['Kutipan Akta Perkawinan', 'Uittreksel uit de Huwelijksakte'],
      ['Kartu Keluarga', 'Gezinskaart'],
      ['Kepala Keluarga', 'Gezinshoofd'],
      ['KTP', 'Identiteitskaart'],
      ['Tempat/tanggal lahir', 'Geboorteplaats en -datum'],
      ['Pekerjaan', 'Beroep'],
      ['Alamat', 'Adres'],
      ['Berlaku hingga: SEUMUR HIDUP', 'Geldig tot: LEVENSLANG'],
      ['Tahun dengan huruf', 'satu kata: TWEEDUIZEND ZESENTWINTIG'],
      ['Ditandatangani secara elektronik (BSrE)', 'Dit document is elektronisch ondertekend met gebruikmaking van een elektronisch certificaat dat is uitgegeven door het Elektronisch Certificeringsinstituut (BSrE), BSSN', 'PILIHAN — arsip lebih sering menulis "ondergetekend" (51 vs 23); "ondertekend" adalah bentuk Belanda yang benar untuk "ditandatangani"'],
    ],
    'nl-id': [
      ['geslachtsnaam', 'Nama keluarga'],
      ['voornamen', 'Nama depan'],
      ['ambtenaar van de burgerlijke stand', 'Pejabat Pencatatan Sipil'],
      ['burgerlijke stand', 'Pencatatan Sipil'],
      ['gemeente', 'Kotamadya'],
      ['burgemeester', 'Wali Kota'],
      ['Koninkrijk der Nederlanden', 'Kerajaan Belanda'],
      ['geboorteakte', 'Akta Kelahiran'],
      ['huwelijksakte', 'Akta Perkawinan'],
      ['overlijdensakte', 'Akta Kematian'],
      ['echtscheidingsakte', 'Akta Perceraian'],
      ['uittreksel', 'Kutipan'],
      ['afschrift', 'Salinan'],
      ['Basisregistratie Personen (BRP)', 'Registrasi Dasar Penduduk (BRP)'],
      ['burgerservicenummer (BSN)', 'Nomor Identitas Warga (BSN)'],
      ['ongehuwd', 'Belum menikah', 'Arsip: "Tidak menikah" 17 berkas, "Belum menikah" 15 berkas'],
      ['gehuwd', 'Menikah'],
      ['gescheiden', 'Bercerai'],
      ['man / vrouw', 'Laki-laki / Perempuan'],
      ['nationaliteit: Nederlandse', 'Kewarganegaraan: Belanda'],
      ['datum van afgifte', 'Tanggal penerbitan'],
      ['geldig tot', 'Tanggal habis berlaku'],
      ['Staatsblad', 'Lembaran Negara'],
      ['uur en minuut van geboorte', 'Jam dan menit kelahiran'],
      ['latere vermeldingen', 'Perubahan dan catatan kemudian'],
    ],
  };

  /** Keterangan unsur bukan teks (selalu dalam kurung, huruf besar di awal). */
  const KURUNG = {
    'id-nl': ['(Logo)', '(Handtekening)', '(Stempel)', '(Stempel en handtekening)', '(Pasfoto)', '(Foto)', '(QR-code)', '(Hologram)', '(Plakzegel)', '(Paraaf)', '(Barcode)', '(Onleesbaar)', '(Andere schrifttaal)'],
    'nl-id': ['(Logo)', '(Tanda tangan)', '(Stempel)', '(Stempel dan tanda tangan)', '(Foto)', '(Kode QR)', '(Hologram)', '(Meterai)', '(Paraf)', '(Kode batang)', '(Tidak terbaca)', '(Aksara bahasa lain)'],
  };

  /** Pemeriksa: [pola, pesan]. Salah ketik berulang di arsip + varian yang bukan baku. Hanya memberi tanda "perlu dicek" — tidak pernah mengubah teks. */
  const CEK = {
    'id-nl': [
      [/burgelijke/i, 'Salah ketik "Burgelijke" → Burgerlijke'],
      [/ministrie/i, 'Salah ketik "Ministrie" → Ministerie'],
      [/twee\s+duizend/i, 'Tahun ditulis satu kata: TWEEDUIZEND (bukan "TWEE DUIZEND")'],
      [/regenschap/i, 'Salah ketik "Regenschap" → Regentschap'],
      [/huwelijkseakte/i, 'Salah ketik "Huwelijkseakte" → Huwelijksakte'],
      [/(^|\s)n de authenticiteit/i, 'Salah ketik "n de authenticiteit" → en de authenticiteit'],
      [/tweeentwintig|drieentwintig|tweeendertig|drieendertig/i, 'Trema hilang: tweeëntwintig, drieëntwintig, …'],
      [/\btext\b/i, 'Bahasa Belanda: "tekst" (bukan "text")'],
      [/elektronisch ondergetekend/i, 'Baku: "elektronisch ondertekend" (ondergetekende = yang bertanda tangan)'],
      [/burgerservicenummer/i, 'NIK baku: Bevolkingsregistratienummer — "Burgerservicenummer" (BSN) hanya untuk nomor warga Belanda'],
      [/bevolkingsregistratie nummer|bevolkingregistratiesnummer|nationaal identiteitsnummer/i, 'NIK baku: Bevolkingsregistratienummer'],
      [/personeelsnr\b|personeelsregistratie\s*nummer|\bNIP\b/, 'NIP baku: Personeelsnummer'],
      [/subdistrict|onderdistrict/i, 'Wilayah baku: Kecamatan = District, Kelurahan = Wijk, Desa = Dorp'],
      [/kantoor voor religieuze|bureau voor religieuze zaken/i, 'KUA baku: Kantoor van Religieuze Zaken'],
      [/dienst (van )?bevolking(szaken)? en burgerlijke stand/i, 'Disdukcapil baku: Dienst van Burgerzaken en Burgerlijke Stand'],
      [/\(\s*(tanda tangan|cap|stempel dan|foto dan|tidak terbaca)[^)]*\)|\bTERJEMAHAN\b/i, 'Masih ada kata bahasa Indonesia — pakai (Handtekening), (Stempel), (Onleesbaar)'],
      [/\((zegel en handtekening|handtekening en stempel|handtekening & stempel|stempel & handtekening)\)/i, 'Keterangan baku: (Stempel en handtekening)'],
      [/\((qr[ -]code|qr code)\)/, 'Keterangan baku: (QR-code)'],
    ],
    'nl-id': [
      [/\brarus\b/i, 'Salah ketik "rarus" → ratus'],
      [/kependudukkan/i, 'Salah ketik "kependudukkan" → kependudukan'],
      [/\bstatua\b/i, 'Salah ketik "Statua" → Statuta'],
      [/kuisioner/i, 'Ejaan baku: Kuesioner'],
      [/\bijin\b/i, 'Ejaan baku: izin'],
      [/nama belakang/i, 'Baku: Nama keluarga (bukan "Nama belakang")'],
      [/akta lahir\b/i, 'Baku: Akta Kelahiran (bukan "Akta Lahir")'],
      [/(petugas|pegawai) (pen)?catatan sipil|pejabat catatan sipil/i, 'Baku: Pejabat Pencatatan Sipil'],
      [/laki\s+-\s*laki|laki\s*-\s+laki/i, 'Tulis "Laki-laki" tanpa spasi'],
      [/\b(pria|wanita)\b/i, 'Baku: Laki-laki / Perempuan'],
      [/tidak menikah/i, 'Baku: Belum menikah (untuk "ongehuwd") — sesuaikan bila dokumen memang menyatakan lain'],
      [/walikota/i, 'Ejaan baku: Wali Kota'],
      [/\((tanda tangan dan stempel|ditandatangani dan distempel)\)/i, 'Keterangan baku: (Stempel dan tanda tangan)'],
      [/\((tanda tangan|stempel|foto|tidak terbaca|kode qr)\)/, 'Keterangan dalam kurung diawali huruf besar: (Tanda tangan), (Stempel), …'],
      [/\((teks|tulisan tangan|tulisan) tidak terbaca\)/i, 'Keterangan baku: (Tidak terbaca)'],
      [/handtekening|stempel en |\bVERTALING\b/i, 'Masih ada kata bahasa Belanda — pakai (Tanda tangan), (Stempel)'],
    ],
  };

  const jenis = (arah, kode) => { const r = (JENIS[arah] || []).find((x) => x[0] === kode); return r ? { kode: r[0], nama: r[1], judul: r[2], susunan: r[3] } : null; };

  /** Periksa satu teks hasil terjemahan. '' = tidak ada catatan. */
  function cek(teks, arah) {
    const t = String(teks || ''); if (!t.trim() || !CEK[arah]) return '';
    for (const [re, pesan] of CEK[arah]) if (re.test(t)) return pesan + ' — perbaiki atau tandai sudah dicek';
    return '';
  }

  /** Nama berkas mengikuti pola arsip: "IND-NED <judul> namens <nama>" / "NED-IND <judul> atas nama <nama>". */
  function namaBerkas(arah, judul, nama) {
    const A = ARAH[arah]; if (!A) return '';
    const b = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    return [A.kode, b(judul) || (arah === 'id-nl' ? 'Vertaling' : 'Terjemahan'), b(nama) ? A.sambung + ' ' + b(nama) : ''].filter(Boolean).join(' ').slice(0, 120);
  }

  /** Teks panduan untuk AI (ditambahkan server ke prompt dokumen non-reguler). kode jenis tak dikenal → panduan umum arah itu. */
  function prompt(arah, kode) {
    const A = ARAH[arah]; if (!A) return '';
    const j = jenis(arah, kode);
    const istilah = ISTILAH[arah].map((x) => x[0] + ' = ' + x[1]).join('; ');
    let t = ' ARAH TERJEMAHAN (mengalahkan kata \'bahasa Inggris\' dan contoh berbahasa Inggris di atas): ' + A.label + ' untuk SELURUH halaman. bahasa = ' + A.bahasa + '. ' +
      'en diisi terjemahan ke BAHASA ' + A.tujuan.toUpperCase() + ' yang setia, formal, dan lengkap dengan gaya penerjemah tersumpah — DILARANG menyalin teks sumber ke en, DILARANG menulis bahasa Inggris. ' +
      'judul_en = nama jenis dokumen dalam bahasa ' + A.tujuan + (j && j.judul ? ' (untuk dokumen ini: ' + j.judul + ')' : '') + '. ';
    if (arah === 'id-nl') {
      t += 'Unsur bukan teks ditulis dalam bahasa Belanda, persis salah satu dari: ' + KURUNG[arah].join(', ') + '. Bagian tak terbaca: (Onleesbaar). ' +
        'Ejaan Belanda dengan trema dan huruf lengkap (Indonesië, tweeëntwintig, Burgerlijke, Ministerie). Bulan ditulis huruf kecil di dalam kalimat (7 mei 1999). Angka yang ditulis dengan huruf diterjemahkan dengan huruf; tahun satu kata (tweeduizend zesentwintig). ' +
        'Nama orang, alamat/jalan, RT/RW, nomor, dan gelar TIDAK diterjemahkan. Nama desa/kelurahan/kecamatan/kabupaten disalin; hanya jenis wilayahnya yang diterjemahkan. Kop "KABUPATEN X" → "REGENTSCHAP X". Garis pengisi blangko (-----) dipertahankan. ';
    } else {
      t += 'Unsur bukan teks ditulis dalam bahasa Indonesia, persis salah satu dari: ' + KURUNG[arah].join(', ') + '. Bagian tak terbaca: (Tidak terbaca). ' +
        'Bahasa Indonesia baku (KBBI/EYD). Nama orang, nama jalan/alamat, nama kota Belanda (\'s-Gravenhage, Den Haag), nomor, dan gelar TIDAK diterjemahkan. Nama lembaga asing dipertahankan; padanan Indonesia boleh diberi dalam kurung. ' +
        'Tanggal mengikuti bentuk sumber (29-11-1996 tetap angka; "29 november 1996" → "29 November 1996"); tanggal yang ditulis dengan huruf diterjemahkan dengan huruf. Isian formulir yang diakhiri "--" disalin dengan "--". Teks dalam bahasa selain Belanda tidak diterjemahkan ulang: tulis (Aksara bahasa lain). ';
    }
    t += 'ISTILAH BAKU (wajib dipakai, konsisten di seluruh dokumen): ' + istilah + '. ';
    if (j && j.susunan) t += 'JENIS DOKUMEN: ' + j.nama + '. ' + j.susunan + ' ';
    return t;
  }

  G.NLCORE = { VERSI, ARAH, JENIS, ISTILAH, KURUNG, jenis, cek, namaBerkas, prompt };
})(typeof globalThis !== 'undefined' ? globalThis : this);
