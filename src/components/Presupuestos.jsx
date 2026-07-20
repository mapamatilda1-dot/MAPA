import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { S, Badge, Toast } from '../styles.jsx';
import { calcPpto, fmt, fmtPct } from '../calc';
import {
  ESTADOS_PPTO, ESTADOS_PPTO_LABELS, ESTADOS_PPTO_COLORS,
  canChangeEstadoPpto, canEditPpto, canMarkEjecutado, canViewPresupuestos,
  canDownloadPdfFinanciero, canDownloadExcel, canDownloadPdfCliente,
} from '../roles';
import EditorPpto from './EditorPpto';
import InformeEditor from './InformeEditor';
import { generatePdfClienteHTML, generatePdfFinancieroHTML } from './PdfCliente';
import ExpedientePanel from './ExpedientePanel';

function GrupoCliente({ cliente, pptos, PptoCard }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom:10, border:'1px solid #dde6ef', borderRadius:10, overflow:'hidden' }}>
      <div onClick={()=>setOpen(v=>!v)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#f0f4f8', cursor:'pointer', userSelect:'none' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:13, color:'#8aa0b8' }}>{open ? '▼' : '▶'}</span>
          <span style={{ fontSize:14, fontWeight:700, color:'#0d3b5e' }}>{cliente}</span>
          <span style={{ fontSize:12, color:'#8aa0b8', background:'#e8f0f8', padding:'2px 8px', borderRadius:999 }}>{pptos.length} presupuesto{pptos.length!==1?'s':''}</span>
        </div>
      </div>
      {open && (
        <div style={{ display:'flex', flexDirection:'column', gap:4, padding:'6px 8px', background:'#fff' }}>
          {pptos.map(p => <PptoCard key={p.id} p={p}/>)}
        </div>
      )}
    </div>
  );
}

