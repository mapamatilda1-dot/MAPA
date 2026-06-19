import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { generateInformePdfHTML } from './InformePdfGenerator';

const S = {
  input: { fontFamily:'inherit', fontSize:13, padding:'9px 12px', border:'1px solid #ddd', borderRadius:9, width:'100%', outline:'none' },
  label: { fontSize:11, fontWeight:700, color:'#8aa0b8', textTransform:'uppercase', letterSpacing:.5, marginBottom:4, display:'block' },
  btnPrimary: { padding:'9px 16px', borderRadius:9, border:'none', background:'#0d3b5e', color:'#fff', fontFamily:'inherit', fontSize:13, fontWeight:600, cursor:'pointer' },
  btnSecondary: { padding:'9px 16px', borderRadius:9, border:'1px solid #ddd', background:'#fff', color:'#333', fontFamily:'inherit', fontSize:13, cursor:'pointer' },
  btnSm: { padding:'5px 11px', borderRadius:7, border:'1px solid #ddd', background:'#fff', fontFamily:'inherit', fontSize:11, cursor:'pointer' },
};

const BASE_URL = window.location.origin;

export default function InformeEditor({ presupuesto, onClose }) {
  const [informe, setInforme] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openItem, setOpenItem] = useState(null);
  const [uploadingFor, setUploadingFor] = useState(null);
  const [linkCopiado, setLinkCopiado] = useState(false);

  const itemsPresupuesto = (presupuesto.items || []).filter(it => !it._type);

  useEffect(() => { load(); }, [presupuesto.id]);

  async function load() {
    setLoading(true);
    let { data } = await supabase.from('informes').select('*').eq('presupuesto_id', presupuesto.id).order('created_at', { ascending:false }).limit(1).single();
    if (!data) {
      const { data: nuevo } = await supabase.from('informes').insert({
        presupuesto_id: presupuesto.id,
        evento_nombre: presupuesto.nombre || presupuesto.cliente || '',
        cliente_nombre: presupuesto.cliente || '',
        items: itemsPresupuesto.map(it => ({
          item_id: it.id, item_nombre: it.item, categoria: it.categoria || '',
          incluido: false, fotos: [], comentario: '',
        })),
      }).select().single();
      data = nuevo;
    }
    setInforme(data);
    setLoading(false);
  }

  const guardar = useCallback(async (cambios) => {
    setSaving(true);
    await supabase.from('informes').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', informe.id);
    setSaving(false);
  }, [informe]);

  function toggleIncluido(itemId) {
    const items = informe.items.map(it => it.item_id === itemId ? { ...it, incluido: !it.incluido } : it);
    setInforme(prev => ({ ...prev, items }));
    guardar({ items });
  }

  async function uploadFoto(itemId, file) {
    setUploadingFor(itemId);
    const ext = file.name.split('.').pop();
    const fileName = `${informe.token}/${itemId}_${Date.now()}.${ext}`;
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

  function guardarComentario() {
    guardar({ items: informe.items });
  }

  function actualizarComentariosGenerales(texto) {
    setInforme(prev => ({ ...prev, comentarios_generales: texto }));
  }

  function copiarLink() {
    navigator.clipboard.writeText(`${BASE_URL}/informe/${informe.token}`).then(() => {
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2500);
    });
  }

  async function generarInforme() {
    const incluidos = informe.items.filter(it => it.incluido);
    if (incluidos.length === 0) { alert('Seleccioná al menos un ítem para incluir en el informe'); return; }
    await guardar({ comentarios_generales: informe.comentarios_generales, estado:'generado', fecha_generado: new Date().toISOString() });
    const html = generateInformePdfHTML({ ...informe, estado:'generado' });
    const w = window.open('', '_blank');
    if(!w){alert('Permití ventanas emergentes para ver el PDF');return;}
    w.document.write(html); w.document.close();
    load();
  }

  function descargarPdfExistente() {
    const html = generateInformePdfHTML(informe);
    const w = window.open('', '_blank');
    if(!w){alert('Permití ventanas emergentes para ver el PDF');return;}
    w.document.write(html); w.document.close();
  }

  if (loading || !informe) return <div style={{ padding:'2rem', textAlign:'center', color:'#888' }}>Cargando informe…</div>;

  const incluidosCount = informe.items.filter(it => it.incluido).length;

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#f5f4f0', borderRadius:14, width:'100%', maxWidth:720, maxHeight:'92vh', overflowY:'auto' }}>
        {/* Header */}
        <div style={{ background:'#0d3b5e', padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', borderRadius:'14px 14px 0 0' }}>
          <div>
            <div style={{ fontSize:11, color:'#8ab4d4', textTransform:'uppercase', letterSpacing:1 }}>Informe</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#fff' }}>{informe.evento_nombre}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#fff' }}>×</button>
        </div>

        <div style={{ padding:20 }}>
          {/* Status bar */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, padding:'10px 14px', background:'#fff', borderRadius:10, border:'1px solid #dde6ef' }}>
            <div style={{ fontSize:13, color:'#5a7a9a' }}>
              <strong style={{ color:'#0d3b5e' }}>{incluidosCount}</strong> de {informe.items.length} ítems seleccionados
              {informe.estado === 'generado' && <span style={{ marginLeft:10, color:'#2e8b4e', fontWeight:600 }}>✓ Generado</span>}
              {saving && <span style={{ marginLeft:10, color:'#8aa0b8' }}>Guardando...</span>}
            </div>
            <button style={S.btnSm} onClick={copiarLink}>{linkCopiado ? '✓ Copiado' : '🔗 Compartir link'}</button>
          </div>

          {/* Lista de ítems */}
          {informe.items.map(it => {
            const isOpen = openItem === it.item_id;
            return (
              <div key={it.item_id} style={{ background:'#fff', border:'1px solid #dde6ef', borderRadius:10, marginBottom:8, overflow:'hidden' }}>
                <div onClick={()=>setOpenItem(isOpen ? null : it.item_id)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer', background: it.incluido ? '#f5f3ff' : '#fff' }}>
                  <input type="checkbox" checked={it.incluido} onClick={e=>e.stopPropagation()} onChange={()=>toggleIncluido(it.item_id)} style={{ width:17, height:17, cursor:'pointer', accentColor:'#7c3aed' }}/>
                  <span style={{ flex:1, fontSize:13, fontWeight:600, color: it.incluido ? '#5b21b6' : '#0d3b5e' }}>{it.item_nombre}</span>
                  {it.fotos.length > 0 && <span style={{ fontSize:11, color:'#8aa0b8' }}>📷 {it.fotos.length}</span>}
                  <span style={{ fontSize:12, color:'#aab4c0' }}>{isOpen ? '▼' : '▶'}</span>
                </div>
                {isOpen && (
                  <div style={{ padding:'12px 14px', borderTop:'1px solid #eef2f7' }}>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:10 }}>
                      {it.fotos.map((url, i) => (
                        <div key={i} style={{ position:'relative' }}>
                          <img src={url} alt="" style={{ width:80, height:80, objectFit:'cover', borderRadius:8, border:'1px solid #ddd' }}/>
                          <button onClick={()=>removeFoto(it.item_id, i)} style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:'#c8264a', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>✕</button>
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
                      onBlur={guardarComentario}
                      placeholder="Comentario sobre este ítem..."
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Comentarios generales */}
          <div style={{ background:'#fff', border:'1px solid #dde6ef', borderRadius:10, padding:14, marginTop:12 }}>
            <label style={S.label}>Comentarios generales del informe</label>
            <textarea
              style={{ ...S.input, minHeight:80, resize:'vertical', marginTop:6 }}
              value={informe.comentarios_generales || ''}
              onChange={e=>actualizarComentariosGenerales(e.target.value)}
              onBlur={guardarComentario}
              placeholder="Resumen general, conclusiones..."
            />
          </div>

          {/* Acciones */}
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button style={S.btnSecondary} onClick={onClose}>Cerrar y seguir editando luego</button>
            {informe.estado === 'generado' ? (
              <button style={{ ...S.btnPrimary, background:'#2e8b4e', flex:1 }} onClick={descargarPdfExistente}>📄 Descargar PDF nuevamente</button>
            ) : (
              <button style={{ ...S.btnPrimary, flex:1 }} onClick={generarInforme}>✓ Crear Informe (PDF)</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
