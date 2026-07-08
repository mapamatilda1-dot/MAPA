import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { notifyTareaAsignada } from '../notifyHelper';
import {
  canCreateTarea, canDeleteTarea,
  PRIORIDADES_TAREA, PRIORIDADES_TAREA_LABELS, PRIORIDADES_TAREA_COLORS,
  ESTADOS_TAREA, ESTADOS_TAREA_LABELS,
} from '../roles';

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

function Btn({ children, variant='primary', ...props }) {
  const styles = {
    primary:   { background:'#0d3b5e', color:'#fff', border:'none' },
    secondary: { background:'#fff', color:'#0d3b5e', border:'1px solid #ddd' },
    danger:    { background:'#fff', color:'#dc2626', border:'1px solid #f0b0b8' },
  };
  return <button {...props} style={{ padding:'9px 16px', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', ...styles[variant], ...(props.style||{}) }}>{children}</button>;
}

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(2px)' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 4px 24px rgba(0,0,0,.15)', border:'1px solid #e5e5e5' }}>
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

function PrioridadChip({ prioridad }) {
  const color = PRIORIDADES_TAREA_COLORS[prioridad] || '#8aa0b8';
  const label = PRIORIDADES_TAREA_LABELS[prioridad] || prioridad;
  const bgs = { '#8aa0b8':'#eef2f7', '#e8a020':'#fdf5e8', '#c8264a':'#fde8ec', '#dc2626':'#fee2e2' };
  return <span style={{ fontSize:10, padding:'2px 8px', borderRadius:999, fontWeight:700, background:bgs[color]||'#f3f4f6', color }}>{label}</span>;
}

function DaysChip({ days, estado }) {
  if (estado === 'hecho') return null;
  if (days < 0)   return <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:'#fee2e2', color:'#991b1b', fontWeight:500 }}>Venció hace {Math.abs(days)}d</span>;
  if (days === 0) return <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:'#fef9c3', color:'#854d0e', fontWeight:500 }}>Vence hoy</span>;
  if (days <= 3)  return <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:'#fef9c3', color:'#854d0e', fontWeight:500 }}>En {days}d</span>;
  return null;
}

const COLUMNAS = [
  { id:'pendiente',   label:'Pendiente',    color:'#8aa0b8' },
  { id:'en_progreso', label:'En progreso',  color:'#0d3b5e' },
  { id:'hecho',       label:'Hecho',        color:'#2e8b4e' },
];

function emptyForm() {
  return {
    titulo:'', descripcion:'', brief_id:'', prioridad:'media',
    fecha_entrega:'', asignado_nombre:'', asignado_email:'',
  };
}

