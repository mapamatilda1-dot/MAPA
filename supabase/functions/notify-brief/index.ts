import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SMTP_HOST     = Deno.env.get('SMTP_HOST')!;
const SMTP_PORT     = parseInt(Deno.env.get('SMTP_PORT') || '465');
const SMTP_USER     = Deno.env.get('SMTP_USER')!;
const SMTP_PASS     = Deno.env.get('SMTP_PASS')!;
const APP_URL       = 'https://subtle-platypus-1041ce.netlify.app';
const BRIEF_EMAILS  = ['camille@matilda.agency', 'mariajose@matilda.agency', 'wendy@matilda.agency'];

async function sendEmail(to: string[], subject: string, html: string) {
  const boundary = '----=_Part_' + Math.random().toString(36).slice(2);
  const message = [
    `From: Matilda Hub <${SMTP_USER}>`,
    `To: ${to.join(', ')}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    html,
    `--${boundary}--`,
  ].join('\r\n');

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const conn = await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT });

  async function read() { const b = new Uint8Array(4096); const n = await conn.read(b); return decoder.decode(b.subarray(0,n!)); }
  async function write(s: string) { await conn.write(encoder.encode(s + '\r\n')); }

  await read();
  await write(`EHLO matilda.agency`); await read();
  await write('AUTH LOGIN'); await read();
  await write(btoa(SMTP_USER)); await read();
  await write(btoa(SMTP_PASS)); await read();
  await write(`MAIL FROM:<${SMTP_USER}>`); await read();
  for (const addr of to) { await write(`RCPT TO:<${addr}>`); await read(); }
  await write('DATA'); await read();
  await write(message + '\r\n.'); await read();
  await write('QUIT');
  conn.close();
}

serve(async (req) => {
  try {
    const { record, old_record } = await req.json();

    // Solo disparar en INSERT (nuevo brief)
    if (old_record) return new Response(JSON.stringify({ ok:true, skipped:'update' }), { status:200 });
    if (!record) return new Response(JSON.stringify({ ok:true, skipped:'no record' }), { status:200 });

    const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;}
.container{max-width:600px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);}
.header{background:#0d3b5e;padding:24px 32px;}.header h1{color:#fff;margin:0;font-size:18px;}
.header p{color:rgba(255,255,255,.7);margin:4px 0 0;font-size:12px;}
.body{padding:24px 32px;}.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;}
.label{color:#888;}.value{font-weight:600;color:#0d3b5e;}
.btn{display:inline-block;background:#0d3b5e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin-top:16px;}
.footer{background:#f8f9fa;padding:14px 32px;font-size:12px;color:#aaa;text-align:center;}</style>
</head><body><div class="container">
<div class="header"><h1>📋 Nuevo Brief: ${record.nombre}</h1><p>Matilda Hub · Notificación automática</p></div>
<div class="body">
<div class="row"><span class="label">Proyecto</span><span class="value">${record.nombre}</span></div>
<div class="row"><span class="label">Cliente</span><span class="value">${record.cliente_nombre || '—'}</span></div>
<div class="row"><span class="label">Descripción</span><span class="value">${record.descripcion || '—'}</span></div>
<div class="row"><span class="label">Fecha de entrega</span><span class="value">${record.fecha_entrega || '—'}</span></div>
<div class="row"><span class="label">Responsable</span><span class="value">${record.responsable || '—'}</span></div>
<div class="row"><span class="label">Creado por</span><span class="value">${record.created_by || '—'}</span></div>
<a href="${APP_URL}" class="btn">Ver en Matilda Hub →</a>
</div>
<div class="footer">Matilda Event Designers · Sistema Matilda Hub</div>
</div></body></html>`;

    await sendEmail(BRIEF_EMAILS, `📋 Nuevo Brief: ${record.nombre}`, html);
    return new Response(JSON.stringify({ ok:true, sent:true }), { status:200 });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ ok:false, error: String(err) }), { status:500 });
  }
});
