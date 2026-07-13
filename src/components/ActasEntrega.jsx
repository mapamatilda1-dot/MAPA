import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateActaPdfHTML } from './ActaPdfGenerator';

const S = {
  card: { background:'#fff', border:'1px solid #dde6ef', borderRadius:10, padding:'14px 16px', marginBottom:8 },
  input: { fontFamily:'inherit', fontSize:13, padding:'9px 12px', border:'1px solid #ddd', borderRadius:9, width:'100%', outline:'none' },
  label: { fontSize:12, fontWeight:500, color:'#666', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:5, display:'block' },
  btnPrimary: { padding:'9px 16px', borderRadius:9, border:'none', background:'#0d3b5e', color:'#fff', fontFamily:'inherit', fontSize:13, fontWeight:600, cursor:'pointer' },
  btnSecondary: { padding:'9px 16px', borderRadius:9, border:'1px solid #ddd', background:'#fff', color:'#333', fontFamily:'inherit', fontSize:13, cursor:'pointer' },
  btnSm: { padding:'5px 11px', borderRadius:7, border:'1px solid #ddd', background:'#fff', fontFamily:'inherit', fontSize:11, cursor:'pointer' },
};

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:560, maxHeight:'88vh', overflowY:'auto' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:15, fontWeight:700, color:'#0d3b5e' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#aaa' }}>×</button>
        </div>
        <div style={{ padding:20 }}>{children}</div>
      </div>
    </div>
  );
}

const BASE_URL = window.location.origin;

