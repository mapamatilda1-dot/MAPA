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
    name: 'ver_items_de_presupuesto',
    description: 'Dado el nombre (o parte del nombre), cliente o número de un presupuesto puntual, devuelve TODOS sus ítems con costo interno y precio al cliente. Usar cuando la pregunta menciona un presupuesto/proyecto específico y buscar_items_cotizados no encontró el ítem por palabra clave exacta — así se puede revisar la lista completa de ese presupuesto.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'nombre, cliente o número del presupuesto' } }, required: ['query'] },
  },
  {
    type: 'function',
    name: 'buscar_items_cotizados',
    description: 'Busca ítems específicos dentro de presupuestos por palabra clave (ej: "modelo", "DJ", "catering", "tarima") para saber qué precio se le cotizó/cobró al cliente por ese ítem en distintos proyectos. Devuelve precio unitario, cantidad, presupuesto y cliente.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'palabra clave del ítem a buscar' } }, required: ['query'] },
  },
  {
    type: 'function',
    name: 'buscar_referencias_historicas',
    description: 'Busca en referencias históricas cargadas manualmente por el equipo (ej: historiales de rutas y costos de movilización/carreras que todavía no están en liquidaciones formales, tarifas de referencia, etc.) por palabra clave. Devuelve el texto completo de cada referencia que coincida.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'palabra clave: ej. una ruta, una ciudad, un tipo de referencia' } }, required: ['query'] },
  },
  {
    type: 'function',
    name: 'buscar_gastos_historicos',
    description: 'Busca en el historial de gastos reales de liquidaciones (incluye el detalle escrito a mano por productores — rutas y tramos de movilización/carreras, desgloses de alimentación, etc.) por palabra clave. Útil para estimar cuánto debería costar algo según el historial. Devuelve evento, fecha, categoría, total y el detalle escrito.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'palabra clave: ej. una ruta, un proveedor, un tipo de gasto' } }, required: ['query'] },
  },
];

