import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { notifyLiquidacion } from '../notifyHelper';
import { S, Label, Toast, Modal } from '../styles.jsx';
import { fmt } from '../calc';
import { CATS_LIQUIDACION, canEditLiq, canChangeLiqToLiquidado } from '../roles';

const r2 = n => Math.round((Number(n)||0) * 100) / 100;
const IVA_OPCIONES = [0, 5, 8, 15];

// Parser de XML de facturas SRI Ecuador
function parsearXMLFactura(xmlText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const get = (tag) => doc.querySelector(tag)?.textContent?.trim() || '';
    const getImpuesto = (codigoPct) => {
      const nodos = doc.querySelectorAll('totalImpuesto');
      for (const n of nodos) {
        if (n.querySelector('codigoPorcentaje')?.textContent === String(codigoPct)) {
          return {
            base: parseFloat(n.querySelector('baseImponible')?.textContent || 0),
            valor: parseFloat(n.querySelector('valor')?.textContent || 0),
          };
        }
      }
      return { base: 0, valor: 0 };
    };

    const estab = get('estab');
    const ptoEmi = get('ptoEmi');
    const secuencial = get('secuencial');
    const numFactura = estab && ptoEmi && secuencial ? `${estab}-${ptoEmi}-${secuencial}` : '';

    // Fecha: DD/MM/YYYY → YYYY-MM-DD
    const fechaRaw = get('fechaEmision');
    let fecha = '';
    if (fechaRaw) {
      const parts = fechaRaw.split('/');
      if (parts.length === 3) fecha = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }

    const imp0  = getImpuesto('0');   // IVA 0%
    const imp15 = getImpuesto('4');   // IVA 15% (código porcentaje 4 en SRI)
    const imp12 = getImpuesto('2');   // IVA 12% legacy

    return {
      ruc_proveedor:    get('ruc'),
      nombre_proveedor: get('razonSocial'),
      num_factura:      numFactura,
      num_autorizacion: get('claveAcceso') || get('numeroAutorizacion'),
      fecha_factura:    fecha,
      subtotal0:        imp0.base,
      subtotal15:       imp15.base || imp12.base,
      iva:              imp15.valor || imp12.valor,
      total:            parseFloat(get('importeTotal') || 0),
      iva_pct:          imp15.base > 0 ? 15 : (imp12.base > 0 ? 12 : 0),
    };
  } catch(e) {
    console.error('Error parseando XML:', e);
    return null;
  }
}

function emptyGasto() {
  return {
    id: crypto.randomUUID(),
    concepto: '', categoria: CATS_LIQUIDACION[0],
    subtotal15: 0, subtotal0: 0, iva_pct: 15, iva: 0, total: 0,
    ruc_proveedor: '', nombre_proveedor: '', num_factura: '', num_autorizacion: '', fecha_factura: '',
    valor_asignado: 0, valor_justificado: 0, notas: '',
    tiene_xml: null, // null=no elegido, true=tiene XML, false=sin XML (nota de venta)
    foto_nota: '', // base64 de foto de nota de venta
  };
}

function ResumenTotales({ t, fmt }) {
  if (!t) return null;
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:8}}>
      <div style={{display:'flex',gap:16,background:'#f0f4f8',borderRadius:8,padding:'10px 14px',flexWrap:'wrap'}}>
        <span style={{fontSize:13}}>Justificado: <strong>{fmt(t.justificado)}</strong></span>
        <span style={{fontSize:13}}>Recibido: <strong style={{color:'#2e8b4e'}}>{fmt(t.valorRecibido)}</strong></span>
        {t.noDeducible>0&&<span style={{fontSize:13}}>No Deducible: <strong style={{color:'#7a5500'}}>{fmt(t.noDeducible)}</strong></span>}
      </div>
      {(t.valorRecibido>0||t.justificado>0)&&(
        <div style={{padding:'10px 14px',borderRadius:8,background:t.diferencia>=0?'#e8f5ee':'#fde8ec',border:`1px solid ${t.diferencia>=0?'#2e8b4e':'#c8264a'}`}}>
          <div style={{fontSize:13,fontWeight:700,color:t.diferencia>=0?'#1a5c3a':'#7a1a1a'}}>
            {t.diferencia>=0
              ? `Usted debe depositar a la cuenta de Matilda el valor de ${fmt(t.diferencia)}`
              : `Matilda debe acreditar a su cuenta el valor de ${fmt(Math.abs(t.diferencia))}`
            }
          </div>
        </div>
      )}
    </div>
  );
}

