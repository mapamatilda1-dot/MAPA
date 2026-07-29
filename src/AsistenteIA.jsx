import { useState, useRef, useEffect } from 'react';
import { supabase } from './lib/supabase';

const inp = { fontFamily:'inherit', fontSize:13, padding:'10px 14px', border:'1px solid #ddd', borderRadius:10, width:'100%', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };

// Convierte URLs sueltas del texto en links clickeables
function renderConLinks(text) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color:'#7c3aed', wordBreak:'break-all' }}>{part}</a>
      : <span key={i}>{part}</span>
  );
}

export default function AsistenteIA() {
  const [open, setOpen] = useState(false);
  const [pregunta, setPregunta] = useState('');
  const [historial, setHistorial] = useState([]); // [{role:'user'|'assistant', text}]
  const [loading, setLoading] = useState(false);
  const [showRefForm, setShowRefForm] = useState(false);
  const [refForm, setRefForm] = useState({ titulo:'', categoria:'movilizacion', contenido:'' });
  const [savingRef, setSavingRef] = useState(false);
  const [imagenes, setImagenes] = useState([]); // File[]
  const [progreso, setProgreso] = useState(null); // {actual, total} o null
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [historial, loading, open]);

  async function preguntar() {
    const texto = pregunta.trim();
    if (!texto || loading) return;
    setPregunta('');
    const nuevoHistorial = [...historial, { role: 'user', text: texto }];
    setHistorial(nuevoHistorial);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-asistente-openai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pregunta: texto, historial }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || `Error ${res.status}`);
      setHistorial(h => [...h, { role: 'assistant', text: json.respuesta }]);
    } catch (e) {
      setHistorial(h => [...h, { role: 'assistant', text: '⚠ ' + e.message }]);
    }
    setLoading(false);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function leerImagen(base64, mimeType) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-leer-imagen-historial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ imagen_base64: base64, mime_type: mimeType }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw new Error(json.error || `Error ${res.status}`);
    return json.texto;
  }

  async function guardarReferencia() {
    if (!refForm.titulo.trim()) return;
    if (!refForm.contenido.trim() && imagenes.length === 0) return;
    setSavingRef(true);
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email || '';
    let guardadas = 0, sinDatos = 0, fallidas = 0;

    try {
      if (refForm.contenido.trim()) {
        const { error } = await supabase.from('referencias_ia').insert({
          titulo: refForm.titulo.trim(), categoria: refForm.categoria,
          contenido: refForm.contenido.trim(), created_by: email,
        });
        if (error) throw error;
        guardadas++;
      }

      if (imagenes.length > 0) {
        setProgreso({ actual: 0, total: imagenes.length });
        for (let i = 0; i < imagenes.length; i++) {
          setProgreso({ actual: i + 1, total: imagenes.length });
          const file = imagenes[i];
          try {
            const base64 = await fileToBase64(file);
            const texto = await leerImagen(base64, file.type || 'image/jpeg');
            if (!texto || texto.trim() === 'SIN_DATOS') { sinDatos++; continue; }
            const { error } = await supabase.from('referencias_ia').insert({
              titulo: `${refForm.titulo.trim()} — foto ${i + 1}`, categoria: refForm.categoria,
              contenido: texto, created_by: email,
            });
            if (error) throw error;
            guardadas++;
          } catch (e) {
            fallidas++;
          }
        }
        setProgreso(null);
      }
    } catch (e) {
      setProgreso(null);
      setSavingRef(false);
      alert('No se pudo guardar: ' + e.message);
      return;
    }

    setSavingRef(false);
    setRefForm({ titulo:'', categoria:'movilizacion', contenido:'' });
    setImagenes([]);
    setShowRefForm(false);
    let resumen = `✓ Cargué ${guardadas} referencia(s).`;
    if (sinDatos) resumen += ` ${sinDatos} foto(s) no tenían datos legibles.`;
    if (fallidas) resumen += ` ${fallidas} foto(s) fallaron al procesar — probá subirlas de nuevo.`;
    setHistorial(h => [...h, { role:'assistant', text: resumen + ' Ya las puedo usar para responder preguntas.' }]);
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position:'fixed', bottom:22, right:22, zIndex:400,
          width:56, height:56, borderRadius:'50%', border:'none',
          background:'#0d3b5e', color:'#fff', fontSize:24, cursor:'pointer',
          boxShadow:'0 4px 16px rgba(13,59,94,.35)', display:'flex', alignItems:'center', justifyContent:'center',
        }}
        title="Preguntarle a Matilda Hub"
      >
        {open ? '✕' : '🤖'}
      </button>

      {open && (
        <div style={{
          position:'fixed', bottom:88, right:22, zIndex:400,
          width:'min(400px, calc(100vw - 32px))', height:'min(560px, calc(100vh - 140px))',
          background:'#fff', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,.2)',
          border:'1px solid #e5e5e5', display:'flex', flexDirection:'column', overflow:'hidden',
        }}>
          <div style={{ padding:'14px 18px', background:'#0d3b5e', color:'#fff', flexShrink:0, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700 }}>🤖 Preguntarle a Matilda Hub</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.65)', marginTop:2 }}>Proyectos · Propuestas · Presupuestos · Gastos históricos</div>
            </div>
            <button onClick={()=>setShowRefForm(v=>!v)} title="Cargar historial de referencia (ej: rutas de movilización)" style={{
              background:'rgba(255,255,255,.15)', border:'none', borderRadius:8, color:'#fff', fontSize:16,
              cursor:'pointer', padding:'6px 9px', flexShrink:0,
            }}>📎</button>
          </div>

          {showRefForm && (
            <div style={{ padding:14, borderBottom:'1px solid #eee', background:'#f8fafc', flexShrink:0, display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#0d3b5e' }}>📎 Cargar historial de referencia</div>
              <input value={refForm.titulo} onChange={e=>setRefForm(f=>({...f,titulo:e.target.value}))} placeholder="Título (ej: Historial de carreras 2025)" style={{...inp, fontSize:12, padding:'7px 10px'}}/>
              <select value={refForm.categoria} onChange={e=>setRefForm(f=>({...f,categoria:e.target.value}))} style={{...inp, fontSize:12, padding:'7px 10px'}}>
                <option value="movilizacion">Movilización / carreras</option>
                <option value="alimentacion">Alimentación</option>
                <option value="otro">Otro</option>
              </select>
              <textarea value={refForm.contenido} onChange={e=>setRefForm(f=>({...f,contenido:e.target.value}))}
                placeholder="Si tenés el historial como texto, pegalo acá (opcional si vas a subir fotos)."
                style={{...inp, fontSize:12, minHeight:70, resize:'vertical'}}/>

              <div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple style={{display:'none'}}
                  onChange={e=>setImagenes(prev=>[...prev, ...Array.from(e.target.files||[])])}/>
                <button onClick={()=>fileInputRef.current?.click()} style={{ padding:'7px 12px', borderRadius:8, border:'1px dashed #0d3b5e', background:'#fff', fontSize:12, color:'#0d3b5e', cursor:'pointer', width:'100%' }}>
                  📷 {imagenes.length > 0 ? `${imagenes.length} foto(s) elegidas — agregar más` : 'Subir fotos del historial (podés elegir varias a la vez)'}
                </button>
                {imagenes.length > 0 && (
                  <div style={{ fontSize:11, color:'#888', marginTop:4, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span>La IA va a leer cada foto y sacar los datos automáticamente.</span>
                    <button onClick={()=>setImagenes([])} style={{ background:'none', border:'none', color:'#c8264a', cursor:'pointer', fontSize:11 }}>Quitar todas</button>
                  </div>
                )}
              </div>

              {progreso && (
                <div style={{ fontSize:12, color:'#0d3b5e', fontWeight:600 }}>
                  Procesando foto {progreso.actual} de {progreso.total}…
                  <div style={{ height:5, background:'#e5e5e5', borderRadius:99, marginTop:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(progreso.actual/progreso.total)*100}%`, background:'#0d3b5e', transition:'width .2s' }}/>
                  </div>
                </div>
              )}

              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button onClick={()=>{ setShowRefForm(false); setImagenes([]); }} disabled={savingRef} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #ddd', background:'#fff', fontSize:12, cursor:'pointer' }}>Cancelar</button>
                <button onClick={guardarReferencia} disabled={savingRef || !refForm.titulo.trim() || (!refForm.contenido.trim() && imagenes.length===0)} style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'#0d3b5e', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', opacity:(savingRef||!refForm.titulo.trim()||(!refForm.contenido.trim()&&imagenes.length===0))?0.5:1 }}>
                  {savingRef ? 'Procesando…' : 'Guardar'}
                </button>
              </div>
            </div>
          )}

          <div ref={scrollRef} style={{ flex:1, overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
            {historial.length === 0 && (
              <div style={{ fontSize:12, color:'#999', lineHeight:1.6 }}>
                Preguntame cosas como:
                <ul style={{ margin:'8px 0 0', paddingLeft:18 }}>
                  <li>"¿Cuál es el link de la propuesta de [proyecto]?"</li>
                  <li>"¿Cuánto costaron las carreras del CC a Acrilmax?"</li>
                  <li>"¿Cuánto le cobramos al cliente por la modelo en [proyecto]?"</li>
                  <li>"¿En qué estado está el presupuesto de [cliente]?"</li>
                </ul>
              </div>
            )}
            {historial.map((h, i) => (
              <div key={i} style={{
                alignSelf: h.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth:'88%', background: h.role === 'user' ? '#0d3b5e' : '#f0f4f8',
                color: h.role === 'user' ? '#fff' : '#1a1a2e',
                padding:'9px 13px', borderRadius:12, fontSize:13, lineHeight:1.5, whiteSpace:'pre-wrap',
              }}>
                {h.role === 'assistant' ? renderConLinks(h.text) : h.text}
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf:'flex-start', fontSize:12, color:'#999', fontStyle:'italic' }}>Buscando en el sistema…</div>
            )}
          </div>

          <div style={{ padding:12, borderTop:'1px solid #eee', display:'flex', gap:8, flexShrink:0 }}>
            <input
              value={pregunta}
              onChange={e=>setPregunta(e.target.value)}
              onKeyDown={e=>{ if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); preguntar(); } }}
              placeholder="Preguntá algo…"
              style={inp}
              disabled={loading}
              autoFocus
            />
            <button onClick={preguntar} disabled={loading || !pregunta.trim()} style={{
              padding:'0 16px', borderRadius:10, border:'none', background:'#0d3b5e', color:'#fff',
              cursor:'pointer', fontWeight:700, opacity:(loading||!pregunta.trim())?0.5:1, flexShrink:0,
            }}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}
