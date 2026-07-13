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
function fmtHora(h) {
  if (!h) return '';
  return h.slice(0,5);
}
// Timestamp combinado fecha+hora para ordenar (sin hora = fin del día)
function dueTs(t) {
  if (!t.fecha_entrega) return Infinity;
  const hora = t.hora_entrega ? t.hora_entrega.slice(0,5) : '23:59';
  return new Date(`${t.fecha_entrega}T${hora}:00`).getTime();
}
// Fecha/hora "efectiva" de una tarea: la más próxima entre la propia tarea
// y sus subtareas pendientes (cada una puede tener su propia fecha).
function effectiveDue(t) {
  let best = null, bestTs = Infinity;
  if (t.fecha_entrega) { bestTs = dueTs(t); best = { fecha: t.fecha_entrega, hora: t.hora_entrega }; }
  (t.subtareas||[]).forEach(s => {
    if (s.completada || !s.fecha_entrega) return;
    const ts = dueTs(s);
    if (ts < bestTs) { bestTs = ts; best = { fecha: s.fecha_entrega, hora: s.hora_entrega }; }
  });
  return best;
}
function taskDueTs(t) {
  const eff = effectiveDue(t);
  return eff ? dueTs(eff) : Infinity;
}
function getDays(dateStr) {
  if (!dateStr) return 999;
  const t = new Date(); t.setHours(0,0,0,0);
  const [y,m,d] = dateStr.split('-').map(Number);
  return Math.ceil((new Date(y,m-1,d) - t) / 86400000);
}
function uid() { return Math.random().toString(36).slice(2,9); }

const lbl = { fontSize:12, fontWeight:500, color:'#666', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:5, display:'block' };
const inp = { fontFamily:'inherit', fontSize:13, padding:'9px 12px', border:'1px solid #ddd', borderRadius:9, width:'100%', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };
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
  return <span style={{ fontSize:10, padding:'2px 8px', borderRadius:999, fontWeight:700, background:bgs[color]||'#f3f4f6', color, flexShrink:0 }}>{label}</span>;
}

function DaysChip({ days, estado }) {
  if (estado === 'hecho') return null;
  if (days < 0)   return <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:'#fee2e2', color:'#991b1b', fontWeight:500, flexShrink:0 }}>Venció hace {Math.abs(days)}d</span>;
  if (days === 0) return <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:'#fef9c3', color:'#854d0e', fontWeight:500, flexShrink:0 }}>Vence hoy</span>;
  if (days <= 3)  return <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:'#fef9c3', color:'#854d0e', fontWeight:500, flexShrink:0 }}>En {days}d</span>;
  return null;
}

function emptyForm() {
  return {
    titulo:'', descripcion:'', brief_id:'', prioridad:'media',
    fecha_entrega:'', hora_entrega:'', asignado_nombre:'', asignado_email:'',
    cliente_id:'', cliente_nombre:'', subtareas:[],
  };
}

