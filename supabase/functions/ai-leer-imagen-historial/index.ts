import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Content-Type': 'application/json' };

const INSTRUCTIONS = `Sos un asistente que transcribe información de imágenes para el historial de costos de una agencia de eventos (Matilda).
La imagen puede ser una foto de un recibo, una nota escrita a mano, un chat, una captura de una app de transporte (Uber/Cabify/etc.), o cualquier registro de un gasto de movilización, alimentación u otro rubro.
Extraé y listá TODO dato concreto que veas: ruta u origen-destino, ciudad, monto(s) en dólares, fecha si aparece, proveedor o app usada, tramos si hay varios, y cualquier nota escrita.
Si hay varios montos o tramos en la misma imagen, listalos todos por separado.
Respondé SOLO con el texto extraído en formato de lista simple, sin comentarios tuyos ni introducciones. Si la imagen no tiene información legible o relevante, respondé exactamente: SIN_DATOS`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (!OPENAI_API_KEY) throw new Error('Falta configurar OPENAI_API_KEY en Supabase → Edge Functions → Secrets');
    const { imagen_base64, mime_type } = await req.json();
    if (!imagen_base64) throw new Error('Falta la imagen');
    const mime = mime_type || 'image/jpeg';

    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: INSTRUCTIONS,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: 'Transcribí los datos de costo/ruta de esta imagen.' },
            { type: 'input_image', image_url: `data:${mime};base64,${imagen_base64}` },
          ],
        }],
      }),
    });
    const json = await resp.json();
    if (json.error) throw new Error(json.error.message || 'Error llamando a OpenAI');

    const output = json.output || [];
    const texto = json.output_text || output.filter(it => it.type === 'message')
      .flatMap(it => (it.content || []).filter(c => c.type === 'output_text').map(c => c.text))
      .join('\n');

    return new Response(JSON.stringify({ texto: (texto || '').trim() || 'SIN_DATOS' }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500, headers: CORS });
  }
});
