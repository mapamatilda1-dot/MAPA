import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { calcPpto, fmt } from '../calc';
import { ESTADOS_BRIEF_LABELS, ESTADOS_BRIEF_COLORS, ESTADOS_PROPUESTA_LABELS, ESTADOS_PROPUESTA_COLORS, ESTADOS_PPTO_LABELS, ESTADOS_PPTO_COLORS } from '../roles';

function fmtDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function StatusBadge({ estado, tipo }) {
  const labels = tipo === 'brief' ? ESTADOS_BRIEF_LABELS : tipo === 'propuesta' ? ESTADOS_PROPUESTA_LABELS : ESTADOS_PPTO_LABELS;
  const colors = tipo === 'brief' ? ESTADOS_BRIEF_COLORS : tipo === 'propuesta' ? ESTADOS_PROPUESTA_COLORS : ESTADOS_PPTO_COLORS;
  const color = colors[estado] || '#888';
  const label = labels[estado] || estado;
  const bgs = { '#8aa0b8':'#eef2f7','#e8a020':'#fdf5e8','#c8264a':'#fde8ec','#2e8b4e':'#e8f5ee','#0d3b5e':'#e8f0f8','#8aa0b8':'#f3f4f6' };
  const bg = bgs[color] || '#f3f4f6';
  return <span style={{ fontSize:11, padding:'2px 9px', borderRadius:999, fontWeight:500, background:bg, color, whiteSpace:'nowrap' }}>{label}</span>;
}

function Section({ icon, title, children, count }) {
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, paddingBottom:8, borderBottom:'1px solid #eee' }}>
        <span style={{ fontSize:16 }}>{icon}</span>
        <span style={{ fontSize:13, fontWeight:700, color:'#0d3b5e' }}>{title}</span>
        {count !== undefined && <span style={{ fontSize:11, background:'#eef4fb', color:'#0d3b5e', padding:'1px 7px', borderRadius:999, fontWeight:600 }}>{count}</span>}
      </div>
      {children}
    </div>
  );
}

function EmptyMsg({ msg }) {
  return <div style={{ fontSize:12, color:'#aaa', padding:'8px 0', fontStyle:'italic' }}>{msg}</div>;
}

