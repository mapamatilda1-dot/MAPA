import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ZOHO_USER = Deno.env.get('ZOHO_USER') || 'camille@matilda.agency';
const ZOHO_PASS = Deno.env.get('ZOHO_PASS') || '';

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
    const { ppto } = JSON.parse(text);
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0d3b5e;padding:20px;text-align:center;"><span style="color:#fff;font-size:20px;font-weight:700;">Matilda Hub</span></div>
      <div style="padding:24px;background:#f8fafc;border-left:4px solid #7c3aed;">
        <h2 style="color:#7c3aed;margin:0 0 12px;">🎯 Presupuesto asignado</h2>
        <p style="color:#333;">Hola <strong>${ppto.productor_nombre||''}</strong>, se te ha asignado el siguiente presupuesto:</p>
        <div style="background:#fff;border:1px solid #e8e8e8;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:4px 0;color:#333;"><strong>${ppto.nombre||ppto.cliente||'Sin nombre'}</strong></p>
          <p style="margin:4px 0;color:#666;font-size:13px;">Código: ${ppto.nomenclatura||'—'}</p>
          <p style="margin:4px 0;color:#666;font-size:13px;">Cliente: ${ppto.cliente||'—'}</p>
          <p style="margin:4px 0;color:#666;font-size:13px;">Fecha evento: ${ppto.fecha_evento||'—'}</p>
        </div>
        <a href="https://mapa-zeta.vercel.app" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Ver en Matilda Hub</a>
      </div>
      <div style="background:#0d3b5e;padding:10px;text-align:center;"><span style="color:#3dbfb8;font-size:11px;font-style:italic;">"Donde la estrategia se convierte en experiencia."</span></div>
    </div>`;
    if (ppto.productor_email) await sendEmail([ppto.productor_email], `🎯 Presupuesto asignado: ${ppto.nombre||ppto.cliente||''}`, html);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch(e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
});