export default function Trafico({ userRole, userEmail }) {
  const [tareas, setTareas]     = useState([]);
  const [ejecutivos, setEjecs]  = useState([]);
  const [briefs, setBriefs]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState(emptyForm());
  const [editing, setEditing]   = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [soloMias, setSoloMias] = useState(false);
  const [filtroAsig, setFiltroAsig] = useState('');
  const [toast, setToast]       = useState('');

  const canCreate = canCreateTarea(userRole);
  const canDelete = canDeleteTarea(userRole);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [tR, eR, bR] = await Promise.all([
      supabase.from('tareas').select('*').order('created_at', { ascending:false }),
      supabase.from('ejecutivos').select('*').order('nombre'),
      supabase.from('briefs').select('id, nombre').order('nombre'),
    ]);
    if (tR.data) setTareas(tR.data);
    if (eR.data) setEjecs(eR.data);
    if (bR.data) setBriefs(bR.data);
    setLoading(false);
  }

  function showToast(m) { setToast(m); setTimeout(()=>setToast(''), 2500); }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function onPickAsignado(nombre) {
    const ej = ejecutivos.find(e => e.nombre === nombre);
    setForm(f => ({ ...f, asignado_nombre: nombre, asignado_email: ej?.email || '' }));
  }

  function openNew() { setEditing(null); setForm(emptyForm()); setShowForm(true); }
  function openEdit(t) {
    setEditing(t);
    setForm({
      titulo:t.titulo||'', descripcion:t.descripcion||'', brief_id:t.brief_id||'',
      prioridad:t.prioridad||'media', fecha_entrega:t.fecha_entrega||'',
      asignado_nombre:t.asignado_nombre||'', asignado_email:t.asignado_email||'',
    });
    setShowForm(true);
  }

  async function saveTarea() {
    if (!form.titulo.trim()) { showToast('Falta el título'); return; }
    const brief = briefs.find(b => b.id === form.brief_id);
    const payload = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion,
      brief_id: form.brief_id || null,
      brief_nombre: brief?.nombre || '',
      prioridad: form.prioridad,
      fecha_entrega: form.fecha_entrega || null,
      asignado_nombre: form.asignado_nombre,
      asignado_email: form.asignado_email,
    };
    if (editing) {
      const { error } = await supabase.from('tareas').update(payload).eq('id', editing.id);
      if (error) { showToast('Error: ' + error.message); return; }
      // Si cambió el asignado, re-notificar
      if (editing.asignado_email !== payload.asignado_email && payload.asignado_email) {
        notifyTareaAsignada({ ...payload, creado_por: userEmail });
      }
      showToast('Tarea actualizada ✓');
    } else {
      const { data, error } = await supabase.from('tareas')
        .insert({ ...payload, creado_por: userEmail, estado:'pendiente' })
        .select().single();
      if (error) { showToast('Error: ' + error.message); return; }
      if (data?.asignado_email) notifyTareaAsignada({ ...data, creado_por: userEmail });
      showToast('Tarea creada ✓');
    }
    setShowForm(false);
    load();
  }

  async function updateEstado(id, estado) {
    setTareas(ts => ts.map(t => t.id===id ? { ...t, estado } : t));
    await supabase.from('tareas').update({ estado }).eq('id', id);
  }

  async function deleteTarea(id) {
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    await supabase.from('tareas').delete().eq('id', id);
    load();
  }

  const filtered = useMemo(() => {
    let list = tareas;
    if (soloMias) list = list.filter(t => t.asignado_email === userEmail);
    if (filtroAsig) list = list.filter(t => t.asignado_nombre === filtroAsig);
    return list;
  }, [tareas, soloMias, filtroAsig, userEmail]);

  const vencidas = filtered.filter(t => t.estado!=='hecho' && getDays(t.fecha_entrega) < 0).length;
  const prontas  = filtered.filter(t => t.estado!=='hecho' && getDays(t.fecha_entrega) >= 0 && getDays(t.fecha_entrega) <= 3).length;

  if (loading) return <div style={{ textAlign:'center', padding:'3rem', color:'#8aa0b8' }}>Cargando tareas...</div>;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12, marginBottom:16 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, color:'#0d3b5e', margin:0 }}>🗂️ Tráfico</h2>
          <div style={{ fontSize:13, color:'#8aa0b8', marginTop:4 }}>Tareas del equipo · {filtered.length} total{vencidas>0 && ` · ${vencidas} vencida${vencidas!==1?'s':''}`}{prontas>0 && ` · ${prontas} vence${prontas===1?'':'n'} pronto`}</div>
        </div>
        {canCreate && <Btn onClick={openNew}>+ Nueva tarea</Btn>}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:18 }}>
        <button onClick={()=>setSoloMias(v=>!v)} style={{
          padding:'6px 14px', borderRadius:999, border:'1px solid '+(soloMias?'#0d3b5e':'#ddd'),
          background:soloMias?'#0d3b5e':'#fff', color:soloMias?'#fff':'#555',
          fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
        }}>👤 Solo mis tareas</button>
        <select value={filtroAsig} onChange={e=>setFiltroAsig(e.target.value)} style={{ ...sel, width:'auto', minWidth:180 }}>
          <option value="">Todos los asignados</option>
          {ejecutivos.map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
        </select>
      </div>

      {/* Tablero Kanban */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14 }}>
        {COLUMNAS.map(col => {
          const items = filtered.filter(t => t.estado === col.id);
          return (
            <div key={col.id} style={{ background:'#f8fafc', borderRadius:12, padding:'12px', minHeight:200 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <span style={{ width:9, height:9, borderRadius:'50%', background:col.color }}/>
                <span style={{ fontSize:13, fontWeight:700, color:'#0d3b5e' }}>{col.label}</span>
                <span style={{ fontSize:11, color:'#8aa0b8', background:'#fff', padding:'1px 7px', borderRadius:999, border:'1px solid #e5e5e5' }}>{items.length}</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {items.map(t => {
                  const days = getDays(t.fecha_entrega);
                  const overdue = t.estado!=='hecho' && days < 0;
                  return (
                    <div key={t.id} style={{
                      background:'#fff', border:'1px solid '+(overdue?'#fca5a5':'#e8e8e8'),
                      borderLeft:`4px solid ${PRIORIDADES_TAREA_COLORS[t.prioridad]||'#8aa0b8'}`,
                      borderRadius:9, padding:'10px 12px',
                    }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:6 }}>
                        <div onClick={()=>openEdit(t)} style={{ fontSize:13, fontWeight:600, color:'#0d3b5e', cursor:'pointer', lineHeight:1.35 }}>{t.titulo}</div>
                        {canDelete && <button onClick={()=>deleteTarea(t.id)} style={{ background:'none', border:'none', color:'#ccc', cursor:'pointer', fontSize:13, flexShrink:0 }}>✕</button>}
                      </div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
                        <PrioridadChip prioridad={t.prioridad}/>
                        <DaysChip days={days} estado={t.estado}/>
                      </div>
                      {t.brief_nombre && <div style={{ fontSize:11, color:'#7c3aed', marginTop:5 }}>◇ {t.brief_nombre}</div>}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
                        <span style={{ fontSize:11, color:'#777' }}>{t.asignado_nombre ? `👤 ${t.asignado_nombre}` : '👤 Sin asignar'}</span>
                        <span style={{ fontSize:11, color:'#999' }}>{fmtDate(t.fecha_entrega)}</span>
                      </div>
                      <select value={t.estado} onChange={e=>updateEstado(t.id, e.target.value)} style={{ marginTop:8, fontSize:11, padding:'4px 7px', border:'1px solid #ddd', borderRadius:6, width:'100%', fontFamily:'inherit', color:'#555', background:'#fafafa' }}>
                        {ESTADOS_TAREA.map(e => <option key={e} value={e}>{ESTADOS_TAREA_LABELS[e]}</option>)}
                      </select>
                    </div>
                  );
                })}
                {items.length === 0 && <div style={{ textAlign:'center', padding:'16px 0', color:'#c0c8d0', fontSize:12 }}>Sin tareas</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal crear/editar */}
      <Modal open={showForm} onClose={()=>setShowForm(false)} title={editing ? 'Editar tarea' : 'Nueva tarea'}
        footer={<>
          <Btn variant="secondary" onClick={()=>setShowForm(false)}>Cancelar</Btn>
          <Btn onClick={saveTarea}>{editing ? 'Guardar' : 'Crear tarea'}</Btn>
        </>}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <label style={lbl}>Título <span style={{color:'#dc2626'}}>*</span></label>
            <input value={form.titulo} onChange={e=>set('titulo',e.target.value)} style={inp} placeholder="Ej: Diseñar piezas para redes"/>
          </div>
          <div>
            <label style={lbl}>Descripción</label>
            <textarea value={form.descripcion} onChange={e=>set('descripcion',e.target.value)} style={{ ...inp, minHeight:70, resize:'vertical' }} placeholder="Detalle de lo que hay que hacer..."/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={lbl}>Asignar a</label>
              <select value={form.asignado_nombre} onChange={e=>onPickAsignado(e.target.value)} style={sel}>
                <option value="">Sin asignar</option>
                {ejecutivos.map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Prioridad</label>
              <select value={form.prioridad} onChange={e=>set('prioridad',e.target.value)} style={sel}>
                {PRIORIDADES_TAREA.map(p => <option key={p} value={p}>{PRIORIDADES_TAREA_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Fecha de entrega</label>
              <input type="date" value={form.fecha_entrega} onChange={e=>set('fecha_entrega',e.target.value)} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Proyecto (opcional)</label>
              <select value={form.brief_id} onChange={e=>set('brief_id',e.target.value)} style={sel}>
                <option value="">Sin vincular</option>
                {briefs.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
          </div>
          {!form.asignado_email && form.asignado_nombre && (
            <div style={{ fontSize:11, color:'#e8a020' }}>⚠ Esta persona no tiene email cargado en Admin → Ejecutivos, no le va a llegar el correo.</div>
          )}
        </div>
      </Modal>

      {toast && <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#0d3b5e', color:'#fff', padding:'9px 22px', borderRadius:8, fontSize:13, zIndex:9999, boxShadow:'0 4px 16px rgba(13,59,94,0.35)' }}>{toast}</div>}
    </div>
  );
}
