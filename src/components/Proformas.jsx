import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import ExpedientePanel from './ExpedientePanel';

// ── Helpers ───────────────────────────────────────────────────
function fmt(n) { return '$' + (Number(n)||0).toLocaleString('es-EC', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
function fmtDate(s) { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; }
function uid() { return crypto.randomUUID(); }

function calcOpcion(opcion, oh_pct, fee_agencia) {
  const items = (opcion.items || []);
  let subtotalPrecio = 0, subtotalCosto = 0;
  for (const it of items) {
    const qty  = Number(it.cantidad || 0);
    const dias = Number(it.dias     || 1);
    const pu   = Number(it.precio_unit || 0);
    const cu   = Number(it.costo_unit  || 0);
    const bco  = Number(it.bco_pct_item || 0) / 100;
    subtotalPrecio += qty * dias * pu;
    subtotalCosto  += qty * dias * cu * (1 + bco);
  }
  const oh        = subtotalCosto * (oh_pct / 100);
  const totalCosto= subtotalCosto + oh;
  const fee       = subtotalPrecio * (fee_agencia / 100);
  const sinIva    = subtotalPrecio + fee;
  const iva       = sinIva * 0.15;
  const total     = sinIva + iva;
  const margen    = sinIva - totalCosto;
  const margenPct = sinIva > 0 ? (margen / sinIva) * 100 : 0;
  return { subtotalPrecio, subtotalCosto, totalCosto, fee, sinIva, iva, total, margen, margenPct };
}

function calcItem(it) {
  const qty  = Number(it.cantidad || 0);
  const dias = Number(it.dias     || 1);
  const pu   = Number(it.precio_unit || 0);
  return qty * dias * pu;
}

// ── Estilos ───────────────────────────────────────────────────
const inp = { fontFamily:'inherit', fontSize:13, padding:'8px 10px', border:'1px solid #ddd', borderRadius:8, outline:'none', color:'#1a1a1a', background:'#fff' };
const lbl = { fontSize:11, fontWeight:600, color:'#666', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4, display:'block' };

function Btn({ onClick, variant='primary', size='md', disabled, children, style={} }) {
  const base = { display:'inline-flex', alignItems:'center', gap:5, borderRadius:8, fontFamily:'inherit', fontWeight:500, cursor:disabled?'not-allowed':'pointer', border:'1px solid transparent', opacity:disabled?.6:1, ...style };
  const v = { primary:{ background:'#0d3b5e', color:'#fff' }, secondary:{ background:'#fff', color:'#333', borderColor:'#ddd' }, danger:{ background:'#fee2e2', color:'#991b1b', borderColor:'#fca5a5' }, purple:{ background:'#7c3aed', color:'#fff' }, green:{ background:'#2e8b4e', color:'#fff' } };
  const s = { sm:{ padding:'4px 10px', fontSize:11 }, md:{ padding:'7px 14px', fontSize:13 }, xs:{ padding:'3px 8px', fontSize:11 } };
  return <button onClick={onClick} disabled={disabled} style={{...base,...v[variant],...s[size]}}>{children}</button>;
}

function Modal({ open, onClose, title, children, footer, wide }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:wide?900:560, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,.2)' }}>
        <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid #eee', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, background:'#fff', zIndex:1 }}>
          <div style={{ fontSize:15, fontWeight:700 }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#aaa' }}>×</button>
        </div>
        <div style={{ padding:'18px 20px' }}>{children}</div>
        {footer && <div style={{ padding:'12px 20px', borderTop:'1px solid #eee', display:'flex', justifyContent:'flex-end', gap:8, position:'sticky', bottom:0, background:'#fff' }}>{footer}</div>}
      </div>
    </div>
  );
}

// ── Editor de ítem ────────────────────────────────────────────
function ItemCardProforma({ item, onChange, onDelete, oh_pct, isOpen, onToggle }) {
  const [uploading, setUploading] = useState(false);
  const qty  = Number(item.cantidad||0);
  const dias = Number(item.dias||1);
  const pu   = Number(item.precio_unit||0);
  const cu   = Number(item.costo_unit||0);
  const bco  = Number(item.bco_pct_item||0)/100;
  const oh   = Number(oh_pct||15)/100;
  const precioTotal = qty*dias*pu;
  const costoTotal  = qty*dias*cu*(1+bco)*(1+oh);
  const margen = precioTotal - costoTotal;
  const margenPct = precioTotal>0 ? margen/precioTotal*100 : 0;

  async function handleImg(e) {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    const name = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g,'_')}`;
    await supabase.storage.from('proforma-images').upload(name, file);
    const { data } = supabase.storage.from('proforma-images').getPublicUrl(name);
    onChange('imagen_url', data.publicUrl);
    setUploading(false);
  }

  return (
    <div style={{ border:'1px solid #dde6ef', borderRadius:9, marginBottom:6, overflow:'hidden' }}>
      {/* Resumen clickeable */}
      <div onClick={onToggle} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', cursor:'pointer', background:isOpen?'#eef4fb':'#fff', userSelect:'none' }}>
        {item.imagen_url
          ? <img src={item.imagen_url} alt="" style={{ width:36, height:36, objectFit:'cover', borderRadius:5, flexShrink:0 }}/>
          : <div style={{ width:36, height:36, borderRadius:5, background:'#f0f4f8', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16, color:'#ccc' }}>📷</div>
        }
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:500, color:'#0d3b5e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.nombre||<span style={{color:'#aaa',fontStyle:'italic'}}>Sin nombre</span>}</div>
          <div style={{ fontSize:11, color:'#8aa0b8' }}>{item.subcategoria||''} {item.subcategoria&&item.detalle?'·':''} {item.detalle||''}</div>
        </div>
        <div style={{ fontSize:12, color:'#8aa0b8', flexShrink:0, textAlign:'right' }}>
          {qty}×{dias} · P:{fmt(precioTotal)}
        </div>
        <div style={{ fontSize:12, fontWeight:600, color:margen>=0?'#2e8b4e':'#c8264a', flexShrink:0 }}>{fmt(margen)}</div>
        <button onClick={e=>{e.stopPropagation();onDelete();}} style={{ background:'none', border:'none', color:'#c8264a', cursor:'pointer', fontSize:16, flexShrink:0 }}>✕</button>
      </div>
      {/* Campos expandibles */}
      {isOpen && (
        <div style={{ padding:'12px 14px', background:'#fafcfe', borderTop:'1px solid #dde6ef', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{gridColumn:'1/-1'}}><label style={lbl}>Subcategoría</label><input style={inp} value={item.subcategoria||''} onChange={e=>onChange('subcategoria',e.target.value)} placeholder="Ej: DECORACIÓN"/></div>
          <div style={{gridColumn:'1/-1'}}><label style={lbl}>Nombre del ítem *</label><input style={inp} value={item.nombre||''} onChange={e=>onChange('nombre',e.target.value)} placeholder="Descripción del ítem"/></div>
          <div style={{gridColumn:'1/-1'}}><label style={lbl}>Detalle</label><textarea style={{...inp,minHeight:52,resize:'vertical'}} value={item.detalle||''} onChange={e=>onChange('detalle',e.target.value)} placeholder="Descripción detallada..."/></div>
          <div><label style={lbl}>Cantidad</label><input type="number" style={inp} value={item.cantidad} onChange={e=>onChange('cantidad',Number(e.target.value))} min="0"/></div>
          <div><label style={lbl}>Días</label><input type="number" style={inp} value={item.dias} onChange={e=>onChange('dias',Number(e.target.value))} min="1"/></div>
          <div><label style={lbl}>Costo unitario ($)</label><input type="number" step="0.01" style={{...inp,background:'#fafafa'}} value={item.costo_unit||''} onChange={e=>onChange('costo_unit',Number(e.target.value))}/></div>
          <div><label style={lbl}>Costo total (auto)</label><input readOnly style={{...inp,background:'#f0f0f0',color:'#555'}} value={fmt(qty*dias*cu*(1+bco))}/></div>
          <div><label style={lbl}>OH %</label><input type="number" step="0.1" style={{...inp,background:'#fafafa'}} value={oh_pct||15} readOnly/></div>
          <div><label style={lbl}>BCO %</label><input type="number" step="0.1" style={{...inp,background:'#fafafa'}} value={item.bco_pct_item||''} onChange={e=>onChange('bco_pct_item',Number(e.target.value))} placeholder="0"/></div>
          <div><label style={lbl}>Precio unitario ($)</label><input type="number" step="0.01" style={inp} value={item.precio_unit||''} onChange={e=>onChange('precio_unit',Number(e.target.value))}/></div>
          <div><label style={lbl}>Precio total (auto)</label><input readOnly style={{...inp,background:'#f0f0f0',fontWeight:600,color:'#0d3b5e'}} value={fmt(precioTotal)}/></div>
          <div><label style={lbl}>Razón social proveedor</label><input style={inp} value={item.proveedor||''} onChange={e=>onChange('proveedor',e.target.value)}/></div>
          <div><label style={lbl}>Info general</label><input style={inp} value={item.info||''} onChange={e=>onChange('info',e.target.value)}/></div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={lbl}>Imagen de referencia</label>
            <label style={{ display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer', padding:'7px 12px', border:'1px solid #ddd', borderRadius:8, background:'#fafafa', fontSize:12 }}>
              <input type="file" accept="image/*" onChange={handleImg} style={{ display:'none' }} disabled={uploading}/>
              {uploading ? '⏳ Subiendo...' : '📷 Seleccionar imagen'}
            </label>
            {item.imagen_url && <img src={item.imagen_url} alt="" style={{ marginLeft:12, width:60, height:60, objectFit:'cover', borderRadius:6, border:'1px solid #ddd', verticalAlign:'middle' }}/>}
          </div>
          <div style={{gridColumn:'1/-1', background:'#eef4fb', borderRadius:8, padding:'8px 12px', display:'flex', gap:20}}>
            <span style={{fontSize:13}}>Precio total: <strong style={{color:'#0d3b5e'}}>{fmt(precioTotal)}</strong></span>
            <span style={{fontSize:13}}>Costo total: <strong>{fmt(costoTotal)}</strong></span>
            <span style={{fontSize:13,color:margen>=0?'#2e8b4e':'#c8264a'}}>Margen: <strong>{fmt(margen)} ({margenPct.toFixed(1)}%)</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
  );
}

// ── Editor de opción ──────────────────────────────────────────
function OpcionEditor({ opcion, onChange, onDelete, oh_pct, fee_agencia, aprobada, onAprobar, index }) {
  const [openItem, setOpenItem] = useState(null);
  const t = calcOpcion(opcion, oh_pct, fee_agencia);

  function updateItem(itemId, field, value) {
    const items = opcion.items.map(it => it.id === itemId ? { ...it, [field]: value } : it);
    onChange({ ...opcion, items });
  }
  function addItem() {
    const items = [...(opcion.items||[]), { id:uid(), subcategoria:'', nombre:'', detalle:'', imagen_url:'', cantidad:1, dias:1, precio_unit:0, costo_unit:0, bco_pct_item:0, proveedor:'', info:'' }];
    onChange({ ...opcion, items });
    setOpenItem(items[items.length-1].id);
  }
  function deleteItem(itemId) {
    onChange({ ...opcion, items: opcion.items.filter(it => it.id !== itemId) });
    if (openItem === itemId) setOpenItem(null);
  }

  const borderColor = aprobada ? '#2e8b4e' : '#e8e8e8';

  return (
    <div style={{ border:`2px solid ${borderColor}`, borderRadius:12, marginBottom:16, overflow:'hidden' }}>
      {/* Header opción */}
      <div style={{ background: aprobada ? '#e8f5ee' : '#f8fafc', padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:14, fontWeight:700, color: aprobada ? '#2e8b4e' : '#0d3b5e', flex:1 }}>
          {aprobada && '✅ '}
          <input
            value={opcion.nombre||''}
            onChange={e=>onChange({...opcion, nombre:e.target.value})}
            placeholder={`Nombre de ítem / opción ${index+1}`}
            style={{...inp, fontSize:14, fontWeight:600, padding:'4px 8px', width:300, color:aprobada?'#2e8b4e':'#0d3b5e'}}
          />
        </div>
        {!aprobada && <Btn size="xs" variant="green" onClick={onAprobar}>✓ Aprobar</Btn>}
        {aprobada && <span style={{ fontSize:12, color:'#2e8b4e', fontWeight:600 }}>Aprobado</span>}
        <Btn size="xs" variant="danger" onClick={onDelete}>✕</Btn>
      </div>

      {/* Ítems al estilo presupuesto */}
      <div style={{ padding:'12px 14px' }}>
        {(opcion.items||[]).map(it => (
          <ItemCardProforma key={it.id} item={it} oh_pct={oh_pct}
            isOpen={openItem===it.id}
            onToggle={()=>setOpenItem(openItem===it.id?null:it.id)}
            onChange={(field, val) => updateItem(it.id, field, val)}
            onDelete={() => deleteItem(it.id)}
          />
        ))}
        {(opcion.items||[]).length === 0 && (
          <div style={{ textAlign:'center', padding:'1.5rem', color:'#ccc', fontSize:13, border:'1px dashed #e8e8e8', borderRadius:8 }}>
            Sin ítems — hacé clic en "+ Ítem" para agregar
          </div>
        )}
        <div style={{ marginTop:8 }}>
          <Btn size="xs" variant="secondary" onClick={addItem}>+ Ítem</Btn>
        </div>
      </div>

      {/* Totales de la opción */}
      <div style={{ background:'#f8fafc', borderTop:'1px solid #e8e8e8', padding:'12px 16px', display:'flex', gap:16, flexWrap:'wrap', justifyContent:'flex-end' }}>
        {[
          ['Subtotal precio', fmt(t.subtotalPrecio)],
          ['Fee', fmt(t.fee)],
          ['Subtotal s/IVA', fmt(t.sinIva)],
          ['IVA 15%', fmt(t.iva)],
          ['Total', fmt(t.total)],
        ].map(([l, v]) => (
          <div key={l} style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, color:'#888', marginBottom:2 }}>{l}</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#0d3b5e' }}>{v}</div>
          </div>
        ))}
        <div style={{ textAlign:'right', borderLeft:'1px solid #ddd', paddingLeft:16 }}>
          <div style={{ fontSize:10, color:'#888', marginBottom:2 }}>Margen</div>
          <div style={{ fontSize:13, fontWeight:700, color: t.margenPct >= 20 ? '#2e8b4e' : '#dc2626' }}>
            {t.margenPct.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

  return (
    <div style={{ border:`2px solid ${borderColor}`, borderRadius:12, marginBottom:16, overflow:'hidden' }}>
      {/* Header opción */}
      <div style={{ background: aprobada ? '#e8f5ee' : '#f8fafc', padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:14, fontWeight:700, color: aprobada ? '#2e8b4e' : '#0d3b5e', flex:1 }}>
          {aprobada && '✅ '} Opción {index + 1}
        </div>
        <input
          value={opcion.nombre||''}
          onChange={e=>onChange({...opcion, nombre:e.target.value})}
          placeholder="Nombre de la opción"
          style={{...inp, fontSize:13, padding:'5px 10px', width:200}}
        />
        {!aprobada && <Btn size="xs" variant="green" onClick={onAprobar}>✓ Aprobar</Btn>}
        {aprobada && <span style={{ fontSize:12, color:'#2e8b4e', fontWeight:600 }}>Aprobada</span>}
        <Btn size="xs" variant="danger" onClick={onDelete}>✕</Btn>
      </div>

      {/* Tabla de ítems */}
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#f0f4f8' }}>
              {['Img','Subcategoría','Ítem','Cant.','Días','P. Unit','C. Unit','BCO%','P. Total',''].map(h => (
                <th key={h} style={{ padding:'7px 6px', textAlign: ['P. Unit','C. Unit','BCO%','P. Total'].includes(h)?'right':'left', fontSize:10, color:'#666', fontWeight:700, whiteSpace:'nowrap', borderBottom:'1px solid #ddd' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(opcion.items||[]).map(it => (
              <ItemRow key={it.id} item={it} oh_pct={oh_pct}
                onChange={(field, val) => updateItem(it.id, field, val)}
                onDelete={() => deleteItem(it.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Botón agregar ítem */}
      <div style={{ padding:'10px 16px', borderTop:'1px solid #f0f0f0' }}>
        <Btn size="xs" variant="secondary" onClick={addItem}>+ Agregar ítem</Btn>
      </div>

      {/* Totales de la opción */}
      <div style={{ background:'#f8fafc', borderTop:'1px solid #e8e8e8', padding:'12px 16px', display:'flex', gap:16, flexWrap:'wrap', justifyContent:'flex-end' }}>
        {[
          ['Subtotal precio', fmt(t.subtotalPrecio)],
          ['Fee', fmt(t.fee)],
          ['Subtotal s/IVA', fmt(t.sinIva)],
          ['IVA 15%', fmt(t.iva)],
          ['Total', fmt(t.total)],
        ].map(([l, v]) => (
          <div key={l} style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, color:'#888', marginBottom:2 }}>{l}</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#0d3b5e' }}>{v}</div>
          </div>
        ))}
        <div style={{ textAlign:'right', borderLeft:'1px solid #ddd', paddingLeft:16 }}>
          <div style={{ fontSize:10, color:'#888', marginBottom:2 }}>Margen</div>
          <div style={{ fontSize:13, fontWeight:700, color: t.margenPct >= 20 ? '#2e8b4e' : '#dc2626' }}>
            {t.margenPct.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function Proformas({ userRole, userEmail }) {
  const [proformas, setProformas] = useState([]);
  const [clientes, setClientes]   = useState([]);
  const [ejecutivos, setEjecs]    = useState([]);
  const [briefs, setBriefs]       = useState([]);
  const [cfg, setCfg]             = useState({ oh_pct:15, bco_pct:5.5, fee_agencia:0 });
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState(null); // null | 'new' | proforma obj
  const [expedienteId, setExpedienteId] = useState(null);
  const [toast, setToast]         = useState('');
  const [converting, setConverting] = useState(null); // proforma a convertir

  function showToast(m) { setToast(m); setTimeout(()=>setToast(''), 3000); }

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [pfR, clR, ejR, brR, cfgR] = await Promise.all([
      supabase.from('proformas').select('*').order('created_at', { ascending:false }),
      supabase.from('clientes').select('*').eq('activo',true).order('nombre'),
      supabase.from('ejecutivos').select('*').order('nombre'),
      supabase.from('briefs').select('id, nombre, cliente_id, cliente_nombre, fecha_evento, ciudad, lugar, pax, dias_evento').order('nombre'),
      supabase.from('config').select('*').single(),
    ]);
    setProformas(pfR.data || []);
    setClientes(clR.data  || []);
    setEjecs(ejR.data     || []);
    setBriefs(brR.data    || []);
    if (cfgR.data) setCfg(cfgR.data);
    setLoading(false);
  }

  // ── Convertir opción aprobada a presupuesto ────────────────
  async function convertirAPresupuesto(proforma) {
    const opcion = (proforma.opciones||[]).find(o => o.id === proforma.opcion_aprobada);
    if (!opcion) { showToast('No hay opción aprobada'); return; }

    // Transformar ítems de proforma al formato de presupuesto
    const items = (opcion.items||[]).map(it => ({
      id: uid(),
      categoria: it.subcategoria || 'OTROS',
      nombre: it.nombre,
      cantidad: Number(it.cantidad||0),
      dias: Number(it.dias||1),
      precio_unit: Number(it.precio_unit||0),
      costo_unit: Number(it.costo_unit||0),
      bco_real_pct: Number(it.bco_pct_item||0),
      foto_referencia: it.imagen_url || null,
    }));

    const { data: newPpto, error } = await supabase.from('presupuestos').insert({
      brief_id:        proforma.brief_id,
      cliente_id:      proforma.cliente_id,
      cliente:         proforma.cliente_nombre,
      nombre:          `${proforma.nombre} — ${opcion.nombre || 'Opción aprobada'}`,
      fecha_evento:    proforma.fecha_evento || null,
      ciudad:          proforma.ciudad,
      lugar:           proforma.lugar,
      personas:        proforma.personas,
      dias_evento:     proforma.dias_evento,
      fee_agencia:     proforma.fee_agencia,
      oh_pct:          proforma.oh_pct,
      bco_pct:         proforma.bco_pct,
      rebate_pct:      2,
      apply_rebate:    false,
      estado:          'borrador',
      ejecutivo_nombre: proforma.ejecutivo_nombre,
      ejecutivo_email:  proforma.ejecutivo_email,
      items,
      created_by:      userEmail,
    }).select().single();

    if (error) { showToast('Error: ' + error.message); return; }
    showToast('✅ Presupuesto creado desde proforma');
    setConverting(null);
    loadAll();
  }

  // ── Guardar proforma ───────────────────────────────────────
  async function saveProforma(pf) {
    if (!pf.nombre.trim()) { alert('El nombre es obligatorio'); return; }
    if (!pf.cliente_id)    { alert('Seleccioná un cliente'); return; }
    const pfClean = { ...pf, brief_id: pf.brief_id || null, cliente_id: pf.cliente_id || null };
    if (pf.id) {
      await supabase.from('proformas').update(pfClean).eq('id', pf.id);
      showToast('Proforma guardada ✓');
      loadAll();
    } else {
      const count = (await supabase.from('proformas').select('*',{count:'exact',head:true})).count || 0;
      const nom = `PF-${String(count+1).padStart(3,'0')}-${pf.cliente_nombre?.slice(0,10).toUpperCase()}-${new Date().getFullYear()}`;
      const { data: newPf } = await supabase.from('proformas').insert({ ...pfClean, nomenclatura: nom, created_by: userEmail }).select().single();
      showToast('Proforma guardada ✓');
      loadAll();
      // Quedarse en el editor con el id asignado
      if (newPf) setEditing(newPf);
    }
  }

  if (loading) return <div style={{ padding:'2rem', textAlign:'center', color:'#888' }}>Cargando proformas…</div>;

  // ── Vista editor ───────────────────────────────────────────
  if (editing !== null) {
    return <ProformaEditor
      initial={editing === 'new' ? null : editing}
      clientes={clientes} ejecutivos={ejecutivos} briefs={briefs} cfg={cfg}
      onSave={saveProforma} onCancel={()=>setEditing(null)}
    />;
  }

  const ESTADO_COLORS = { borrador:'#888', enviada:'#0d3b5e', aprobada:'#2e8b4e', cancelada:'#dc2626' };
  const ESTADO_LABELS = { borrador:'Borrador', enviada:'Enviada', aprobada:'Aprobada', cancelada:'Cancelada' };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <h2 style={{ fontSize:18, fontWeight:700, color:'#0d3b5e' }}>📋 Proformas</h2>
        <Btn onClick={()=>setEditing('new')}>+ Nueva proforma</Btn>
      </div>

      {proformas.length === 0 && (
        <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>Sin proformas aún</div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {proformas.map(pf => {
          const color = ESTADO_COLORS[pf.estado] || '#888';
          const totalOpciones = (pf.opciones||[]).length;
          const aprobada = pf.opcion_aprobada;
          return (
            <div key={pf.id} style={{ background:'#fff', border:'1px solid #e8e8e8', borderLeft:`4px solid ${color}`, borderRadius:'0 10px 10px 0', padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:8, justifyContent:'space-between' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontWeight:600, fontSize:15 }}>{pf.nombre}</span>
                    <span style={{ fontSize:11, padding:'2px 9px', borderRadius:999, background:color+'22', color, fontWeight:500 }}>{ESTADO_LABELS[pf.estado]||pf.estado}</span>
                    {aprobada && <span style={{ fontSize:11, padding:'2px 9px', borderRadius:999, background:'#e8f5ee', color:'#2e8b4e', fontWeight:500 }}>✅ Opción aprobada</span>}
                  </div>
                  {pf.nomenclatura && <div style={{ fontSize:10, color:'#8aa0b8', fontFamily:'monospace', marginTop:2 }}>{pf.nomenclatura}</div>}
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:5 }}>
                    {pf.cliente_nombre && <span style={{ fontSize:12, color:'#777' }}>🏢 {pf.cliente_nombre}</span>}
                    {pf.ejecutivo_nombre && <span style={{ fontSize:12, color:'#777' }}>👤 {pf.ejecutivo_nombre}</span>}
                    {pf.fecha_evento && <span style={{ fontSize:12, color:'#777' }}>📅 {fmtDate(pf.fecha_evento)}</span>}
                    <span style={{ fontSize:12, color:'#777' }}>📋 {totalOpciones} opción(es)</span>
                    {pf.brief_id && <span style={{ fontSize:12, color:'#7c3aed', cursor:'pointer', fontWeight:500 }} onClick={()=>setExpedienteId(pf.brief_id)}>📁 Ver expediente</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap' }}>
                  {aprobada && !['borrador'].includes(pf.estado) && (
                    <Btn size="xs" variant="green" onClick={()=>setConverting(pf)}>→ Crear presupuesto</Btn>
                  )}
                  <Btn size="xs" variant="secondary" onClick={()=>setEditing(pf)}>Editar</Btn>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal confirmar conversión */}
      <Modal open={!!converting} onClose={()=>setConverting(null)} title="Convertir a presupuesto"
        footer={<><Btn variant="secondary" onClick={()=>setConverting(null)}>Cancelar</Btn><Btn variant="green" onClick={()=>convertirAPresupuesto(converting)}>✅ Crear presupuesto</Btn></>}>
        {converting && (() => {
          const op = (converting.opciones||[]).find(o=>o.id===converting.opcion_aprobada);
          const t  = op ? calcOpcion(op, converting.oh_pct, converting.fee_agencia) : null;
          return (
            <div>
              <p style={{ fontSize:14, marginBottom:12 }}>Se creará un presupuesto en borrador con los ítems de la opción aprobada:</p>
              <div style={{ background:'#f8fafc', borderRadius:10, padding:'14px 16px', marginBottom:12 }}>
                <div style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:4 }}>{op?.nombre || 'Opción aprobada'}</div>
                <div style={{ fontSize:13, color:'#555' }}>
                  {(op?.items||[]).length} ítems · {t ? fmt(t.sinIva) : '—'} s/IVA
                </div>
              </div>
              <p style={{ fontSize:12, color:'#888' }}>Podés editar el presupuesto luego de crearlo.</p>
            </div>
          );
        })()}
      </Modal>

      {expedienteId && <ExpedientePanel briefId={expedienteId} onClose={()=>setExpedienteId(null)}/>}
      {toast && <div style={{ position:'fixed', bottom:24, right:24, background:'#0d3b5e', color:'#fff', padding:'10px 18px', borderRadius:10, fontSize:13, zIndex:999 }}>{toast}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// EDITOR DE PROFORMA
// ══════════════════════════════════════════════════════════════
function ProformaEditor({ initial, clientes, ejecutivos, briefs, cfg, onSave, onCancel }) {
  const [pf, setPf] = useState(() => initial || {
    nombre:'', cliente_id:'', cliente_nombre:'', ejecutivo_nombre:'', ejecutivo_email:'',
    brief_id:'', fecha_evento:'', ciudad:'Guayaquil', lugar:'', personas:0, dias_evento:1,
    fee_agencia: cfg.fee_agencia || 0, oh_pct: cfg.oh_pct || 15, bco_pct: cfg.bco_pct || 5.5,
    notas:'', estado:'borrador', opciones:[], opcion_aprobada:'',
  });
  const [saving, setSaving] = useState(false);

  function set(k, v) {
    setPf(prev => {
      const next = { ...prev, [k]: v };
      if (k === 'cliente_id') {
        const cl = clientes.find(c => c.id === v);
        next.cliente_nombre = cl?.nombre || '';
        next.brief_id = '';
      }
      if (k === 'brief_id' && v) {
        const br = briefs.find(b => b.id === v);
        if (br) {
          if (!next.fecha_evento) next.fecha_evento = br.fecha_evento || '';
          if (!next.lugar)        next.lugar        = br.lugar || '';
          if (!next.ciudad || next.ciudad === 'Guayaquil') next.ciudad = br.ciudad || 'Guayaquil';
          if (!next.personas) next.personas = br.pax || 0;
          if (!next.dias_evento || next.dias_evento === 1) next.dias_evento = br.dias_evento || 1;
        }
      }
      if (k === 'ejecutivo_nombre') {
        const ej = ejecutivos.find(e => e.nombre === v);
        next.ejecutivo_email = ej?.email || '';
      }
      return next;
    });
  }

  function addOpcion() {
    const ops = [...(pf.opciones||[]), { id:uid(), nombre:`Opción ${(pf.opciones||[]).length+1}`, items:[] }];
    setPf(p => ({ ...p, opciones:ops }));
  }
  function updateOpcion(id, data) {
    setPf(p => ({ ...p, opciones: p.opciones.map(o => o.id === id ? data : o) }));
  }
  function deleteOpcion(id) {
    setPf(p => ({ ...p, opciones: p.opciones.filter(o => o.id !== id), opcion_aprobada: p.opcion_aprobada === id ? '' : p.opcion_aprobada }));
  }
  function aprobarOpcion(id) {
    setPf(p => ({ ...p, opcion_aprobada: id, estado: 'aprobada' }));
  }

  async function handleSave() {
    setSaving(true);
    await onSave(pf);
    setSaving(false);
  }

  function generatePDF() {
    const html = buildPDFHtml(pf);
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  }

  const filteredBriefs = briefs.filter(b => !pf.cliente_id || b.cliente_id === pf.cliente_id);

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <button onClick={onCancel} style={{ background:'none', border:'1px solid #ddd', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>← Volver</button>
        <h2 style={{ fontSize:17, fontWeight:700, color:'#0d3b5e', flex:1 }}>{initial ? 'Editar proforma' : 'Nueva proforma'}</h2>
        <Btn variant="secondary" onClick={generatePDF}>📄 PDF cliente</Btn>
        <Btn onClick={handleSave} disabled={saving}>{saving?'Guardando...':'Guardar'}</Btn>
      </div>

      {/* Datos generales */}
      <div style={{ background:'#fff', border:'1px solid #e8e8e8', borderRadius:12, padding:'18px 20px', marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#0d3b5e', marginBottom:14 }}>Datos generales</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={lbl}>Nombre de la proforma *</label>
            <input value={pf.nombre} onChange={e=>set('nombre',e.target.value)} style={{...inp,width:'100%'}} placeholder="Ej: Propuesta decoración gala anual"/>
          </div>
          <div>
            <label style={lbl}>Cliente *</label>
            <select value={pf.cliente_id} onChange={e=>set('cliente_id',e.target.value)} style={{...inp,width:'100%'}}>
              <option value="">Seleccioná...</option>
              {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Vincular a proyecto</label>
            <select value={pf.brief_id||''} onChange={e=>set('brief_id',e.target.value)} style={{...inp,width:'100%'}}>
              <option value="">Sin vincular</option>
              {filteredBriefs.map(b=><option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Ejecutivo</label>
            <select value={pf.ejecutivo_nombre||''} onChange={e=>set('ejecutivo_nombre',e.target.value)} style={{...inp,width:'100%'}}>
              <option value="">Sin asignar</option>
              {ejecutivos.map(e=><option key={e.id} value={e.nombre}>{e.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Estado</label>
            <select value={pf.estado} onChange={e=>set('estado',e.target.value)} style={{...inp,width:'100%'}}>
              {['borrador','enviada','aprobada','cancelada'].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Fecha del evento</label>
            <input type="date" value={pf.fecha_evento||''} onChange={e=>set('fecha_evento',e.target.value||null)} style={{...inp,width:'100%'}}/>
          </div>
          <div>
            <label style={lbl}>Ciudad</label>
            <input value={pf.ciudad||''} onChange={e=>set('ciudad',e.target.value)} style={{...inp,width:'100%'}}/>
          </div>
          <div>
            <label style={lbl}>Lugar / Venue</label>
            <input value={pf.lugar||''} onChange={e=>set('lugar',e.target.value)} style={{...inp,width:'100%'}}/>
          </div>
          <div>
            <label style={lbl}>PAX</label>
            <input type="number" value={pf.personas||''} onChange={e=>set('personas',e.target.value)} style={{...inp,width:'100%'}} min="0"/>
          </div>
          <div>
            <label style={lbl}>OH %</label>
            <input type="number" value={pf.oh_pct||''} onChange={e=>set('oh_pct',Number(e.target.value))} style={{...inp,width:'100%'}} step="0.1"/>
          </div>
          <div>
            <label style={lbl}>Fee agencia %</label>
            <input type="number" value={pf.fee_agencia||''} onChange={e=>set('fee_agencia',Number(e.target.value))} style={{...inp,width:'100%'}} step="0.1"/>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={lbl}>Notas</label>
            <textarea value={pf.notas||''} onChange={e=>set('notas',e.target.value)} style={{...inp,width:'100%',minHeight:60,resize:'vertical'}}/>
          </div>
        </div>
      </div>

      {/* Opciones */}
      <div style={{ marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
        <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', flex:1 }}>Opciones</h3>
        <Btn size="sm" variant="secondary" onClick={addOpcion}>+ Agregar opción</Btn>
      </div>

      {(pf.opciones||[]).length === 0 && (
        <div style={{ textAlign:'center', padding:'2rem', color:'#aaa', fontSize:13, border:'2px dashed #e8e8e8', borderRadius:12, marginBottom:16 }}>
          No hay opciones aún. Hacé clic en "+ Agregar opción" para comenzar.
        </div>
      )}

      {(pf.opciones||[]).map((op, i) => (
        <OpcionEditor key={op.id} opcion={op} index={i}
          oh_pct={pf.oh_pct} fee_agencia={pf.fee_agencia}
          aprobada={pf.opcion_aprobada === op.id}
          onChange={data=>updateOpcion(op.id, data)}
          onDelete={()=>deleteOpcion(op.id)}
          onAprobar={()=>aprobarOpcion(op.id)}
        />
      ))}

      <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
        <Btn variant="secondary" onClick={onCancel}>Cancelar</Btn>
        <Btn variant="secondary" onClick={generatePDF}>📄 PDF cliente</Btn>
        <Btn onClick={handleSave} disabled={saving}>{saving?'Guardando...':'Guardar proforma'}</Btn>
      </div>
    </div>
  );
}

// ── Generador de PDF cliente ──────────────────────────────────
function buildPDFHtml(pf) {
  const opciones = pf.opciones || [];

  function fmtN(n) { return '$' + (Number(n)||0).toLocaleString('es-EC', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  function fmtD(s) { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; }

  const opcionesHtml = opciones.map((op, idx) => {
    let subtotalPrecio = 0;
    const itemsHtml = (op.items||[]).map(it => {
      const qty  = Number(it.cantidad||0);
      const dias = Number(it.dias||1);
      const pu   = Number(it.precio_unit||0);
      const ptotal = qty * dias * pu;
      const fee  = ptotal * ((pf.fee_agencia||0)/100);
      const sinIva = ptotal + fee;
      const iva  = sinIva * 0.15;
      const total = sinIva + iva;
      subtotalPrecio += ptotal;
      return `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:7px 6px; font-size:11px; color:#666;">${it.subcategoria||''}</td>
          <td style="padding:7px 6px; font-size:12px; font-weight:600;">${it.nombre||''}</td>
          <td style="padding:7px 6px; font-size:11px; color:#555;">${it.descripcion||''}</td>
          <td style="padding:7px 4px; text-align:center;">${it.imagen_url ? `<img src="${it.imagen_url}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;"/>` : ''}</td>
          <td style="padding:7px 6px; text-align:center; font-size:12px;">${qty}</td>
          <td style="padding:7px 6px; text-align:center; font-size:12px;">${dias}</td>
          <td style="padding:7px 6px; text-align:right; font-size:12px;">${fmtN(pu)}</td>
          <td style="padding:7px 6px; text-align:right; font-size:12px; font-weight:600;">${fmtN(ptotal)}</td>
          <td style="padding:7px 6px; text-align:right; font-size:12px; color:#888;">${fmtN(fee)}</td>
          <td style="padding:7px 6px; text-align:right; font-size:12px; color:#0d3b5e; font-weight:600;">${fmtN(sinIva)}</td>
          <td style="padding:7px 6px; text-align:right; font-size:12px;">${fmtN(iva)}</td>
          <td style="padding:7px 6px; text-align:right; font-size:13px; font-weight:700; color:#0d3b5e;">${fmtN(total)}</td>
        </tr>`;
    }).join('');

    const fee     = subtotalPrecio * ((pf.fee_agencia||0)/100);
    const sinIva  = subtotalPrecio + fee;
    const iva     = sinIva * 0.15;
    const total   = sinIva + iva;

    return `
      <div style="margin-bottom:28px; border:1px solid #e8e8e8; border-radius:10px; overflow:hidden; page-break-inside:avoid;">
        <div style="background:#0d3b5e; padding:10px 16px;">
          <span style="color:#fff; font-size:14px; font-weight:700;">Opción ${idx+1}${op.nombre?' — '+op.nombre:''}</span>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:12px; min-width:800px;">
            <thead>
              <tr style="background:#f0f4f8;">
                <th style="padding:7px 6px; text-align:left; font-size:10px; color:#666; white-space:nowrap;">Subcategoría</th>
                <th style="padding:7px 6px; text-align:left; font-size:10px; color:#666; white-space:nowrap;">Ítem</th>
                <th style="padding:7px 6px; text-align:left; font-size:10px; color:#666; white-space:nowrap;">Descripción</th>
                <th style="padding:7px 4px; text-align:center; font-size:10px; color:#666; white-space:nowrap;">Imagen</th>
                <th style="padding:7px 6px; text-align:center; font-size:10px; color:#666; white-space:nowrap;">Cant.</th>
                <th style="padding:7px 6px; text-align:center; font-size:10px; color:#666; white-space:nowrap;">Días</th>
                <th style="padding:7px 6px; text-align:right; font-size:10px; color:#666; white-space:nowrap;">P. Unitario</th>
                <th style="padding:7px 6px; text-align:right; font-size:10px; color:#666; white-space:nowrap;">P. Total</th>
                <th style="padding:7px 6px; text-align:right; font-size:10px; color:#888; white-space:nowrap;">Fee</th>
                <th style="padding:7px 6px; text-align:right; font-size:10px; color:#0d3b5e; white-space:nowrap;">Subtotal s/IVA</th>
                <th style="padding:7px 6px; text-align:right; font-size:10px; color:#666; white-space:nowrap;">IVA</th>
                <th style="padding:7px 6px; text-align:right; font-size:10px; color:#0d3b5e; white-space:nowrap;">Total</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
        </div>
        <div style="padding:10px 16px; background:#f8fafc; border-top:1px solid #eee; display:flex; justify-content:flex-end; gap:20px; flex-wrap:wrap;">
          ${[['Subtotal precio',fmtN(subtotalPrecio),'#555'],['Fee agencia',fmtN(fee),'#888'],['Subtotal s/IVA',fmtN(sinIva),'#0d3b5e'],['IVA 15%',fmtN(iva),'#555'],['TOTAL',fmtN(total),'#0d3b5e']].map(([l,v,col])=>`
            <div style="text-align:right;">
              <div style="font-size:9px; color:#aaa; margin-bottom:2px; text-transform:uppercase;">${l}</div>
              <div style="font-size:14px; font-weight:700; color:${col};">${v}</div>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');

  const headerFields = [
    ['Cliente',    pf.cliente_nombre],
    ['Ejecutivo',  pf.ejecutivo_nombre],
    ['Fecha evento', pf.fecha_evento ? fmtD(pf.fecha_evento) : null],
    ['Lugar',      pf.lugar],
    ['Ciudad',     pf.ciudad],
    ['PAX',        pf.personas > 0 ? `${pf.personas} personas` : null],
    ['Días',       pf.dias_evento > 1 ? `${pf.dias_evento} días` : null],
  ].filter(([,v]) => v);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Proforma — ${pf.nombre}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;color:#1a1a2e;background:#f5f5f5;}@media print{body{background:#fff;}.no-print{display:none;}}</style>
  </head><body>
  <button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;background:#0d3b5e;color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:13px;cursor:pointer;">⬇ PDF</button>
  <div style="max-width:1000px;margin:0 auto;background:#fff;min-height:100vh;">
  <div style="background:#0d3b5e;padding:20px 32px;display:flex;justify-content:space-between;align-items:center;">
    <div style="color:#fff;font-size:22px;font-style:italic;font-weight:900;">matilda <span style="font-size:10px;color:#3dbfb8;letter-spacing:2px;font-style:normal;font-weight:400;">EVENT DESIGNERS</span></div>
    <div style="text-align:right;">
      <div style="color:#3dbfb8;font-size:9px;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px;">Propuesta Comercial</div>
      <div style="color:rgba(255,255,255,0.8);font-size:11px;">${pf.nomenclatura||''}</div>
    </div>
  </div>
  <div style="background:#c8264a;height:3px;"></div>
  <div style="padding:16px 32px;background:#f8fafc;border-bottom:1px solid #dde6ef;">
    <div style="font-size:20px;font-weight:700;color:#0d3b5e;margin-bottom:12px;">${pf.nombre}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
      ${headerFields.map(([l,v])=>`
        <div>
          <div style="font-size:9px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px;">${l}</div>
          <div style="font-size:13px;font-weight:600;color:#0d3b5e;">${v}</div>
        </div>`).join('')}
    </div>
  </div>
  <div style="padding:20px 32px;">${opcionesHtml}</div>
  <div style="margin:0 32px 24px;background:#fdf8ee;border:1px solid #e8d8a0;border-radius:6px;padding:12px 16px;">
    <div style="font-size:10px;color:#7a5500;line-height:1.7;"><strong>NOTA:</strong> LA PRESENTE COTIZACIÓN TIENE UNA VIGENCIA DE 30 DÍAS CALENDARIO A PARTIR DE LA FECHA DE EMISIÓN.<br>VENCIDO ESTE PLAZO, LOS VALORES PODRÁN SER AJUSTADOS SEGÚN LAS CONDICIONES DEL MERCADO.</div>
  </div>
  <div style="background:#0d3b5e;padding:12px 32px;text-align:center;">
    <div style="font-size:10px;color:#3dbfb8;font-style:italic;">"Donde la estrategia se convierte en experiencia."</div>
  </div>
  </div></body></html>`;
}