function norm(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function ejecutarTool(name, input) {
  const q = norm(input?.query).trim();
  if (!q) return { error: 'Falta la palabra clave de búsqueda' };

  if (name === 'buscar_proyectos') {
    const { data } = await supabase.from('briefs')
      .select('nombre,cliente_nombre,estado,fecha_evento,fecha_entrega,responsable')
      .limit(500);
    return (data || [])
      .filter(b => norm(`${b.nombre || ''} ${b.cliente_nombre || ''}`).includes(q))
      .slice(0, 15);
  }

  if (name === 'buscar_propuestas_creativas') {
    const { data } = await supabase.from('propuestas')
      .select('titulo,cliente_nombre,canva_url,estado')
      .limit(500);
    return (data || [])
      .filter(p => norm(`${p.titulo || ''} ${p.cliente_nombre || ''}`).includes(q))
      .slice(0, 15);
  }

  if (name === 'buscar_presupuestos') {
    const { data } = await supabase.from('presupuestos')
      .select('nombre,cliente,nomenclatura,estado,fecha_evento,items')
      .order('created_at', { ascending: false })
      .limit(500);
    return (data || [])
      .filter(p => norm(`${p.nombre || ''} ${p.cliente || ''} ${p.nomenclatura || ''}`).includes(q))
      .slice(0, 15)
      .map(p => ({
        nombre: p.nombre, cliente: p.cliente, nomenclatura: p.nomenclatura,
        estado: p.estado, fecha_evento: p.fecha_evento, cantidad_items: (p.items || []).filter(it => it._type !== 'subcat').length,
      }));
  }

  if (name === 'buscar_items_cotizados') {
    const { data } = await supabase.from('presupuestos')
      .select('nombre,cliente,nomenclatura,fecha_evento,items')
      .order('created_at', { ascending: false })
      .limit(400);
    const resultados = [];
    (data || []).forEach(p => {
      (p.items || []).forEach(it => {
        if (it._type === 'subcat') return;
        const texto = norm(`${it.item || ''} ${it.detalle || ''}`);
        if (texto.includes(q)) {
          resultados.push({
            item: it.item, detalle: it.detalle,
            costo_unitario: it.costo_unit,
            precio_unitario_al_cliente: it.precio_unit,
            cantidad: it.cantidad, dias: it.dias,
            presupuesto: p.nombre, nomenclatura: p.nomenclatura, cliente: p.cliente, fecha_evento: p.fecha_evento,
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


  if (name === 'buscar_referencias_historicas') {
    const { data } = await supabase.from('referencias_ia')
      .select('titulo,categoria,contenido,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    // Devolvemos solo las LÍNEAS que coinciden dentro de cada referencia
    // (no el bloque completo) para no mandar de más y volar el límite de tokens.
    const resultados = [];
    (data || []).forEach(r => {
      const tituloCoincide = norm(r.titulo || '').includes(q) || norm(r.categoria || '').includes(q);
      const lineas = (r.contenido || '').split('\n').filter(l => norm(l).includes(q));
      if (lineas.length === 0 && !tituloCoincide) return;
      resultados.push({
        titulo: r.titulo, categoria: r.categoria,
        fecha_cargado: r.created_at ? r.created_at.slice(0, 10) : '',
        coincidencias: lineas.length > 0 ? lineas.slice(0, 40) : (tituloCoincide ? ['(coincide por título/categoría — pedí más detalle si hace falta)'] : []),
        total_lineas_en_referencia: (r.contenido || '').split('\n').length,
      });
    });
    return resultados.slice(0, 8);
  }


  if (name === 'ver_items_de_presupuesto') {
    const { data } = await supabase.from('presupuestos')
      .select('nombre,cliente,nomenclatura,estado,fecha_evento,items')
      .order('created_at', { ascending: false })
      .limit(500);
    const candidatos = (data || []).filter(p => norm(`${p.nombre || ''} ${p.cliente || ''} ${p.nomenclatura || ''}`).includes(q));
    if (candidatos.length === 0) return { error: 'No se encontró ningún presupuesto con ese nombre/cliente/número' };
    return candidatos.slice(0, 3).map(p => ({
      presupuesto: p.nombre, nomenclatura: p.nomenclatura, cliente: p.cliente, estado: p.estado, fecha_evento: p.fecha_evento,
      items: (p.items || []).filter(it => it._type !== 'subcat').map(it => ({
        item: it.item, detalle: it.detalle,
        costo_unitario: it.costo_unit, precio_unitario_al_cliente: it.precio_unit,
        cantidad: it.cantidad, dias: it.dias,
      })),
    }));
  }

  return { error: 'Herramienta no reconocida: ' + name };
}

const INSTRUCTIONS = `Sos el asistente interno de Matilda Hub, el sistema de gestión de Matilda Event Designers (agencia de eventos en Ecuador).
Respondés preguntas del equipo sobre proyectos, propuestas creativas (y sus links de Canva), presupuestos, ítems cotizados a clientes, y gastos históricos reales (incluyendo movilización/carreras entre ciudades, alimentación, etc., registrados como texto libre por los productores en el detalle de cada gasto).

Reglas:
- Usá las herramientas para buscar información real ANTES de responder. Nunca inventes datos, montos ni links.
- Si una búsqueda no encuentra nada, probá de nuevo con otra palabra clave relacionada (sinónimo, nombre parcial, sin tildes) antes de decir que no hay información.
- IMPORTANTE: buscar_gastos_historicos y buscar_referencias_historicas son DOS fuentes distintas y complementarias (liquidaciones formales vs. historial cargado aparte, como Excels o fotos subidas). Ante CUALQUIER pregunta sobre gastos, rutas, carreras, movilización, alimentación o costos históricos — sea "¿cuánto costó X?", "¿tenés algo de X?", "¿cuánto debería costar X?" o similar — buscá SIEMPRE en las dos herramientas antes de responder. Nunca digas que no hay información habiendo consultado una sola.
- Si te preguntan cuánto debería costar algo (ej. una carrera/ruta) basándote en el historial, calculá un promedio o rango aproximado a partir de lo que encontraste en ambas fuentes, y aclará que es una estimación basada en el historial (citá 2-3 ejemplos concretos con fecha y monto que la respalden).
- Si te piden un link (de Canva, etc.), dalo completo y clickeable tal cual lo encontraste.
- Distinción CLAVE: "costo", "costo unitario", "cuánto nos cuesta/pagamos" = costo_unitario (interno, lo que paga la agencia al proveedor). "Precio", "cuánto cobramos/cotizamos al cliente" = precio_unitario_al_cliente. Nunca confundas uno por el otro, y aclará cuál es cuál en tu respuesta si hay ambigüedad.
- Si te preguntan por un ítem dentro de un presupuesto específico (te dan el nombre del proyecto/presupuesto), usá primero buscar_items_cotizados con la palabra del ítem; si no aparece nada de ese presupuesto puntual, usá ver_items_de_presupuesto con el nombre del proyecto para revisar la lista COMPLETA de ítems de ese presupuesto y buscar ahí el que corresponda (puede tener un nombre distinto al que usó la persona, ej. "Modelo AAA" vs "Modelo" vs "Talento").
- PROHIBIDO ABSOLUTO: nunca inventes cifras de "prácticas del sector", "precios típicos del mercado", rangos generales, ni ningún dato que no hayas obtenido de las herramientas. Si después de buscar con varias palabras clave y revisar el presupuesto puntual (si corresponde) no encontrás el dato, decí exactamente que no está registrado en el sistema — nunca completes el vacío con una estimación de conocimiento general.
- Respondé en español, directo y conciso. Sin relleno ni disculpas innecesarias.`;

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