export default function ExpedientePanel({ briefId, onClose }) {
  const [brief, setBrief]           = useState(null);
  const [propuestas, setPropuestas] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [implementaciones, setImplementaciones] = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!briefId) return;
    loadAll();
  }, [briefId]);

  async function loadAll() {
    setLoading(true);
    const [brR, prR, ppR, implR] = await Promise.all([
      supabase.from('briefs').select('*').eq('id', briefId).single(),
      supabase.from('propuestas').select('*').eq('brief_id', briefId).order('created_at', { ascending: false }),
      supabase.from('presupuestos').select('*').eq('brief_id', briefId).order('created_at', { ascending: false }),
      supabase.from('implementaciones').select('*').eq('brief_id', briefId).order('fecha_evento'),
    ]);
    if (brR.data)   setBrief(brR.data);
    if (prR.data)   setPropuestas(prR.data);
    if (ppR.data)   setPresupuestos(ppR.data);
    if (implR.data) setImplementaciones(implR.data);

    // Liquidaciones vinculadas a los presupuestos de este proyecto
    if (ppR.data?.length) {
      const ppIds = ppR.data.map(p => p.id);
      const { data: liqData } = await supabase.from('liquidaciones').select('*').in('presupuesto_id', ppIds);
      setLiquidaciones(liqData || []);
    } else {
      setLiquidaciones([]);
    }
    setLoading(false);
  }

  if (!briefId) return null;

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:300, backdropFilter:'blur(2px)' }}/>

      {/* Panel lateral */}
      <div style={{
        position:'fixed', top:0, right:0, height:'100vh', width:'100%', maxWidth:520,
        background:'#fff', zIndex:301, display:'flex', flexDirection:'column',
        boxShadow:'-4px 0 24px rgba(0,0,0,.15)',
        animation: 'slideIn .2s ease',
      }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>

        {/* Header */}
        <div style={{ padding:'18px 20px 14px', borderBottom:'1px solid #eee', background:'#0d3b5e', color:'#fff', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.6)', marginBottom:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Expediente del proyecto</div>
              {loading
                ? <div style={{ fontSize:16, fontWeight:700 }}>Cargando…</div>
                : <div style={{ fontSize:17, fontWeight:700, lineHeight:1.3 }}>{brief?.nombre || '—'}</div>
              }
              {brief && <div style={{ fontSize:12, color:'rgba(255,255,255,.7)', marginTop:4 }}>🏢 {brief.cliente_nombre}</div>}
            </div>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,.15)', border:'none', borderRadius:8, color:'#fff', fontSize:18, cursor:'pointer', padding:'4px 10px', flexShrink:0 }}>✕</button>
          </div>
          {brief && (
            <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
              <StatusBadge estado={brief.estado} tipo="brief"/>
              {brief.fecha_entrega && <span style={{ fontSize:11, color:'rgba(255,255,255,.7)' }}>📅 Entrega: {fmtDate(brief.fecha_entrega)}</span>}
              {brief.fecha_evento  && <span style={{ fontSize:11, color:'rgba(255,255,255,.7)' }}>🎯 Evento: {fmtDate(brief.fecha_evento)}</span>}
              {brief.pax > 0       && <span style={{ fontSize:11, color:'rgba(255,255,255,.7)' }}>👥 {brief.pax} PAX</span>}
            </div>
          )}
        </div>

        {/* Contenido scrollable */}
        <div style={{ flex:1, overflowY:'auto', padding:'18px 20px' }}>
          {loading ? (
            <div style={{ textAlign:'center', padding:'3rem', color:'#888' }}>Cargando expediente…</div>
          ) : (
            <>
              {/* Datos del proyecto */}
              <Section icon="◇" title="Datos del proyecto">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[
                    ['Responsable', brief?.responsable],
                    ['Ciudad',      brief?.ciudad],
                    ['Lugar',       brief?.lugar],
                    ['Días',        brief?.dias_evento],
                    ['Presupuesto est.', brief?.presupuesto_estimado ? fmt(brief.presupuesto_estimado) : null],
                  ].filter(([,v]) => v).map(([l, v]) => (
                    <div key={l} style={{ background:'#f8fafc', borderRadius:7, padding:'8px 10px' }}>
                      <div style={{ fontSize:10, color:'#8aa0b8', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>{l}</div>
                      <div style={{ fontSize:13, fontWeight:500, color:'#0d3b5e' }}>{v}</div>
                    </div>
                  ))}
                </div>
                {brief?.descripcion && (
                  <div style={{ marginTop:10, background:'#f8fafc', borderRadius:7, padding:'10px 12px', fontSize:13, color:'#555', lineHeight:1.6 }}>
                    {brief.descripcion}
                  </div>
                )}
                {brief?.archivo_url && (
                  <a href={brief.archivo_url} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:8, fontSize:12, color:'#2563eb', textDecoration:'none' }}>
                    📎 {brief.archivo_nombre || 'Ver brief adjunto'} ↗
                  </a>
                )}
              </Section>

              {/* Propuestas */}
              <Section icon="🎨" title="Propuesta creativa" count={propuestas.length}>
                {propuestas.length === 0
                  ? <EmptyMsg msg="Sin propuesta creativa aún"/>
                  : propuestas.map(p => (
                    <div key={p.id} style={{ background:'#f8fafc', border:'1px solid #eee', borderRadius:9, padding:'10px 12px', marginBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <span style={{ fontSize:13, fontWeight:600, color:'#0d3b5e', flex:1 }}>{p.titulo}</span>
                        <StatusBadge estado={p.estado} tipo="propuesta"/>
                      </div>
                      {p.canva_url && (
                        <a href={p.canva_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'#7c3aed', fontWeight:500, textDecoration:'none' }}>
                          🎨 Abrir en Canva ↗
                        </a>
                      )}
                      {p.notas && <div style={{ fontSize:12, color:'#888', marginTop:6, lineHeight:1.5 }}>{p.notas}</div>}
                    </div>
                  ))
                }
              </Section>

              {/* Presupuestos */}
              <Section icon="💰" title="Presupuestos" count={presupuestos.length}>
                {presupuestos.length === 0
                  ? <EmptyMsg msg="Sin presupuestos vinculados"/>
                  : presupuestos.map(p => {
                    const t = calcPpto(p);
                    return (
                      <div key={p.id} style={{ background:'#f8fafc', border:'1px solid #eee', borderLeft:`3px solid ${ESTADOS_PPTO_COLORS[p.estado]||'#ddd'}`, borderRadius:'0 9px 9px 0', padding:'10px 12px', marginBottom:8 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:600, color:'#0d3b5e', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nombre || p.cliente}</span>
                          <StatusBadge estado={p.estado} tipo="ppto"/>
                        </div>
                        {p.nomenclatura && <div style={{ fontSize:10, color:'#8aa0b8', fontFamily:'monospace', marginBottom:4 }}>{p.nomenclatura}</div>}
                        <div style={{ display:'flex', gap:12, fontSize:12, color:'#555' }}>
                          <span>💵 {fmt(t.totalSinIva)} s/IVA</span>
                          <span style={{ color: t.margenPct >= 20 ? '#2e8b4e' : '#c8264a' }}>
                            Margen: {t.margenPct.toFixed(1)}%
                          </span>
                          {p.ejecutado && <span style={{ color:'#2e8b4e' }}>✅ Ejecutado</span>}
                        </div>
                      </div>
                    );
                  })
                }
                {/* Totales si hay varios presupuestos */}
                {presupuestos.length > 1 && (() => {
                  const totalGeneral = presupuestos.reduce((a, p) => a + calcPpto(p).totalSinIva, 0);
                  return (
                    <div style={{ background:'#0d3b5e', borderRadius:9, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:12, color:'rgba(255,255,255,.7)' }}>Total {presupuestos.length} presupuestos</span>
                      <span style={{ fontSize:15, fontWeight:700, color:'#fff' }}>{fmt(totalGeneral)}</span>
                    </div>
                  );
                })()}
              </Section>

              {/* Liquidaciones */}
              <Section icon="🧾" title="Liquidaciones" count={liquidaciones.length}>
                {liquidaciones.length === 0
                  ? <EmptyMsg msg="Sin liquidaciones"/>
                  : liquidaciones.map(l => {
                    const gastos = (l.gastos || []).reduce((a, g) => a + Number(g.monto || 0), 0);
                    const estadoColor = { abierta:'#e8a020', enviada:'#0d3b5e', liquidado:'#2e8b4e' }[l.estado] || '#888';
                    return (
                      <div key={l.id} style={{ background:'#f8fafc', border:'1px solid #eee', borderRadius:9, padding:'10px 12px', marginBottom:8 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:600, color:'#0d3b5e', flex:1 }}>{l.evento || l.presupuesto_nombre}</span>
                          <span style={{ fontSize:11, padding:'2px 9px', borderRadius:999, fontWeight:500, background:estadoColor+'22', color:estadoColor }}>
                            {l.estado}
                          </span>
                        </div>
                        <div style={{ fontSize:12, color:'#555' }}>
                          {l.responsable && <span>👤 {l.responsable} · </span>}
                          <span>💵 {fmt(gastos)} en gastos</span>
                        </div>
                      </div>
                    );
                  })
                }
              </Section>

              {/* Implementaciones */}
              <Section icon="🎯" title="Implementaciones" count={implementaciones.length}>
                {implementaciones.length === 0
                  ? <EmptyMsg msg="Sin implementaciones vinculadas"/>
                  : implementaciones.map(i => {
                    const days = (() => {
                      if (!i.fecha_evento) return null;
                      const t = new Date(); t.setHours(0,0,0,0);
                      const [y,m,d] = i.fecha_evento.split('-').map(Number);
                      return Math.ceil((new Date(y,m-1,d) - t) / 86400000);
                    })();
                    return (
                      <div key={i.id} style={{ background:'#f5f3ff', border:'1px solid #ede9fe', borderRadius:9, padding:'10px 12px', marginBottom:8 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'#5b21b6', marginBottom:4 }}>🎯 {i.nombre}</div>
                        <div style={{ fontSize:12, color:'#555', display:'flex', gap:10, flexWrap:'wrap' }}>
                          {i.ciudad && <span>📍 {i.ciudad}</span>}
                          {i.fecha_montaje && <span>🔧 Montaje: {fmtDate(i.fecha_montaje)}</span>}
                          <span>📅 Evento: {fmtDate(i.fecha_evento)}</span>
                          {days !== null && (
                            <span style={{ fontWeight:600, color: days < 0 ? '#991b1b' : days <= 7 ? '#5b21b6' : '#555' }}>
                              {days < 0 ? `Finalizado hace ${Math.abs(days)}d` : days === 0 ? '¡Hoy!' : `En ${days}d`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                }
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 20px', borderTop:'1px solid #eee', display:'flex', justifyContent:'flex-end', flexShrink:0 }}>
          <button onClick={onClose} style={{ padding:'8px 20px', background:'#f0f4f8', border:'1px solid #dde6ef', borderRadius:8, fontSize:13, cursor:'pointer', color:'#0d3b5e', fontFamily:'inherit', fontWeight:500 }}>
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}
