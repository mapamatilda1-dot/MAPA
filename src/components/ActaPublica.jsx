import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { generateActaPdfHTML } from './ActaPdfGenerator';

const S = {
  page: { minHeight:'100vh', background:'#f5f4f0', fontFamily:'Arial,sans-serif' },
  header: { background:'#0d3b5e', padding:'16px 20px', display:'flex', alignItems:'center', gap:10 },
  card: { background:'#fff', borderRadius:12, padding:'18px 16px', margin:'12px', boxShadow:'0 1px 3px rgba(0,0,0,.08)' },
  label: { fontSize:11, fontWeight:700, color:'#8aa0b8', textTransform:'uppercase', letterSpacing:.5, marginBottom:4, display:'block' },
  input: { width:'100%', padding:'10px 12px', fontSize:15, border:'1px solid #ddd', borderRadius:8, fontFamily:'inherit', boxSizing:'border-box' },
  btn: { padding:'12px 20px', borderRadius:9, border:'none', fontFamily:'inherit', fontSize:14, fontWeight:700, cursor:'pointer' },
};

function SignaturePad({ onSave, label, color='#0d3b5e' }) {
  const canvasRef = useRef(null);
  const [hasSignature, setHasSignature] = useState(false);
  const drawing = useRef(false);
  const lastPos = useRef({x:0,y:0});

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setHasSignature(false);
  }, []);

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasSignature(true);
  }
  function end() { drawing.current = false; }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  function confirmar() {
    if (!hasSignature) { alert('Por favor firma antes de continuar'); return; }
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
  }

  return (
    <div>
      <label style={S.label}>{label}</label>
      <div style={{ border:'2px dashed #c8d4e0', borderRadius:10, background:'#fafbfc', position:'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ width:'100%', height:180, display:'block', touchAction:'none' }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
        {!hasSignature && (
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', color:'#aab4c0', fontSize:13, pointerEvents:'none' }}>
            ✍️ Firma aquí con el dedo
          </div>
        )}
      </div>
      <div style={{ display:'flex', gap:8, marginTop:10 }}>
        <button onClick={clear} style={{ ...S.btn, background:'#fff', color:'#666', border:'1px solid #ddd', flex:1 }}>Borrar</button>
        <button onClick={confirmar} style={{ ...S.btn, background:color, color:'#fff', flex:2 }}>✓ Confirmar firma</button>
      </div>
    </div>
  );
}

export default function ActaPublica({ token }) {
  const [acta, setActa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState('form'); // form -> firma_entrega -> firma_recibe -> done

  const [form, setForm] = useState({
    persona_entrega: '', persona_recibe: '', listado_items: '', fotos: [],
  });
  const [firmaEntrega, setFirmaEntrega] = useState(null);
  const [firmaRecibe, setFirmaRecibe] = useState(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  useEffect(() => { load(); }, [token]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('actas_entrega').select('*').eq('token', token).single();
    if (error || !data) { setError('Acta no encontrada. Verifica el link.'); setLoading(false); return; }
    setActa(data);
    setForm({
      persona_entrega: data.persona_entrega || '',
      persona_recibe: data.persona_recibe || '',
      listado_items: data.listado_items || '',
      fotos: data.fotos || [],
    });
    if (data.estado === 'firmada') setStep('done');
    setLoading(false);
  }

  async function uploadFoto(file) {
    setUploadingFoto(true);
    const ext = file.name.split('.').pop();
    const fileName = `${token}/foto_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('actas-entrega').upload(fileName, file);
    if (error) { alert('Error subiendo foto: ' + error.message); setUploadingFoto(false); return; }
    const { data: urlData } = supabase.storage.from('actas-entrega').getPublicUrl(fileName);
    setForm(prev => ({ ...prev, fotos: [...prev.fotos, urlData.publicUrl] }));
    setUploadingFoto(false);
  }

  function removeFoto(idx) {
    setForm(prev => ({ ...prev, fotos: prev.fotos.filter((_,i) => i !== idx) }));
  }

  async function uploadFirma(dataUrl, tipo) {
    const fileName = `${token}/firma_${tipo}_${Date.now()}.png`;
    const blob = await (await fetch(dataUrl)).blob();
    const { error } = await supabase.storage.from('actas-entrega').upload(fileName, blob, { contentType:'image/png' });
    if (error) { alert('Error guardando firma: ' + error.message); return null; }
    const { data: urlData } = supabase.storage.from('actas-entrega').getPublicUrl(fileName);
    return urlData.publicUrl;
  }

  async function continuarAFirmas() {
    if (!form.persona_entrega.trim() || !form.persona_recibe.trim()) {
      alert('Completa quién entrega y quién recibe'); return;
    }
    setStep('firma_entrega');
  }

  async function onFirmaEntrega(dataUrl) {
    setFirmaEntrega(dataUrl);
    setStep('firma_recibe');
  }

  async function onFirmaRecibe(dataUrl) {
    setSaving(true);
    const [urlEntrega, urlRecibe] = await Promise.all([
      uploadFirma(firmaEntrega, 'entrega'),
      uploadFirma(dataUrl, 'recibe'),
    ]);
    const { error } = await supabase.from('actas_entrega').update({
      persona_entrega: form.persona_entrega,
      persona_recibe: form.persona_recibe,
      listado_items: form.listado_items,
      fotos: form.fotos,
      firma_entrega_url: urlEntrega,
      firma_recibe_url: urlRecibe,
      estado: 'firmada',
      fecha_firma: new Date().toISOString(),
    }).eq('token', token);
    setSaving(false);
    if (error) { alert('Error guardando acta: ' + error.message); return; }
    setStep('done');
  }

  if (loading) return (
    <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'#8aa0b8', fontSize:14 }}>Cargando acta...</div>
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

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ width:30, height:30, borderRadius:8, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#0d3b5e' }}>M</div>
        <span style={{ color:'#fff', fontSize:15, fontWeight:600 }}>Acta de Entrega — Matilda</span>
      </div>

      {/* Info del evento — siempre visible */}
      <div style={S.card}>
        <div style={{ fontSize:11, color:'#8aa0b8', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>Evento</div>
        <div style={{ fontSize:17, fontWeight:700, color:'#0d3b5e', marginBottom:8 }}>{acta.evento_nombre || acta.presupuesto_nombre}</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:14, fontSize:13, color:'#5a7a9a' }}>
          {acta.cliente_nombre && <span>🏢 {acta.cliente_nombre}</span>}
          {acta.fecha_evento && <span>📅 {acta.fecha_evento}</span>}
          {acta.lugar && <span>📍 {acta.lugar}</span>}
        </div>
      </div>

      {step === 'done' ? (
        <div style={S.card}>
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
            <div style={{ fontSize:17, fontWeight:700, color:'#2e8b4e', marginBottom:6 }}>Acta firmada correctamente</div>
            <div style={{ fontSize:13, color:'#8aa0b8' }}>
              {acta.fecha_firma ? new Date(acta.fecha_firma).toLocaleString('es-EC') : ''}
            </div>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:16 }}>
            {acta.firma_entrega_url && (
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:'#8aa0b8', marginBottom:6 }}>Entrega: {acta.persona_entrega}</div>
                <img src={acta.firma_entrega_url} alt="Firma entrega" style={{ width:'100%', border:'1px solid #eee', borderRadius:8 }}/>
              </div>
            )}
            {acta.firma_recibe_url && (
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:'#8aa0b8', marginBottom:6 }}>Recibe: {acta.persona_recibe}</div>
                <img src={acta.firma_recibe_url} alt="Firma recibe" style={{ width:'100%', border:'1px solid #eee', borderRadius:8 }}/>
              </div>
            )}
          </div>
          <button onClick={()=>{
            const html = generateActaPdfHTML(acta);
            const w = window.open('', '_blank');
            if(!w){alert('Permití ventanas emergentes para ver el PDF');return;}
            w.document.write(html); w.document.close();
          }} style={{ ...S.btn, background:'#0d3b5e', color:'#fff', width:'100%', marginTop:16 }}>
            📄 Descargar PDF del acta
          </button>
        </div>
      ) : step === 'form' ? (
        <div style={S.card}>
          <div style={{ marginBottom:14 }}>
            <label style={S.label}>Persona que entrega *</label>
            <input style={S.input} value={form.persona_entrega} onChange={e=>setForm(p=>({...p,persona_entrega:e.target.value}))} placeholder="Nombre completo"/>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={S.label}>Persona que recibe *</label>
            <input style={S.input} value={form.persona_recibe} onChange={e=>setForm(p=>({...p,persona_recibe:e.target.value}))} placeholder="Nombre completo"/>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={S.label}>Listado de lo entregado</label>
            <textarea style={{ ...S.input, minHeight:90, resize:'vertical' }} value={form.listado_items} onChange={e=>setForm(p=>({...p,listado_items:e.target.value}))} placeholder="Ej: 10 sillas, 2 mesas, 1 toldo..."/>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={S.label}>Fotos de la entrega</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:8 }}>
              {form.fotos.map((url, i) => (
                <div key={i} style={{ position:'relative' }}>
                  <img src={url} alt="" style={{ width:70, height:70, objectFit:'cover', borderRadius:8, border:'1px solid #ddd' }}/>
                  <button onClick={()=>removeFoto(i)} style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:'#c8264a', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>✕</button>
                </div>
              ))}
            </div>
            <label style={{ display:'inline-block', cursor:'pointer' }}>
              <input type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e=>{ const f=e.target.files[0]; if(f) uploadFoto(f); }}/>
              <span style={{ ...S.btn, background:'#eef4fb', color:'#0d3b5e', display:'inline-block' }}>
                {uploadingFoto ? 'Subiendo...' : '📷 Agregar foto'}
              </span>
            </label>
          </div>
          <button onClick={continuarAFirmas} style={{ ...S.btn, background:'#0d3b5e', color:'#fff', width:'100%' }}>
            Continuar a firmas →
          </button>
        </div>
      ) : step === 'firma_entrega' ? (
        <div style={S.card}>
          <div style={{ fontSize:14, fontWeight:600, color:'#0d3b5e', marginBottom:4 }}>Firma de quien entrega</div>
          <div style={{ fontSize:13, color:'#8aa0b8', marginBottom:14 }}>{form.persona_entrega}</div>
          <SignaturePad key="pad-entrega" label="Firma" onSave={onFirmaEntrega} color="#0d3b5e"/>
        </div>
      ) : step === 'firma_recibe' ? (
        <div style={S.card}>
          <div style={{ fontSize:14, fontWeight:600, color:'#0d3b5e', marginBottom:4 }}>Firma de quien recibe</div>
          <div style={{ fontSize:13, color:'#8aa0b8', marginBottom:14 }}>{form.persona_recibe}</div>
          {saving ? (
            <div style={{ textAlign:'center', padding:'30px 0', color:'#8aa0b8' }}>Guardando acta...</div>
          ) : (
            <SignaturePad key="pad-recibe" label="Firma" onSave={onFirmaRecibe} color="#2e8b4e"/>
          )}
        </div>
      ) : null}
    </div>
  );
}
