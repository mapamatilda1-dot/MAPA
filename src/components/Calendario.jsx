import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ESTADOS_BRIEF_COLORS, ESTADOS_PROPUESTA_COLORS } from '../roles';
import ExpedientePanel from './ExpedientePanel';

const DAYS   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function toStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

const STATUS_COLORS = {
  pendiente:   { bg:'#fef9c3', border:'#ca8a04', text:'#854d0e' },
  en_progreso: { bg:'#dbeafe', border:'#3b82f6', text:'#1e40af' },
  con_cambios: { bg:'#ffedd5', border:'#f97316', text:'#9a3412' },
  entregado:   { bg:'#dcfce7', border:'#22c55e', text:'#166534' },
  borrador:    { bg:'#f3f4f6', border:'#9ca3af', text:'#374151' },
  enviada:     { bg:'#dbeafe', border:'#3b82f6', text:'#1e40af' },
  aprobada:    { bg:'#dcfce7', border:'#22c55e', text:'#166534' },
  rechazada:   { bg:'#fee2e2', border:'#ef4444', text:'#991b1b' },
};

function getColor(estado) {
  return STATUS_COLORS[estado] || { bg:'#f3f4f6', border:'#9ca3af', text:'#374151' };
}

export default function Calendario() {
  const today = new Date();
  const [view, setView]       = useState('month');
  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(null);
  const [expedienteId, setExpedienteId] = useState(null);
  const [briefs, setBriefs]   = useState([]);
  const [impls, setImpls]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: br }, { data: im }] = await Promise.all([
        supabase.from('briefs').select('id, nombre, cliente_nombre, fecha_entrega, estado'),
        supabase.from('implementaciones').select('*').order('fecha_evento'),
      ]);
      setBriefs(br || []);
      setImpls(im || []);
      setLoading(false);
    }
    load();
  }, []);

  function briefsForDay(dateStr) {
    return briefs.filter(b => b.fecha_entrega === dateStr);
  }
  function implsForDay(dateStr) {
    return impls.filter(i => {
      const fin = i.fecha_evento_fin || i.fecha_evento;
      return (dateStr >= i.fecha_evento && dateStr <= fin) || i.fecha_montaje === dateStr;
    });
  }
  function implLabel(impl, dateStr) {
    if (impl.fecha_montaje === dateStr && impl.fecha_evento !== dateStr) return `🔧 ${impl.nombre}`;
    return `🎯 ${impl.nombre}`;
  }

  const navBtnStyle = { width:32, height:32, borderRadius:8, border:'1px solid #ddd', background:'transparent', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#555', fontFamily:'inherit' };

  function DayCell({ dateStr, day, isToday, isSelected, onClick }) {
    const dayBriefs    = briefsForDay(dateStr);
    const dayPropuestas = [];
    const dayImpls     = implsForDay(dateStr);
    const total = dayBriefs.length + dayImpls.length;

    return (
      <div onClick={onClick} style={{
        minHeight:72, padding:4, borderRadius:8, cursor:'pointer',
        border: isSelected?'2px solid #1a1a1a': isToday?'2px solid #3b82f6':'1px solid #e8e8e8',
        background: isSelected?'#f9f9f7':'#fff', transition:'border-color .1s',
      }}>
        <div style={{ fontSize:12, fontWeight:isToday?600:400, color:isToday?'#2563eb':'#333', marginBottom:3 }}>{day}</div>
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          {dayImpls.slice(0,2).map(i => (
            <div key={'i'+i.id} style={{ fontSize:10, padding:'1px 5px', borderRadius:4, background:'#ede9fe', color:'#5b21b6', borderLeft:'2px solid #7c3aed', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {implLabel(i, dateStr)}
            </div>
          ))}
          {dayBriefs.slice(0,2).map(b => {
            const c = getColor(b.estado);
            return <div key={'b'+b.id} style={{ fontSize:10, padding:'1px 5px', borderRadius:4, background:c.bg, color:c.text, borderLeft:`2px solid ${c.border}`, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>📋 {b.nombre}</div>;
          })}          {total > 3 && <div style={{ fontSize:10, color:'#888' }}>+{total-3} más</div>}
        </div>
      </div>
    );
  }

  function DayDetail({ dateStr }) {
    const dayBriefs    = briefsForDay(dateStr);
    const dayPropuestas = [];
    const dayImpls     = implsForDay(dateStr);
    const fecha = new Date(dateStr+'T12:00').toLocaleDateString('es', { weekday:'long', day:'numeric', month:'long' });

    if (!dayBriefs.length && !dayImpls.length) {
      return <div style={{ marginTop:'1rem', background:'#fff', border:'1px solid #e8e8e8', borderRadius:10, padding:'1rem' }}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:8, textTransform:'capitalize' }}>{fecha}</div>
        <div style={{ fontSize:13, color:'#aaa' }}>Sin eventos este día</div>
      </div>;
    }

    return (
      <div style={{ marginTop:'1rem', background:'#fff', border:'1px solid #e8e8e8', borderRadius:10, padding:'1rem' }}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:12, textTransform:'capitalize' }}>{fecha}</div>
        {dayImpls.map(i => (
          <div key={i.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:8, background:'#f5f3ff', border:'1px solid #ede9fe', marginBottom:6 }}>
            <div style={{ width:3, height:36, borderRadius:2, background:'#7c3aed', flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:500 }}>{implLabel(i, dateStr)}</div>
              {i.ciudad && <div style={{ fontSize:12, color:'#7c3aed', marginTop:1 }}>📍 {i.ciudad}</div>}
            </div>
            <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:'#ede9fe', color:'#5b21b6', fontWeight:500 }}>Implementación</span>
          </div>
        ))}
        {dayBriefs.map(b => {
          const c = getColor(b.estado);
          return (
            <div key={b.id} onClick={()=>setExpedienteId(b.id)} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:8, background:'#f9f9f7', border:'1px solid #eee', marginBottom:6, cursor:'pointer' }}>
              <div style={{ width:3, height:36, borderRadius:2, background:c.border, flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:500 }}>📋 {b.nombre}</div>
                {b.cliente_nombre && <div style={{ fontSize:12, color:'#888', marginTop:1 }}>🏢 {b.cliente_nombre}</div>}
              </div>
              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:c.bg, color:c.text, fontWeight:500 }}>Entrega</span>
              <span style={{ fontSize:11, color:'#7c3aed' }}>📁</span>
            </div>
          );
        })}      </div>
    );
  }

  const ESTADOS_PROPUESTA_LABELS_MAP = { borrador:'Borrador', enviada:'Enviada', aprobada:'Aprobada', rechazada:'Rechazada' };

  function MonthView() {
    const year = current.getFullYear(), month = current.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const todayStr = toStr(today);
    const cells = [];
    for (let i=0; i<firstDay; i++) cells.push(null);
    for (let d=1; d<=daysInMonth; d++) cells.push(d);

    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
          <button onClick={()=>{ setCurrent(new Date(year,month-1,1)); setSelected(null); }} style={navBtnStyle}>‹</button>
          <span style={{ fontSize:16, fontWeight:500 }}>{MONTHS[month]} {year}</span>
          <button onClick={()=>{ setCurrent(new Date(year,month+1,1)); setSelected(null); }} style={navBtnStyle}>›</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:2 }}>
          {DAYS.map(d=><div key={d} style={{ textAlign:'center', fontSize:11, color:'#888', fontWeight:500, padding:'4px 0', textTransform:'uppercase', letterSpacing:'.04em' }}>{d}</div>)}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
          {cells.map((day,i) => {
            if (!day) return <div key={`e${i}`}/>;
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            return <DayCell key={dateStr} dateStr={dateStr} day={day} isToday={dateStr===toStr(today)} isSelected={dateStr===selected} onClick={()=>setSelected(s=>s===dateStr?null:dateStr)}/>;
          })}
        </div>
        {selected && <DayDetail dateStr={selected}/>}
      </div>
    );
  }

  function WeekView() {
    const startOfWeek = new Date(current);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const days = Array.from({length:7}, (_,i) => { const d=new Date(startOfWeek); d.setDate(d.getDate()+i); return d; });
    const label = `${days[0].getDate()} ${MONTHS[days[0].getMonth()]} — ${days[6].getDate()} ${MONTHS[days[6].getMonth()]} ${days[6].getFullYear()}`;

    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
          <button onClick={()=>{ const d=new Date(current); d.setDate(d.getDate()-7); setCurrent(d); setSelected(null); }} style={navBtnStyle}>‹</button>
          <span style={{ fontSize:15, fontWeight:500 }}>{label}</span>
          <button onClick={()=>{ const d=new Date(current); d.setDate(d.getDate()+7); setCurrent(d); setSelected(null); }} style={navBtnStyle}>›</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6 }}>
          {days.map(d => {
            const dateStr = toStr(d);
            const isToday = dateStr===toStr(today);
            const isSelected = dateStr===selected;
            const dayBriefs = briefsForDay(dateStr);
            const dayImpls  = implsForDay(dateStr);
            const dayProps  = [];
            return (
              <div key={dateStr} onClick={()=>setSelected(s=>s===dateStr?null:dateStr)} style={{ minHeight:120, padding:8, borderRadius:10, cursor:'pointer', overflow:'hidden', border:isSelected?'2px solid #1a1a1a':isToday?'2px solid #3b82f6':'1px solid #e8e8e8', background:isSelected?'#f9f9f7':isToday?'#eff6ff':'#fff' }}>
                <div style={{ textAlign:'center', marginBottom:6 }}>
                  <div style={{ fontSize:11, color:'#888', textTransform:'uppercase', letterSpacing:'.04em' }}>{DAYS[d.getDay()]}</div>
                  <div style={{ fontSize:18, fontWeight:isToday?600:400, color:isToday?'#2563eb':'#1a1a1a' }}>{d.getDate()}</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  {dayImpls.map(i=><div key={'i'+i.id} style={{ fontSize:11, padding:'3px 6px', borderRadius:5, background:'#ede9fe', color:'#5b21b6', borderLeft:'2px solid #7c3aed', lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{implLabel(i,dateStr)}</div>)}
                  {dayBriefs.map(b=>{ const c=getColor(b.estado); return <div key={'b'+b.id} style={{ fontSize:11, padding:'3px 6px', borderRadius:5, background:c.bg, color:c.text, borderLeft:`2px solid ${c.border}`, lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>📋 {b.nombre}</div>; })}                </div>
              </div>
            );
          })}
        </div>
        {selected && <DayDetail dateStr={selected}/>}
      </div>
    );
  }

  if (loading) return <div style={{ padding:'2rem', textAlign:'center', color:'#888' }}>Cargando calendario…</div>;

  return (
    <div style={{ width:'100%', overflowX:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:'1.25rem', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:4 }}>
          {['month','week'].map(v=>(
            <button key={v} onClick={()=>{ setView(v); setSelected(null); }} style={{ padding:'6px 16px', borderRadius:8, border:'1px solid', fontSize:13, cursor:'pointer', fontFamily:'inherit', background:view===v?'#1a1a1a':'transparent', color:view===v?'#fff':'#555', borderColor:view===v?'#1a1a1a':'#ddd' }}>
              {v==='month'?'Mes':'Semana'}
            </button>
          ))}
        </div>
        <button onClick={()=>{ setCurrent(new Date(today.getFullYear(),today.getMonth(),1)); setSelected(null); }} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #ddd', background:'transparent', fontSize:13, cursor:'pointer', color:'#555', fontFamily:'inherit' }}>
          Hoy
        </button>
        {/* Leyenda */}
        <div style={{ marginLeft:'auto', display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
          {[
            { label:'Entrega brief', bg:'#dcfce7', border:'#22c55e' },            { label:'Implementación', bg:'#ede9fe', border:'#7c3aed' },
          ].map(l=>(
            <div key={l.label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'#555' }}>
              <div style={{ width:10, height:10, borderRadius:3, background:l.bg, border:`2px solid ${l.border}` }}/>
              {l.label}
            </div>
          ))}
        </div>
      </div>
      {view==='month' ? <MonthView/> : <WeekView/>}
      {expedienteId && <ExpedientePanel briefId={expedienteId} onClose={()=>setExpedienteId(null)}/>}
    </div>
  );
}
