import { calcItem, calcPpto, fmt, fmtDate } from '../calc';
import LOGO_BASE64 from '../logoBase64';

// Convierte *palabra* en negrita y \n en salto de línea
function renderDetalle(text) {
  if (!text) return '';
  return text
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

function groupBySubcat(items) {
  const groups = [];
  let current = null;
  items.forEach(it => {
    if (it._type === 'subcat') {
      current = { subcat: it.subcategoria, items: [] };
      groups.push(current);
    } else if (!it._type) {
      if (!current) { current = { subcat: 'Servicios', items: [] }; groups.push(current); }
      current.items.push(it);
    }
  });
  return groups;
}

function groupBySubppto(items) {
  const subpptos = [];
  let spActual = null;
  let subcatActual = null;
  items.forEach(it => {
    if (it._type === 'subppto') {
      spActual = { id:it.id, nombre:it.subpresupuesto, incluir:it.incluir_en_total!==false, grupos:[] };
      subpptos.push(spActual);
      subcatActual = null;
    } else if (it._type === 'subcat') {
      if (!spActual) { spActual = { id:'__root__', nombre:'', incluir:true, grupos:[] }; subpptos.push(spActual); }
      subcatActual = { subcat:it.subcategoria, items:[] };
      spActual.grupos.push(subcatActual);
    } else {
      if (!spActual) { spActual = { id:'__root__', nombre:'', incluir:true, grupos:[] }; subpptos.push(spActual); }
      if (!subcatActual) { subcatActual = { subcat:'Servicios', items:[] }; spActual.grupos.push(subcatActual); }
      subcatActual.items.push(it);
    }
  });
  return subpptos;
}

const haySubpptos = (items) => items.some(it=>it._type==='subppto');

export function generatePdfClienteHTML(ppto, logoUrlOverride, mostrarSeparados=true) {
  const totales = calcPpto(ppto);
  const items = ppto.items || [];
  const tieneSubpptos = haySubpptos(items);
  const groups  = groupBySubcat(items);
  const subpptos = groupBySubppto(items);
  // Use uploaded logo from admin, or fall back to embedded logo
  const logoSrc = logoUrlOverride || LOGO_BASE64;
  const logoTag = `<img src="${logoSrc}" style="height:90px;object-fit:contain;background:transparent;" alt="Matilda Event Designers" />`;

  // Single header row for all items
  const tableHeader = `
    <tr style="background:#e8f0f8;">
      <th style="padding:7px 14px;text-align:left;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;width:45%;">Ítem</th>
      <th style="padding:7px 8px;text-align:center;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Cant.</th>
      <th style="padding:7px 8px;text-align:center;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Días</th>
      <th style="padding:7px 8px;text-align:right;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;">P. Unit.</th>
      <th style="padding:7px 14px;text-align:right;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Total</th>
    </tr>`;

  const renderItemRow = (it, i) => {
    const c = calcItem(it);
    const fotoCell = it.foto_referencia
      ? `<br><img src="${it.foto_referencia}" style="max-height:60px;max-width:100px;margin-top:4px;border-radius:3px;object-fit:cover;border:1px solid #dde6ef;" />`
      : '';
    return `<tr style="border-bottom:1px solid #eef2f7;background:${i%2===1?'#fafcfe':'#fff'};">
      <td style="padding:8px 14px;">
        <div style="font-weight:700;color:#1a1a2e;font-size:12px;">${it.item || ''}</div>
        ' + (it.detalle ? '<div style="font-size:11px;color:#6b7a99;margin-top:2px;">' + renderDetalle(it.detalle) + '</div>' : '') + '
        ${fotoCell}
      </td>
      <td style="padding:8px;text-align:center;color:#1a1a2e;">${c.cantidad}</td>
      <td style="padding:8px;text-align:center;color:#1a1a2e;">${c.dias}</td>
      <td style="padding:8px;text-align:right;color:#1a1a2e;">${fmt(c.precioU)}</td>
      <td style="padding:8px 14px;text-align:right;font-weight:700;color:#1a1a2e;">${fmt(c.precio)}</td>
    </tr>`;
  };

  let itemRows = '';
  const subpptosVisibles = tieneSubpptos ? subpptos.filter(sp=>sp.incluir) : subpptos;
  if (tieneSubpptos && mostrarSeparados) {
    itemRows = subpptosVisibles.map(sp => {
      const spItems = sp.grupos.flatMap(g=>g.items);
      const spTotal = spItems.reduce((a,it)=>a+calcItem(it).precio,0);
      const spFee = spTotal * ((ppto.fee_agencia||0)/100);
      const spTotalConFee = spTotal + spFee;
      const spIva = spTotalConFee * 0.15;
      const spTotalFinal = spTotalConFee + spIva;
      const spHeader = sp.nombre ? `<tr><td colspan="5" style="background:#5b21b6;color:#fff;padding:9px 14px;font-size:12px;font-weight:700;letter-spacing:0.5px;">📦 ${sp.nombre}${!sp.incluir?' (no incluido en total general)':''}</td></tr>` : '';
      const spRows = sp.grupos.map(({subcat, items:gItems}) => {
        const sr = `<tr><td colspan="5" style="background:#0d3b5e;color:#fff;padding:6px 14px;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${subcat}</td></tr>`;
        return sr + gItems.map(renderItemRow).join('');
      }).join('');
      const spFeeStr = (ppto.fee_agencia||0)>0
        ? '<tr style="background:#f5f3ff;"><td colspan="4" style="padding:4px 14px;text-align:right;font-size:11px;color:#555;">Fee agencia (' + (ppto.fee_agencia) + '%):</td><td style="padding:4px 14px;text-align:right;color:#555;">' + fmt(spFee) + '</td></tr>'
        : '';
      const spTotals = sp.nombre ? (
        '<tr style="background:#f5f3ff;"><td colspan="4" style="padding:6px 14px;text-align:right;font-size:11px;color:#5b21b6;font-weight:600;">Subtotal ' + sp.nombre + ':</td><td style="padding:6px 14px;text-align:right;font-weight:700;color:#5b21b6;">' + fmt(spTotal) + '</td></tr>'
        + spFeeStr
        + '<tr style="background:#f5f3ff;"><td colspan="4" style="padding:4px 14px;text-align:right;font-size:11px;color:#555;">IVA 15%:</td><td style="padding:4px 14px;text-align:right;color:#555;">' + fmt(spIva) + '</td></tr>'
        + '<tr style="background:#5b21b6;"><td colspan="4" style="padding:7px 14px;text-align:right;color:#fff;font-weight:700;font-size:13px;">TOTAL ' + sp.nombre.toUpperCase() + ':</td><td style="padding:7px 14px;text-align:right;font-weight:700;color:#fff;font-size:13px;">' + fmt(spTotalFinal) + '</td></tr>'
        + '<tr><td colspan="5" style="padding:10px;"></td></tr>'
      ) : '';
      return spHeader + spRows + spTotals;
    }).join('');
  } else {
    // Flatten only included subpptos
    const groupsFiltrados = tieneSubpptos
      ? groupBySubcat(subpptosVisibles.flatMap(sp=>{const r=[];sp.grupos.forEach(g=>{r.push({_type:'subcat',subcategoria:g.subcat});g.items.forEach(it=>r.push(it));});return r;}))
      : groups;
    itemRows = groupsFiltrados.map(({ subcat, items:gItems }) => {
      const subcatRow = `<tr><td colspan="5" style="background:#0d3b5e;color:#fff;padding:6px 14px;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${subcat}</td></tr>`;
      return subcatRow + gItems.map(renderItemRow).join('');
    }).join('');
  }

  const feeRow = (ppto.fee_agencia ?? 0) > 0
    ? `<div style="display:flex;justify-content:space-between;padding:7px 16px;border-bottom:1px solid #dde6ef;">
        <span style="font-size:12px;color:#6b7a99;">Fee de agencia (${ppto.fee_agencia}%)</span>
        <span style="font-size:12px;font-weight:600;">${fmt(totales.feeAgencia)}</span>
       </div>` : '';

  const infoFields = [
    ['Cliente', ppto.cliente],
    ['Evento',  ppto.nombre],
    ['Fecha evento',   fmtDate(ppto.fecha_evento)],
    ['Lugar',   ppto.lugar],
    ['PAX',     ppto.personas ? ppto.personas + ' personas' : ''],
    ['Días',    ppto.dias_evento ? ppto.dias_evento + ' días' : ''],
    ['Ejecutivo', ppto.ejecutivo_nombre],
    ['Correo',  ppto.ejecutivo_email],
  ].filter(([,v]) => v).map(([l,v]) => `
    <div>
      <div style="font-size:9px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px;">${l}</div>
      <div style="font-size:13px;font-weight:700;color:#0d3b5e;">${v}</div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>${ppto.nomenclatura || 'Presupuesto'}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,sans-serif; background:#fff; color:#1a1a2e; font-size:13px; }
  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .no-print { display:none; }
  }
</style>
</head>
<body style="padding:0;">
<button class="no-print" onclick="window.print()"
  style="position:fixed;top:16px;right:16px;background:#c8264a;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;z-index:999;">
  ⬇ Descargar PDF
</button>
<div style="max-width:800px;margin:0 auto;padding:0;">
  <!-- HEADER -->
  <div style="background:#0d3b5e;padding:22px 36px;display:flex;justify-content:space-between;align-items:center;">
    <div style="background:#0d3b5e;">${logoTag}</div>
    <div style="text-align:right;">
      <div style="color:#3dbfb8;font-size:9px;letter-spacing:2px;font-weight:700;text-transform:uppercase;margin-bottom:5px;">Propuesta Comercial</div>
      <div style="color:#fff;font-size:11px;font-weight:700;font-family:monospace;">${ppto.nomenclatura || ''}</div>
      <div style="color:#8ab4d4;font-size:11px;margin-top:4px;">Guayaquil, ${fmtDate(new Date().toISOString().slice(0,10))}</div>
    </div>
  </div>
  <div style="background:#c8264a;height:3px;"></div>
  <!-- INFO EVENTO -->
  <div style="padding:18px 36px 14px;background:#f8fafc;border-bottom:1px solid #dde6ef;">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">${infoFields}</div>
  </div>
  <!-- ITEMS — una sola tabla continua -->
  <div style="padding:18px 36px 0;">
    <div style="font-size:9px;color:#c8264a;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">Detalle de Servicios</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>${tableHeader}</thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>
  <!-- TOTALES -->
  <div style="margin:16px 36px 20px;">
    <div style="display:flex;justify-content:flex-end;">
      <div style="width:340px;border:1px solid #dde6ef;border-radius:4px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;padding:7px 16px;border-bottom:1px solid #dde6ef;">
          <span style="font-size:12px;color:#6b7a99;">Subtotal servicios</span>
          <span style="font-size:12px;font-weight:600;">${fmt(totales.subtotalPrecio)}</span>
        </div>
        ${feeRow}
        <div style="display:flex;justify-content:space-between;padding:8px 16px;border-bottom:1px solid #dde6ef;background:#f0f4f8;">
          <span style="font-size:13px;color:#0d3b5e;font-weight:700;">Subtotal sin IVA</span>
          <span style="font-size:13px;color:#0d3b5e;font-weight:700;">${fmt(totales.totalSinIva)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:7px 16px;border-bottom:1px solid #dde6ef;">
          <span style="font-size:12px;color:#6b7a99;">IVA 15%</span>
          <span style="font-size:12px;font-weight:600;">${fmt(totales.iva15)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:11px 16px;background:#0d3b5e;">
          <span style="font-size:14px;color:#fff;font-weight:700;">TOTAL</span>
          <span style="font-size:16px;color:#3dbfb8;font-weight:700;">${fmt(totales.totalConIva)}</span>
        </div>
      </div>
    </div>
  </div>
  ${ppto.notas ? `
  <div style="margin:0 36px 20px;background:#f0f7ff;border-left:3px solid #3dbfb8;padding:12px 16px;border-radius:0 4px 4px 0;">
    <div style="font-size:9px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Nota</div>
    <div style="font-size:12px;color:#1a1a2e;line-height:1.6;">${ppto.notas}</div>
  </div>` : ''}

  ${(ppto.opciones_adicionales||[]).length > 0 ? `
  <div style="margin:0 36px 20px;">
    <div style="background:#5b21b6;color:#fff;padding:10px 16px;border-radius:8px 8px 0 0;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">
      ✦ Opciones adicionales
    </div>
    <div style="border:1px solid #dde6ef;border-top:none;border-radius:0 0 8px 8px;padding:16px;">
      ${(ppto.opciones_adicionales||[]).map(op => {
        const feeAgencia = ppto.fee_agencia || 0;
        let subtotalOp = 0;
        const itemRows = (op.items||[]).map((it,i) => {
          const qty = Number(it.cantidad||0); const dias = Number(it.dias||1); const pu = Number(it.precio_unit||0);
          const total = qty*dias*pu;
          subtotalOp += total;
          return `<tr style="background:${i%2?'#f8fafc':'#fff'};border-bottom:1px solid #f0f0f0;">
            <td style="padding:7px 10px;font-size:12px;font-weight:500;">
              ' + (it.imagen_url ? '<img src="' + it.imagen_url + '" style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #eee;float:left;margin-right:8px;" />' : '') + (it.item||'') + '</td>
            <td style="padding:7px 10px;font-size:11px;color:#666;">${it.detalle||''}</td>
            <td style="padding:7px 8px;text-align:center;font-size:12px;">${qty}</td>
            <td style="padding:7px 8px;text-align:center;font-size:12px;">${dias}</td>
            <td style="padding:7px 8px;text-align:right;font-size:12px;">$${pu.toFixed(2)}</td>
            <td style="padding:7px 8px;text-align:right;font-size:12px;font-weight:600;color:#5b21b6;">$${total.toFixed(2)}</td>

          </tr>`;
        }).join('');
        const feeOp = subtotalOp * (feeAgencia/100);
        const totalConFee = subtotalOp + feeOp;
        return `
        <div style="margin-bottom:16px;">
          <div style="background:#f5f3ff;padding:8px 12px;border-radius:6px;font-size:12px;font-weight:700;color:#5b21b6;margin-bottom:6px;">${op.nombre}</div>
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:#ede9fe;">
              <th style="padding:6px 10px;text-align:left;font-size:10px;color:#5b21b6;">Ítem</th>
              <th style="padding:6px 10px;text-align:left;font-size:10px;color:#5b21b6;">Detalle</th>
              <th style="padding:6px 8px;text-align:center;font-size:10px;color:#5b21b6;">Cant.</th>
              <th style="padding:6px 8px;text-align:center;font-size:10px;color:#5b21b6;">Días</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;color:#5b21b6;">P.Unit</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;color:#5b21b6;">Total</th>

            </tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <div style="display:flex;justify-content:flex-end;gap:16px;padding:8px 8px 4px;font-size:12px;">
            <span>Subtotal: <strong style="color:#5b21b6;">$${subtotalOp.toFixed(2)}</strong></span>
            ' + (feeAgencia>0 ? '<span>Fee ' + feeAgencia + '%: <strong style="color:#5b21b6;">$' + feeOp.toFixed(2) + '</strong></span>' : '') + '
            <span style="font-size:13px;font-weight:700;color:#5b21b6;">Total c/fee: $${totalConFee.toFixed(2)}</span>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>` : ''}

  <div style="margin:0 36px 16px;background:#fdf8ee;border:1px solid #e8d8a0;border-radius:6px;padding:12px 16px;">
    <div style="font-size:10px;color:#7a5500;line-height:1.7;">
      <strong>NOTA:</strong> LA PRESENTE COTIZACIÓN TIENE UNA VIGENCIA DE 30 DÍAS CALENDARIO A PARTIR DE LA FECHA DE EMISIÓN.<br>
      VENCIDO ESTE PLAZO, LOS VALORES PODRÁN SER AJUSTADOS SEGÚN LAS CONDICIONES DEL MERCADO.
    </div>
  </div>
  <!-- FOOTER -->
  <div style="background:#0d3b5e;padding:12px 36px;display:flex;justify-content:center;align-items:center;margin-top:8px;">
    <div style="font-size:10px;color:#3dbfb8;letter-spacing:1px;font-style:italic;">"Donde la estrategia se convierte en experiencia."</div>
  </div>
</div>
</body>
</html>`;
}

export function generatePdfFinancieroHTML(ppto, logoUrlOverride) {
  const totales = calcPpto(ppto);
  const allItems = ppto.items || [];
  const tieneSubpptos = haySubpptos(allItems);
  const spData = groupBySubppto(allItems);
  // Only included subpresupuestos
  const itemsFiltrados = tieneSubpptos
    ? spData.filter(sp=>sp.incluir).flatMap(sp => {
        const r = [];
        r.push({_type:'subppto', subpresupuesto: sp.nombre});
        sp.grupos.forEach(g => {
          r.push({_type:'subcat', subcategoria: g.subcat});
          g.items.forEach(it => r.push(it));
        });
        return r;
      })
    : allItems;
  const groups  = groupBySubcat(itemsFiltrados);
  const logoSrc = logoUrlOverride || LOGO_BASE64;
  const logoTag = `<img src="${logoSrc}" style="height:80px;object-fit:contain;background:transparent;" alt="Matilda Event Designers" />`;

  const infoFields = [
    ['Cliente',   ppto.cliente],
    ['Evento',    ppto.nombre],
    ['Fecha evento',     fmtDate(ppto.fecha_evento)],
    ['Lugar',     ppto.lugar],
    ['PAX',       ppto.personas ? ppto.personas + ' personas' : ''],
    ['Días',      ppto.dias_evento ? ppto.dias_evento + ' días' : ''],
    ['Ejecutivo', ppto.ejecutivo_nombre],
    ['Correo',    ppto.ejecutivo_email],
  ].filter(([,v]) => v).map(([l,v]) => `
    <div>
      <div style="font-size:9px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px;">${l}</div>
      <div style="font-size:12px;font-weight:700;color:#0d3b5e;">${v}</div>
    </div>`).join('');

  // Columnas: Ítem | Detalle | Cant | Días | C.Unit | C.Total | P.Unit | P.Total | Margen Cot. | Proveedor | #Fact | C.Real Unit | C.Real Total | Ahorro | Margen Real
  const tableHeader = `
    <tr style="background:#0d3b5e;color:#fff;">
      <th style="padding:6px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;width:18%;">Ítem / Detalle</th>
      <th style="padding:6px 5px;text-align:center;font-size:9px;text-transform:uppercase;">Cant</th>
      <th style="padding:6px 5px;text-align:center;font-size:9px;text-transform:uppercase;">Días</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#ffcccc;">C.Unit</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#ffcccc;">C.Total</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#aaddff;">P.Unit</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#aaddff;">P.Total</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#ffffaa;">Margen Cot.</th>
      <th style="padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;">Proveedor</th>
      <th style="padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;"># Fact.</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#aaffcc;">C.Real Unit</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#aaffcc;">C.Real Total</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#aaffcc;">Ahorro</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#88ffaa;">Margen Real</th>
    </tr>`;

  const spVisibles = tieneSubpptos ? spData.filter(sp=>sp.incluir) : null;

  const renderFinItemRows = (grupos) => grupos.map(({ subcat, items }) => {
    const subcatRow = `<tr><td colspan="14" style="background:#1a5078;color:#fff;padding:5px 10px;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${subcat}</td></tr>`;
    const rows = items.map((it, i) => {
      const c = calcItem(it);
      const tieneReal = it.costo_real_unit !== null && it.costo_real_unit !== undefined;
      const bg = i % 2 === 1 ? '#f8fafc' : '#fff';
      return `<tr style="border-bottom:1px solid #eef2f7;background:${bg};font-size:10px;">
        <td style="padding:6px 10px;">
          <div style="font-weight:700;color:#1a1a2e;">${it.item || ''}</div>
          ' + (it.detalle ? '<div style="font-size:9px;color:#6b7a99;margin-top:1px;">' + renderDetalle(it.detalle) + '</div>' : '') + '
        </td>
        <td style="padding:6px 5px;text-align:center;">${c.cantidad}</td>
        <td style="padding:6px 5px;text-align:center;">${c.dias}</td>
        <td style="padding:6px 5px;text-align:right;color:#8b1a1a;">${fmt(c.costoUnit)}</td>
        <td style="padding:6px 5px;text-align:right;color:#8b1a1a;font-weight:600;">${fmt(c.costoTotal)}</td>
        <td style="padding:6px 5px;text-align:right;color:#0d3b5e;">${fmt(c.precioU)}</td>
        <td style="padding:6px 5px;text-align:right;color:#0d3b5e;font-weight:600;">${fmt(c.precio)}</td>
        <td style="padding:6px 5px;text-align:right;font-weight:600;color:${(c.precio-c.costoTotal)>=0?'#1a6e3e':'#8b1a1a'};">${fmt(c.precio-c.costoTotal)}<div style="font-size:8px;">(${c.margenPct.toFixed(1)}%)</div></td>
        <td style="padding:6px 8px;font-size:9px;color:#5a7a9a;">${it.proveedor||''}</td>
        <td style="padding:6px 8px;font-size:9px;color:#5a7a9a;">${it.num_factura_prov||''}</td>
        <td style="padding:6px 5px;text-align:right;color:#1a6e3e;">${tieneReal?fmt(c.costoRealUnit):'—'}</td>
        <td style="padding:6px 5px;text-align:right;color:#1a6e3e;font-weight:600;">${tieneReal?fmt(c.costoRealTotal):'—'}</td>
        <td style="padding:6px 5px;text-align:right;color:#1a6e3e;">${tieneReal?fmt(c.ahorro):'—'}</td>
        <td style="padding:6px 5px;text-align:right;font-weight:600;color:${tieneReal?((c.precio-c.costoRealTotal)>=0?'#1a6e3e':'#8b1a1a'):'#888'};">${tieneReal?fmt(c.precio-c.costoRealTotal):'—'}</td>
      </tr>`;
  if (tieneSubpptos && spVisibles) {
    itemRows = spVisibles.map(function(sp) {
      var spItems = sp.grupos.flatMap(function(g){return g.items;});
      var spPrecio = spItems.reduce(function(a,it){return a+calcItem(it).precio;},0);
      var spCosto = spItems.reduce(function(a,it){return a+calcItem(it).costoTotal;},0);
      var spFee = spPrecio * ((ppto.fee_agencia||0)/100);
      var spGrupos = groupBySubcat(sp.grupos.flatMap(function(g){var r=[];r.push({_type:'subcat',subcategoria:g.subcat});g.items.forEach(function(it){r.push(it);});return r;}));
      var spNombre = sp.nombre || '';
      var feeStr = (ppto.fee_agencia||0)>0 ? ('Fee: ' + fmt(spFee)) : '';
      var spHeaderHtml = '<tr><td colspan="14" style="background:#5b21b6;color:#fff;padding:8px 10px;font-size:11px;font-weight:700;">' + spNombre + '</td></tr>';
      var spTotalHtml = '<tr style="background:#f5f3ff;">'
        + '<td colspan="6" style="padding:5px;text-align:right;font-size:10px;color:#5b21b6;font-weight:600;">Subtotal ' + spNombre + ':</td>'
        + '<td style="padding:5px;text-align:right;font-weight:700;color:#1a3a5e;">' + fmt(spPrecio) + '</td>'
        + '<td style="padding:5px;text-align:right;font-weight:700;color:#1a6e3e;">' + fmt(spPrecio-spCosto) + '</td>'
        + '<td colspan="6" style="padding:5px;text-align:right;font-size:10px;color:#555;">' + feeStr + '</td>'
        + '</tr>';
      return spHeaderHtml + renderFinItemRows(spGrupos) + spTotalHtml;
    }).join('');
  } else {
    itemRows = renderFinItemRows(groups);
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>${ppto.nomenclatura || 'Presupuesto'} — Financiero</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,sans-serif; background:#fff; color:#1a1a2e; font-size:11px; }
  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .no-print { display:none; }
    @page { size: A4 landscape; margin: 10mm; }
  }
</style>
</head>
<body>
<button class="no-print" onclick="window.print()"
  style="position:fixed;top:16px;right:16px;background:#0d3b5e;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;z-index:999;">
  ⬇ Descargar PDF Financiero
</button>
<div style="max-width:1100px;margin:0 auto;padding:0;">
  <!-- HEADER -->
  <div style="background:#0d3b5e;padding:16px 28px;display:flex;justify-content:space-between;align-items:center;">
    <div style="background:#0d3b5e;">${logoTag}</div>
    <div style="text-align:center;">
      <div style="color:#c8264a;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Presupuesto Financiero — USO INTERNO</div>
    </div>
    <div style="text-align:right;">
      <div style="color:#3dbfb8;font-size:9px;letter-spacing:2px;font-weight:700;text-transform:uppercase;margin-bottom:3px;">Código</div>
      <div style="color:#fff;font-size:10px;font-weight:700;font-family:monospace;">${ppto.nomenclatura || ''}</div>
      <div style="color:#8ab4d4;font-size:10px;margin-top:2px;">${fmtDate(new Date().toISOString().slice(0,10))}</div>
    </div>
  </div>
  <div style="background:#c8264a;height:3px;"></div>

  <!-- INFO -->
  <div style="padding:12px 28px;background:#f8fafc;border-bottom:1px solid #dde6ef;">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">${infoFields}</div>
  </div>

  <!-- LEYENDA COLORES -->
  <div style="padding:8px 28px;background:#fff;border-bottom:1px solid #dde6ef;display:flex;gap:20px;align-items:center;">
    <span style="font-size:9px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px;">Leyenda:</span>
    <span style="font-size:9px;color:#8b1a1a;">■ Costo proveedor</span>
    <span style="font-size:9px;color:#7a5500;">■ OH+BCO</span>
    <span style="font-size:9px;color:#5a2a7e;">■ Total costo</span>
    <span style="font-size:9px;color:#0d3b5e;">■ Precio cliente</span>
    <span style="font-size:9px;color:#1a6e3e;">■ Costo real / Ahorro</span>
  </div>

  <!-- TABLA -->
  <div style="padding:12px 28px 0;">
    <table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead>${tableHeader}</thead>
      <tbody>
        ${itemRows}
        <!-- TOTALES -->
        <tr style="background:#f0f4f8;border-top:2px solid #0d3b5e;">
          <td colspan="4" style="padding:8px 10px;font-weight:700;font-size:11px;color:#0d3b5e;">TOTALES</td>
          <td style="padding:8px 5px;text-align:right;font-weight:700;color:#8b1a1a;">${fmt(t.subtotalCosto)}</td>
          <td style="padding:8px 5px;"></td>
          <td style="padding:8px 5px;text-align:right;font-weight:700;color:#0d3b5e;">${fmt(t.subtotalPrecio)}</td>
          <td style="padding:8px 5px;text-align:right;font-weight:700;color:${t.margenTotal>=0?'#1a6e3e':'#8b1a1a'};">${fmt(t.margenTotal)}</td>
          <td colspan="2" style="padding:8px 5px;"></td>
          <td style="padding:8px 5px;text-align:right;font-weight:700;color:#1a6e3e;">${t.subtotalCostoReal > 0 ? fmt(t.subtotalCostoReal) : '—'}</td>
          <td style="padding:8px 5px;text-align:right;font-weight:700;color:${t.subtotalAhorro>=0?'#1a6e3e':'#8b1a1a'};">${t.subtotalAhorro > 0 ? fmt(t.subtotalAhorro) : '—'}</td>
          <td style="padding:8px 5px;text-align:right;font-weight:700;color:${t.margenRealTotal>=0?'#1a6e3e':'#8b1a1a'};">${t.subtotalCostoReal > 0 ? fmt(t.margenRealTotal) : '—'}</td>
        </tr>
        ${rebateRow}
        <!-- 3 TIPOS DE MARGEN -->
        <tr style="background:#eef4fb;">
          <td colspan="6" style="padding:8px 10px;font-size:11px;color:#0d3b5e;font-weight:600;">Margen cotizado (sin fee)</td>
          <td colspan="8" style="padding:8px 10px;text-align:right;font-weight:700;color:${(t.subtotalPrecio-t.subtotalCosto)>=0?'#1a6e3e':'#8b1a1a'};">
            ${fmt(t.subtotalPrecio - t.subtotalCosto)} (${t.subtotalPrecio>0?(((t.subtotalPrecio-t.subtotalCosto)/t.subtotalPrecio)*100).toFixed(1):'0.0'}%)
          </td>
        </tr>
        <tr style="background:#e8f5ee;">
          <td colspan="6" style="padding:8px 10px;font-size:11px;color:#1a6e3e;font-weight:600;">Margen real (sin fee)</td>
          <td colspan="8" style="padding:8px 10px;text-align:right;font-weight:700;color:${t.subtotalCostoReal>0?((t.subtotalPrecio-t.subtotalCostoReal)>=0?'#1a6e3e':'#8b1a1a'):'#bbb'};">
            ${t.subtotalCostoReal > 0 ? fmt(t.subtotalPrecio - t.subtotalCostoReal)+' ('+(((t.subtotalPrecio-t.subtotalCostoReal)/t.subtotalPrecio)*100).toFixed(1)+'%)' : '— (sin costo real ingresado)'}
          </td>
        </tr>
        <tr style="background:#0d3b5e;">
          <td colspan="6" style="padding:8px 10px;font-size:11px;color:#3dbfb8;font-weight:700;">Margen incl. fee' + (ppto.apply_rebate ? ' menos Rebate ' + (ppto.rebate_pct??0) + '%' : '') + '</td>
          <td colspan="8" style="padding:8px 10px;text-align:right;font-weight:700;color:#3dbfb8;font-size:13px;">
            ${fmt(t.totalSinIva - t.subtotalCosto - (ppto.apply_rebate ? t.rebate : 0))} (${((t.totalSinIva - t.subtotalCosto - (ppto.apply_rebate ? t.rebate : 0)) / (t.totalSinIva||1) * 100).toFixed(1)}%)
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- RESUMEN FINANCIERO -->
  <div style="margin:16px 28px 20px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    <!-- Columna izquierda: costos -->
    <div style="border:1px solid #dde6ef;border-radius:6px;overflow:hidden;">
      <div style="background:#1a1a2e;color:#fff;padding:7px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Resumen de costos</div>
      ${[
        ['Subtotal costo proveedores', fmt(t.subtotalCostoBase), '#8b1a1a'],
        ['OH acumulado', fmt(t.subtotalOH), '#7a5500'],
        ['BCO acumulado', fmt(t.subtotalBCO), '#7a5500'],
        ['Total costo c/OH+BCO', fmt(t.subtotalCosto), '#5a2a7e'],
        ...(t.subtotalCostoReal > 0 ? [
          ['─── Cierre ───', '', '#888'],
          ['Costo real total', fmt(t.subtotalCostoReal), '#1a6e3e'],
          ['Ahorro total', fmt(t.subtotalAhorro), t.subtotalAhorro>=0?'#1a6e3e':'#8b1a1a'],
          ['Margen real', `${fmt(t.margenRealTotal)} (${t.margenRealPct.toFixed(1)}%)`, t.margenRealTotal>=0?'#1a6e3e':'#8b1a1a'],
        ] : []),
      ].map(([l,v,col]) => `
        <div style="display:flex;justify-content:space-between;padding:6px 14px;border-bottom:1px solid #eee;">
          <span style="font-size:11px;color:#666;">${l}</span>
          <span style="font-size:11px;font-weight:600;color:${col||'#1a1a2e'};">${v}</span>
        </div>`).join('')}
    </div>
    <!-- Columna derecha: precio cliente -->
    <div style="border:1px solid #dde6ef;border-radius:6px;overflow:hidden;">
      <div style="background:#1a1a2e;color:#fff;padding:7px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Resumen precio cliente</div>
      ${[
        ['Subtotal servicios', fmt(t.subtotalPrecio), '#0d3b5e'],
        [`Fee agencia ${ppto.fee_agencia??0}%`, fmt(t.feeAgencia), '#0d3b5e'],
        ['Subtotal sin IVA', fmt(t.totalSinIva), '#0d3b5e'],
        ['IVA 15%', fmt(t.iva15), '#555'],
        ['TOTAL CON IVA', fmt(t.totalConIva), '#0d3b5e'],
        ['─── Rentabilidad ───', '', '#888'],
        ['Margen cotizado', `${fmt(t.margenTotal)} (${t.margenPct.toFixed(1)}%)`, t.margenTotal>=0?'#1a6e3e':'#8b1a1a'],
        ...(ppto.apply_rebate ? [
          [`Rebate ${ppto.rebate_pct??0}% (nota crédito)`, fmt(t.rebate), '#7a5500'],
          ['Utilidad con rebate', `${fmt(t.utilidadConRebate)} (${t.utilidadConRebatePct.toFixed(1)}%)`, '#7a5500'],
        ] : []),
      ].map(([l,v,col]) => `
        <div style="display:flex;justify-content:space-between;padding:6px 14px;border-bottom:1px solid #eee;${l==='TOTAL CON IVA'?'background:#0d3b5e;':''}">
          <span style="font-size:11px;color:${l==='TOTAL CON IVA'?'#fff':'#666'};">${l}</span>
          <span style="font-size:${l==='TOTAL CON IVA'?'13':'11'}px;font-weight:700;color:${l==='TOTAL CON IVA'?'#3dbfb8':col||'#1a1a2e'};">${v}</span>
        </div>`).join('')}
    </div>
  </div>

  ${ppto.notas ? `
  <div style="margin:0 28px 16px;background:#f0f7ff;border-left:3px solid #3dbfb8;padding:10px 14px;border-radius:0 4px 4px 0;">
    <div style="font-size:9px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px;">Nota</div>
    <div style="font-size:11px;color:#1a1a2e;line-height:1.5;">${ppto.notas}</div>
  </div>` : ''}

  <div style="background:#0d3b5e;padding:10px 28px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:9px;color:#8ab4d4;">DOCUMENTO DE USO INTERNO — MATILDA EVENT DESIGNERS</div>
    <div style="font-size:9px;color:#3dbfb8;font-style:italic;">"Donde la estrategia se convierte en experiencia."</div>
  </div>
</div>
</body>
</html>`;
}

export function generateExcelFinancieroData(ppto) {
  const allItems = ppto.items || [];
  const tieneSubpptos = haySubpptos(allItems);
  const spData = groupBySubppto(allItems);
  const itemsFiltrados = tieneSubpptos
    ? spData.filter(sp=>sp.incluir).flatMap(sp => {
        const r = [];
        r.push({_type:'subppto', subpresupuesto: sp.nombre});
        sp.grupos.forEach(g => {
          r.push({_type:'subcat', subcategoria: g.subcat});
          g.items.forEach(it => r.push(it));
        });
        return r;
      })
    : allItems;
  const rows = [];
  rows.push(['PRESUPUESTO FINANCIERO - MATILDA EVENT DESIGNERS']);
  rows.push([]);
  rows.push(['Código:', ppto.nomenclatura||'']);
  rows.push(['Cliente:', ppto.cliente||'']);
  rows.push(['Evento:', ppto.nombre||'']);
  rows.push(['Fecha evento:', ppto.fecha_evento||'']);
  rows.push(['Lugar:', ppto.lugar||'']);
  rows.push(['PAX:', ppto.personas||'']);
  rows.push(['Ejecutivo:', ppto.ejecutivo_nombre||'']);
  rows.push(['Correo ejecutivo:', ppto.ejecutivo_email||'']);
  rows.push([]);
  rows.push([
    'Subpresupuesto','Subcategoría','Categoría','Ítem','Detalle','Cantidad','Días',
    'Costo Unit.','Costo Total',
    'Precio Unit.','Precio Total',
    'Proveedor','# Factura Proveedor',
    'Costo Real Unit.','Costo Real Total','Ahorro',
    'Margen','% Margen','Margen Real','% Margen Real',
    'OH%','OH $','BCO%','BCO $','Total Costo c/OH+BCO',
    'BCO Real %','Aprobado Financiero','Info'
  ]);

  // Build rows with subpresupuesto support
  let currentSubppto = '';
  itemsFiltrados.forEach(it=>{
    if(it._type==='subppto'){currentSubppto=it.subpresupuesto||'';return;}
    if(it._type==='subcat')return;
    const c=calcItem(it);
    const tieneReal=it.costo_real_unit!==null&&it.costo_real_unit!==undefined;
    rows.push([
      currentSubppto, it.subcategoria||'', it.categoria||'', it.item||'', it.detalle||'',
      c.cantidad, c.dias,
      c.costoUnit, c.costoTotal,
      c.precioU, c.precio,
      it.proveedor||'', it.num_factura_prov||'',
      tieneReal?c.costoRealUnit:'', tieneReal?c.costoRealTotal:'', tieneReal?c.ahorro:'',
      c.margen, c.margenPct.toFixed(1)+'%',
      tieneReal?c.margenReal:'', tieneReal?c.margenRealPct.toFixed(1)+'%':'',
      it.oh_pct??15, c.ohVal, it.bco_pct??5.5, c.bcoVal, c.totalCosto,
      it.bco_real_pct??'', it.costo_aprobado?'Sí':'No',
      it.info||''
    ]);
  });
  const t=calcPpto(ppto);
  rows.push([]);
  rows.push(['RESUMEN']);
  rows.push(['Subtotal costo cotizado:',t.subtotalCosto]);
  if(t.subtotalCostoReal>0){rows.push(['Subtotal costo real:',t.subtotalCostoReal]);rows.push(['Ahorro total:',t.subtotalAhorro]);}
  rows.push(['Subtotal precio cliente:',t.subtotalPrecio]);
  rows.push([`Fee agencia ${ppto.fee_agencia??0}%:`,t.feeAgencia]);
  rows.push(['Total sin IVA:',t.totalSinIva]);
  rows.push(['IVA 15%:',t.iva15]);
  rows.push(['Total con IVA:',t.totalConIva]);
  rows.push(['Margen cotizado:',t.margenTotal,t.margenPct.toFixed(1)+'%']);
  if(t.subtotalCostoReal>0)rows.push(['Margen real:',t.margenRealTotal,t.margenRealPct.toFixed(1)+'%']);
  if(ppto.apply_rebate){rows.push([`Rebate ${ppto.rebate_pct??0}%:`,t.rebate]);rows.push(['Utilidad con rebate:',t.utilidadConRebate,t.utilidadConRebatePct.toFixed(1)+'%']);}
  return rows;
}