export default function Presupuestos({ userRole, userEmail, logoUrl, onNavigate }) {
  const [pptos, setPptos]         = useState([]);
  const [categorias, setCats]     = useState([]);
  const [clientes, setClis]       = useState([]);
  const [ejecutivos, setEjecs]    = useState([]);
  const [productores, setProds]   = useState([]);
  const [briefs, setBriefs]       = useState([]);
  const [cfg, setCfg]             = useState({ oh_pct:15, bco_pct:5.5, fee_agencia:0, rebate_pct:2 });
  const [editing, setEditing]     = useState(null);
  const [search, setSearch]       = useState('');
  const [filtroEstado, setFiltro] = useState('todos');
  const [filtroAnio, setFiltroAnio] = useState(String(new Date().getFullYear()));
  const [toast, setToast]         = useState('');
  const [popupPpto, setPopupPpto] = useState(null);
  const [showInformePopup, setShowInformePopup] = useState(false);
  const [expedienteId, setExpedienteId] = useState(null);
  const [expedientePptoId, setExpedientePptoId] = useState(null);
  const [vincularPpto, setVincularPpto] = useState(null);
  const [solicitudPptoId, setSolicitudPptoId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [exportPeriod, setExportPeriod] = useState({ type:'mes', mes:new Date().getMonth()+1, anio:new Date().getFullYear() });
  // Filtro por usuario — Producción ve solo los suyos por defecto, Admin ve todos
  const [soloMios, setSoloMios]   = useState(userRole === 'produccion');
  const [loading, setLoading]     = useState(false);

  useEffect(() => { fetchAll(); }, [soloMios]);

  async function fetchAll() {
    setLoading(true);
    let query = supabase.from('presupuestos').select('*').order('created_at', { ascending: false });
    if (soloMios) {
      // Buscar nombre del productor asociado al email del usuario
      const {data: prod} = await supabase.from('productores').select('nombre').eq('email', userEmail).single();
      const nombreUsuario = prod?.nombre || '';
      if (nombreUsuario) {
        // Mis presupuestos = los que creé O los que me asignaron por nombre o email
        query = query.or(
          'created_by.eq.' + userEmail +
          ',productor_email.eq.' + userEmail +
          ',productor_nombre.ilike.%' + nombreUsuario + '%'
        );
      } else {
        // Sin nombre en productores, filtrar solo por email
        query = query.or('created_by.eq.' + userEmail + ',productor_email.eq.' + userEmail);
      }
    }
    const [ppR, catR, cliR, cfgR, ejecR, prodR, brR] = await Promise.all([
      query,
      supabase.from('categorias').select('*').order('nombre'),
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('config').select('*').single(),
      supabase.from('ejecutivos').select('*').order('nombre'),
      supabase.from('productores').select('*').order('nombre'),
      supabase.from('briefs').select('id, nombre, cliente_nombre, fecha_entrega, fecha_evento, dias_evento, lugar, ciudad, pax, ejecutivo_nombre, ejecutivo_email').order('nombre'),
    ]);
    if (ppR.data)   setPptos(ppR.data);
    if (catR.data)  setCats(catR.data);
    if (cliR.data)  setClis(cliR.data);
    if (cfgR.data)  setCfg(cfgR.data);
    if (ejecR.data) setEjecs(ejecR.data);
    if (prodR.data) setProds(prodR.data);
    if (brR.data)   setBriefs(brR.data);
    setLoading(false);
  }

  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 3000); }

  async function changeEstado(id, estado, estadoActual) {
    if (!canChangeEstadoPpto(userRole, estado)) { showToast('⚠️ Sin permiso para este estado'); return; }
    if (!canEditPpto(userRole, estadoActual))   { showToast('⚠️ Presupuesto bloqueado'); return; }
    await supabase.from('presupuestos').update({ estado }).eq('id', id);
    fetchAll();
  }

  async function markEjecutado(ppto) {
    if (!canMarkEjecutado(userRole)) { showToast('Sin permiso'); return; }
    const ejecutado = !ppto.ejecutado;
    await supabase.from('presupuestos').update({ ejecutado }).eq('id', ppto.id);
    if (ejecutado) showToast('✅ Marcado como ejecutado');
    fetchAll();
  }

  async function duplicatePpto(ppto) {
    if (!window.confirm(`¿Duplicar "${ppto.nombre || ppto.cliente}"?`)) return;
    const { count } = await supabase.from('presupuestos').select('*', { count:'exact', head:true });
    const { genNomenclatura } = await import('../calc');
    const newNom = genNomenclatura(ppto.nombre, ppto.cliente, (count || 0) + 1);

    // Mantener todos los ítems con sus costos intactos
    // Solo resetear campos de trazabilidad de ejecución
    const items = (ppto.items || []).map(it => {
      if (it._type === 'subcat') return { ...it, id: crypto.randomUUID() };
      return {
        ...it,
        id:              crypto.randomUUID(),
        costo_real_unit: null,
        bco_real_pct:    null,
        costo_aprobado:  false,
        num_factura_prov: '',
        foto_referencia: null,
        // costo_unit se mantiene igual al original
      };
    });

    const { error } = await supabase.from('presupuestos').insert({
      ...ppto,
      id:           undefined,
      nomenclatura: newNom,
      nombre:       '',          // título vacío — es un nuevo presupuesto
      fecha_evento: null,        // fecha limpia
      brief_id:     null,        // proyecto vinculado limpio
      estado:       'borrador',
      ejecutado:    false,
      created_at:   undefined,
      updated_at:   undefined,
      items,
    });
    if (error) { showToast('Error: ' + error.message); return; }
    showToast('Presupuesto duplicado ✓ — editá el nombre y la fecha');
    fetchAll();
  }

  async function deletePpto(id) {
    if (!window.confirm('¿Eliminar presupuesto?')) return;
    await supabase.from('presupuestos').delete().eq('id', id);
    fetchAll(); showToast('Eliminado');
  }

  // Selección masiva
  function toggleSelect(id) { setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; }); }
  function selectAll(list)  { setSelectedIds(new Set(list.map(p => p.id))); }
  function clearSelect()    { setSelectedIds(new Set()); }

  async function deleteSelected() {
    if (!selectedIds.size) return;
    if (!window.confirm(`¿Eliminar ${selectedIds.size} presupuesto(s)?`)) return;
    await Promise.all([...selectedIds].map(id => supabase.from('presupuestos').delete().eq('id', id)));
    clearSelect(); fetchAll(); showToast(`${selectedIds.size} eliminados`);
  }
  async function duplicateSelected() {
    const list = pptos.filter(p => selectedIds.has(p.id));
    for (const p of list) await duplicatePpto(p);
    clearSelect();
  }

  function exportExcel() {
    const filtrados = pptos.filter(p => {
      if (!p.fecha_evento) return false;
      const [y, m] = p.fecha_evento.split('-').map(Number);
      if (exportPeriod.type === 'anio') return y === exportPeriod.anio;
      return y === exportPeriod.anio && m === exportPeriod.mes;
    });
    const rows = [
      ['INFORME MATILDA EVENT DESIGNERS'],
      [`Período: ${exportPeriod.type === 'anio' ? exportPeriod.anio : `${exportPeriod.mes}/${exportPeriod.anio}`}`], [''],
      ['Código','Cliente','Evento','Fecha evento','Estado','Ejecutado','PAX','Subtotal Precio','Fee','Subtotal s/IVA','IVA 15%','Total c/IVA','Subtotal Costo','Margen','% Margen'],
      ...filtrados.map(p => { const t = calcPpto(p); return [p.nomenclatura, p.cliente, p.nombre, p.fecha_evento, ESTADOS_PPTO_LABELS[p.estado]||p.estado, p.ejecutado?'Sí':'No', p.personas, t.subtotalPrecio, t.feeAgencia, t.totalSinIva, t.iva15, t.totalConIva, t.subtotalCosto, t.margenTotal, t.margenPct.toFixed(1)+'%']; }),
      [''], ['TOTALES','','','','','','', filtrados.reduce((a,p)=>a+calcPpto(p).subtotalPrecio,0),'', filtrados.reduce((a,p)=>a+calcPpto(p).totalSinIva,0),'', filtrados.reduce((a,p)=>a+calcPpto(p).totalConIva,0), filtrados.reduce((a,p)=>a+calcPpto(p).subtotalCosto,0), filtrados.reduce((a,p)=>a+calcPpto(p).margenTotal,0),''],
    ];
    const csv = rows.map(r => r.map(c => { const s = String(c ?? '').replace(/"/g, '""'); return s.includes(',') ? `"${s}"` : s; }).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `informe_matilda_${exportPeriod.anio}${exportPeriod.type === 'mes' ? '_' + String(exportPeriod.mes).padStart(2,'0') : ''}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const filtered = pptos.filter(p => {
    const q = search.toLowerCase();
    const ms = !q || (p.nombre||'').toLowerCase().includes(q) || (p.cliente||'').toLowerCase().includes(q) || (p.nomenclatura||'').toLowerCase().includes(q);
    const me = filtroEstado === 'todos' || p.estado === filtroEstado;
    const ma = filtroAnio === 'todos' || (p.fecha_evento||p.created_at||'').startsWith(filtroAnio) || (p.nomenclatura||'').includes(filtroAnio.slice(2));
    return ms && me && ma;
  });

  const anioActual = new Date().getFullYear();
  const pptosAnio  = pptos.filter(p => p.fecha_evento?.startsWith(String(anioActual)));
  const facturados = pptosAnio.filter(p => p.estado === 'facturado');
  const pendFacturar = pptos.filter(p => p.estado === 'pendiente_facturar');
  const globales = {
    facturado:  facturados.reduce((a,p) => a + calcPpto(p).totalSinIva, 0),
    costoFact:  facturados.reduce((a,p) => a + calcPpto(p).subtotalCosto, 0),
    margenFact: facturados.reduce((a,p) => a + calcPpto(p).margenTotal, 0),
  };
  const clienteCount = {};
  pendFacturar.forEach(p => { const c = p.cliente || 'Sin cliente'; clienteCount[c] = (clienteCount[c]||0)+1; });
  const chartData = Object.entries(clienteCount).sort((a,b) => b[1]-a[1]).slice(0,8);
  const maxCount  = Math.max(...chartData.map(([,n]) => n), 1);

  // Si está editando, mostrar editor
  if (editing !== null) {
    return (
      <EditorPpto
        ppto={editing === 'new' ? null : editing}
        cfg={cfg} categorias={categorias} clientes={clientes}
        ejecutivos={ejecutivos} productores={productores} logoUrl={logoUrl} userRole={userRole}
        briefs={briefs.map(b => ({ ...b, _usado: pptos.some(p => p.brief_id === b.id && p.id !== (editing?.id)) }))}
        onSave={() => { setEditing(null); fetchAll(); showToast('Presupuesto guardado ✓'); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  function PptoCard({ p }) {
    const t = calcPpto(p);
    const sel = selectedIds.has(p.id);
    return (
      <div style={{ ...S.card, border: t.hasWarning ? '2px solid #c8264a' : sel ? '2px solid #3dbfb8' : '1px solid #dde6ef', background: sel ? '#f0fcfc' : '#fff', cursor:'pointer' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <input type="checkbox" checked={sel} onChange={e => { e.stopPropagation(); toggleSelect(p.id); }} onClick={e => e.stopPropagation()} style={{ width:18, height:18, cursor:'pointer', accentColor:'#3dbfb8', flexShrink:0 }}/>
          <div style={{ flex:1 }} onClick={() => setPopupPpto(p)}>
            {p.nomenclatura && <div style={{ fontSize:10, color:'#8aa0b8', fontFamily:'monospace', marginBottom:1 }}>{p.nomenclatura}</div>}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
              <span style={{ fontSize:15, fontWeight:700, color:'#0d3b5e' }}>{p.nombre || p.cliente}</span>
              <Badge estado={p.estado}/>
              {t.hasWarning && <span style={{ fontSize:11, color:'#fff', fontWeight:700, background:'#c8264a', padding:'2px 8px', borderRadius:4 }}>⚠️ COSTO &gt; PRECIO</span>}
              {p.ejecutado && <span style={{ fontSize:10, background:'#edf7ed', color:'#2e8b4e', padding:'2px 6px', borderRadius:4, fontWeight:700 }}>✅ Ejecutado</span>}
            </div>
            <div style={{ fontSize:12, color:'#8aa0b8', display:'flex', gap:10, flexWrap:'wrap' }}>
              {p.cliente && <span>🏢 {p.cliente}</span>}
              {p.fecha_evento && <span>📅 {p.fecha_evento}</span>}
              {p.ciudad && <span>📍 {p.ciudad}</span>}
              <span>📦 {(p.items||[]).filter(it=>!it._type).length} ítems</span>
              {p.brief_id
                ? <span style={{ color:'#7c3aed', cursor:'pointer', fontWeight:500 }} onClick={e=>{ e.stopPropagation(); setExpedienteId(p.brief_id); }}>📁 Ver expediente</span>
                : <span style={{ color:'#7c3aed', cursor:'pointer', fontWeight:500 }} onClick={e=>{ e.stopPropagation(); setExpedientePptoId(p.id); }}>📁 Ver expediente</span>
              }
              {!p.brief_id && <span style={{ color:'#aaa', cursor:'pointer', fontSize:11 }} onClick={e=>{ e.stopPropagation(); setVincularPpto(p); }}>🔗 Vincular proyecto</span>}
            </div>
          </div>
          <div style={{ textAlign:'right' }} onClick={() => setPopupPpto(p)}>
            <div style={{ fontSize:11, color:'#aaa' }}>Subtotal s/IVA</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#0d3b5e' }}>{fmt(t.totalSinIva)}</div>
            <div style={{ fontSize:11, color:'#aaa' }}>Margen: {fmt(t.margenTotal)} ({fmtPct(t.margenPct)})</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header resumen */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <h2 style={{ fontSize:20, fontWeight:700, color:'#0d3b5e' }}>📊 Presupuestos {anioActual}</h2>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {/* Toggle mis presupuestos / todos */}
          <button
            onClick={() => setSoloMios(v => !v)}
            style={{
              padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:500,
              cursor:'pointer', fontFamily:'inherit', border:'1px solid',
              background: soloMios ? '#0d3b5e' : '#fff',
              color:      soloMios ? '#fff'    : '#0d3b5e',
              borderColor: '#0d3b5e',
            }}
          >
            {soloMios ? '👤 Mis presupuestos' : '👥 Todos'}
          </button>
          <select style={{ ...S.select, width:'auto' }} value={exportPeriod.type} onChange={e => setExportPeriod(p => ({...p, type:e.target.value}))}>
            <option value="mes">Por mes</option><option value="anio">Por año</option>
          </select>
          {exportPeriod.type === 'mes' && (
            <select style={{ ...S.select, width:'auto' }} value={exportPeriod.mes} onChange={e => setExportPeriod(p => ({...p, mes:parseInt(e.target.value)}))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m-1]}</option>)}
            </select>
          )}
          <input type="number" style={{ ...S.input, width:80 }} value={exportPeriod.anio} onChange={e => setExportPeriod(p => ({...p, anio:parseInt(e.target.value)||anioActual}))}/>
          {canDownloadExcel(userRole) && <button style={S.btnPrimary} onClick={exportExcel}>📊 Exportar</button>}
          <button style={{ ...S.btnPrimary, background:'#c8264a' }} onClick={() => setEditing('new')}>+ Nuevo presupuesto</button>
        </div>
      </div>

      {/* Métricas — solo admin y financiero */}
      {['admin','financiero'].includes(userRole) && (<>
      <div style={{ ...S.grid4, marginBottom:16 }}>
        <div style={S.metricNavy}><div style={{ fontSize:11, color:'#8ab4d4', marginBottom:4 }}>Facturado {anioActual}</div><div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>{fmt(globales.facturado)}</div></div>
        <div style={S.metricCard}><div style={{ fontSize:11, color:'#8aa0b8', marginBottom:4 }}>Costo facturado</div><div style={{ fontSize:18, fontWeight:700 }}>{fmt(globales.costoFact)}</div></div>
        <div style={S.metricTeal}><div style={{ fontSize:11, color:'#0d6e69', marginBottom:4 }}>Margen facturado</div><div style={{ fontSize:18, fontWeight:700, color:'#0d6e69' }}>{fmt(globales.margenFact)}</div></div>
        <div style={S.metricFucsia}><div style={{ fontSize:11, color:'#c8264a', marginBottom:4 }}>Pendiente facturar</div><div style={{ fontSize:18, fontWeight:700, color:'#c8264a' }}>{pendFacturar.length} pptos</div></div>
      </div>

      {/* Chart pendientes */}
      {chartData.length > 0 && (
        <div style={{ ...S.card, marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#0d3b5e', marginBottom:12 }}>Presupuestos pendientes de facturar por cliente</div>
          {chartData.map(([cli, n]) => (
            <div key={cli} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <div style={{ width:130, fontSize:12, color:'#5a7a9a', textAlign:'right', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cli}</div>
              <div style={{ flex:1, background:'#f0f4f8', borderRadius:4, height:20, overflow:'hidden' }}>
                <div style={{ width:`${(n/maxCount)*100}%`, background:'#c8264a', height:'100%', borderRadius:4 }}/>
              </div>
              <div style={{ fontSize:12, fontWeight:700, color:'#0d3b5e', minWidth:20 }}>{n}</div>
            </div>
          ))}
        </div>
      )}
      </>)}

      {/* Filtros */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <input style={{ ...S.input, maxWidth:260 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"/>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          <button onClick={() => setFiltro('todos')} style={{ ...S.btnSm, background:filtroEstado==='todos'?'#0d3b5e':'#fff', color:filtroEstado==='todos'?'#fff':'#0d3b5e', fontSize:11 }}>Todos</button>
          {ESTADOS_PPTO.map(e => (
            <button key={e} onClick={() => setFiltro(e)} style={{ ...S.btnSm, background:filtroEstado===e?ESTADOS_PPTO_COLORS[e]:'#fff', color:filtroEstado===e?'#fff':ESTADOS_PPTO_COLORS[e], borderColor:ESTADOS_PPTO_COLORS[e]+'66', fontSize:11 }}>
              {ESTADOS_PPTO_LABELS[e]}
            </button>
          ))}
          <div style={{width:1,height:20,background:'#dde6ef',margin:'0 4px'}}/>
          {['todos', String(new Date().getFullYear()), String(new Date().getFullYear()-1)].map(a=>(
            <button key={a} onClick={()=>setFiltroAnio(a)} style={{...S.btnSm,background:filtroAnio===a?'#5b21b6':'#fff',color:filtroAnio===a?'#fff':'#5b21b6',borderColor:'#7c3aed44',fontSize:11}}>
              {a==='todos'?'Todos los años':a}
            </button>
          ))}
        </div>
      </div>

      {/* Acciones masivas */}
      {selectedIds.size > 0 && (
        <div style={{ background:'#0d3b5e', borderRadius:8, padding:'10px 16px', marginBottom:12, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <span style={{ color:'#fff', fontWeight:700, fontSize:13 }}>{selectedIds.size} seleccionado(s)</span>
          <button style={{ ...S.btnSm, background:'#fff', color:'#0d3b5e' }} onClick={() => { if (selectedIds.size===1) { const p=pptos.find(x=>selectedIds.has(x.id)); if(p){setEditing(p);clearSelect();} } else showToast('Seleccioná solo 1 para editar'); }}>✏️ Editar</button>
          <button style={{ ...S.btnSm, background:'#3dbfb8', color:'#fff', border:'none' }} onClick={duplicateSelected}>📋 Duplicar</button>
          {userRole === 'admin' && <button style={{ ...S.btnSm, background:'#c8264a', color:'#fff', border:'none' }} onClick={deleteSelected}>🗑 Eliminar</button>}
          <button style={{ ...S.btnSm, background:'none', color:'#8ab4d4', border:'1px solid #4a6a8a' }} onClick={clearSelect}>✕ Cancelar</button>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <input type="checkbox" checked={filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))} onChange={e => e.target.checked ? selectAll(filtered) : clearSelect()} style={{ width:18, height:18, cursor:'pointer', accentColor:'#3dbfb8' }}/>
        <span style={{ fontSize:12, color:'#5a7a9a' }}>Seleccionar todos ({filtered.length})</span>
      </div>

      {filtered.length === 0 && <div style={S.empty}>{pptos.length === 0 ? 'Sin presupuestos aún.' : 'Sin resultados.'}</div>}

      {/* Agrupado por cliente */}
      {(()=>{
        const grupos = {};
        filtered.forEach(p => {
          const cli = p.cliente || '— Sin cliente —';
          if (!grupos[cli]) grupos[cli] = [];
          grupos[cli].push(p);
        });
        // Sort each group by most recent first
        Object.values(grupos).forEach(g => g.sort((a,b) => (b.updated_at||b.created_at||'').localeCompare(a.updated_at||a.created_at||'')));
        const clientesOrdenados = Object.keys(grupos).sort((a,b) => {
          // Get most recent presupuesto date for each client
          const latestA = grupos[a].reduce((max, p) => {
            const d = p.updated_at || p.created_at || '';
            return d > max ? d : max;
          }, '');
          const latestB = grupos[b].reduce((max, p) => {
            const d = p.updated_at || p.created_at || '';
            return d > max ? d : max;
          }, '');
          return latestB.localeCompare(latestA); // most recent first
        });
        return clientesOrdenados.map(cli => (
          <GrupoCliente key={cli} cliente={cli} pptos={grupos[cli]} PptoCard={PptoCard}/>
        ));
      })()}

      {/* Popup detalle */}
      {popupPpto && (
        <div style={{ position:'fixed', inset:0, background:'rgba(13,59,94,0.6)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:560, padding:24, boxShadow:'0 8px 40px rgba(13,59,94,0.25)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:'#8aa0b8', fontFamily:'monospace' }}>{popupPpto.nomenclatura}</div>
                <div style={{ fontSize:17, fontWeight:700, color:'#0d3b5e' }}>{popupPpto.nombre || popupPpto.cliente}</div>
                <div style={{ marginTop:6, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                  <Badge estado={popupPpto.estado}/>
                  {calcPpto(popupPpto).hasWarning && <span style={{ fontSize:12, color:'#fff', fontWeight:700, background:'#c8264a', padding:'2px 8px', borderRadius:4 }}>⚠️ COSTO &gt; PRECIO</span>}
                  {popupPpto.ejecutado && <span style={{ fontSize:11, background:'#edf7ed', color:'#2e8b4e', padding:'2px 8px', borderRadius:4, fontWeight:700 }}>✅ Ejecutado</span>}
                </div>
              </div>
              <button onClick={() => setPopupPpto(null)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8aa0b8' }}>✕</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14, fontSize:13 }}>
              {[['Cliente',popupPpto.cliente],['Fecha evento',popupPpto.fecha_evento],['Lugar',popupPpto.lugar],['PAX',popupPpto.personas?popupPpto.personas+' pax':''],['Subtotal s/IVA',fmt(calcPpto(popupPpto).totalSinIva)],['Margen',fmt(calcPpto(popupPpto).margenTotal)]].filter(([,v])=>v).map(([l,v]) => (
                <div key={l} style={{ background:'#f4f8fc', borderRadius:6, padding:'8px 12px' }}>
                  <div style={{ fontSize:10, color:'#3dbfb8', fontWeight:700, letterSpacing:1, textTransform:'uppercase' }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#0d3b5e' }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:12, alignItems:'center' }}>
              <span style={{ fontSize:12, color:'#5a7a9a', flexShrink:0 }}>Estado:</span>
              <select style={{ ...S.select, flex:1 }} value={popupPpto.estado}
                onChange={e => {
                  if (!canChangeEstadoPpto(userRole, e.target.value)) { showToast('⚠️ Sin permiso'); return; }
                  changeEstado(popupPpto.id, e.target.value, popupPpto.estado);
                  setPopupPpto(prev => ({ ...prev, estado: e.target.value }));
                }}>
                {ESTADOS_PPTO.map(e => <option key={e} value={e}>{ESTADOS_PPTO_LABELS[e]}</option>)}
              </select>
              {canMarkEjecutado(userRole) && (
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer', flexShrink:0, padding:'6px 10px', background:popupPpto.ejecutado?'#edf7ed':'#f8fafc', borderRadius:6, border:'1px solid #dde6ef' }}>
                  <input type="checkbox" checked={!!popupPpto.ejecutado} onChange={() => { markEjecutado(popupPpto); setPopupPpto(prev => ({...prev, ejecutado:!prev.ejecutado})); }} style={{ cursor:'pointer' }}/>
                  Ejecutado
                </label>
              )}
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
              {canDownloadPdfCliente(userRole) && <button style={S.btnPrimary} onClick={() => { const html=generatePdfClienteHTML(popupPpto,logoUrl); const w=window.open('','_blank'); w.document.write(html); w.document.close(); }}>📄 PDF cliente</button>}
              {canDownloadPdfFinanciero(userRole) && <button style={{ ...S.btnSecondary, color:'#c8264a', borderColor:'#c8264a44' }} onClick={() => {
                try {
                  const html=generatePdfFinancieroHTML(popupPpto,logoUrl);
                  const w=window.open('','_blank');
                  if(!w){alert('Permitá ventanas emergentes para ver el PDF');return;}
                  w.document.write(html);w.document.close();
                } catch(e){alert('Error PDF: '+e.message);}
              }}>📊 PDF financiero</button>}
              {['admin','produccion'].includes(userRole) && <button style={{ ...S.btnSecondary, color:'#0d3b5e' }} onClick={() => { const id=popupPpto.id; setPopupPpto(null); if(onNavigate) onNavigate('solicitudes', id); }}>📤 Nueva solicitud</button>}
              {popupPpto.estado==='aprobado' && <button style={{ ...S.btnSecondary, color:'#7c3aed', borderColor:'#7c3aed44' }} onClick={() => setShowInformePopup(true)}>📋 Informe</button>}
              <button style={S.btnSecondary} onClick={() => { setEditing(popupPpto); setPopupPpto(null); }}>✏️ Editar</button>
              <button style={S.btnSm} onClick={() => { duplicatePpto(popupPpto); setPopupPpto(null); }}>📋 Duplicar</button>
            </div>
          </div>
        </div>
      )}
      {showInformePopup && popupPpto && <InformeEditor presupuesto={popupPpto} onClose={()=>setShowInformePopup(false)}/>}

      <Toast msg={toast}/>

      {/* Modal vincular proyecto */}
      {vincularPpto && (
        <div onClick={()=>setVincularPpto(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:460, padding:24, boxShadow:'0 4px 24px rgba(0,0,0,.15)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:4 }}>Vincular a proyecto</div>
            <div style={{ fontSize:12, color:'#8aa0b8', marginBottom:16 }}>{vincularPpto.nombre || vincularPpto.cliente}</div>
            <select
              style={{ width:'100%', padding:'9px 12px', border:'1px solid #ddd', borderRadius:9, fontSize:13, fontFamily:'inherit', marginBottom:16 }}
              defaultValue=""
              onChange={async e => {
                if (!e.target.value) return;
                await supabase.from('presupuestos').update({ brief_id: e.target.value }).eq('id', vincularPpto.id);
                setVincularPpto(null);
                showToast('Proyecto vinculado ✓');
                fetchAll();
              }}
            >
              <option value="">Seleccioná un proyecto…</option>
              {briefs.filter(b => !pptos.some(p => p.brief_id === b.id && p.id !== vincularPpto.id)).map(b => (
                <option key={b.id} value={b.id}>{b.nombre}{b.cliente_nombre ? ' — ' + b.cliente_nombre : ''}</option>
              ))}
            </select>
            <button onClick={()=>setVincularPpto(null)} style={{ width:'100%', padding:9, background:'#f0f4f8', border:'1px solid #dde6ef', borderRadius:8, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
          </div>
        </div>
      )}

      {expedienteId && <ExpedientePanel briefId={expedienteId} onClose={()=>setExpedienteId(null)}/>}
      {expedientePptoId && <ExpedientePanel presupuestoId={expedientePptoId} onClose={()=>setExpedientePptoId(null)}/>}
    </div>
  );
}
