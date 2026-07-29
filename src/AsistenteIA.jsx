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
          <div style={{ padding:'14px 18px', background:'#0d3b5e', color:'#fff', flexShrink:0 }}>
            <div style={{ fontSize:14, fontWeight:700 }}>🤖 Preguntarle a Matilda Hub</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.65)', marginTop:2 }}>Proyectos · Propuestas · Presupuestos · Gastos históricos</div>
          </div>

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
