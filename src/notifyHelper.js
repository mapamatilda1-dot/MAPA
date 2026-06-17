// Helper para llamar edge functions de notificación
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function callEdgeFunction(name, body) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
      body: JSON.stringify(body),
    });
  } catch(e) {
    console.warn(`notify ${name} failed:`, e);
  }
}

export const notifyBriefNuevo       = (brief)            => callEdgeFunction('notify-brief-nuevo',           { brief });
export const notifyPropuestaNueva   = (propuesta)        => callEdgeFunction('notify-propuesta-nueva',       { propuesta });
export const notifyPresupuestoAprobado = (ppto)          => callEdgeFunction('notify-presupuesto-aprobado',  { ppto });
export const notifyPresupuestoCerrado  = (ppto)          => callEdgeFunction('notify-presupuesto-cerrado',   { ppto });
export const notifyLiquidacion      = (liq)              => callEdgeFunction('notify-liquidacion',            { liq });
export const notifySolicitudAprobada = (solicitud, solicitanteEmail) => callEdgeFunction('notify-solicitud-aprobada', { solicitud, solicitanteEmail });
