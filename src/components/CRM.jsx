import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ── Paleta de avatares ────────────────────────────────────────
const AVG = ['#ddedf8','#fdf5e8','#f0e8f8','#dff0e8','#fdf0eb','#f8e8e8'];
const AVT = ['#1a4a7a','#7a4f1a','#4a1a7a','#1a5c3a','#c94f1e','#7a1a1a'];
const TCOL = { Llamada:'#1a4a7a', Email:'#1a5c3a', Reunión:'#4a1a7a', WhatsApp:'#1a5c3a', Visita:'#7a4f1a' };
const SCOL = {
  'Prospecto':'badge-blue','En negociación':'badge-amber',
  'Propuesta enviada':'badge-purple','Ganado':'badge-green','Perdido':'badge-red',
};

const TIPOS_CONTACTO = ['Llamada','Email','Reunión','WhatsApp','Visita'];
const ESTADOS_CONTACTO = ['Prospecto','En negociación','Propuesta enviada','Ganado','Perdido'];

function ini(name='') { return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
function fd(d) { if(!d) return '—'; const [y,m,day]=d.split('-'); return `${day}/${m}/${y}`; }
function isToday(d) { if(!d) return false; return d === new Date().toISOString().slice(0,10); }
function isPast(d)  { if(!d) return false; return d < new Date().toISOString().slice(0,10); }
function getWeekDays(off) {
  const now=new Date(), day=now.getDay(), mon=new Date(now);
  mon.setDate(now.getDate()-((day+6)%7)+off*7);
  return Array.from({length:7},(_,i) => { const d=new Date(mon); d.setDate(mon.getDate()+i); return d.toISOString().slice(0,10); });
}

// ── Badge ─────────────────────────────────────────────────────
function Badge({ type, children }) {
  const map = {
    'badge-green':  { background:'#dff0e8', color:'#1a5c3a' },
    'badge-amber':  { background:'#fdf5e8', color:'#7a4f1a' },
    'badge-blue':   { background:'#ddedf8', color:'#1a4a7a' },
    'badge-red':    { background:'#f8e8e8', color:'#7a1a1a' },
    'badge-gray':   { background:'#f0efe9', color:'#6b6860', border:'1px solid #e2e0d8' },
    'badge-purple': { background:'#f0e8f8', color:'#4a1a7a' },
    'badge-orange': { background:'#fdf0eb', color:'#c94f1e' },
  };
  const s = map[type] || map['badge-gray'];
  return (
    <span style={{
      display:'inline-block', padding:'3px 10px', borderRadius:100,
      fontSize:11, fontWeight:500, whiteSpace:'nowrap', ...s,
    }}>{children}</span>
  );
}

// ── Modal ─────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(20,18,14,.55)',
      zIndex:200, display:'flex', alignItems:'center', justifyContent:'center',
      padding:20, backdropFilter:'blur(2px)',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'#fff', borderRadius:14, width:'100%', maxWidth:530,
        maxHeight:'90vh', overflowY:'auto', boxShadow:'0 4px 20px rgba(0,0,0,.12)',
        border:'1px solid #e2e0d8',
      }}>
        <div style={{ padding:'18px 22px 14px', borderBottom:'1px solid #e2e0d8', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:15, fontWeight:600 }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#a09e99', padding:'2px 6px', borderRadius:6 }}>×</button>
        </div>
        <div style={{ padding:'18px 22px' }}>{children}</div>
        {footer && <div style={{ padding:'13px 22px', borderTop:'1px solid #e2e0d8', display:'flex', justifyContent:'flex-end', gap:8 }}>{footer}</div>}
      </div>
    </div>
  );
}

// ── Btn ───────────────────────────────────────────────────────
function Btn({ onClick, variant='primary', size='md', disabled, children }) {
  const base = { display:'inline-flex', alignItems:'center', gap:6, borderRadius:10, fontFamily:'inherit', fontWeight:500, cursor:disabled?'not-allowed':'pointer', border:'1px solid transparent', transition:'all .15s', opacity:disabled?.6:1 };
  const variants = {
    primary:   { background:'#1a5c3a', color:'#fff', borderColor:'#1a5c3a' },
    secondary: { background:'#fff', color:'#1a1915', borderColor:'#ccc9be' },
    danger:    { background:'#f8e8e8', color:'#7a1a1a', borderColor:'#e8b8b8' },
  };
  const sizes = { sm:{ padding:'5px 12px', fontSize:12 }, md:{ padding:'8px 16px', fontSize:13 }, xs:{ padding:'3px 9px', fontSize:11 } };
  return <button onClick={onClick} disabled={disabled} style={{...base,...variants[variant],...sizes[size]}}>{children}</button>;
}

