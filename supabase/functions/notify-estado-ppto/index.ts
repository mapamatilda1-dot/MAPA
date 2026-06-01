import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SMTP_HOST = Deno.env.get('SMTP_HOST')!;
const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465');
const SMTP_USER = Deno.env.get('SMTP_USER')!;
const SMTP_PASS = Deno.env.get('SMTP_PASS')!;
const APP_URL   = 'https://subtle-platypus-1041ce.netlify.app';

const DESTINATARIOS: Record<string, string[]> = {
  revision_mel:    ['melanie@matilda.agency'],
  aprobacion_majo: ['mariajose@matilda.agency'],
  aprobado:        ['johanna@matilda.agency', 'taylor@matilda.agency'],
};

function fmt(n: number) {
  return '$' + (n||0).toLocaleString('es-EC', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function calcTotales(ppto: any) {
  const items = (ppto.items || []).filter((it: any) => !it._type);
  let subtotalPrecio = 0, subtotalCosto = 0;
  for (const it of items) {
    const qty  = Number(it.cantidad || 0);
    const dias = Number(it.dias     || 1);
    subtotalPrecio += qty * dias * Number(it.precio_unit || 0);
    subtotalCosto  += qty * dias * Number(it.costo_unit  || 0) * (1 + Number(it.bco_real_pct || it.bco_pct || 0) / 100);
  }
  const oh       = subtotalCosto * (ppto.oh_pct / 100);
  const totalCosto = subtotalCosto + oh;
  const fee      = subtotalPrecio * (ppto.fee_agencia / 100);
  const sinIva   = subtotalPrecio + fee;
  const margen   = sinIva - totalCosto;
  const margenPct = sinIva > 0 ? (margen / sinIva) * 100 : 0;
  return { sinIva, totalCosto, margen, margenPct };
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

function buildHTML(estado: string, ppto: any, t: any) {
  const linkPpto = `${APP_URL}`;

  const configs: Record<string, { icon:string, titulo:string, color:string, mensaje:string }> = {
    revision_mel: {
      icon:    '🔍',
      titulo:  `Revisar presupuesto: ${ppto.nombre}`,
      color:   '#7c3aed',
      mensaje: 'Se solicita tu revisión del siguiente presupuesto antes de enviarlo a aprobación.',
    },
    aprobacion_majo: {
      icon:    '✅',
      titulo:  `Aprobar presupuesto: ${ppto.nombre}`,
      color:   '#d97706',
      mensaje: 'El presupuesto pasó revisión MEL y está listo para tu aprobación.',
    },
    aprobado: {
      icon:    '🎉',
      titulo:  `Presupuesto aprobado por cliente: ${ppto.nombre}`,
      color:   '#2e8b4e',
      mensaje: 'El cliente aprobó el presupuesto. Por favor proceder con la facturación.',
    },
  };

  const cfg = configs[estado] || configs['revision_mel'];

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;}
.container{max-width:600px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);}
.header{background:${cfg.color};padding:24px 32px;}.header h1{color:#fff;margin:0;font-size:18px;}
.header p{color:rgba(255,255,255,.7);margin:4px 0 0;font-size:12px;}
.body{padding:24px 32px;}
.msg{background:#f8fafc;border-left:4px solid ${cfg.color};padding:12px 16px;border-radius:0 8px 8px 0;font-size:13px;color:#555;margin-bottom:20px;}
.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;}
.label{color:#888;}.value{font-weight:600;color:#0d3b5e;}
.metric{background:#f8fafc;border-radius:8px;padding:12px 16px;text-align:center;}
.metric-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;}
.metric-value{font-size:18px;font-weight:700;color:#0d3b5e;}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:16px 0;}
.btn{display:inline-block;background:${cfg.color};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin-top:16px;}
.footer{background:#f8f9fa;padding:14px 32px;font-size:12px;color:#aaa;text-align:center;}</style>
</head><body><div class="container">
<div class="header"><h1>${cfg.icon} ${cfg.titulo}</h1><p>Matilda Hub · Notificación automática</p></div>
<div class="body">
<div class="msg">${cfg.mensaje}</div>
<div class="row"><span class="label">Presupuesto</span><span class="value">${ppto.nombre || '—'}</span></div>
<div class="row"><span class="label">Cliente</span><span class="value">${ppto.cliente || '—'}</span></div>
<div class="row"><span class="label">Código</span><span class="value">${ppto.nomenclatura || '—'}</span></div>
<div class="row"><span class="label">Fecha evento</span><span class="value">${ppto.fecha_evento || '—'}</span></div>
<div class="row"><span class="label">Solicitado por</span><span class="value">${ppto.ejecutivo_nombre || ppto.created_by || '—'}</span></div>
<div class="grid">
  <div class="metric"><div class="metric-label">Total s/IVA</div><div class="metric-value">${fmt(t.sinIva)}</div></div>
  <div class="metric"><div class="metric-label">Costo total</div><div class="metric-value">${fmt(t.totalCosto)}</div></div>
  <div class="metric"><div class="metric-label">Margen</div><div class="metric-value" style="color:${t.margenPct>=20?'#2e8b4e':'#c8264a'}">${t.margenPct.toFixed(1)}%</div></div>
</div>
<a href="${linkPpto}" class="btn">Ver en Matilda Hub →</a>
</div>
<div class="footer">Matilda Event Designers · Sistema Matilda Hub</div>
</div></body></html>`;
}

serve(async (req) => {
  try {
    const { record, old_record } = await req.json();
    if (!record || !old_record) return new Response(JSON.stringify({ ok:true, skipped:'no data' }), { status:200 });

    const nuevoEstado = record.estado;
    const estadoAnterior = old_record.estado;

    if (nuevoEstado === estadoAnterior) return new Response(JSON.stringify({ ok:true, skipped:'same state' }), { status:200 });

    const destinatarios = DESTINATARIOS[nuevoEstado];
    if (!destinatarios) return new Response(JSON.stringify({ ok:true, skipped:`no notif for ${nuevoEstado}` }), { status:200 });

    const t = calcTotales(record);

    const subjects: Record<string, string> = {
      revision_mel:    `🔍 Revisar presupuesto: ${record.nombre}`,
      aprobacion_majo: `✅ Aprobar presupuesto: ${record.nombre}`,
      aprobado:        `🎉 Presupuesto aprobado: ${record.nombre} — ${fmt(t.sinIva)}`,
    };

    await sendEmail(destinatarios, subjects[nuevoEstado], buildHTML(nuevoEstado, record, t));
    return new Response(JSON.stringify({ ok:true, sent:true, estado:nuevoEstado }), { status:200 });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ ok:false, error: String(err) }), { status:500 });
  }
});
