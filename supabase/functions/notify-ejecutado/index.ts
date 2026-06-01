import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SMTP_HOST     = Deno.env.get('SMTP_HOST')!;
const SMTP_PORT     = parseInt(Deno.env.get('SMTP_PORT') || '465');
const SMTP_USER     = Deno.env.get('SMTP_USER')!;
const SMTP_PASS     = Deno.env.get('SMTP_PASS')!;
const NOTIFY_EMAILS = (Deno.env.get('NOTIFY_EMAILS') || '').split(',').map(e => e.trim());

function fmt(n: number) {
  return '$' + (n || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function sendEmail(to: string[], subject: string, html: string) {
  const boundary = '----=_Part_' + Math.random().toString(36).slice(2);
  const recipients = to.join(', ');

  const message = [
    `From: Matilda Hub <${SMTP_USER}>`,
    `To: ${recipients}`,
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

  // Conectar via SMTP usando Deno
  const conn = await Deno.connectTls({
    hostname: SMTP_HOST,
    port: SMTP_PORT,
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  async function read() {
    const buf = new Uint8Array(4096);
    const n = await conn.read(buf);
    return decoder.decode(buf.subarray(0, n!));
  }

  async function write(s: string) {
    await conn.write(encoder.encode(s + '\r\n'));
  }

  await read(); // 220 greeting
  await write(`EHLO matilda.agency`);
  await read(); // EHLO response

  // AUTH LOGIN
  await write('AUTH LOGIN');
  await read();
  await write(btoa(SMTP_USER));
  await read();
  await write(btoa(SMTP_PASS));
  await read(); // 235 authenticated

  await write(`MAIL FROM:<${SMTP_USER}>`);
  await read();

  for (const addr of to) {
    await write(`RCPT TO:<${addr}>`);
    await read();
  }

  await write('DATA');
  await read();
  await write(message + '\r\n.');
  await read();
  await write('QUIT');
  conn.close();
}

serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;

    // Solo disparar cuando ejecutado cambia a true
    if (!record || !record.ejecutado) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    const oldRecord = payload.old_record;
    if (oldRecord?.ejecutado === true) {
      return new Response(JSON.stringify({ ok: true, skipped: 'already ejecutado' }), { status: 200 });
    }

    // Calcular totales básicos desde items
    const items = (record.items || []).filter((it: any) => !it._type);
    const oh    = record.oh_pct / 100;
    const bco   = record.bco_pct / 100;
    const fee   = record.fee_agencia / 100;

    let subtotalPrecio = 0;
    let subtotalCosto  = 0;

    for (const it of items) {
      const qty   = Number(it.cantidad || 0);
      const price = Number(it.precio_unit || 0);
      const cost  = Number(it.costo_unit || 0);
      subtotalPrecio += qty * price;
      subtotalCosto  += qty * cost;
    }

    const totalOH       = subtotalCosto * oh;
    const totalCosto    = subtotalCosto + totalOH;
    const feeAgencia    = subtotalPrecio * fee;
    const subtotalSinIva = subtotalPrecio + feeAgencia;
    const iva           = subtotalSinIva * 0.15;
    const totalConIva   = subtotalSinIva + iva;
    const margen        = subtotalSinIva - totalCosto;
    const margenPct     = subtotalSinIva > 0 ? (margen / subtotalSinIva) * 100 : 0;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    .header { background: #0d3b5e; padding: 28px 32px; }
    .header h1 { color: #fff; margin: 0; font-size: 20px; }
    .header p { color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 13px; }
    .body { padding: 28px 32px; }
    .badge { display: inline-block; background: #e8f5ee; color: #2e8b4e; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .label { color: #888; }
    .value { font-weight: 600; color: #0d3b5e; }
    .total-box { background: #0d3b5e; border-radius: 10px; padding: 16px 20px; margin: 20px 0; }
    .total-box .t-label { color: rgba(255,255,255,0.7); font-size: 12px; margin-bottom: 4px; }
    .total-box .t-value { color: #fff; font-size: 22px; font-weight: 700; }
    .margen { background: ${margenPct >= 20 ? '#e8f5ee' : '#fde8ec'}; border-radius: 8px; padding: 10px 16px; margin-top: 12px; font-size: 13px; color: ${margenPct >= 20 ? '#2e8b4e' : '#c8264a'}; font-weight: 600; }
    .footer { background: #f8f9fa; padding: 16px 32px; font-size: 12px; color: #aaa; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Presupuesto ejecutado</h1>
      <p>Matilda Hub · Notificación automática</p>
    </div>
    <div class="body">
      <div class="badge">✅ Marcado como ejecutado</div>
      <div class="row"><span class="label">Presupuesto</span><span class="value">${record.nombre || '—'}</span></div>
      <div class="row"><span class="label">Cliente</span><span class="value">${record.cliente || '—'}</span></div>
      <div class="row"><span class="label">Código</span><span class="value">${record.nomenclatura || '—'}</span></div>
      <div class="row"><span class="label">Fecha evento</span><span class="value">${record.fecha_evento || '—'}</span></div>
      <div class="row"><span class="label">Ciudad</span><span class="value">${record.ciudad || '—'}</span></div>

      <div class="total-box">
        <div class="t-label">Total s/IVA</div>
        <div class="t-value">${fmt(subtotalSinIva)}</div>
      </div>

      <div class="row"><span class="label">Subtotal precio</span><span class="value">${fmt(subtotalPrecio)}</span></div>
      <div class="row"><span class="label">Fee agencia</span><span class="value">${fmt(feeAgencia)}</span></div>
      <div class="row"><span class="label">IVA 15%</span><span class="value">${fmt(iva)}</span></div>
      <div class="row"><span class="label">Total c/IVA</span><span class="value">${fmt(totalConIva)}</span></div>
      <div class="row"><span class="label">Costo total</span><span class="value">${fmt(totalCosto)}</span></div>

      <div class="margen">
        Margen: ${fmt(margen)} (${margenPct.toFixed(1)}%)
      </div>

      <p style="margin-top:24px; font-size:13px; color:#888;">
        Este presupuesto está listo para facturar. Por favor actualizá el estado en Matilda Hub.
      </p>
    </div>
    <div class="footer">Matilda Event Designers · Sistema Matilda Hub</div>
  </div>
</body>
</html>`;

    await sendEmail(
      NOTIFY_EMAILS,
      `✅ Ejecutado: ${record.nombre || record.cliente} — ${fmt(subtotalSinIva)}`,
      html,
    );

    return new Response(JSON.stringify({ ok: true, sent: true }), { status: 200 });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