// ── FormGroup ─────────────────────────────────────────────────
function FG({ label, span2, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5, gridColumn:span2?'span 2':undefined }}>
      <label style={{ fontSize:12, fontWeight:500, color:'#6b6860' }}>{label}</label>
      {children}
    </div>
  );
}

const inp = { fontFamily:'inherit', fontSize:13, padding:'9px 12px', border:'1px solid #ccc9be', borderRadius:10, background:'#fff', color:'#1a1915', width:'100%', outline:'none' };
const sel = { ...inp };

// ── ContactCard ───────────────────────────────────────────────
function ContactCard({ c, clients, onClick }) {
  const cl  = clients.find(x=>x.id===c.cliente_id) || { nombre:'—' };
  const idx = (clients.findIndex(x=>x.id===c.cliente_id)+4) % AVG.length;
  const ov  = isPast(c.proximo_contacto) && !c.validado;
  const tod = isToday(c.proximo_contacto);
  return (
    <div onClick={()=>onClick(c)} style={{
      background:'#fff', border:`1px solid #e2e0d8`,
      borderLeft: ov?'3px solid #c94f1e': tod?'3px solid #7a4f1a':'1px solid #e2e0d8',
      borderRadius:14, padding:'15px 17px',
      boxShadow:'0 1px 3px rgba(0,0,0,.08)', cursor:'pointer',
      transition:'box-shadow .15s',
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
        <div style={{
          width:36, height:36, borderRadius:'50%', flexShrink:0,
          background:AVG[idx], color:AVT[idx],
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:11, fontWeight:600,
        }}>{ini(cl.nombre)}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600 }}>{cl.nombre}</div>
          <div style={{ fontSize:12, color:'#6b6860', marginTop:3 }}>
            {fd(c.fecha)} &nbsp;·&nbsp;
            <span style={{ color:TCOL[c.tipo]||'#888', fontWeight:500 }}>{c.tipo}</span>
            {c.resultado ? ` · ${c.resultado.slice(0,55)}${c.resultado.length>55?'…':''}` : ''}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:7, alignItems:'center' }}>
            <Badge type={SCOL[c.estado]||'badge-gray'}>{c.estado}</Badge>
            {!c.validado && <Badge type="badge-amber">Sin validar</Badge>}
            {c.validado  && <Badge type="badge-green">✓ Validado</Badge>}
            {ov && <Badge type="badge-red">Vencido: {fd(c.proximo_contacto)}</Badge>}
            {tod && !ov && <Badge type="badge-amber">Hoy: {fd(c.proximo_contacto)}</Badge>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MetricCard ────────────────────────────────────────────────
function MetricCard({ val, label, color }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e0d8', borderRadius:14, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,.08)' }}>
      <div style={{ fontSize:26, fontWeight:600, fontFamily:'monospace', letterSpacing:-1, color:color||'#1a1915' }}>{val}</div>
      <div style={{ fontSize:12, color:'#6b6860', marginTop:3 }}>{label}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL CRM
