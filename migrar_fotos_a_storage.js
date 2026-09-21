// ============================================================
// MIGRACIÓN ÚNICA: convierte las fotos guardadas como base64
// (dentro de presupuestos.items y liquidaciones.gastos/comprobante)
// en archivos reales del bucket "fotos-referencia", y reemplaza
// el texto base64 por el link corto al archivo.
//
// Correr UNA SOLA VEZ, localmente, con Node.js instalado:
//   1) npm install @supabase/supabase-js
//   2) Completar SUPABASE_URL y SERVICE_ROLE_KEY abajo
//   3) node migrar_fotos_a_storage.js
//
// Es seguro volver a correrlo si se corta a la mitad: las fotos
// que ya sean un link (no empiecen con "data:") se saltan solas.
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://csuroawwfusvarqtqysv.supabase.co';
const SERVICE_ROLE_KEY = 'PEGÁ_ACÁ_TU_SERVICE_ROLE_KEY'; // Supabase → Settings → API → service_role (secreta, no la anon)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const BUCKET = 'fotos-referencia';

function esBase64(s) {
  return typeof s === 'string' && s.startsWith('data:');
}

async function subirBase64(dataUri, nombreSugerido) {
  const match = dataUri.match(/^data:(.+?);base64,(.*)$/);
  if (!match) return null;
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const ext = (mime.split('/')[1] || 'jpg').replace(/[^a-zA-Z0-9]/g, '');
  const nombreArchivo = `migrado_${Date.now()}_${Math.random().toString(36).slice(2,8)}_${nombreSugerido}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const { error } = await supabase.storage.from(BUCKET).upload(nombreArchivo, buffer, { contentType: mime });
  if (error) { console.error('  ✗ Error subiendo:', error.message); return null; }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(nombreArchivo);
  return data.publicUrl;
}

async function migrarPresupuestos() {
  console.log('\n=== Migrando fotos en PRESUPUESTOS ===');
  const { data: pptos, error } = await supabase.from('presupuestos').select('id, nombre, items');
  if (error) { console.error('Error leyendo presupuestos:', error.message); return; }
  let totalFotos = 0, totalPptosModificados = 0;

  for (const p of pptos) {
    if (!Array.isArray(p.items)) continue;
    let modificado = false;
    for (const it of p.items) {
      if (esBase64(it.foto_referencia)) {
        const url = await subirBase64(it.foto_referencia, it.item || 'item');
        if (url) { it.foto_referencia = url; modificado = true; totalFotos++; }
      }
    }
    if (Array.isArray(p.opciones_adicionales)) {
      for (const op of p.opciones_adicionales) {
        if (!Array.isArray(op.items)) continue;
        for (const it of op.items) {
          if (esBase64(it.imagen_url)) {
            const url = await subirBase64(it.imagen_url, it.item || 'opcion');
            if (url) { it.imagen_url = url; modificado = true; totalFotos++; }
          }
        }
      }
    }
    if (modificado) {
      const { error: errUpd } = await supabase.from('presupuestos').update({ items: p.items, opciones_adicionales: p.opciones_adicionales }).eq('id', p.id);
      if (errUpd) console.error(`  ✗ Error guardando presupuesto ${p.nombre}:`, errUpd.message);
      else { totalPptosModificados++; console.log(`  ✓ ${p.nombre || p.id}`); }
    }
  }
  console.log(`Presupuestos: ${totalFotos} foto(s) migradas en ${totalPptosModificados} presupuesto(s).`);
}

async function migrarLiquidaciones() {
  console.log('\n=== Migrando fotos en LIQUIDACIONES ===');
  const { data: liqs, error } = await supabase.from('liquidaciones').select('id, evento, gastos, comprobante_url');
  if (error) { console.error('Error leyendo liquidaciones:', error.message); return; }
  let totalFotos = 0, totalLiqsModificadas = 0;

  for (const l of liqs) {
    let modificado = false;
    const payload = {};

    if (esBase64(l.comprobante_url)) {
      const url = await subirBase64(l.comprobante_url, 'comprobante');
      if (url) { payload.comprobante_url = url; modificado = true; totalFotos++; }
    }
    if (Array.isArray(l.gastos)) {
      for (const g of l.gastos) {
        if (esBase64(g.foto_nota)) {
          const url = await subirBase64(g.foto_nota, g.concepto || 'nota');
          if (url) { g.foto_nota = url; modificado = true; totalFotos++; }
        }
      }
      if (modificado) payload.gastos = l.gastos;
    }

    if (modificado) {
      const { error: errUpd } = await supabase.from('liquidaciones').update(payload).eq('id', l.id);
      if (errUpd) console.error(`  ✗ Error guardando liquidación ${l.evento}:`, errUpd.message);
      else { totalLiqsModificadas++; console.log(`  ✓ ${l.evento || l.id}`); }
    }
  }
  console.log(`Liquidaciones: ${totalFotos} foto(s) migradas en ${totalLiqsModificadas} liquidación(es).`);
}

(async () => {
  console.log('Iniciando migración de fotos base64 → Storage...');
  await migrarPresupuestos();
  await migrarLiquidaciones();
  console.log('\n✅ Listo. Ya podés verificar en la app que las fotos se sigan viendo bien.');
})();
