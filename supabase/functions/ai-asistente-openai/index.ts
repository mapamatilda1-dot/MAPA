import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1'; // cambiar acá si querés probar otro modelo
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Content-Type': 'application/json' };

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// ── Definición de herramientas (formato "flat" de la Responses API) ──
const TOOLS = [
  {
    type: 'function',
    name: 'buscar_proyectos',
    description: 'Busca proyectos/briefs por nombre de evento o cliente. Devuelve estado, fechas, responsable.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'palabra clave: nombre del proyecto o cliente' } }, required: ['query'] },
  },
  {
    type: 'function',
    name: 'buscar_propuestas_creativas',
    description: 'Busca propuestas creativas por proyecto o cliente. Devuelve el link de Canva y el estado (borrador/enviada/aprobada). Usar cuando pidan el link o la propuesta de un proyecto.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'palabra clave: nombre del proyecto o cliente' } }, required: ['query'] },
  },
  {
    type: 'function',
    name: 'buscar_presupuestos',
    description: 'Busca presupuestos por nombre, cliente o número (nomenclatura). Devuelve estado, fecha del evento y cantidad de ítems.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'palabra clave: nombre del presupuesto, cliente o número' } }, required: ['query'] },
  },
  {
    type: 'function',
    name: 'buscar_items_cotizados',
    description: 'Busca ítems específicos dentro de presupuestos por palabra clave (ej: "modelo", "DJ", "catering", "tarima") para saber qué precio se le cotizó/cobró al cliente por ese ítem en distintos proyectos. Devuelve precio unitario, cantidad, presupuesto y cliente.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'palabra clave del ítem a buscar' } }, required: ['query'] },
  },
  {
    type: 'function',
    name: 'buscar_gastos_historicos',
    description: 'Busca en el historial de gastos reales de liquidaciones (incluye el detalle escrito a mano por productores — rutas y tramos de movilización/carreras, desgloses de alimentación, etc.) por palabra clave. Útil para estimar cuánto debería costar algo según el historial. Devuelve evento, fecha, categoría, total y el detalle escrito.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'palabra clave: ej. una ruta, un proveedor, un tipo de gasto' } }, required: ['query'] },
  },
];

function norm(s) { return (s || '').toString().toLowerCase(); }

async function ejecutarTool(name, input) {
  const q = norm(input?.query).trim();
  if (!q) return { error: 'Falta la palabra clave de búsqueda' };
  const qLike = `%${q.replace(/[%,]/g, ' ')}%`;

  if (name === 'buscar_proyectos') {
    const { data } = await supabase.from('briefs')
      .select('nombre,cliente_nombre,estado,fecha_evento,fecha_entrega,responsable')
      .or(`nombre.ilike.${qLike},cliente_nombre.ilike.${qLike}`)
      .limit(15);
    return data || [];
  }

  if (name === 'buscar_propuestas_creativas') {
    const { data } = await supabase.from('propuestas')
      .select('titulo,cliente_nombre,canva_url,estado')
      .or(`titulo.ilike.${qLike},cliente_nombre.ilike.${qLike}`)
      .limit(15);
    return data || [];
  }

  if (name === 'buscar_presupuestos') {
    const { data } = await supabase.from('presupuestos')
      .select('nombre,cliente,nomenclatura,estado,fecha_evento,items')
      .or(`nombre.ilike.${qLike},cliente.ilike.${qLike},nomenclatura.ilike.${qLike}`)
      .order('created_at', { ascending: false })
      .limit(15);
    return (data || []).map(p => ({
      nombre: p.nombre, cliente: p.cliente, nomenclatura: p.nomenclatura,
      estado: p.estado, fecha_evento: p.fecha_evento, cantidad_items: (p.items || []).filter(it => it._type !== 'subcat').length,
    }));
  }

  if (name === 'buscar_items_cotizados') {
    const { data } = await supabase.from('presupuestos')
      .select('nombre,cliente,fecha_evento,items')
      .order('created_at', { ascending: false })
      .limit(400);
    const resultados = [];
    (data || []).forEach(p => {
      (p.items || []).forEach(it => {
        if (it._type === 'subcat') return;
        const texto = norm(`${it.item || ''} ${it.detalle || ''}`);
        if (texto.includes(q)) {
          resultados.push({
            item: it.item, detalle: it.detalle, precio_unitario: it.precio_unit,
            cantidad: it.cantidad, dias: it.dias,
            presupuesto: p.nombre, cliente: p.cliente, fecha_evento: p.fecha_evento,
          });
        }
      });
    });
    return resultados.slice(0, 30);
  }

  if (name === 'buscar_gastos_historicos') {
    const { data } = await supabase.from('liquidaciones')
      .select('evento,created_at,gastos')
      .order('created_at', { ascending: false })
      .limit(400);
    const resultados = [];
    (data || []).forEach(l => {
      (l.gastos || []).forEach(g => {
        const texto = norm(`${g.concepto || ''} ${g.notas || ''} ${g.categoria || ''} ${g.nombre_proveedor || ''}`);
        if (texto.includes(q)) {
          resultados.push({
            evento: l.evento, fecha: l.created_at ? l.created_at.slice(0, 10) : '',
            concepto: g.concepto, categoria: g.categoria, total: g.total, detalle: g.notas || '',
          });
        }
      });
    });
    return resultados.slice(0, 40);
  }

  return { error: 'Herramienta no reconocida: ' + name };
}