// ══════════════════════════════════════════════════════════════
export default function CRM({ userRole }) {
  const [page, setPage]               = useState('dashboard');
  const [clientes, setClientes]       = useState([]);
  const [contactos, setContactos]     = useState([]);
  const [loading, setLoading]         = useState(true);

  // Modales
  const [modalContacto, setModalContacto] = useState(false);
  const [modalCliente,  setModalCliente]  = useState(false);
  const [modalDetalle,  setModalDetalle]  = useState(null); // contacto seleccionado

  // Filtros contactos
  const [filtroEstado,   setFiltroEstado]   = useState('');
  const [filtroTipo,     setFiltroTipo]     = useState('');
  const [filtroCliente,  setFiltroCliente]  = useState('');

  // Reporte semanal
  const [weekOffset, setWeekOffset] = useState(0);

  // Form contacto
  const [fc, setFc] = useState({ cliente_id:'', tipo:'Llamada', estado:'Prospecto', fecha:'', resultado:'', proximo_contacto:'', evidencia:'' });
  // Form cliente
  const [fcl, setFcl] = useState({ nombre:'', contacto:'', telefono:'', email:'', notas:'' });

  const canEdit = ['admin','ventas'].includes(userRole);

  // ── Carga de datos ─────────────────────────────────────────
  useEffect(() => {
    loadAll();
    // Realtime clientes
    const ch1 = supabase.channel('crm-clientes')
      .on('postgres_changes', { event:'*', schema:'public', table:'clientes' }, loadAll)
      .subscribe();
    const ch2 = supabase.channel('crm-contactos')
      .on('postgres_changes', { event:'*', schema:'public', table:'contactos_crm' }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: cls }, { data: cts }] = await Promise.all([
      supabase.from('clientes').select('*').eq('activo', true).order('nombre'),
      supabase.from('contactos_crm').select('*').order('fecha', { ascending: false }),
    ]);
    setClientes(cls || []);
    setContactos(cts || []);
    setLoading(false);
  }

  // ── Guardar contacto ───────────────────────────────────────
  async function saveContacto() {
    if (!fc.cliente_id || !fc.fecha) { alert('Seleccioná cliente y fecha.'); return; }
    const { error } = await supabase.from('contactos_crm').insert({
      cliente_id: fc.cliente_id, tipo: fc.tipo, estado: fc.estado,
      fecha: fc.fecha, resultado: fc.resultado,
      proximo_contacto: fc.proximo_contacto || null,
      evidencia: fc.evidencia,
      validado: false,
    });
    if (error) { alert('Error: ' + error.message); return; }
    setModalContacto(false);
    setFc({ cliente_id:'', tipo:'Llamada', estado:'Prospecto', fecha:'', resultado:'', proximo_contacto:'', evidencia:'' });
  }

  // ── Guardar cliente ────────────────────────────────────────
  async function saveCliente() {
    if (!fcl.nombre.trim()) { alert('Ingresá el nombre.'); return; }
    const { error } = await supabase.from('clientes').insert({
      nombre: fcl.nombre.trim(), contacto: fcl.contacto,
      telefono: fcl.telefono, email: fcl.email, notas: fcl.notas,
    });
    if (error) { alert('Error: ' + error.message); return; }
    setModalCliente(false);
    setFcl({ nombre:'', contacto:'', telefono:'', email:'', notas:'' });
  }

  // ── Validar contacto ───────────────────────────────────────
  async function validarContacto(id) {
    await supabase.from('contactos_crm').update({ validado: true }).eq('id', id);
    setModalDetalle(prev => prev ? { ...prev, validado: true } : null);
  }

  // ── Filtros ────────────────────────────────────────────────
  const contactosFiltrados = contactos
    .filter(c => !filtroEstado  || c.estado     === filtroEstado)
    .filter(c => !filtroTipo    || c.tipo        === filtroTipo)
    .filter(c => !filtroCliente || c.cliente_id  === filtroCliente);

  // ── Stats ──────────────────────────────────────────────────
  const total   = contactos.length;
  const val     = contactos.filter(c=>c.validado).length;
  const pend    = contactos.filter(c=>!c.validado).length;
  const ov      = contactos.filter(c=>isPast(c.proximo_contacto)&&!c.validado).length;
  const ganados = contactos.filter(c=>c.estado==='Ganado').length;
  const perdidos= contactos.filter(c=>c.estado==='Perdido').length;
  const tasa    = total>0 ? Math.round((ganados/total)*100) : 0;
  const urgentes= contactos.filter(c=>c.proximo_contacto&&(isToday(c.proximo_contacto)||isPast(c.proximo_contacto))).sort((a,b)=>a.proximo_contacto.localeCompare(b.proximo_contacto));
  const proximos= contactos.filter(c=>c.proximo_contacto&&!isToday(c.proximo_contacto)&&!isPast(c.proximo_contacto)).sort((a,b)=>a.proximo_contacto.localeCompare(b.proximo_contacto)).slice(0,4);

  const NAV = [
    { id:'dashboard', icon:'◈', label:'Resumen' },
    { id:'contactos', icon:'◎', label:'Contactos', badge: pend||null },
    { id:'clientes',  icon:'◇', label:'Clientes' },
    { id:'reporte',   icon:'◻', label:'Reporte semanal' },
    { id:'cierre',    icon:'◈', label:'Tasa de cierre' },
    { id:'alertas',   icon:'◉', label:'Alertas', badge: ov||null },
  ];

  // ── Render secciones ───────────────────────────────────────
  function renderDashboard() {
    return (
      <div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12, marginBottom:22 }}>
          <MetricCard val={total}   label="Total contactos" />
          <MetricCard val={val}     label="Validados"       color="#1a5c3a" />
          <MetricCard val={pend}    label="Sin validar"     color="#7a4f1a" />
          <MetricCard val={ov}      label="Vencidos"        color="#7a1a1a" />
          <MetricCard val={`${tasa}%`} label="Tasa de cierre" color="#1a5c3a" />
        </div>
        {urgentes.length > 0 && <>
          <div style={secTitle}>Hoy / Vencidos</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {urgentes.map(c=><ContactCard key={c.id} c={c} clients={clientes} onClick={setModalDetalle}/>)}
          </div>
        </>}
        {proximos.length > 0 && <>
          <div style={{ ...secTitle, marginTop:18 }}>Próximos</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {proximos.map(c=><ContactCard key={c.id} c={c} clients={clientes} onClick={setModalDetalle}/>)}
          </div>
        </>}
        {total === 0 && (
          <div style={{ textAlign:'center', padding:'44px 20px', color:'#6b6860' }}>
            <div style={{ fontSize:32, marginBottom:10, opacity:.35 }}>◎</div>
            <div style={{ fontSize:15, fontWeight:500, color:'#1a1915', marginBottom:5 }}>¡Comenzá agregando tu primer cliente!</div>
            <div style={{ fontSize:13 }}>Luego registrá contactos y el sistema hará el seguimiento.</div>
          </div>
        )}
      </div>
    );
  }

  function renderContactos() {
    return (
      <div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:14 }}>
          <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)} style={{...sel, width:'auto', minWidth:150, fontSize:12, padding:'7px 10px'}}>
            <option value="">Todos los estados</option>
            {ESTADOS_CONTACTO.map(e=><option key={e}>{e}</option>)}
          </select>
          <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} style={{...sel, width:'auto', minWidth:130, fontSize:12, padding:'7px 10px'}}>
            <option value="">Todos los tipos</option>
            {TIPOS_CONTACTO.map(t=><option key={t}>{t}</option>)}
          </select>
          <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)} style={{...sel, width:'auto', minWidth:160, fontSize:12, padding:'7px 10px'}}>
            <option value="">Todos los clientes</option>
            {clientes.map(cl=><option key={cl.id} value={cl.id}>{cl.nombre}</option>)}
          </select>
          <span style={{ marginLeft:'auto', fontSize:12, color:'#a09e99' }}>{contactosFiltrados.length} registro(s)</span>
        </div>
        {contactosFiltrados.length > 0
          ? <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {contactosFiltrados.map(c=><ContactCard key={c.id} c={c} clients={clientes} onClick={setModalDetalle}/>)}
            </div>
          : <div style={{ textAlign:'center', padding:'44px 20px', color:'#6b6860' }}>
              <div style={{ fontSize:32, marginBottom:10, opacity:.35 }}>◎</div>
              <div style={{ fontSize:15, fontWeight:500 }}>Sin resultados</div>
            </div>
        }
      </div>
    );
  }

  function renderClientes() {
    if (!clientes.length) return (
      <div style={{ textAlign:'center', padding:'44px 20px', color:'#6b6860' }}>
        <div style={{ fontSize:32, marginBottom:10, opacity:.35 }}>◇</div>
        <div style={{ fontSize:15, fontWeight:500, color:'#1a1915', marginBottom:5 }}>Sin clientes aún</div>
        <div style={{ fontSize:13 }}>Agregá tu primer cliente con el botón de arriba.</div>
      </div>
    );
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {clientes.map((cl, i) => {
          const cc  = contactos.filter(c=>c.cliente_id===cl.id);
          const lc  = [...cc].sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''))[0];
          const ls  = lc ? lc.estado : 'Sin contacto';
          const idx = (i+4) % AVG.length;
          return (
            <div key={cl.id} style={{ background:'#fff', border:'1px solid #e2e0d8', borderRadius:14, padding:'15px 17px', boxShadow:'0 1px 3px rgba(0,0,0,.08)' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:'50%', background:AVG[idx], color:AVT[idx], display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, flexShrink:0 }}>{ini(cl.nombre)}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600 }}>{cl.nombre}</div>
                  <div style={{ fontSize:12, color:'#6b6860', marginTop:3 }}>{cl.contacto||''}{cl.telefono?' · '+cl.telefono:''}</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:7, alignItems:'center' }}>
                    <Badge type={SCOL[ls]||'badge-gray'}>{ls}</Badge>
                    <Badge type="badge-gray">{cc.length} contacto(s)</Badge>
                    {cl.notas && <span style={{ fontSize:11, color:'#a09e99' }}>{cl.notas}</span>}
                  </div>
                </div>
                <Btn size="xs" variant="secondary" onClick={()=>{ setFiltroCliente(cl.id); setPage('contactos'); }}>Ver contactos</Btn>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderReporte() {
    const days = getWeekDays(weekOffset);
    const fmtWR = d => { const [,m,dy]=d.split('-'); return `${dy}/${m}`; };
    const weekLabel = `${fmtWR(days[0])} — ${fmtWR(days[6])}`;
    const weekContacts = contactos.filter(c => days.includes(c.fecha));
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
          <Btn size="sm" variant="secondary" onClick={()=>setWeekOffset(w=>w-1)}>← Anterior</Btn>
          <div style={{ fontSize:14, fontWeight:600, flex:1, textAlign:'center', fontFamily:'monospace' }}>{weekLabel}</div>
          <Btn size="sm" variant="secondary" onClick={()=>setWeekOffset(w=>w+1)}>Siguiente →</Btn>
        </div>
        {weekContacts.length > 0
          ? <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {days.map(d => {
                const dc = weekContacts.filter(c=>c.fecha===d);
                if (!dc.length) return null;
                return (
                  <div key={d}>
                    <div style={{ fontSize:11, fontWeight:600, color:'#6b6860', textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>{fmtWR(d)} — {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][new Date(d+'T12:00').getDay()]}</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {dc.map(c=><ContactCard key={c.id} c={c} clients={clientes} onClick={setModalDetalle}/>)}
                    </div>
                  </div>
                );
              })}
            </div>
          : <div style={{ textAlign:'center', padding:'44px 20px', color:'#6b6860' }}>
              <div style={{ fontSize:28, marginBottom:10, opacity:.35 }}>◻</div>
              <div style={{ fontSize:15, fontWeight:500 }}>Sin contactos esta semana</div>
            </div>
        }
      </div>
    );
  }

  function renderCierre() {
    const tipos = TIPOS_CONTACTO;
    const tipoCounts = tipos.map(t=>contactos.filter(c=>c.tipo===t).length);
    const maxT = Math.max(...tipoCounts, 1);
    const stages = [
      ['Prospecto','#ddedf8','#1a4a7a'],['En negociación','#fdf5e8','#7a4f1a'],
      ['Propuesta enviada','#f0e8f8','#4a1a7a'],['Ganado','#dff0e8','#1a5c3a'],
    ];
    const stageCounts = stages.map(([s])=>contactos.filter(c=>c.estado===s).length);
    const maxS = Math.max(...stageCounts, 1);
    return (
      <div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:12, marginBottom:22 }}>
          <MetricCard val={total}        label="Total" />
          <MetricCard val={ganados}      label="Ganados"  color="#1a5c3a" />
          <MetricCard val={perdidos}     label="Perdidos" color="#7a1a1a" />
          <MetricCard val={`${tasa}%`}   label="Tasa de cierre" color="#1a5c3a" />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
          <div>
            <div style={secTitle}>Embudo de ventas</div>
            <div style={{ background:'#fff', border:'1px solid #e2e0d8', borderRadius:14, padding:'18px 20px' }}>
              {stages.map(([s,bg,tc],i)=>(
                <div key={s} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
                  <div style={{ width:155, fontSize:12, color:'#6b6860', textAlign:'right', flexShrink:0 }}>{s}</div>
                  <div style={{ flex:1, background:'#f0efe9', borderRadius:6, height:30, overflow:'hidden' }}>
                    <div style={{ width:`${stageCounts[i]?Math.max(8,Math.round((stageCounts[i]/maxS)*100)):0}%`, height:'100%', background:bg, borderRadius:6, display:'flex', alignItems:'center', padding:'0 11px' }}>
                      <span style={{ fontSize:12, color:tc, fontWeight:600 }}>{stageCounts[i]||''}</span>
                    </div>
                  </div>
                  <div style={{ width:28, fontSize:13, fontWeight:600, fontFamily:'monospace', color:'#6b6860' }}>{stageCounts[i]}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={secTitle}>Por tipo de contacto</div>
            <div style={{ background:'#fff', border:'1px solid #e2e0d8', borderRadius:14, padding:'18px 20px' }}>
              {tipos.map((t,i)=>(
                <div key={t} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:9 }}>
                  <div style={{ width:68, fontSize:12, color:'#6b6860', textAlign:'right', flexShrink:0 }}>{t}</div>
                  <div style={{ flex:1, background:'#f0efe9', borderRadius:6, height:25, overflow:'hidden' }}>
                    <div style={{ width:`${tipoCounts[i]?Math.max(8,Math.round((tipoCounts[i]/maxT)*100)):0}%`, height:'100%', background:TCOL[t]||'#888', borderRadius:6, display:'flex', alignItems:'center', padding:'0 8px' }}>
                      {tipoCounts[i]?<span style={{ fontSize:11, color:'#fff', fontWeight:600 }}>{tipoCounts[i]}</span>:null}
                    </div>
                  </div>
                  <div style={{ width:18, fontSize:12, fontFamily:'monospace', color:'#6b6860' }}>{tipoCounts[i]||''}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderAlertas() {
    const ovList  = contactos.filter(c=>!c.validado&&isPast(c.proximo_contacto));
    const todList = contactos.filter(c=>!c.validado&&isToday(c.proximo_contacto));
    if (!ovList.length && !todList.length) return (
      <div style={{ textAlign:'center', padding:'44px 20px', color:'#6b6860' }}>
        <div style={{ fontSize:32, marginBottom:10, opacity:.35 }}>◉</div>
        <div style={{ fontSize:15, fontWeight:500, color:'#1a1915', marginBottom:5 }}>Todo al día</div>
        <div style={{ fontSize:13 }}>No hay contactos vencidos ni para hoy.</div>
      </div>
    );
    return (
      <div>
        {ovList.length > 0 && <>
          <div style={{ ...secTitle, color:'#7a1a1a', marginBottom:8 }}>Vencidos ({ovList.length})</div>
          {ovList.map(x=>{
            const cl=clientes.find(c=>c.id===x.cliente_id)||{nombre:'—'};
            return <div key={x.id} style={{ display:'flex', alignItems:'center', gap:13, padding:'13px 15px', borderRadius:10, marginBottom:7, background:'#f8e8e8', border:'1px solid #e8b8b8' }}>
              <div style={{ flex:1 }}><strong>{cl.nombre}</strong> — {x.tipo} del {fd(x.fecha)}<br/><span style={{ fontSize:12, color:'#7a1a1a' }}>Era: {fd(x.proximo_contacto)}</span></div>
              <Btn size="xs" variant="secondary" onClick={()=>setModalDetalle(x)}>Ver</Btn>
            </div>;
          })}
        </>}
        {todList.length > 0 && <>
          <div style={{ ...secTitle, color:'#7a4f1a', marginTop:14, marginBottom:8 }}>Para hoy ({todList.length})</div>
          {todList.map(x=>{
            const cl=clientes.find(c=>c.id===x.cliente_id)||{nombre:'—'};
            return <div key={x.id} style={{ display:'flex', alignItems:'center', gap:13, padding:'13px 15px', borderRadius:10, marginBottom:7, background:'#fdf5e8', border:'1px solid #e8d0a0' }}>
              <div style={{ flex:1 }}><strong>{cl.nombre}</strong> — {x.tipo}</div>
              <Btn size="xs" variant="secondary" onClick={()=>setModalDetalle(x)}>Ver</Btn>
            </div>;
          })}
        </>}
      </div>
    );
  }

  const secTitle = { fontSize:12, fontWeight:600, color:'#6b6860', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 };

  if (loading) return <div style={{ padding:'2rem', color:'#888', textAlign:'center' }}>Cargando CRM…</div>;

  return (
    <div style={{ display:'flex', minHeight:'calc(100vh - 105px)', background:'#f5f4f0' }}>
      {/* Sidebar CRM */}
      <nav style={{ width:210, background:'#1a1915', color:'#fff', display:'flex', flexDirection:'column', flexShrink:0, borderRadius:14, overflow:'hidden', margin:'0 0 0 0' }}>
        <div style={{ padding:'20px 20px 14px', borderBottom:'1px solid rgba(255,255,255,.1)' }}>
          <div style={{ fontSize:15, fontWeight:600 }}>◈ CRM Ventas</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', marginTop:2, fontFamily:'monospace' }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:'#5dc98a', display:'inline-block', marginRight:5 }}/>EN TIEMPO REAL
          </div>
        </div>
        <div style={{ flex:1, padding:'10px 0', overflowY:'auto' }}>
          {NAV.map(n=>(
            <div key={n.id} onClick={()=>setPage(n.id)} style={{
              display:'flex', alignItems:'center', gap:10, padding:'10px 20px',
              cursor:'pointer', color: page===n.id?'#fff':'rgba(255,255,255,.6)',
              background: page===n.id?'rgba(255,255,255,.1)':'transparent',
              borderLeft: `3px solid ${page===n.id?'#5dc98a':'transparent'}`,
              fontSize:13, transition:'all .15s', fontWeight: page===n.id?500:400,
            }}>
              <span style={{ fontSize:14, width:18, textAlign:'center' }}>{n.icon}</span>
              {n.label}
              {n.badge ? <span style={{ marginLeft:'auto', background:'#c94f1e', color:'#fff', fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:100 }}>{n.badge}</span> : null}
            </div>
          ))}
        </div>
        <div style={{ padding:'12px 20px', borderTop:'1px solid rgba(255,255,255,.1)', fontSize:11, color:'rgba(255,255,255,.3)' }}>
          matilda-hub · Supabase
        </div>
      </nav>

      {/* Main CRM */}
      <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
        {/* Topbar CRM */}
        <div style={{ background:'#fff', borderBottom:'1px solid #e2e0d8', padding:'0 24px', height:56, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:17, fontWeight:600, letterSpacing:'-.3px' }}>
            {NAV.find(n=>n.id===page)?.label || 'CRM'}
          </div>
          {canEdit && (
            <div style={{ display:'flex', gap:8 }}>
              <Btn size="sm" onClick={()=>setModalContacto(true)}>+ Contacto</Btn>
              <Btn size="sm" variant="secondary" onClick={()=>setModalCliente(true)}>+ Cliente</Btn>
            </div>
          )}
        </div>

        {/* Contenido */}
        <div style={{ padding:24, flex:1, overflowY:'auto' }}>
          {page==='dashboard' && renderDashboard()}
          {page==='contactos' && renderContactos()}
          {page==='clientes'  && renderClientes()}
          {page==='reporte'   && renderReporte()}
          {page==='cierre'    && renderCierre()}
          {page==='alertas'   && renderAlertas()}
        </div>
      </div>

      {/* ── Modal nuevo contacto ────────────────────────────── */}
      <Modal open={modalContacto} onClose={()=>setModalContacto(false)} title="Registrar contacto"
        footer={<><Btn variant="secondary" onClick={()=>setModalContacto(false)}>Cancelar</Btn><Btn onClick={saveContacto}>Guardar</Btn></>}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:13 }}>
          <FG label="Cliente *" span2>
            <select value={fc.cliente_id} onChange={e=>setFc(p=>({...p,cliente_id:e.target.value}))} style={sel}>
              <option value="">Seleccioná...</option>
              {clientes.map(cl=><option key={cl.id} value={cl.id}>{cl.nombre}</option>)}
            </select>
          </FG>
          <FG label="Tipo *">
            <select value={fc.tipo} onChange={e=>setFc(p=>({...p,tipo:e.target.value}))} style={sel}>
              {TIPOS_CONTACTO.map(t=><option key={t}>{t}</option>)}
            </select>
          </FG>
          <FG label="Estado *">
            <select value={fc.estado} onChange={e=>setFc(p=>({...p,estado:e.target.value}))} style={sel}>
              {ESTADOS_CONTACTO.map(e=><option key={e}>{e}</option>)}
            </select>
          </FG>
          <FG label="Fecha *">
            <input type="date" value={fc.fecha} onChange={e=>setFc(p=>({...p,fecha:e.target.value}))} style={inp}/>
          </FG>
          <FG label="Próximo contacto">
            <input type="date" value={fc.proximo_contacto} onChange={e=>setFc(p=>({...p,proximo_contacto:e.target.value}))} style={inp}/>
          </FG>
          <FG label="Resultado / notas" span2>
            <textarea value={fc.resultado} onChange={e=>setFc(p=>({...p,resultado:e.target.value}))} style={{...inp,minHeight:70,resize:'vertical'}}/>
          </FG>
          <FG label="Evidencia (URL o descripción)" span2>
            <input type="text" value={fc.evidencia} onChange={e=>setFc(p=>({...p,evidencia:e.target.value}))} style={inp} placeholder="https://... o descripción"/>
          </FG>
        </div>
      </Modal>

      {/* ── Modal nuevo cliente ─────────────────────────────── */}
      <Modal open={modalCliente} onClose={()=>setModalCliente(false)} title="Nuevo cliente"
        footer={<><Btn variant="secondary" onClick={()=>setModalCliente(false)}>Cancelar</Btn><Btn onClick={saveCliente}>Guardar</Btn></>}>
        <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
          <FG label="Empresa *"><input value={fcl.nombre} onChange={e=>setFcl(p=>({...p,nombre:e.target.value}))} style={inp} placeholder="Nombre de la empresa"/></FG>
          <FG label="Contacto principal"><input value={fcl.contacto} onChange={e=>setFcl(p=>({...p,contacto:e.target.value}))} style={inp} placeholder="Nombre de la persona"/></FG>
          <FG label="Teléfono"><input value={fcl.telefono} onChange={e=>setFcl(p=>({...p,telefono:e.target.value}))} style={inp} placeholder="+593..."/></FG>
          <FG label="Email"><input type="email" value={fcl.email} onChange={e=>setFcl(p=>({...p,email:e.target.value}))} style={inp} placeholder="correo@empresa.com"/></FG>
          <FG label="Notas"><textarea value={fcl.notas} onChange={e=>setFcl(p=>({...p,notas:e.target.value}))} style={{...inp,minHeight:60,resize:'vertical'}} placeholder="Observaciones internas"/></FG>
        </div>
      </Modal>

      {/* ── Modal detalle contacto ──────────────────────────── */}
      {modalDetalle && (() => {
        const c  = modalDetalle;
        const cl = clientes.find(x=>x.id===c.cliente_id)||{nombre:'—'};
        return (
          <Modal open={!!modalDetalle} onClose={()=>setModalDetalle(null)} title={cl.nombre}
            footer={
              <>
                {canEdit && !c.validado && <Btn onClick={()=>validarContacto(c.id)}>✓ Marcar como realizado</Btn>}
                <Btn variant="secondary" onClick={()=>setModalDetalle(null)}>Cerrar</Btn>
              </>
            }>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
              <Badge type={SCOL[c.estado]||'badge-gray'}>{c.estado}</Badge>
              <Badge type="badge-gray">{c.tipo}</Badge>
              {c.validado ? <Badge type="badge-green">✓ Realizado</Badge> : <Badge type="badge-amber">Pendiente</Badge>}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:13, marginBottom:14 }}>
              <div><div style={{ fontSize:12, fontWeight:500, color:'#6b6860', marginBottom:4 }}>Fecha</div><div style={{ fontSize:13, fontWeight:500 }}>{fd(c.fecha)}</div></div>
              <div><div style={{ fontSize:12, fontWeight:500, color:'#6b6860', marginBottom:4 }}>Próximo contacto</div><div style={{ fontSize:13, fontWeight:500 }}>{fd(c.proximo_contacto)}</div></div>
            </div>
            <div style={{ height:1, background:'#e2e0d8', margin:'14px 0' }}/>
            <div style={{ fontSize:12, fontWeight:500, color:'#6b6860', marginBottom:5 }}>Resultado / notas</div>
            <div style={{ fontSize:13, lineHeight:1.6 }}>{c.resultado||<span style={{color:'#a09e99'}}>Sin notas</span>}</div>
            {c.evidencia && <>
              <div style={{ height:1, background:'#e2e0d8', margin:'14px 0' }}/>
              <div style={{ fontSize:12, fontWeight:500, color:'#6b6860', marginBottom:8 }}>Evidencia</div>
              {c.evidencia.startsWith('http')
                ? <a href={c.evidencia} target="_blank" rel="noreferrer" style={{ fontSize:13, color:'#1a4a7a' }}>{c.evidencia}</a>
                : <div style={{ background:'#f0efe9', border:'1px solid #e2e0d8', borderRadius:10, padding:'11px 13px', fontSize:13, color:'#6b6860' }}>{c.evidencia}</div>
              }
            </>}
          </Modal>
        );
      })()}
    </div>
  );
}
