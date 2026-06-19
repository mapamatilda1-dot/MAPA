import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateScoutingPdfHTML } from './ScoutingPdfGenerator';

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

export default function ScoutingTab({ userEmail }) {
  const [scoutings, setScoutings] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [linkCopiado, setLinkCopiado] = useState(null);

  const [form, setForm] = useState({ presupuesto_id:'', lugar:'', cliente_nombre:'' });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: sc }, { data: pp }] = await Promise.all([
      supabase.from('scoutings').select('*').order('created_at', { ascending:false }),
      supabase.from('presupuestos').select('id,nombre,cliente,lugar').order('created_at', { ascending:false }).limit(200),
    ]);
    setScoutings(sc || []);
    setPresupuestos(pp || []);
    setLoading(false);
  }

  function selectPpto(id) {
    const pp = presupuestos.find(p => p.id === id);
    setForm(f => ({ ...f, presupuesto_id: id, lugar: pp?.lugar || f.lugar, cliente_nombre: pp?.cliente || '' }));
  }

  async function crearScouting() {
    if (!form.lugar.trim()) { alert('El lugar es obligatorio'); return; }
    const pp = presupuestos.find(p => p.id === form.presupuesto_id);
    const { data, error } = await supabase.from('scoutings').insert({
      presupuesto_id: form.presupuesto_id || null,
      presupuesto_nombre: pp?.nombre || '',
      cliente_nombre: form.cliente_nombre,
      lugar: form.lugar,
      created_by: userEmail,
    }).select().single();
    if (error) { alert('Error: ' + error.message); return; }
    setModal(null);
    setForm({ presupuesto_id:'', lugar:'', cliente_nombre:'' });
    load();
    copiarLink(data.token, data.id);
  }

  function copiarLink(token, id) {
    const url = `${BASE_URL}/scouting/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopiado(id);
      setTimeout(() => setLinkCopiado(null), 2500);
    });
  }

  async function eliminarScouting(id) {
    if (!window.confirm('¿Eliminar este scouting?')) return;
    await supabase.from('scoutings').delete().eq('id', id);
    load();
  }

  if (loading) return <div style={{ padding:'2rem', textAlign:'center', color:'#888' }}>Cargando scoutings…</div>;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:20, fontWeight:700, color:'#0d3b5e', margin:0 }}>📍 Scouting</h2>
        <button style={S.btnPrimary} onClick={()=>setModal('new')}>+ Nuevo scouting</button>
      </div>

      {scoutings.length === 0 && <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>Sin scoutings registrados.</div>}

      {scoutings.map(s => (
        <div key={s.id} style={{ ...S.card, borderLeft: s.estado==='completado' ? '4px solid #2e8b4e' : '4px solid #e8a020' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontWeight:700, fontSize:14, color:'#0d3b5e' }}>{s.lugar}</span>
                <span style={{ fontSize:11, padding:'2px 9px', borderRadius:999, fontWeight:600, background: s.estado==='completado'?'#e8f5ee':'#fff3da', color: s.estado==='completado'?'#2e8b4e':'#a07020' }}>
                  {s.estado==='completado' ? '✓ Completado' : 'En proceso'}
                </span>
              </div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:5, fontSize:12, color:'#777' }}>
                {s.cliente_nombre && <span>🏢 {s.cliente_nombre}</span>}
                {s.presupuesto_nombre && <span>💰 {s.presupuesto_nombre}</span>}
                <span>📷 {(s.fotos||[]).length} fotos</span>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0 }}>
              {s.estado === 'completado' && (
                <button style={{ ...S.btnSm, background:'#0d3b5e', color:'#fff', border:'none' }} onClick={()=>{
                  const html = generateScoutingPdfHTML(s);
                  const w = window.open('', '_blank');
                  if(!w){alert('Permití ventanas emergentes para ver el PDF');return;}
                  w.document.write(html); w.document.close();
                }}>📄 PDF</button>
              )}
              <button style={S.btnSm} onClick={()=>copiarLink(s.token, s.id)}>
                {linkCopiado === s.id ? '✓ Copiado' : '🔗 Copiar link'}
              </button>
              <button style={{ ...S.btnSm, color:'#c8264a', borderColor:'#c8264a44' }} onClick={()=>eliminarScouting(s.id)}>🗑 Eliminar</button>
            </div>
          </div>
          {(s.fotos||[]).length > 0 && (
            <div style={{ display:'flex', gap:8, marginTop:10, paddingTop:10, borderTop:'1px solid #eef2f7', overflowX:'auto' }}>
              {s.fotos.slice(0,5).map((f,i) => <img key={i} src={f.url} alt="" style={{ height:55, width:55, objectFit:'cover', border:'1px solid #eee', borderRadius:6, flexShrink:0 }}/>)}
              {s.fotos.length > 5 && <span style={{ fontSize:11, color:'#8aa0b8', alignSelf:'center' }}>+{s.fotos.length-5} más</span>}
            </div>
          )}
        </div>
      ))}

      <Modal open={modal==='new'} onClose={()=>setModal(null)} title="Nuevo scouting">
        <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
          <div>
            <label style={S.label}>Vincular a presupuesto (opcional)</label>
            <select value={form.presupuesto_id} onChange={e=>selectPpto(e.target.value)} style={S.input}>
              <option value="">Sin vincular</option>
              {presupuestos.map(p => <option key={p.id} value={p.id}>{p.nombre} — {p.cliente}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Lugar a visitar *</label>
            <input style={S.input} value={form.lugar} onChange={e=>setForm(f=>({...f,lugar:e.target.value}))} placeholder="Ej: Salón Mirador Hotel X"/>
          </div>
          <div>
            <label style={S.label}>Cliente</label>
            <input style={S.input} value={form.cliente_nombre} onChange={e=>setForm(f=>({...f,cliente_nombre:e.target.value}))}/>
          </div>
          <div style={{ background:'#eef4fb', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#0d3b5e' }}>
            💡 Al crear se genera un link único. Lo abrís desde tu celular en el lugar y vas subiendo fotos con comentarios — se guarda automáticamente.
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <button style={S.btnSecondary} onClick={()=>setModal(null)}>Cancelar</button>
            <button style={S.btnPrimary} onClick={crearScouting}>Crear y copiar link</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
