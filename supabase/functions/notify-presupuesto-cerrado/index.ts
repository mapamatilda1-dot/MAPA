import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.zoho.com';
const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465');
const SMTP_USER = Deno.env.get('SMTP_USER') || 'camille@matilda.agency';
const SMTP_PASS = Deno.env.get('SMTP_PASS') || '';
const DESTINOS  = ['mariajose@matilda.agency','melanie@matilda.agency','johanna@matilda.agency'];

async function sendEmail(to: string[], subject: string, html: string) {
  if (!SMTP_PASS) throw new Error('Falta configurar el secret SMTP_PASS en Supabase (Edge Functions → Secrets)');
  const msg = [`From: Matilda Hub <${SMTP_USER}>`,`To: ${to.join(', ')}`,`Subject: ${subject}`,`MIME-Version: 1.0`,`Content-Type: text/html; charset=UTF-8`,``,html].join('\r\n');
  const conn = await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT });
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const readBuf = new Uint8Array(4096);

  // Lee la respuesta COMPLETA de un comando SMTP, que puede venir en varias
  // líneas (ej: el saludo EHLO). Sigue leyendo hasta encontrar la línea final
  // (código de 3 dígitos seguido de espacio, no guion).
  async function readResponse(): Promise<string> {
    let full = '';
    for (let i = 0; i < 25; i++) {
      const n = await conn.read(readBuf);
      if (!n) break;
      full += dec.decode(readBuf.subarray(0, n));
      const lines = full.split('\r\n').filter(l => l.length > 0);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3} /.test(last) || /^\d{3}$/.test(last)) break;
    }
    return full;
  }

  const write = async (s: string) => { await conn.write(enc.encode(s + '\r\n')); };
  const b64 = (s: string) => btoa(s);
  const log: string[] = [];
  async function step(label: string, cmd?: string, expect?: string) {
    if (cmd !== undefined) await write(cmd);
    const resp = await readResponse();
    log.push(`${label} -> ${resp.trim().replace(/\r?\n/g, ' | ')}`);
    if (expect && !resp.startsWith(expect)) {
      conn.close();
      throw new Error(`Falló en "${label}" (se esperaba ${expect}xx). Detalle SMTP: ` + log.join(' || '));
    }
    return resp;
  }
  await step('greeting');
  await step('EHLO', 'EHLO matilda.agency', '250');
  await step('AUTH LOGIN', 'AUTH LOGIN', '334');
  await step('usuario', b64(SMTP_USER), '334');
  await step('password', b64(SMTP_PASS), '235');
  await step('MAIL FROM', `MAIL FROM:<${SMTP_USER}>`, '250');
  for (const t of to) { await step('RCPT TO ' + t, `RCPT TO:<${t}>`, '250'); }
  await step('DATA', 'DATA', '354');
  await step('envío del mensaje', msg + '\r\n.', '250');
  await write('QUIT');
  conn.close();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
  try {
    const text = await req.text();
    const { ppto } = JSON.parse(text);
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0d3b5e;padding:20px;text-align:center;"><span style="color:#fff;font-size:20px;font-weight:700;">Matilda Hub</span></div>
      <div style="padding:24px;background:#f8fafc;border-left:4px solid #555;">
        <h2 style="color:#555;margin:0 0 12px;">🔒 Presupuesto cerrado por producción</h2>
        <p style="color:#333;"><strong>${ppto.nombre || ppto.cliente || 'Sin nombre'}</strong></p>
        <p style="color:#666;">Cliente: ${ppto.cliente || '—'}</p>
        <p style="color:#666;">Código: ${ppto.nomenclatura || '—'}</p>
        <a href="https://mapa-zeta.vercel.app" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#0d3b5e;color:#fff;text-decoration:none;border-radius:6px;">Ver en Matilda Hub</a>
      </div>
      <div style="background:#0d3b5e;padding:10px;text-align:center;"><span style="color:#3dbfb8;font-size:11px;font-style:italic;">"Donde la estrategia se convierte en experiencia."</span></div>
    </div>`;
    await sendEmail(DESTINOS, `🔒 Presupuesto cerrado por producción: ${ppto.nombre || ppto.cliente || ''}`, html);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch(e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
});
