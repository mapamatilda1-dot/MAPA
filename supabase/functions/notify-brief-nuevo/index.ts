import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ZOHO_USER = Deno.env.get('ZOHO_USER') || 'camille@matilda.agency';
const ZOHO_PASS = Deno.env.get('ZOHO_PASS') || '';
const DESTINOS  = ['camille@matilda.agency','mariajose@matilda.agency','carlos@matilda.agency','wendy@matilda.agency','camilo@matilda.agency'];

async function sendEmail(to: string[], subject: string, html: string) {
  const msg = [`From: Matilda Hub <${ZOHO_USER}>`,`To: ${to.join(', ')}`,`Subject: ${subject}`,`MIME-Version: 1.0`,`Content-Type: text/html; charset=UTF-8`,``,html].join('\r\n');
  const conn = await Deno.connectTls({ hostname: 'smtp.zoho.com', port: 465 });
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const read = async () => dec.decode(await conn.read(new Uint8Array(1024)) || new Uint8Array());
  const write = async (s: string) => { await conn.write(enc.encode(s + '\r\n')); };
  const b64 = (s: string) => btoa(s);
  await read(); await write('EHLO matilda.agency'); await read();
  await write('AUTH LOGIN'); await read(); await write(b64(ZOHO_USER)); await read(); await write(b64(ZOHO_PASS)); await read();
  await write(`MAIL FROM:<${ZOHO_USER}>`); await read();
  for (const t of to) { await write(`RCPT TO:<${t}>`); await read(); }
  await write('DATA'); await read(); await write(msg + '\r\n.'); await read(); await write('QUIT'); conn.close();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
  try {
    const text = await req.text();
    const { brief } = JSON.parse(text);
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0d3b5e;padding:20px;text-align:center;"><span style="color:#fff;font-size:20px;font-weight:700;">Matilda Hub</span></div>
      <div style="padding:24px;background:#f8fafc;border-left:4px solid #0d3b5e;">
        <h2 style="color:#0d3b5e;margin:0 0 12px;">📋 Nuevo Brief</h2>
        <p style="color:#333;"><strong>${brief.nombre || 'Sin nombre'}</strong></p>
        <p style="color:#666;">Cliente: ${brief.cliente_nombre || '—'}</p>
        <p style="color:#666;">Creado por: ${brief.creado_por || '—'}</p>
        <p style="color:#666;">Estado: ${brief.estado || 'Nuevo'}</p>
        <a href="https://mapa-zeta.vercel.app" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#0d3b5e;color:#fff;text-decoration:none;border-radius:6px;">Ver en Matilda Hub</a>
      </div>
      <div style="background:#0d3b5e;padding:10px;text-align:center;"><span style="color:#3dbfb8;font-size:11px;font-style:italic;">"Donde la estrategia se convierte en experiencia."</span></div>
    </div>`;
    await sendEmail(DESTINOS, `📋 Nuevo Brief: ${brief.nombre || 'Sin nombre'}`, html);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch(e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
});
