-- ============================================================
-- FOTOS DE REFERENCIA — bucket para subir las fotos de los ítems
-- como archivos reales en vez de texto base64 dentro de la fila
-- del presupuesto. Esto reduce muchísimo el tamaño de cada
-- presupuesto y acelera la carga de la lista.
-- Correr en Supabase → SQL Editor
-- ============================================================

insert into storage.buckets (id, name, public)
values ('fotos-referencia', 'fotos-referencia', true)
on conflict (id) do update set public = true;

drop policy if exists "fotos_ref_upload_autenticados" on storage.objects;
create policy "fotos_ref_upload_autenticados"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'fotos-referencia');

drop policy if exists "fotos_ref_leer_publico" on storage.objects;
create policy "fotos_ref_leer_publico"
  on storage.objects for select
  to public
  using (bucket_id = 'fotos-referencia');
