import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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

  const conn = await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT });
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

  await read();
  await write(`EHLO matilda.agency`);
  await read();
  await write('AUTH LOGIN');
  await read();
  await write(btoa(SMTP_USER));
  await read();
  await write(btoa(SMTP_PASS));
  await read();
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

// Calcula el total sin IVA de un presupuesto a partir de sus items,
// replicando con fidelidad la fórmula real del Hub (calc.js):
// el OH y el BCO son % POR ÍTEM (it.oh_pct / it.bco_pct), no campos
// globales del presupuesto, y cada ítem se multiplica por cantidad * dias.
function calcularTotales(record: any) {
  const items = (record.items || []).filter((it: any) => !it._type);
  const fee = (record.fee_agencia || 0) / 100;

  let subtotalPrecio = 0;
  let subtotalCostoBase = 0;

  for (const it of items) {
    const cantidad = Number(it.cantidad ?? 1);
    const dias     = Number(it.dias ?? 1);
    const costoUnit  = Number(it.costo_unit ?? it.costo ?? 0);
    const precioUnit = Number(it.precio_unit ?? 0);
    subtotalCostoBase += costoUnit * cantidad * dias;
    subtotalPrecio    += precioUnit * cantidad * dias;
  }

  const feeAgencia     = subtotalPrecio * fee;
  const subtotalSinIva = subtotalPrecio + feeAgencia;
  const iva            = subtotalSinIva * 0.15;
  const totalConIva    = subtotalSinIva + iva;
  const margen         = subtotalSinIva - subtotalCostoBase;
  const margenPct      = subtotalSinIva > 0 ? (margen / subtotalSinIva) * 100 : 0;

  return { subtotalPrecio, subtotalCostoBase, feeAgencia, subtotalSinIva, iva, totalConIva, margen, margenPct };
}

serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;
    const oldRecord = payload.old_record;

    // Solo nos interesan presupuestos que ESTÁN ejecutados ahora.
    if (!record || !record.ejecutado) {
      return new Response(JSON.stringify({ ok: true, skipped: 'not ejecutado' }), { status: 200 });
    }

    // Detectar si este update es relevante para reenviar el correo:
    // (a) Recién se marcó como ejecutado (oldRecord.ejecutado era false/null), o
    // (b) Ya estaba ejecutado, pero el monto cambió desde el último envío
    //     (ej: el admin corrigió el precio después de marcar ejecutado).
    const recienEjecutado = !(oldRecord?.ejecutado === true);

    const totalesNuevo = calcularTotales(record);
    const totalesViejo = oldRecord ? calcularTotales(oldRecord) : null;
    const montoCambio = totalesViejo
      ? Math.abs(totalesNuevo.subtotalSinIva - totalesViejo.subtotalSinIva) > 0.01
      : false;

    if (!recienEjecutado && !montoCambio) {
      return new Response(JSON.stringify({ ok: true, skipped: 'ya ejecutado, sin cambio de monto' }), { status: 200 });
    }

    const t = totalesNuevo;
    const esCorreccion = !recienEjecutado && montoCambio;

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
    .badge { display: inline-block; background: ${esCorreccion ? '#fff3da' : '#e8f5ee'}; color: ${esCorreccion ? '#a07020' : '#2e8b4e'}; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .label { color: #888; }
    .value { font-weight: 600; color: #0d3b5e; }
    .total-box { background: #0d3b5e; border-radius: 10px; padding: 16px 20px; margin: 20px 0; }
    .total-box .t-label { color: rgba(255,255,255,0.7); font-size: 12px; margin-bottom: 4px; }
    .total-box .t-value { color: #fff; font-size: 22px; font-weight: 700; }
    .margen { background: ${t.margenPct >= 20 ? '#e8f5ee' : '#fde8ec'}; border-radius: 8px; padding: 10px 16px; margin-top: 12px; font-size: 13px; color: ${t.margenPct >= 20 ? '#2e8b4e' : '#c8264a'}; font-weight: 600; }
    .footer { background: #f8f9fa; padding: 16px 32px; font-size: 12px; color: #aaa; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${esCorreccion ? '✏️ Presupuesto ejecutado — monto corregido' : '✅ Presupuesto ejecutado'}</h1>
      <p>Matilda Hub · Notificación automática</p>
    </div>
    <div class="body">
      <div class="badge">${esCorreccion ? '✏️ Monto actualizado después de ejecutado' : '✅ Marcado como ejecutado'}</div>
      <div class="row"><span class="label">Presupuesto</span><span class="value">${record.nombre || '—'}</span></div>
      <div class="row"><span class="label">Cliente</span><span class="value">${record.cliente || '—'}</span></div>
      <div class="row"><span class="label">Código</span><span class="value">${record.nomenclatura || '—'}</span></div>
      <div class="row"><span class="label">Fecha evento</span><span class="value">${record.fecha_evento || '—'}</span></div>
      <div class="row"><span class="label">Ciudad</span><span class="value">${record.ciudad || '—'}</span></div>

      <div class="total-box">
        <div class="t-label">Total s/IVA</div>
        <div class="t-value">${fmt(t.subtotalSinIva)}</div>
      </div>

      <div class="row"><span class="label">Subtotal precio</span><span class="value">${fmt(t.subtotalPrecio)}</span></div>
      <div class="row"><span class="label">Fee agencia</span><span class="value">${fmt(t.feeAgencia)}</span></div>
      <div class="row"><span class="label">IVA 15%</span><span class="value">${fmt(t.iva)}</span></div>
      <div class="row"><span class="label">Total c/IVA</span><span class="value">${fmt(t.totalConIva)}</span></div>
      <div class="row"><span class="label">Costo total</span><span class="value">${fmt(t.subtotalCostoBase)}</span></div>

      <div class="margen">
        Margen: ${fmt(t.margen)} (${t.margenPct.toFixed(1)}%)
      </div>

      <p style="margin-top:24px; font-size:13px; color:#888;">
        ${esCorreccion
          ? 'El monto de este presupuesto fue corregido luego de marcarse como ejecutado. Este correo refleja el valor más reciente.'
          : 'Este presupuesto está listo para facturar. Por favor actualizá el estado en Matilda Hub.'}
      </p>
    </div>
    <div class="footer">Matilda Event Designers · Sistema Matilda Hub</div>
  </div>
</body>
</html>`;

    await sendEmail(
      NOTIFY_EMAILS,
      `${esCorreccion ? '✏️ Corregido' : '✅ Ejecutado'}: ${record.nombre || record.cliente} — ${fmt(t.subtotalSinIva)}`,
      html,
    );

    return new Response(JSON.stringify({ ok: true, sent: true, esCorreccion }), { status: 200 });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
