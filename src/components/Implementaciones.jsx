import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import ExpedientePanel from './ExpedientePanel';

function fmtDate(s) { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; }
function fmtRange(inicio, fin) {
  if (!inicio) return '—';
  if (!fin || fin === inicio) return fmtDate(inicio);
  const [yi,mi,di] = inicio.split('-'); const [yf,mf,df] = fin.split('-');
  if (mi === mf && yi === yf) return `${di} al ${df}/${mf}/${yf}`;
  return `${di}/${mi}/${yi} al ${df}/${mf}/${yf}`;
}
function getDays(dateStr) {
  if (!dateStr) return null;
  const t = new Date(); t.setHours(0,0,0,0);
  const [y,m,d] = dateStr.split('-').map(Number);
  return Math.ceil((new Date(y,m-1,d) - t) / 86400000);
}
function eventDuration(inicio, fin) {
  if (!inicio || !fin) return 1;
  return Math.ceil((new Date(fin) - new Date(inicio)) / 86400000) + 1;
}
const chipStyle = (bg, color) => ({ fontSize:11, padding:'2px 8px', borderRadius:999, background:bg, color, fontWeight:500 });
const actionBtnStyle = { padding:'4px 10px', fontSize:12, borderRadius:7, border:'1px solid #ddd', background:'transparent', color:'#555', cursor:'pointer', fontFamily:'inherit' };
const lbl = { fontSize:12, fontWeight:500, color:'#666', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:5, display:'block' };
const inp = { fontFamily:'inherit', fontSize:13, padding:'9px 12px', border:'1px solid #ddd', borderRadius:9, width:'100%', outline:'none' };

