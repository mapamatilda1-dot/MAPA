import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ── Configuración de qué ve cada usuario ──────────────────────
const NOTIF_CONFIG = {
  'camille@matilda.agency':     ['briefs_nuevos', 'presupuestos_enviados', 'presupuestos_aprobado', 'tareas_asignadas'],
  'mariajose@matilda.agency':   ['briefs_nuevos', 'solicitudes_dinero', 'presupuestos_aprobacion_majo', 'presupuestos_cerrado', 'liquidaciones_nuevas', 'tareas_asignadas'],
  'melanie@matilda.agency':     ['briefs_nuevos', 'solicitudes_dinero', 'presupuestos_revision_mel', 'presupuestos_cerrado', 'tareas_asignadas'],
  'taylor@matilda.agency':      ['solicitudes_dinero', 'tareas_asignadas'],
  'johanna@matilda.agency':     ['presupuestos_aprobado', 'presupuestos_ejecutado', 'presupuestos_cerrado', 'solicitudes_dinero', 'liquidaciones_nuevas', 'tareas_asignadas'],
  'carlos@matilda.agency':      ['briefs_nuevos', 'tareas_asignadas'],
  'wendy@matilda.agency':       ['briefs_nuevos', 'presupuestos_aprobado', 'solicitudes_aprobadas', 'tareas_asignadas'],
  'camilo@matilda.agency':      ['briefs_nuevos', 'presupuestos_enviados', 'presupuestos_aprobado', 'tareas_asignadas'],
  'mariaisabel@matilda.agency': ['briefs_nuevos', 'presupuestos_enviados', 'presupuestos_aprobado', 'tareas_asignadas'],
};
// Producción (juan, firi, cindry, mariaeugenia) — por rol
const NOTIF_POR_ROL = {
  produccion: ['solicitudes_aprobadas', 'presupuestos_asignados', 'tareas_asignadas'],
  admin: ['briefs_nuevos', 'solicitudes_dinero', 'presupuestos_aprobacion', 'tareas_asignadas'],
  ventas: ['briefs_nuevos', 'tareas_asignadas'],
  financiero: ['solicitudes_dinero', 'presupuestos_aprobado', 'liquidaciones_nuevas', 'tareas_asignadas'],
};

function getNotifTypes(email, role) {
  if (NOTIF_CONFIG[email]) return NOTIF_CONFIG[email];
  return NOTIF_POR_ROL[role] || [];
}

// ── Estilos por tipo ───────────────────────────────────────────
const TYPE_STYLE = {
  brief:        { icon: '📋', color: '#0d3b5e', bg: '#eef4fb', label: 'Brief nuevo' },
  solicitud:    { icon: '💰', color: '#c8264a', bg: '#fff0f3', label: 'Solicitud de dinero' },
  sol_aprobada: { icon: '✅', color: '#2e8b4e', bg: '#edf7ed', label: 'Solicitud aprobada' },
  presupuesto:  { icon: '📊', color: '#7c3aed', bg: '#f5f3ff', label: 'Presupuesto' },
  liquidacion:  { icon: '🧾', color: '#c8264a', bg: '#fff0f3', label: 'Liquidación' },
  tarea:        { icon: '🗂️', color: '#0d3b5e', bg: '#eef4fb', label: 'Tarea asignada' },
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return 'hace ' + Math.floor(diff/60) + ' min';
  if (diff < 86400) return 'hace ' + Math.floor(diff/3600) + ' h';
  return 'hace ' + Math.floor(diff/86400) + ' días';
}

