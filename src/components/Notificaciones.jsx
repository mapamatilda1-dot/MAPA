import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const NOTIF_TYPES = {
  brief:      { icon: '📋', color: '#0d3b5e', bg: '#eef4fb', label: 'Brief nuevo' },
  solicitud:  { icon: '💰', color: '#c8264a', bg: '#fff0f3', label: 'Solicitud de dinero' },
  presupuesto:{ icon: '📊', color: '#7c3aed', bg: '#f5f3ff', label: 'Presupuesto' },
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return 'hace ' + Math.floor(diff/60) + ' min';
  if (diff < 86400) return 'hace ' + Math.floor(diff/3600) + ' h';
  return 'hace ' + Math.floor(diff/86400) + ' días';
}

export default function Notificaciones({ userEmail, onNavigate }) {
  const [notifs, setNotifs] = useState([]);
  const [gestionadas, setGestionadas] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);

  const SINCE = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load gestionadas
      const { data: gest } = await supabase
        .from('notificaciones_gestionadas')
        .select('notif_key')
        .eq('user_email', userEmail);
      const gestSet = new Set((gest||[]).map(g => g.notif_key));
      setGestionadas(gestSet);

      const all = [];

      // 1. Briefs nuevos (últimos 7 días)
      const { data: briefs } = await supabase
        .from('briefs')
        .select('id, nombre, cliente_nombre, created_at, estado')
        .gte('created_at', SINCE)
        .order('created_at', { ascending: false });

      (briefs||[]).forEach(b => {
        all.push({
          key: 'brief_' + b.id,
          type: 'brief',
          titulo: b.nombre || 'Brief sin nombre',
          subtitulo: b.cliente_nombre || '',
          fecha: b.created_at,
          estado: b.estado,
          accion: 'Ver brief',
          nav: { tab: 'briefs', id: b.id },
        });
      });

      // 2. Solicitudes de dinero enviadas (pendientes de pago)
      const { data: sols } = await supabase
        .from('solicitudes')
        .select('id, presupuesto_nombre, created_at, estado, created_by_nombre, items')
        .in('estado', ['enviada', 'borrador'])
        .gte('created_at', SINCE)
        .order('created_at', { ascending: false });

      (sols||[]).forEach(s => {
        const total = (s.items||[]).reduce((a,it)=>a+Number(it.valor_solicitado||0),0);
        all.push({
          key: 'sol_' + s.id,
          type: 'solicitud',
          titulo: s.estado === 'enviada' ? '💰 Solicitud de valores enviada' : '📝 Borrador de solicitud',
          subtitulo: (s.presupuesto_nombre||'') + (s.created_by_nombre ? ' · ' + s.created_by_nombre : '') + (total > 0 ? ' · $' + total.toFixed(2) : ''),
          fecha: s.created_at,
          estado: s.estado,
          urgente: s.estado === 'enviada',
          accion: s.estado === 'enviada' ? 'Aprobar / Rechazar' : 'Ver borrador',
          nav: { tab: 'solicitudes', id: s.id },
        });
      });

      // 3. Presupuestos en estados que requieren atención
      const { data: pptos } = await supabase
        .from('presupuestos')
        .select('id, nombre, cliente, estado, created_at, updated_at')
        .in('estado', ['borrador', 'pendiente_facturar', 'aprobado'])
        .gte('updated_at', SINCE)
        .order('updated_at', { ascending: false });

      (pptos||[]).forEach(p => {
        const labels = {
          borrador: { titulo: '📝 Presupuesto en borrador', accion: 'Revisar' },
          aprobado: { titulo: '✅ Presupuesto aprobado', accion: 'Ver / Facturar' },
          pendiente_facturar: { titulo: '🧾 Pendiente de facturar', accion: 'Facturar' },
        };
        const l = labels[p.estado] || { titulo: 'Presupuesto', accion: 'Ver' };
        all.push({
          key: 'ppto_' + p.id,
          type: 'presupuesto',
          titulo: l.titulo + ': ' + (p.nombre || p.cliente || 'Sin nombre'),
          subtitulo: p.cliente || '',
          fecha: p.updated_at || p.created_at,
          estado: p.estado,
          urgente: p.estado === 'pendiente_facturar',
          accion: l.accion,
          nav: { tab: 'presupuestos', id: p.id },
        });
      });

      // Ordenar: no gestionadas primero, luego por fecha
      all.sort((a, b) => {
        const aG = gestSet.has(a.key) ? 1 : 0;
        const bG = gestSet.has(b.key) ? 1 : 0;
        if (aG !== bG) return aG - bG;
        return new Date(b.fecha) - new Date(a.fecha);
      });

      setNotifs(all);
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
  }, [userEmail]);

  useEffect(() => { load(); }, [load]);

  async function marcarGestionado(key) {
    const next = new Set(gestionadas);
    if (next.has(key)) {
      next.delete(key);
      await supabase.from('notificaciones_gestionadas').delete()
        .eq('user_email', userEmail).eq('notif_key', key);
    } else {
      next.add(key);
      await supabase.from('notificaciones_gestionadas').upsert({
        user_email: userEmail, notif_key: key
      });
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
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:800,color:'#0d3b5e',margin:0}}>🔔 Centro de notificaciones</h2>
          <div style={{fontSize:13,color:'#8aa0b8',marginTop:4}}>
            Últimos 7 días · {pendientes.length} pendiente{pendientes.length!==1?'s':''}
          </div>
        </div>
        <button onClick={load} style={{background:'none',border:'1px solid #dde6ef',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:12,color:'#666',fontFamily:'inherit'}}>
          🔄 Actualizar
        </button>
      </div>

      {/* Pendientes */}
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

      {/* Gestionadas */}
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
  const t = NOTIF_TYPES[n.type] || NOTIF_TYPES.presupuesto;

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:12,
      padding: done ? '8px 12px' : '14px 16px',
      background: done ? '#f8fafc' : (n.urgente ? '#fff8f0' : '#fff'),
      border: '1px solid ' + (done ? '#eef2f7' : (n.urgente ? '#fb923c55' : '#dde6ef')),
      borderLeft: done ? '3px solid #dde6ef' : ('4px solid ' + (n.urgente ? '#fb923c' : t.color)),
      borderRadius: 10,
      opacity: done ? 0.6 : 1,
      transition: 'all 0.2s',
    }}>
      {/* Icono */}
      <div style={{
        width: done ? 28 : 38, height: done ? 28 : 38, flexShrink:0,
        background: done ? '#f0f0f0' : t.bg,
        borderRadius: '50%', display:'flex', alignItems:'center', justifyContent:'center',
        fontSize: done ? 14 : 18,
      }}>
        {t.icon}
      </div>

      {/* Contenido */}
      <div style={{flex:1, minWidth:0}}>
        <div style={{
          fontSize: done ? 12 : 14, fontWeight: done ? 500 : 700,
          color: done ? '#888' : '#0d3b5e',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        }}>{n.titulo}</div>
        {n.subtitulo && !done && (
          <div style={{fontSize:12,color:'#8aa0b8',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
            {n.subtitulo}
          </div>
        )}
        {!done && <div style={{fontSize:11,color:'#aab4c0',marginTop:3}}>{timeAgo(n.fecha)}</div>}
      </div>

      {/* Acciones */}
      <div style={{display:'flex',gap:6,flexShrink:0}}>
        {!done && onNavigate && (
          <button onClick={()=>onNavigate(n.nav)}
            style={{padding:'5px 12px',borderRadius:7,border:'none',background:t.color,color:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>
            {n.accion}
          </button>
        )}
        <button onClick={()=>onGestionar(n.key)}
          style={{padding:'5px 10px',borderRadius:7,border:'1px solid ' + (done?'#ddd':'#e0e8f0'),background:done?'#f0f0f0':'#fff',color:done?'#888':'#0d3b5e',cursor:'pointer',fontFamily:'inherit',fontSize:11,whiteSpace:'nowrap'}}>
          {done ? '↩ Restaurar' : '✓ Gestionado'}
        </button>
      </div>
    </div>
  );
}