export default function Implementaciones({ userRole }) {
  const [impls, setImpls]     = useState([]);
  const [clientes, setClientes] = useState([]);
  const [presupuestos, setPresupuestos]   = useState([]);
  const [saving, setSaving]   = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [expedienteId, setExpedienteId] = useState(null);
  const [form, setForm] = useState({ nombre:'', ciudad:'', cliente_id:'', presupuesto_id:'', presupuesto_nombre:'', fecha_evento:'', fecha_evento_fin:'', fecha_montaje:'' });

  const canEdit = ['admin','produccion'].includes(userRole);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: im }, { data: cl }, { data: br }] = await Promise.all([
      supabase.from('implementaciones').select('*').order('fecha_evento'),
      supabase.from('clientes').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('presupuestos').select('id, nombre, cliente, cliente_id, fecha_evento, dias_evento, lugar, ciudad').order('created_at', {ascending:false}),
    ]);
    setImpls(im || []);
    setClientes(cl || []);
    setPresupuestos(br || []);
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function setEF(k, v) { setEditForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.nombre.trim()) { alert('El nombre es obligatorio'); return; }
    if (!form.fecha_evento)  { alert('La fecha de inicio es obligatoria'); return; }
    setSaving(true);
    const cl = clientes.find(c => c.id === form.cliente_id);
    await supabase.from('implementaciones').insert({
      ...form,
      presupuesto_id: form.presupuesto_id || null,
      presupuesto_nombre: form.presupuesto_nombre || '',
      cliente_id:  form.cliente_id  || null,
      cliente_nombre: cl?.nombre || '',
      fecha_evento_fin: form.fecha_evento_fin || form.fecha_evento,
    });
    setForm({ nombre:'', ciudad:'', cliente_id:'', presupuesto_id:'', presupuesto_nombre:'', fecha_evento:'', fecha_evento_fin:'', fecha_montaje:'' });
    setSaving(false);
    loadAll();
  }

  async function handleEdit(id) {
    const cl = clientes.find(c => c.id === editForm.cliente_id);
    await supabase.from('implementaciones').update({
      ...editForm,
      presupuesto_id: editForm.presupuesto_id || null,
      presupuesto_nombre: editForm.presupuesto_nombre || '',
      cliente_id:  editForm.cliente_id  || null,
      cliente_nombre: cl?.nombre || '',
      fecha_evento_fin: editForm.fecha_evento_fin || editForm.fecha_evento,
    }).eq('id', id);
    setEditingId(null);
    loadAll();
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta implementación?')) return;
    await supabase.from('implementaciones').delete().eq('id', id);
    loadAll();
  }

  function startEdit(impl) {
    setEditingId(impl.id);
    setEditForm({ nombre:impl.nombre, ciudad:impl.ciudad||'', cliente_id:impl.cliente_id||'', presupuesto_id:impl.presupuesto_id||'', presupuesto_nombre:impl.presupuesto_nombre||'', fecha_evento:impl.fecha_evento||'', fecha_evento_fin:impl.fecha_evento_fin||impl.fecha_evento||'', fecha_montaje:impl.fecha_montaje||'' });
  }

  const sorted = [...impls].sort((a,b) => new Date(a.fecha_evento) - new Date(b.fecha_evento));

  return (
    <div>
      {/* Formulario nueva implementación */}
      {canEdit && (
        <div style={{ background:'#fff', border:'1px solid #e8e8e8', borderRadius:12, padding:'1.25rem', marginBottom:'1.25rem' }}>
          <div style={{ fontSize:15, fontWeight:500, marginBottom:'1rem' }}>Nueva implementación</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Nombre del proyecto <span style={{color:'#dc2626'}}>*</span></label>
              <input value={form.nombre} onChange={e=>setF('nombre',e.target.value)} style={inp} placeholder="Ej: Evento lanzamiento Acme"/>
            </div>
            <div>
              <label style={lbl}>Cliente</label>
              <select value={form.cliente_id} onChange={e=>{ setF('cliente_id',e.target.value); setF('brief_id',''); }} style={inp}>
                <option value="">Sin cliente</option>
                {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Vincular a presupuesto</label>
              <select value={form.presupuesto_id} onChange={e=>{
                const pid = e.target.value;
                const pp = presupuestos.find(p=>p.id===pid);
                setF('presupuesto_id', pid || '');
                setF('presupuesto_nombre', pp?.nombre || pp?.cliente || '');
                if (pp) {
                  if (pp.fecha_evento) {
                    setF('fecha_evento', pp.fecha_evento);
                    const d = new Date(pp.fecha_evento + 'T12:00');
                    d.setDate(d.getDate() + Math.max(0, (pp.dias_evento||1) - 1));
                    setF('fecha_evento_fin', d.toISOString().slice(0,10));
                  }
                  if (pp.ciudad) setF('ciudad', pp.ciudad);
                  if (pp.cliente_id && !form.cliente_id) setF('cliente_id', pp.cliente_id);
                }
              }} style={inp}>
                <option value="">Sin vincular</option>
                {presupuestos.filter(p=>!form.cliente_id||p.cliente_id===form.cliente_id).map(p=>(
                  <option key={p.id} value={p.id}>{p.nombre||p.cliente} {p.cliente?`— ${p.cliente}`:''}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Ciudad</label>
              <input value={form.ciudad} onChange={e=>setF('ciudad',e.target.value)} style={inp} placeholder="Guayaquil"/>
            </div>
            <div>
              <label style={lbl}>Fecha de montaje</label>
              <input type="date" value={form.fecha_montaje} onChange={e=>setF('fecha_montaje',e.target.value)} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Fecha inicio evento <span style={{color:'#dc2626'}}>*</span></label>
              <input type="date" value={form.fecha_evento} onChange={e=>{ setF('fecha_evento',e.target.value); if(!form.fecha_evento_fin||form.fecha_evento_fin<e.target.value) setF('fecha_evento_fin',e.target.value); }} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Fecha fin evento</label>
              <input type="date" value={form.fecha_evento_fin} min={form.fecha_evento} onChange={e=>setF('fecha_evento_fin',e.target.value)} style={inp}/>
              {form.fecha_evento && form.fecha_evento_fin && form.fecha_evento !== form.fecha_evento_fin && (
                <div style={{ fontSize:11, color:'#7c3aed', marginTop:4 }}>Duración: {eventDuration(form.fecha_evento, form.fecha_evento_fin)} días</div>
              )}
            </div>
          </div>
          <button onClick={handleSave} disabled={saving} style={{ marginTop:'1rem', width:'100%', padding:9, background:'#7c3aed', color:'#fff', border:'none', borderRadius:9, fontSize:14, fontWeight:500, cursor:saving?'not-allowed':'pointer', opacity:saving?.7:1 }}>
            {saving ? 'Guardando...' : 'Guardar implementación'}
          </button>
        </div>
      )}

      <div style={{ fontSize:15, fontWeight:500, marginBottom:'.75rem' }}>Implementaciones ({impls.length})</div>

      {sorted.length === 0 && <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>No hay implementaciones cargadas aún</div>}

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {sorted.map(impl => {
          const daysInicio = getDays(impl.fecha_evento);
          const duracion   = eventDuration(impl.fecha_evento, impl.fecha_evento_fin);
          const isEditing  = editingId === impl.id;

          if (isEditing) return (
            <div key={impl.id} style={{ background:'#fff', border:'2px solid #7c3aed', borderRadius:12, padding:'1rem' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Nombre</label><input value={editForm.nombre} onChange={e=>setEF('nombre',e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Cliente</label>
                  <select value={editForm.cliente_id} onChange={e=>setEF('cliente_id',e.target.value)} style={inp}>
                    <option value="">Sin cliente</option>
                    {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Ciudad</label><input value={editForm.ciudad} onChange={e=>setEF('ciudad',e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Fecha montaje</label><input type="date" value={editForm.fecha_montaje} onChange={e=>setEF('fecha_montaje',e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Fecha inicio</label><input type="date" value={editForm.fecha_evento} onChange={e=>setEF('fecha_evento',e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Fecha fin</label><input type="date" value={editForm.fecha_evento_fin} min={editForm.fecha_evento} onChange={e=>setEF('fecha_evento_fin',e.target.value)} style={inp}/></div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>setEditingId(null)} style={{ flex:1, padding:8, background:'transparent', border:'1px solid #ddd', borderRadius:8, fontSize:13, cursor:'pointer' }}>Cancelar</button>
                <button onClick={()=>handleEdit(impl.id)} style={{ flex:1, padding:8, background:'#7c3aed', color:'#fff', border:'none', borderRadius:8, fontSize:13, cursor:'pointer' }}>Guardar</button>
              </div>
            </div>
          );

          let chip = null;
          if (daysInicio !== null) {
            if (daysInicio < 0)      chip = <span style={chipStyle('#fee2e2','#991b1b')}>Finalizado</span>;
            else if (daysInicio === 0) chip = <span style={chipStyle('#ede9fe','#5b21b6')}>¡Hoy!</span>;
            else if (daysInicio <= 7) chip = <span style={chipStyle('#ede9fe','#5b21b6')}>En {daysInicio}d</span>;
            else chip = <span style={chipStyle('#f3f4f6','#6b7280')}>En {daysInicio}d</span>;
          }

          const cl = clientes.find(c => c.id === impl.cliente_id);

          return (
            <div key={impl.id} style={{ background:'#fff', border:'1px solid #e8e8e8', borderLeft:'4px solid #7c3aed', borderRadius:'0 10px 10px 0', padding:'12px 16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontWeight:500, fontSize:15 }}>{impl.nombre}</span>
                    {chip}
                    {duracion > 1 && <span style={chipStyle('#f3e8ff','#6d28d9')}>{duracion} días</span>}
                  </div>
                  <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:5 }}>
                    {cl && <span style={{ fontSize:12, color:'#777' }}>🏢 {cl.nombre}</span>}
                    {impl.ciudad && <span style={{ fontSize:12, color:'#777' }}>📍 {impl.ciudad}</span>}
                    {impl.fecha_montaje && <span style={{ fontSize:12, color:'#777' }}>🔧 Montaje: {fmtDate(impl.fecha_montaje)}</span>}
                    <span style={{ fontSize:12, color:'#777' }}>🎯 Evento: {fmtRange(impl.fecha_evento, impl.fecha_evento_fin)}</span>
                    {impl.presupuesto_id && <span style={{ fontSize:12, color:'#7c3aed', fontWeight:500 }}>📋 {impl.presupuesto_nombre||'Presupuesto vinculado'}</span>}
                  </div>
                </div>
                {canEdit && (
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={()=>startEdit(impl)} style={actionBtnStyle}>Editar</button>
                    <button onClick={()=>handleDelete(impl.id)} style={{ ...actionBtnStyle, color:'#dc2626' }}>✕</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {expedienteId && <ExpedientePanel briefId={expedienteId} onClose={()=>setExpedienteId(null)}/>}
    </div>
  );
}