export default function ActasEntrega({ userEmail }) {
  const [actas, setActas] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new'
  const [linkCopiado, setLinkCopiado] = useState(null);

  const [form, setForm] = useState({
    presupuesto_id:'', evento_nombre:'', cliente_nombre:'', fecha_evento:'', lugar:'', lugar_entrega:'',
    persona_entrega:'', persona_recibe:'', listado_items:'',
  });
  const [pptoSearch, setPptoSearch] = useState('');
  const [pptoDropdownOpen, setPptoDropdownOpen] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: ac }, { data: pp }] = await Promise.all([
      supabase.from('actas_entrega').select('*').order('created_at', { ascending:false }),
      supabase.from('presupuestos').select('id,nombre,cliente,fecha_evento,lugar,nomenclatura,estado').order('created_at', { ascending:false }).limit(200),
    ]);
    setActas(ac || []);
    setPresupuestos(pp || []);
    setLoading(false);
  }

  function selectPpto(id) {
    const pp = presupuestos.find(p => p.id === id);
    setForm(f => ({
      ...f, presupuesto_id: id,
      evento_nombre: pp?.nombre || '',
      cliente_nombre: pp?.cliente || '',
      fecha_evento: pp?.fecha_evento || '',
      lugar: pp?.lugar || '',
    }));
    setPptoSearch(pp ? `${pp.nomenclatura ? pp.nomenclatura+' — ' : ''}${pp.nombre} — ${pp.cliente||''}` : '');
    setPptoDropdownOpen(false);
  }

  const pptosFiltrados = presupuestos.filter(p => {
    if (!pptoSearch.trim()) return true;
    const q = pptoSearch.toLowerCase();
    return (p.nomenclatura||'').toLowerCase().includes(q)
        || (p.nombre||'').toLowerCase().includes(q)
        || (p.cliente||'').toLowerCase().includes(q);
  });

  async function crearActa() {
    if (!form.evento_nombre.trim()) { alert('El nombre del evento es obligatorio'); return; }
    const { data, error } = await supabase.from('actas_entrega').insert({
      presupuesto_id: form.presupuesto_id || null,
      presupuesto_nombre: form.evento_nombre,
      cliente_nombre: form.cliente_nombre,
      evento_nombre: form.evento_nombre,
      fecha_evento: form.fecha_evento || null,
      lugar: form.lugar,
      lugar_entrega: form.lugar_entrega,
      persona_entrega: form.persona_entrega,
      persona_recibe: form.persona_recibe,
      listado_items: form.listado_items,
      created_by: userEmail,
    }).select().single();
    if (error) { alert('Error: ' + error.message); return; }
    setModal(null);
    setForm({ presupuesto_id:'', evento_nombre:'', cliente_nombre:'', fecha_evento:'', lugar:'', lugar_entrega:'', persona_entrega:'', persona_recibe:'', listado_items:'' });
    setPptoSearch('');
    load();
    // Mostrar el link recién creado
    copiarLink(data.token, data.id);
  }

  function copiarLink(token, id) {
    const url = `${BASE_URL}/acta/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopiado(id);
      setTimeout(() => setLinkCopiado(null), 2500);
    });
  }

  async function eliminarActa(id) {
    if (!window.confirm('¿Eliminar esta acta?')) return;
    await supabase.from('actas_entrega').delete().eq('id', id);
    load();
  }

  if (loading) return <div style={{ padding:'2rem', textAlign:'center', color:'#888' }}>Cargando actas…</div>;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:20, fontWeight:700, color:'#0d3b5e', margin:0 }}>📝 Actas de Entrega</h2>
        <button style={S.btnPrimary} onClick={()=>{ setForm({ presupuesto_id:'', evento_nombre:'', cliente_nombre:'', fecha_evento:'', lugar:'', lugar_entrega:'', persona_entrega:'', persona_recibe:'', listado_items:'' }); setPptoSearch(''); setModal('new'); }}>+ Nueva acta</button>
      </div>

      {actas.length === 0 && <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>Sin actas registradas.</div>}

      {actas.map(a => (
        <div key={a.id} style={{ ...S.card, borderLeft: a.estado==='firmada' ? '4px solid #2e8b4e' : '4px solid #e8a020' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontWeight:700, fontSize:14, color:'#0d3b5e' }}>{a.evento_nombre}</span>
                <span style={{ fontSize:11, padding:'2px 9px', borderRadius:999, fontWeight:600, background: a.estado==='firmada'?'#e8f5ee':'#fff3da', color: a.estado==='firmada'?'#2e8b4e':'#a07020' }}>
                  {a.estado==='firmada' ? '✓ Firmada' : 'Pendiente de firma'}
                </span>
              </div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:5, fontSize:12, color:'#777' }}>
                {a.cliente_nombre && <span>🏢 {a.cliente_nombre}</span>}
                {a.fecha_evento && <span>📅 {a.fecha_evento}</span>}
                {a.persona_entrega && <span>👤 Entrega: {a.persona_entrega}</span>}
                {a.persona_recibe && <span>👤 Recibe: {a.persona_recibe}</span>}
              </div>
              {a.estado === 'firmada' && a.fecha_firma && (
                <div style={{ fontSize:11, color:'#2e8b4e', marginTop:4 }}>
                  Firmada el {new Date(a.fecha_firma).toLocaleString('es-EC')}
                </div>
              )}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0 }}>
              {a.estado === 'firmada' && (
                <button style={{ ...S.btnSm, background:'#0d3b5e', color:'#fff', border:'none' }} onClick={()=>{
                  const html = generateActaPdfHTML(a);
                  const w = window.open('', '_blank');
                  if(!w){alert('Permití ventanas emergentes para ver el PDF');return;}
                  w.document.write(html); w.document.close();
                }}>📄 PDF</button>
              )}
              <button style={S.btnSm} onClick={()=>copiarLink(a.token, a.id)}>
                {linkCopiado === a.id ? '✓ Copiado' : '🔗 Copiar link'}
              </button>
              <button style={{ ...S.btnSm, color:'#c8264a', borderColor:'#c8264a44' }} onClick={()=>eliminarActa(a.id)}>🗑 Eliminar</button>
            </div>
          </div>
          {a.estado === 'firmada' && (a.firma_entrega_url || a.firma_recibe_url) && (
            <div style={{ display:'flex', gap:10, marginTop:10, paddingTop:10, borderTop:'1px solid #eef2f7' }}>
              {a.firma_entrega_url && <img src={a.firma_entrega_url} alt="" style={{ height:50, border:'1px solid #eee', borderRadius:6 }}/>}
              {a.firma_recibe_url && <img src={a.firma_recibe_url} alt="" style={{ height:50, border:'1px solid #eee', borderRadius:6 }}/>}
              {(a.fotos||[]).slice(0,3).map((f,i) => <img key={i} src={f} alt="" style={{ height:50, width:50, objectFit:'cover', border:'1px solid #eee', borderRadius:6 }}/>)}
              {(a.fotos||[]).length > 3 && <span style={{ fontSize:11, color:'#8aa0b8', alignSelf:'center' }}>+{a.fotos.length-3} más</span>}
            </div>
          )}
        </div>
      ))}

      <Modal open={modal==='new'} onClose={()=>setModal(null)} title="Nueva acta de entrega">
        <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
          <div style={{ position:'relative' }}>
            <label style={S.label}>Vincular a presupuesto (opcional)</label>
            <input
              style={S.input}
              value={pptoSearch}
              onChange={e=>{ setPptoSearch(e.target.value); setPptoDropdownOpen(true); if(!e.target.value) selectPpto(''); }}
              onFocus={()=>setPptoDropdownOpen(true)}
              onBlur={()=>setTimeout(()=>setPptoDropdownOpen(false), 150)}
              placeholder="Escribí para buscar por número, nombre o cliente…"
            />
            {pptoDropdownOpen && (
              <div style={{ position:'absolute', zIndex:20, top:'100%', left:0, right:0, background:'#fff', border:'1px solid #ddd', borderRadius:9, marginTop:4, maxHeight:260, overflowY:'auto', boxShadow:'0 4px 14px rgba(0,0,0,.12)' }}>
                <div onMouseDown={()=>selectPpto('')} style={{ padding:'9px 12px', fontSize:13, cursor:'pointer', color:'#888', borderBottom:'1px solid #f0f0f0' }}>Sin vincular</div>
                {pptosFiltrados.length === 0 && <div style={{ padding:'9px 12px', fontSize:13, color:'#bbb' }}>Sin resultados</div>}
                {pptosFiltrados.map(p => (
                  <div key={p.id} onMouseDown={()=>selectPpto(p.id)} style={{ padding:'9px 12px', fontSize:13, cursor:'pointer', borderBottom:'1px solid #f7f7f7' }}>
                    {p.nomenclatura && <strong style={{ color:'#0d3b5e' }}>{p.nomenclatura}</strong>} {p.nomenclatura && '— '}{p.nombre} <span style={{ color:'#999' }}>— {p.cliente}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={S.label}>Nombre del evento *</label>
            <input style={S.input} value={form.evento_nombre} onChange={e=>setForm(f=>({...f,evento_nombre:e.target.value}))} placeholder="Ej: Activación Stand Pepsi"/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={S.label}>Cliente</label>
              <input style={S.input} value={form.cliente_nombre} onChange={e=>setForm(f=>({...f,cliente_nombre:e.target.value}))}/>
            </div>
            <div>
              <label style={S.label}>Fecha del evento</label>
              <input type="date" style={S.input} value={form.fecha_evento} onChange={e=>setForm(f=>({...f,fecha_evento:e.target.value}))}/>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={S.label}>Lugar del evento</label>
              <input style={S.input} value={form.lugar} onChange={e=>setForm(f=>({...f,lugar:e.target.value}))}/>
            </div>
            <div>
              <label style={S.label}>Lugar de entrega</label>
              <input style={S.input} value={form.lugar_entrega} onChange={e=>setForm(f=>({...f,lugar_entrega:e.target.value}))} placeholder="Ej: Planta Norte Quito"/>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={S.label}>Persona que entrega (opcional)</label>
              <input style={S.input} value={form.persona_entrega} onChange={e=>setForm(f=>({...f,persona_entrega:e.target.value}))} placeholder="Se puede completar al firmar"/>
            </div>
            <div>
              <label style={S.label}>Persona que recibe (opcional)</label>
              <input style={S.input} value={form.persona_recibe} onChange={e=>setForm(f=>({...f,persona_recibe:e.target.value}))} placeholder="Se puede completar al firmar"/>
            </div>
          </div>
          <div>
            <label style={S.label}>Listado de ítems (opcional)</label>
            <textarea style={{ ...S.input, minHeight:70, resize:'vertical' }} value={form.listado_items} onChange={e=>setForm(f=>({...f,listado_items:e.target.value}))} placeholder="Se puede completar al firmar, desde el celular"/>
          </div>
          <div style={{ background:'#eef4fb', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#0d3b5e' }}>
            💡 Al crear el acta se genera un link único. Lo copiás y lo enviás por WhatsApp al proveedor o persona que entrega — no necesita cuenta para firmar.
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <button style={S.btnSecondary} onClick={()=>setModal(null)}>Cancelar</button>
            <button style={S.btnPrimary} onClick={crearActa}>Crear acta y copiar link</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
