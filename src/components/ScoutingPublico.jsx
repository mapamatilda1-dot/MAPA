import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const S = {
  page: { minHeight:'100vh', background:'#f5f4f0', fontFamily:'Arial,sans-serif' },
  header: { background:'#0d3b5e', padding:'16px 20px', display:'flex', alignItems:'center', gap:10 },
  card: { background:'#fff', borderRadius:12, padding:'18px 16px', margin:'12px', boxShadow:'0 1px 3px rgba(0,0,0,.08)' },
  label: { fontSize:11, fontWeight:700, color:'#8aa0b8', textTransform:'uppercase', letterSpacing:.5, marginBottom:4, display:'block' },
  input: { width:'100%', padding:'10px 12px', fontSize:15, border:'1px solid #ddd', borderRadius:8, fontFamily:'inherit', boxSizing:'border-box' },
  btn: { padding:'12px 20px', borderRadius:9, border:'none', fontFamily:'inherit', fontSize:14, fontWeight:700, cursor:'pointer' },
};

export default function ScoutingPublico({ token }) {
  const [scouting, setScouting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [fotos, setFotos] = useState([]);
  const [comentariosGenerales, setComentariosGenerales] = useState('');
  const [realizadoPor, setRealizadoPor] = useState('');
  const [persona, setPersona] = useState('');

  useEffect(() => { load(); }, [token]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('scoutings').select('*').eq('token', token).single();
    if (error || !data) { setError('Scouting no encontrado. Verifica el link.'); setLoading(false); return; }
    setScouting(data);
    setFotos(data.fotos || []);
    setComentariosGenerales(data.comentarios_generales || '');
    setRealizadoPor(data.created_by_nombre || '');
    setPersona(data.persona || '');
    setLoading(false);
  }

  async function uploadFoto(file) {
    setUploadingFoto(true);
    const ext = file.name.split('.').pop();
    const fileName = `${token}/foto_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('scouting').upload(fileName, file);
    if (error) { alert('Error subiendo foto: ' + error.message); setUploadingFoto(false); return; }
    const { data: urlData } = supabase.storage.from('scouting').getPublicUrl(fileName);
    const nuevasFotos = [...fotos, { url: urlData.publicUrl, comentario: '' }];
    setFotos(nuevasFotos);
    await guardarParcial({ fotos: nuevasFotos });
    setUploadingFoto(false);
  }

  function actualizarComentarioFoto(idx, texto) {
    const nuevasFotos = fotos.map((f, i) => i === idx ? { ...f, comentario: texto } : f);
    setFotos(nuevasFotos);
  }

  async function guardarComentarioFoto(idx) {
    await guardarParcial({ fotos });
  }

  function removeFoto(idx) {
    const nuevasFotos = fotos.filter((_, i) => i !== idx);
    setFotos(nuevasFotos);
    guardarParcial({ fotos: nuevasFotos });
  }

  async function guardarParcial(cambios) {
    await supabase.from('scoutings').update(cambios).eq('token', token);
  }

  async function finalizar() {
    setSaving(true);
    const { error } = await supabase.from('scoutings').update({
      fotos, comentarios_generales: comentariosGenerales, created_by_nombre: realizadoPor,
      estado: 'completado', fecha_completado: new Date().toISOString(),
    }).eq('token', token);
    setSaving(false);
    if (error) { alert('Error: ' + error.message); return; }
    load();
  }

  if (loading) return (
    <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'#8aa0b8', fontSize:14 }}>Cargando scouting...</div>
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

  const completado = scouting.estado === 'completado';

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ width:30, height:30, borderRadius:8, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#0d3b5e' }}>M</div>
        <span style={{ color:'#fff', fontSize:15, fontWeight:600 }}>Scouting — Matilda</span>
      </div>

      <div style={S.card}>
        <div style={{ fontSize:11, color:'#8aa0b8', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>Lugar / Evento</div>
        <div style={{ fontSize:17, fontWeight:700, color:'#0d3b5e', marginBottom:8 }}>{scouting.lugar || scouting.presupuesto_nombre}</div>
        {scouting.cliente_nombre && <div style={{ fontSize:13, color:'#5a7a9a' }}>🏢 {scouting.cliente_nombre}</div>}
        {!completado ? (
          <div style={{ marginTop:12 }}>
            <label style={S.label}>Tu nombre (quien realiza el scouting)</label>
            <input
              style={{ ...S.input, marginTop:4 }}
              value={persona}
              onChange={e=>setPersona(e.target.value)}
              onBlur={()=>guardarParcial({ persona })}
              placeholder="Ej: Camille Andrade"
            />
          </div>
        ) : (
          scouting.persona && <div style={{ fontSize:13, color:'#5a7a9a', marginTop:8 }}>👤 Realizado por: {scouting.persona}</div>
        )}
        {completado && (
          <div style={{ marginTop:10, padding:'8px 12px', background:'#edf7ed', borderRadius:8, fontSize:13, color:'#2e8b4e', fontWeight:600 }}>
            ✓ Completado el {new Date(scouting.fecha_completado).toLocaleString('es-EC')}
          </div>
        )}
      </div>

      <div style={S.card}>
        <label style={S.label}>Realizado por</label>
        <input
          style={{ ...S.input, marginTop:6 }}
          value={realizadoPor}
          disabled={completado}
          onChange={e=>setRealizadoPor(e.target.value)}
          onBlur={()=>guardarParcial({ created_by_nombre: realizadoPor })}
          placeholder="Tu nombre completo"
        />
      </div>

      <div style={S.card}>
        <label style={S.label}>Fotos del lugar</label>
        <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:8 }}>
          {fotos.map((f, i) => (
            <div key={i} style={{ border:'1px solid #eee', borderRadius:10, padding:10, position:'relative' }}>
              <img src={f.url} alt="" style={{ width:'100%', maxHeight:320, objectFit:'contain', background:'#f0f0f0', borderRadius:8, marginBottom:8 }}/>
              {!completado && (
                <button onClick={()=>removeFoto(i)} style={{ position:'absolute', top:6, right:6, width:24, height:24, borderRadius:'50%', background:'#c8264a', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>✕</button>
              )}
              <textarea
                style={{ ...S.input, minHeight:50, resize:'vertical', fontSize:13 }}
                value={f.comentario}
                disabled={completado}
                onChange={e=>actualizarComentarioFoto(i, e.target.value)}
                onBlur={()=>guardarComentarioFoto(i)}
                placeholder="¿Qué vemos en esta foto?"
              />
            </div>
          ))}
        </div>
        {!completado && (
          <label style={{ display:'inline-block', cursor:'pointer', marginTop:10 }}>
            <input type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e=>{ const f=e.target.files[0]; if(f) uploadFoto(f); }}/>
            <span style={{ ...S.btn, background:'#eef4fb', color:'#0d3b5e', display:'inline-block' }}>
              {uploadingFoto ? 'Subiendo...' : '📷 Agregar foto'}
            </span>
          </label>
        )}
      </div>

      <div style={S.card}>
        <label style={S.label}>Comentarios generales del lugar</label>
        <textarea
          style={{ ...S.input, minHeight:100, resize:'vertical', marginTop:6 }}
          value={comentariosGenerales}
          disabled={completado}
          onChange={e=>setComentariosGenerales(e.target.value)}
          onBlur={()=>guardarParcial({ comentarios_generales: comentariosGenerales })}
          placeholder="Accesos, electricidad, espacio disponible, restricciones, parqueo, etc."
        />
      </div>

      {!completado && (
        <div style={{ margin:'12px', display:'flex', gap:8 }}>
          <button onClick={finalizar} disabled={saving} style={{ ...S.btn, background:'#2e8b4e', color:'#fff', flex:1 }}>
            {saving ? 'Guardando...' : '✓ Marcar como completado'}
          </button>
        </div>
      )}
      {!completado && (
        <div style={{ margin:'0 12px 16px', fontSize:11, color:'#8aa0b8', textAlign:'center' }}>
          Tus avances se guardan automáticamente. Podés cerrar y volver más tarde con el mismo link.
        </div>
      )}
    </div>
  );
}
