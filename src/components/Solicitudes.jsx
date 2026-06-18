import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { notifySolicitudAprobada } from '../notifyHelper';

// ── Helpers ───────────────────────────────────────────────────
function fmt(n) {
  return '$' + (Number(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
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
function buildPDFSolicitud(sol, solsAnteriores) {
  const items = sol.items || [];
  const solsPrev = (solsAnteriores||[]).filter(s=>s.id!==sol.id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  const solsPrevEnv = solsPrev.filter(s=>['enviada','pagado'].includes(s.estado));

  // Totales
  const totalSol = items.reduce((a,it)=>a+Number(it.valor_solicitado||0),0);
  const totalPpto = items.reduce((a,it)=>a+Number(it.costo_presupuestado||0),0);
  const totalYaSol = items.reduce((a,it)=>{
    const prev = solsPrevEnv.flatMap(s=>s.items||[]).filter(si=>si.id===it.id).reduce((x,si)=>x+Number(si.valor_solicitado||0),0);
    return a+prev;
  },0);
  const saldo = totalPpto - totalYaSol - totalSol;
  const estado = ESTADOS[sol.estado] || ESTADOS.borrador;

  // Headers de solicitudes anteriores
  const solHeaders = solsPrev.map(s=>({ id:s.id, label:`Sol. ${fmtDate(s.created_at?.slice(0,10))}`, estado:s.estado }));
  const thPrev = solHeaders.map(s=>`<th style="padding:7px 8px;text-align:right;font-size:10px;color:${s.estado==='rechazada'?'#991b1b':s.estado==='pagado'?'#166534':'#1e40af'};white-space:nowrap;">${s.label}<br/><span style="font-size:9px;">${ESTADOS[s.estado]?.label||''}</span></th>`).join('');

  const itemsHtml = items.map((it,i) => {
    const yaUsadoPrev = solsPrevEnv.flatMap(s=>s.items||[]).filter(si=>si.id===it.id).reduce((a,si)=>a+Number(si.valor_solicitado||0),0);
    const saldoIt = Number(it.costo_presupuestado||0) - yaUsadoPrev - Number(it.valor_solicitado||0);
    const tdPrev = solHeaders.map(s=>{
      const sp = solsPrev.find(x=>x.id===s.id);
      const val = (sp?.items||[]).find(si=>si.id===it.id)?.valor_solicitado;
      const col = s.estado==='rechazada'?'#991b1b':s.estado==='pagado'?'#166534':'#1e40af';
      return `<td style="padding:7px 8px;text-align:right;font-size:12px;font-weight:600;color:${col};background:${s.estado==='rechazada'?'#fff8f8':s.estado==='pagado'?'#f8fff8':'#f8fbff'};">${val!=null?fmt(val):'—'}</td>`;
    }).join('');
    return `<tr style="background:${i%2?'#f8fafc':'#fff'};border-bottom:1px solid #f0f0f0;">
      <td style="padding:7px 8px;font-size:11px;color:#666;">${it.subcategoria||'—'}</td>
      <td style="padding:7px 8px;font-size:13px;font-weight:500;">${it.item||'—'}</td>
      <td style="padding:7px 8px;text-align:right;font-size:12px;">${fmt(it.costo_presupuestado)}</td>
      ${tdPrev}
      <td style="padding:7px 8px;text-align:right;font-size:13px;font-weight:700;color:#0d3b5e;">${fmt(it.valor_solicitado)}</td>
      <td style="padding:7px 8px;text-align:right;font-weight:600;color:${saldoIt>=0?'#166534':'#991b1b'};">${fmt(saldoIt)}</td>
      <td style="padding:7px 8px;font-size:11px;color:#888;">${it.notas||'—'}</td>
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
        ${thPrev}
        <th style="padding:8px 10px;text-align:right;font-size:10px;">Valor solicitado</th>
        <th style="padding:8px 10px;text-align:right;font-size:10px;">Saldo</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;">Notas</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  </div>
  <div style="margin:0 28px 16px;background:#0d3b5e;border-radius:10px;padding:14px 18px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;">
    <div><div style="font-size:9px;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:3px;">Costo presupuestado</div><div style="font-size:16px;font-weight:700;color:#fff;">${fmt(totalPpto)}</div></div>
    <div><div style="font-size:9px;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:3px;">Ya solicitado anterior</div><div style="font-size:16px;font-weight:700;color:#f0a500;">${fmt(totalYaSol)}</div></div>
    <div><div style="font-size:9px;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:3px;">Valor solicitado actual</div><div style="font-size:16px;font-weight:700;color:#3dbfb8;">${fmt(totalSol)}</div></div>
    <div><div style="font-size:9px;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:3px;">Saldo disponible</div><div style="font-size:16px;font-weight:700;color:${saldo>=0?'#5dc98a':'#ff6b6b'};">${fmt(saldo)}</div></div>
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
  const [justModal, setJustModal] = useState(false);
  const [justificacion, setJustificacion] = useState('');

  // Detectar ítems que superan el presupuesto
  function itemsConExceso() {
    return seleccionados.filter(it => {
      const disponible = saldoDisponible(it.id, it.costo_presupuestado);
      return Number(it.valor_solicitado||0) > disponible;
    });
  }

  // Auto-cargar presupuesto
  useEffect(() => {
    if (presupuesto_id_inicial && !solicitud) {
      loadPpto(presupuesto_id_inicial);
    } else if (solicitud?.presupuesto_id) {
      loadPptoConItems(solicitud.presupuesto_id, solicitud.items || []);
    }
  }, [solicitud?.id, solicitud?.updated_at, presupuesto_id_inicial]);

  async function loadPptoConItems(id, itemsGuardados) {
    const { data } = await supabase.from('presupuestos').select('*').eq('id', id).single();
    if (!data) return;
    setPpto(data);

    const { data: solsData } = await supabase.from('solicitudes')
      .select('*').eq('presupuesto_id', id).order('created_at', { ascending: true });
    const solsPrevias = (solsData||[]).filter(s=>s.id!==solicitud?.id);

    const esBloqueada = solicitud && solicitud.estado !== 'borrador';

    let items;
    if (esBloqueada && itemsGuardados.length > 0) {
      // Para solicitudes bloqueadas: usar ítems guardados directamente pero agregar info de costo_presupuestado
      items = itemsGuardados.map(it => {
        const pptoItem = (data.items||[]).find(pi=>pi.id===it.id);
        const costoPpto = pptoItem
          ? Number(pptoItem.costo_unit||0)*Number(pptoItem.cantidad||0)*Number(pptoItem.dias||1)
          : Number(it.costo_presupuestado||0);
        const yaUsado = solsPrevias.filter(s=>['enviada','pagado'].includes(s.estado))
          .flatMap(s=>s.items||[]).filter(si=>si.id===it.id)
          .reduce((a,si)=>a+Number(si.valor_solicitado||0),0);
        return { ...it, costo_presupuestado: costoPpto, seleccionado: true, _saldo_inicial: costoPpto - yaUsado };
      });
    } else {
      // Para borradores: reconstruir desde presupuesto restaurando valores guardados
      items = (data.items||[]).filter(it=>!it._type).map(it=>{
        const costoPpto = Number(it.costo_unit||0)*Number(it.cantidad||0)*Number(it.dias||1);
        const guardado = itemsGuardados.find(g=>g.id===it.id);
        const yaUsado = solsPrevias.filter(s=>['enviada','pagado'].includes(s.estado))
          .flatMap(s=>s.items||[]).filter(si=>si.id===it.id)
          .reduce((a,si)=>a+Number(si.valor_solicitado||0),0);
        return {
          id: it.id, item:it.item||'', subcategoria:it.subcategoria||'', categoria:it.categoria||'',
          costo_presupuestado: costoPpto,
          valor_solicitado: guardado?.valor_solicitado || 0,
          notas: guardado?.notas || '',
          seleccionado: !!guardado,
          _saldo_inicial: costoPpto - yaUsado,
        };
      });
    }

    setForm(f=>({
      ...f, presupuesto_id:data.id, presupuesto_nombre:data.nombre||data.cliente,
      cliente_nombre:data.cliente, fecha_evento:data.fecha_evento,
      lugar:data.lugar||'', dias_evento:data.dias_evento||1, items,
      _sols_previas: solsPrevias,
    }));
  }

  async function loadPpto(id) {
    if (!id) { setPpto(null); setForm(f=>({...f,presupuesto_id:'',presupuesto_nombre:'',cliente_nombre:'',fecha_evento:null,lugar:'',items:[]})); return; }
    const { data } = await supabase.from('presupuestos').select('*').eq('id', id).single();
    if (!data) return;
    setPpto(data);

    // Cargar solicitudes anteriores de este presupuesto
    const { data: solsData } = await supabase.from('solicitudes')
      .select('*').eq('presupuesto_id', id).order('created_at', { ascending: true });
    const solsPrevias = (solsData||[]).filter(s=>s.id!==solicitud?.id);

    const items = (data.items||[]).filter(it=>!it._type).map(it=>{
      const costoPpto = Number(it.costo_unit||0)*Number(it.cantidad||0)*Number(it.dias||1);
      // Calcular saldo disponible descontando enviadas y pagadas
      const yaUsado = solsPrevias.filter(s=>['enviada','pagado'].includes(s.estado))
        .flatMap(s=>s.items||[]).filter(si=>si.id===it.id)
        .reduce((a,si)=>a+Number(si.valor_solicitado||0),0);
      return {
        id: it.id, item:it.item||'', subcategoria:it.subcategoria||'', categoria:it.categoria||'',
        costo_presupuestado: costoPpto,
        valor_solicitado: 0, notas:'', seleccionado:false,
        _saldo_inicial: costoPpto - yaUsado,
      };
    });

    setForm(f=>({
      ...f, presupuesto_id:data.id, presupuesto_nombre:data.nombre||data.cliente,
      cliente_nombre:data.cliente, fecha_evento:data.fecha_evento,
      lugar:data.lugar||'', dias_evento:data.dias_evento||1, items,
      _sols_previas: solsPrevias,
    }));
  }

  function updItem(id, field, value) {
    setForm(f=>({...f, items:f.items.map(it=>it.id===id?{...it,[field]:value}:it)}));
  }
  function toggleItem(id) {
    setForm(f=>({...f, items:f.items.map(it=>it.id===id?{...it,seleccionado:!it.seleccionado}:it)}));
  }

  const seleccionados = form.items.filter(it=>it.seleccionado);
  // Solicitudes anteriores — DEBE estar antes de los totales
  const solsAnt = (form._sols_previas || solicitudesAnteriores||[]).filter(s=>s.id!==solicitud?.id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  const solsAntHeaders = solsAnt.map(s=>({ id:s.id, fecha:fmtDate(s.created_at?.slice(0,10)), estado:s.estado, label:`Sol. ${fmtDate(s.created_at?.slice(0,10))}` }));
  const totalSolicitado = seleccionados.reduce((a,it)=>a+Number(it.valor_solicitado||0),0);
  const totalPresupuestado = seleccionados.reduce((a,it)=>a+Number(it.costo_presupuestado||0),0);
  const totalYaSolicitado = seleccionados.reduce((a,it)=>{
    const anterior = solsAnt.filter(s=>['enviada','pagado'].includes(s.estado))
      .flatMap(s=>s.items||[]).filter(si=>si.id===it.id)
      .reduce((x,si)=>x+Number(si.valor_solicitado||0),0);
    return a+anterior;
  },0);
  const saldoFinal = totalPresupuestado - totalYaSolicitado - totalSolicitado;

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
    const exceso = itemsConExceso();
    if (exceso.length > 0) {
      alert(`⚠️ Advertencia: Los ítems "${exceso.map(it=>it.item).join(', ')}" superan el costo presupuestado. Se guardará el borrador de todas formas.`);
    }
    // Limpiar campos internos antes de guardar
    const cleanItems = form.items.filter(it=>it.seleccionado).map(({_saldo_inicial,...it})=>it);
    const { _sols_previas, ...formClean } = form;
    const data = { ...formClean, items: cleanItems };
    await onSave(data);
    setSaving(false);
  }

  async function handleEnviar() {
    if (!form.presupuesto_id) { alert('Seleccioná un presupuesto'); return; }
    if (seleccionados.length===0) { alert('Seleccioná al menos un ítem'); return; }
    const exceso = itemsConExceso();
    if (exceso.length > 0) {
      setJustModal(true);
      return;
    }
    await confirmarEnvio('');
  }

  async function confirmarEnvio(justif) {
    if (!window.confirm('¿Enviar la solicitud a Financiero? No podrá modificarse después.')) return;
    setSaving(true);
    const exceso = itemsConExceso();
    const cleanItems = form.items.filter(it=>it.seleccionado).map(({_saldo_inicial,...it})=>it);
    const { _sols_previas, ...formClean } = form;
    const data = {
      ...formClean,
      items: cleanItems,
      estado:'enviada',
      tiene_exceso: exceso.length > 0,
      justificacion_exceso: justif || '',
    };
    await onEnviar(data);
    setSaving(false);
  }

  const bloqueado = form.estado !== 'borrador';

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button onClick={onCancel} style={{background:'none',border:'1px solid #ddd',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>← Volver</button>
        <h2 style={{fontSize:17,fontWeight:700,color:'#0d3b5e',flex:1}}>{solicitud?'Solicitud de valores':'Nueva solicitud de valores'}</h2>
        {form.created_by_nombre && <span style={{fontSize:12,color:'#888'}}>👤 {form.created_by_nombre}</span>}
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
          <div style={{fontSize:12,color:'#888',marginBottom:14}}>Marcá el checkbox del ítem para habilitarlo y poder ingresar el valor a solicitar.</div>
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
                      <td style={{padding:'8px 6px',textAlign:'right',fontWeight:700,color:disponible>0?'#2e8b4e':'#dc2626'}}>{fmt(disponible)}</td>
                      {!bloqueado && <td style={{padding:'8px 4px',minWidth:120}}>
                        <input type="number" min="0" step="0.01"
                          value={it.valor_solicitado===0?'':it.valor_solicitado}
                          disabled={!it.seleccionado}
                          placeholder="0.00"
                          onChange={e=>updItem(it.id,'valor_solicitado',Number(e.target.value))}
                          onWheel={e=>e.target.blur()}
                          style={{...inp,padding:'5px 8px',fontSize:12,textAlign:'right',background:it.seleccionado?'#fff':'#f5f5f5',color:it.seleccionado?'#000':'#999'}}/>
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
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12}}>
                <div><div style={{fontSize:10,color:'rgba(255,255,255,.6)',marginBottom:3,textTransform:'uppercase'}}>Costo presupuestado</div><div style={{fontSize:15,fontWeight:700,color:'#fff'}}>{fmt(totalPresupuestado)}</div></div>
                <div><div style={{fontSize:10,color:'rgba(255,255,255,.6)',marginBottom:3,textTransform:'uppercase'}}>Ya solicitado (aprobado/enviado)</div><div style={{fontSize:15,fontWeight:700,color:'#f0a500'}}>{fmt(totalYaSolicitado)}</div></div>
                <div><div style={{fontSize:10,color:'rgba(255,255,255,.6)',marginBottom:3,textTransform:'uppercase'}}>Valor solicitado actual</div><div style={{fontSize:15,fontWeight:700,color:'#3dbfb8'}}>{fmt(totalSolicitado)}</div></div>
                <div><div style={{fontSize:10,color:'rgba(255,255,255,.6)',marginBottom:3,textTransform:'uppercase'}}>Saldo disponible</div><div style={{fontSize:15,fontWeight:700,color:saldoFinal>=0?'#5dc98a':'#ff6b6b'}}>{fmt(saldoFinal)}</div></div>
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

      {/* Modal justificación exceso */}
      {justModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:480,padding:24}}>
            <div style={{fontSize:15,fontWeight:700,color:'#d97706',marginBottom:4}}>⚠️ Monto supera el presupuesto</div>
            <div style={{fontSize:13,color:'#555',marginBottom:16}}>
              Los valores solicitados superan el costo presupuestado. Por favor justificá el motivo para poder enviar a Financiero.
            </div>
            <label style={lbl}>Justificación *</label>
            <textarea value={justificacion} onChange={e=>setJustificacion(e.target.value)} autoFocus
              style={{...inp,minHeight:90,resize:'vertical',marginBottom:14}} placeholder="Explicá por qué se supera el presupuesto..."/>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <Btn variant="secondary" onClick={()=>setJustModal(false)}>Cancelar</Btn>
              <Btn onClick={()=>{if(!justificacion.trim()){alert('La justificación es obligatoria');return;}setJustModal(false);confirmarEnvio(justificacion);}}>Confirmar y enviar</Btn>
            </div>
          </div>
        </div>
      )}
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <Btn variant="secondary" onClick={onCancel}>Cancelar</Btn>
          <Btn variant="secondary" onClick={handleSave} disabled={saving}>💾 Guardar borrador</Btn>
          <Btn style={{background:'#dc2626'}} onClick={handleEnviar} disabled={saving}>📤 Mandar solicitud</Btn>
        </div>
      )}
      {bloqueado && (
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <Btn variant="secondary" onClick={onCancel}>← Volver</Btn>
          <Btn variant="secondary" onClick={()=>{const html=buildPDFSolicitud(form,[]);const w=window.open('','_blank');w.document.write(html);w.document.close();}}>📄 PDF</Btn>
        </div>
      )}
    </div>
  );
}

// ── Grupo de solicitudes por presupuesto ──────────────────────
function GrupoPpto({ grupo, canCreate, canFinanciero, onEdit, onDelete, onPago, onRechazo, onPDF }) {
  const [open, setOpen] = useState(true);
  const totalGrupo = grupo.sols.reduce((a,s)=>(s.items||[]).reduce((x,it)=>x+Number(it.valor_solicitado||0),0)+a, 0);
  const estadosGrupo = [...new Set(grupo.sols.map(s=>s.estado))];

  return (
    <div style={{border:'1px solid #e8e8e8',borderRadius:12,marginBottom:12,overflow:'hidden'}}>
      {/* Header del grupo */}
      <div onClick={()=>setOpen(o=>!o)} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer',background:'#f8fafc',userSelect:'none'}}>
        <span style={{fontSize:16,color:'#0d3b5e'}}>{open?'▾':'▸'}</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14,color:'#0d3b5e'}}>{grupo.nombre}</div>
          {grupo.cliente&&<div style={{fontSize:12,color:'#888'}}>🏢 {grupo.cliente}</div>}
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {estadosGrupo.map(e=><EstadoBadge key={e} estado={e}/>)}
          <span style={{fontSize:12,color:'#0d3b5e',fontWeight:600}}>{grupo.sols.length} solicitud(es)</span>
          <span style={{fontSize:12,color:'#3dbfb8',fontWeight:600}}>{fmt(totalGrupo)} total</span>
        </div>
      </div>

      {/* Solicitudes del grupo */}
      {open && (
        <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:8}}>
          {grupo.sols.map(sol=>{
            const e = ESTADOS[sol.estado]||ESTADOS.borrador;
            const totalSol = (sol.items||[]).reduce((a,it)=>a+Number(it.valor_solicitado||0),0);
            const bloqueado = sol.estado !== 'borrador';
            return (
              <div key={sol.id} style={{background:'#fff',border:`1px solid ${e.border}`,borderLeft:`4px solid ${e.color}`,borderRadius:'0 8px 8px 0',padding:'10px 14px'}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:8,justifyContent:'space-between'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:3}}>
                      <EstadoBadge estado={sol.estado}/>
                      {sol.tiene_exceso&&<span title="Supera el presupuesto" style={{fontSize:14}}>⚠️</span>}
                      <span style={{fontSize:11,color:'#aaa'}}>{fmtDateTime(sol.created_at)}</span>
                      {sol.created_by_nombre&&<span style={{fontSize:12,color:'#777'}}>👤 {sol.created_by_nombre}</span>}
                      <span style={{fontSize:12,color:'#0d3b5e',fontWeight:600}}>{fmt(totalSol)}</span>
                      <span style={{fontSize:11,color:'#888'}}>{(sol.items||[]).length} ítem(s)</span>
                    </div>
                    {sol.motivo_rechazo&&<div style={{fontSize:12,color:'#991b1b',background:'#fee2e2',padding:'4px 8px',borderRadius:5,marginTop:4}}>✕ {sol.motivo_rechazo}</div>}
                  </div>
                  <div style={{display:'flex',gap:5,flexShrink:0,flexWrap:'wrap'}}>
                    {sol.estado==='borrador'&&canCreate&&<Btn size="xs" variant="danger" onClick={()=>onDelete(sol)}>🗑</Btn>}
                    {canFinanciero&&sol.estado==='enviada'&&<>
                      <Btn size="xs" variant="green" onClick={()=>onPago(sol.id)}>✓ Pagado</Btn>
                      <Btn size="xs" variant="danger" onClick={()=>onRechazo(sol)}>✕ Rechazar</Btn>
                    </>}
                    {!bloqueado&&canCreate&&<Btn size="xs" variant="secondary" onClick={()=>onEdit(sol)}>Editar</Btn>}
                    {bloqueado&&<Btn size="xs" variant="secondary" onClick={()=>onEdit(sol)}>Ver</Btn>}
                    <Btn size="xs" variant="secondary" onClick={()=>onPDF(sol)}>📄 PDF</Btn>
                  </div>
                </div>
                {/* Detalle ítems expandible */}
                {(sol.items||[]).length>0&&(
                  <details style={{marginTop:8}}>
                    <summary style={{fontSize:12,color:'#0d3b5e',cursor:'pointer',fontWeight:500}}>Ver ítems ({sol.items.length})</summary>
                    <div style={{marginTop:6,overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead><tr style={{background:'#f0f4f8'}}>
                          {['Subcategoría','Ítem','Costo ppto.','Solicitado','Notas'].map(h=>(
                            <th key={h} style={{padding:'5px 8px',textAlign:'left',fontSize:11,color:'#666',fontWeight:700}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {sol.items.map(it=>(
                            <tr key={it.id} style={{borderBottom:'1px solid #f0f0f0'}}>
                              <td style={{padding:'5px 8px',color:'#888'}}>{it.subcategoria||'—'}</td>
                              <td style={{padding:'5px 8px',fontWeight:500}}>{it.item||'—'}</td>
                              <td style={{padding:'5px 8px',textAlign:'right'}}>{fmt(it.costo_presupuestado)}</td>
                              <td style={{padding:'5px 8px',textAlign:'right',color:'#0d3b5e',fontWeight:600}}>{fmt(it.valor_solicitado)}</td>
                              <td style={{padding:'5px 8px',color:'#888'}}>{it.notas||'—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            );
          })}
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
    const isAdminOrFinanciero = ['admin','financiero'].includes(userRole);
    let solQuery = supabase.from('solicitudes').select('*').order('created_at',{ascending:false});
    if (!isAdminOrFinanciero) solQuery = solQuery.eq('created_by', userEmail);
    const [solR, ppR] = await Promise.all([
      solQuery,
      supabase.from('presupuestos').select('id,nombre,cliente,nomenclatura,fecha_evento,lugar,dias_evento,items').order('created_at',{ascending:false}),
    ]);
    setSolicitudes(solR.data||[]);
    setPresupuestos(ppR.data||[]);
    setLoading(false);
  }

  async function saveSolicitud(data) {
    let savedId = data.id;
    if (data.id) {
      const {error} = await supabase.from('solicitudes').update(data).eq('id',data.id);
      if(error){alert('Error: '+error.message);return;}
    } else {
      const {data:newSol,error} = await supabase.from('solicitudes').insert({...data,created_by:userEmail,created_by_nombre:userName}).select().single();
      if(error){alert('Error: '+error.message);return;}
      savedId = newSol?.id;
    }
    showToast('Solicitud guardada ✓');
    loadAll();
    // Recargar la solicitud completa para mantener el editor abierto con datos frescos
    if (savedId) {
      const {data:fresh} = await supabase.from('solicitudes').select('*').eq('id',savedId).single();
      if (fresh) setEditing(fresh);
    }
  }

  async function enviarSolicitud(data) {
    let savedId = data.id;
    if (!data.id) {
      const {data:created,error} = await supabase.from('solicitudes').insert({...data,created_by:userEmail,created_by_nombre:userName}).select().single();
      if(error){alert('Error: '+error.message);return;}
      savedId = created?.id;
    } else {
      await supabase.from('solicitudes').update({...data,estado:'enviada'}).eq('id',data.id);
    }
    // Enviar correo — limpiar campos internos antes de serializar
    try {
      const solParaCorreo = {
        id: savedId,
        presupuesto_nombre: data.presupuesto_nombre,
        cliente_nombre: data.cliente_nombre,
        fecha_evento: data.fecha_evento,
        lugar: data.lugar,
        items: data.items||[],
        notas: data.notas||'',
        estado: 'enviada',
        created_by: userEmail,
        created_by_nombre: userName,
      };
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-solicitud`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`},
        body:JSON.stringify({solicitud:solParaCorreo,userEmail,userName}),
      });
      if (!res.ok) console.warn('notify-solicitud error:', await res.text());
    } catch(e){console.warn('notify-solicitud failed:',e);}
    showToast('✅ Solicitud enviada a Financiero');
    setEditing(null);
    if(onClearPptoInicial) onClearPptoInicial();
    loadAll();
  }

  async function marcarPagado(id) {
    await supabase.from('solicitudes').update({estado:'pagado'}).eq('id',id);
    const sol = solicitudes.find(s=>s.id===id);
    if (sol?.created_by) notifySolicitudAprobada(sol, sol.created_by);
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

      {/* Agrupar por presupuesto */}
      {(() => {
        const grupos = {};
        filtered.forEach(sol => {
          const key = sol.presupuesto_id || 'sin-presupuesto';
          if (!grupos[key]) grupos[key] = { nombre: sol.presupuesto_nombre||'Sin presupuesto', cliente: sol.cliente_nombre||'', sols:[] };
          grupos[key].sols.push(sol);
        });
        return Object.entries(grupos).map(([pptoId, grupo]) => (
          <GrupoPpto key={pptoId} grupo={grupo} canCreate={canCreate} canFinanciero={canFinanciero}
            onEdit={sol=>setEditing(sol)} onDelete={async sol=>{if(!window.confirm('¿Eliminar?'))return;await supabase.from('solicitudes').delete().eq('id',sol.id);loadAll();showToast('Eliminada');}}
            onPago={marcarPagado} onRechazo={sol=>{setRechazarModal(sol);setMotivoRechazo('');}}
            onPDF={sol=>{const solsDelPpto=solicitudes.filter(s=>s.presupuesto_id===sol.presupuesto_id);const html=buildPDFSolicitud(sol,solsDelPpto);const w=window.open('','_blank');w.document.write(html);w.document.close();}}
          />
        ));
      })()}

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
