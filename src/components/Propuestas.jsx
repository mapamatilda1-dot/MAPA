import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { notifyPropuestaNueva } from '../notifyHelper';
import { canCreatePropuesta, canEditPropuesta, ESTADOS_PROPUESTA, ESTADOS_PROPUESTA_LABELS, ESTADOS_PROPUESTA_COLORS } from '../roles';
import ExpedientePanel from './ExpedientePanel';

function fmtDate(s) {
  if (!s) return '—';
  const [y,m,d] = s.split('-');
  return `${d}/${m}/${y}`;
}

const inp = { fontFamily:'inherit', fontSize:13, padding:'9px 12px', border:'1px solid #ddd', borderRadius:9, width:'100%', outline:'none', color:'#1a1a1a' };
const sel = { ...inp };
const lbl = { fontSize:12, fontWeight:500, color:'#666', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:5, display:'block' };

function StatusChip({ estado }) {
  const color = ESTADOS_PROPUESTA_COLORS[estado] || '#888';
  const label = ESTADOS_PROPUESTA_LABELS[estado] || estado;
  const bgs = { '#8aa0b8':'#eef2f7', '#0d3b5e':'#e8f0f8', '#2e8b4e':'#e8f5ee', '#c8264a':'#fde8ec' };
  const bg = bgs[color] || '#f3f4f6';
  return <span style={{ fontSize:11, padding:'2px 9px', borderRadius:999, fontWeight:500, background:bg, color }}>{label}</span>;
}

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(2px)' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:580, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 4px 24px rgba(0,0,0,.15)' }}>
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
  const variants = { primary:{ background:'#0d3b5e', color:'#fff' }, secondary:{ background:'#fff', color:'#333', borderColor:'#ddd' } };
  const sizes = { sm:{ padding:'5px 12px', fontSize:12 }, md:{ padding:'8px 16px', fontSize:13 }, xs:{ padding:'3px 9px', fontSize:11 } };
  return <button onClick={onClick} disabled={disabled} style={{...base,...variants[variant],...sizes[size]}}>{children}</button>;
}

