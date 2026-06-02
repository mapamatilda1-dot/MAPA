import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ── Helpers ───────────────────────────────────────────────────
function fmt(n) {
  return '$' + (Number(n)||0).toLocaleString('es-EC', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s + (s.length === 10 ? 'T12:00' : ''));
  return d.toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function fmtDateTime(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

const inp = { fontFamily:'inherit', fontSize:13, padding:'8px 10px', border:'1px solid #ddd', borderRadius:8, outline:'none', width:'100%', boxSizing:'border-box' };
const lbl = { fontSize:11, fontWeight:600, color:'#666', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4, display:'block' };

function Btn({ onClick, variant='primary', size='md', disabled, children, style={} }) {
  const base = { display:'inline-flex', alignItems:'center', gap:5, borderRadius:8, fontFamily:'inherit', fontWeight:500, cursor:disabled?'not-allowed':'pointer', border:'1px solid transparent', opacity:disabled?.6:1, ...style };
  const v = {
    primary:  { background:'#0d3b5e', color:'#fff' },
    secondary:{ background:'#fff', color:'#333', borderColor:'#ddd' },
    danger:   { background:'#dc2626', color:'#fff' },
    green:    { background:'#2e8b4e', color:'#fff' },
    orange:   { background:'#d97706', color:'#fff' },
  };
  const s = { sm:{padding:'5px 12px',fontSize:12}, md:{padding:'7px 14px',fontSize:13}, xs:{padding:'3px 9px',fontSize:11} };
  return <button onClick={onClick} disabled={disabled} style={{...base,...v[variant],...s[size]}}>{children}</button>;
}

// Estado → color
const ESTADOS = {
  borrador:  { bg:'#f3f4f6', color:'#555',     border:'#d1d5db', label:'Borrador'  },
  enviada:   { bg:'#dbeafe', color:'#1e40af',  border:'#93c5fd', label:'Enviada'   },
  pagado:    { bg:'#dcfce7', color:'#166534',  border:'#86efac', label:'Pagado'    },
  rechazada: { bg:'#fee2e2', color:'#991b1b',  border:'#fca5a5', label:'Rechazada' },
};

function EstadoBadge({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.borrador;
  return <span style={{ fontSize:11, padding:'3px 10px', borderRadius:999, fontWeight:600, background:e.bg, color:e.color, border:`1px solid ${e.border}` }}>{e.label}</span>;
}

// ── PDF de solicitud ──────────────────────────────────────────
function buildPDFSolicitud(sol) {
  const items = sol.items || [];
  const totalSol = items.reduce((a,it)=>a+Number(it.valor_solicitado||0),0);
  const totalPpto = items.reduce((a,it)=>a+Number(it.costo_presupuestado||0),0);
  const saldo = totalPpto - totalSol;
  const estado = ESTADOS[sol.estado] || ESTADOS.borrador;

  const itemsHtml = items.map((it,i) => {
    const saldoIt = Number(it.costo_presupuestado||0) - Number(it.valor_solicitado||0);
    return `<tr style="background:${i%2?'#f8fafc':'#fff'};border-bottom:1px solid #f0f0f0;">
      <td style="padding:7px 10px;font-size:11px;color:#666;">${it.subcategoria||'—'}</td>
      <td style="padding:7px 10px;font-size:13px;font-weight:500;">${it.item||'—'}</td>
      <td style="padding:7px 10px;text-align:right;font-size:12px;">${fmt(it.costo_presupuestado)}</td>
      <td style="padding:7px 10px;text-align:right;font-size:13px;font-weight:700;color:#0d3b5e;">${fmt(it.valor_solicitado)}</td>
      <td style="padding:7px 10px;text-align:right;font-weight:600;color:${saldoIt>=0?'#166534':'#991b1b'};">${fmt(saldoIt)}</td>
      <td style="padding:7px 10px;font-size:11px;color:#888;">${it.notas||'—'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;color:#1a1a2e;background:#f5f5f5;}@media print{body{background:#fff;}.no-print{display:none;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}}</style>
  </head><body>
  <button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;background:#0d3b5e;color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:13px;cursor:pointer;">⬇ PDF</button>
  <div style="max-width:800px;margin:0 auto;background:#fff;min-height:100vh;">
  <div style="background:#0d3b5e;padding:18px 28px;display:flex;justify-content:space-between;align-items:center;">
    <div style="color:#fff;font-size:20px;font-style:italic;font-weight:900;">matilda <span style="font-size:10px;color:#3dbfb8;letter-spacing:2px;font-style:normal;font-weight:400;">EVENT DESIGNERS</span></div>
    <div style="text-align:right;">
      <div style="color:#3dbfb8;font-size:9px;letter-spacing:2px;text-transform:uppercase;">Solicitud de Valores</div>
      <div style="color:rgba(255,255,255,0.8);font-size:11px;margin-top:2px;">${fmtDateTime(sol.created_at||new Date().toISOString())}</div>
    </div>
  </div>
  <div style="background:#c8264a;height:3px;"></div>
  <div style="padding:14px 28px;background:#f8fafc;border-bottom:1px solid #dde6ef;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
    ${[['Presupuesto',sol.presupuesto_nombre],['Cliente',sol.cliente_nombre],['Fecha evento',sol.fecha_evento?fmtDate(sol.fecha_evento):'—'],['Lugar',sol.lugar],['Solicitado por',sol.created_by_nombre||sol.created_by],['Estado',estado.label]].map(([l,v])=>`
      <div><div style="font-size:9px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px;">${l}</div>
      <div style="font-size:13px;font-weight:600;color:#0d3b5e;">${v||'—'}</div></div>`).join('')}
  </div>
  <div style="padding:16px 28px;">
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:#0d3b5e;color:#fff;">
        <th style="padding:8px 10px;text-align:left;font-size:10px;">Subcategoría</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;">Ítem</th>
        <th style="padding:8px 10px;text-align:right;font-size:10px;">Costo ppto.</th>
        <th style="padding:8px 10px;text-align:right;font-size:10px;">Valor solicitado</th>
        <th style="padding:8px 10px;text-align:right;font-size:10px;">Saldo</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;">Notas</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  </div>
  <div style="margin:0 28px 16px;background:#0d3b5e;border-radius:10px;padding:14px 18px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
    <div><div style="font-size:9px;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:3px;">Costo presupuestado</div><div style="font-size:16px;font-weight:700;color:#fff;">${fmt(totalPpto)}</div></div>
    <div><div style="font-size:9px;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:3px;">Valor solicitado</div><div style="font-size:16px;font-weight:700;color:#3dbfb8;">${fmt(totalSol)}</div></div>
    <div><div style="font-size:9px;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:3px;">Saldo</div><div style="font-size:16px;font-weight:700;color:${saldo>=0?'#5dc98a':'#ff6b6b'};">${fmt(saldo)}</div></div>
  </div>
  ${sol.notas?`<div style="margin:0 28px 16px;background:#f8fafc;border-left:3px solid #0d3b5e;padding:10px 14px;border-radius:0 6px 6px 0;font-size:13px;color:#555;">${sol.notas}</div>`:''}
  ${sol.motivo_rechazo?`<div style="margin:0 28px 16px;background:#fee2e2;border-left:3px solid #dc2626;padding:10px 14px;border-radius:0 6px 6px 0;font-size:13px;color:#991b1b;"><strong>Motivo de rechazo:</strong> ${sol.motivo_rechazo}</div>`:''}
  <div style="background:#0d3b5e;padding:10px 28px;text-align:center;margin-top:16px;">
    <div style="font-size:9px;color:#3dbfb8;font-style:italic;">"Donde la estrategia se convierte en experiencia."</div>
  </div>
  </div></body></html>`;
}

// ── Editor de solicitud ───────────────────────────────────────
function SolicitudEditor({ solicitud, presupuesto_id_inicial, presupuestos, userEmail, userName, onSave, onEnviar, onCancel, solicitudesAnteriores }) {
  const [form, setForm] = useState(() => {
    if (solicitud) return solicitud;
    return {
      presupuesto_id:'', presupuesto_nombre:'', cliente_nombre:'', fecha_evento:null,
      lugar:'', dias_evento:1, items:[], notas:'', estado:'borrador',
      created_by:userEmail, created_by_nombre:userName,
    };
  });
  const [ppto, setPpto] = useState(null);
  const [saving, setSaving] = useState(false);

  // Auto-cargar presupuesto inicial
  useEffect(() => {
    if (presupuesto_id_inicial && !solicitud) {
      loadPpto(presupuesto_id_inicial);
    } else if (solicitud?.presupuesto_id) {
      const pp = presupuestos.find(p=>p.id===solicitud.presupuesto_id);
      if (pp) setPpto(pp);
    }
  }, [presupuesto_id_inicial]);

  async function loadPpto(id) {
    if (!id) { setPpto(null); setForm(f=>({...f,presupuesto_id:'',presupuesto_nombre:'',cliente_nombre:'',fecha_evento:null,lugar:'',items:[]})); return; }
    const { data } = await supabase.from('presupuestos').select('*').eq('id', id).single();
    if (!data) return;
    setPpto(data);
    const items = (data.items||[]).filter(it=>!it._type).map(it=>({
      id: it.id, item:it.item||'', subcategoria:it.subcategoria||'', categoria:it.categoria||'',
      costo_presupuestado: Number(it.costo_unit||0)*Number(it.cantidad||0)*Number(it.dias||1),
      valor_solicitado:0, notas:'', seleccionado:false,
    }));
    setForm(f=>({...f, presupuesto_id:data.id, presupuesto_nombre:data.nombre||data.cliente,
      cliente_nombre:data.cliente, fecha_evento:data.fecha_evento,
      lugar:data.lugar||'', dias_evento:data.dias_evento||1, items,
    }));
  }

  function updItem(id, field, value) {
    setForm(f=>({...f, items:f.items.map(it=>it.id===id?{...it,[field]:value}:it)}));
  }
  function toggleItem(id) {
    setForm(f=>({...f, items:f.items.map(it=>it.id===id?{...it,seleccionado:!it.seleccionado}:it)}));
  }

  const seleccionados = form.items.filter(it=>it.seleccionado);
  const totalSolicitado = seleccionados.reduce((a,it)=>a+Number(it.valor_solicitado||0),0);
  const totalPresupuestado = seleccionados.reduce((a,it)=>a+Number(it.costo_presupuestado||0),0);
  const saldoTotal = totalPresupuestado - totalSolicitado;

  // Solicitudes anteriores del mismo presupuesto (no la actual)
  const solsAnt = (solicitudesAnteriores||[]).filter(s=>s.id!==solicitud?.id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  const solsAntHeaders = solsAnt.map(s=>({ id:s.id, fecha:fmtDate(s.created_at?.slice(0,10)), estado:s.estado, label:`Sol. ${fmtDate(s.created_at?.slice(0,10))}` }));

  // Calcular saldo disponible por ítem (solo enviadas y pagadas restan)
  function saldoDisponible(itemId, costoPresupuestado) {
    const pagadas = solsAnt.filter(s=>['enviada','pagado'].includes(s.estado))
      .flatMap(s=>s.items||[]).filter(it=>it.id===itemId);
    const yaUsado = pagadas.reduce((a,it)=>a+Number(it.valor_solicitado||0),0);
    return costoPresupuestado - yaUsado;
  }

  // Valor rechazado por ítem (informativo)
  function valorRechazado(itemId) {
    const rechazadas = solsAnt.filter(s=>s.estado==='rechazada')
      .flatMap(s=>s.items||[]).filter(it=>it.id===itemId);
    return rechazadas.reduce((a,it)=>a+Number(it.valor_solicitado||0),0);
  }

  // Valor de solicitud anterior por ítem
  function valorEnSol(solId, itemId) {
    const s = solsAnt.find(s=>s.id===solId);
    if (!s) return null;
    const it = (s.items||[]).find(it=>it.id===itemId);
    return it ? Number(it.valor_solicitado||0) : null;
  }

  async function handleSave() {
    if (!form.presupuesto_id) { alert('Seleccioná un presupuesto'); return; }
    setSaving(true);
    const data = { ...form, items: form.items.filter(it=>it.seleccionado) };
    await onSave(data);
    setSaving(false);
  }

  async function handleEnviar() {
    if (!form.presupuesto_id) { alert('Seleccioná un presupuesto'); return; }
    if (seleccionados.length===0) { alert('Seleccioná al menos un ítem'); return; }
    if (!window.confirm('¿Enviar la solicitud a Financiero? No podrá modificarse después.')) return;
    setSaving(true);
    await onEnviar({ ...form, items: form.items.filter(it=>it.seleccionado), estado:'enviada' });
    setSaving(false);
  }

  const bloqueado = form.estado !== 'borrador';

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button onClick={onCancel} style={{background:'none',border:'1px solid #ddd',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>← Volver</button>
        <h2 style={{fontSize:17,fontWeight:700,color:'#0d3b5e',flex:1}}>{solicitud?'Solicitud de valores':'Nueva solicitud de valores'}</h2>
        {!bloqueado && <EstadoBadge estado="borrador"/>}
        {bloqueado && <EstadoBadge estado={form.estado}/>}
      </div>

      {/* Presupuesto */}
      <div style={{background:'#fff',border:'1px solid #e8e8e8',borderRadius:12,padding:'18px 20px',marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,color:'#0d3b5e',marginBottom:12}}>Presupuesto vinculado</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div style={{gridColumn:'1/-1'}}>
            <label style={lbl}>Presupuesto *</label>
            <select value={form.presupuesto_id} onChange={e=>loadPpto(e.target.value)} style={inp} disabled={bloqueado}>
              <option value="">Seleccioná un presupuesto...</option>
              {presupuestos.map(p=><option key={p.id} value={p.id}>{p.nomenclatura?`${p.nomenclatura} — `:''}{p.nombre||p.cliente}</option>)}
            </select>
          </div>
          {ppto && <>
            <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 14px'}}>
              <div style={{fontSize:10,color:'#888',marginBottom:2}}>Cliente</div>
              <div style={{fontSize:13,fontWeight:600}}>{ppto.cliente}</div>
            </div>
            <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 14px'}}>
              <div style={{fontSize:10,color:'#888',marginBottom:2}}>Fecha evento</div>
              <div style={{fontSize:13,fontWeight:600}}>{fmtDate(ppto.fecha_evento)}</div>
            </div>
            {ppto.lugar && <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 14px'}}>
              <div style={{fontSize:10,color:'#888',marginBottom:2}}>Lugar</div>
              <div style={{fontSize:13,fontWeight:600}}>{ppto.lugar}</div>
            </div>}
          </>}
        </div>
      </div>

      {/* Tabla de ítems */}
      {form.items.length > 0 && (
        <div style={{background:'#fff',border:'1px solid #e8e8e8',borderRadius:12,padding:'18px 20px',marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,color:'#0d3b5e',marginBottom:4}}>Ítems del presupuesto</div>
          <div style={{fontSize:12,color:'#888',marginBottom:14}}>Seleccioná los ítems y completá el valor a solicitar. El saldo disponible descuenta solicitudes anteriores enviadas.</div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:'#f0f4f8'}}>
                  <th style={{padding:'8px 10px',width:36,textAlign:'center'}}>
                    <input type="checkbox"
                      checked={form.items.length>0&&form.items.every(it=>it.seleccionado)}
                      onChange={e=>setForm(f=>({...f,items:f.items.map(it=>({...it,seleccionado:e.target.checked}))}))}
                      disabled={bloqueado} style={{width:15,height:15,cursor:'pointer'}}/>
                  </th>
                  <th style={{padding:'8px 6px',textAlign:'left',fontSize:11,color:'#666',fontWeight:700}}>Subcategoría</th>
                  <th style={{padding:'8px 6px',textAlign:'left',fontSize:11,color:'#666',fontWeight:700}}>Ítem</th>
                  <th style={{padding:'8px 6px',textAlign:'right',fontSize:11,color:'#666',fontWeight:700}}>Costo ppto.</th>
                  {/* Columnas de solicitudes anteriores */}
                  {solsAntHeaders.map(s=>(
                    <th key={s.id} style={{padding:'8px 6px',textAlign:'right',fontSize:10,color:s.estado==='rechazada'?'#991b1b':s.estado==='pagado'?'#166534':'#1e40af',fontWeight:700,whiteSpace:'nowrap',background:s.estado==='rechazada'?'#fff1f1':s.estado==='pagado'?'#f0fdf4':'#eff6ff'}}>
                      {s.label}<br/><span style={{fontSize:9,fontWeight:400,opacity:.8}}>{ESTADOS[s.estado]?.label}</span>
                    </th>
                  ))}
                  {solsAntHeaders.length>0 && <th style={{padding:'8px 6px',textAlign:'right',fontSize:11,color:'#991b1b',fontWeight:700,whiteSpace:'nowrap'}}>Rechazado</th>}
                  <th style={{padding:'8px 6px',textAlign:'right',fontSize:11,color:'#2e8b4e',fontWeight:700,whiteSpace:'nowrap'}}>Saldo disp.</th>
                  {!bloqueado && <th style={{padding:'8px 6px',textAlign:'right',fontSize:11,color:'#0d3b5e',fontWeight:700,whiteSpace:'nowrap'}}>A solicitar</th>}
                  {!bloqueado && <th style={{padding:'8px 6px',textAlign:'left',fontSize:11,color:'#666',fontWeight:700}}>Notas</th>}
                </tr>
              </thead>
              <tbody>
                {form.items.map(it=>{
                  const disponible = saldoDisponible(it.id, it.costo_presupuestado);
                  const rechazado = valorRechazado(it.id);
                  const saldoActual = Number(it.costo_presupuestado||0)-Number(it.valor_solicitado||0);
                  return (
                    <tr key={it.id} style={{borderBottom:'1px solid #f0f0f0',background:it.seleccionado?'#f0f7ff':'#fff'}}>
                      <td style={{padding:'8px 10px',textAlign:'center'}}>
                        <input type="checkbox" checked={!!it.seleccionado} onChange={()=>toggleItem(it.id)} disabled={bloqueado} style={{width:15,height:15,cursor:'pointer',accentColor:'#0d3b5e'}}/>
                      </td>
                      <td style={{padding:'8px 6px',fontSize:12,color:'#888'}}>{it.subcategoria||'—'}</td>
                      <td style={{padding:'8px 6px',fontWeight:500}}>{it.item||'—'}</td>
                      <td style={{padding:'8px 6px',textAlign:'right'}}>{fmt(it.costo_presupuestado)}</td>
                      {/* Valores de solicitudes anteriores */}
                      {solsAntHeaders.map(s=>{
                        const val = valorEnSol(s.id, it.id);
                        return (
                          <td key={s.id} style={{padding:'8px 6px',textAlign:'right',color:s.estado==='rechazada'?'#991b1b':s.estado==='pagado'?'#166534':'#1e40af',fontWeight:val?600:400,background:s.estado==='rechazada'?'#fff8f8':s.estado==='pagado'?'#f8fff8':'#f8fbff'}}>
                            {val!=null ? fmt(val) : '—'}
                          </td>
                        );
                      })}
                      {solsAntHeaders.length>0 && <td style={{padding:'8px 6px',textAlign:'right',color:rechazado>0?'#991b1b':'#ccc',fontWeight:rechazado>0?600:400,background:'#fff8f8'}}>{rechazado>0?fmt(rechazado):'—'}</td>}
                      <td style={{padding:'8px 6px',textAlign:'right',fontWeight:700,color:disponible>0?'#2e8b4e':'#dc2626'}}>{fmt(disponible)}</td>
                      {!bloqueado && <td style={{padding:'8px 4px',minWidth:120}}>
                        <input type="number" min="0" max={disponible} step="0.01"
                          value={it.valor_solicitado||''} disabled={!it.seleccionado||bloqueado}
                          placeholder="0.00"
                          onChange={e=>{
                            const val=Number(e.target.value);
                            updItem(it.id,'valor_solicitado',val>disponible?disponible:val);
                          }}
                          onWheel={e=>e.target.blur()}
                          style={{...inp,padding:'5px 8px',fontSize:12,textAlign:'right',background:it.seleccionado?'#fff':'#f8f8f8'}}/>
                      </td>}
                      {!bloqueado && <td style={{padding:'8px 4px',minWidth:140}}>
                        <input value={it.notas||''} disabled={!it.seleccionado||bloqueado}
                          placeholder="Observaciones..."
                          onChange={e=>updItem(it.id,'notas',e.target.value)}
                          style={{...inp,padding:'5px 8px',fontSize:12,background:it.seleccionado?'#fff':'#f8f8f8'}}/>
                      </td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Resumen */}
          {seleccionados.length > 0 && (
            <div style={{marginTop:16,background:'#0d3b5e',borderRadius:10,padding:'14px 18px'}}>
              <div style={{fontSize:13,fontWeight:700,color:'rgba(255,255,255,.8)',marginBottom:10}}>
                Resumen — {seleccionados.length} ítem(s)
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                <div><div style={{fontSize:10,color:'rgba(255,255,255,.6)',marginBottom:3,textTransform:'uppercase'}}>Costo presupuestado</div><div style={{fontSize:16,fontWeight:700,color:'#fff'}}>{fmt(totalPresupuestado)}</div></div>
                <div><div style={{fontSize:10,color:'rgba(255,255,255,.6)',marginBottom:3,textTransform:'uppercase'}}>Valor solicitado</div><div style={{fontSize:16,fontWeight:700,color:'#3dbfb8'}}>{fmt(totalSolicitado)}</div></div>
                <div><div style={{fontSize:10,color:'rgba(255,255,255,.6)',marginBottom:3,textTransform:'uppercase'}}>Saldo</div><div style={{fontSize:16,fontWeight:700,color:saldoTotal>=0?'#5dc98a':'#ff6b6b'}}>{fmt(saldoTotal)}</div></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notas */}
      <div style={{background:'#fff',border:'1px solid #e8e8e8',borderRadius:12,padding:'18px 20px',marginBottom:16}}>
        <label style={lbl}>Notas de la solicitud</label>
        <textarea value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} disabled={bloqueado}
          style={{...inp,minHeight:70,resize:'vertical'}} placeholder="Observaciones generales, urgencia..."/>
      </div>

      {/* Botones */}
      {!bloqueado && (
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <Btn variant="secondary" onClick={onCancel}>Cancelar</Btn>
          <Btn variant="secondary" onClick={handleSave} disabled={saving}>💾 Guardar borrador</Btn>
          <Btn style={{background:'#dc2626'}} onClick={handleEnviar} disabled={saving}>📤 Mandar solicitud</Btn>
        </div>
      )}
      {bloqueado && (
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <Btn variant="secondary" onClick={onCancel}>← Volver</Btn>
          <Btn variant="secondary" onClick={()=>{const html=buildPDFSolicitud(form);const w=window.open('','_blank');w.document.write(html);w.document.close();}}>📄 PDF</Btn>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────
export default function Solicitudes({ userRole, userEmail, userName, presupuesto_id_inicial, onClearPptoInicial }) {
  const [solicitudes, setSolicitudes]   = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [editing, setEditing]           = useState(null);
  const [filtro, setFiltro]             = useState('todos');
  const [toast, setToast]               = useState('');
  const [rechazarModal, setRechazarModal] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');

  const canCreate = ['admin','produccion'].includes(userRole);
  const canFinanciero = ['admin','financiero'].includes(userRole);

  function showToast(m) { setToast(m); setTimeout(()=>setToast(''),3000); }

  useEffect(()=>{ loadAll(); },[]);

  // Auto-abrir nueva solicitud si viene desde presupuesto
  useEffect(()=>{
    if (presupuesto_id_inicial && !loading) {
      setEditing('new');
    }
  },[presupuesto_id_inicial, loading]);

  async function loadAll() {
    setLoading(true);
    const [solR, ppR] = await Promise.all([
      supabase.from('solicitudes').select('*').order('created_at',{ascending:false}),
      supabase.from('presupuestos').select('id,nombre,cliente,nomenclatura,fecha_evento,lugar,dias_evento,items').order('created_at',{ascending:false}),
    ]);
    setSolicitudes(solR.data||[]);
    setPresupuestos(ppR.data||[]);
    setLoading(false);
  }

  async function saveSolicitud(data) {
    if (data.id) {
      const {error} = await supabase.from('solicitudes').update(data).eq('id',data.id);
      if(error){alert('Error: '+error.message);return;}
    } else {
      const {data:newSol,error} = await supabase.from('solicitudes').insert({...data,created_by:userEmail,created_by_nombre:userName}).select().single();
      if(error){alert('Error: '+error.message);return;}
      if(newSol) setEditing(newSol);
      showToast('Solicitud guardada ✓');
      loadAll();
      return;
    }
    showToast('Solicitud guardada ✓');
    loadAll();
  }

  async function enviarSolicitud(data) {
    let newSol = data;
    if (!data.id) {
      const {data:created,error} = await supabase.from('solicitudes').insert({...data,created_by:userEmail,created_by_nombre:userName}).select().single();
      if(error){alert('Error: '+error.message);return;}
      newSol = created;
    } else {
      await supabase.from('solicitudes').update({...data,estado:'enviada'}).eq('id',data.id);
    }
    // Enviar correo
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-solicitud`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`},
        body:JSON.stringify({solicitud:{...data,estado:'enviada'},userEmail,userName}),
      });
    } catch(e){console.warn(e);}
    showToast('✅ Solicitud enviada a Financiero');
    setEditing(null);
    if(onClearPptoInicial) onClearPptoInicial();
    loadAll();
  }

  async function marcarPagado(id) {
    await supabase.from('solicitudes').update({estado:'pagado'}).eq('id',id);
    setSolicitudes(prev=>prev.map(s=>s.id===id?{...s,estado:'pagado'}:s));
    showToast('Solicitud marcada como pagada ✓');
  }

  async function confirmarRechazo() {
    if (!motivoRechazo.trim()) { alert('El motivo de rechazo es obligatorio'); return; }
    await supabase.from('solicitudes').update({estado:'rechazada',motivo_rechazo:motivoRechazo}).eq('id',rechazarModal.id);
    setSolicitudes(prev=>prev.map(s=>s.id===rechazarModal.id?{...s,estado:'rechazada',motivo_rechazo:motivoRechazo}:s));
    setRechazarModal(null);
    setMotivoRechazo('');
    showToast('Solicitud rechazada');
  }

  const filtered = solicitudes.filter(s=>filtro==='todos'||s.estado===filtro);

  if(loading) return <div style={{padding:'2rem',textAlign:'center',color:'#888'}}>Cargando...</div>;

  if(editing!==null) {
    const solEditing = editing==='new' ? null : editing;
    const solicitudesAnteriores = solicitudes.filter(s=>s.presupuesto_id===(solEditing?.presupuesto_id||presupuesto_id_inicial));
    return <SolicitudEditor
      solicitud={solEditing}
      presupuesto_id_inicial={editing==='new'?presupuesto_id_inicial:null}
      presupuestos={presupuestos}
      userEmail={userEmail} userName={userName}
      solicitudesAnteriores={solicitudesAnteriores}
      onSave={saveSolicitud}
      onEnviar={enviarSolicitud}
      onCancel={()=>{ setEditing(null); if(onClearPptoInicial)onClearPptoInicial(); }}
    />;
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
        <h2 style={{fontSize:18,fontWeight:700,color:'#0d3b5e'}}>📤 Solicitudes de valores</h2>
        {canCreate && <Btn onClick={()=>setEditing('new')}>+ Nueva solicitud</Btn>}
      </div>

      {/* Filtros por estado con colores */}
      <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
        <button onClick={()=>setFiltro('todos')} style={{padding:'4px 14px',borderRadius:999,border:'1px solid',fontSize:12,cursor:'pointer',fontFamily:'inherit',background:filtro==='todos'?'#0d3b5e':'transparent',color:filtro==='todos'?'#fff':'#555',borderColor:filtro==='todos'?'#0d3b5e':'#ddd'}}>Todas</button>
        {Object.entries(ESTADOS).map(([k,e])=>(
          <button key={k} onClick={()=>setFiltro(k)} style={{padding:'4px 14px',borderRadius:999,border:'1px solid',fontSize:12,cursor:'pointer',fontFamily:'inherit',background:filtro===k?e.bg:'transparent',color:filtro===k?e.color:'#555',borderColor:filtro===k?e.border:'#ddd',fontWeight:filtro===k?600:400}}>{e.label}</button>
        ))}
      </div>

      {filtered.length===0 && (
        <div style={{textAlign:'center',padding:'3rem',color:'#aaa',fontSize:14}}>Sin solicitudes</div>
      )}

      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {filtered.map(sol=>{
          const e = ESTADOS[sol.estado]||ESTADOS.borrador;
          const totalSol = (sol.items||[]).reduce((a,it)=>a+Number(it.valor_solicitado||0),0);
          const totalPpto = (sol.items||[]).reduce((a,it)=>a+Number(it.costo_presupuestado||0),0);
          const saldo = totalPpto-totalSol;
          const bloqueado = sol.estado !== 'borrador';
          return (
            <div key={sol.id} style={{background:'#fff',border:`1px solid ${e.border}`,borderLeft:`5px solid ${e.color}`,borderRadius:'0 10px 10px 0',padding:'14px 16px'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:8,justifyContent:'space-between'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:4}}>
                    <span style={{fontWeight:600,fontSize:15}}>{sol.presupuesto_nombre||'—'}</span>
                    <EstadoBadge estado={sol.estado}/>
                  </div>
                  <div style={{display:'flex',gap:12,flexWrap:'wrap',fontSize:12,color:'#777',marginBottom:6}}>
                    {sol.cliente_nombre&&<span>🏢 {sol.cliente_nombre}</span>}
                    {sol.fecha_evento&&<span>📅 {fmtDate(sol.fecha_evento)}</span>}
                    {sol.created_by_nombre&&<span>👤 {sol.created_by_nombre}</span>}
                    <span>📋 {(sol.items||[]).length} ítem(s)</span>
                    <span style={{fontSize:11,color:'#aaa'}}>{fmtDateTime(sol.created_at)}</span>
                  </div>
                  <div style={{display:'flex',gap:16,fontSize:12}}>
                    <span>Presupuestado: <strong style={{color:'#0d3b5e'}}>{fmt(totalPpto)}</strong></span>
                    <span>Solicitado: <strong style={{color:'#3dbfb8'}}>{fmt(totalSol)}</strong></span>
                    <span style={{color:saldo>=0?'#2e8b4e':'#dc2626'}}>Saldo: <strong>{fmt(saldo)}</strong></span>
                  </div>
                  {sol.motivo_rechazo && (
                    <div style={{marginTop:6,fontSize:12,color:'#991b1b',background:'#fee2e2',padding:'5px 10px',borderRadius:6}}>
                      ✕ Rechazada: {sol.motivo_rechazo}
                    </div>
                  )}
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
                  {/* Botones Pagado/Rechazado para Financiero cuando está enviada */}
                  {canFinanciero && sol.estado==='enviada' && <>
                    <Btn size="xs" variant="green" onClick={()=>marcarPagado(sol.id)}>✓ Pagado</Btn>
                    <Btn size="xs" variant="danger" onClick={()=>{setRechazarModal(sol);setMotivoRechazo('');}}>✕ Rechazar</Btn>
                  </>}
                  {/* Ver/editar */}
                  {!bloqueado && canCreate && <Btn size="xs" variant="secondary" onClick={()=>setEditing(sol)}>Editar</Btn>}
                  {bloqueado && <Btn size="xs" variant="secondary" onClick={()=>setEditing(sol)}>Ver</Btn>}
                  {/* PDF */}
                  <Btn size="xs" variant="secondary" onClick={()=>{const html=buildPDFSolicitud(sol);const w=window.open('','_blank');w.document.write(html);w.document.close();}}>📄 PDF</Btn>
                </div>
              </div>

              {/* Detalle expandible */}
              {(sol.items||[]).length > 0 && (
                <details style={{marginTop:10}}>
                  <summary style={{fontSize:12,color:'#0d3b5e',cursor:'pointer',fontWeight:500}}>Ver ítems ({sol.items.length})</summary>
                  <div style={{marginTop:8,overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                      <thead><tr style={{background:'#f0f4f8'}}>
                        {['Subcategoría','Ítem','Costo ppto.','Valor solicitado','Saldo','Notas'].map(h=>(
                          <th key={h} style={{padding:'6px 10px',textAlign:'left',fontSize:11,color:'#666',fontWeight:700}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {sol.items.map(it=>{
                          const saldoIt=Number(it.costo_presupuestado||0)-Number(it.valor_solicitado||0);
                          return(
                            <tr key={it.id} style={{borderBottom:'1px solid #f0f0f0'}}>
                              <td style={{padding:'6px 10px',color:'#888'}}>{it.subcategoria||'—'}</td>
                              <td style={{padding:'6px 10px',fontWeight:500}}>{it.item||'—'}</td>
                              <td style={{padding:'6px 10px',textAlign:'right'}}>{fmt(it.costo_presupuestado)}</td>
                              <td style={{padding:'6px 10px',textAlign:'right',color:'#0d3b5e',fontWeight:600}}>{fmt(it.valor_solicitado)}</td>
                              <td style={{padding:'6px 10px',textAlign:'right',fontWeight:600,color:saldoIt>=0?'#2e8b4e':'#dc2626'}}>{fmt(saldoIt)}</td>
                              <td style={{padding:'6px 10px',color:'#888'}}>{it.notas||'—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal rechazo */}
      {rechazarModal && (
        <div onClick={()=>setRechazarModal(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:480,padding:24}}>
            <div style={{fontSize:15,fontWeight:700,color:'#dc2626',marginBottom:4}}>✕ Rechazar solicitud</div>
            <div style={{fontSize:13,color:'#666',marginBottom:16}}>{rechazarModal.presupuesto_nombre}</div>
            <label style={lbl}>Motivo de rechazo *</label>
            <textarea value={motivoRechazo} onChange={e=>setMotivoRechazo(e.target.value)} autoFocus
              style={{...inp,minHeight:90,resize:'vertical',marginBottom:14}} placeholder="Explica el motivo del rechazo..."/>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <Btn variant="secondary" onClick={()=>setRechazarModal(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={confirmarRechazo}>Confirmar rechazo</Btn>
            </div>
          </div>
        </div>
      )}

      {toast&&<div style={{position:'fixed',bottom:24,right:24,background:'#0d3b5e',color:'#fff',padding:'10px 18px',borderRadius:10,fontSize:13,zIndex:999,boxShadow:'0 4px 16px rgba(0,0,0,.2)'}}>{toast}</div>}
    </div>
  );
}
