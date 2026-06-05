import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { S, Label, Badge, Toast } from '../styles.jsx';
import { calcItem, calcPpto, genNomenclatura, fmt, fmtPct, fmtDate } from '../calc';
import { generatePdfClienteHTML, generatePdfFinancieroHTML, generateExcelFinancieroData } from './PdfCliente';
import AlcanceTab from './AlcanceTab';
import {
  ESTADOS_PPTO, ESTADOS_PPTO_LABELS, ESTADOS_PPTO_COLORS,
  canChangeEstadoPpto, canEditPpto, canApproveCostoReal, canEditBcoReal,
  canMarkEjecutado, canMarkCerradoProduccion,
  canDownloadPdfFinanciero, canDownloadExcel, canDownloadPdfCliente,
  getFlujoBtnLabel, getFlujoBtnNextEstado, getFeeForCliente,
} from '../roles';

const SESSION_KEY = 'matilda_editor_draft';
const SESSION_TAB = 'matilda_editor_tab';
const ESTADOS_CIERRE = ['aprobado','pendiente_facturar','facturado'];

function emptyItem(p) {
  return {
    id: crypto.randomUUID(),
    item:'', detalle:'', cantidad:1, dias:1,
    costo_unit:0, costo_real_unit:null, bco_real_pct:null,
    costo_aprobado:false,
    oh_pct:Number(p?.oh_pct??15), bco_pct:Number(p?.bco_pct??5.5),
    precio_unit:0, proveedor:'', num_factura_prov:'', info:'',
    categoria:'', subcategoria:'', es_liquidacion:false,
    foto_referencia:null,
  };
}