function SubtareasChecklist({ subtareas, equipo, onToggle, onAdd, onRemove, onUpdate, compact }) {
  const [nueva, setNueva] = useState('');
  const done = subtareas.filter(s=>s.completada).length;
  return (
    <div onClick={e=>e.stopPropagation()}>
      {subtareas.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:compact?6:12, marginTop:6 }}>
          {subtareas.map(s => (
            <div key={s.id}>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer', color: s.completada ? '#aaa' : '#444', textDecoration: s.completada ? 'line-through' : 'none' }}>
                <input type="checkbox" checked={!!s.completada} onChange={()=>onToggle(s.id)} style={{ width:13, height:13, cursor:'pointer', flexShrink:0 }}/>
                <span style={{ flex:1 }}>{s.titulo}</span>
                {!compact && <button onClick={()=>onRemove(s.id)} style={{ background:'none', border:'none', color:'#ccc', cursor:'pointer', fontSize:12, flexShrink:0 }}>✕</button>}
              </label>
              {!compact && (
                <div style={{ display:'flex', gap:6, marginTop:4, marginLeft:19 }}>
                  <select value={s.asignado_nombre||''} onChange={e=>{
                    const ej = (equipo||[]).find(x=>x.nombre===e.target.value);
                    onUpdate(s.id, { asignado_nombre: e.target.value, asignado_email: ej?.email || '' });
                  }} style={{ ...inp, fontSize:11, padding:'5px 7px', flex:1 }}>
                    <option value="">Sin asignar</option>
                    {(equipo||[]).map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                  </select>
                  <input type="date" value={s.fecha_entrega||''} onChange={e=>onUpdate(s.id,{fecha_entrega:e.target.value})} style={{ ...inp, fontSize:11, padding:'5px 7px', flex:1 }}/>
                </div>
              )}
              {compact && (s.asignado_nombre || s.fecha_entrega) && !s.completada && (
                <div style={{ fontSize:10, color:'#999', marginLeft:19, marginTop:1 }}>
                  {s.asignado_nombre && `👤 ${s.asignado_nombre}`}{s.asignado_nombre && s.fecha_entrega ? ' · ' : ''}{s.fecha_entrega && fmtDate(s.fecha_entrega)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!compact && (
        <div style={{ display:'flex', gap:6, marginTop:8 }}>
          <input value={nueva} onChange={e=>setNueva(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter' && nueva.trim()){ onAdd(nueva.trim()); setNueva(''); } }} placeholder="Agregar subtarea…" style={{ ...inp, padding:'6px 10px', fontSize:12 }}/>
          <button onClick={()=>{ if(nueva.trim()){ onAdd(nueva.trim()); setNueva(''); } }} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #ddd', background:'#fff', fontSize:12, cursor:'pointer' }}>+</button>
        </div>
      )}
      {subtareas.length > 0 && compact && <div style={{ fontSize:10, color:'#999', marginTop:3 }}>{done}/{subtareas.length} completas</div>}
    </div>
  );
}

function TaskCard({ t, onOpen, onDelete, canDelete, onToggleSub, expanded, onToggleExpand }) {
  const eff = effectiveDue(t);
  const days = getDays(eff?.fecha);
  const overdue = t.estado!=='hecho' && days < 0;
  const done = (t.subtareas||[]).filter(s=>s.completada).length;
  const total = (t.subtareas||[]).length;
  return (
    <div style={{
      background:'#fff', border:'1px solid '+(overdue?'#fca5a5':'#e8e8e8'),
      borderLeft:`4px solid ${PRIORIDADES_TAREA_COLORS[t.prioridad]||'#8aa0b8'}`,
      borderRadius:9, padding:'10px 12px', opacity: t.estado==='hecho' ? 0.6 : 1,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:6 }}>
        <div onClick={()=>onOpen(t)} style={{ fontSize:13, fontWeight:600, color:'#0d3b5e', cursor:'pointer', lineHeight:1.35, textDecoration: t.estado==='hecho' ? 'line-through' : 'none' }}>{t.titulo}</div>
        {canDelete && <button onClick={()=>onDelete(t.id)} style={{ background:'none', border:'none', color:'#ccc', cursor:'pointer', fontSize:13, flexShrink:0 }}>✕</button>}
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
        <PrioridadChip prioridad={t.prioridad}/>
        <DaysChip days={days} estado={t.estado}/>
      </div>
      {t.brief_nombre && <div style={{ fontSize:11, color:'#7c3aed', marginTop:5 }}>◇ {t.brief_nombre}</div>}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
        <span style={{ fontSize:11, color:'#777' }}>{total===0 ? (t.asignado_nombre ? `👤 ${t.asignado_nombre}` : '👤 Sin asignar') : '👤 ver subtareas'}</span>
        <span style={{ fontSize:11, color:'#999' }}>{eff ? fmtDate(eff.fecha)+(eff.hora ? ' · '+fmtHora(eff.hora) : '') : '—'}</span>
      </div>
      {total > 0 && (
        <div style={{ marginTop:8 }}>
          <div onClick={()=>onToggleExpand(t.id)} style={{ fontSize:11, color:'#0d3b5e', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
            <span>{expanded ? '▾' : '▸'}</span> ☑ {done}/{total} subtareas
          </div>
          {expanded && <SubtareasChecklist subtareas={t.subtareas} compact onToggle={(sid)=>onToggleSub(t, sid)} />}
        </div>
      )}
    </div>
  );
}

export default function Trafico({ userRole, userEmail }) {
  const [tareas, setTareas]     = useState([]);
  const [equipo, setEquipo]     = useState([]);
  const [briefs, setBriefs]     = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState(emptyForm());
  const [editing, setEditing]   = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [soloMias, setSoloMias] = useState(false);
  const [filtroAsig, setFiltroAsig] = useState('');
  const [ocultarHechas, setOcultarHechas] = useState(false);
  const [expandedCard, setExpandedCard] = useState(null);
  const [toast, setToast]       = useState('');
  const [showIaModal, setShowIaModal] = useState(false);
  const [iaTexto, setIaTexto]   = useState('');
  const [iaLoading, setIaLoading] = useState(false);
  const [iaTareas, setIaTareas] = useState(null); // null = pantalla de pegar texto, array = pantalla de revisión
  const [iaCreando, setIaCreando] = useState(false);

  const canCreate = canCreateTarea(userRole);
  const canDelete = canDeleteTarea(userRole);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [tR, eR, bR, cR] = await Promise.all([
      supabase.from('tareas').select('*').order('created_at', { ascending:false }),
      supabase.from('equipo').select('*').order('nombre'),
      supabase.from('briefs').select('id, nombre, cliente_id, cliente_nombre').order('nombre'),
      supabase.from('clientes').select('id, nombre').order('nombre'),
    ]);
    if (tR.data) setTareas(tR.data.map(t => ({ ...t, subtareas: t.subtareas || [] })));
    if (eR.data) setEquipo(eR.data);
    if (bR.data) setBriefs(bR.data);
    if (cR.data) setClientes(cR.data);
    setLoading(false);
  }

  function showToast(m) { setToast(m); setTimeout(()=>setToast(''), 2500); }
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function onPickAsignado(nombre) {
    const ej = equipo.find(e => e.nombre === nombre);
    setForm(f => ({ ...f, asignado_nombre: nombre, asignado_email: ej?.email || '' }));
  }
  function onPickBrief(brief_id) {
    const b = briefs.find(x => x.id === brief_id);
    setForm(f => ({
      ...f, brief_id,
      cliente_id: b?.cliente_id || f.cliente_id,
      cliente_nombre: b?.cliente_nombre || f.cliente_nombre,
    }));
  }
  function onPickCliente(cliente_id) {
    const c = clientes.find(x => x.id === cliente_id);
    setForm(f => ({ ...f, cliente_id, cliente_nombre: c?.nombre || '' }));
  }

  function openNew() { setEditing(null); setForm(emptyForm()); setShowForm(true); }
  function openEdit(t) {
    setEditing(t);
    setForm({
      titulo:t.titulo||'', descripcion:t.descripcion||'', brief_id:t.brief_id||'',
      prioridad:t.prioridad||'media', fecha_entrega:t.fecha_entrega||'', hora_entrega:t.hora_entrega||'',
      asignado_nombre:t.asignado_nombre||'', asignado_email:t.asignado_email||'',
      cliente_id:t.cliente_id||'', cliente_nombre:t.cliente_nombre||'',
      subtareas: t.subtareas || [],
    });
    setShowForm(true);
  }

  function addSubtareaForm(titulo) {
    setForm(f => ({ ...f, subtareas:[...f.subtareas, { id:uid(), titulo, completada:false, asignado_nombre:'', asignado_email:'', fecha_entrega:'', hora_entrega:'' }] }));
  }
  function removeSubtareaForm(id) {
    setForm(f => ({ ...f, subtareas: f.subtareas.filter(s=>s.id!==id) }));
  }
  function toggleSubtareaForm(id) {
    setForm(f => ({ ...f, subtareas: f.subtareas.map(s => s.id===id ? {...s, completada:!s.completada} : s) }));
  }
  function updateSubtareaForm(id, patch) {
    setForm(f => ({ ...f, subtareas: f.subtareas.map(s => s.id===id ? {...s, ...patch} : s) }));
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
      hora_entrega: form.hora_entrega || null,
      asignado_nombre: form.asignado_nombre,
      asignado_email: form.asignado_email,
      cliente_id: form.cliente_id || null,
      cliente_nombre: form.cliente_nombre || '',
      subtareas: form.subtareas,
    };
    if (editing) {
      const { error } = await supabase.from('tareas').update(payload).eq('id', editing.id);
      if (error) { showToast('Error: ' + error.message); return; }
      if (editing.asignado_email !== payload.asignado_email && payload.asignado_email) {
        const r = await notifyTareaAsignada({ ...payload, creado_por: userEmail });
        showToast(r?.ok ? 'Tarea actualizada ✓ (correo enviado)' : 'Tarea actualizada, pero el correo no se pudo enviar ⚠');
      } else {
        showToast('Tarea actualizada ✓');
      }
    } else {
      const { data, error } = await supabase.from('tareas')
        .insert({ ...payload, creado_por: userEmail, estado:'pendiente' })
        .select().single();
      if (error) { showToast('Error: ' + error.message); return; }
      if (data?.asignado_email) {
        const r = await notifyTareaAsignada({ ...data, creado_por: userEmail });
        showToast(r?.ok ? 'Tarea creada ✓ (correo enviado)' : 'Tarea creada, pero el correo no se pudo enviar ⚠');
      } else {
        showToast('Tarea creada ✓');
      }
    }
    setShowForm(false);
    load();
  }

  async function updateEstado(id, estado) {
    setTareas(ts => ts.map(t => t.id===id ? { ...t, estado } : t));
    await supabase.from('tareas').update({ estado }).eq('id', id);
  }

  async function toggleSubtareaCard(t, subId) {
    const nuevas = (t.subtareas||[]).map(s => s.id===subId ? { ...s, completada: !s.completada } : s);
    setTareas(ts => ts.map(x => x.id===t.id ? { ...x, subtareas: nuevas } : x));
    await supabase.from('tareas').update({ subtareas: nuevas }).eq('id', t.id);
  }

  async function deleteTarea(id) {
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    await supabase.from('tareas').delete().eq('id', id);
    load();
  }

  function closeIaModal() {
    setShowIaModal(false); setIaTexto(''); setIaTareas(null);
  }

  async function generarTareasDesdeReunion() {
    if (!iaTexto.trim()) return;
    setIaLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-extraer-tareas', {
        body: {
          texto: iaTexto,
          equipo: equipo.map(e => ({ nombre: e.nombre })),
          clientes: clientes.map(c => ({ nombre: c.nombre })),
          briefs: briefs.map(b => ({ nombre: b.nombre })),
        },
      });
      if (error || data?.error) throw new Error(data?.error || error.message);
      const drafts = (data.tareas || []).map(t => {
        const ej = equipo.find(e => e.nombre === t.asignado_nombre);
        const cl = clientes.find(c => c.nombre === t.cliente_nombre);
        const br = briefs.find(b => b.nombre === t.brief_nombre);
        return {
          _id: uid(),
          titulo: t.titulo || '', descripcion: t.descripcion || '',
          prioridad: PRIORIDADES_TAREA.includes(t.prioridad) ? t.prioridad : 'media',
          fecha_entrega: t.fecha_entrega || '', hora_entrega: t.hora_entrega || '',
          asignado_nombre: ej?.nombre || '', asignado_email: ej?.email || '',
          cliente_id: cl?.id || '', cliente_nombre: cl?.nombre || t.cliente_nombre || '',
          brief_id: br?.id || '', brief_nombre: br?.nombre || '',
          subtareas: (t.subtareas||[]).map(s => ({ id:uid(), titulo:s, completada:false })),
        };
      });
      if (drafts.length === 0) showToast('No se detectaron tareas claras en ese texto');
      setIaTareas(drafts);
    } catch (e) {
      alert('No se pudo generar: ' + e.message);
    }
    setIaLoading(false);
  }

  function updateIaTarea(id, patch) {
    setIaTareas(list => list.map(t => t._id === id ? { ...t, ...patch } : t));
  }
  function removeIaTarea(id) {
    setIaTareas(list => list.filter(t => t._id !== id));
  }
  function onPickAsignadoIa(id, nombre) {
    const ej = equipo.find(e => e.nombre === nombre);
    updateIaTarea(id, { asignado_nombre: nombre, asignado_email: ej?.email || '' });
  }

  async function crearTareasEnBloque() {
    if (!iaTareas || iaTareas.length === 0) return;
    setIaCreando(true);
    let fallosCorreo = 0;
    for (const t of iaTareas) {
      const payload = {
        titulo: t.titulo, descripcion: t.descripcion,
        prioridad: t.prioridad, fecha_entrega: t.fecha_entrega || null, hora_entrega: t.hora_entrega || null,
        asignado_nombre: t.asignado_nombre, asignado_email: t.asignado_email,
        cliente_id: t.cliente_id || null, cliente_nombre: t.cliente_nombre,
        brief_id: t.brief_id || null, brief_nombre: t.brief_nombre,
        subtareas: t.subtareas, creado_por: userEmail, estado: 'pendiente',
      };
      const { data } = await supabase.from('tareas').insert(payload).select().single();
      if (data?.asignado_email) {
        const r = await notifyTareaAsignada({ ...data, creado_por: userEmail });
        if (!r?.ok) fallosCorreo++;
      }
    }
    setIaCreando(false);
    showToast(fallosCorreo > 0
      ? `${iaTareas.length} tarea(s) creada(s), ${fallosCorreo} correo(s) no se pudieron enviar ⚠`
      : `${iaTareas.length} tarea(s) creada(s) ✓`);
    closeIaModal();
    load();
  }

  const filtered = useMemo(() => {
    let list = tareas;
    if (soloMias) list = list.filter(t => t.asignado_email === userEmail || (t.subtareas||[]).some(s=>s.asignado_email===userEmail));
    if (filtroAsig) list = list.filter(t => t.asignado_nombre === filtroAsig || (t.subtareas||[]).some(s=>s.asignado_nombre===filtroAsig));
    if (ocultarHechas) list = list.filter(t => t.estado !== 'hecho');
    return list;
  }, [tareas, soloMias, filtroAsig, ocultarHechas, userEmail]);

  // Agrupar por cliente, ordenando cada columna por fecha/hora efectiva
  // (tarea o su subtarea pendiente más próxima), y las columnas entre sí
  // por la tarea pendiente más próxima a vencer.
  const columnas = useMemo(() => {
    const grupos = {};
    filtered.forEach(t => {
      const key = t.cliente_nombre || 'Sin cliente';
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(t);
    });
    const arr = Object.entries(grupos).map(([cliente, items]) => {
      items.sort((a,b) => taskDueTs(a) - taskDueTs(b));
      const pendientes = items.filter(t => t.estado !== 'hecho');
      const proxima = pendientes.length ? Math.min(...pendientes.map(taskDueTs)) : Infinity;
      return { cliente, items, proxima };
    });
    arr.sort((a,b) => a.proxima - b.proxima);
    return arr;
  }, [filtered]);

  // Lista de pendientes agrupada por proyecto: si una tarea tiene subtareas,
  // cada subtarea pendiente aparece como su propia línea (con su responsable
  // y fecha propios); si no tiene subtareas, aparece la tarea completa.
  const pendientesAgrupados = useMemo(() => {
    const items = [];
    filtered.forEach(t => {
      if (t.estado === 'hecho') return;
      const subsPend = (t.subtareas||[]).filter(s=>!s.completada);
      if (subsPend.length > 0) {
        subsPend.forEach(s => {
          const usaFechaSub = !!s.fecha_entrega;
          items.push({
            key: t.id+'_'+s.id, tareaId: t.id,
            titulo: s.titulo, tareaTitulo: t.titulo,
            asignado_nombre: s.asignado_nombre || t.asignado_nombre,
            fecha_entrega: s.fecha_entrega || t.fecha_entrega,
            hora_entrega: usaFechaSub ? s.hora_entrega : t.hora_entrega,
            proyecto: t.brief_nombre || 'Sin proyecto',
            ts: dueTs(usaFechaSub ? s : t),
          });
        });
      } else {
        items.push({
          key: t.id, tareaId: t.id,
          titulo: t.titulo, tareaTitulo: null,
          asignado_nombre: t.asignado_nombre,
          fecha_entrega: t.fecha_entrega, hora_entrega: t.hora_entrega,
          proyecto: t.brief_nombre || 'Sin proyecto',
          ts: dueTs(t),
        });
      }
    });
    const grupos = {};
    items.forEach(it => {
      if (!grupos[it.proyecto]) grupos[it.proyecto] = [];
      grupos[it.proyecto].push(it);
    });
    const arr = Object.entries(grupos).map(([proyecto, its]) => {
      its.sort((a,b) => a.ts - b.ts);
      return { proyecto, items: its, proxima: its.length ? its[0].ts : Infinity };
    });
    arr.sort((a,b) => a.proxima - b.proxima);
    return arr;
  }, [filtered]);

  const vencidas = filtered.filter(t => t.estado!=='hecho' && getDays(effectiveDue(t)?.fecha) < 0).length;
  const prontas  = filtered.filter(t => {
    if (t.estado==='hecho') return false;
    const d = getDays(effectiveDue(t)?.fecha);
    return d >= 0 && d <= 3;
  }).length;

  if (loading) return <div style={{ textAlign:'center', padding:'3rem', color:'#8aa0b8' }}>Cargando tareas...</div>;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12, marginBottom:16 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, color:'#0d3b5e', margin:0 }}>🗂️ Tráfico</h2>
          <div style={{ fontSize:13, color:'#8aa0b8', marginTop:4 }}>Tareas del equipo · {filtered.length} total{vencidas>0 && ` · ${vencidas} vencida${vencidas!==1?'s':''}`}{prontas>0 && ` · ${prontas} vence${prontas===1?'':'n'} pronto`}</div>
        </div>
        {canCreate && <div style={{ display:'flex', gap:8 }}>
          <Btn variant="secondary" onClick={()=>setShowIaModal(true)}>🤖 Crear desde reunión</Btn>
          <Btn onClick={openNew}>+ Nueva tarea</Btn>
        </div>}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:18 }}>
        <button onClick={()=>setSoloMias(v=>!v)} style={{
          padding:'6px 14px', borderRadius:999, border:'1px solid '+(soloMias?'#0d3b5e':'#ddd'),
          background:soloMias?'#0d3b5e':'#fff', color:soloMias?'#fff':'#555',
          fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
        }}>👤 Solo mis tareas</button>
        <button onClick={()=>setOcultarHechas(v=>!v)} style={{
          padding:'6px 14px', borderRadius:999, border:'1px solid '+(ocultarHechas?'#0d3b5e':'#ddd'),
          background:ocultarHechas?'#0d3b5e':'#fff', color:ocultarHechas?'#fff':'#555',
          fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
        }}>✓ Ocultar hechas</button>
        <select value={filtroAsig} onChange={e=>setFiltroAsig(e.target.value)} style={{ ...sel, width:'auto', minWidth:180 }}>
          <option value="">Todos los asignados</option>
          {equipo.map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
        </select>
      </div>

      {/* Tablero por cliente + lista lateral de pendientes */}
      <div style={{ display:'flex', gap:18, flexWrap:'wrap', alignItems:'flex-start' }}>
        <div style={{ flex:'3 1 600px', minWidth:0, overflowX:'auto' }}>
          <div style={{ display:'flex', gap:14, paddingBottom:8 }}>
            {columnas.map(({ cliente, items }) => (
              <div key={cliente} style={{ background:'#f8fafc', borderRadius:12, padding:12, minHeight:200, width:280, flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#0d3b5e' }}>{cliente}</span>
                  <span style={{ fontSize:11, color:'#8aa0b8', background:'#fff', padding:'1px 7px', borderRadius:999, border:'1px solid #e5e5e5' }}>{items.length}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {items.map(t => (
                    <div key={t.id}>
                      <TaskCard t={t} onOpen={openEdit} onDelete={deleteTarea} canDelete={canDelete}
                        onToggleSub={toggleSubtareaCard}
                        expanded={expandedCard===t.id}
                        onToggleExpand={id=>setExpandedCard(x=>x===id?null:id)}/>
                      <select value={t.estado} onChange={e=>updateEstado(t.id, e.target.value)} style={{ marginTop:4, fontSize:11, padding:'4px 7px', border:'1px solid #ddd', borderRadius:6, width:'100%', fontFamily:'inherit', color:'#555', background:'#fafafa' }}>
                        {ESTADOS_TAREA.map(e => <option key={e} value={e}>{ESTADOS_TAREA_LABELS[e]}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {columnas.length === 0 && <div style={{ color:'#c0c8d0', fontSize:13, padding:'20px 0' }}>No hay tareas todavía.</div>}
          </div>
        </div>

        {/* Lista lateral (compu) / abajo (celular) de pendientes por urgencia, agrupada por proyecto */}
        <div style={{ flex:'1 1 280px', minWidth:260 }}>
          <div style={{ background:'#fff', border:'1px solid #e8e8e8', borderRadius:12, padding:14, position:'sticky', top:12 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#0d3b5e', marginBottom:10 }}>📌 Pendientes por proyecto</div>
            <div style={{ display:'flex', flexDirection:'column', gap:16, maxHeight:600, overflowY:'auto' }}>
              {pendientesAgrupados.map(({ proyecto, items }) => (
                <div key={proyecto}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#7c3aed', textTransform:'uppercase', letterSpacing:.4, marginBottom:6 }}>◇ {proyecto}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {items.map(it => {
                      const days = getDays(it.fecha_entrega);
                      return (
                        <div key={it.key} onClick={()=>{ const t=tareas.find(x=>x.id===it.tareaId); if(t) openEdit(t); }} style={{ cursor:'pointer', borderBottom:'1px solid #f0f0f0', paddingBottom:8 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:'#0d3b5e' }}>{it.titulo}</div>
                          {it.tareaTitulo && <div style={{ fontSize:10, color:'#aaa' }}>de: {it.tareaTitulo}</div>}
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:3 }}>
                            <span style={{ fontSize:11, color:'#999' }}>{it.asignado_nombre || 'Sin asignar'}</span>
                            <span style={{ fontSize:11, fontWeight:600, color: days<0?'#dc2626': days<=3?'#d97706':'#8aa0b8' }}>{fmtDate(it.fecha_entrega)}{it.hora_entrega?' '+fmtHora(it.hora_entrega):''}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {pendientesAgrupados.length === 0 && <div style={{ fontSize:12, color:'#c0c8d0' }}>No hay tareas pendientes 🎉</div>}
            </div>
          </div>
        </div>
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
              <label style={lbl}>Cliente</label>
              <select value={form.cliente_id} onChange={e=>onPickCliente(e.target.value)} style={sel}>
                <option value="">Sin cliente / General</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Proyecto (opcional)</label>
              <select value={form.brief_id} onChange={e=>onPickBrief(e.target.value)} style={sel}>
                <option value="">Sin vincular</option>
                {briefs.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Asignar a</label>
              <select value={form.asignado_nombre} onChange={e=>onPickAsignado(e.target.value)} style={sel}>
                <option value="">Sin asignar</option>
                {equipo.map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
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
              <label style={lbl}>Hora (opcional)</label>
              <input type="time" value={form.hora_entrega} onChange={e=>set('hora_entrega',e.target.value)} style={inp}/>
            </div>
          </div>

          <div>
            <label style={lbl}>Subtareas</label>
            <p style={{ fontSize:11, color:'#999', margin:'0 0 6px' }}>Si la tarea tiene subtareas, cada una puede tener su propio responsable y fecha. El "Asignar a" / "Fecha" de arriba quedan como generales de la tarea (se usan si una subtarea no tiene los suyos propios, o si la tarea no tiene subtareas).</p>
            <SubtareasChecklist subtareas={form.subtareas} equipo={equipo} onToggle={toggleSubtareaForm} onAdd={addSubtareaForm} onRemove={removeSubtareaForm} onUpdate={updateSubtareaForm}/>
          </div>

          {!form.asignado_email && form.asignado_nombre && (
            <div style={{ fontSize:11, color:'#e8a020' }}>⚠ Esta persona no tiene email cargado en Admin → Equipo, no le va a llegar el correo.</div>
          )}
        </div>
      </Modal>

      {/* Modal: crear tareas desde resumen de reunión (IA) */}
      <Modal open={showIaModal} onClose={()=>{ if(!iaLoading && !iaCreando) closeIaModal(); }}
        title={iaTareas ? `Revisar tareas detectadas (${iaTareas.length})` : '🤖 Crear tareas desde una reunión'}
        footer={ iaTareas ? (
          <>
            <Btn variant="secondary" onClick={()=>setIaTareas(null)} disabled={iaCreando}>‹ Volver</Btn>
            <Btn onClick={crearTareasEnBloque} disabled={iaCreando || iaTareas.length===0}>{iaCreando ? 'Creando…' : `Crear ${iaTareas.length} tarea(s)`}</Btn>
          </>
        ) : (
          <>
            <Btn variant="secondary" onClick={closeIaModal} disabled={iaLoading}>Cancelar</Btn>
            <Btn onClick={generarTareasDesdeReunion} disabled={iaLoading || !iaTexto.trim()}>{iaLoading ? 'Analizando…' : '✨ Generar tareas'}</Btn>
          </>
        )}>
        {!iaTareas ? (
          <>
            <p style={{ fontSize:12, color:'#888', marginBottom:10 }}>Pegá el resumen, transcripción o notas de la reunión. La IA va a identificar los pendientes, con responsable, fecha y subtareas si aplica — vas a poder revisar todo antes de crearlas.</p>
            <textarea
              value={iaTexto}
              onChange={e=>setIaTexto(e.target.value)}
              placeholder="Pegá acá el resumen o transcripción de la reunión..."
              style={{ ...inp, minHeight:220, resize:'vertical' }}
              disabled={iaLoading}
              autoFocus
            />
          </>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {iaTareas.map(t => (
              <div key={t._id} style={{ border:'1px solid #e5e5e5', borderRadius:10, padding:12 }}>
                <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                  <input value={t.titulo} onChange={e=>updateIaTarea(t._id,{titulo:e.target.value})} style={{ ...inp, fontWeight:600, flex:1 }}/>
                  <button onClick={()=>removeIaTarea(t._id)} style={{ background:'none', border:'none', color:'#ccc', cursor:'pointer', fontSize:15 }}>✕</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:8 }}>
                  <select value={t.asignado_nombre} onChange={e=>onPickAsignadoIa(t._id, e.target.value)} style={{ ...sel, fontSize:12, padding:'6px 8px' }}>
                    <option value="">Sin asignar</option>
                    {equipo.map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                  </select>
                  <select value={t.prioridad} onChange={e=>updateIaTarea(t._id,{prioridad:e.target.value})} style={{ ...sel, fontSize:12, padding:'6px 8px' }}>
                    {PRIORIDADES_TAREA.map(p => <option key={p} value={p}>{PRIORIDADES_TAREA_LABELS[p]}</option>)}
                  </select>
                  <input type="date" value={t.fecha_entrega} onChange={e=>updateIaTarea(t._id,{fecha_entrega:e.target.value})} style={{ ...inp, fontSize:12, padding:'6px 8px' }}/>
                </div>
                {t.cliente_nombre && <div style={{ fontSize:11, color:'#7c3aed', marginTop:6 }}>◇ {t.cliente_nombre}{t.brief_nombre ? ' · '+t.brief_nombre : ''}</div>}
                {t.subtareas.length > 0 && (
                  <div style={{ marginTop:6, display:'flex', flexDirection:'column', gap:2 }}>
                    {t.subtareas.map(s => <div key={s.id} style={{ fontSize:11, color:'#666' }}>☐ {s.titulo}</div>)}
                  </div>
                )}
              </div>
            ))}
            {iaTareas.length === 0 && <div style={{ textAlign:'center', color:'#c0c8d0', fontSize:13, padding:'20px 0' }}>No se detectaron tareas. Volvé y probá con más detalle.</div>}
          </div>
        )}
      </Modal>

      {toast && <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#0d3b5e', color:'#fff', padding:'9px 22px', borderRadius:8, fontSize:13, zIndex:9999, boxShadow:'0 4px 16px rgba(13,59,94,0.35)' }}>{toast}</div>}
    </div>
  );
}
