import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { canCreateBrief, canEditBrief, canDeleteBrief, ESTADOS_BRIEF, ESTADOS_BRIEF_LABELS, ESTADOS_BRIEF_COLORS } from '../roles';
import ExpedientePanel from './ExpedientePanel';

const TIPOS_EVENTO = ['Corporativo', 'Lanzamiento', 'Fiesta', 'Congreso', 'Capacitación', 'Otro'];

function fmtDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
function getDays(dateStr) {
  if (!dateStr) return 999;
  const t = new Date(); t.setHours(0,0,0,0);
  const [y,m,d] = dateStr.split('-').map(Number);
  return Math.ceil((new Date(y,m-1,d) - t) / 86400000);
}

const lbl = { fontSize:12, fontWeight:500, color:'#666', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:5, display:'block' };
const inp = { fontFamily:'inherit', fontSize:13, padding:'9px 12px', border:'1px solid #ddd', borderRadius:9, width:'100%', outline:'none', color:'#1a1a1a' };
const sel = { ...inp };

function StatusChip({ estado }) {
  const color = ESTADOS_BRIEF_COLORS[estado] || '#888';
  const label = ESTADOS_BRIEF_LABELS[estado] || estado;
  const bgs = { '#8aa0b8':'#eef2f7', '#e8a020':'#fdf5e8', '#c8264a':'#fde8ec', '#2e8b4e':'#e8f5ee' };
  const bg = bgs[color] || '#f3f4f6';
  return (
    <span style={{ fontSize:11, padding:'2px 9px', borderRadius:999, fontWeight:500, background:bg, color }}>{label}</span>
  );
}

function DaysChip({ days, estado }) {
  if (estado === 'entregado') return null;
  if (days < 0)  return <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:'#fee2e2', color:'#991b1b', fontWeight:500 }}>Venció hace {Math.abs(days)}d</span>;
  if (days === 0) return <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:'#fef9c3', color:'#854d0e', fontWeight:500 }}>Vence hoy</span>;
  if (days <= 3)  return <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:'#fef9c3', color:'#854d0e', fontWeight:500 }}>En {days}d</span>;
  return null;
}

// ── Modal ────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(2px)' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:620, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 4px 24px rgba(0,0,0,.15)', border:'1px solid #e5e5e5' }}>
        <div style={{ padding:'18px 22px 14px', borderBottom:'1px solid #eee', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:15, fontWeight:600 }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#aaa' }}>×</button>
        </div>
        <div style={{ padding:'18px 22px' }}>{children}</div>
        {footer && <div style={{ padding:'13px 22px', borderTop:'1px solid #eee', display:'flex', justifyContent:'flex-end', gap:8 }}>{footer}</div>}
      </div>
    </div>
  );
}

function Btn({ onClick, variant='primary', size='md', disabled, children }) {
  const base = { display:'inline-flex', alignItems:'center', gap:6, borderRadius:9, fontFamily:'inherit', fontWeight:500, cursor:disabled?'not-allowed':'pointer', border:'1px solid transparent', transition:'all .15s', opacity:disabled?.6:1 };
  const variants = { primary:{ background:'#0d3b5e', color:'#fff' }, secondary:{ background:'#fff', color:'#333', borderColor:'#ddd' }, danger:{ background:'#fee2e2', color:'#991b1b', borderColor:'#fca5a5' } };
  const sizes = { sm:{ padding:'5px 12px', fontSize:12 }, md:{ padding:'8px 16px', fontSize:13 }, xs:{ padding:'3px 9px', fontSize:11 } };
  return <button onClick={onClick} disabled={disabled} style={{...base,...variants[variant],...sizes[size]}}>{children}</button>;
}