export default function Notificaciones({ userEmail, userRole, onNavigate }) {
  const [notifs, setNotifs] = useState([]);
  const [gestionadas, setGestionadas] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);

  const tipos = getNotifTypes(userEmail, userRole || 'produccion');
  const SINCE = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Cargar gestionadas
      const { data: gest } = await supabase
        .from('notificaciones_gestionadas')
        .select('notif_key')
        .eq('user_email', userEmail);
      const gestSet = new Set((gest||[]).map(g => g.notif_key));
      setGestionadas(gestSet);

      const all = [];

      // ── Briefs nuevos ──────────────────────────────────────
      if (tipos.includes('briefs_nuevos')) {
        const { data: briefs } = await supabase
          .from('briefs')
          .select('id, nombre, cliente_nombre, created_at, estado')
          .gte('created_at', SINCE)
          .order('created_at', { ascending: false });
        (briefs||[]).forEach(b => all.push({
          key: 'brief_' + b.id,
          typeStyle: TYPE_STYLE.brief,
          titulo: b.nombre || 'Brief sin nombre',
          subtitulo: b.cliente_nombre || '',
          fecha: b.created_at,
          accion: 'Ver brief',
          nav: { tab: 'briefs' },
        }));
      }

      // ── Solicitudes de dinero enviadas ──────────────────────
      if (tipos.includes('solicitudes_dinero')) {
        const { data: sols } = await supabase
          .from('solicitudes')
          .select('id, presupuesto_nombre, created_at, estado, created_by_nombre, items')
          .eq('estado', 'enviada')
          .gte('created_at', SINCE)
          .order('created_at', { ascending: false });
        (sols||[]).forEach(s => {
          const total = (s.items||[]).reduce((a,it)=>a+Number(it.valor_solicitado||0),0);
          all.push({
            key: 'sol_' + s.id,
            typeStyle: TYPE_STYLE.solicitud,
            titulo: 'Solicitud de valores: ' + (s.presupuesto_nombre||''),
            subtitulo: (s.created_by_nombre||'') + (total>0?' · $'+total.toFixed(2):''),
            fecha: s.created_at,
            urgente: true,
            accion: 'Aprobar / Rechazar',
            nav: { tab: 'solicitudes' },
          });
        });
      }

      // ── Solicitudes aprobadas (para producción y wendy) ─────
      if (tipos.includes('solicitudes_aprobadas')) {
        const { data: sols } = await supabase
          .from('solicitudes')
          .select('id, presupuesto_nombre, created_at, estado, created_by_nombre, items')
          .eq('estado', 'pagado')
          .eq('created_by', userEmail)
          .gte('updated_at', SINCE)
          .order('updated_at', { ascending: false });
        (sols||[]).forEach(s => {
          const total = (s.items||[]).reduce((a,it)=>a+Number(it.valor_solicitado||0),0);
          all.push({
            key: 'solapro_' + s.id,
            typeStyle: TYPE_STYLE.sol_aprobada,
            titulo: 'Solicitud aprobada: ' + (s.presupuesto_nombre||''),
            subtitulo: total>0 ? '$'+total.toFixed(2)+' aprobado' : '',
            fecha: s.created_at,
            accion: 'Ver solicitud',
            nav: { tab: 'solicitudes' },
          });
        });
      }

      // ── Presupuestos enviados a cliente (camille) ───────────
      if (tipos.includes('presupuestos_enviados')) {
        const { data: pptos } = await supabase
          .from('presupuestos')
          .select('id, nombre, cliente, estado, updated_at')
          .in('estado', ['aprobado', 'pendiente_facturar', 'facturado'])
          .gte('updated_at', SINCE)
          .order('updated_at', { ascending: false });
        (pptos||[]).forEach(p => all.push({
          key: 'ppto_env_' + p.id,
          typeStyle: TYPE_STYLE.presupuesto,
          titulo: 'Presupuesto enviado: ' + (p.nombre||p.cliente||''),
          subtitulo: p.cliente||'',
          fecha: p.updated_at,
          accion: 'Ver presupuesto',
          nav: { tab: 'presupuestos' },
        }));
      }

      // ── Presupuestos pendientes aprobación MJ ───────────────
      if (tipos.includes('presupuestos_aprobacion_majo')) {
        const { data: pptos } = await supabase
          .from('presupuestos')
          .select('id, nombre, cliente, estado, updated_at')
          .eq('estado', 'borrador')
          .gte('updated_at', SINCE)
          .order('updated_at', { ascending: false });
        (pptos||[]).forEach(p => all.push({
          key: 'ppto_apr_' + p.id,
          typeStyle: { ...TYPE_STYLE.presupuesto, icon: '⏳', label: 'Pendiente aprobación' },
          titulo: 'Pendiente aprobación: ' + (p.nombre||p.cliente||''),
          subtitulo: p.cliente||'',
          fecha: p.updated_at,
          urgente: true,
          accion: 'Revisar',
          nav: { tab: 'presupuestos' },
        }));
      }

      // ── Presupuestos para revisión (melanie) ────────────────
      if (tipos.includes('presupuestos_revision_mel')) {
        const { data: pptos } = await supabase
          .from('presupuestos')
          .select('id, nombre, cliente, estado, updated_at')
          .in('estado', ['borrador', 'aprobado'])
          .gte('updated_at', SINCE)
          .order('updated_at', { ascending: false });
        (pptos||[]).forEach(p => all.push({
          key: 'ppto_rev_' + p.id,
          typeStyle: TYPE_STYLE.presupuesto,
          titulo: 'Presupuesto para revisar: ' + (p.nombre||p.cliente||''),
          subtitulo: p.estado + ' · ' + (p.cliente||''),
          fecha: p.updated_at,
          accion: 'Revisar',
          nav: { tab: 'presupuestos' },
        }));
      }

      // ── Presupuestos aprobados (johanna, wendy) ─────────────
      if (tipos.includes('presupuestos_aprobado')) {
        const { data: pptos } = await supabase
          .from('presupuestos')
          .select('id, nombre, cliente, estado, updated_at')
          .eq('estado', 'aprobado')
          .gte('updated_at', SINCE)
          .order('updated_at', { ascending: false });
        (pptos||[]).forEach(p => all.push({
          key: 'ppto_ok_' + p.id,
          typeStyle: { ...TYPE_STYLE.presupuesto, icon: '✅', color: '#2e8b4e', bg: '#edf7ed' },
          titulo: 'Presupuesto aprobado: ' + (p.nombre||p.cliente||''),
          subtitulo: p.cliente||'',
          fecha: p.updated_at,
          accion: 'Ver',
          nav: { tab: 'presupuestos' },
        }));
      }

      // ── Presupuestos ejecutados (johanna) ───────────────────
      if (tipos.includes('presupuestos_ejecutado')) {
        const { data: pptos } = await supabase
          .from('presupuestos')
          .select('id, nombre, cliente, estado, updated_at, ejecutado')
          .eq('ejecutado', true)
          .gte('updated_at', SINCE)
          .order('updated_at', { ascending: false });
        (pptos||[]).forEach(p => all.push({
          key: 'ppto_ej_' + p.id,
          typeStyle: { ...TYPE_STYLE.presupuesto, icon: '🎯' },
          titulo: 'Presupuesto ejecutado: ' + (p.nombre||p.cliente||''),
          subtitulo: p.cliente||'',
          fecha: p.updated_at,
          accion: 'Ver',
          nav: { tab: 'presupuestos' },
        }));
      }

      // ── Presupuestos cerrados por producción (johanna, melanie)
      if (tipos.includes('presupuestos_cerrado')) {
        const { data: pptos } = await supabase
          .from('presupuestos')
          .select('id, nombre, cliente, estado, updated_at, cerrado_produccion')
          .eq('cerrado_produccion', true)
          .gte('updated_at', SINCE)
          .order('updated_at', { ascending: false });
        (pptos||[]).forEach(p => all.push({
          key: 'ppto_cie_' + p.id,
          typeStyle: { ...TYPE_STYLE.presupuesto, icon: '🔒', color: '#555' },
          titulo: 'Cerrado por producción: ' + (p.nombre||p.cliente||''),
          subtitulo: p.cliente||'',
          fecha: p.updated_at,
          accion: 'Ver',
          nav: { tab: 'presupuestos' },
        }));
      }

      // ── Liquidaciones nuevas (johanna) ──────────────────────
      if (tipos.includes('liquidaciones_nuevas')) {
        const { data: liqs } = await supabase
          .from('liquidaciones')
          .select('id, presupuesto_nombre, cliente_nombre, updated_at, estado')
          .eq('estado', 'enviada')
          .gte('updated_at', SINCE)
          .order('updated_at', { ascending: false });
        (liqs||[]).forEach(l => all.push({
          key: 'liq_' + l.id,
          typeStyle: TYPE_STYLE.liquidacion,
          titulo: '🧾 Liquidación enviada: ' + (l.presupuesto_nombre||l.cliente_nombre||''),
          subtitulo: l.cliente_nombre || '',
          fecha: l.updated_at,
          urgente: true,
          accion: 'Ver liquidación',
          nav: { tab: 'liquidaciones' },
        }));
      }

      // ── Presupuestos asignados al usuario (producción) ────
      if (tipos.includes('presupuestos_asignados')) {
        const { data: pptos } = await supabase
          .from('presupuestos')
          .select('id, nombre, cliente, estado, updated_at, productor_email, productor_nombre')
          .eq('productor_email', userEmail)
          .gte('updated_at', SINCE)
          .order('updated_at', { ascending: false });
        (pptos||[]).forEach(p => all.push({
          key: 'ppto_asig_' + p.id,
          typeStyle: { ...TYPE_STYLE.presupuesto, icon: '🎯', color: '#7c3aed', bg: '#f5f3ff' },
          titulo: '🎯 Presupuesto asignado: ' + (p.nombre||p.cliente||''),
          subtitulo: p.cliente + ' · ' + (p.estado||''),
          fecha: p.updated_at,
          urgente: true,
          accion: 'Ver presupuesto',
          nav: { tab: 'presupuestos' },
        }));
      }

      // ── Tareas asignadas (Tráfico) ──────────────────────────
      if (tipos.includes('tareas_asignadas')) {
        const { data: tareas } = await supabase
          .from('tareas')
          .select('id, titulo, fecha_entrega, prioridad, estado, updated_at, asignado_email, brief_nombre')
          .eq('asignado_email', userEmail)
          .neq('estado', 'hecho')
          .order('updated_at', { ascending: false });
        (tareas||[]).forEach(t => {
          const urgente = t.prioridad === 'urgente' || t.prioridad === 'alta';
          all.push({
            key: 'tarea_' + t.id,
            typeStyle: TYPE_STYLE.tarea,
            titulo: '🗂️ Tarea: ' + (t.titulo||''),
            subtitulo: (t.brief_nombre ? t.brief_nombre + ' · ' : '') + (t.fecha_entrega ? 'Entrega ' + t.fecha_entrega.split('-').reverse().join('/') : ''),
            fecha: t.updated_at,
            urgente,
            accion: 'Ver tarea',
            nav: { tab: 'trafico' },
          });
        });
      }

      // Ordenar: urgentes primero, luego no gestionadas, luego por fecha
      all.sort((a, b) => {
        const aG = gestSet.has(a.key) ? 2 : (a.urgente ? 0 : 1);
        const bG = gestSet.has(b.key) ? 2 : (b.urgente ? 0 : 1);
        if (aG !== bG) return aG - bG;
        return new Date(b.fecha) - new Date(a.fecha);
      });

      setNotifs(all);
    } catch(e) { console.error(e); }
    setLoading(false);
  }, [userEmail, tipos.join(',')]);

  useEffect(() => { load(); }, [load]);

  async function marcarGestionado(key) {
    const next = new Set(gestionadas);
    if (next.has(key)) {
      next.delete(key);
      await supabase.from('notificaciones_gestionadas').delete()
        .eq('user_email', userEmail).eq('notif_key', key);
    } else {
      next.add(key);
      await supabase.from('notificaciones_gestionadas').upsert({ user_email: userEmail, notif_key: key });
    }
    setGestionadas(next);
  }

  const pendientes = notifs.filter(n => !gestionadas.has(n.key));
  const done = notifs.filter(n => gestionadas.has(n.key));

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300,color:'#8aa0b8',fontSize:14}}>
      Cargando notificaciones...
    </div>
  );

  return (
    <div style={{maxWidth:780,margin:'0 auto',padding:'24px 16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:800,color:'#0d3b5e',margin:0}}>🔔 Notificaciones</h2>
          <div style={{fontSize:13,color:'#8aa0b8',marginTop:4}}>
            Últimos 7 días · {pendientes.length} pendiente{pendientes.length!==1?'s':''}
          </div>
        </div>
        <button onClick={load} style={{background:'none',border:'1px solid #dde6ef',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:12,color:'#666',fontFamily:'inherit'}}>
          🔄 Actualizar
        </button>
      </div>

      {pendientes.length === 0 && (
        <div style={{textAlign:'center',padding:'48px 24px',background:'#f8fafc',borderRadius:12,border:'1px solid #dde6ef',color:'#8aa0b8'}}>
          <div style={{fontSize:40,marginBottom:12}}>✅</div>
          <div style={{fontSize:15,fontWeight:600,color:'#0d3b5e',marginBottom:6}}>Todo al día</div>
          <div style={{fontSize:13}}>No hay notificaciones pendientes</div>
        </div>
      )}

      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {pendientes.map(n => <NotifCard key={n.key} n={n} done={false} onGestionar={marcarGestionado} onNavigate={onNavigate}/>)}
      </div>

      {done.length > 0 && (
        <div style={{marginTop:24}}>
          <button onClick={()=>setShowDone(v=>!v)}
            style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'#8aa0b8',padding:'4px 0',fontFamily:'inherit',marginBottom:8}}>
            {showDone ? '▼' : '▶'} {done.length} gestionada{done.length!==1?'s':''}
          </button>
          {showDone && (
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {done.map(n => <NotifCard key={n.key} n={n} done={true} onGestionar={marcarGestionado} onNavigate={onNavigate}/>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotifCard({ n, done, onGestionar, onNavigate }) {
  const t = n.typeStyle || { icon: '🔔', color: '#0d3b5e', bg: '#eef4fb' };
  return (
    <div style={{
      display:'flex',alignItems:'center',gap:12,
      padding:done?'8px 12px':'14px 16px',
      background:done?'#f8fafc':(n.urgente?'#fff8f0':'#fff'),
      border:'1px solid '+(done?'#eef2f7':(n.urgente?'#fb923c55':'#dde6ef')),
      borderLeft:done?'3px solid #dde6ef':('4px solid '+(n.urgente?'#fb923c':t.color)),
      borderRadius:10,opacity:done?0.6:1,transition:'all 0.2s',
    }}>
      <div style={{
        width:done?28:38,height:done?28:38,flexShrink:0,
        background:done?'#f0f0f0':t.bg,borderRadius:'50%',
        display:'flex',alignItems:'center',justifyContent:'center',
        fontSize:done?14:18,
      }}>{t.icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:done?12:14,fontWeight:done?500:700,color:done?'#888':'#0d3b5e',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
          {n.titulo}
        </div>
        {n.subtitulo&&!done&&(
          <div style={{fontSize:12,color:'#8aa0b8',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{n.subtitulo}</div>
        )}
        {!done&&<div style={{fontSize:11,color:'#aab4c0',marginTop:3}}>{timeAgo(n.fecha)}</div>}
      </div>
      <div style={{display:'flex',gap:6,flexShrink:0}}>
        {!done&&onNavigate&&(
          <button onClick={()=>onNavigate(n.nav)}
            style={{padding:'5px 12px',borderRadius:7,border:'none',background:t.color,color:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>
            {n.accion}
          </button>
        )}
        <button onClick={()=>onGestionar(n.key)}
          style={{padding:'5px 10px',borderRadius:7,border:'1px solid '+(done?'#ddd':'#e0e8f0'),background:done?'#f0f0f0':'#fff',color:done?'#888':'#0d3b5e',cursor:'pointer',fontFamily:'inherit',fontSize:11,whiteSpace:'nowrap'}}>
          {done?'↩ Restaurar':'✓ Gestionado'}
        </button>
      </div>
    </div>
  );
}