export default function Liquidaciones({ presupuestos, userRole }) {
  const [liqs, setLiqs]       = useState([]);
  const [editing, setEditing] = useState(null);
  const [toast, setToast]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [openLiq, setOpenLiq] = useState(null);
  const [subTab, setSubTab]   = useState('activas'); // 'activas' | 'liquidadas'

  const emptyLiq = () => ({
    presupuesto_id:'', presupuesto_nombre:'', evento:'',
    cliente_nombre:'', lugar:'', fecha_evento:'', dias_evento:1,
    responsable:'', solicitante:'', estado:'abierta', notas:'',
    gastos:[], solicitud_id:'', valor_recibido:0,
  });

  useEffect(()=>{fetchAll();},[]);

  async function fetchAll(){
    const{data}=await supabase.from('liquidaciones').select('*').order('created_at',{ascending:false});
    setLiqs(data||[]);
  }
  function showToast(m){setToast(m);setTimeout(()=>setToast(''),2500);}

  async function setPpto(id) {
    const pp = presupuestos.find(p=>p.id===id);

    // Cargar solicitudes pagadas de este presupuesto
    const { data: solsData } = await supabase.from('solicitudes')
      .select('*').eq('presupuesto_id', id).eq('estado','pagado').order('created_at');

    const solsCount = (solsData||[]).length;

    // Crear un gasto por cada ítem de cada solicitud pagada
    const gastosSols = (solsData||[]).flatMap(sol =>
      (sol.items||[]).map(it => ({
        ...emptyGasto(),
        concepto: it.item||'',
        valor_asignado: Number(it.valor_solicitado||0),
        notas: `Solicitud del ${sol.created_at?.slice(0,10)} · ${it.notas||''}`.trim(),
        _solicitud_id: sol.id,
        _solicitud_fecha: sol.created_at?.slice(0,10),
      }))
    );

    setEditing(prev=>({
      ...prev,
      presupuesto_id:     id,
      presupuesto_nombre: pp?(pp.nomenclatura||pp.nombre||pp.cliente):'',
      evento:             pp?.nombre||'',
      cliente_nombre:     pp?.cliente||'',
      lugar:              pp?.lugar||'',
      fecha_evento:       pp?.fecha_evento||'',
      dias_evento:        pp?.dias_evento||1,
      gastos:             gastosSols.length>0 ? gastosSols : [emptyGasto()],
      _solicitudes_pagadas: solsData||[],
    }));
  }

  function addGasto(){
    setEditing(prev=>({...prev,gastos:[...(prev.gastos||[]),emptyGasto()]}));
  }

  function updGasto(gid,k,v){
    setEditing(prev=>({
      ...prev,
      gastos:prev.gastos.map(g=>{
        if(g.id!==gid)return g;
        const nums=['subtotal15','subtotal0','valor_asignado','valor_justificado'];
        const upd={...g,[k]:nums.includes(k)?(parseFloat(v)||0):v};
        if(['subtotal15','subtotal0','iva_pct'].includes(k)){
          const pct = (k==='iva_pct' ? Number(v) : Number(upd.iva_pct||15)) / 100;
          upd.iva=r2(upd.subtotal15 * pct);
          upd.total=r2(upd.subtotal15+upd.subtotal0+upd.iva);
          upd.valor_justificado=upd.total;
        }
        return upd;
      })
    }));
  }

  function delGasto(gid){setEditing(prev=>({...prev,gastos:prev.gastos.filter(g=>g.id!==gid)}));}

  async function save(){
    if(!editing.responsable){showToast('Ingresa el responsable');return;}
    if(editing.estado==='liquidado'&&!canChangeLiqToLiquidado(userRole)){
      showToast('⚠️ Solo Financiero o Admin pueden marcar como Liquidado');return;
    }
    setSaving(true);
    let error, savedId = editing.id;
    // Excluir campos internos de React que no son columnas de DB
    const {
      _solicitudes_pagadas,
      ...editingClean
    } = editing;
    // Convertir strings vacíos en campos UUID a null
    if (!editingClean.solicitud_id) editingClean.solicitud_id = null;
    if (!editingClean.presupuesto_id) editingClean.presupuesto_id = null;
    // Convertir strings vacíos en campos date a null
    if (!editingClean.fecha_evento) editingClean.fecha_evento = null;
    if(editingClean.id){({error}=await supabase.from('liquidaciones').update(editingClean).eq('id',editingClean.id));}
    else{let data2;({data:data2,error}=await supabase.from('liquidaciones').insert(editingClean).select().single());if(data2){savedId=data2.id;setEditing(prev=>({...prev,id:data2.id}));}}
    setSaving(false);
    if(error){showToast('Error: '+error.message);return;}

    // Actualizar costos reales en el presupuesto por nombre de concepto
    if (editing.presupuesto_id && (editing.gastos||[]).length > 0) {
      const {data:ppto} = await supabase.from('presupuestos').select('items').eq('id',editing.presupuesto_id).single();
      if (ppto?.items) {
        const totalesPorConcepto = {};
        (editing.gastos||[]).forEach(g => {
          const key = (g.concepto||'').toLowerCase().trim();
          if (key) totalesPorConcepto[key] = (totalesPorConcepto[key]||0) + Number(g.total||0);
        });
        const itemsActualizados = ppto.items.map(it => {
          const key = (it.item||'').toLowerCase().trim();
          if (totalesPorConcepto[key] !== undefined) {
            const cant = Number(it.cantidad||1);
            const dias = Number(it.dias||1);
            const total = totalesPorConcepto[key];
            const costoRealUnit = cant > 0 && dias > 0 ? total / (cant * dias) : total;
            return {...it, costo_real_unit: costoRealUnit};
          }
          return it;
        });
        await supabase.from('presupuestos').update({items:itemsActualizados}).eq('id',editing.presupuesto_id);
      }
    }

    // Advertencia si valores justificados no corresponden a solicitud (sin bloquear)
    const solsPagadas = _solicitudes_pagadas || [];
    if (solsPagadas.length > 0) {
      const totSolicitud = solsPagadas.reduce((a,s)=>{
        return a + (s.items||[]).reduce((b,it)=>b+Number(it.valor_solicitado||0),0);
      }, 0);
      const totJustificado = (editing.gastos||[]).reduce((a,g)=>a+Number(g.total||0),0);
      if (totSolicitud > 0 && Math.abs(totJustificado - totSolicitud) > 0.01) {
        showToast('⚠️ Guardado. Cuidado: los valores justificados no corresponden a la solicitud de valores');
      } else {
        showToast('Guardado ✓');
      }
    } else {
      showToast('Guardado ✓');
    }
    notifyLiquidacion(editing);
    fetchAll();
  }

    async function deleteLiq(id){
    if(!window.confirm('¿Eliminar liquidación?'))return;
    await supabase.from('liquidaciones').delete().eq('id',id);
    fetchAll();
  }

  function totalesLiq(liq){
    const gastos=liq.gastos||[];
    const asignado    = gastos.reduce((a,g)=>a+(g.valor_asignado||0),0);
    const justificado = gastos.reduce((a,g)=>a+(g.total||0),0);
    const noDeducible = gastos.filter(g=>g.categoria==='No deducible').reduce((a,g)=>a+(g.total||0),0);
    const sub0  = gastos.reduce((a,g)=>a+(Number(g.subtotal0)||0),0);
    const sub15 = gastos.reduce((a,g)=>a+(Number(g.subtotal15)||0),0);
    const iva   = gastos.reduce((a,g)=>a+(Number(g.iva)||0),0);
    const valorRecibido = Number(liq.valor_recibido||0);
    const diferencia = valorRecibido - justificado;
    return { asignado, justificado, noDeducible, sub0, sub15, iva, valorRecibido, diferencia };
  }

  // Agrupar gastos por categoría para PDF/Excel
  function agruparPorCat(gastos){
    const map={};
    CATS_LIQUIDACION.forEach(c=>{map[c]=[];});
    gastos.forEach(g=>{
      const cat=g.categoria||CATS_LIQUIDACION[0];
      if(!map[cat])map[cat]=[];
      map[cat].push(g);
    });
    return map;
  }

  function downloadLiqPdf(liq){
    const t=totalesLiq(liq);
    const grupos=agruparPorCat(liq.gastos||[]);
    const catRows=CATS_LIQUIDACION.map(cat=>{
      const items=grupos[cat]||[];
      if(!items.length)return'';
      const subtot=items.reduce((a,g)=>a+(g.total||0),0);
      const itemRows=items.map((g,i)=>`
        <tr style="background:${i%2?'#fafcfe':'#fff'};border-bottom:1px solid #eef2f7;font-size:10px;">
          <td style="padding:5px 10px;">${g.concepto}</td>
          <td style="padding:5px 6px;text-align:right;">${fmt(g.subtotal0)}</td>
          <td style="padding:5px 6px;text-align:right;">${fmt(g.subtotal15)}</td>
          <td style="padding:5px 6px;text-align:right;font-size:9px;color:#666;">${g.iva_pct??15}%</td>
          <td style="padding:5px 6px;text-align:right;">${fmt(g.iva)}</td>
          <td style="padding:5px 6px;text-align:right;font-weight:700;">${fmt(g.total)}</td>
          <td style="padding:5px 6px;font-size:9px;">${g.nombre_proveedor||''}</td>
          <td style="padding:5px 6px;font-size:9px;">${g.ruc_proveedor||''}</td>
          <td style="padding:5px 6px;text-align:right;font-size:10px;">${g.fecha_factura||''}</td>
          <td style="padding:5px 6px;font-size:9px;">${g.num_factura||''}</td>
          <td style="padding:5px 6px;font-size:9px;">${g.num_autorizacion||''}</td>
        </tr>`).join('');
      return`
        <tr><td colspan="11" style="background:#1a5078;color:#fff;padding:5px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${cat}</td></tr>
        ${itemRows}
        <tr style="background:#f0f4f8;font-weight:700;font-size:10px;">
          <td style="padding:5px 10px;">Subtotal ${cat}</td>
          <td style="padding:5px 6px;text-align:right;color:#0d3b5e;">${fmt(items.reduce((a,g)=>a+Number(g.subtotal0||0),0))}</td>
          <td style="padding:5px 6px;text-align:right;color:#0d3b5e;">${fmt(items.reduce((a,g)=>a+Number(g.subtotal15||0),0))}</td>
          <td colspan="2"></td>
          <td style="padding:5px 6px;text-align:right;color:#0d3b5e;font-weight:700;">${fmt(items.reduce((a,g)=>a+Number(g.iva||0),0))}</td>
          <td style="padding:5px 6px;text-align:right;color:#0d3b5e;font-weight:700;">${fmt(subtot)}</td>
          <td colspan="4"></td>
        </tr>`;
    }).join('');

    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Liquidación</title>
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a2e;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.no-print{display:none;}}</style>
    </head><body>
    <button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;background:#c8264a;color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">⬇ PDF</button>
    <div style="max-width:900px;margin:0 auto;">
    <div style="background:#0d3b5e;padding:16px 28px;display:flex;justify-content:space-between;align-items:center;">
      <img src="data:image/png;base64,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" style="height:140px;object-fit:contain;" alt="Matilda Event Designers"/>
      <div style="text-align:right;"><div style="color:#3dbfb8;font-size:9px;letter-spacing:2px;text-transform:uppercase;">Liquidación de Gastos</div></div>
    </div>
    <div style="background:#c8264a;height:3px;"></div>
    <div style="padding:14px 28px;background:#f8fafc;border-bottom:1px solid #dde6ef;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
      ${[
        ['Cliente',       liq.cliente_nombre],
        ['Proyecto',      liq.evento],
        ['Presupuesto',   liq.presupuesto_nombre],
        ['Lugar evento',  liq.lugar],
        ['Fecha evento',  liq.fecha_evento],
        ['Días',          liq.dias_evento?`${liq.dias_evento} día(s)`:''],
        ['Responsable',   liq.responsable],
        ['Solicitante',   liq.solicitante && liq.solicitante!==liq.responsable ? liq.solicitante : ''],
      ].filter(([,v])=>v).map(([l,v])=>`
        <div><div style="font-size:8px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px;">${l}</div><div style="font-weight:700;color:#0d3b5e;font-size:12px;">${v||'—'}</div></div>`).join('')}
    </div>
    <div style="padding:12px 28px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#0d3b5e;color:#fff;font-size:9px;text-transform:uppercase;">
          <th style="padding:6px 10px;text-align:left;">Concepto</th>
          <th style="padding:6px 6px;text-align:right;">Subtotal 0%</th>
          <th style="padding:6px 6px;text-align:right;">Subtotal IVA</th>
          <th style="padding:6px 6px;text-align:right;">IVA%</th>
          <th style="padding:6px 6px;text-align:right;">IVA</th>
          <th style="padding:6px 6px;text-align:right;">Total</th>
          <th style="padding:6px 6px;text-align:left;">Proveedor</th>
          <th style="padding:6px 6px;text-align:left;">RUC</th>
          <th style="padding:6px 6px;text-align:right;">Fecha Fact.</th>
          <th style="padding:6px 6px;text-align:left;"># Factura</th>
          <th style="padding:6px 6px;text-align:left;"># Autorización</th>
        </tr></thead>
        <tbody>
          ${catRows}
          <tr style="background:#0d3b5e;color:#fff;font-weight:700;font-size:11px;">
            <td style="padding:8px 10px;">TOTAL GENERAL</td>
            <td style="padding:8px 6px;text-align:right;">${fmt(t.sub0)}</td>
            <td style="padding:8px 6px;text-align:right;">${fmt(t.sub15)}</td>
            <td colspan="2"></td>
            <td style="padding:8px 6px;text-align:right;">${fmt(t.iva)}</td>
            <td style="padding:8px 6px;text-align:right;color:#3dbfb8;">${fmt(t.justificado)}</td>
            <td colspan="4"></td>
          </tr>
          ${t.noDeducible > 0 ? `
          <tr style="background:#fff8e6;">
            <td colspan="5" style="padding:6px 10px;font-size:11px;color:#7a5500;font-weight:600;">No Deducible</td>
            <td style="padding:6px 6px;text-align:right;font-weight:700;color:#7a5500;">${fmt(t.noDeducible)}</td>
            <td colspan="4"></td>
          </tr>` : ''}
        </tbody>
      </table>
    </div>
    <div style="margin:0 28px 16px;border:1px solid #dde6ef;border-radius:6px;overflow:hidden;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;">
        ${[
          ['Total justificado', fmt(t.justificado), '#0d3b5e'],
          ['Valor recibido',    fmt(t.valorRecibido), '#2e8b4e'],
          ['Diferencia',        fmt(Math.abs(t.diferencia)), t.diferencia>=0?'#2e8b4e':'#c8264a'],
        ].map(([l,v,col])=>`
          <div style="padding:10px 16px;border-right:1px solid #dde6ef;">
            <div style="font-size:10px;color:#888;margin-bottom:3px;">${l}</div>
            <div style="font-size:15px;font-weight:700;color:${col};">${v}</div>
          </div>`).join('')}
      </div>
      <div style="padding:12px 16px;background:${t.diferencia>=0?'#e8f5ee':'#fde8ec'};border-top:1px solid #dde6ef;">
        <div style="font-size:12px;font-weight:700;color:${t.diferencia>=0?'#1a5c3a':'#7a1a1a'};">
          ${t.diferencia >= 0
            ? `Usted debe depositar a la cuenta de Matilda el valor de ${fmt(t.diferencia)}`
            : `Matilda debe acreditar a su cuenta el valor de ${fmt(Math.abs(t.diferencia))}`
          }
        </div>
      </div>
    </div>
    ${liq.comprobante_url?`<div style="margin:0 28px 16px;"><div style="font-size:10px;color:#888;margin-bottom:4px;">Comprobante de depósito:</div><img src="${liq.comprobante_url}" style="max-height:120px;border:1px solid #dde6ef;border-radius:4px;"/></div>`:''}
    <div style="background:#0d3b5e;padding:10px 28px;display:flex;justify-content:center;">
      <div style="font-size:9px;color:#3dbfb8;font-style:italic;">"Donde la estrategia se convierte en experiencia."</div>
    </div>
    </div></body></html>`;
    const w=window.open('','_blank');w.document.write(html);w.document.close();
  }

  function downloadLiqCsv(liq){
    import('xlsx').then(XLSX=>{
      const t=totalesLiq(liq);
      const grupos=agruparPorCat(liq.gastos||[]);
      const rows=[
        ['LIQUIDACIÓN DE GASTOS - MATILDA EVENT DESIGNERS'],[''],
        ['Evento:',liq.evento],['Responsable:',liq.responsable],
        ['Presupuesto:',liq.presupuesto_nombre],['Estado:',liq.estado],[''],
      ];
      CATS_LIQUIDACION.forEach(cat=>{
        const items=grupos[cat]||[];
        if(!items.length)return;
        rows.push([cat.toUpperCase()]);
        rows.push(['Concepto','Sub 0%','Sub 15%','IVA','Total','RUC','Proveedor','# Factura','# Autorización']);
        items.forEach(g=>rows.push([g.concepto,g.subtotal0,g.subtotal15,g.iva,g.total,g.ruc_proveedor,g.nombre_proveedor,g.num_factura,g.num_autorizacion]));
        const subtot=items.reduce((a,g)=>a+(g.total||0),0);
        rows.push([`Subtotal ${cat}`,'','','',subtot,'','','','']);
        rows.push([]);
      });
      rows.push(['TOTAL GENERAL','','','',t.justificado]);
      rows.push([]);
      rows.push(['Monto asignado:',t.asignado]);
      rows.push(['Total justificado:',t.justificado]);
      rows.push(['Saldo:',t.saldo]);
      const ws=XLSX.utils.aoa_to_sheet(rows);
      ws['!cols']=[{wch:40},{wch:12},{wch:12},{wch:10},{wch:12},{wch:15},{wch:25},{wch:20},{wch:20}];
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,'Liquidación');
      XLSX.writeFile(wb,`liquidacion_${liq.responsable||'liq'}.xlsx`);
    }).catch(()=>{
      // CSV fallback
      const t=totalesLiq(liq);const grupos=agruparPorCat(liq.gastos||[]);
      const rows=[['Evento:',liq.evento],['Responsable:',liq.responsable]];
      CATS_LIQUIDACION.forEach(cat=>{const items=grupos[cat]||[];if(!items.length)return;rows.push([cat]);items.forEach(g=>rows.push([g.concepto,g.subtotal0,g.subtotal15,g.iva,g.total,g.ruc_proveedor,g.nombre_proveedor,g.num_factura,g.num_autorizacion]));});
      rows.push(['TOTAL','','','',t.justificado]);rows.push(['Saldo:',t.saldo]);
      const csv=rows.map(r=>r.map(c=>String(c??'')).join(',')).join('\n');
      const blob=new Blob(['\uFEFF'+csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`liquidacion.csv`;a.click();URL.revokeObjectURL(url);
    });
  }

  const estadoColor={abierta:'#3dbfb8',enviada:'#0d3b5e',liquidado:'#2e8b4e'};
  const activas=liqs.filter(l=>l.estado!=='liquidado');
  const liquidadas=liqs.filter(l=>l.estado==='liquidado');
  const listaActual=subTab==='activas'?activas:liquidadas;
  // Solo presupuestos activos para relacionar (no los ya liquidados)
  const pptosActivos=presupuestos.filter(p=>p.estado!=='facturado'||subTab==='activas');

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:20,fontWeight:700,color:'#0d3b5e'}}>💰 Liquidaciones</h2>
        <button style={{...S.btnPrimary,background:'#c8264a'}} onClick={()=>setEditing(emptyLiq())}>+ Nueva liquidación</button>
      </div>

      {/* Sub-tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'2px solid #dde6ef',paddingBottom:0}}>
        <button onClick={()=>setSubTab('activas')} style={{padding:'8px 16px',border:'none',cursor:'pointer',fontSize:13,background:'none',borderBottom:subTab==='activas'?'2px solid #c8264a':'2px solid transparent',fontWeight:subTab==='activas'?700:400,color:subTab==='activas'?'#c8264a':'#5a7a9a',marginBottom:-2}}>
          Activas ({activas.length})
        </button>
        <button onClick={()=>setSubTab('liquidadas')} style={{padding:'8px 16px',border:'none',cursor:'pointer',fontSize:13,background:'none',borderBottom:subTab==='liquidadas'?'2px solid #2e8b4e':'2px solid transparent',fontWeight:subTab==='liquidadas'?700:400,color:subTab==='liquidadas'?'#2e8b4e':'#5a7a9a',marginBottom:-2}}>
          Liquidadas ({liquidadas.length})
        </button>
      </div>

      {/* Modal editor */}
      {editing&&(
        <Modal title={editing.id?'Editar liquidación':'Nueva liquidación'} onClose={()=>setEditing(null)} wide>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={S.grid2}>
              <div>
                <Label>Presupuesto relacionado</Label>
                <select style={S.select} value={editing.presupuesto_id||''} onChange={e=>setPpto(e.target.value)}>
                  <option value="">— Sin relacionar —</option>
                  {presupuestos
                    .map(p=><option key={p.id} value={p.id}>{p.nomenclatura||p.nombre||p.cliente} — {p.estado}</option>)}
                </select>
              </div>
              <div><Label>Nombre del evento</Label><input style={S.input} value={editing.evento||''} onChange={e=>setEditing(p=>({...p,evento:e.target.value}))}/></div>
              <div><Label>Responsable / Supervisor *</Label><input style={S.input} value={editing.responsable||''} onChange={e=>setEditing(p=>({...p,responsable:e.target.value}))}/></div>
              <div><Label>Solicitante (si difiere del responsable)</Label><input style={S.input} value={editing.solicitante||''} onChange={e=>setEditing(p=>({...p,solicitante:e.target.value}))} placeholder="Nombre del solicitante"/></div>
              <div><Label>Valor recibido ($)</Label><input type="number" step="0.01" style={S.input} value={editing.valor_recibido||0} onChange={e=>setEditing(p=>({...p,valor_recibido:Number(e.target.value)}))}/></div>
              <div>
                <Label>Estado</Label>
                <select style={S.select} value={editing.estado||'abierta'} onChange={e=>{
                  if(e.target.value==='liquidado'&&!canChangeLiqToLiquidado(userRole)){
                    showToast('⚠️ Solo Financiero puede marcar como Liquidado');return;
                  }
                  setEditing(p=>({...p,estado:e.target.value}));
                }}>
                  <option value="abierta">Abierta</option>
                  <option value="enviada">Enviada</option>
                  {canChangeLiqToLiquidado(userRole)&&<option value="liquidado">Liquidado</option>}
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}><Label>Notas</Label><input style={S.input} value={editing.notas||''} onChange={e=>setEditing(p=>({...p,notas:e.target.value}))}/></div>
            </div>

            <div style={S.divider}/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <strong style={{fontSize:14,color:'#0d3b5e'}}>Gastos / Facturas</strong>
              {/* Botón global solo cuando NO hay solicitudes pagadas */}
              {!(editing._solicitudes_pagadas||[]).length && (
                <button style={{...S.btnPrimary,background:'#3dbfb8',fontSize:13}} onClick={addGasto}>+ Agregar gasto</button>
              )}
            </div>

            {/* Gastos agrupados por solicitud pagada */}
            {(editing._solicitudes_pagadas||[]).length > 0 && (
              <div>
                {(editing._solicitudes_pagadas||[]).map(sol => {
                  const valorPagado = (sol.items||[]).reduce((a,it)=>a+Number(it.valor_solicitado||0),0);
                  const gastosEsta = (editing.gastos||[]).filter(g=>g._solicitud_id===sol.id);
                  const totalJust = gastosEsta.reduce((a,g)=>a+Number(g.total||0),0);
                  return (
                    <div key={sol.id} style={{marginBottom:16}}>
                      {/* Banda azul por solicitud */}
                      <div style={{background:'#0d3b5e',color:'#fff',padding:'8px 14px',borderRadius:'8px 8px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <span style={{fontSize:13,fontWeight:700}}>📤 Solicitud del {sol.created_at?.slice(0,10)}</span>
                          <span style={{fontSize:11,color:'rgba(255,255,255,.7)'}}>{(sol.items||[]).length} ítem(s)</span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:12}}>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:9,color:'rgba(255,255,255,.6)',textTransform:'uppercase'}}>Valor pagado</div>
                            <div style={{fontSize:14,fontWeight:700,color:'#3dbfb8'}}>{fmt(valorPagado)}</div>
                          </div>
                          <button style={{background:'rgba(255,255,255,.15)',border:'1px solid rgba(255,255,255,.3)',borderRadius:6,color:'#fff',padding:'4px 10px',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}
                            onClick={()=>setEditing(prev=>({...prev,gastos:[...(prev.gastos||[]),{...emptyGasto(),_solicitud_id:sol.id,_solicitud_fecha:sol.created_at?.slice(0,10)}]}))}>
                            + Agregar gasto
                          </button>
                        </div>
                      </div>
                      {/* Ítems de esta solicitud */}
                      <div style={{border:'1px solid #dde6ef',borderTop:'none',borderRadius:'0 0 8px 8px',padding:8}}>
                        {gastosEsta.length===0 && (
                          <div style={{textAlign:'center',padding:'12px',color:'#aaa',fontSize:12}}>Sin gastos — agregá uno con el botón de arriba</div>
                        )}
                        {gastosEsta.map((g,gi)=>(
                        <div key={g.id} style={{border:'1px solid #dde6ef',borderRadius:8,padding:12,marginBottom:8}}>
                          {/* Selector tipo comprobante */}
                          {g.tiene_xml === null && (
                            <div style={{display:'flex',gap:8,marginBottom:10}}>
                              <button onClick={()=>updGasto(g.id,'tiene_xml',true)} style={{flex:1,padding:'7px 10px',borderRadius:8,border:'2px solid #0d3b5e',background:'#eef4fb',cursor:'pointer',fontFamily:'inherit',fontWeight:600,fontSize:12}}>📄 XML (factura electrónica)</button>
                              <button onClick={()=>updGasto(g.id,'tiene_xml',false)} style={{flex:1,padding:'7px 10px',borderRadius:8,border:'2px solid #7c3aed',background:'#f5f3ff',cursor:'pointer',fontFamily:'inherit',fontWeight:600,fontSize:12}}>🧾 Sin XML (nota de venta)</button>
                            </div>
                          )}
                          {g.tiene_xml === true && (
                            <div style={{background:'#eef4fb',borderRadius:8,padding:'8px 12px',marginBottom:10,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                              <span style={{fontSize:12,color:'#0d3b5e',fontWeight:700}}>📄 Factura XML SRI</span>
                              <label style={{cursor:'pointer'}}>
                                <input type="file" accept=".xml" style={{display:'none'}} onChange={e=>{
                                  const file=e.target.files[0]; if(!file) return;
                                  const reader=new FileReader();
                                  reader.onload=ev=>{
                                    const datos=parsearXMLFactura(ev.target.result);
                                    if(!datos){alert('No se pudo leer el XML. Verificá que sea una factura electrónica del SRI.');return;}
                                    setEditing(prev=>({...prev,gastos:prev.gastos.map(gg=>gg.id===g.id?{...gg,...datos,tiene_xml:true,concepto:gg.concepto||datos.nombre_proveedor}:gg)}));
                                  };
                                  reader.readAsText(file);
                                }}/>
                                <span style={{padding:'5px 12px',background:'#0d3b5e',color:'#fff',borderRadius:6,fontSize:12,fontWeight:600}}>
                                  {g.num_factura?`✓ ${g.num_factura}`:'Seleccionar XML'}
                                </span>
                              </label>
                              {g.num_factura&&<span style={{fontSize:11,color:'#2e8b4e',fontWeight:600}}>✓ Datos auto-completados</span>}
                              <button onClick={()=>updGasto(g.id,'tiene_xml',null)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:11,marginLeft:'auto'}}>cambiar tipo</button>
                            </div>
                          )}
                          {g.tiene_xml === false && (
                            <div style={{background:'#f5f3ff',borderRadius:8,padding:'8px 12px',marginBottom:10,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                              <span style={{fontSize:12,color:'#7c3aed',fontWeight:700}}>🧾 Nota de venta / Manual</span>
                              <label style={{cursor:'pointer'}}>
                                <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{
                                  const file=e.target.files[0]; if(!file) return;
                                  const reader=new FileReader();
                                  reader.onload=ev=>updGasto(g.id,'foto_nota',ev.target.result);
                                  reader.readAsDataURL(file);
                                }}/>
                                <span style={{padding:'5px 12px',background:'#7c3aed',color:'#fff',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                                  {g.foto_nota?'✓ Foto cargada':'Subir foto'}
                                </span>
                              </label>
                              {g.foto_nota&&<img src={g.foto_nota} alt="nota" style={{height:36,borderRadius:4,border:'1px solid #ddd'}}/>}
                              <button onClick={()=>updGasto(g.id,'tiene_xml',null)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:11,marginLeft:'auto'}}>cambiar tipo</button>
                            </div>
                          )}
                          <div style={{display:'grid',gridTemplateColumns:'2fr 2fr auto',gap:8,marginBottom:8,alignItems:'end'}}>
                            <div><Label>Concepto</Label><input style={S.input} value={g.concepto} onChange={e=>updGasto(g.id,'concepto',e.target.value)}/></div>
                            <div><Label>Categoría</Label>
                              <select style={S.select} value={g.categoria||CATS_LIQUIDACION[0]} onChange={e=>updGasto(g.id,'categoria',e.target.value)}>
                                {CATS_LIQUIDACION.map(c=><option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <button style={S.btnRed} onClick={()=>delGasto(g.id)}>🗑</button>
                          </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginBottom:8}}>
                  <div><Label>Subtotal 0%</Label><input type="number" style={S.input} value={g.subtotal0} onChange={e=>updGasto(g.id,'subtotal0',e.target.value)}/></div>
                  <div>
                    <Label>Subtotal con IVA</Label>
                    <input type="number" style={S.input} value={g.subtotal15} onChange={e=>updGasto(g.id,'subtotal15',e.target.value)}/>
                  </div>
                  <div>
                    <Label>IVA %</Label>
                    <select style={S.select} value={g.iva_pct??15} onChange={e=>updGasto(g.id,'iva_pct',Number(e.target.value))}>
                      {IVA_OPCIONES.map(p=><option key={p} value={p}>{p}%{p===15?' (estándar)':p===8?' (turismo)':p===5?' (construcción)':' (exento)'}</option>)}
                    </select>
                  </div>
                  <div><Label>IVA (auto)</Label><input style={S.inputRO} readOnly value={fmt(g.iva)}/></div>
                  <div><Label>Total (auto)</Label><input style={{...S.inputRO,fontWeight:700}} readOnly value={fmt(g.total)}/></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr',gap:8}}>
                  <div><Label>Fecha factura</Label><input type="date" style={S.input} value={g.fecha_factura||''} onChange={e=>updGasto(g.id,'fecha_factura',e.target.value)}/></div>
                  <div><Label>RUC proveedor</Label><input style={S.input} value={g.ruc_proveedor||''} onChange={e=>updGasto(g.id,'ruc_proveedor',e.target.value)}/></div>
                  <div><Label>Nombre proveedor</Label><input style={S.input} value={g.nombre_proveedor||''} onChange={e=>updGasto(g.id,'nombre_proveedor',e.target.value)}/></div>
                  <div><Label># Factura</Label><input style={S.input} value={g.num_factura||''} onChange={e=>updGasto(g.id,'num_factura',e.target.value)}/></div>
                  <div><Label># Autorización</Label><input style={S.input} value={g.num_autorizacion||''} onChange={e=>updGasto(g.id,'num_autorizacion',e.target.value)}/></div>
                        </div>
                        </div>
                        ))}
                        {/* Subtotal por solicitud */}
                        {gastosEsta.length > 0 && (
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:'#eef4fb',borderRadius:6,marginTop:4}}>
                            <span style={{fontSize:12,color:'#0d3b5e',fontWeight:600}}>Subtotal justificado esta solicitud</span>
                            <span style={{fontSize:14,fontWeight:700,color:totalJust>=valorPagado?'#2e8b4e':'#c8264a'}}>{fmt(totalJust)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

              </div>
            )}

            {/* Gastos sin solicitud — siempre visible */}
            {(editing.gastos||[]).filter(g=>!g._solicitud_id).length > 0 && (
              <div style={{marginTop:8}}>
                <div style={{background:'#555',color:'#fff',padding:'6px 12px',borderRadius:'6px 6px 0 0',fontSize:12,fontWeight:700}}>Gastos adicionales</div>
                    {(editing.gastos||[]).filter(g=>!g._solicitud_id).map(g=>(
                      <div key={g.id} style={{border:'1px solid #dde6ef',borderRadius:8,padding:12,marginBottom:8}}>
                        {g.tiene_xml===null&&<div style={{display:'flex',gap:8,marginBottom:10}}>
                          <button onClick={()=>updGasto(g.id,'tiene_xml',true)} style={{flex:1,padding:'7px',borderRadius:8,border:'2px solid #0d3b5e',background:'#eef4fb',cursor:'pointer',fontFamily:'inherit',fontWeight:600,fontSize:12}}>📄 XML</button>
                          <button onClick={()=>updGasto(g.id,'tiene_xml',false)} style={{flex:1,padding:'7px',borderRadius:8,border:'2px solid #7c3aed',background:'#f5f3ff',cursor:'pointer',fontFamily:'inherit',fontWeight:600,fontSize:12}}>🧾 Sin XML</button>
                        </div>}
                        {g.tiene_xml===true&&<div style={{background:'#eef4fb',borderRadius:8,padding:'8px 12px',marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontSize:12,color:'#0d3b5e',fontWeight:700}}>📄 XML SRI</span>
                          <label style={{cursor:'pointer'}}><input type="file" accept=".xml" style={{display:'none'}} onChange={e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{const datos=parsearXMLFactura(ev.target.result);if(!datos){alert('XML inválido');return;}setEditing(prev=>({...prev,gastos:prev.gastos.map(gg=>gg.id===g.id?{...gg,...datos,tiene_xml:true}:gg)}));};reader.readAsText(file);}}/>
                            <span style={{padding:'5px 12px',background:'#0d3b5e',color:'#fff',borderRadius:6,fontSize:12,fontWeight:600}}>{g.num_factura?`✓ ${g.num_factura}`:'Seleccionar XML'}</span>
                          </label>
                          {g.num_factura&&<span style={{fontSize:11,color:'#2e8b4e',fontWeight:600}}>✓ Auto-completado</span>}
                          <button onClick={()=>updGasto(g.id,'tiene_xml',null)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:11,marginLeft:'auto'}}>cambiar</button>
                        </div>}
                        {g.tiene_xml===false&&<div style={{background:'#f5f3ff',borderRadius:8,padding:'8px 12px',marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontSize:12,color:'#7c3aed',fontWeight:700}}>🧾 Nota de venta</span>
                          <label style={{cursor:'pointer'}}><input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>updGasto(g.id,'foto_nota',ev.target.result);reader.readAsDataURL(file);}}/>
                            <span style={{padding:'5px 12px',background:'#7c3aed',color:'#fff',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer'}}>{g.foto_nota?'✓ Foto':'Subir foto'}</span>
                          </label>
                          {g.foto_nota&&<img src={g.foto_nota} alt="" style={{height:36,borderRadius:4}}/>}
                          <button onClick={()=>updGasto(g.id,'tiene_xml',null)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:11,marginLeft:'auto'}}>cambiar</button>
                        </div>}
                        <div style={{display:'grid',gridTemplateColumns:'2fr 2fr auto',gap:8,marginBottom:8,alignItems:'end'}}>
                          <div><Label>Concepto</Label><input style={S.input} value={g.concepto} onChange={e=>updGasto(g.id,'concepto',e.target.value)}/></div>
                          <div><Label>Categoría</Label>
                            <select style={S.select} value={g.categoria||CATS_LIQUIDACION[0]} onChange={e=>updGasto(g.id,'categoria',e.target.value)}>
                              {CATS_LIQUIDACION.map(c=><option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <button style={S.btnRed} onClick={()=>delGasto(g.id)}>🗑</button>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginBottom:8}}>
                          <div><Label>Subtotal 0%</Label><input type="number" style={S.input} value={g.subtotal0} onWheel={e=>e.target.blur()} onChange={e=>updGasto(g.id,'subtotal0',e.target.value)}/></div>
                          <div><Label>Subtotal con IVA</Label><input type="number" style={S.input} value={g.subtotal15} onWheel={e=>e.target.blur()} onChange={e=>updGasto(g.id,'subtotal15',e.target.value)}/></div>
                          <div><Label>IVA %</Label>
                            <select style={S.select} value={g.iva_pct??15} onChange={e=>updGasto(g.id,'iva_pct',Number(e.target.value))}>
                              {IVA_OPCIONES.map(p=><option key={p} value={p}>{p}% {p===15?'(estándar)':p===0?'(exento)':''}</option>)}
                            </select>
                          </div>
                          <div><Label>IVA (auto)</Label><div style={{...S.input,background:'#f0f4f8',color:'#0d3b5e',fontWeight:700}}>{fmt(Number(g.subtotal15||0)*((g.iva_pct??15)/100))}</div></div>
                        </div>
                        <div><Label>Total (auto)</Label><div style={{...S.input,background:'#eef4fb',color:'#0d3b5e',fontWeight:700,fontSize:15}}>{fmt(Number(g.subtotal0||0)+Number(g.subtotal15||0)+Number(g.subtotal15||0)*((g.iva_pct??15)/100))}</div></div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr',gap:8,marginTop:8}}>
                          <div><Label>Fecha factura</Label><input type="date" style={S.input} value={g.fecha_factura||''} onChange={e=>updGasto(g.id,'fecha_factura',e.target.value)}/></div>
                          <div><Label>RUC proveedor</Label><input style={S.input} value={g.ruc_proveedor||''} onChange={e=>updGasto(g.id,'ruc_proveedor',e.target.value)}/></div>
                          <div><Label>Nombre proveedor</Label><input style={S.input} value={g.nombre_proveedor||''} onChange={e=>updGasto(g.id,'nombre_proveedor',e.target.value)}/></div>
                          <div><Label># Factura</Label><input style={S.input} value={g.num_factura||''} onChange={e=>updGasto(g.id,'num_factura',e.target.value)}/></div>
                          <div><Label># Autorización</Label><input style={S.input} value={g.num_autorizacion||''} onChange={e=>updGasto(g.id,'num_autorizacion',e.target.value)}/></div>
                        </div>
                      </div>
                    ))}
              </div>
            )}

            {(editing.gastos||[]).length>0 && <ResumenTotales t={totalesLiq(editing)} fmt={fmt}/>}

            <div style={{background:'#f0f7ff',borderRadius:8,padding:'10px 14px',border:'1px dashed #3dbfb8'}}>
              <Label>Comprobante de depósito (imagen)</Label>
              <input type="file" accept="image/*" style={{marginTop:6,fontSize:13}}
                onChange={e=>{
                  const file=e.target.files[0];if(!file)return;
                  const reader=new FileReader();
                  reader.onload=ev=>setEditing(p=>({...p,comprobante_url:ev.target.result}));
                  reader.readAsDataURL(file);
                }}/>
              {editing.comprobante_url&&<img src={editing.comprobante_url} alt="comprobante" style={{marginTop:8,maxHeight:100,borderRadius:4,border:'1px solid #dde6ef'}}/>}
            </div>

            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
              <button style={S.btnSecondary} onClick={()=>setEditing(null)}>Cancelar</button>
              <button style={S.btnPrimary} onClick={save} disabled={saving}>{saving?'Guardando…':'💾 Guardar'}</button>
            </div>
          </div>
        </Modal>
      )}

      {listaActual.length===0&&<div style={S.empty}>{subTab==='activas'?'Sin liquidaciones activas.':'Sin liquidaciones liquidadas.'}</div>}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {listaActual.map(liq=>{
          const t=totalesLiq(liq);const open=openLiq===liq.id;
          const bloqueado=!canEditLiq(userRole,liq.estado);
          return(
            <div key={liq.id} style={{...S.card,border:`1px solid ${bloqueado?'#2e8b4e44':'#dde6ef'}`}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{flex:1,cursor:'pointer'}} onClick={()=>setOpenLiq(open?null:liq.id)}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                    <span style={{fontSize:15,fontWeight:700,color:'#0d3b5e'}}>{liq.evento||liq.responsable}</span>
                    <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:5,background:(estadoColor[liq.estado]||'#888')+'22',color:estadoColor[liq.estado]||'#888',border:`1px solid ${estadoColor[liq.estado]||'#888'}44`}}>{liq.estado}</span>
                    {bloqueado&&<span style={{fontSize:10,background:'#2e8b4e22',color:'#2e8b4e',padding:'1px 5px',borderRadius:3,fontWeight:700}}>🔒</span>}
                  </div>
                  <div style={{fontSize:12,color:'#8aa0b8',display:'flex',gap:12}}>
                    {liq.presupuesto_nombre&&<span>📋 {liq.presupuesto_nombre}</span>}
                    {liq.responsable&&<span>👤 {liq.responsable}</span>}
                    <span>🧾 {(liq.gastos||[]).length} gastos</span>
                  </div>
                </div>
                <div style={{textAlign:'right',marginRight:12}}>
                  <div style={{fontSize:11,color:'#aaa'}}>Justificado / Recibido</div>
                  <div style={{fontSize:15,fontWeight:700}}>{fmt(t.justificado)} / {fmt(t.valorRecibido)}</div>
                  <div style={{fontSize:12,fontWeight:700,color:t.diferencia>=0?'#2e8b4e':'#c8264a'}}>
                    {t.diferencia>=0?'A depositar':'A acreditar'}: {fmt(Math.abs(t.diferencia))}
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {!bloqueado&&<button style={S.btnSm} onClick={async()=>{
                    // Load solicitudes pagadas for this presupuesto
                    let solsPagadas = [];
                    if (liq.presupuesto_id) {
                      const {data} = await supabase.from('solicitudes').select('*').eq('presupuesto_id',liq.presupuesto_id).eq('estado','pagado').order('created_at');
                      solsPagadas = data||[];
                    }
                    setEditing({...liq, _solicitudes_pagadas: solsPagadas});
                  }}>✏️ Editar</button>}
                  <button style={S.btnSm} onClick={()=>downloadLiqPdf(liq)}>📄 PDF</button>
                  <button style={S.btnSm} onClick={()=>downloadLiqCsv(liq)}>📊 CSV</button>
                  {userRole==='admin'&&<button style={S.btnRed} onClick={()=>deleteLiq(liq.id)}>🗑</button>}
                </div>
              </div>
              {open&&(liq.gastos||[]).length>0&&(
                <div style={{marginTop:12,borderTop:'1px solid #eee',paddingTop:12,overflowX:'auto'}}>
                  {CATS_LIQUIDACION.map(cat=>{
                    const items=(liq.gastos||[]).filter(g=>(g.categoria||CATS_LIQUIDACION[0])===cat);
                    if(!items.length)return null;
                    const subtot=items.reduce((a,g)=>a+(g.total||0),0);
                    return(
                      <div key={cat} style={{marginBottom:12}}>
                        <div style={{background:'#0d3b5e',color:'#fff',padding:'4px 10px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>{cat}</div>
                        <table style={{width:'100%',fontSize:11,borderCollapse:'collapse'}}>
                          <thead><tr style={{background:'#e8f0f8'}}>{['Concepto','Sub 0%','Sub 15%','IVA','Total','RUC','Proveedor','# Factura','# Autorización'].map(h=><th key={h} style={{padding:'5px 8px',textAlign:h==='Concepto'?'left':'right',color:'#0d3b5e',fontSize:9,textTransform:'uppercase'}}>{h}</th>)}</tr></thead>
                          <tbody>
                            {items.map(g=>(
                              <tr key={g.id} style={{borderBottom:'1px solid #eef2f7'}}>
                                <td style={{padding:'5px 8px'}}>{g.concepto}</td>
                                <td style={{padding:'5px 8px',textAlign:'right'}}>{fmt(g.subtotal0)}</td>
                                <td style={{padding:'5px 8px',textAlign:'right'}}>{fmt(g.subtotal15)}</td>
                                <td style={{padding:'5px 8px',textAlign:'right'}}>{fmt(g.iva)}</td>
                                <td style={{padding:'5px 8px',textAlign:'right',fontWeight:700}}>{fmt(g.total)}</td>
                                <td style={{padding:'5px 8px',fontSize:10}}>{g.ruc_proveedor}</td>
                                <td style={{padding:'5px 8px',fontSize:10}}>{g.nombre_proveedor}</td>
                                <td style={{padding:'5px 8px',fontSize:10}}>{g.num_factura}</td>
                                <td style={{padding:'5px 8px',fontSize:10}}>{g.num_autorizacion}</td>
                              </tr>
                            ))}
                            <tr style={{background:'#f0f4f8',fontWeight:700}}>
                              <td style={{padding:'5px 8px',color:'#0d3b5e'}}>Subtotal {cat}</td>
                              <td colSpan={3}></td>
                              <td style={{padding:'5px 8px',textAlign:'right',color:'#0d3b5e'}}>{fmt(subtot)}</td>
                              <td colSpan={4}></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                  <div style={{background:'#0d3b5e',color:'#fff',padding:'8px 14px',display:'flex',justifyContent:'space-between',borderRadius:4}}>
                    <span style={{fontWeight:700,fontSize:12}}>Total justificado</span>
                    <span style={{fontWeight:700,fontSize:14,color:'#3dbfb8'}}>{fmt(t.justificado)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Toast msg={toast}/>
    </div>
  );
}