// ── Formulario Brief ─────────────────────────────────────────
function BriefForm({ clientes, ejecutivos, onSave, onCancel, initial = {}, isEdit = false }) {
  const [form, setForm] = useState({
    nombre: '', cliente_id: '', cliente_nombre: '', tipo_evento: '',
    fecha_entrega: '', fecha_evento: '', ciudad: 'Guayaquil', lugar: '',
    horario: '', pax: '', dias_evento: 1, descripcion: '', notas: '',
    responsable: '', estado: 'pendiente', presupuesto_estimado: '',
    archivo_nombre: '', archivo_url: '',
    ...initial,
  });
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(initial.archivo_nombre || null);
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const safeName = file.name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
      .replace(/ñ/gi, 'n').replace(/ü/gi, 'u')          // ñ → n
      .replace(/[^a-zA-Z0-9._-]/g, '_');                // resto → _
    const fileName = `${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from('project-files').upload(fileName, file);
    if (error) { alert('Error al subir: ' + error.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('project-files').getPublicUrl(fileName);
    set('archivo_nombre', file.name);
    set('archivo_url', urlData.publicUrl);
    setUploadedFile(file.name);
    setUploading(false);
  }

  async function handleSubmit() {
    if (!form.nombre.trim()) { alert('El nombre es obligatorio'); return; }
    if (!form.cliente_id)    { alert('Seleccioná un cliente'); return; }
    if (!form.fecha_entrega) { alert('La fecha de entrega es obligatoria'); return; }
    setSaving(true);
    const cl = clientes.find(c => c.id === form.cliente_id);
    await onSave({
      ...form,
      cliente_nombre:       cl?.nombre || form.cliente_nombre,
      pax:                  form.pax ? Number(form.pax) : 0,
      presupuesto_estimado: form.presupuesto_estimado ? Number(form.presupuesto_estimado) : null,
      fecha_evento:         form.fecha_evento || null,
    });
    setSaving(false);
  }

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={lbl}>Nombre del proyecto <span style={{color:'#dc2626'}}>*</span></label>
          <input value={form.nombre} onChange={e=>set('nombre',e.target.value)} style={inp} placeholder="Ej: Lanzamiento Acme 2026"/>
        </div>
        <div>
          <label style={lbl}>Cliente <span style={{color:'#dc2626'}}>*</span></label>
          <select value={form.cliente_id} onChange={e=>set('cliente_id',e.target.value)} style={sel}>
            <option value="">Seleccioná...</option>
            {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Presupuesto estimado (USD)</label>
          <input type="number" value={form.presupuesto_estimado||''} onChange={e=>set('presupuesto_estimado',e.target.value)} style={inp} min="0" placeholder="0"/>
        </div>
        <div>
          <label style={lbl}>Responsable</label>
          <select value={form.responsable} onChange={e=>set('responsable',e.target.value)} style={sel}>
            <option value="">Sin asignar</option>
            {ejecutivos.map(u=><option key={u.id} value={u.nombre}>{u.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Estado</label>
          <select value={form.estado} onChange={e=>set('estado',e.target.value)} style={sel}>
            {ESTADOS_BRIEF.map(e=><option key={e} value={e}>{ESTADOS_BRIEF_LABELS[e]}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Fecha de entrega <span style={{color:'#dc2626'}}>*</span></label>
          <input type="date" value={form.fecha_entrega} onChange={e=>set('fecha_entrega',e.target.value)} style={inp}/>
        </div>
        <div>
          <label style={lbl}>Fecha del evento</label>
          <input type="date" value={form.fecha_evento} onChange={e=>set('fecha_evento',e.target.value)} style={inp}/>
        </div>
        <div>
          <label style={lbl}>Ciudad</label>
          <input value={form.ciudad} onChange={e=>set('ciudad',e.target.value)} style={inp} placeholder="Guayaquil"/>
        </div>
        <div>
          <label style={lbl}>Lugar / Venue</label>
          <input value={form.lugar} onChange={e=>set('lugar',e.target.value)} style={inp} placeholder="Ej: Hotel Wyndham"/>
        </div>
        <div>
          <label style={lbl}>PAX estimado</label>
          <input type="number" value={form.pax} onChange={e=>set('pax',e.target.value)} style={inp} min="0" placeholder="0"/>
        </div>
        <div>
          <label style={lbl}>Días de evento</label>
          <input type="number" value={form.dias_evento} onChange={e=>set('dias_evento',e.target.value)} style={inp} min="1"/>
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={lbl}>Descripción / Objetivos</label>
          <textarea value={form.descripcion} onChange={e=>set('descripcion',e.target.value)} style={{...inp, minHeight:80, resize:'vertical'}} placeholder="Objetivos del evento, contexto, referencias..."/>
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={lbl}>Notas internas</label>
          <textarea value={form.notas} onChange={e=>set('notas',e.target.value)} style={{...inp, minHeight:60, resize:'vertical'}} placeholder="Observaciones del equipo..."/>
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={lbl}>Adjuntar brief (PDF / PPT)</label>
          <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'1.25rem', border:'1.5px dashed #ddd', borderRadius:10, cursor:uploading?'not-allowed':'pointer', background:'#fafafa' }}>
            <input type="file" accept=".pdf,.ppt,.pptx,.doc,.docx" onChange={handleFile} style={{ display:'none' }} disabled={uploading}/>
            {uploading ? <div style={{ fontSize:13, color:'#888' }}>⏳ Subiendo...</div>
              : uploadedFile
                ? <div style={{ textAlign:'center' }}><div style={{ fontSize:20, marginBottom:4 }}>✅</div><div style={{ fontSize:13, color:'#166534', fontWeight:500 }}>{uploadedFile}</div><div style={{ fontSize:11, color:'#888', marginTop:2 }}>Clic para cambiar</div></div>
                : <div style={{ textAlign:'center' }}><div style={{ fontSize:20, marginBottom:4 }}>📎</div><div style={{ fontSize:13, color:'#555' }}>Clic para adjuntar</div><div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>PDF, PPT, DOC</div></div>
            }
          </label>
        </div>
      </div>
      <div style={{ display:'flex', gap:8, marginTop:'1.25rem', justifyContent:'flex-end' }}>
        <Btn variant="secondary" onClick={onCancel}>Cancelar</Btn>
        <Btn onClick={handleSubmit} disabled={saving||uploading}>{saving?'Guardando...':isEdit?'Guardar cambios':'Crear proyecto'}</Btn>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL BRIEFS
// ══════════════════════════════════════════════════════════════
export default function Briefs({ userRole, userEmail }) {
  const [briefs, setBriefs]         = useState([]);
  const [clientes, setClientes]     = useState([]);
  const [ejecutivos, setEjecutivos] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [view, setView]             = useState('list'); // list | form
  const [editBrief, setEditBrief]   = useState(null);
  const [detalle, setDetalle]       = useState(null);
  const [expedienteId, setExpedienteId] = useState(null);
  const [modalCambios, setModalCambios] = useState(null); // { brief, nuevoEstado }
  const [notasCambio, setNotasCambio] = useState('');
  const [filter, setFilter]         = useState('todos');
  const [clientFilter, setClientFilter] = useState('');
  const [search, setSearch]         = useState('');

  const canCreate = canCreateBrief(userRole);
  const canEdit   = canEditBrief(userRole);
  const canDelete = canDeleteBrief(userRole);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: br }, { data: cl }, { data: ej }] = await Promise.all([
      supabase.from('briefs').select('*').order('created_at', { ascending: false }),
      supabase.from('clientes').select('*').eq('activo', true).order('nombre'),
      supabase.from('ejecutivos').select('*').order('nombre'),
    ]);
    setBriefs(br || []);
    setClientes(cl || []);
    setEjecutivos(ej || []);
    setLoading(false);
  }

  async function saveBrief(data) {
    if (editBrief) {
      await supabase.from('briefs').update(data).eq('id', editBrief.id);
      setEditBrief(prev => ({ ...prev, ...data }));
    } else {
      const { data: newBrief } = await supabase.from('briefs').insert({ ...data, created_by: userEmail }).select().single();
      if (newBrief) setEditBrief(newBrief);
    }
    // Nos quedamos en el formulario para seguir editando
    loadAll();
  }

  async function updateEstado(id, estado, estadoAnterior) {
    if (estado === 'con_cambios' && estadoAnterior === 'entregado') {
      const brief = briefs.find(b => b.id === id);
      setModalCambios({ brief, nuevoEstado: estado });
      setNotasCambio('');
      return;
    }
    await supabase.from('briefs').update({ estado }).eq('id', id);
    setBriefs(prev => prev.map(b => b.id === id ? { ...b, estado } : b));
  }

  async function confirmarCambios() {
    if (!modalCambios) return;
    const { brief, nuevoEstado } = modalCambios;
    await supabase.from('briefs').update({ estado: nuevoEstado }).eq('id', brief.id);
    // Guardar registro del cambio
    await supabase.from('cambios_brief').insert({
      brief_id: brief.id,
      estado_anterior: brief.estado,
      estado_nuevo: nuevoEstado,
      notas_cambio: notasCambio,
      created_by: userEmail,
    });
    setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, estado: nuevoEstado } : b));
    setModalCambios(null);
    setNotasCambio('');
  }

  async function deleteBrief(id) {
    if (!confirm('¿Eliminar este proyecto?')) return;
    await supabase.from('briefs').delete().eq('id', id);
    setBriefs(prev => prev.filter(b => b.id !== id));
  }

  // Filtrado
  const overdue = briefs.filter(b => b.estado !== 'entregado' && getDays(b.fecha_entrega) < 0);
  const soon    = briefs.filter(b => b.estado !== 'entregado' && getDays(b.fecha_entrega) >= 0 && getDays(b.fecha_entrega) <= 3);
  const done    = briefs.filter(b => b.estado === 'entregado');

  const uniqueClients = [...new Set(briefs.map(b => b.cliente_nombre).filter(Boolean))].sort();

  const filtered = briefs.filter(b => {
    const s = search.toLowerCase();
    const matchSearch = !s || b.nombre.toLowerCase().includes(s) || (b.cliente_nombre||'').toLowerCase().includes(s);
    const matchClient = !clientFilter || b.cliente_nombre === clientFilter;
    if (!matchSearch || !matchClient) return false;
    if (filter === 'todos') return true;
    if (filter === 'vencido') return b.estado !== 'entregado' && getDays(b.fecha_entrega) < 0;
    if (filter === 'vence_pronto') { const d = getDays(b.fecha_entrega); return b.estado !== 'entregado' && d >= 0 && d <= 3; }
    return b.estado === filter;
  }).sort((a, b) => {
    const da = getDays(a.fecha_entrega), db = getDays(b.fecha_entrega);
    const aV = a.estado !== 'entregado' && da < 0;
    const bV = b.estado !== 'entregado' && db < 0;
    if (aV && !bV) return -1; if (!aV && bV) return 1;
    if (a.estado !== 'entregado' && b.estado === 'entregado') return -1;
    if (a.estado === 'entregado' && b.estado !== 'entregado') return 1;
    return da - db;
  });

  if (loading) return <div style={{ padding:'2rem', textAlign:'center', color:'#888' }}>Cargando proyectos…</div>;

  // ── Formulario ────────────────────────────────────────────
  if (view === 'form') return (
    <div>
      <div style={{ fontSize:16, fontWeight:500, marginBottom:'1rem' }}>{editBrief ? 'Editar proyecto' : 'Nuevo proyecto'}</div>
      <BriefForm
        clientes={clientes} ejecutivos={ejecutivos}
        initial={editBrief || {}}
        isEdit={!!editBrief}
        onSave={saveBrief}
        onCancel={() => { setView('list'); setEditBrief(null); }}
      />
    </div>
  );

  // ── Lista ─────────────────────────────────────────────────
  return (
    <div>
      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:'1.25rem' }}>
        {[
          { label:'Total', value:briefs.length, color:'#1a1a1a', id:'todos' },
          { label:'Vencidos', value:overdue.length, color:'#dc2626', id:'vencido' },
          { label:'Vence pronto', value:soon.length, color:'#d97706', id:'vence_pronto' },
          { label:'Entregados', value:done.length, color:'#16a34a', id:'entregado' },
        ].map(s => (
          <div key={s.id} onClick={()=>setFilter(f=>f===s.id?'todos':s.id)} style={{ background:filter===s.id?'#1a1a1a':'#fff', border:filter===s.id?'2px solid #1a1a1a':'1px solid #e8e8e8', borderRadius:10, padding:'12px 14px', cursor:'pointer', transition:'all .15s' }}>
            <div style={{ fontSize:11, color:filter===s.id?'#ccc':'#888', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:22, fontWeight:500, color:filter===s.id?'#fff':s.color }}>{s.value}</div>
            {filter===s.id && <div style={{ fontSize:10, color:'#999', marginTop:3 }}>Clic para quitar filtro</div>}
          </div>
        ))}
      </div>

      {overdue.length > 0 && filter !== 'entregado' && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:9, padding:'10px 14px', marginBottom:'1rem', fontSize:13, color:'#991b1b' }}>
          ⚠ {overdue.length} proyecto{overdue.length>1?'s':''} vencido{overdue.length>1?'s':''}. Actualizá el estado si ya fueron entregados.
        </div>
      )}

      {/* Filtros */}
      <div style={{ display:'flex', gap:6, marginBottom:'1rem', flexWrap:'wrap', alignItems:'center' }}>
        {['todos','pendiente','en_progreso','con_cambios','entregado','vence_pronto'].map(f => (
          <button key={f} onClick={()=>setFilter(f)} style={{ padding:'4px 12px', borderRadius:999, border:'1px solid', fontSize:12, cursor:'pointer', fontFamily:'inherit', background:filter===f?'#1a1a1a':'transparent', color:filter===f?'#fff':'#666', borderColor:filter===f?'#1a1a1a':'#ddd' }}>
            {f==='todos'?'Todos':f==='vence_pronto'?'Vence pronto':ESTADOS_BRIEF_LABELS[f]||f}
          </button>
        ))}
        <select value={clientFilter} onChange={e=>setClientFilter(e.target.value)} style={{ padding:'4px 10px', fontSize:12, border:'1px solid #ddd', borderRadius:999, background:clientFilter?'#1a1a1a':'#fff', color:clientFilter?'#fff':'#666', cursor:'pointer', fontFamily:'inherit' }}>
          <option value="">Todos los clientes</option>
          {uniqueClients.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..." style={{ marginLeft:'auto', width:160, padding:'5px 10px', border:'1px solid #ddd', borderRadius:8, fontSize:13, fontFamily:'inherit' }}/>
        {canCreate && <Btn size="sm" onClick={()=>setView('form')}>+ Nuevo proyecto</Btn>}
      </div>

      {/* Lista */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filtered.length === 0 && <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>No hay proyectos para mostrar</div>}
        {filtered.map(b => {
          const days = getDays(b.fecha_entrega);
          const borderColor = b.estado==='entregado'?'#86efac':days<0?'#fca5a5':days<=3?'#fcd34d':'#86efac';
          return (
            <div key={b.id} style={{ background:'#fff', border:'1px solid #e8e8e8', borderLeft:`4px solid ${borderColor}`, borderRadius:'0 10px 10px 0', padding:'14px 16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontWeight:500, fontSize:15 }}>{b.nombre}</span>
                    <StatusChip estado={b.estado}/>
                    <DaysChip days={days} estado={b.estado}/>
                  </div>
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:5 }}>
                    {b.responsable    && <span style={{ fontSize:12, color:'#777' }}>👤 {b.responsable}</span>}
                    {b.cliente_nombre && <span style={{ fontSize:12, color:'#777' }}>🏢 {b.cliente_nombre}</span>}
                    {b.fecha_entrega  && <span style={{ fontSize:12, color:'#777' }}>📅 {fmtDate(b.fecha_entrega)}</span>}
                    {b.tipo_evento    && <span style={{ fontSize:12, color:'#777' }}>🎯 {b.tipo_evento}</span>}
                    {b.pax > 0        && <span style={{ fontSize:12, color:'#777' }}>👥 {b.pax} PAX</span>}
                  </div>
                  {b.notas && <div style={{ fontSize:12, color:'#888', marginTop:4, fontStyle:'italic' }}>"{b.notas}"</div>}
                  <div style={{ display:'flex', gap:10, marginTop:4, flexWrap:'wrap' }}>
                    {b.descripcion && (
                      <span style={{ fontSize:12, color:'#2563eb', cursor:'pointer' }} onClick={()=>setDetalle(b)}>Ver brief</span>
                    )}
                    {b.archivo_url && (
                      <a href={b.archivo_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'#2563eb', textDecoration:'none' }}>📎 {b.archivo_nombre} ↗</a>
                    )}
                    <span style={{ fontSize:12, color:'#7c3aed', cursor:'pointer', fontWeight:500 }} onClick={()=>setExpedienteId(b.id)}>📁 Ver expediente</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                  {canEdit ? (
                    <>
                      <select value={b.estado} onChange={e=>updateEstado(b.id,e.target.value,b.estado)} style={{ fontSize:12, padding:'4px 8px', border:'1px solid #ddd', borderRadius:7, background:'#fff', color:'#1a1a1a', width:'auto', fontFamily:'inherit' }}>
                        {ESTADOS_BRIEF.map(e=><option key={e} value={e}>{ESTADOS_BRIEF_LABELS[e]}</option>)}
                      </select>
                      <button onClick={()=>{ setEditBrief(b); setView('form'); }} style={{ padding:'4px 10px', fontSize:12, borderRadius:7, border:'1px solid #ddd', background:'transparent', color:'#555', cursor:'pointer', fontFamily:'inherit' }}>Editar</button>
                      {canDelete && <button onClick={()=>deleteBrief(b.id)} style={{ padding:'4px 10px', fontSize:12, borderRadius:7, border:'1px solid #ddd', background:'transparent', color:'#dc2626', cursor:'pointer', fontFamily:'inherit' }}>✕</button>}
                    </>
                  ) : (
                    <StatusChip estado={b.estado}/>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal detalle brief */}
      <Modal open={!!detalle} onClose={()=>setDetalle(null)} title={detalle?.nombre || ''} footer={<Btn variant="secondary" onClick={()=>setDetalle(null)}>Cerrar</Btn>}>
        {detalle && (
          <div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
              <StatusChip estado={detalle.estado}/>
              {detalle.tipo_evento && <span style={{ fontSize:11, padding:'2px 9px', borderRadius:999, background:'#e0f2fe', color:'#0369a1', fontWeight:500 }}>{detalle.tipo_evento}</span>}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              {[
                ['Cliente', detalle.cliente_nombre],
                ['Responsable', detalle.responsable],
                ['Entrega', fmtDate(detalle.fecha_entrega)],
                ['Evento', fmtDate(detalle.fecha_evento)],
                ['Ciudad', detalle.ciudad],
                ['Lugar', detalle.lugar],
                ['PAX', detalle.pax],
                ['Días', detalle.dias_evento],
              ].map(([k,v])=>v ? <div key={k}><div style={{ fontSize:11, color:'#888', marginBottom:3 }}>{k}</div><div style={{ fontSize:13, fontWeight:500 }}>{v}</div></div> : null)}
            </div>
            {detalle.descripcion && <>
              <div style={{ height:1, background:'#eee', margin:'12px 0' }}/>
              <div style={{ fontSize:11, color:'#888', marginBottom:5 }}>Descripción / Objetivos</div>
              <div style={{ fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{detalle.descripcion}</div>
            </>}
            {detalle.notas && <>
              <div style={{ height:1, background:'#eee', margin:'12px 0' }}/>
              <div style={{ fontSize:11, color:'#888', marginBottom:5 }}>Notas internas</div>
              <div style={{ fontSize:13, lineHeight:1.7 }}>{detalle.notas}</div>
            </>}
            {detalle.archivo_url && <>
              <div style={{ height:1, background:'#eee', margin:'12px 0' }}/>
              <a href={detalle.archivo_url} target="_blank" rel="noreferrer" style={{ fontSize:13, color:'#2563eb' }}>📎 {detalle.archivo_nombre} ↗</a>
            </>}
          </div>
        )}
      </Modal>

      {expedienteId && <ExpedientePanel briefId={expedienteId} onClose={()=>setExpedienteId(null)}/>}

      {/* Modal cambios solicitados */}
      {modalCambios && (
        <div onClick={()=>setModalCambios(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:480, padding:24, boxShadow:'0 4px 24px rgba(0,0,0,.15)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#c8264a', marginBottom:4 }}>📝 Cambios solicitados</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:16 }}>
              El proyecto <strong>{modalCambios.brief?.nombre}</strong> pasará de "Entregado" a "Con cambios". Anotá qué cambios se solicitaron:
            </div>
            <textarea
              value={notasCambio}
              onChange={e=>setNotasCambio(e.target.value)}
              placeholder="Describí los cambios solicitados por el cliente..."
              style={{ width:'100%', minHeight:100, padding:'10px 12px', border:'1px solid #ddd', borderRadius:9, fontSize:13, fontFamily:'inherit', resize:'vertical', outline:'none', boxSizing:'border-box' }}
              autoFocus
            />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:14 }}>
              <Btn variant="secondary" onClick={()=>setModalCambios(null)}>Cancelar</Btn>
              <Btn onClick={confirmarCambios}>Confirmar cambios</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
