-- 20 Nov 2026 — Persetujuan terbit konten (Marketing → Website). Berlaku untuk pengguna aplikasi; tugas terjadwal (koneksi server) tidak dibatasi.
--  * kolom persetujuan hanya boleh diubah pemegang izin marketing-website.setujui
--  * status Siap Terbit / Terjadwal / Sudah Terbit hanya untuk konten yang persetujuan.status = 'disetujui'
create or replace function public.mk_jaga_persetujuan() returns trigger language plpgsql set search_path to 'public' as $$
declare lama jsonb := case when tg_op = 'UPDATE' then old.doc else '{}'::jsonb end;
begin
  if auth.uid() is null then return new; end if; -- server / tugas terjadwal
  if (new.doc->'persetujuan') is distinct from (lama->'persetujuan') and not app_izin('marketing-website.setujui') then
    raise exception 'Tidak ada akses menyetujui konten';
  end if;
  if new.doc->>'status' in ('Siap Terbit','Terjadwal','Sudah Terbit') and (new.doc->>'status') is distinct from (lama->>'status')
     and coalesce(new.doc->'persetujuan'->>'status','') <> 'disetujui' then
    raise exception 'Konten belum disetujui — minta persetujuan dulu';
  end if;
  return new;
end $$;
drop trigger if exists mk_jaga_persetujuan on public.marketing_konten;
create trigger mk_jaga_persetujuan before insert or update on public.marketing_konten for each row execute function public.mk_jaga_persetujuan();
