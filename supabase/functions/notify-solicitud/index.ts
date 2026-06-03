import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SMTP_HOST = Deno.env.get('SMTP_HOST')!;
const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465');
const SMTP_USER = Deno.env.get('SMTP_USER')!;
const SMTP_PASS = Deno.env.get('SMTP_PASS')!;
const APP_URL   = 'https://subtle-platypus-1041ce.netlify.app';
const DESTINOS  = ['melanie@matilda.agency', 'mariajose@matilda.agency', 'taylor@matilda.agency', 'johanna@matilda.agency'];

function fmt(n: number) {
  return '$' + (n||0).toLocaleString('es-EC', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function fmtDate(s: string) {
  if (!s) return '—';
  const [y,m,d] = s.split('-');
  return `${d}/${m}/${y}`;
}

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
  }
  try {
    const text = await req.text();
    if (!text || text.trim() === '') {
      return new Response(JSON.stringify({ ok:false, error:'empty body' }), { status:400 });
    }
    const { solicitud, userEmail, userName } = JSON.parse(text);
    if (!solicitud) return new Response(JSON.stringify({ ok:false, error:'no solicitud' }), { status:400 });

    const items = solicitud.items || [];
    const totalSolicitado    = items.reduce((a: number, it: any) => a + Number(it.valor_solicitado||0), 0);
    const totalPresupuestado = items.reduce((a: number, it: any) => a + Number(it.costo_presupuestado||0), 0);
    const saldo = totalPresupuestado - totalSolicitado;

    const itemsHtml = items.map((it: any) => `
      <tr>
        <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#888;">${it.subcategoria||'—'}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;font-weight:500;">${it.item||'—'}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:12px;">${fmt(it.costo_presupuestado)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:700;color:#0d3b5e;">${fmt(it.valor_solicitado)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:12px;color:${Number(it.costo_presupuestado||0)-Number(it.valor_solicitado||0)>=0?'#2e8b4e':'#dc2626'};font-weight:600;">${fmt(Number(it.costo_presupuestado||0)-Number(it.valor_solicitado||0))}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#888;">${it.notas||'—'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;}
.container{max-width:700px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);}
.header{background:#0d3b5e;padding:24px 32px;}.header h1{color:#fff;margin:0;font-size:18px;}
.header p{color:rgba(255,255,255,.7);margin:4px 0 0;font-size:12px;}
.body{padding:24px 32px;}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;}
.info-box{background:#f8fafc;border-radius:8px;padding:10px 14px;}
.info-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;}
.info-value{font-size:13px;font-weight:600;color:#0d3b5e;}
table{width:100%;border-collapse:collapse;}
thead tr{background:#f0f4f8;}
th{padding:8px 10px;text-align:left;font-size:11px;color:#666;font-weight:700;}
.totales{background:#0d3b5e;border-radius:10px;padding:14px 18px;margin:16px 0;display:flex;gap:24px;flex-wrap:wrap;}
.tot-label{font-size:10px;color:rgba(255,255,255,.6);margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em;}
.tot-value{font-size:16px;font-weight:700;color:#fff;}
.btn{display:inline-block;background:#0d3b5e;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin-top:16px;}
.footer{background:#f8f9fa;padding:14px 32px;font-size:12px;color:#aaa;text-align:center;}</style>
</head><body><div class="container">
<div class="header">
  <h1>📤 Solicitud de valores: ${solicitud.presupuesto_nombre}</h1>
  <p>Matilda Hub · Solicitud enviada por ${userName || userEmail}</p>
</div>
<div class="body">
  <div class="info-grid">
    <div class="info-box"><div class="info-label">Presupuesto</div><div class="info-value">${solicitud.presupuesto_nombre||'—'}</div></div>
    <div class="info-box"><div class="info-label">Cliente</div><div class="info-value">${solicitud.cliente_nombre||'—'}</div></div>
    <div class="info-box"><div class="info-label">Fecha evento</div><div class="info-value">${solicitud.fecha_evento?fmtDate(solicitud.fecha_evento):'—'}</div></div>
    <div class="info-box"><div class="info-label">Solicitado por</div><div class="info-value">${userName||userEmail}</div></div>
  </div>

  <table>
    <thead><tr>
      <th>Subcategoría</th><th>Ítem</th>
      <th style="text-align:right">Costo ppto.</th>
      <th style="text-align:right">Valor solicitado</th>
      <th style="text-align:right">Saldo</th>
      <th>Notas</th>
    </tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="totales">
    <div><div class="tot-label">Costo presupuestado</div><div class="tot-value">${fmt(totalPresupuestado)}</div></div>
    <div><div class="tot-label">Valor solicitado</div><div class="tot-value" style="color:#3dbfb8">${fmt(totalSolicitado)}</div></div>
    <div><div class="tot-label">Saldo</div><div class="tot-value" style="color:${saldo>=0?'#5dc98a':'#ff6b6b'}">${fmt(saldo)}</div></div>
  </div>

  ${solicitud.notas ? `<div style="background:#f8fafc;border-left:3px solid #0d3b5e;padding:10px 14px;border-radius:0 8px 8px 0;font-size:13px;color:#555;margin-top:12px;">${solicitud.notas}</div>` : ''}

  <a href="${APP_URL}" class="btn">Ver en Matilda Hub →</a>
</div>
<div class="footer">Matilda Event Designers · Sistema Matilda Hub</div>
</div></body></html>`;

    await sendEmail(DESTINOS, `📤 Solicitud de valores: ${solicitud.presupuesto_nombre}`, html);
    return new Response(JSON.stringify({ ok:true, sent:true }), { status:200 });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ ok:false, error: String(err) }), { status:500 });
  }
});