const INSTRUCTIONS = `Sos el asistente interno de Matilda Hub, el sistema de gestión de Matilda Event Designers (agencia de eventos en Ecuador).
Respondés preguntas del equipo sobre proyectos, propuestas creativas (y sus links de Canva), presupuestos, ítems cotizados a clientes, y gastos históricos reales (incluyendo movilización/carreras entre ciudades, alimentación, etc., registrados como texto libre por los productores en el detalle de cada gasto).

Reglas:
- Usá las herramientas para buscar información real ANTES de responder. Nunca inventes datos, montos ni links.
- Si una búsqueda no encuentra nada, probá de nuevo con otra palabra clave relacionada (sinónimo, nombre parcial, sin tildes) antes de decir que no hay información.
- Si te preguntan cuánto debería costar algo (ej. una carrera/ruta) basándote en el historial, buscá casos similares con buscar_gastos_historicos, calculá un promedio o rango aproximado, y aclará que es una estimación basada en el historial (citá 2-3 ejemplos concretos con fecha y monto que la respalden).
- Si te piden un link (de Canva, etc.), dalo completo y clickeable tal cual lo encontraste.
- Si te preguntan cuánto se le cobró/cotizó a un cliente por algo, usá buscar_items_cotizados y citá el presupuesto y precio exacto.
- Respondé en español, directo y conciso. Sin relleno ni disculpas innecesarias.
- Si después de buscar con varias palabras clave no encontrás nada relevante, decilo claramente en vez de inventar.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (!OPENAI_API_KEY) throw new Error('Falta configurar OPENAI_API_KEY en Supabase → Edge Functions → Secrets');
    const { pregunta, historial } = await req.json();
    if (!pregunta || !pregunta.trim()) throw new Error('Falta la pregunta');

    // input_list en formato Responses API: mensajes simples de usuario/asistente
    let inputList = [
      ...(Array.isArray(historial) ? historial.map(h => ({ role: h.role, content: h.text })) : []),
      { role: 'user', content: pregunta },
    ];

    let finalText = '';
    for (let i = 0; i < 6; i++) {
      const resp = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: OPENAI_MODEL, instructions: INSTRUCTIONS, input: inputList, tools: TOOLS }),
      });
      const json = await resp.json();
      if (json.error) throw new Error(json.error.message || 'Error llamando a OpenAI');

      const output = json.output || [];
      const functionCalls = output.filter((it) => it.type === 'function_call');

      if (functionCalls.length === 0) {
        finalText = json.output_text || output.filter(it => it.type === 'message')
          .flatMap(it => (it.content || []).filter(c => c.type === 'output_text').map(c => c.text))
          .join('\n');
        break;
      }

      inputList = inputList.concat(output);
      for (const fc of functionCalls) {
        let args = {};
        try { args = JSON.parse(fc.arguments || '{}'); } catch (_e) { /* ignore */ }
        let resultado;
        try { resultado = await ejecutarTool(fc.name, args); }
        catch (e) { resultado = { error: String(e.message || e) }; }
        inputList.push({ type: 'function_call_output', call_id: fc.call_id, output: JSON.stringify(resultado) });
      }
    }

    if (!finalText) finalText = 'No pude generar una respuesta clara — probá reformular la pregunta con otras palabras.';

    return new Response(JSON.stringify({ respuesta: finalText }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500, headers: CORS });
  }
});
