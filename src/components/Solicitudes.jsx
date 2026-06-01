import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

function fmt(n) {
  return '$' + (Number(n)||0).toLocaleString('es-EC', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function fmtDate(s) {
  if (!s) return '—';
  const [y,m,d] = s.split('-');
  return `${d}/${m}/${y}`;
}

const inp = { fontFamily:'inherit', fontSize:13, padding:'8px 10px', border:'1px solid #ddd', borderRadius:8, outline:'none', width:'100%' };
const lbl = { fontSize:11, fontWeight:600, color:'#666', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4, display:'block' };

function Btn({ onClick, variant='primary', size='md', disabled, children, style={} }) {
  const base = { display:'inline-flex', alignItems:'center', gap:5, borderRadius:8, fontFamily:'inherit', fontWeight:500, cursor:disabled?'not-allowed':'pointer', border:'1px solid transparent', opacity:disabled?.6:1, transition:'all .15s', ...style };
  const v = {
    primary:  { background:'#0d3b5e', color:'#fff' },
    secondary:{ background:'#fff', color:'#333', borderColor:'#ddd' },
    danger:   { background:'#dc2626', color:'#fff' },
    green:    { background:'#2e8b4e', color:'#fff' },
  };
  const s = { sm:{ padding:'5px 12px', fontSize:12 }, md:{ padding:'7px 14px', fontSize:13 }, xs:{ padding:'3px 9px', fontSize:11 } };
  return <button onClick={onClick} disabled={disabled} style={{...base,...v[variant],...s[size]}}>{children}</button>;
}

const ESTADO_COLORS = {
  borrador: { bg:'#f3f4f6', color:'#555' },
  enviada:  { bg:'#dbeafe', color:'#1e40af' },
  aprobada: { bg:'#dcfce7', color:'#166534' },
  rechazada:{ bg:'#fee2e2', color:'#991b1b' },
};
const ESTADO_LABELS = { borrador:'Borrador', enviada:'Enviada', aprobada:'Aprobada', rechazada:'Rechazada' };

function EstadoBadge({ estado }) {
  const c = ESTADO_COLORS[estado] || ESTADO_COLORS.borrador;
  return <span style={{ fontSize:11, padding:'2px 9px', borderRadius:999, fontWeight:500, ...c }}>{ESTADO_LABELS[estado]||estado}</span>;
}

// ══════════════════════════════════════════════════════════════
// EDITOR DE SOLICITUD
// ══════════════════════════════════════════════════════════════
function SolicitudEditor({ solicitud, presupuestos, userEmail, userName, onSave, onCancel, onEnviar }) {
  const [form, setForm] = useState(() => solicitud || {
    presupuesto_id: '', presupuesto_nombre: '', cliente_nombre: '', fecha_evento: null,
    items: [], notas: '', estado: 'borrador', created_by: userEmail, created_by_nombre: userName,
  });
  const [ppto, setPpto]   = useState(null);
  const [saving, setSaving] = useState(false);

  // Cargar ítems del presupuesto seleccionado
  async function loadPpto(pptoId) {
    if (!pptoId) { setPpto(null); setForm(f => ({ ...f, presupuesto_id:'', presupuesto_nombre:'', cliente_nombre:'', fecha_evento:null, items:[] })); return; }
    const { data } = await supabase.from('presupuestos').select('*').eq('id', pptoId).single();
    if (!data) return;
    setPpto(data);

    // Convertir ítems del presupuesto en solicitud items
    const items = (data.items || [])
      .filter(it => !it._type) // excluir subcategorías
      .map(it => ({
        id:               it.id,
        item:             it.item || '',
        subcategoria:     it.subcategoria || '',
        categoria:        it.categoria || '',
        cantidad:         Number(it.cantidad || 0),
        dias:             Number(it.dias || 1),
        costo_presupuestado: Number(it.costo_unit || 0) * Number(it.cantidad || 0) * Number(it.dias || 1),
        valor_solicitado: 0,
        notas:            '',
        seleccionado:     false,
      }));

    setForm(f => ({
      ...f,
      presupuesto_id:    data.id,
      presupuesto_nombre: data.nombre || data.cliente,
      cliente_nombre:    data.cliente,
      fecha_evento:      data.fecha_evento,
      items,
    }));
  }

  function updateItem(id, field, value) {
    setForm(f => ({ ...f, items: f.items.map(it => it.id === id ? { ...it, [field]: value } : it) }));
  }

  function toggleItem(id) {
    setForm(f => ({ ...f, items: f.items.map(it => it.id === id ? { ...it, seleccionado: !it.seleccionado } : it) }));
  }

  const itemsSeleccionados = form.items.filter(it => it.seleccionado);
  const totalSolicitado = itemsSeleccionados.reduce((a, it) => a + Number(it.valor_solicitado || 0), 0);
  const totalPresupuestado = itemsSeleccionados.reduce((a, it) => a + Number(it.costo_presupuestado || 0), 0);
  const saldoTotal = totalPresupuestado - totalSolicitado;

  async function handleSave() {
    if (!form.presupuesto_id) { alert('Seleccioná un presupuesto'); return; }
    if (itemsSeleccionados.length === 0) { alert('Seleccioná al menos un ítem'); return; }
    setSaving(true);
    await onSave({ ...form, items: form.items.filter(it => it.seleccionado) });
    setSaving(false);
  }

  async function handleEnviar() {
    if (!form.presupuesto_id) { alert('Seleccioná un presupuesto'); return; }
    if (itemsSeleccionados.length === 0) { alert('Seleccioná al menos un ítem'); return; }
    if (!window.confirm('¿Enviar la solicitud a Financiero? Se enviará un correo automáticamente.')) return;
    setSaving(true);
    await onEnviar({ ...form, items: form.items.filter(it => it.seleccionado), estado: 'enviada' });
    setSaving(false);
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <button onClick={onCancel} style={{ background:'none', border:'1px solid #ddd', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>← Volver</button>
        <h2 style={{ fontSize:17, fontWeight:700, color:'#0d3b5e', flex:1 }}>{solicitud ? 'Editar solicitud' : 'Nueva solicitud de valores'}</h2>
      </div>

      {/* Selección de presupuesto */}
      <div style={{ background:'#fff', border:'1px solid #e8e8e8', borderRadius:12, padding:'18px 20px', marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#0d3b5e', marginBottom:14 }}>Presupuesto vinculado</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={lbl}>Presupuesto *</label>
            <select value={form.presupuesto_id} onChange={e=>loadPpto(e.target.value)} style={inp}>
              <option value="">Seleccioná un presupuesto...</option>
              {presupuestos.map(p=><option key={p.id} value={p.id}>{p.nomenclatura ? `${p.nomenclatura} — ` : ''}{p.nombre||p.cliente}</option>)}
            </select>
          </div>
          {ppto && <>
            <div style={{ background:'#f8fafc', borderRadius:8, padding:'10px 14px' }}>
              <div style={{ fontSize:10, color:'#888', marginBottom:2 }}>Cliente</div>
              <div style={{ fontSize:13, fontWeight:600 }}>{ppto.cliente}</div>
            </div>
            <div style={{ background:'#f8fafc', borderRadius:8, padding:'10px 14px' }}>
              <div style={{ fontSize:10, color:'#888', marginBottom:2 }}>Fecha evento</div>
              <div style={{ fontSize:13, fontWeight:600 }}>{fmtDate(ppto.fecha_evento)}</div>
            </div>
          </>}
        </div>
      </div>

      {/* Tabla de ítems */}
      {form.items.length > 0 && (
        <div style={{ background:'#fff', border:'1px solid #e8e8e8', borderRadius:12, padding:'18px 20px', marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#0d3b5e', marginBottom:4 }}>Ítems del presupuesto</div>
          <div style={{ fontSize:12, color:'#888', marginBottom:14 }}>Seleccioná los ítems para los que vas a solicitar valores y completá el monto solicitado.</div>

          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#f0f4f8' }}>
                  <th style={{ padding:'8px 10px', width:36, textAlign:'center' }}>
                    <input type="checkbox"
                      checked={form.items.length > 0 && form.items.every(it=>it.seleccionado)}
                      onChange={e => setForm(f=>({...f, items: f.items.map(it=>({...it,seleccionado:e.target.checked}))}))}
                      style={{ width:15, height:15, cursor:'pointer' }}
                    />
                  </th>
                  {['Subcategoría','Ítem','Cant.','Días','Costo presupuestado','Valor solicitado','Saldo','Notas'].map(h=>(
                    <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontSize:11, color:'#666', fontWeight:700, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.items.map(it => {
                  const saldo = Number(it.costo_presupuestado||0) - Number(it.valor_solicitado||0);
                  return (
                    <tr key={it.id} style={{ borderBottom:'1px solid #f0f0f0', background: it.seleccionado ? '#f0f7ff' : '#fff' }}>
                      <td style={{ padding:'8px 10px', textAlign:'center' }}>
                        <input type="checkbox" checked={!!it.seleccionado} onChange={()=>toggleItem(it.id)} style={{ width:15, height:15, cursor:'pointer', accentColor:'#0d3b5e' }}/>
                      </td>
                      <td style={{ padding:'8px 10px', fontSize:12, color:'#888' }}>{it.subcategoria||'—'}</td>
                      <td style={{ padding:'8px 10px', fontWeight:500 }}>{it.item||'—'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'center' }}>{it.cantidad}</td>
                      <td style={{ padding:'8px 10px', textAlign:'center' }}>{it.dias}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:500, color:'#0d3b5e' }}>{fmt(it.costo_presupuestado)}</td>
                      <td style={{ padding:'8px 4px', minWidth:130 }}>
                        <input
                          type="number" min="0" step="0.01"
                          value={it.valor_solicitado||''}
                          disabled={!it.seleccionado}
                          placeholder="0.00"
                          onChange={e=>updateItem(it.id,'valor_solicitado',Number(e.target.value))}
                          style={{ ...inp, padding:'5px 8px', fontSize:12, textAlign:'right', background:it.seleccionado?'#fff':'#f8f8f8' }}
                        />
                      </td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:600, color: saldo >= 0 ? '#2e8b4e' : '#dc2626' }}>
                        {it.seleccionado ? fmt(saldo) : '—'}
                      </td>
                      <td style={{ padding:'8px 4px', minWidth:150 }}>
                        <input
                          value={it.notas||''}
                          disabled={!it.seleccionado}
                          placeholder="Observaciones..."
                          onChange={e=>updateItem(it.id,'notas',e.target.value)}
                          style={{ ...inp, padding:'5px 8px', fontSize:12, background:it.seleccionado?'#fff':'#f8f8f8' }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Resumen */}
          {itemsSeleccionados.length > 0 && (
            <div style={{ marginTop:16, background:'#0d3b5e', borderRadius:10, padding:'14px 18px' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,.8)', marginBottom:10 }}>
                Resumen — {itemsSeleccionados.length} ítem(s) seleccionado(s)
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                <div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.6)', marginBottom:3, textTransform:'uppercase', letterSpacing:'.04em' }}>Costo presupuestado</div>
                  <div style={{ fontSize:16, fontWeight:700, color:'#fff' }}>{fmt(totalPresupuestado)}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.6)', marginBottom:3, textTransform:'uppercase', letterSpacing:'.04em' }}>Valor solicitado</div>
                  <div style={{ fontSize:16, fontWeight:700, color:'#3dbfb8' }}>{fmt(totalSolicitado)}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.6)', marginBottom:3, textTransform:'uppercase', letterSpacing:'.04em' }}>Saldo</div>
                  <div style={{ fontSize:16, fontWeight:700, color: saldoTotal >= 0 ? '#5dc98a' : '#ff6b6b' }}>{fmt(saldoTotal)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notas generales */}
      <div style={{ background:'#fff', border:'1px solid #e8e8e8', borderRadius:12, padding:'18px 20px', marginBottom:16 }}>
        <label style={lbl}>Notas de la solicitud</label>
        <textarea value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} style={{ ...inp, minHeight:70, resize:'vertical' }} placeholder="Observaciones generales, urgencia, instrucciones para financiero..."/>
      </div>

      {/* Botones */}
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <Btn variant="secondary" onClick={onCancel}>Cancelar</Btn>
        <Btn variant="secondary" onClick={handleSave} disabled={saving}>💾 Guardar borrador</Btn>
        <Btn variant="danger" onClick={handleEnviar} disabled={saving} style={{ background:'#dc2626' }}>
          📤 Mandar solicitud
        </Btn>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function Solicitudes({ userRole, userEmail, userName }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(null); // null | 'new' | solicitud
  const [toast, setToast]       = useState('');
  const [filtro, setFiltro]     = useState('todos');

  const canCreate = ['admin','produccion'].includes(userRole);

  function showToast(m) { setToast(m); setTimeout(()=>setToast(''),3000); }

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [solR, ppR] = await Promise.all([
      supabase.from('solicitudes').select('*').order('created_at', { ascending:false }),
      supabase.from('presupuestos').select('id, nombre, cliente, nomenclatura, fecha_evento, items').order('created_at', { ascending:false }),
    ]);
    setSolicitudes(solR.data || []);
    setPresupuestos(ppR.data || []);
    setLoading(false);
  }

  async function saveSolicitud(data) {
    if (data.id) {
      await supabase.from('solicitudes').update(data).eq('id', data.id);
    } else {
      const { data: newSol } = await supabase.from('solicitudes').insert({ ...data, created_by: userEmail, created_by_nombre: userName }).select().single();
      if (newSol) { setEditing(newSol); loadAll(); showToast('Solicitud guardada ✓'); return; }
    }
    loadAll();
    showToast('Solicitud guardada ✓');
    // Nos quedamos en la página para seguir editando
  }

  async function enviarSolicitud(data) {
    // Guardar con estado enviada
    if (data.id) {
      await supabase.from('solicitudes').update({ ...data, estado:'enviada' }).eq('id', data.id);
    } else {
      await supabase.from('solicitudes').insert({ ...data, estado:'enviada', created_by: userEmail, created_by_nombre: userName });
    }

    // Disparar correo via Edge Function
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-solicitud`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ solicitud: data, userEmail, userName }),
      });
    } catch (e) { console.error('Error notificando:', e); }

    setEditing(null);
    loadAll();
    showToast('✅ Solicitud enviada a Financiero');
  }

  async function cambiarEstado(id, estado) {
    await supabase.from('solicitudes').update({ estado }).eq('id', id);
    setSolicitudes(prev => prev.map(s => s.id === id ? { ...s, estado } : s));
    showToast(`Estado: ${ESTADO_LABELS[estado]}`);
  }

  const filtered = solicitudes.filter(s => filtro === 'todos' || s.estado === filtro);

  if (loading) return <div style={{ padding:'2rem', textAlign:'center', color:'#888' }}>Cargando solicitudes…</div>;

  if (editing !== null) {
    return <SolicitudEditor
      solicitud={editing === 'new' ? null : editing}
      presupuestos={presupuestos}
      userEmail={userEmail}
      userName={userName}
      onSave={saveSolicitud}
      onEnviar={enviarSolicitud}
      onCancel={()=>setEditing(null)}
    />;
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <h2 style={{ fontSize:18, fontWeight:700, color:'#0d3b5e' }}>📤 Solicitudes de valores</h2>
        {canCreate && <Btn onClick={()=>setEditing('new')}>+ Nueva solicitud</Btn>}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {['todos','borrador','enviada','aprobada','rechazada'].map(f=>(
          <button key={f} onClick={()=>setFiltro(f)} style={{
            padding:'4px 12px', borderRadius:999, border:'1px solid', fontSize:12,
            cursor:'pointer', fontFamily:'inherit',
            background: filtro===f?'#0d3b5e':'transparent',
            color:      filtro===f?'#fff':'#555',
            borderColor:filtro===f?'#0d3b5e':'#ddd',
          }}>
            {f==='todos'?'Todas':ESTADO_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtered.length === 0 && (
        <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>
          {solicitudes.length === 0 ? 'Sin solicitudes aún' : 'Sin resultados para el filtro seleccionado'}
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filtered.map(sol => {
          const totalSol = (sol.items||[]).reduce((a,it)=>a+Number(it.valor_solicitado||0),0);
          const totalPpto = (sol.items||[]).reduce((a,it)=>a+Number(it.costo_presupuestado||0),0);
          const saldo = totalPpto - totalSol;
          const c = ESTADO_COLORS[sol.estado] || ESTADO_COLORS.borrador;
          return (
            <div key={sol.id} style={{ background:'#fff', border:'1px solid #e8e8e8', borderLeft:`4px solid ${c.color}`, borderRadius:'0 10px 10px 0', padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:8, justifyContent:'space-between' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                    <span style={{ fontWeight:600, fontSize:15 }}>{sol.presupuesto_nombre || '—'}</span>
                    <EstadoBadge estado={sol.estado}/>
                  </div>
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:12, color:'#777' }}>
                    {sol.cliente_nombre && <span>🏢 {sol.cliente_nombre}</span>}
                    {sol.fecha_evento   && <span>📅 {fmtDate(sol.fecha_evento)}</span>}
                    {sol.created_by_nombre && <span>👤 {sol.created_by_nombre}</span>}
                    <span>📋 {(sol.items||[]).length} ítem(s)</span>
                  </div>

                  {/* Resumen financiero */}
                  <div style={{ display:'flex', gap:16, marginTop:8, flexWrap:'wrap' }}>
                    <span style={{ fontSize:12, color:'#0d3b5e' }}>Presupuestado: <strong>{fmt(totalPpto)}</strong></span>
                    <span style={{ fontSize:12, color:'#3dbfb8' }}>Solicitado: <strong>{fmt(totalSol)}</strong></span>
                    <span style={{ fontSize:12, color: saldo>=0?'#2e8b4e':'#dc2626' }}>Saldo: <strong>{fmt(saldo)}</strong></span>
                  </div>

                  {sol.notas && <div style={{ fontSize:12, color:'#888', marginTop:5, fontStyle:'italic' }}>"{sol.notas}"</div>}
                </div>

                <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap', alignItems:'center' }}>
                  {/* Financiero puede aprobar/rechazar */}
                  {['admin','financiero'].includes(userRole) && sol.estado === 'enviada' && (
                    <>
                      <Btn size="xs" variant="green" onClick={()=>cambiarEstado(sol.id,'aprobada')}>✓ Aprobar</Btn>
                      <Btn size="xs" variant="danger" onClick={()=>cambiarEstado(sol.id,'rechazada')}>✕ Rechazar</Btn>
                    </>
                  )}
                  {canCreate && sol.estado === 'borrador' && (
                    <Btn size="xs" variant="secondary" onClick={()=>setEditing(sol)}>Editar</Btn>
                  )}
                </div>
              </div>

              {/* Detalle de ítems expandible */}
              {(sol.items||[]).length > 0 && (
                <details style={{ marginTop:10 }}>
                  <summary style={{ fontSize:12, color:'#0d3b5e', cursor:'pointer', fontWeight:500 }}>Ver ítems ({sol.items.length})</summary>
                  <div style={{ marginTop:8, overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:'#f0f4f8' }}>
                          {['Subcategoría','Ítem','Costo ppto.','Valor solicitado','Saldo','Notas'].map(h=>(
                            <th key={h} style={{ padding:'6px 10px', textAlign:'left', fontSize:11, color:'#666', fontWeight:700 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sol.items.map(it => {
                          const saldoIt = Number(it.costo_presupuestado||0) - Number(it.valor_solicitado||0);
                          return (
                            <tr key={it.id} style={{ borderBottom:'1px solid #f0f0f0' }}>
                              <td style={{ padding:'6px 10px', color:'#888' }}>{it.subcategoria||'—'}</td>
                              <td style={{ padding:'6px 10px', fontWeight:500 }}>{it.item||'—'}</td>
                              <td style={{ padding:'6px 10px', textAlign:'right' }}>{fmt(it.costo_presupuestado)}</td>
                              <td style={{ padding:'6px 10px', textAlign:'right', color:'#0d3b5e', fontWeight:600 }}>{fmt(it.valor_solicitado)}</td>
                              <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:600, color:saldoIt>=0?'#2e8b4e':'#dc2626' }}>{fmt(saldoIt)}</td>
                              <td style={{ padding:'6px 10px', color:'#888' }}>{it.notas||'—'}</td>
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

      {toast && <div style={{ position:'fixed', bottom:24, right:24, background:'#0d3b5e', color:'#fff', padding:'10px 18px', borderRadius:10, fontSize:13, zIndex:999, boxShadow:'0 4px 16px rgba(0,0,0,.2)' }}>{toast}</div>}
    </div>
  );
}