// ── Flujo de caja ────────────────────────────────────────────
function FlujoCaja({ p, fmt, fmtDate }) {
  const items = (p.items||[]).filter(it=>!it._type && it.condicion_pago);
  if (!items.length) return (
    <div style={{marginTop:16,background:'#f8fafc',border:'1px dashed #dde6ef',borderRadius:12,padding:'16px',textAlign:'center',color:'#aaa',fontSize:13}}>
      Sin ítems con condición de pago — agregá Contado, Crédito o Abono en cada ítem para ver el flujo de caja
    </div>
  );

  const hoyStr = new Date().toISOString().slice(0,10);
  // Fecha base para créditos: fecha_inicio_produccion o hoy
  const fechaBase = p.fecha_inicio_produccion || hoyStr;

  function addDays(dateStr, days) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T12:00');
    d.setDate(d.getDate() + Number(days||0));
    return d.toISOString().slice(0,10);
  }

  // Agrupar pagos por fecha
  const pagos = {};
  let totalSinFlujo = 0;

  items.forEach(it => {
    const precio = Number(it.precio_unit||0) * Number(it.cantidad||0) * Number(it.dias||1);
    const cond = it.condicion_pago;

    if (cond === 'Contado') {
      // 100% al inicio de producción
      pagos[fechaBase] = (pagos[fechaBase]||[]);
      pagos[fechaBase].push({ label:'Contado', monto:precio });
    } else if (cond === 'Crédito') {
      // 100% desde fecha base + días crédito
      const dias = Number(it.dias_credito||0);
      const fecha = addDays(fechaBase, dias);
      if (fecha) {
        pagos[fecha] = (pagos[fecha]||[]);
        pagos[fecha].push({ label:`Crédito ${dias}d`, monto:precio });
      } else totalSinFlujo += precio;
    } else if (cond === 'Abono') {
      const pct = Number(it.abono_pct||50) / 100;
      const dias = Number(it.dias_credito_saldo||0);
      const abono = precio * pct;
      const saldo = precio - abono;
      // Abono al inicio de producción
      pagos[fechaBase] = (pagos[fechaBase]||[]);
      pagos[fechaBase].push({ label:`Abono ${it.abono_pct||50}%`, monto:abono });
      // Saldo tras días de crédito
      const fechaSaldo = addDays(fechaBase, dias);
      if (fechaSaldo) {
        pagos[fechaSaldo] = (pagos[fechaSaldo]||[]);
        pagos[fechaSaldo].push({ label:`Saldo ${dias}d`, monto:saldo });
      } else totalSinFlujo += saldo;
    } else {
      totalSinFlujo += precio;
    }
  });

  const fechasOrdenadas = Object.keys(pagos).sort();
  const totalItems = items.reduce((a,it)=>a+Number(it.precio_unit||0)*Number(it.cantidad||0)*Number(it.dias||1),0);
  const totalFlujo = fechasOrdenadas.reduce((a,f)=>a+(pagos[f]||[]).reduce((x,p)=>x+p.monto,0),0);

  return (
    <div style={{marginTop:16,background:'#fff',border:'1px solid #dde6ef',borderRadius:12,overflow:'hidden'}}>
      <div style={{background:'#0d3b5e',padding:'10px 16px',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <span style={{color:'#fff',fontWeight:700,fontSize:13}}>💰 Flujo de caja</span>
        <span style={{color:'rgba(255,255,255,.6)',fontSize:11}}>
          Base: {fmtDate(fechaBase)}{p.fecha_inicio_produccion?' (fecha inicio producción)':' (hoy — configurá la fecha en Info)'}
        </span>
      </div>
      <div style={{padding:'14px 16px'}}>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {fechasOrdenadas.map(fecha=>{
            const entradas = pagos[fecha]||[];
            const totalFecha = entradas.reduce((a,e)=>a+e.monto,0);
            const esFechaBase = fecha === fechaBase;
            return (
              <div key={fecha} style={{padding:'10px 14px',background:esFechaBase?'#e8f5ee':'#eef4fb',borderRadius:8,border:`1px solid ${esFechaBase?'#86efac':'#c8d8e8'}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:entradas.length>1?6:0}}>
                  <div>
                    <div style={{fontSize:11,color:'#888'}}>{esFechaBase?'📅 Inicio de producción':'📅 Cobro'}</div>
                    <div style={{fontSize:14,fontWeight:600,color:esFechaBase?'#2e8b4e':'#0d3b5e'}}>{fmtDate(fecha)}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:18,fontWeight:700,color:esFechaBase?'#2e8b4e':'#0d3b5e'}}>{fmt(totalFecha)}</div>
                    <div style={{fontSize:11,color:'#888'}}>{totalItems>0?((totalFecha/totalItems)*100).toFixed(0):0}% del total</div>
                  </div>
                </div>
                {entradas.length > 1 && (
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {entradas.map((e,i)=>(
                      <span key={i} style={{fontSize:11,background:'rgba(0,0,0,.06)',padding:'2px 8px',borderRadius:4,color:'#555'}}>
                        {e.label}: {fmt(e.monto)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {totalSinFlujo > 0 && (
            <div style={{padding:'8px 14px',background:'#fff8f8',borderRadius:8,border:'1px solid #fca5a5',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:12,color:'#991b1b'}}>⚠️ Ítems sin condición de pago definida</span>
              <span style={{fontWeight:700,color:'#991b1b'}}>{fmt(totalSinFlujo)}</span>
            </div>
          )}
        </div>
        <div style={{marginTop:12,paddingTop:10,borderTop:'1px solid #e8e8e8',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <span style={{fontSize:13,color:'#555'}}>En flujo: <strong style={{color:'#0d3b5e'}}>{fmt(totalFlujo)}</strong></span>
          {totalSinFlujo>0&&<span style={{fontSize:13,color:'#991b1b'}}>Sin asignar: <strong>{fmt(totalSinFlujo)}</strong></span>}
          <span style={{fontSize:13,color:'#555'}}>Total presupuesto: <strong style={{color:'#0d3b5e'}}>{fmt(totalItems)}</strong></span>
        </div>
      </div>
    </div>
  );
}



// ── Componente de opciones adicionales ───────────────────────
function OpcionesAdicionales({ p, setP, bloqueado, fmt, fmtPct, calcItem, S, Label }) {
  const [openOp, setOpenOp] = useState(null);
  const opciones = p.opciones_adicionales || [];

  function addOpcion() {
    const nombre = window.prompt('Nombre de la opción (ej: Opción A - Centro de mesa alternativo):');
    if (!nombre?.trim()) return;
    const nueva = { id: crypto.randomUUID(), nombre: nombre.trim(), items: [] };
    setP(prev => ({ ...prev, opciones_adicionales: [...(prev.opciones_adicionales||[]), nueva] }));
    setOpenOp(nueva.id);
  }

  function updateOpcion(opId, changes) {
    setP(prev => ({
      ...prev,
      opciones_adicionales: (prev.opciones_adicionales||[]).map(o => o.id===opId ? {...o,...changes} : o)
    }));
  }

  function deleteOpcion(opId) {
    setP(prev => ({ ...prev, opciones_adicionales: (prev.opciones_adicionales||[]).filter(o=>o.id!==opId) }));
    if (openOp===opId) setOpenOp(null);
  }

  function addItemToOp(opId) {
    const items = (opciones.find(o=>o.id===opId)?.items||[]).concat({
      id:crypto.randomUUID(), item:'', detalle:'', cantidad:1, dias:1,
      precio_unit:0, costo_unit:0, oh_pct:Number(p.oh_pct||15), bco_pct:Number(p.bco_pct||5.5),
      subcategoria:'', categoria:'', razon_social:'', imagen_url:'',
    });
    updateOpcion(opId, { items });
  }

  function updItemOp(opId, itemId, field, value) {
    const nums = ['costo_unit','precio_unit','cantidad','dias','oh_pct','bco_pct'];
    const items = (opciones.find(o=>o.id===opId)?.items||[]).map(it =>
      it.id===itemId ? {...it,[field]:nums.includes(field)?Number(value):value} : it
    );
    updateOpcion(opId, { items });
  }

  function promoverAItems(opId) {
    const op = opciones.find(o=>o.id===opId);
    if (!op) return;
    if (!window.confirm(`¿Agregar los ítems de "${op.nombre}" al presupuesto principal?`)) return;
    // Agregar como nueva subcategoría en el presupuesto principal
    const subcat = { id:crypto.randomUUID(), _type:'subcat', subcategoria:op.nombre, item:'', detalle:'', cantidad:0, dias:0, costo_unit:0, precio_unit:0, oh_pct:0, bco_pct:0, categoria:'', es_liquidacion:false };
    const itemsNuevos = op.items.map(it => ({ ...it, id:crypto.randomUUID(), subcategoria:op.nombre }));
    setP(prev => ({
      ...prev,
      items: [...prev.items, subcat, ...itemsNuevos],
      opciones_adicionales: (prev.opciones_adicionales||[]).filter(o=>o.id!==opId),
    }));
  }

  return (
    <div style={{ marginTop:24, borderTop:'2px dashed #dde6ef', paddingTop:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'#7c3aed' }}>✦ Opciones adicionales</div>
          <div style={{ fontSize:11, color:'#aaa' }}>Aparecen en el PDF cliente después de los totales — no entran en los cálculos</div>
        </div>
        {!bloqueado && <button style={{...S.btnPrimary,background:'#7c3aed'}} onClick={addOpcion}>+ Agregar opción</button>}
      </div>

      {opciones.length===0 && (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#ccc', fontSize:13, border:'1px dashed #e8e8e8', borderRadius:10 }}>
          Sin opciones adicionales
        </div>
      )}

      {opciones.map(op => {
        const totalOp = (op.items||[]).reduce((a,it) => a + calcItem(it).precio, 0);
        const isOpen  = openOp===op.id;
        return (
          <div key={op.id} style={{ border:`1px solid ${isOpen?'#7c3aed':'#e8e8e8'}`, borderRadius:10, marginBottom:10, overflow:'hidden' }}>
            {/* Header opción */}
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:isOpen?'#f5f3ff':'#fafafa', cursor:'pointer' }}
              onClick={()=>setOpenOp(isOpen?null:op.id)}>
              <span style={{ fontSize:13, fontWeight:600, color:'#7c3aed', flex:1 }}>{op.nombre}</span>
              <span style={{ fontSize:12, color:'#888' }}>{(op.items||[]).length} ítems · {fmt(totalOp)}</span>
              {!bloqueado && <>
                <button onClick={e=>{e.stopPropagation();promoverAItems(op.id);}}
                  style={{...S.btnSm,background:'#2e8b4e',color:'#fff',border:'none',fontSize:11}}>→ Promover a principal</button>
                <button onClick={e=>{e.stopPropagation();deleteOpcion(op.id);}}
                  style={{...S.btnRed,fontSize:11}}>✕</button>
              </>}
            </div>

            {/* Ítems de la opción */}
            {isOpen && (
              <div style={{ padding:'12px 14px', borderTop:'1px solid #e8e8e8' }}>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ background:'#f0f4f8' }}>
                        {['Ítem','Detalle','Cant.','Días','C.Unit','P.Unit','Total','Razón social','Img',''].map(h=>(
                          <th key={h} style={{ padding:'6px 8px', textAlign:['Cant.','Días','C.Unit','P.Unit','Total'].includes(h)?'right':'left', fontSize:11, color:'#666', fontWeight:700 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(op.items||[]).map(it => {
                        const c = calcItem(it);
                        return (
                          <tr key={it.id} style={{ borderBottom:'1px solid #f0f0f0' }}>
                            <td style={{ padding:'5px 6px' }}>
                              <input value={it.item||''} onChange={e=>updItemOp(op.id,it.id,'item',e.target.value)}
                                style={{...S.input,padding:'3px 6px',fontSize:12}} placeholder="Nombre"/>
                            </td>
                            <td style={{ padding:'5px 6px' }}>
                              <input value={it.detalle||''} onChange={e=>updItemOp(op.id,it.id,'detalle',e.target.value)}
                                style={{...S.input,padding:'3px 6px',fontSize:12}} placeholder="Detalle"/>
                            </td>
                            <td style={{ padding:'5px 4px', width:55 }}>
                              <input type="number" value={it.cantidad} onWheel={e=>e.target.blur()} onChange={e=>updItemOp(op.id,it.id,'cantidad',e.target.value)}
                                style={{...S.input,padding:'3px 6px',fontSize:12,textAlign:'right'}}/>
                            </td>
                            <td style={{ padding:'5px 4px', width:50 }}>
                              <input type="number" value={it.dias} onWheel={e=>e.target.blur()} onChange={e=>updItemOp(op.id,it.id,'dias',e.target.value)}
                                style={{...S.input,padding:'3px 6px',fontSize:12,textAlign:'right'}}/>
                            </td>
                            <td style={{ padding:'5px 4px', width:85 }}>
                              <input type="number" step="0.01" value={it.costo_unit||''} onWheel={e=>e.target.blur()} onChange={e=>updItemOp(op.id,it.id,'costo_unit',e.target.value)}
                                style={{...S.input,padding:'3px 6px',fontSize:12,textAlign:'right',background:'#fafafa'}} placeholder="0.00"/>
                            </td>
                            <td style={{ padding:'5px 4px', width:85 }}>
                              <input type="number" step="0.01" value={it.precio_unit||''} onWheel={e=>e.target.blur()} onChange={e=>updItemOp(op.id,it.id,'precio_unit',e.target.value)}
                                style={{...S.input,padding:'3px 6px',fontSize:12,textAlign:'right'}} placeholder="0.00"/>
                            </td>
                            <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:600, color:'#7c3aed', width:85 }}>{fmt(c.precio)}</td>
                            <td style={{ padding:'5px 6px', width:120 }}>
                              <input value={it.razon_social||''} onChange={e=>updItemOp(op.id,it.id,'razon_social',e.target.value)}
                                style={{...S.input,padding:'3px 6px',fontSize:12}} placeholder="Proveedor"/>
                            </td>
                            <td style={{ padding:'5px 4px', width:44 }}>
                              <label style={{cursor:'pointer',display:'block',textAlign:'center'}}>
                                <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{
                                  const file=e.target.files[0]; if(!file)return;
                                  const reader=new FileReader();
                                  reader.onload=ev=>updItemOp(op.id,it.id,'imagen_url',ev.target.result);
                                  reader.readAsDataURL(file);
                                }}/>
                                {it.imagen_url
                                  ? <img src={it.imagen_url} alt="" style={{width:32,height:32,objectFit:'cover',borderRadius:4,border:'1px solid #ddd'}}/>
                                  : <span style={{fontSize:18,color:'#ccc'}}>📷</span>}
                              </label>
                            </td>
                            <td style={{ padding:'5px 4px', width:30 }}>
                              <button onClick={()=>updateOpcion(op.id,{items:(op.items||[]).filter(x=>x.id!==it.id)})}
                                style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:14}}>✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
                  <button onClick={()=>addItemToOp(op.id)} style={{...S.btnSm,background:'#7c3aed',color:'#fff',border:'none',fontSize:12}}>+ Ítem</button>
                  <span style={{ fontSize:13, fontWeight:600, color:'#7c3aed' }}>Total: {fmt(totalOp)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function EditorPpto({ ppto, onSave, onCancel, cfg, categorias, clientes, ejecutivos, logoUrl, userRole='produccion', briefs=[] }) {
  const [p, setP]               = useState(null);
  const [tab, setTab]           = useState('info');
  const [openItem, setOpenItem] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState('');
  const [previewMode, setPreviewMode] = useState(null);

  useEffect(() => {
    if (p) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(p)); } catch {} }
  }, [p]);

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_TAB, tab); } catch {}
  }, [tab]);

  useEffect(() => {
    const pptoId = ppto?.id || 'new';
    try {
      const draft   = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      const savedTab = sessionStorage.getItem(SESSION_TAB) || 'info';
      if (draft && (draft.id === pptoId || (!draft.id && pptoId === 'new'))) {
        setP(draft); setTab(savedTab); return;
      }
    } catch {}
    if (ppto) {
      const items = (ppto.items||[]).map(it=>({
        ...it,
        costo_unit:      it.costo_unit      ?? it.costo ?? 0,
        costo_real_unit: it.costo_real_unit ?? null,
        precio_unit:     it.precio_unit     ?? it.precio ?? 0,
        cantidad:        it.cantidad        ?? 1,
        dias:            it.dias            ?? 1,
      }));
      setP({...JSON.parse(JSON.stringify(ppto)), items});
    } else {
      setP({
        nombre:'', cliente:'', fecha_evento:new Date().toISOString().slice(0,10),
        ciudad:'Guayaquil', lugar:'', horario:'', personas:0, dias_evento:1,
        brief_id: '',
        fee_agencia: cfg?.fee_agencia ?? 0,
        rebate_pct:  cfg?.rebate_pct  ?? 2,
        oh_pct:      cfg?.oh_pct      ?? 15,
        bco_pct:     cfg?.bco_pct     ?? 5.5,
        apply_rebate:false, estado:'borrador', notas:'', items:[], nomenclatura:'',
        ejecutado: false, cerrado_produccion: false,
        ejecutivo_nombre:'', ejecutivo_email:'',
      });
    }
    setTab('info');
  }, [ppto, cfg]);

  function showToast(m){setToast(m);setTimeout(()=>setToast(''),2500);}
  function setField(k,v){setP(prev=>({...prev,[k]:v}));}
  function setNum(k,v){setP(prev=>({...prev,[k]:v===''?0:parseFloat(v)??0}));}
  function setCliente(n) {
    // Buscar el cliente en la lista para obtener su fee y BCO configurados
    const clienteObj = clientes.find(c => c.nombre === n);
    const feeData = clienteObj
      ? { fee: clienteObj.fee_agencia || 0, bco: !!clienteObj.bco_aplica }
      : getFeeForCliente(n); // fallback a tabla hardcoded
    setP(prev => ({
      ...prev,
      cliente: n,
      apply_rebate: feeData?.bco ?? n.toUpperCase().includes('TESALIA'),
      ...(feeData?.fee !== undefined ? { fee_agencia: feeData.fee } : {}),
    }));
  }

  function selectBrief(briefId) {
    if (!briefId) { setP(prev=>({...prev, brief_id:''})); return; }
    const br = briefs.find(b => b.id === briefId);
    if (!br) return;
    setP(prev => ({
      ...prev,
      brief_id:         briefId,
      nombre:           prev.nombre || br.nombre || '',
      cliente:          prev.cliente || br.cliente_nombre || '',
      fecha_evento:     br.fecha_evento || prev.fecha_evento || '',
      ciudad:           br.ciudad || prev.ciudad || 'Guayaquil',
      lugar:            br.lugar || prev.lugar || '',
      personas:         br.pax || prev.personas || 0,
      dias_evento:      br.dias_evento || prev.dias_evento || 1,
      ejecutivo_nombre: br.ejecutivo_nombre || prev.ejecutivo_nombre || '',
      ejecutivo_email:  br.ejecutivo_email  || prev.ejecutivo_email  || '',
      apply_rebate: (br.cliente_nombre||'').toUpperCase().includes('TESALIA'),
    }));
    showToast('Campos completados desde el proyecto ✓');
  }

  const dragRef = useRef(null); // { type:'item'|'subcat', id, fromIndex }

  function moveItem(dragId, targetId) {
    // Move item with dragId before/after targetId in p.items
    setP(prev => {
      const items = [...prev.items];
      const fromIdx = items.findIndex(it=>it.id===dragId);
      const toIdx   = items.findIndex(it=>it.id===targetId);
      if (fromIdx<0||toIdx<0||fromIdx===toIdx) return prev;
      const [moved] = items.splice(fromIdx,1);
      items.splice(toIdx,0,moved);
      return {...prev,items};
    });
  }

  function moveSubcat(dragSubcatId, targetSubcatId) {
    // Move subcategory block (subcat header + its items) before target subcategory
    setP(prev => {
      const items = [...prev.items];
      // Find blocks
      const getBlock = (subcatId) => {
        const start = items.findIndex(it=>it.id===subcatId&&it._type==='subcat');
        if (start<0) return null;
        let end = start+1;
        while (end<items.length && items[end]._type!=='subcat') end++;
        return { start, end, block: items.slice(start,end) };
      };
      const from = getBlock(dragSubcatId);
      const to   = getBlock(targetSubcatId);
      if (!from||!to) return prev;
      // Remove from block, insert before to block
      const remaining = items.filter((_,i)=>i<from.start||i>=from.end);
      const toStartInRemaining = remaining.findIndex(it=>it.id===targetSubcatId&&it._type==='subcat');
      remaining.splice(toStartInRemaining,0,...from.block);
      return {...prev,items:remaining};
    });
  }
  function addItem(){const it=emptyItem(p);setP(prev=>({...prev,items:[...prev.items,it]}));setOpenItem(it.id);}
  function updItem(id,k,v){
    const nums=['costo_unit','costo_real_unit','precio_unit','oh_pct','bco_pct','bco_real_pct','cantidad','dias'];
    setP(prev=>({...prev,items:prev.items.map(it=>{
      if(it.id!==id)return it;
      if(k==='es_liquidacion'||k==='costo_aprobado')return{...it,[k]:v};
      if(k==='foto_referencia')return{...it,[k]:v};
      if(nums.includes(k)){
        if(k==='costo_real_unit'||k==='bco_real_pct') return{...it,[k]:v===''||v===null?null:parseFloat(v)??null};
        return{...it,[k]:v===''?0:parseFloat(v)??0};
      }
      return{...it,[k]:v};
    })}));
  }
  function delItem(id){setP(prev=>({...prev,items:prev.items.filter(it=>it.id!==id)}));if(openItem===id)setOpenItem(null);}

  async function save(){
    if(!p.nombre&&!p.cliente){showToast('Ingresa nombre o cliente');return;}
    if(!canEditPpto(userRole,p.estado)){showToast('⚠️ Este presupuesto está bloqueado');return;}
    // Warning check: costo > precio
    const tots=calcPpto(p);
    if(tots.hasWarning){
      setToast('⚠️ ADVERTENCIA: Hay ítems donde el costo supera el precio cliente. Revisa la pestaña Ítems.');
      // Still save but show warning — don't return
    }
    setSaving(true);
    let nomenclatura=p.nomenclatura;
    if(!nomenclatura){
      const{count}=await supabase.from('presupuestos').select('*',{count:'exact',head:true});
      nomenclatura=genNomenclatura(p.nombre,p.cliente,(count||0)+1);
    }
    const payload={...p,nomenclatura};
    // Limpiar campos UUID — string vacío rompe Postgres
    if (!payload.brief_id)   payload.brief_id   = null;
    if (!payload.cliente_id) payload.cliente_id  = null;
    let error,data;
    if(p.id){({error}=await supabase.from('presupuestos').update(payload).eq('id',p.id));}
    else{({data,error}=await supabase.from('presupuestos').insert(payload).select().single());if(data)setP(prev=>({...prev,id:data.id,nomenclatura}));}
    setSaving(false);
    if(error){showToast('Error: '+error.message);return;}
    try{sessionStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(SESSION_TAB);}catch{}
    showToast('Guardado ✓');
    // Nos quedamos en la página para seguir editando
  }

  function openPdfCliente(){
    if(!p)return;
    const tieneSubpptos = (p.items||[]).some(it=>it._type==='subppto');
    let mostrarSeparados = true;
    if (tieneSubpptos) {
      const resp = window.confirm('¿Mostrar subpresupuestos separados con sus propios totales?\n\nAceptar = Separados\nCancelar = Unidos (un solo total)');
      mostrarSeparados = resp;
    }
    const html=generatePdfClienteHTML(p,logoUrl,mostrarSeparados);
    const w=window.open('','_blank');w.document.write(html);w.document.close();
  }

  async function saveVersion(ppto, estado) {
    try {
      const html = generatePdfClienteHTML(ppto, logoUrl);
      const blob = new Blob([html], { type:'text/html' });
      const fileName = `${(ppto.nomenclatura||ppto.id).replace(/[^a-zA-Z0-9-_]/g,'_')}_v${Date.now()}.html`;
      await supabase.storage.from('versiones-pdf').upload(fileName, blob, { contentType:'text/html' });
      const { data:urlData } = supabase.storage.from('versiones-pdf').getPublicUrl(fileName);
      const { count } = await supabase.from('versiones_ppto').select('*',{count:'exact',head:true}).eq('presupuesto_id',ppto.id);
      await supabase.from('versiones_ppto').insert({
        presupuesto_id: ppto.id, estado,
        version_num: (count||0)+1,
        pdf_url: urlData?.publicUrl||'',
        created_by: ppto.ejecutivo_email||ppto.created_by||'',
      });
    } catch(e) { console.warn('No se pudo guardar versión:', e); }
  }

  function openPdfFinanciero(){
    if(!p)return;
    const html=generatePdfFinancieroHTML(p,logoUrl);
    const w=window.open('','_blank');w.document.write(html);w.document.close();
  }
  function downloadExcel(){
    if(!p)return;
    const t=calcPpto(p);
    const fmtN=n=>Number(n||0); // números puros para que Excel los reconozca
    const fmtP=n=>Number(n||0).toFixed(1)+'%';

    // Build item rows grouped by subcat
    const groups=[];let cur=null;
    (p.items||[]).forEach(it=>{
      if(it._type==='subcat'){cur={subcat:it.subcategoria,items:[]};groups.push(cur);}
      else{if(!cur){cur={subcat:'Servicios',items:[]};groups.push(cur);}cur.items.push(it);}
    });

    const itemRowsHtml=groups.map(({subcat,items})=>{
      const subcatRow=`<tr><td colspan="20" style="background:#1a5078;color:#fff;font-weight:bold;padding:5px 10px;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${subcat}</td></tr>`;
      const rows=items.map((it,i)=>{
        const c=calcItem(it);
        const tieneReal=it.costo_real_unit!=null&&it.costo_real_unit!==undefined;
        const bg=i%2===0?'#ffffff':'#f8fafc';
        const td=(v,color='#1a1a2e',bold=false,align='left',bg2=bg)=>
          `<td style="background:${bg2};color:${color};font-weight:${bold?'bold':'normal'};text-align:${align};padding:5px 8px;border:1px solid #c8d8e8;">${v}</td>`;
        return`<tr>
          ${td(it.subcategoria||'')}
          ${td(it.categoria||'')}
          ${td(`<b>${it.item||''}</b>${it.detalle?`<br><span style="font-size:9px;color:#6b7a99;">${it.detalle}</span>`:''}`,'#1a1a2e',false,'left',bg)}
          ${td(c.cantidad,'#1a1a2e',false,'center',bg)}
          ${td(c.dias,'#1a1a2e',false,'center',bg)}
          ${td(fmtN(c.costoUnit),'#8b1a1a',false,'right',bg)}
          ${td(fmtN(c.costoTotal),'#8b1a1a',true,'right',bg)}
          ${td(fmtN(c.precioU),'#0d3b5e',false,'right',bg)}
          ${td(fmtN(c.precio),'#0d3b5e',true,'right',bg)}
          ${td(it.proveedor||'')}
          ${td(it.num_factura_prov||'')}
          ${tieneReal?td(fmtN(c.costoRealUnit),'#1a6e3e',false,'right',bg):td('—','#bbbbbb',false,'right',bg)}
          ${tieneReal?td(fmtN(c.costoRealTotal),'#1a6e3e',false,'right',bg):td('—','#bbbbbb',false,'right',bg)}
          ${tieneReal?td(fmtN(c.ahorro),c.ahorro>=0?'#1a6e3e':'#c8264a',true,'right',bg):td('—','#bbbbbb',false,'right',bg)}
          ${td(fmtN(c.margen),c.margen>=0?'#1a6e3e':'#c8264a',true,'right',bg)}
          ${td(fmtP(c.margenPct),c.margen>=0?'#1a6e3e':'#c8264a',false,'right',bg)}
          ${td(fmtN(c.ohVal+c.bcoVal),'#7a5500',false,'right',bg)}
          ${td(fmtN(c.totalCosto),'#5a2a7e',true,'right',bg)}
          ${td(it.costo_aprobado?'✅':'','#2e8b4e',false,'center',it.costo_aprobado?'#edf7ed':bg)}
        </tr>`;
      }).join('');
      return subcatRow+rows;
    }).join('');

    const th=(v,color='#ffffff',align='left')=>
      `<th style="background:#0d3b5e;color:${color};font-weight:bold;padding:6px 8px;border:1px solid #1a5078;text-align:${align};font-size:10px;white-space:nowrap;">${v}</th>`;

    const resumenRows=[
      ['Subtotal costo proveedores',t.subtotalCosto,'#f0f4f8','#5a7a9a'],
      ['OH acumulado',t.subtotalOH,'#f0f4f8','#7a5500'],
      ['BCO acumulado',t.subtotalBCO,'#f0f4f8','#7a5500'],
      ['Total costo c/OH+BCO',t.subtotalCosto,'#f0eaf4','#5a2a7e'],
      ['Subtotal precio cliente',t.subtotalPrecio,'#f0f4f8','#0d3b5e'],
      [`Fee agencia ${p.fee_agencia??0}%`,t.feeAgencia,'#f0f4f8','#0d3b5e'],
      ['Subtotal sin IVA',t.totalSinIva,'#e8f0fb','#0d3b5e'],
      ['IVA 15%',t.iva15,'#f0f4f8','#555555'],
      ['TOTAL CON IVA',t.totalConIva,'#0d3b5e','#3dbfb8'],
      ['Margen cotizado',t.margenTotal,t.margenTotal>=0?'#edf7ed':'#fdeef1',t.margenTotal>=0?'#1a6e3e':'#c8264a'],
      ...(t.subtotalCostoReal>0?[
        ['Costo real total',t.subtotalCostoReal,'#edf7ed','#1a6e3e'],
        ['Ahorro total',t.subtotalAhorro,'#edf7ed','#1a6e3e'],
        ['Margen real',t.margenRealTotal,'#edf7ed','#1a6e3e'],
      ]:[]),
      ...(p.apply_rebate?[
        [`Rebate ${p.rebate_pct??0}%`,t.rebate,'#fff8e6','#7a5500'],
        ['Utilidad con rebate',t.utilidadConRebate,'#fff8e6','#7a5500'],
      ]:[]),
    ].map(([l,v,bg,fc])=>`
      <tr>
        <td style="background:${bg};color:${fc};font-weight:bold;padding:6px 14px;border:1px solid #dde6ef;min-width:220px;">${l}</td>
        <td style="background:${bg};color:${fc};font-weight:bold;text-align:right;padding:6px 14px;border:1px solid #dde6ef;">${fmtN(v)}</td>
      </tr>`).join('');

    const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<style>
  body{font-family:Calibri,Arial,sans-serif;font-size:11px;}
  table{border-collapse:collapse;}
  td,th{border:1px solid #c8d8e8;padding:5px 8px;font-size:10px;}
  .title{background:#0d3b5e;color:#ffffff;font-size:14px;font-weight:bold;padding:10px 16px;}
  .info-label{background:#f0f4f8;color:#0d3b5e;font-weight:bold;padding:5px 10px;border:1px solid #c8d8e8;}
  .info-val{padding:5px 10px;border:1px solid #c8d8e8;}
  .section-title{background:#0d3b5e;color:#fff;font-weight:bold;font-size:12px;padding:7px 14px;letter-spacing:1px;}
</style>
</head><body>

<!-- TÍTULO -->
<table style="width:100%;margin-bottom:8px;">
  <tr><td class="title" colspan="20">PRESUPUESTO FINANCIERO — MATILDA EVENT DESIGNERS</td></tr>
</table>

<!-- INFO -->
<table style="margin-bottom:16px;">
  ${[['Código',p.nomenclatura],['Cliente',p.cliente],['Evento',p.nombre],['Fecha evento',p.fecha_evento],['Lugar',p.lugar],['PAX',p.personas||''],['Ejecutivo',p.ejecutivo_nombre||''],['Correo',p.ejecutivo_email||'']].map(([l,v])=>`
  <tr><td class="info-label">${l}</td><td class="info-val">${v||''}</td></tr>`).join('')}
</table>

<!-- TABLA DE ÍTEMS -->
<table style="width:100%;margin-bottom:20px;">
  <thead>
    <tr>
      ${th('Subcategoría')}${th('Categoría')}${th('Ítem / Detalle')}
      ${th('Cant','#ffffff','center')}${th('Días','#ffffff','center')}
      ${th('C.Unit','#ffcccc','right')}${th('C.Total','#ffcccc','right')}
      ${th('P.Unit','#aaddff','right')}${th('P.Total','#aaddff','right')}
      ${th('Proveedor')}${th('# Factura')}
      ${th('C.Real Unit','#aaffcc','right')}${th('C.Real Total','#aaffcc','right')}${th('Ahorro','#aaffcc','right')}
      ${th('Margen','#ffffaa','right')}${th('% Margen','#ffffaa','right')}
      ${th('OH+BCO','#ffddaa','right')}${th('Total Costo','#ffddaa','right')}
      ${th('Aprobado','#ffffff','center')}
    </tr>
  </thead>
  <tbody>
    ${itemRowsHtml}
    <!-- Fila totales -->
    <tr style="background:#0d3b5e;font-weight:bold;">
      <td colspan="5" style="background:#0d3b5e;color:#fff;padding:6px 10px;border:1px solid #1a5078;">TOTALES</td>
      <td style="background:#0d3b5e;color:#ffcccc;text-align:right;padding:6px 8px;border:1px solid #1a5078;">${fmtN(t.subtotalCosto)}</td>
      <td style="background:#0d3b5e;border:1px solid #1a5078;"></td>
      <td style="background:#0d3b5e;color:#aaddff;text-align:right;padding:6px 8px;border:1px solid #1a5078;">${fmtN(t.subtotalPrecio)}</td>
      <td style="background:#0d3b5e;color:#3dbfb8;text-align:right;padding:6px 8px;border:1px solid #1a5078;font-size:12px;">${fmtN(t.totalConIva)}</td>
      <td colspan="4" style="background:#0d3b5e;border:1px solid #1a5078;"></td>
      <td style="background:#0d3b5e;color:#aaffcc;text-align:right;padding:6px 8px;border:1px solid #1a5078;">${t.subtotalCostoReal>0?fmtN(t.subtotalCostoReal):'—'}</td>
      <td style="background:#0d3b5e;color:#aaffcc;text-align:right;padding:6px 8px;border:1px solid #1a5078;">${t.subtotalAhorro>0?fmtN(t.subtotalAhorro):'—'}</td>
      <td style="background:#0d3b5e;color:#3dbfb8;text-align:right;padding:6px 8px;border:1px solid #1a5078;font-weight:bold;">${fmtN(t.margenTotal)}</td>
      <td style="background:#0d3b5e;color:#3dbfb8;text-align:right;padding:6px 8px;border:1px solid #1a5078;">${fmtP(t.margenPct)}</td>
      <td colspan="3" style="background:#0d3b5e;border:1px solid #1a5078;"></td>
    </tr>
  </tbody>
</table>

<!-- RESUMEN FINANCIERO -->
<table style="margin-bottom:20px;min-width:400px;">
  <tr><td colspan="2" class="section-title">RESUMEN FINANCIERO</td></tr>
  ${resumenRows}
</table>

${p.notas?`<table><tr><td style="background:#f0f7ff;border-left:3px solid #3dbfb8;padding:10px 14px;font-size:11px;color:#1a1a2e;"><b>Nota:</b> ${p.notas}</td></tr></table>`:''}

</body></html>`;

    const blob=new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`${p.nomenclatura||'presupuesto'}_financiero.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if(!p)return<div style={{padding:20,color:'#8aa0b8'}}>Cargando…</div>;
  const totales=calcPpto(p);
  const esCierre=ESTADOS_CIERRE.includes(p.estado);
  const bloqueado=!canEditPpto(userRole,p.estado);

  return(
    <div style={{fontFamily:'inherit'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <button style={S.btnSecondary} onClick={onCancel}>← Volver</button>
        <div style={{flex:1,minWidth:0}}>
          {p.nomenclatura&&<div style={{fontSize:10,color:'#8aa0b8',fontFamily:'monospace',marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.nomenclatura}</div>}
          <div style={{fontSize:17,fontWeight:700,color:'#0d3b5e',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.nombre||p.cliente||'Nuevo presupuesto'}</div>
        </div>
        <Badge estado={p.estado}/>
        <select style={{...S.select,width:'auto'}} value={p.estado}
          disabled={!canEditPpto(userRole,p.estado)&&userRole!=='admin'}
          onChange={async e=>{
            if(!canChangeEstadoPpto(userRole,e.target.value)){showToast('⚠️ Sin permiso para este estado');return;}
            if(!canEditPpto(userRole,p.estado)){showToast('⚠️ Presupuesto bloqueado');return;}
            const nuevoEstado = e.target.value;
            setField('estado', nuevoEstado);
            if (p.id) {
              await supabase.from('presupuestos').update({ estado: nuevoEstado }).eq('id', p.id);
              await saveVersion({ ...p, estado: nuevoEstado }, nuevoEstado);
            }
          }}>
          {ESTADOS_PPTO.map(e=><option key={e} value={e} disabled={!canChangeEstadoPpto(userRole,e)&&p.estado!==e}>{ESTADOS_PPTO_LABELS[e]}</option>)}
        </select>
        <button style={S.btnSecondary} onClick={openPdfCliente}>📄 PDF cliente</button>
        {canDownloadPdfFinanciero(userRole) && <button style={{...S.btnSecondary,color:'#c8264a',borderColor:'#c8264a44'}} onClick={openPdfFinanciero}>📊 PDF financiero</button>}
        {canDownloadExcel(userRole) && <button style={S.btnSecondary} onClick={downloadExcel}>📥 Excel</button>}
        <button style={S.btnPrimary} onClick={save} disabled={saving}>{saving?'Guardando…':'💾 Guardar'}</button>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'2px solid #dde6ef',paddingBottom:0}}>
        {[['info','📋 Info'],['items','📦 Ítems'],['totales','💰 Totales'],...(['aprobado','pendiente_facturar','facturado'].includes(p.estado)?[['alcance','➕ Alcance']]:[] ),['vista','👁 Vista previa']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{
            padding:'8px 16px',border:'none',cursor:'pointer',fontSize:13,background:'none',
            borderBottom:tab===k?'2px solid #c8264a':'2px solid transparent',
            fontWeight:tab===k?700:400,color:tab===k?'#c8264a':'#5a7a9a',marginBottom:-2,
          }}>{l}</button>
        ))}
      </div>

      {/* Warning banners */}
      {totales.hasWarning&&<div style={{background:'#fdeef1',border:'1px solid #c8264a',borderRadius:8,padding:'10px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:20}}>⚠️</span><div><div style={{fontSize:13,fontWeight:700,color:'#c8264a'}}>Advertencia: hay ítems donde el costo supera el precio al cliente</div><div style={{fontSize:12,color:'#8b1f1f'}}>Revisa los ítems marcados en rojo en la pestaña Ítems.</div></div></div>}
      {bloqueado&&<div style={{background:'#edf7ed',border:'1px solid #2e8b4e',borderRadius:8,padding:'10px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:18}}>🔒</span><div style={{fontSize:13,fontWeight:700,color:'#2e8b4e'}}>Presupuesto bloqueado — estado: {ESTADOS_PPTO_LABELS[p.estado]}. Solo Admin puede editar.</div></div>}

      {/* ══ INFO ══ */}
      {tab==='info'&&(
        <div style={S.card}>
          <div style={S.grid2}>
            <div style={{gridColumn:'1/-1'}}>
              <Label>Vincular a proyecto</Label>
              <select style={S.select} value={p.brief_id||''} onChange={e=>selectBrief(e.target.value)} disabled={bloqueado}>
                <option value="">Sin vincular</option>
                {briefs.filter(b => !b._usado || b.id === p.brief_id).map(b=><option key={b.id} value={b.id}>{b.nombre}{b.cliente_nombre?' — '+b.cliente_nombre:''}</option>)}
              </select>
              {p.brief_id && (
                <div style={{fontSize:11,color:'#2e8b4e',marginTop:4}}>
                  ✓ Vinculado — los campos se completaron desde el proyecto. Podés editarlos libremente.
                </div>
              )}
            </div>
            <div style={{gridColumn:'1/-1'}}><Label>Nombre del presupuesto</Label><input style={S.input} value={p.nombre} onChange={e=>setField('nombre',e.target.value)} placeholder="Ej: Convención Anual 2026" disabled={bloqueado}/></div>
            <div><Label>Cliente</Label>
              <select style={S.select} value={p.cliente} onChange={e=>setCliente(e.target.value)} disabled={bloqueado}>
                <option value="">— Seleccionar —</option>
                {clientes.map(c=><option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </div>
            <div><Label>Fecha del evento</Label><input type="date" style={S.input} value={p.fecha_evento||''} onChange={e=>setField('fecha_evento',e.target.value)} disabled={bloqueado}/></div>
            <div><Label>Ciudad</Label><input style={S.input} value={p.ciudad||''} onChange={e=>setField('ciudad',e.target.value)} disabled={bloqueado}/></div>
            <div><Label>Lugar / Venue</Label><input style={S.input} value={p.lugar||''} onChange={e=>setField('lugar',e.target.value)} disabled={bloqueado}/></div>
            <div><Label>Horario</Label><input style={S.input} value={p.horario||''} onChange={e=>setField('horario',e.target.value)} disabled={bloqueado}/></div>
            <div><Label># Personas (PAX)</Label><input type="number" style={S.input} value={p.personas??0} onChange={e=>setField('personas',parseInt(e.target.value)||0)}/></div>
            <div><Label>Días de evento</Label><input type="number" style={S.input} value={p.dias_evento??1} onChange={e=>setField('dias_evento',parseInt(e.target.value)||1)}/></div>
            <div><Label>Fee agencia (%)</Label><input type="number" step="0.1" style={S.input} value={p.fee_agencia??0} onChange={e=>setNum('fee_agencia',e.target.value)}/></div>
            <div><Label>OH nuevos ítems (%)</Label><input type="number" step="0.1" style={S.input} value={p.oh_pct??0} onChange={e=>setNum('oh_pct',e.target.value)}/></div>
            <div><Label>BCO nuevos ítems (%)</Label><input type="number" step="0.1" style={S.input} value={p.bco_pct??0} onChange={e=>setNum('bco_pct',e.target.value)}/></div>
            <div style={{display:'flex',alignItems:'center',gap:10,paddingTop:20}}>
              <input type="checkbox" id="rebate" checked={!!p.apply_rebate} onChange={e=>setField('apply_rebate',e.target.checked)} style={{width:16,height:16,cursor:'pointer'}}/>
              <label htmlFor="rebate" style={{fontSize:13,cursor:'pointer',color:'#0d3b5e'}}>Aplicar REBATE ({p.rebate_pct??0}%) — Solo Tesalia</label>
            </div>
            <div style={{gridColumn:'1/-1'}}><Label>Notas</Label><textarea style={{...S.textarea,height:72}} value={p.notas||''} onChange={e=>setField('notas',e.target.value)}/></div>
            {p.estado==='facturado' && (
              <div style={{gridColumn:'1/-1',background:'#e8f5ee',borderRadius:8,padding:'12px',border:'1px solid #2e8b4e'}}>
                <div style={{fontSize:12,fontWeight:700,color:'#2e8b4e',marginBottom:8}}>🧾 Facturación</div>
                <div><Label>Número de factura</Label>
                  <input style={S.input} value={p.num_factura_cliente||''} onChange={e=>setField('num_factura_cliente',e.target.value)} placeholder="Ej: 001-001-000123456"/>
                </div>
              </div>
            )}
            {['aprobado','pendiente_facturar','facturado'].includes(p.estado) && (
              <div style={{gridColumn:'1/-1',background:'#eef4fb',borderRadius:8,padding:'12px',border:'1px solid #c8d8e8'}}>
                <div style={{fontSize:12,fontWeight:700,color:'#0d3b5e',marginBottom:8}}>📅 Producción</div>
                <div style={S.grid2}>
                  <div>
                    <Label>Fecha inicio de producción</Label>
                    <input type="date" style={S.input} value={p.fecha_inicio_produccion||''} onChange={e=>setField('fecha_inicio_produccion',e.target.value||null)}
                      placeholder="Por defecto: fecha de aprobación"/>
                    <div style={{fontSize:11,color:'#888',marginTop:3}}>Base para calcular créditos y abonos en el flujo de caja</div>
                  </div>
                </div>
              </div>
            )}
            <div style={{gridColumn:'1/-1',background:'#eef4fb',borderRadius:8,padding:'12px',border:'1px solid #c8d8e8'}}>
              <div style={{fontSize:12,fontWeight:700,color:'#0d3b5e',marginBottom:10}}>👤 Ejecutivo de contacto</div>
              <div style={S.grid2}>
                <div>
                  <Label>Ejecutivo</Label>
                  <select style={S.select} value={p.ejecutivo_nombre||''} onChange={e=>{
                    const ejec=(ejecutivos||[]).find(x=>x.nombre===e.target.value);
                    setP(prev=>({...prev, ejecutivo_nombre:e.target.value, ejecutivo_email:ejec?.email||''}));
                  }}>
                    <option value="">— Seleccionar ejecutivo —</option>
                    {(ejecutivos||[]).map(e=><option key={e.id} value={e.nombre}>{e.nombre}{e.cargo?` — ${e.cargo}`:''}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Correo de contacto</Label>
                  <input style={S.input} type="email" value={p.ejecutivo_email||''} onChange={e=>setField('ejecutivo_email',e.target.value)} placeholder="Se completa automáticamente"/>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ ITEMS ══ */}
      {tab==='items'&&(
        <div>
          {/* Toolbar */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <span style={{fontSize:13,color:'#5a7a9a'}}>
              {p.items.length} ítems · Precio total: <strong style={{color:'#0d3b5e'}}>{fmt(totales.subtotalPrecio)}</strong>
            </span>
            <div style={{display:'flex',gap:8}}>
              {p.estado==='enviado_cliente' && p.id && (
                <button style={{...S.btnPrimary,background:'#7c3aed'}} onClick={async()=>{
                  await saveVersion(p, p.estado);
                  showToast('📄 Versión guardada en el expediente ✓');
                }}>📄 Nueva versión</button>
              )}
              <button style={{...S.btnPrimary,background:'#7c3aed'}} onClick={()=>{
                const nombre=window.prompt('Nombre del subpresupuesto (ej: Guayaquil, Quito):');
                if(!nombre||!nombre.trim())return;
                const subppto={
                  id:crypto.randomUUID(), _type:'subppto',
                  subpresupuesto:nombre.trim(), incluir_en_total:true,
                  item:'', detalle:'', cantidad:0, dias:0, costo_unit:0, precio_unit:0,
                  oh_pct:0, bco_pct:0, categoria:'', es_liquidacion:false,
                };
                setP(prev=>({...prev,items:[...prev.items,subppto]}));
              }}>+ Subpresupuesto</button>
              <button style={{...S.btnPrimary,background:'#0d3b5e'}} onClick={()=>{
                const nombre=window.prompt('Nombre de la subcategoría:');
                if(!nombre||!nombre.trim())return;
                const subcat={
                  id:crypto.randomUUID(), _type:'subcat',
                  subcategoria:nombre.trim(), item:'', detalle:'',
                  cantidad:0, dias:0, costo_unit:0, precio_unit:0,
                  oh_pct:0, bco_pct:0, categoria:'', es_liquidacion:false,
                };
                setP(prev=>({...prev,items:[...prev.items,subcat]}));
              }}>+ Subcategoría</button>
              <button style={{...S.btnPrimary,background:'#c8264a'}} onClick={addItem}>+ Ítem</button>
            </div>
          </div>

          {/* Lista agrupada por subcategoría */}
          {(()=>{
            // Construir subpresupuestos → grupos → items (3 niveles)
            const subpptos=[]; // [{id, nombre, incluir, grupos:[{subcat,subcatId,items:[]}]}]
            let subpptoActual=null;
            let grupoActual=null;

            p.items.forEach(it=>{
              if(it._type==='subppto'){
                subpptoActual={id:it.id, nombre:it.subpresupuesto, incluir:it.incluir_en_total!==false, grupos:[]};
                subpptos.push(subpptoActual);
                grupoActual=null;
              } else if(it._type==='subcat'){
                if(!subpptoActual){
                  subpptoActual={id:'__root__', nombre:'', incluir:true, grupos:[]};
                  subpptos.push(subpptoActual);
                }
                grupoActual={subcat:it.subcategoria, subcatId:it.id, items:[]};
                subpptoActual.grupos.push(grupoActual);
              } else {
                if(!subpptoActual){
                  subpptoActual={id:'__root__', nombre:'', incluir:true, grupos:[]};
                  subpptos.push(subpptoActual);
                }
                if(!grupoActual){
                  grupoActual={subcat:'Sin subcategoría', subcatId:'__none__', items:[]};
                  subpptoActual.grupos.push(grupoActual);
                }
                grupoActual.items.push(it);
              }
            });

            // For backwards compat - flatten to grupos if no subpptos
            const grupos = subpptos.length===1 && subpptos[0].id==='__root__'
              ? subpptos[0].grupos
              : null;

            // Total general (solo subpptos incluidos)
            const totalGeneral = subpptos.filter(sp=>sp.incluir).reduce((acc,sp)=>
              acc + sp.grupos.flatMap(g=>g.items).reduce((a,it)=>{
                const c=calcItem(it); return a+c.precio;
              },0), 0);

            const haySubpptos = subpptos.some(sp=>sp.id!=='__root__');

            if(p.items.length===0) return(
              <div style={S.empty}>
                Agregá un subpresupuesto o subcategoría para empezar
              </div>
            );

            // Render grupos (subcategorías) helper
            const renderGrupos = (gruposArr, spId) => gruposArr.map((grupo,gi)=>(
              <div key={grupo.subcatId} style={{marginBottom:16}}
                onDragOver={e=>{e.preventDefault();}}
                onDrop={e=>{e.preventDefault();if(dragRef.current?.type==='subcat'&&dragRef.current.id!==grupo.subcatId)moveSubcat(dragRef.current.id,grupo.subcatId);}}>
                {/* Cabecera subcategoría */}
                <div style={{display:'flex',alignItems:'center',gap:8,background:'#0d3b5e',borderRadius:'8px 8px 0 0',padding:'8px 14px'}}>
                  {!bloqueado&&<span title="Arrastrar subcategoría" draggable={true}
                    onDragStart={e=>{e.stopPropagation();dragRef.current={type:'subcat',id:grupo.subcatId};}}
                    onDragEnd={()=>{dragRef.current=null;}}
                    style={{cursor:'grab',color:'rgba(255,255,255,.5)',fontSize:16,flexShrink:0}}>⠿</span>}
                  <span style={{flex:1,color:'#fff',fontWeight:700,fontSize:14,letterSpacing:0.5}}>{grupo.subcat||<em style={{opacity:.6}}>Sin nombre</em>}</span>
                  <span style={{fontSize:11,color:'#8ab4d4'}}>{grupo.items.length} ítems</span>
                  {/* Renombrar subcategoría — siempre visible si tiene subcatId */}
                  {grupo.subcatId&&grupo.subcatId!=='__none__'&&(
                    <button onClick={()=>{
                      const nuevo=window.prompt('Nombre de la subcategoría:',grupo.subcat||'');
                      if(nuevo===null)return;
                      setP(prev=>({...prev,items:prev.items.map(it=>
                        it.id===grupo.subcatId?{...it,subcategoria:nuevo.trim()}:
                        it.subcategoria===grupo.subcat&&it._type!=='subcat'?{...it,subcategoria:nuevo.trim()}:it
                      )}));
                    }} style={{background:'none',border:'1px solid #ffffff44',color:'#fff',padding:'2px 8px',borderRadius:4,cursor:'pointer',fontSize:11}}>✏️</button>
                  )}
                  {/* Agregar ítem a esta subcategoría */}
                  <button onClick={()=>{
                    const it=emptyItem(p);
                    it.subcategoria=grupo.subcat;
                    // Insertar después del último ítem de este grupo
                    const lastIdx=p.items.reduce((acc,item,idx)=>{
                      if(item.subcategoria===grupo.subcat||item.id===grupo.subcatId)return idx;
                      return acc;
                    },-1);
                    setP(prev=>{
                      const arr=[...prev.items];
                      arr.splice(lastIdx+1,0,it);
                      return{...prev,items:arr};
                    });
                    setOpenItem(it.id);
                  }} style={{background:'#c8264a',border:'none',color:'#fff',padding:'3px 10px',borderRadius:4,cursor:'pointer',fontSize:12,fontWeight:600}}>+ ítem</button>
                  {/* Eliminar subcategoría (solo si está vacía) */}
                  {grupo.subcatId!=='__none__'&&(
                    <button onClick={()=>{
                      if(grupo.items.length>0&&!window.confirm(`¿Eliminar subcategoría "${grupo.subcat}" y sus ${grupo.items.length} ítems?`))return;
                      const idsToRemove=new Set([grupo.subcatId,...grupo.items.map(it=>it.id)]);
                      setP(prev=>({...prev,items:prev.items.filter(it=>!idsToRemove.has(it.id))}));
                    }} style={{background:'none',border:'1px solid #ffffff44',color:'#ffa0a0',padding:'2px 8px',borderRadius:4,cursor:'pointer',fontSize:11}}>🗑</button>
                  )}
                </div>

                {/* Ítems de esta subcategoría */}
                <div style={{border:'1px solid #0d3b5e',borderTop:'none',borderRadius:'0 0 8px 8px',overflow:'hidden'}}>
                  {grupo.items.length===0&&(
                    <div style={{padding:'12px 14px',color:'#8aa0b8',fontSize:13,fontStyle:'italic',textAlign:'center'}}>
                      Sin ítems — haz clic en "+ ítem" para agregar
                    </div>
                  )}
                  {grupo.items.map((it,ii)=>{
                    const c=calcItem(it); const open=openItem===it.id;
                    const tieneReal=it.costo_real_unit!==null&&it.costo_real_unit!==undefined;
                    return(
                      <div key={it.id} style={{borderBottom:ii<grupo.items.length-1?'1px solid #eef2f7':'none',background:c.hasWarning?'#fff8f8':'#fff'}}
                        onDragOver={e=>{e.preventDefault();e.stopPropagation();}}
                        onDrop={e=>{e.preventDefault();e.stopPropagation();if(dragRef.current?.type==='item'&&dragRef.current.id!==it.id)moveItem(dragRef.current.id,it.id);}}>
                        {/* Cabecera ítem */}
                        <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',cursor:'pointer',background:open?(c.hasWarning?'#fdeef1':'#eef4fb'):(c.hasWarning?'#fff8f8':'#fff')}} onClick={()=>setOpenItem(open?null:it.id)}>
                          {!bloqueado&&<span title="Arrastrar ítem" draggable={true}
                            onDragStart={e=>{e.stopPropagation();dragRef.current={type:'item',id:it.id};}}
                            onDragEnd={()=>{dragRef.current=null;}}
                            style={{cursor:'grab',color:'#bbb',fontSize:14,flexShrink:0}} onClick={e=>e.stopPropagation()}>⠿</span>}
                          <span style={{fontSize:12,color:'#8aa0b8'}}>{open?'▲':'▼'}</span>
                          <span style={{flex:1,fontWeight:600,fontSize:14,color:c.hasWarning?'#c8264a':'#1a1a2e'}}>{it.item||<span style={{color:'#bbb'}}>Sin nombre</span>}</span>
                          {c.hasWarning&&<span style={{fontSize:11,color:'#c8264a',fontWeight:700}}>⚠️ Costo &gt; Precio</span>}
                          {it.costo_aprobado&&<span style={{fontSize:10,background:'#edf7ed',color:'#2e8b4e',padding:'2px 6px',borderRadius:4,fontWeight:700,border:'1px solid #2e8b4e44'}}>✅ Aprobado</span>}
                          
                          {it.categoria&&<span style={{fontSize:11,background:'#e8f0f8',color:'#0d3b5e',padding:'2px 7px',borderRadius:4,fontWeight:600}}>{it.categoria}</span>}
                          {tieneReal&&<span style={{fontSize:11,background:'#edf7ed',color:'#2e8b4e',padding:'2px 7px',borderRadius:4,fontWeight:600,border:'1px solid #2e8b4e44'}}>Ahorro: {fmt(c.ahorro)}</span>}
                          <span style={{fontSize:12,color:'#8aa0b8'}}>Costo: <strong>{fmt(c.costoTotal)}</strong></span>
                          <span style={{fontSize:12,color:'#0d3b5e',fontWeight:600}}>Precio: <strong>{fmt(c.precio)}</strong></span>
                          <span style={{fontSize:11,color:c.margen>=0?'#2e8b4e':'#c8264a',fontWeight:600}}>{fmtPct(c.margenPct)}</span>
                          {!bloqueado&&<button style={{...S.btnRed,padding:'3px 7px'}} onClick={e=>{e.stopPropagation();delItem(it.id);}}>🗑</button>}

                        </div>
                        {/* Detalle ítem */}
                        {open&&(
                          <div style={{padding:14,borderTop:'1px solid #dde6ef',background:'#fafcfe'}}>
                            <div style={S.grid2}>
                              <div><Label>Ítem</Label><input style={S.input} value={it.item} onChange={e=>updItem(it.id,'item',e.target.value)}/></div>
                              <div><Label>Categoría (interna — reportes)</Label>
                                <select style={S.select} value={it.categoria} onChange={e=>updItem(it.id,'categoria',e.target.value)}>
                                  <option value="">— Sin categoría —</option>
                                  {categorias.map(c=><option key={c.id}>{c.nombre}</option>)}
                                </select>
                              </div>
                              <div style={{gridColumn:'1/-1'}}>
                                <Label>Detalle <span style={{fontSize:10,color:'#aaa',fontWeight:400}}>— usá *palabra* para negrita y Enter para nueva línea</span></Label>
                                <textarea style={{...S.textarea,height:64}} value={it.detalle} onChange={e=>updItem(it.id,'detalle',e.target.value)}/>
                              </div>

                              {/* COSTO PROVEEDOR */}
                              <div style={{gridColumn:'1/-1',background:'#f8fafc',borderRadius:8,padding:'10px 12px',border:'1px solid #dde6ef'}}>
                                <div style={{fontSize:12,fontWeight:700,color:'#5a7a9a',marginBottom:8}}>💼 Costo proveedor (cotizado)</div>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
                                  <div><Label>Costo unitario ($)</Label><input type="number" step="0.01" style={S.input} value={it.costo_unit??0} onWheel={e=>e.target.blur()} onChange={e=>updItem(it.id,'costo_unit',e.target.value)}/></div>
                                  <div><Label>Cantidad</Label><input type="number" style={S.input} value={it.cantidad??1} onWheel={e=>e.target.blur()} onChange={e=>updItem(it.id,'cantidad',e.target.value)}/></div>
                                  <div><Label>Días</Label><input type="number" style={S.input} value={it.dias??1} onWheel={e=>e.target.blur()} onChange={e=>updItem(it.id,'dias',e.target.value)}/></div>
                                  <div><Label>Total (unit×cant×días)</Label><input style={{...S.inputRO,fontWeight:700}} readOnly value={fmt(c.costoTotal)}/></div>
                                </div>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginTop:8}}>
                                  <div><Label>OH %</Label><input type="number" step="0.1" style={S.input} value={it.oh_pct??0} onWheel={e=>e.target.blur()} onChange={e=>updItem(it.id,'oh_pct',e.target.value)}/></div>
                                  <div><Label>BCO %</Label><input type="number" step="0.1" style={S.input} value={it.bco_pct??0} onWheel={e=>e.target.blur()} onChange={e=>updItem(it.id,'bco_pct',e.target.value)}/></div>
                                  <div><Label>Total c/OH+BCO</Label><input style={{...S.inputRO,fontWeight:700,color:'#5a7a9a'}} readOnly value={fmt(c.totalCosto)}/></div>
                                </div>
                              </div>

                              {/* COSTO REAL */}
                              {esCierre&&(
                              <div style={{gridColumn:'1/-1',background:tieneReal?'#edf7ed':'#f8fafc',borderRadius:8,padding:'10px 12px',border:`1px solid ${tieneReal?'#2e8b4e44':'#dde6ef'}`}}>
                                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                                  <div style={{fontSize:12,fontWeight:700,color:tieneReal?'#2e8b4e':'#5a7a9a'}}>✅ Costo real (ejecutado)</div>
                                </div>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
                                  <div>
                                    <Label>Costo real unitario ($)</Label>
                                    <input type="number" step="0.01"
                                      style={{...S.input,borderColor:tieneReal?'#2e8b4e':'#d0d0c8'}}
                                      value={it.costo_real_unit??''} placeholder="Sin ingresar"
                                      disabled={it.costo_aprobado&&!canApproveCostoReal(userRole)}
                                      onChange={e=>updItem(it.id,'costo_real_unit',e.target.value)}/>
                                  </div>
                                  <div><Label>Cantidad</Label><input style={S.inputRO} readOnly value={it.cantidad??1}/></div>
                                  <div><Label>Días</Label><input style={S.inputRO} readOnly value={it.dias??1}/></div>
                                  <div><Label>Total real</Label><input style={{...S.inputRO,fontWeight:700,color:'#2e8b4e'}} readOnly value={tieneReal?fmt(c.costoRealTotal):'—'}/></div>
                                </div>
                                {/* BCO real — solo financiero */}
                                {canEditBcoReal(userRole)&&(
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:8}}>
                                  <div>
                                    <Label>BCO real % (solo financiero — post facturación)</Label>
                                    <input type="number" step="0.1" style={S.input}
                                      value={it.bco_real_pct??''} placeholder={`BCO cotizado: ${it.bco_pct??5.5}%`}
                                      onChange={e=>updItem(it.id,'bco_real_pct',e.target.value)}/>
                                  </div>
                                  <div><Label>BCO real calculado</Label><input style={S.inputRO} readOnly value={it.bco_real_pct!=null?fmt(c.bcoRealVal):'—'}/></div>
                                </div>
                                )}
                                {/* Check de aprobación — solo financiero */}
                                {canApproveCostoReal(userRole)&&tieneReal&&(
                                <div style={{display:'flex',alignItems:'center',gap:10,marginTop:8,padding:'8px 12px',background:it.costo_aprobado?'#edf7ed':'#f8fafc',borderRadius:6,border:`1px solid ${it.costo_aprobado?'#2e8b4e':'#dde6ef'}`}}>
                                  <input type="checkbox" id={`aprov-${it.id}`} checked={!!it.costo_aprobado}
                                    onChange={e=>{
                                      if(!window.confirm(e.target.checked?'¿Confirmar que el costo real está correcto? Una vez aprobado no se podrá modificar.':'¿Quitar aprobación?'))return;
                                      updItem(it.id,'costo_aprobado',e.target.checked);
                                    }}
                                    style={{width:16,height:16,cursor:'pointer',accentColor:'#2e8b4e'}}/>
                                  <label htmlFor={`aprov-${it.id}`} style={{fontSize:13,cursor:'pointer',fontWeight:700,color:it.costo_aprobado?'#2e8b4e':'#5a7a9a'}}>
                                    ✅ Costo real aprobado por Financiero {it.costo_aprobado?'— bloqueado':'— sin aprobar'}
                                  </label>
                                </div>
                                )}
                                {tieneReal&&<div style={{display:'flex',gap:16,marginTop:8,padding:'6px 10px',background:'#fff',borderRadius:6,border:'1px solid #2e8b4e22'}}>
                                  <span style={{fontSize:13,color:'#5a7a9a'}}>Ahorro:</span>
                                  <span style={{fontSize:14,fontWeight:700,color:c.ahorro>=0?'#2e8b4e':'#c8264a'}}>{fmt(c.ahorro)}</span>
                                  <span style={{fontSize:13,color:'#5a7a9a',marginLeft:12}}>Margen real:</span>
                                  <span style={{fontSize:14,fontWeight:700,color:c.margenReal>=0?'#2e8b4e':'#c8264a'}}>{fmt(c.margenReal)} ({fmtPct(c.margenRealPct)})</span>
                                </div>}
                              </div>
                              )}

                              {/* PRECIO CLIENTE */}
                              <div style={{gridColumn:'1/-1',background:'#eef4fb',borderRadius:8,padding:'10px 12px',border:'1px solid #c8d8e8'}}>
                                <div style={{fontSize:12,fontWeight:700,color:'#0d3b5e',marginBottom:8}}>👤 Precio cliente</div>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
                                  <div><Label>Precio unitario ($)</Label><input type="number" step="0.01" style={S.input} value={it.precio_unit??0} onWheel={e=>e.target.blur()} disabled={it.costo_aprobado&&!canApproveCostoReal(userRole)} onChange={e=>updItem(it.id,'precio_unit',e.target.value)}/></div>
                                  <div><Label>Cantidad</Label><input style={S.inputRO} readOnly value={it.cantidad??1}/></div>
                                  <div><Label>Días</Label><input style={S.inputRO} readOnly value={it.dias??1}/></div>
                                  <div><Label>Total (unit×cant×días)</Label><input style={{...S.inputRO,fontWeight:700,color:'#0d3b5e'}} readOnly value={fmt(c.precio)}/></div>
                                </div>
                              </div>

                              {/* Margen */}
                              <div style={{gridColumn:'1/-1',display:'flex',alignItems:'center',gap:16,padding:'6px 10px',background:c.margen>=0?'#edf7ed':'#fdeef1',borderRadius:6}}>
                                <span style={{fontSize:13,color:'#5a7a9a'}}>Margen cotizado:</span>
                                <span style={{fontSize:15,fontWeight:700,color:c.margen>=0?'#2e8b4e':'#c8264a'}}>{fmt(c.margen)} ({fmtPct(c.margenPct)})</span>
                              </div>

                              <div><Label>Razón social proveedor</Label><input style={S.input} value={it.proveedor||''} onChange={e=>updItem(it.id,'proveedor',e.target.value)}/></div>
                              <div><Label># Factura proveedor</Label><input style={S.input} value={it.num_factura_prov||''} onChange={e=>updItem(it.id,'num_factura_prov',e.target.value)} placeholder="Ej: 001-001-000123456"/></div>
                              <div><Label>Info general</Label><input style={S.input} value={it.info||''} onChange={e=>updItem(it.id,'info',e.target.value)}/></div>

                              {/* CONDICIÓN DE PAGO */}
                              <div style={{gridColumn:'1/-1',background:'#fdf8ee',borderRadius:8,padding:'10px 12px',border:'1px solid #e8d8a0'}}>
                                <div style={{fontSize:12,fontWeight:700,color:'#7a5500',marginBottom:8}}>💳 Condición de pago</div>
                                <div style={{display:'flex',gap:8,marginBottom:10}}>
                                  {['Contado','Crédito','Abono'].map(op => (
                                    <button key={op} onClick={()=>updItem(it.id,'condicion_pago',op)}
                                      style={{padding:'5px 14px',borderRadius:7,border:'1px solid',fontSize:12,cursor:'pointer',fontFamily:'inherit',fontWeight:500,
                                        background: it.condicion_pago===op?'#7a5500':'#fff',
                                        color:      it.condicion_pago===op?'#fff':'#7a5500',
                                        borderColor:'#c8a840',
                                      }}>{op}</button>
                                  ))}
                                </div>
                                {it.condicion_pago==='Crédito' && (
                                  <div style={{display:'grid',gridTemplateColumns:'1fr',gap:8}}>
                                    <div><Label>Días de crédito</Label>
                                      <input type="number" min="0" style={S.input} value={it.dias_credito||''} placeholder="Ej: 30" onWheel={e=>e.target.blur()} onChange={e=>updItem(it.id,'dias_credito',e.target.value)}/>
                                    </div>
                                  </div>
                                )}
                                {it.condicion_pago==='Abono' && (()=>{
                                  const pct = Number(it.abono_pct||50);
                                  const totalItem = Number(it.costo_unit||0)*Number(it.cantidad||1)*Number(it.dias||1);
                                  const valorAbono = totalItem * (pct/100);
                                  const saldo = totalItem - valorAbono;
                                  return (
                                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                                      <div><Label>% de abono</Label>
                                        <input type="number" min="0" max="100" style={S.input} value={it.abono_pct||50} onWheel={e=>e.target.blur()} onChange={e=>updItem(it.id,'abono_pct',Number(e.target.value))}/>
                                      </div>
                                      <div><Label>Valor abono</Label>
                                        <input style={S.inputRO} readOnly value={fmt(valorAbono)}/>
                                      </div>
                                      <div><Label>Días crédito del saldo</Label>
                                        <input type="number" min="0" style={S.input} value={it.dias_credito_saldo||''} placeholder="Ej: 30" onWheel={e=>e.target.blur()} onChange={e=>updItem(it.id,'dias_credito_saldo',e.target.value)}/>
                                      </div>
                                      <div style={{gridColumn:'1/-1',fontSize:12,color:'#7a5500',background:'#fff8e6',borderRadius:6,padding:'6px 10px'}}>
                                        Saldo a recibir en {it.dias_credito_saldo||'—'} días: <strong>{fmt(saldo)}</strong>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* MULTI-PROVEEDOR */}
                              <div style={{gridColumn:'1/-1',background:'#f8fafc',borderRadius:8,padding:'10px 12px',border:'1px solid #dde6ef'}}>
                                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                                  <div style={{fontSize:12,fontWeight:700,color:'#5a7a9a'}}>🏭 Proveedores adicionales</div>
                                  <button onClick={()=>{
                                    const provs = [...(it.proveedores_adicionales||[]), {id:crypto.randomUUID(),razon_social:'',factura:'',costo:0}];
                                    updItem(it.id,'proveedores_adicionales',provs);
                                  }} style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:'1px solid #0d3b5e',background:'transparent',color:'#0d3b5e',cursor:'pointer',fontFamily:'inherit'}}>
                                    + Agregar proveedor
                                  </button>
                                </div>
                                {(it.proveedores_adicionales||[]).length === 0 && (
                                  <div style={{fontSize:12,color:'#aaa',fontStyle:'italic'}}>Sin proveedores adicionales — el precio al cliente es uno solo</div>
                                )}
                                {(it.proveedores_adicionales||[]).map((prov,pi) => (
                                  <div key={prov.id} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto auto',gap:8,marginBottom:8,padding:'8px',background:'#fff',borderRadius:6,border:'1px solid #eee'}}>
                                    <div><Label>Razón social</Label>
                                      <input style={S.input} value={prov.razon_social||''} placeholder="Nombre del proveedor"
                                        onChange={e=>{const ps=[...(it.proveedores_adicionales||[])];ps[pi]={...ps[pi],razon_social:e.target.value};updItem(it.id,'proveedores_adicionales',ps);}}/>
                                    </div>
                                    <div><Label># Factura</Label>
                                      <input style={S.input} value={prov.factura||''} placeholder="001-001-000123"
                                        onChange={e=>{const ps=[...(it.proveedores_adicionales||[])];ps[pi]={...ps[pi],factura:e.target.value};updItem(it.id,'proveedores_adicionales',ps);}}/>
                                    </div>
                                    <div><Label>Costo ($)</Label>
                                      <input type="number" step="0.01" style={S.input} value={prov.costo||0}
                                        onChange={e=>{const ps=[...(it.proveedores_adicionales||[])];ps[pi]={...ps[pi],costo:Number(e.target.value)};updItem(it.id,'proveedores_adicionales',ps);}}/>
                                    </div>
                                    <div style={{display:'flex',alignItems:'flex-end',paddingBottom:2}}>
                                      <button onClick={()=>{const ps=(it.proveedores_adicionales||[]).filter((_,i)=>i!==pi);updItem(it.id,'proveedores_adicionales',ps);}}
                                        style={{background:'#fee2e2',border:'none',borderRadius:6,color:'#dc2626',cursor:'pointer',padding:'7px 10px',fontSize:13}}>✕</button>
                                    </div>
                                  </div>
                                ))}
                                {(it.proveedores_adicionales||[]).length > 0 && (
                                  <div style={{fontSize:12,color:'#5a7a9a',marginTop:4,padding:'6px 10px',background:'#eef4fb',borderRadius:6}}>
                                    Costo adicional total: <strong>{fmt((it.proveedores_adicionales||[]).reduce((a,p)=>a+Number(p.costo||0),0))}</strong> — el precio al cliente no cambia
                                  </div>
                                )}
                              </div>

                              {/* Foto de referencia */}
                              <div style={{gridColumn:'1/-1',background:'#f8fafc',borderRadius:8,padding:'10px 12px',border:'1px dashed #c8d8e8'}}>
                                <Label>📸 Foto de referencia (aparece en PDF y vista cliente)</Label>
                                <input type="file" accept="image/*" style={{marginTop:6,fontSize:13,display:'block'}}
                                  onChange={e=>{
                                    const file=e.target.files[0];if(!file)return;
                                    const reader=new FileReader();
                                    reader.onload=ev=>updItem(it.id,'foto_referencia',ev.target.result);
                                    reader.readAsDataURL(file);
                                  }}/>
                                {it.foto_referencia&&(
                                  <div style={{marginTop:8,display:'flex',alignItems:'flex-start',gap:10}}>
                                    <img src={it.foto_referencia} alt="ref" style={{maxHeight:80,maxWidth:120,borderRadius:4,border:'1px solid #dde6ef',objectFit:'cover'}}/>
                                    <button style={S.btnRed} onClick={()=>updItem(it.id,'foto_referencia',null)}>✕ Quitar foto</button>
                                  </div>
                                )}
                              </div>


                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ));

            // Main render: subpresupuestos or flat grupos
            return (
              <div>
                {haySubpptos ? subpptos.map(sp => {
                  const spItems = sp.grupos.flatMap(g=>g.items);
                  const spTotal = spItems.reduce((a,it)=>a+calcItem(it).precio,0);
                  const spCosto = spItems.reduce((a,it)=>a+calcItem(it).totalCosto,0);
                  return (
                    <div key={sp.id} style={{marginBottom:20,border:`2px solid ${sp.incluir?'#7c3aed':'#ddd'}`,borderRadius:12,overflow:'hidden'}}>
                      {/* Header subpresupuesto */}
                      <div style={{background:sp.incluir?'#5b21b6':'#888',padding:'10px 16px',display:'flex',alignItems:'center',gap:12}}>
                        <span style={{color:'#fff',fontWeight:700,fontSize:15,flex:1}}>📦 {sp.nombre}</span>
                        {/* Checkbox incluir en total */}
                        <label style={{display:'flex',alignItems:'center',gap:6,color:'rgba(255,255,255,.9)',fontSize:12,cursor:'pointer'}}>
                          <input type="checkbox" checked={sp.incluir} onChange={e=>{
                            setP(prev=>({...prev,items:prev.items.map(it=>it.id===sp.id?{...it,incluir_en_total:e.target.checked}:it)}));
                          }} style={{accentColor:'#fff',width:14,height:14}}/>
                          Incluir en total
                        </label>
                        {/* Duplicar subpresupuesto */}
                        {!bloqueado&&<button onClick={()=>{
                          const newNombre=window.prompt('Nombre del subpresupuesto duplicado:',sp.nombre+' (copia)');
                          if(!newNombre?.trim())return;
                          const newSpId=crypto.randomUUID();
                          const newSpItem={id:newSpId,_type:'subppto',subpresupuesto:newNombre.trim(),incluir_en_total:true,item:'',detalle:'',cantidad:0,dias:0,costo_unit:0,precio_unit:0,oh_pct:0,bco_pct:0,categoria:'',es_liquidacion:false};
                          // Clone all items of this subpresupuesto
                          const spAllItems=p.items.slice(p.items.findIndex(it=>it.id===sp.id));
                          const end=spAllItems.findIndex((it,i)=>i>0&&it._type==='subppto');
                          const block=spAllItems.slice(0,end<0?spAllItems.length:end).map(it=>({...it,id:crypto.randomUUID()}));
                          block[0]={...newSpItem};
                          setP(prev=>({...prev,items:[...prev.items,...block]}));
                        }} style={{background:'rgba(255,255,255,.15)',border:'1px solid rgba(255,255,255,.3)',color:'#fff',padding:'3px 10px',borderRadius:6,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
                          📋 Duplicar
                        </button>}
                        {/* Eliminar subpresupuesto */}
                        {!bloqueado&&<button onClick={()=>{
                          if(!window.confirm(`¿Eliminar subpresupuesto "${sp.nombre}" y todos sus ítems?`))return;
                          const idx=p.items.findIndex(it=>it.id===sp.id);
                          const rest=p.items.slice(idx+1);
                          const endIdx=rest.findIndex(it=>it._type==='subppto');
                          const idsToRemove=new Set([sp.id,...rest.slice(0,endIdx<0?rest.length:endIdx).map(it=>it.id)]);
                          setP(prev=>({...prev,items:prev.items.filter(it=>!idsToRemove.has(it.id))}));
                        }} style={{background:'rgba(220,38,38,.6)',border:'none',color:'#fff',padding:'3px 8px',borderRadius:6,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>✕</button>}
                        <span style={{color:'rgba(255,255,255,.8)',fontSize:12,fontWeight:600}}>{fmt(spTotal)}</span>
                      </div>
                      {/* Grupos del subpresupuesto */}
                      <div style={{padding:'8px 12px'}}>
                        {renderGrupos(sp.grupos, sp.id)}
                        {/* Totales del subpresupuesto */}
                        {spItems.length>0&&<div style={{background:'#5b21b6',borderRadius:8,padding:'10px 14px',marginTop:8,display:'flex',gap:16,flexWrap:'wrap',justifyContent:'flex-end'}}>
                          {[['Subtotal precio',fmt(spTotal)],['Total costo',fmt(spCosto)],['Margen',fmt(spTotal-spCosto)]].map(([l,v])=>(
                            <div key={l} style={{textAlign:'right'}}>
                              <div style={{fontSize:9,color:'rgba(255,255,255,.6)',textTransform:'uppercase',marginBottom:2}}>{l}</div>
                              <div style={{fontSize:13,fontWeight:700,color:'#fff'}}>{v}</div>
                            </div>
                          ))}
                        </div>}
                      </div>
                    </div>
                  );
                }) : renderGrupos(subpptos.flatMap(sp=>sp.grupos), '__root__')}

                {/* Total general si hay subpresupuestos */}
                {haySubpptos&&(
                  <div style={{background:'#0d3b5e',borderRadius:10,padding:'12px 16px',marginTop:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{color:'rgba(255,255,255,.7)',fontSize:13}}>Total general (subpresupuestos incluidos)</span>
                    <span style={{color:'#fff',fontSize:18,fontWeight:700}}>{fmt(totalGeneral)}</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Botón global agregar subcategoría al final */}
          {!bloqueado&&<button style={{...S.btnPrimary,background:'#0d3b5e',width:'100%',marginTop:4}} onClick={()=>{
            const nombre=window.prompt('Nombre de la nueva subcategoría:');
            if(!nombre||!nombre.trim())return;
            const subcat={id:crypto.randomUUID(),_type:'subcat',subcategoria:nombre.trim(),item:'',detalle:'',cantidad:0,dias:0,costo_unit:0,precio_unit:0,oh_pct:0,bco_pct:0,categoria:'',es_liquidacion:false};
            setP(prev=>({...prev,items:[...prev.items,subcat]}));
          }}>+ Nueva subcategoría</button>}

          {/* ── Opciones adicionales ── */}
          <OpcionesAdicionales p={p} setP={setP} bloqueado={bloqueado} fmt={fmt} fmtPct={fmtPct} calcItem={calcItem} S={S} Label={Label} />
        </div>
      )}

      {/* ══ TOTALES ══ */}
      {tab==='totales'&&(
        <div>
          {/* Subtotales costo */}
          <div style={{...S.grid4,marginBottom:12}}>
            <div style={S.metricCard}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>Subtotal costo proveedores</div><div style={{fontSize:16,fontWeight:700,color:'#5a7a9a'}}>{fmt(totales.subtotalCostoBase)}</div></div>
            <div style={S.metricCard}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>OH acumulado</div><div style={{fontSize:16,fontWeight:700,color:'#5a7a9a'}}>{fmt(totales.subtotalOH)}</div></div>
            <div style={S.metricCard}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>BCO acumulado</div><div style={{fontSize:16,fontWeight:700,color:'#5a7a9a'}}>{fmt(totales.subtotalBCO)}</div></div>
            <div style={{...S.metricCard,background:'#f0eaf4'}}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>Total costo c/OH+BCO</div><div style={{fontSize:16,fontWeight:700,color:'#5a3a7e'}}>{fmt(totales.subtotalCosto)}</div></div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:12}}>
            <div style={S.metricCard}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>Subtotal precio cliente</div><div style={{fontSize:16,fontWeight:700}}>{fmt(totales.subtotalPrecio)}</div></div>
            <div style={S.metricCard}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>Fee agencia ({p.fee_agencia??0}%)</div><div style={{fontSize:16,fontWeight:700}}>{fmt(totales.feeAgencia)}</div></div>
            <div style={{...S.metricCard,background:'#e0f7f6'}}><div style={{fontSize:11,color:'#0d6e69',marginBottom:4}}>Margen (sin fee)</div><div style={{fontSize:16,fontWeight:700,color:totales.margenSinFee>=0?'#0d6e69':'#c8264a'}}>{fmt(totales.margenSinFee)} <span style={{fontSize:13}}>({fmtPct(totales.margenSinFeePct)})</span></div></div>
          </div>

          {/* Subtotales por subpresupuesto */}
          {(p.items||[]).some(it=>it._type==='subppto') && (() => {
            const spList=[]; let spA=null;
            (p.items||[]).forEach(it=>{
              if(it._type==='subppto'){spA={id:it.id,nombre:it.subpresupuesto,incluir:it.incluir_en_total!==false,items:[]};spList.push(spA);}
              else if(!it._type&&spA) spA.items.push(it);
            });
            return (
              <div style={{border:'1px solid #7c3aed33',borderRadius:10,overflow:'hidden',marginBottom:16}}>
                <div style={{background:'#5b21b6',padding:'8px 16px',fontSize:12,fontWeight:700,color:'#fff'}}>Subtotales por subpresupuesto</div>
                {spList.map(sp=>{
                  const spPrecio=sp.items.reduce((a,it)=>a+calcItem(it).precio,0);
                  const spCosto=sp.items.reduce((a,it)=>a+calcItem(it).costoTotal,0);
                  const spFee=spPrecio*((p.fee_agencia||0)/100);
                  return (
                    <div key={sp.id} style={{padding:'10px 16px',borderBottom:'1px solid #e8e0f8',background:sp.incluir?'#faf8ff':'#f8f8f8',opacity:sp.incluir?1:0.5}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                        <span style={{fontWeight:700,color:'#5b21b6',fontSize:13}}>{sp.nombre}{!sp.incluir&&<span style={{fontSize:11,color:'#888',fontWeight:400}}> (excluido)</span>}</span>
                        <span style={{fontSize:14,fontWeight:700,color:'#0d3b5e'}}>{fmt(spPrecio)}</span>
                      </div>
                      <div style={{display:'flex',gap:16,fontSize:11,color:'#777'}}>
                        <span>Costo: <strong style={{color:'#c8264a'}}>{fmt(spCosto)}</strong></span>
                        {(p.fee_agencia||0)>0&&<span>Fee: <strong>{fmt(spFee)}</strong></span>}
                        <span>Total c/fee: <strong style={{color:'#0d3b5e'}}>{fmt(spPrecio+spFee)}</strong></span>
                        <span>Margen: <strong style={{color:(spPrecio-spCosto)>=0?'#2e8b4e':'#c8264a'}}>{fmt(spPrecio-spCosto)}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Total principal — SIN rebate */}
          <div style={{border:'1px solid #dde6ef',borderRadius:10,overflow:'hidden',marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',padding:'11px 20px',borderBottom:'1px solid #dde6ef',background:'#f0f4f8'}}>
              <span style={{fontSize:16,fontWeight:700,color:'#0d3b5e'}}>Subtotal sin IVA</span>
              <span style={{fontSize:16,fontWeight:700,color:'#0d3b5e'}}>{fmt(totales.totalSinIva)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'9px 20px',borderBottom:'1px solid #dde6ef'}}>
              <span style={{fontSize:13,color:'#5a7a9a'}}>IVA 15%</span>
              <span style={{fontSize:13,fontWeight:600}}>{fmt(totales.iva15)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'14px 20px',background:'#0d3b5e'}}>
              <span style={{fontSize:14,color:'#fff',fontWeight:700}}>TOTAL CON IVA</span>
              <span style={{fontSize:22,color:'#3dbfb8',fontWeight:800}}>{fmt(totales.totalConIva)}</span>
            </div>
          </div>

          {/* REBATE — informativo, después del total */}
          {p.apply_rebate&&(
            <div style={{border:'1px solid #f0d080',borderRadius:10,overflow:'hidden',marginBottom:16,background:'#fff8e6'}}>
              <div style={{padding:'10px 20px',borderBottom:'1px solid #f0d080',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:'#7a5500'}}>REBATE {p.rebate_pct??0}% — Nota de crédito (informativo)</div>
                  <div style={{fontSize:11,color:'#a07020'}}>No incluido en factura. Se emite como nota de crédito separada.</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <input type="number" step="0.1" style={{...S.input,width:70}} value={p.rebate_pct??0} onChange={e=>setNum('rebate_pct',e.target.value)}/>
                  <span style={{fontSize:18,fontWeight:700,color:'#7a5500'}}>{fmt(totales.rebate)}</span>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>
                <div style={{padding:'10px 20px',borderRight:'1px solid #f0d080'}}>
                  <div style={{fontSize:11,color:'#a07020',marginBottom:3}}>Utilidad con rebate</div>
                  <div style={{fontSize:16,fontWeight:700,color:'#7a5500'}}>{fmt(totales.utilidadConRebate)}</div>
                </div>
                <div style={{padding:'10px 20px'}}>
                  <div style={{fontSize:11,color:'#a07020',marginBottom:3}}>Margen con rebate</div>
                  <div style={{fontSize:16,fontWeight:700,color:'#7a5500'}}>{fmtPct(totales.utilidadConRebatePct)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Ahorro real — solo si hay ítems con costo real ingresado */}
          {totales.subtotalAhorro!==0&&(
            <div style={{border:'1px solid #2e8b4e44',borderRadius:10,overflow:'hidden',marginBottom:16,background:'#edf7ed'}}>
              <div style={{padding:'10px 20px',borderBottom:'1px solid #2e8b4e22',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontSize:13,fontWeight:700,color:'#2e8b4e'}}>✅ Análisis de cierre (costo real vs cotizado)</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0}}>
                <div style={{padding:'10px 20px',borderRight:'1px solid #2e8b4e22'}}>
                  <div style={{fontSize:11,color:'#5a7a9a',marginBottom:3}}>Costo real total</div>
                  <div style={{fontSize:16,fontWeight:700,color:'#2e8b4e'}}>{fmt(totales.subtotalCostoReal)}</div>
                </div>
                <div style={{padding:'10px 20px',borderRight:'1px solid #2e8b4e22'}}>
                  <div style={{fontSize:11,color:'#5a7a9a',marginBottom:3}}>Ahorro total</div>
                  <div style={{fontSize:16,fontWeight:700,color:totales.subtotalAhorro>=0?'#2e8b4e':'#c8264a'}}>{fmt(totales.subtotalAhorro)}</div>
                </div>
                <div style={{padding:'10px 20px'}}>
                  <div style={{fontSize:11,color:'#5a7a9a',marginBottom:3}}>Margen real</div>
                  <div style={{fontSize:16,fontWeight:700,color:totales.margenRealTotal>=0?'#2e8b4e':'#c8264a'}}>{fmt(totales.margenRealTotal)} ({fmtPct(totales.margenRealPct)})</div>
                </div>
              </div>
            </div>
          )}

          {/* Desglose por categoría */}
          <h3 style={{fontSize:14,fontWeight:700,color:'#0d3b5e',margin:'20px 0 10px'}}>Desglose por categoría</h3>
          <table style={S.table}>
            <thead><tr>{['Categoría','Ítems','Costo prov.','OH+BCO','Total costo','Precio cliente','Margen','%'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {categorias.filter(cat=>p.items.some(it=>it.categoria===cat.nombre)).map(cat=>{
                const its=p.items.filter(it=>it.categoria===cat.nombre);
                const tot=its.reduce((a,it)=>{const c=calcItem(it);a.costo+=c.costoTotal;a.ohbco+=c.ohVal+c.bcoVal;a.total+=c.totalCosto;a.precio+=c.precio;a.margen+=c.margen;return a;},{costo:0,ohbco:0,total:0,precio:0,margen:0});
                const pct=tot.precio>0?(tot.margen/tot.precio)*100:0;
                return(<tr key={cat.id}>
                  <td style={S.td}>{cat.nombre}</td>
                  <td style={{...S.td,textAlign:'right',color:'#8aa0b8'}}>{its.length}</td>
                  <td style={{...S.td,textAlign:'right',color:'#8aa0b8'}}>{fmt(tot.costo)}</td>
                  <td style={{...S.td,textAlign:'right',color:'#8aa0b8'}}>{fmt(tot.ohbco)}</td>
                  <td style={{...S.td,textAlign:'right',color:'#5a3a7e'}}>{fmt(tot.total)}</td>
                  <td style={{...S.td,textAlign:'right',fontWeight:600}}>{fmt(tot.precio)}</td>
                  <td style={{...S.td,textAlign:'right',fontWeight:600,color:tot.margen>=0?'#2e8b4e':'#c8264a'}}>{fmt(tot.margen)}</td>
                  <td style={{...S.td,textAlign:'right',fontWeight:600,color:tot.margen>=0?'#2e8b4e':'#c8264a'}}>{fmtPct(pct)}</td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ FLUJO DE CAJA ══ */}
      {tab==='totales' && ['aprobado','pendiente_facturar','facturado'].includes(p.estado) && <FlujoCaja p={p} fmt={fmt} fmtDate={fmtDate} />}

      {/* ══ ALCANCE ══ */}
      {tab==='alcance'&&(
        <AlcanceTab
          presupuestoId={p.id}
          presupuesto={p}
          cfg={cfg}
          logoUrl={logoUrl}
          userRole={userRole}
        />
      )}

      {/* ══ VISTA PREVIA ══ */}
      {tab==='vista'&&(
        <div>
          {/* Botón de flujo de trabajo */}
          {getFlujoBtnLabel(p.estado) && (
            <div style={{marginBottom:14,padding:'14px 16px',background:'#eef4fb',border:'1px solid #c8d8e8',borderRadius:10,display:'flex',alignItems:'center',gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:12,color:'#5a7a9a',marginBottom:2}}>Siguiente paso en el flujo</div>
                <div style={{fontSize:13,fontWeight:600,color:'#0d3b5e'}}>{ESTADOS_PPTO_LABELS[getFlujoBtnNextEstado(p.estado)]}</div>
              </div>
              <button
                style={{...S.btnPrimary,background:'#0d3b5e',padding:'10px 20px',fontSize:13}}
                onClick={async () => {
                  const nextEstado = getFlujoBtnNextEstado(p.estado);
                  if (!nextEstado) return;
                  if (!canChangeEstadoPpto(userRole, nextEstado)) { showToast('⚠️ Sin permiso'); return; }
                  setField('estado', nextEstado);
                  await supabase.from('presupuestos').update({ estado: nextEstado }).eq('id', p.id);
                  await saveVersion({ ...p, estado: nextEstado }, nextEstado);
                  showToast(`Estado actualizado: ${ESTADOS_PPTO_LABELS[nextEstado]}`);
                }}
              >
                {getFlujoBtnLabel(p.estado)} →
              </button>
            </div>
          )}

          {/* Check cerrado por producción */}
          {canMarkCerradoProduccion(userRole) && ESTADOS_CIERRE.includes(p.estado) && (() => {
            const itemsConCosto = (p.items||[]).filter(it=>!it._type);
            const todosCostosReales = itemsConCosto.length > 0 && itemsConCosto.every(it=>Number(it.costo_real_unit||0)>0);
            const puedecerrarse = p.ejecutado && todosCostosReales;
            return (
            <div style={{marginBottom:14,padding:'12px 16px',background:p.cerrado_produccion?'#e8f5ee':'#f8fafc',border:`1px solid ${p.cerrado_produccion?'#2e8b4e':'#dde6ef'}`,borderRadius:10,display:'flex',alignItems:'center',gap:12}}>
              <input type="checkbox" id="cerrado_prod" checked={!!p.cerrado_produccion}
                disabled={!puedecerrarse && !p.cerrado_produccion}
                onChange={e => setField('cerrado_produccion', e.target.checked)}
                style={{width:18,height:18,cursor:puedecerrarse?'pointer':'not-allowed',accentColor:'#2e8b4e'}}/>
              <label htmlFor="cerrado_prod" style={{fontSize:13,fontWeight:600,cursor:puedecerrarse?'pointer':'default',color:p.cerrado_produccion?'#2e8b4e':puedecerrarse?'#0d3b5e':'#aaa'}}>
                {p.cerrado_produccion ? '✅ Cerrado por producción' : 'Cerrado por producción'}
              </label>
              {!p.ejecutado && <span style={{fontSize:11,color:'#c8264a',marginLeft:'auto'}}>Requiere: marcar como Ejecutado</span>}
              {p.ejecutado && !todosCostosReales && <span style={{fontSize:11,color:'#c8264a',marginLeft:'auto'}}>Requiere: completar todos los costos reales en los ítems</span>}
              {p.cerrado_produccion && <span style={{fontSize:11,color:'#2e8b4e',marginLeft:'auto'}}>✓ Notificado a Financiero</span>}
            </div>
            );
          })()}

          <div style={{display:'flex',gap:8,marginBottom:16}}>
            <button style={{...S.btnPrimary,opacity:previewMode==='cliente'?1:0.55}} onClick={()=>setPreviewMode('cliente')}>👤 Vista cliente</button>
            <button style={{...S.btnSecondary,opacity:previewMode==='financiero'?1:0.55,border:'1px solid #0d3b5e',color:'#0d3b5e'}} onClick={()=>setPreviewMode('financiero')}>💼 Vista financiera</button>
            <div style={{flex:1}}/>
            <button style={{...S.btnPrimary,background:'#c8264a'}} onClick={openPdfCliente}>📄 PDF cliente</button>
            {canDownloadPdfFinanciero(userRole) && <button style={{...S.btnSecondary,color:'#c8264a',borderColor:'#c8264a44'}} onClick={openPdfFinanciero}>📊 PDF financiero</button>}
            {canDownloadExcel(userRole) && <button style={S.btnSecondary} onClick={downloadExcel}>📥 Excel</button>}
          </div>
          {!previewMode&&<div style={S.empty}>Selecciona una vista arriba para previsualizar</div>}
          {previewMode&&(()=>{
            // Agrupar con soporte de subpresupuestos
            const allItems = p.items||[];
            const tieneSubpptos = allItems.some(it=>it._type==='subppto');

            // Build subpptos structure
            const subpptos=[]; let spAct=null; let grAct=null;
            allItems.forEach(it=>{
              if(it._type==='subppto'){spAct={id:it.id,nombre:it.subpresupuesto,incluir:it.incluir_en_total!==false,grupos:[]};subpptos.push(spAct);grAct=null;}
              else if(it._type==='subcat'){if(!spAct){spAct={id:'__r',nombre:'',incluir:true,grupos:[]};subpptos.push(spAct);}grAct={subcat:it.subcategoria,items:[]};spAct.grupos.push(grAct);}
              else{if(!spAct){spAct={id:'__r',nombre:'',incluir:true,grupos:[]};subpptos.push(spAct);}if(!grAct){grAct={subcat:'Servicios',items:[]};spAct.grupos.push(grAct);}grAct.items.push(it);}
            });

            // Only included subpptos
            const subpptosIncluidos = tieneSubpptos ? subpptos.filter(sp=>sp.incluir) : subpptos;

            const colSpan = previewMode==='financiero' ? 9 : 5;

            const renderSubcatRows = (grupos) => grupos.map(({subcat,items})=>(
              <>
                <tr key={`h-${subcat}`}><td colSpan={colSpan} style={{padding:'5px 10px',background:'#0d3b5e',color:'#fff',fontSize:9,fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>{subcat}</td></tr>
                {items.map((it,i)=>{const c=calcItem(it);return(
                  <tr key={it.id} style={{borderBottom:'1px solid #eef2f7',background:i%2?'#fafcfe':'#fff'}}>
                    <td style={{padding:'6px 10px'}}>
                      <div style={{fontWeight:600,color:'#1a1a2e'}}>{it.item}</div>
                      {it.detalle&&<div style={{fontSize:10,color:'#8aa0b8'}}>{it.detalle}</div>}
                      {it.foto_referencia&&<img src={it.foto_referencia} alt="ref" style={{maxHeight:50,maxWidth:80,marginTop:3,borderRadius:3,objectFit:'cover'}}/>}
                    </td>
                    <td style={{padding:'6px',textAlign:'center'}}>{c.cantidad}</td>
                    <td style={{padding:'6px',textAlign:'center'}}>{c.dias}</td>
                    {previewMode==='financiero'&&<>
                      <td style={{padding:'6px',textAlign:'right',color:'#c8264a'}}>{fmt(c.costoUnit)}</td>
                      <td style={{padding:'6px',textAlign:'right',color:'#c8264a',fontWeight:600}}>{fmt(c.costoTotal)}</td>
                    </>}
                    <td style={{padding:'6px',textAlign:'right'}}>{fmt(c.precioU)}</td>
                    <td style={{padding:'6px 10px',textAlign:'right',fontWeight:700}}>{fmt(c.precio)}</td>
                    {previewMode==='financiero'&&<>
                      <td style={{padding:'6px',fontSize:10,color:'#5a7a9a'}}>{it.proveedor}</td>
                      <td style={{padding:'6px',fontSize:10,color:'#5a7a9a'}}>{it.num_factura_prov||''}</td>
                    </>}
                  </tr>
                );})}
              </>
            ));

            return(
              <div style={{border:'1px solid #dde6ef',borderRadius:8,overflow:'hidden',fontSize:12}}>
                <div style={{background:'#0d3b5e',padding:'12px 20px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{color:'#fff',fontWeight:700,fontSize:14,fontStyle:'italic'}}>matilda <span style={{fontStyle:'normal',fontSize:9,color:'#3dbfb8',letterSpacing:2}}>EVENT DESIGNERS</span></div>
                  <div style={{textAlign:'right'}}><div style={{color:'#3dbfb8',fontSize:9,letterSpacing:1}}>PROPUESTA COMERCIAL</div><div style={{color:'#fff',fontSize:10,fontFamily:'monospace'}}>{p.nomenclatura||'—'}</div></div>
                </div>
                <div style={{background:'#c8264a',height:3}}/>
                <div style={{padding:'12px 20px',background:'#f8fafc',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,borderBottom:'1px solid #dde6ef'}}>
                  {[['Cliente',p.cliente],['Evento',p.nombre],['Fecha evento',p.fecha_evento],['Lugar',p.lugar],['PAX',p.personas?`${p.personas} pax`:''],['Días',p.dias_evento?`${p.dias_evento} días`:''],['Ejecutivo',p.ejecutivo_nombre],['Correo',p.ejecutivo_email]].filter(([,v])=>v).map(([l,v])=>(
                    <div key={l}><div style={{fontSize:8,color:'#3dbfb8',fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>{l}</div><div style={{fontSize:12,fontWeight:700,color:'#0d3b5e'}}>{v}</div></div>
                  ))}
                </div>
                <div style={{padding:'12px 20px 0'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                    <thead>
                      <tr style={{background:'#e8f0f8'}}>
                        <th style={{padding:'6px 10px',textAlign:'left',color:'#0d3b5e',fontSize:9,textTransform:'uppercase',width:'28%'}}>Ítem</th>
                        <th style={{padding:'6px 6px',textAlign:'center',color:'#0d3b5e',fontSize:9}}>Cant</th>
                        <th style={{padding:'6px 6px',textAlign:'center',color:'#0d3b5e',fontSize:9}}>Días</th>
                        {previewMode==='financiero'&&<>
                          <th style={{padding:'6px',textAlign:'right',color:'#c8264a',fontSize:9}}>C.Unit</th>
                          <th style={{padding:'6px',textAlign:'right',color:'#c8264a',fontSize:9}}>C.Total</th>
                        </>}
                        <th style={{padding:'6px 6px',textAlign:'right',color:'#0d3b5e',fontSize:9}}>P.Unit</th>
                        <th style={{padding:'6px 10px',textAlign:'right',color:'#0d3b5e',fontSize:9}}>Total</th>
                        {previewMode==='financiero'&&<>
                          <th style={{padding:'6px',textAlign:'left',color:'#c8264a',fontSize:9}}>Proveedor</th>
                          <th style={{padding:'6px',textAlign:'left',color:'#c8264a',fontSize:9}}># Fact.</th>
                        </>}
                      </tr>
                    </thead>
                    <tbody>
                      {subpptosIncluidos.map(sp=>(
                        <>
                          {sp.nombre&&<tr key={`sp-${sp.id}`}><td colSpan={colSpan} style={{padding:'7px 10px',background:'#5b21b6',color:'#fff',fontSize:10,fontWeight:700}}>📦 {sp.nombre}</td></tr>}
                          {renderSubcatRows(sp.grupos)}
                          {sp.nombre&&tieneSubpptos&&(()=>{
                            const spTotal=sp.grupos.flatMap(g=>g.items).reduce((a,it)=>a+calcItem(it).precio,0);
                            return <tr style={{background:'#f5f3ff'}}><td colSpan={colSpan-1} style={{padding:'5px 10px',textAlign:'right',fontSize:10,color:'#5b21b6',fontWeight:600}}>Subtotal {sp.nombre}:</td><td style={{padding:'5px 10px',textAlign:'right',fontWeight:700,color:'#5b21b6'}}>{fmt(spTotal)}</td></tr>;
                          })()}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{padding:'8px 20px 16px',display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginTop:8}}>
                  {previewMode==='financiero'&&(
                    <div style={{fontSize:11,color:'#5a7a9a'}}>
                      <div>Costo proveedores: <strong style={{color:'#c8264a'}}>{fmt(totales.subtotalCostoBase)}</strong></div>
                      <div>OH+BCO: <strong style={{color:'#7a5500'}}>{fmt(totales.subtotalOH+totales.subtotalBCO)}</strong></div>
                      <div>Total costo: <strong style={{color:'#5a3a7e'}}>{fmt(totales.subtotalCosto)}</strong></div>
                      <div style={{marginTop:4}}>Margen: <strong style={{color:totales.margenTotal>=0?'#2e8b4e':'#c8264a'}}>{fmt(totales.margenTotal)} ({fmtPct(totales.margenPct)})</strong></div>
                    </div>
                  )}
                  <div style={{marginLeft:'auto',width:300,border:'1px solid #dde6ef',borderRadius:4,overflow:'hidden'}}>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'5px 12px',borderBottom:'1px solid #dde6ef'}}><span style={{fontSize:11,color:'#8aa0b8'}}>Subtotal servicios</span><span style={{fontSize:11,fontWeight:600}}>{fmt(totales.subtotalPrecio)}</span></div>
                    {(p.fee_agencia??0)>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'5px 12px',borderBottom:'1px solid #dde6ef'}}><span style={{fontSize:11,color:'#8aa0b8'}}>Fee agencia ({p.fee_agencia}%)</span><span style={{fontSize:11,fontWeight:600}}>{fmt(totales.feeAgencia)}</span></div>}
                    <div style={{display:'flex',justifyContent:'space-between',padding:'5px 12px',borderBottom:'1px solid #dde6ef',background:'#f0f4f8'}}><span style={{fontSize:11,color:'#0d3b5e',fontWeight:700}}>Subtotal sin IVA</span><span style={{fontSize:11,fontWeight:700,color:'#0d3b5e'}}>{fmt(totales.totalSinIva)}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'5px 12px',borderBottom:'1px solid #dde6ef'}}><span style={{fontSize:11,color:'#8aa0b8'}}>IVA 15%</span><span style={{fontSize:11,fontWeight:600}}>{fmt(totales.iva15)}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',background:'#0d3b5e'}}><span style={{fontSize:12,color:'#fff',fontWeight:700}}>TOTAL</span><span style={{fontSize:14,color:'#3dbfb8',fontWeight:700}}>{fmt(totales.totalConIva)}</span></div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      <Toast msg={toast}/>
    </div>
  );
}