export default function Propuestas({ userRole, userEmail, briefFiltroId }) {
  const [propuestas, setPropuestas] = useState([]);
  const [briefs, setBriefs]         = useState([]);
  const [clientes, setClientes]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(null); // null | 'new' | propuesta
  const [detalle, setDetalle]       = useState(null);
  const [expedienteId, setExpedienteId] = useState(null);
  const [filter, setFilter]         = useState('todos');
  const [saving, setSaving]         = useState(false);

  const [form, setForm] = useState({ brief_id:'', cliente_id:'', titulo:'', canva_url:'', notas:'', estado:'borrador' });

  const canCreate = canCreatePropuesta(userRole);
  const canEdit   = canEditPropuesta(userRole);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: pr }, { data: br }, { data: cl }] = await Promise.all([
      supabase.from('propuestas').select('*').order('created_at', { ascending: false }),
      supabase.from('briefs').select('id, nombre, cliente_id, cliente_nombre, fecha_entrega').order('nombre'),
      supabase.from('clientes').select('id, nombre').eq('activo', true).order('nombre'),
    ]);
    setPropuestas(pr || []);
    setBriefs(br || []);
    setClientes(cl || []);
    setLoading(false);
  }

  function set(k, v) {
    setForm(f => {
      const next = { ...f, [k]: v };
      // Al seleccionar brief, autocompletar cliente
      if (k === 'brief_id') {
        const br = briefs.find(b => b.id === v);
        if (br) next.cliente_id = br.cliente_id;
      }
      return next;
    });
  }

  async function savePropuesta() {
    if (!form.titulo.trim()) { alert('El título es obligatorio'); return; }
    if (!form.cliente_id)    { alert('Seleccioná un cliente o brief'); return; }
    setSaving(true);
    const cl = clientes.find(c => c.id === form.cliente_id);
    if (modal === 'new') {
      const { data: newProp } = await supabase.from('propuestas').insert({ ...form, cliente_nombre: cl?.nombre || '', created_by: userEmail }).select().single();
      if (newProp) notifyPropuestaNueva({ ...newProp, cliente: cl?.nombre || '' });
    } else {
      await supabase.from('propuestas').update({ ...form, cliente_nombre: cl?.nombre || '' }).eq('id', modal.id);
    }
    setSaving(false);
    setModal(null);
    setForm({ brief_id:'', cliente_id:'', titulo:'', canva_url:'', notas:'', estado:'borrador' });
    loadAll();
  }

  async function updateEstado(id, estado) {
    await supabase.from('propuestas').update({ estado }).eq('id', id);
    setPropuestas(prev => prev.map(p => p.id === id ? { ...p, estado } : p));
  }

  const filtered = propuestas
    .filter(p => !briefFiltroId || p.brief_id === briefFiltroId)
    .filter(p => filter === 'todos' || p.estado === filter);

  if (loading) return <div style={{ padding:'2rem', textAlign:'center', color:'#888' }}>Cargando propuestas…</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:'1.25rem' }}>
        <div style={{ display:'flex', gap:6, flex:1, flexWrap:'wrap' }}>
          {['todos',...ESTADOS_PROPUESTA].map(f => (
            <button key={f} onClick={()=>setFilter(f)} style={{ padding:'4px 12px', borderRadius:999, border:'1px solid', fontSize:12, cursor:'pointer', fontFamily:'inherit', background:filter===f?'#1a1a1a':'transparent', color:filter===f?'#fff':'#666', borderColor:filter===f?'#1a1a1a':'#ddd' }}>
              {f==='todos'?'Todas':ESTADOS_PROPUESTA_LABELS[f]||f}
            </button>
          ))}
        </div>
        {canCreate && <Btn size="sm" onClick={()=>{ setForm({ brief_id: briefFiltroId||'', cliente_id:'', titulo:'', canva_url:'', notas:'', estado:'borrador' }); setModal('new'); }}>+ Nueva propuesta</Btn>}
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:'1.25rem' }}>
        {ESTADOS_PROPUESTA.map(e => {
          const count = propuestas.filter(p=>p.estado===e).length;
          const color = ESTADOS_PROPUESTA_COLORS[e];
          return (
            <div key={e} style={{ background:'#fff', border:'1px solid #e8e8e8', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ fontSize:11, color:'#888', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }}>{ESTADOS_PROPUESTA_LABELS[e]}</div>
              <div style={{ fontSize:22, fontWeight:500, color }}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* Lista */}
      {filtered.length === 0
        ? <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>No hay propuestas para mostrar</div>
        : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filtered.map(p => {
              const br = briefs.find(b => b.id === p.brief_id);
              const colorLine = ESTADOS_PROPUESTA_COLORS[p.estado] || '#ddd';
              return (
                <div key={p.id} style={{ background:'#fff', border:'1px solid #e8e8e8', borderLeft:`4px solid ${colorLine}`, borderRadius:'0 10px 10px 0', padding:'14px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span style={{ fontWeight:500, fontSize:15 }}>{p.titulo}</span>
                        <StatusChip estado={p.estado}/>
                      </div>
                      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:5 }}>
                        {p.cliente_nombre && <span style={{ fontSize:12, color:'#777' }}>🏢 {p.cliente_nombre}</span>}
                        {br && <span style={{ fontSize:12, color:'#777' }}>📋 {br.nombre}</span>}
                        {p.created_at && <span style={{ fontSize:12, color:'#777' }}>📅 {fmtDate(p.created_at?.slice(0,10))}</span>}
                      </div>
                      <div style={{ display:'flex', gap:10, marginTop:6, flexWrap:'wrap', alignItems:'center' }}>
                        {p.canva_url && (
                          <a href={p.canva_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'#7c3aed', fontWeight:500, textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
                            🎨 Ver en Canva ↗
                          </a>
                        )}
                        {p.notas && <span style={{ fontSize:12, color:'#888', fontStyle:'italic' }} onClick={()=>setDetalle(p)}>Ver notas →</span>}
                        {p.brief_id && <span style={{ fontSize:12, color:'#7c3aed', cursor:'pointer', fontWeight:500 }} onClick={()=>setExpedienteId(p.brief_id)}>📁 Ver expediente</span>}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                      {canEdit ? (
                        <>
                          <select value={p.estado} onChange={e=>updateEstado(p.id,e.target.value)} style={{ fontSize:12, padding:'4px 8px', border:'1px solid #ddd', borderRadius:7, background:'#fff', color:'#1a1a1a', width:'auto', fontFamily:'inherit' }}>
                            {ESTADOS_PROPUESTA.map(e=><option key={e} value={e}>{ESTADOS_PROPUESTA_LABELS[e]}</option>)}
                          </select>
                          <button onClick={()=>{ setForm({ brief_id:p.brief_id||'', cliente_id:p.cliente_id||'', titulo:p.titulo, canva_url:p.canva_url||'', notas:p.notas||'', estado:p.estado }); setModal(p); }} style={{ padding:'4px 10px', fontSize:12, borderRadius:7, border:'1px solid #ddd', background:'transparent', color:'#555', cursor:'pointer', fontFamily:'inherit' }}>Editar</button>
                        </>
                      ) : (
                        <StatusChip estado={p.estado}/>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
      }

      {/* Modal nueva / editar propuesta */}
      <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==='new'?'Nueva propuesta creativa':'Editar propuesta'}
        footer={<><Btn variant="secondary" onClick={()=>setModal(null)}>Cancelar</Btn><Btn onClick={savePropuesta} disabled={saving}>{saving?'Guardando...':'Guardar'}</Btn></>}>
        <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
          <div>
            <label style={lbl}>Vinculado a proyecto / brief</label>
            <select value={form.brief_id} onChange={e=>set('brief_id',e.target.value)} style={sel}>
              <option value="">Sin vincular</option>
              {briefs.map(b=><option key={b.id} value={b.id}>{b.nombre} — {b.cliente_nombre}</option>)}
            </select>
          </div>
          {!form.brief_id && (
            <div>
              <label style={lbl}>Cliente <span style={{color:'#dc2626'}}>*</span></label>
              <select value={form.cliente_id} onChange={e=>set('cliente_id',e.target.value)} style={sel}>
                <option value="">Seleccioná...</option>
                {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={lbl}>Título de la propuesta <span style={{color:'#dc2626'}}>*</span></label>
            <input value={form.titulo} onChange={e=>set('titulo',e.target.value)} style={inp} placeholder="Ej: Concepto visual Acme 2026"/>
          </div>
          <div>
            <label style={lbl}>Link de Canva</label>
            <input value={form.canva_url} onChange={e=>set('canva_url',e.target.value)} style={inp} placeholder="https://www.canva.com/design/..."/>
            {form.canva_url && (
              <a href={form.canva_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'#7c3aed', marginTop:4, display:'block' }}>Verificar link ↗</a>
            )}
          </div>
          <div>
            <label style={lbl}>Estado</label>
            <select value={form.estado} onChange={e=>set('estado',e.target.value)} style={sel}>
              {ESTADOS_PROPUESTA.map(e=><option key={e} value={e}>{ESTADOS_PROPUESTA_LABELS[e]}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Notas / concepto</label>
            <textarea value={form.notas} onChange={e=>set('notas',e.target.value)} style={{...inp, minHeight:80, resize:'vertical'}} placeholder="Descripción del concepto, entregables, observaciones..."/>
          </div>
        </div>
      </Modal>

      {/* Modal detalle notas */}
      <Modal open={!!detalle} onClose={()=>setDetalle(null)} title={detalle?.titulo || ''} footer={<Btn variant="secondary" onClick={()=>setDetalle(null)}>Cerrar</Btn>}>
        {detalle && (
          <div>
            <StatusChip estado={detalle.estado}/>
            {detalle.canva_url && <div style={{ margin:'12px 0' }}><a href={detalle.canva_url} target="_blank" rel="noreferrer" style={{ fontSize:13, color:'#7c3aed', fontWeight:500 }}>🎨 Abrir en Canva ↗</a></div>}
            {detalle.notas && <><div style={{ height:1, background:'#eee', margin:'12px 0' }}/><div style={{ fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{detalle.notas}</div></>}
          </div>
        )}
      </Modal>

      {expedienteId && <ExpedientePanel briefId={expedienteId} onClose={()=>setExpedienteId(null)}/>}
    </div>
  );
}
