-- 20 Nov 2026 — Email notifikasi tugas ke penerjemah (fungsi server `notif-email`, dikirim lewat Resend).
-- BELUM DITERAPKAN sampai pemilik bilang "live kan".

-- 1) Log pengiriman (metadata saja: tanpa isi email, tanpa alamat). Juga dipakai mencegah email ganda
--    untuk pasangan project–sub–penerjemah yang sama. Tertutup: RLS aktif TANPA policy → hanya fungsi server.
create table if not exists public.notif_email_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  jenis text not null,          -- 'tugas' | 'contoh'
  oleh text not null,           -- users.id yang memicu (penyimpan project / admin pengirim contoh)
  penerima text not null,       -- users.id penerjemah
  project_id text,
  sub_id text,
  hasil text not null           -- 'ok' | 'gagal'
);
create index if not exists notif_email_log_project_idx on public.notif_email_log (project_id, jenis, hasil);
create index if not exists notif_email_log_oleh_idx on public.notif_email_log (oleh, jenis, at desc);
alter table public.notif_email_log enable row level security;
revoke all on public.notif_email_log from anon, authenticated;

-- 2) `notif_email` & `notif_email_aktif` di users.doc ikut dijaga users_kunci_jaga(): hanya Super Admin / pemegang izin
--    pengaturan.pengguna.ubah yang boleh mengubahnya (penerjemah tidak bisa mengganti alamat / menyalakan sendiri).
--    Fungsi di database sudah lebih baru dari berkas 20261120d (ada pemeriksaan proofreader_tetap), jadi daftar kuncinya
--    ditambah langsung pada definisi yang sedang berlaku — bagian lain fungsi tidak disentuh.
do $$
declare def text;
begin
  select pg_get_functiondef('public.users_kunci_jaga()'::regprocedure) into def;
  if position('''notif_email_aktif''' in def) > 0 then return; end if;            -- sudah diterapkan
  if position('''koreksi_typo'']' in def) = 0 then raise exception 'Daftar kunci users_kunci_jaga tidak seperti yang diharapkan — periksa manual'; end if;
  execute replace(def, '''koreksi_typo'']', '''koreksi_typo'',''notif_email'',''notif_email_aktif'']');
end $$;
