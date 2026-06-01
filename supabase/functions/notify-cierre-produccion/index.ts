import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SMTP_HOST = Deno.env.get('SMTP_HOST')!;
const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465');
const SMTP_USER = Deno.env.get('SMTP_USER')!;
const SMTP_PASS = Deno.env.get('SMTP_PASS')!;
const APP_URL   = 'https://mapa-zeta.vercel.app';
const DESTINOS  = ['mariajose@matilda.agency', 'taylor@matilda.agency', 'johanna@matilda.agency'];

function fmt(n: number) {
  return '$' + (n||0).toLocaleString('es-EC', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function calcTotales(ppto: any) {
  const items = (ppto.items || []).filter((it: any) => !it._type);
  let subtotalPrecio = 0, subtotalCostoReal = 0, subtotalCosto = 0;
  for (const it of items) {
    const qty  = Number(it.cantidad || 0);
    const dias = Number(it.dias     || 1);
    subtotalPrecio    += qty * dias * Number(it.precio_unit     || 0);
    subtotalCosto     += qty * dias * Number(it.costo_unit      || 0) * (1 + Number(it.bco_pct || 0) / 100);
    subtotalCostoReal += qty * dias * Number(it.costo_real_unit || it.costo_unit || 0) * (1 + Number(it.bco_real_pct || it.bco_pct || 0) / 100);
  }
  const ohReal   = subtotalCostoReal * (ppto.oh_pct / 100);
  const totalCostoReal = subtotalCostoReal + ohReal;
  const fee      = subtotalPrecio * (ppto.fee_agencia / 100);
  const sinIva   = subtotalPrecio + fee;
  const margen   = sinIva - totalCostoReal;
  const margenPct = sinIva > 0 ? (margen / sinIva) * 100 : 0;
  return { sinIva, totalCostoReal, margen, margenPct };
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
  try {
    const { record, old_record } = await req.json();
    if (!record || !old_record) return new Response(JSON.stringify({ ok:true, skipped:'no data' }), { status:200 });

    // Solo disparar cuando cerrado_produccion cambia de false a true
    if (!record.cerrado_produccion || old_record.cerrado_produccion) {
      return new Response(JSON.stringify({ ok:true, skipped:'not a cierre event' }), { status:200 });
    }

    const t = calcTotales(record);

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;}
.container{max-width:600px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);}
.header{background:#2e8b4e;padding:24px 32px;}.header h1{color:#fff;margin:0;font-size:18px;}
.header p{color:rgba(255,255,255,.7);margin:4px 0 0;font-size:12px;}
.body{padding:24px 32px;}
.msg{background:#e8f5ee;border-left:4px solid #2e8b4e;padding:12px 16px;border-radius:0 8px 8px 0;font-size:13px;color:#1a5c3a;margin-bottom:20px;line-height:1.6;}
.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;}
.label{color:#888;}.value{font-weight:600;color:#0d3b5e;}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:16px 0;}
.metric{background:#f8fafc;border-radius:8px;padding:12px 16px;text-align:center;}
.metric-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;}
.metric-value{font-size:18px;font-weight:700;color:#0d3b5e;}
.btn{display:inline-block;background:#2e8b4e;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin-top:16px;}
.footer{background:#f8f9fa;padding:14px 32px;font-size:12px;color:#aaa;text-align:center;}</style>
</head><body><div class="container">
<div class="header">
  <h1>🔒 Cierre de Producción: ${record.nombre}</h1>
  <p>Matilda Hub · Notificación automática</p>
</div>
<div class="body">
<div class="msg">
  Por favor proceder a revisar los valores del presupuesto <strong>${record.nombre}</strong>.<br>
  El costo real fue de <strong>${fmt(t.totalCostoReal)}</strong>, dejando un margen de <strong>${fmt(t.margen)}</strong> y una rentabilidad de <strong>${t.margenPct.toFixed(1)}%</strong>.
</div>
<div class="row"><span class="label">Presupuesto</span><span class="value">${record.nombre || '—'}</span></div>
<div class="row"><span class="label">Cliente</span><span class="value">${record.cliente || '—'}</span></div>
<div class="row"><span class="label">Código</span><span class="value">${record.nomenclatura || '—'}</span></div>
<div class="row"><span class="label">Fecha evento</span><span class="value">${record.fecha_evento || '—'}</span></div>
<div class="grid">
  <div class="metric"><div class="metric-label">Total s/IVA</div><div class="metric-value">${fmt(t.sinIva)}</div></div>
  <div class="metric"><div class="metric-label">Costo real</div><div class="metric-value">${fmt(t.totalCostoReal)}</div></div>
  <div class="metric"><div class="metric-label">Margen real</div><div class="metric-value" style="color:${t.margenPct>=20?'#2e8b4e':'#c8264a'}">${t.margenPct.toFixed(1)}%</div></div>
</div>
<a href="${APP_URL}" class="btn">Ver en Matilda Hub →</a>
</div>
<div class="footer">Matilda Event Designers · Sistema Matilda Hub</div>
</div></body></html>`;

    await sendEmail(DESTINOS, `🔒 Cierre Producción: ${record.nombre}`, html);
    return new Response(JSON.stringify({ ok:true, sent:true }), { status:200 });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ ok:false, error: String(err) }), { status:500 });
  }
});
