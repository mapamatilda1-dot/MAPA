import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const S = {
  page: { minHeight:'100vh', background:'#f5f4f0', fontFamily:'Arial,sans-serif' },
  header: { background:'#0d3b5e', padding:'16px 20px', display:'flex', alignItems:'center', gap:10 },
  card: { background:'#fff', borderRadius:12, padding:'14px', margin:'10px 12px', boxShadow:'0 1px 3px rgba(0,0,0,.08)' },
  input: { width:'100%', padding:'10px 12px', fontSize:14, border:'1px solid #ddd', borderRadius:8, fontFamily:'inherit', boxSizing:'border-box' },
  btnSm: { padding:'7px 14px', borderRadius:8, border:'1px solid #ddd', background:'#fff', fontSize:12, cursor:'pointer', fontFamily:'inherit' },
};

export default function InformePublico({ token }) {
  const [informe, setInforme] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openItem, setOpenItem] = useState(null);
  const [uploadingFor, setUploadingFor] = useState(null);

  useEffect(() => { load(); }, [token]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('informes').select('*').eq('token', token).single();
    if (error || !data) { setError('Informe no encontrado. Verifica el link.'); setLoading(false); return; }
    setInforme(data);
    setLoading(false);
  }

  async function guardar(cambios) {
    await supabase.from('informes').update({ ...cambios, updated_at: new Date().toISOString() }).eq('token', token);
  }

  async function uploadFoto(itemId, file) {
    setUploadingFor(itemId);
    const ext = file.name.split('.').pop();
    const fileName = `${token}/${itemId}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('informes').upload(fileName, file);
    if (error) { alert('Error: ' + error.message); setUploadingFor(null); return; }
    const { data: urlData } = supabase.storage.from('informes').getPublicUrl(fileName);
    const items = informe.items.map(it => it.item_id === itemId ? { ...it, fotos: [...it.fotos, urlData.publicUrl] } : it);
    setInforme(prev => ({ ...prev, items }));
    await guardar({ items });
    setUploadingFor(null);
  }

  function removeFoto(itemId, idx) {
    const items = informe.items.map(it => it.item_id === itemId ? { ...it, fotos: it.fotos.filter((_,i)=>i!==idx) } : it);
    setInforme(prev => ({ ...prev, items }));
    guardar({ items });
  }

  function actualizarComentario(itemId, texto) {
    const items = informe.items.map(it => it.item_id === itemId ? { ...it, comentario: texto } : it);
    setInforme(prev => ({ ...prev, items }));
  }

  if (loading) return (
    <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'#8aa0b8', fontSize:14 }}>Cargando informe...</div>
    </div>
  );

  if (error) return (
    <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
        <div style={{ color:'#c8264a', fontSize:15, fontWeight:600 }}>{error}</div>
      </div>
    </div>
  );

  const itemsIncluidos = informe.items.filter(it => it.incluido);

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ width:30, height:30, borderRadius:8, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#0d3b5e' }}>M</div>
        <span style={{ color:'#fff', fontSize:15, fontWeight:600 }}>Informe — {informe.evento_nombre}</span>
      </div>

      <div style={{ margin:'10px 12px', fontSize:12, color:'#8aa0b8', textAlign:'center' }}>
        Agregá fotos a los ítems del informe. Se guarda automáticamente.
      </div>

      {itemsIncluidos.length === 0 && (
        <div style={S.card}><div style={{ color:'#8aa0b8', fontSize:13, textAlign:'center' }}>Aún no hay ítems seleccionados para este informe.</div></div>
      )}

      {itemsIncluidos.map(it => {
        const isOpen = openItem === it.item_id;
        return (
          <div key={it.item_id} style={S.card}>
            <div onClick={()=>setOpenItem(isOpen ? null : it.item_id)} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
              <span style={{ flex:1, fontSize:14, fontWeight:700, color:'#0d3b5e' }}>{it.item_nombre}</span>
              {it.fotos.length > 0 && <span style={{ fontSize:11, color:'#8aa0b8' }}>📷 {it.fotos.length}</span>}
              <span style={{ fontSize:12, color:'#aab4c0' }}>{isOpen ? '▼' : '▶'}</span>
            </div>
            {isOpen && (
              <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #eef2f7' }}>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:10 }}>
                  {it.fotos.map((url, i) => (
                    <div key={i} style={{ position:'relative' }}>
                      <img src={url} alt="" style={{ width:90, height:90, objectFit:'cover', borderRadius:8, border:'1px solid #ddd' }}/>
                      <button onClick={()=>removeFoto(it.item_id, i)} style={{ position:'absolute', top:-6, right:-6, width:22, height:22, borderRadius:'50%', background:'#c8264a', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>✕</button>
                    </div>
                  ))}
                </div>
                <label style={{ display:'inline-block', cursor:'pointer', marginBottom:10 }}>
                  <input type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e=>{ const f=e.target.files[0]; if(f) uploadFoto(it.item_id, f); }}/>
                  <span style={{ ...S.btnSm, background:'#eef4fb', color:'#0d3b5e', display:'inline-block' }}>
                    {uploadingFor === it.item_id ? 'Subiendo...' : '📷 Agregar foto'}
                  </span>
                </label>
                <textarea
                  style={{ ...S.input, minHeight:60, resize:'vertical' }}
                  value={it.comentario}
                  onChange={e=>actualizarComentario(it.item_id, e.target.value)}
                  onBlur={()=>guardar({ items: informe.items })}
                  placeholder="Comentario sobre este ítem..."
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
