import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { calcPpto, fmt } from '../calc';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function pct(n, total) {
  if (!total) return '0.0%';
  return (n / total * 100).toFixed(1) + '%';
}

function Bar({ value, max, color='#0d3b5e', height=24 }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div style={{ background:'#f0f4f8', borderRadius:6, height, overflow:'hidden', flex:1 }}>
      <div style={{ width:`${w}%`, height:'100%', background:color, borderRadius:6, transition:'width .3s', display:'flex', alignItems:'center', paddingLeft:8 }}>
        {w > 20 && <span style={{ fontSize:11, color:'#fff', fontWeight:600, whiteSpace:'nowrap' }}>{fmt(value)}</span>}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color='#0d3b5e', bg='#fff' }) {
  return (
    <div style={{ background:bg, border:'1px solid #e8e8e8', borderRadius:12, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
      <div style={{ fontSize:11, color:'#888', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, color, fontFamily:'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:'#aaa', marginTop:4 }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [pptos, setPptos]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [anio, setAnio]       = useState(new Date().getFullYear());
  const [vista, setVista]     = useState('resumen'); // resumen | clientes | proyectos | mensual
  const [clienteFiltro, setClienteFiltro] = useState('');

  useEffect(() => { loadAll(); }, [anio]);

  async function loadAll() {
    setLoading(true);
    const { data } = await supabase
      .from('presupuestos')
      .select('*')
      .order('fecha_evento', { ascending: true });
    setPptos(data || []);
    setLoading(false);
  }

  // Filtrar por año
  const pptosAnio = pptos.filter(p => p.fecha_evento?.startsWith(String(anio)));

  // Con cálculos - agregar margen sin fee y margen incl fee
  const withCalc = pptosAnio.map(p => {
    const t = calcPpto(p);
    const margenSinFee     = t.subtotalPrecio - t.subtotalCosto;
    const margenSinFeePct  = t.subtotalPrecio > 0 ? margenSinFee / t.subtotalPrecio * 100 : 0;
    const margenRealSinFee = t.subtotalPrecio - t.subtotalCostoReal;
    const margenRealSinFeePct = t.subtotalPrecio > 0 ? margenRealSinFee / t.subtotalPrecio * 100 : 0;
    const margenInclFee    = t.totalSinIva - t.subtotalCosto - (p.apply_rebate ? t.rebate : 0);
    const margenInclFeePct = t.totalSinIva > 0 ? margenInclFee / t.totalSinIva * 100 : 0;
    return { ...p, _t: { ...t, margenSinFee, margenSinFeePct, margenRealSinFee, margenRealSinFeePct, margenInclFee, margenInclFeePct } };
  });

  // Por estado
  const facturados      = withCalc.filter(p => p.estado === 'facturado');
  const ejecutados      = withCalc.filter(p => p.ejecutado);
  const pendFacturar    = withCalc.filter(p => p.estado === 'pendiente_facturar');
  const aprobados       = withCalc.filter(p => p.estado === 'aprobado');

  // Totales globales
  const totalFacturado  = facturados.reduce((a,p)=>a+p._t.totalSinIva,0);
  const costoFacturado  = facturados.reduce((a,p)=>a+p._t.subtotalCosto,0);
  const margenFacturado = facturados.reduce((a,p)=>a+p._t.margenSinFee,0);
  const totalEjecutado  = ejecutados.reduce((a,p)=>a+p._t.totalSinIva,0);
  const costoRealEjec   = ejecutados.reduce((a,p)=>a+p._t.subtotalCostoReal,0);
  const margenRealEjec  = ejecutados.reduce((a,p)=>a+p._t.margenRealSinFee,0);
  const totalPipeline   = withCalc.filter(p=>!['cancelado','facturado'].includes(p.estado)).reduce((a,p)=>a+p._t.totalSinIva,0);

  // Por cliente
  const porCliente = {};
  withCalc.forEach(p => {
    const cl = p.cliente || 'Sin cliente';
    if (!porCliente[cl]) porCliente[cl] = { nombre:cl, pptos:[], totalPrecio:0, totalCosto:0, totalCostoReal:0, margen:0, margenReal:0, margenInclFee:0, facturado:0, ejecutado:0 };
    const g = porCliente[cl];
    g.pptos.push(p);
    g.totalPrecio   += p._t.totalSinIva;
    g.totalCosto    += p._t.subtotalCosto;
    g.totalCostoReal+= p._t.subtotalCostoReal;
    g.margen        += p._t.margenSinFee;
    g.margenReal    += p._t.margenRealSinFee;
    g.margenInclFee += p._t.margenInclFee;
    if (p.estado === 'facturado')  g.facturado += p._t.totalSinIva;
    if (p.ejecutado)               g.ejecutado += p._t.totalSinIva;
  });
  const clientesList = Object.values(porCliente).sort((a,b)=>b.totalPrecio-a.totalPrecio);
  const maxCliente   = Math.max(...clientesList.map(c=>c.totalPrecio), 1);

  // Por mes
  const porMes = Array.from({length:12},(_,i)=>({
    mes:i, label:MESES[i],
    precio:0, costo:0, costoReal:0, margen:0, count:0, facturado:0,
  }));
  withCalc.forEach(p => {
    if (!p.fecha_evento) return;
    const m = parseInt(p.fecha_evento.split('-')[1])-1;
    if (m < 0 || m > 11) return;
    porMes[m].precio   += p._t.totalSinIva;
    porMes[m].costo    += p._t.subtotalCosto;
    porMes[m].costoReal+= p._t.subtotalCostoReal;
    porMes[m].margen   += p._t.margenSinFee;
    porMes[m].count    ++;
    if (p.estado==='facturado') porMes[m].facturado += p._t.totalSinIva;
  });
  const maxMes = Math.max(...porMes.map(m=>m.precio), 1);

  // Clientes únicos para filtro
  const clientesUnicos = [...new Set(pptosAnio.map(p=>p.cliente).filter(Boolean))].sort();

  const pptosTabla = withCalc
    .filter(p => !clienteFiltro || p.cliente === clienteFiltro)
    .sort((a,b)=>(b.fecha_evento||'').localeCompare(a.fecha_evento||''));

  if (loading) return <div style={{ padding:'2rem', textAlign:'center', color:'#888' }}>Cargando dashboard…</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <h2 style={{ fontSize:18, fontWeight:700, color:'#0d3b5e', flex:1 }}>📊 Dashboard {anio}</h2>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <button onClick={()=>setAnio(a=>a-1)} style={{ width:32, height:32, borderRadius:8, border:'1px solid #ddd', background:'#fff', cursor:'pointer', fontSize:16 }}>‹</button>
          <span style={{ fontSize:15, fontWeight:600, minWidth:50, textAlign:'center' }}>{anio}</span>
          <button onClick={()=>setAnio(a=>a+1)} style={{ width:32, height:32, borderRadius:8, border:'1px solid #ddd', background:'#fff', cursor:'pointer', fontSize:16 }}>›</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'2px solid #eee' }}>
        {[['resumen','📈 Resumen'],['clientes','🏢 Por cliente'],['proyectos','📋 Por proyecto'],['mensual','📅 Por mes']].map(([k,l])=>(
          <button key={k} onClick={()=>setVista(k)} style={{
            padding:'8px 16px', border:'none',
            borderBottom: vista===k?'2px solid #0d3b5e':'2px solid transparent',
            background:'none', cursor:'pointer', fontSize:13,
            fontWeight: vista===k?700:400,
            color: vista===k?'#0d3b5e':'#666',
            marginBottom:-2, fontFamily:'inherit',
          }}>{l}</button>
        ))}
      </div>

      {/* ── RESUMEN ── */}
      {vista==='resumen' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:20 }}>
            <MetricCard label="Facturado" value={fmt(totalFacturado)} sub={`${facturados.length} presupuesto(s)`} color="#2e8b4e" bg="#e8f5ee"/>
            <MetricCard label="Costo facturado" value={fmt(costoFacturado)} color="#0d3b5e"/>
            <MetricCard label="Margen facturado" value={fmt(margenFacturado)} sub={pct(margenFacturado,totalFacturado)} color="#2e8b4e"/>
            <MetricCard label="Ejecutado s/IVA" value={fmt(totalEjecutado)} sub={`${ejecutados.length} evento(s)`} color="#0d3b5e"/>
            <MetricCard label="Costo real" value={fmt(costoRealEjec)} color="#7c3aed"/>
            <MetricCard label="Margen real" value={fmt(margenRealEjec)} sub={pct(margenRealEjec,totalEjecutado)} color={margenRealEjec>=0?'#2e8b4e':'#dc2626'}/>
            <MetricCard label="Pipeline activo" value={fmt(totalPipeline)} sub={`${withCalc.filter(p=>!['cancelado','facturado'].includes(p.estado)).length} ppto(s)`} color="#d97706"/>
            <MetricCard label="Pte. facturar" value={fmt(pendFacturar.reduce((a,p)=>a+p._t.totalSinIva,0))} sub={`${pendFacturar.length} ppto(s)`} color="#c8264a"/>
          </div>

          {/* Ejecutado vs Facturado */}
          <div style={{ background:'#fff', border:'1px solid #e8e8e8', borderRadius:12, padding:'18px 20px', marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#0d3b5e', marginBottom:14 }}>Ejecutado vs Facturado</div>
            <div style={{ display:'flex', gap:20, alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:12, color:'#888', width:100 }}>Ejecutado</span>
              <Bar value={totalEjecutado} max={Math.max(totalEjecutado,totalFacturado)} color="#0d3b5e"/>
              <span style={{ fontSize:12, fontWeight:600, color:'#0d3b5e', width:100, textAlign:'right' }}>{fmt(totalEjecutado)}</span>
            </div>
            <div style={{ display:'flex', gap:20, alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:12, color:'#888', width:100 }}>Facturado</span>
              <Bar value={totalFacturado} max={Math.max(totalEjecutado,totalFacturado)} color="#2e8b4e"/>
              <span style={{ fontSize:12, fontWeight:600, color:'#2e8b4e', width:100, textAlign:'right' }}>{fmt(totalFacturado)}</span>
            </div>
            <div style={{ display:'flex', gap:20, alignItems:'center' }}>
              <span style={{ fontSize:12, color:'#888', width:100 }}>Pipeline</span>
              <Bar value={totalPipeline} max={Math.max(totalEjecutado,totalFacturado,totalPipeline)} color="#d97706"/>
              <span style={{ fontSize:12, fontWeight:600, color:'#d97706', width:100, textAlign:'right' }}>{fmt(totalPipeline)}</span>
            </div>
          </div>

          {/* Top clientes */}
          <div style={{ background:'#fff', border:'1px solid #e8e8e8', borderRadius:12, padding:'18px 20px' }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#0d3b5e', marginBottom:14 }}>Top clientes {anio}</div>
            {clientesList.slice(0,8).map(c=>(
              <div key={c.nombre} style={{ display:'flex', gap:12, alignItems:'center', marginBottom:10 }}>
                <span style={{ fontSize:12, color:'#555', width:150, flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.nombre}</span>
                <Bar value={c.totalPrecio} max={maxCliente} color="#0d3b5e"/>
                <span style={{ fontSize:12, fontWeight:600, color:'#0d3b5e', width:90, textAlign:'right', flexShrink:0 }}>{fmt(c.totalPrecio)}</span>
                <span style={{ fontSize:11, color: c.margen>=0?'#2e8b4e':'#dc2626', width:60, textAlign:'right', flexShrink:0 }}>{pct(c.margen,c.totalPrecio)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── POR CLIENTE ── */}
      {vista==='clientes' && (
        <div>
          {clientesList.map(c=>(
            <div key={c.nombre} style={{ background:'#fff', border:'1px solid #e8e8e8', borderRadius:12, padding:'16px 20px', marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                <div style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', flex:1 }}>{c.nombre}</div>
                <span style={{ fontSize:11, padding:'2px 9px', borderRadius:999, background:'#eef4fb', color:'#0d3b5e', fontWeight:500 }}>{c.pptos.length} presupuesto(s)</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:10 }}>
                {[
                  ['Total precio', fmt(c.totalPrecio), '#0d3b5e'],
                  ['Costo cotizado', fmt(c.totalCosto), '#555'],
                  ['Margen cotizado (sin fee)', fmt(c.margen)+` (${pct(c.margen,c.totalPrecio)})`, c.margen>=0?'#2e8b4e':'#dc2626'],
                  ['Margen incl. fee', fmt(c.margenInclFee)+` (${pct(c.margenInclFee,c.totalPrecio)})`, c.margenInclFee>=0?'#0d3b5e':'#dc2626'],
                  ['Facturado', fmt(c.facturado), '#2e8b4e'],
                  ['Ejecutado', fmt(c.ejecutado), '#7c3aed'],
                  ['Costo real', fmt(c.totalCostoReal), '#d97706'],
                  ['Margen real (sin fee)', fmt(c.margenReal)+` (${pct(c.margenReal,c.ejecutado)})`, c.margenReal>=0?'#2e8b4e':'#dc2626'],
                ].map(([l,v,col])=>(
                  <div key={l} style={{ background:'#f8fafc', borderRadius:8, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, color:'#888', marginBottom:3 }}>{l}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:col }}>{v}</div>
                  </div>
                ))}
              </div>
              {/* Proyectos del cliente */}
              <details style={{ marginTop:10 }}>
                <summary style={{ fontSize:12, color:'#0d3b5e', cursor:'pointer', fontWeight:500 }}>Ver proyectos ({c.pptos.length})</summary>
                <div style={{ marginTop:8, overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead><tr style={{ background:'#f0f4f8' }}>
                      {['Código','Nombre','Fecha','Estado','Total s/IVA','Costo','Margen','Margen %'].map(h=>(
                        <th key={h} style={{ padding:'6px 10px', textAlign:'left', fontSize:11, color:'#666', fontWeight:700 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {c.pptos.map(p=>(
                        <tr key={p.id} style={{ borderBottom:'1px solid #f0f0f0' }}>
                          <td style={{ padding:'6px 10px', fontFamily:'monospace', fontSize:10, color:'#888' }}>{p.nomenclatura||'—'}</td>
                          <td style={{ padding:'6px 10px', fontWeight:500 }}>{p.nombre||'—'}</td>
                          <td style={{ padding:'6px 10px', color:'#888' }}>{p.fecha_evento||'—'}</td>
                          <td style={{ padding:'6px 10px' }}>
                            <span style={{ fontSize:10, padding:'2px 7px', borderRadius:999, background:'#eef4fb', color:'#0d3b5e' }}>{p.estado}</span>
                          </td>
                          <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:600 }}>{fmt(p._t.totalSinIva)}</td>
                          <td style={{ padding:'6px 10px', textAlign:'right' }}>{fmt(p._t.subtotalCosto)}</td>
                          <td style={{ padding:'6px 10px', textAlign:'right', color:p._t.margenSinFee>=0?'#2e8b4e':'#dc2626', fontWeight:600 }}>{fmt(p._t.margenSinFee)}</td>
                          <td style={{ padding:'6px 10px', textAlign:'right', color:p._t.margenSinFeePct>=20?'#2e8b4e':'#dc2626' }}>{p._t.margenSinFeePct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          ))}
          {clientesList.length === 0 && <div style={{ textAlign:'center', padding:'3rem', color:'#aaa' }}>Sin datos para {anio}</div>}
        </div>
      )}

      {/* ── POR PROYECTO ── */}
      {vista==='proyectos' && (
        <div>
          <div style={{ display:'flex', gap:8, marginBottom:14, alignItems:'center' }}>
            <select value={clienteFiltro} onChange={e=>setClienteFiltro(e.target.value)} style={{ padding:'6px 10px', border:'1px solid #ddd', borderRadius:8, fontSize:13, fontFamily:'inherit' }}>
              <option value="">Todos los clientes</option>
              {clientesUnicos.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ fontSize:12, color:'#888' }}>{pptosTabla.length} presupuesto(s)</span>
          </div>
          <div style={{ background:'#fff', border:'1px solid #e8e8e8', borderRadius:12, overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'#0d3b5e' }}>
                    {['Código','Nombre','Cliente','Fecha','Estado','Ejec.','Total s/IVA','Costo','Margen s/fee','%','Margen incl.fee','Costo real','Margen real s/fee'].map(h=>(
                      <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:11, color:'rgba(255,255,255,.8)', fontWeight:700, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pptosTabla.map((p,i)=>(
                    <tr key={p.id} style={{ background:i%2?'#f8fafc':'#fff', borderBottom:'1px solid #f0f0f0' }}>
                      <td style={{ padding:'8px 12px', fontFamily:'monospace', fontSize:10, color:'#888' }}>{p.nomenclatura||'—'}</td>
                      <td style={{ padding:'8px 12px', fontWeight:500, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nombre||'—'}</td>
                      <td style={{ padding:'8px 12px', color:'#666', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.cliente||'—'}</td>
                      <td style={{ padding:'8px 12px', color:'#888', whiteSpace:'nowrap' }}>{p.fecha_evento||'—'}</td>
                      <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                        <span style={{ fontSize:10, padding:'2px 7px', borderRadius:999, background:'#eef4fb', color:'#0d3b5e' }}>{p.estado}</span>
                      </td>
                      <td style={{ padding:'8px 12px', textAlign:'center' }}>{p.ejecutado?'✅':'—'}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:600 }}>{fmt(p._t.totalSinIva)}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:'#555' }}>{fmt(p._t.subtotalCosto)}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:p._t.margenSinFee>=0?'#2e8b4e':'#dc2626' }}>{fmt(p._t.margenSinFee)}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:p._t.margenSinFeePct>=20?'#2e8b4e':'#dc2626' }}>{p._t.margenSinFeePct.toFixed(1)}%</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:'#7c3aed' }}>{p._t.subtotalCostoReal>0?fmt(p._t.subtotalCostoReal):'—'}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:p._t.margenRealSinFee>=0?'#2e8b4e':'#dc2626' }}>{p._t.subtotalCostoReal>0?fmt(p._t.margenRealSinFee):'—'}</td>
                    </tr>
                  ))}
                  {pptosTabla.length === 0 && (
                    <tr><td colSpan={12} style={{ padding:'2rem', textAlign:'center', color:'#aaa' }}>Sin datos</td></tr>
                  )}
                </tbody>
                {pptosTabla.length > 0 && (
                  <tfoot>
                    <tr style={{ background:'#0d3b5e', fontWeight:700 }}>
                      <td colSpan={6} style={{ padding:'10px 12px', color:'rgba(255,255,255,.8)', fontSize:12 }}>TOTALES ({pptosTabla.length})</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', color:'#fff' }}>{fmt(pptosTabla.reduce((a,p)=>a+p._t.totalSinIva,0))}</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', color:'rgba(255,255,255,.7)' }}>{fmt(pptosTabla.reduce((a,p)=>a+p._t.subtotalCosto,0))}</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', color:'#3dbfb8' }}>{fmt(pptosTabla.reduce((a,p)=>a+p._t.margenSinFee,0))}</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', color:'#3dbfb8' }}>
                        {pct(pptosTabla.reduce((a,p)=>a+p._t.margenSinFee,0), pptosTabla.reduce((a,p)=>a+p._t.subtotalPrecio,0))}
                      </td>
                      <td style={{ padding:'10px 12px', textAlign:'right', color:'#c084fc' }}>{fmt(pptosTabla.reduce((a,p)=>a+p._t.subtotalCostoReal,0))}</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', color:'#3dbfb8' }}>{fmt(pptosTabla.reduce((a,p)=>a+p._t.margenRealSinFee,0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── POR MES ── */}
      {vista==='mensual' && (
        <div>
          <div style={{ background:'#fff', border:'1px solid #e8e8e8', borderRadius:12, padding:'18px 20px', marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#0d3b5e', marginBottom:14 }}>Precio cliente por mes</div>
            {porMes.filter(m=>m.count>0).map(m=>(
              <div key={m.mes} style={{ display:'flex', gap:12, alignItems:'center', marginBottom:10 }}>
                <span style={{ fontSize:12, color:'#555', width:36, flexShrink:0, fontWeight:500 }}>{m.label}</span>
                <Bar value={m.precio} max={maxMes} color="#0d3b5e"/>
                <div style={{ textAlign:'right', flexShrink:0, minWidth:160 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#0d3b5e' }}>{fmt(m.precio)}</div>
                  <div style={{ fontSize:11, color:'#888' }}>Costo: {fmt(m.costo)} · Margen: {pct(m.margen,m.precio)}</div>
                </div>
              </div>
            ))}
            {porMes.every(m=>m.count===0) && <div style={{ textAlign:'center', padding:'2rem', color:'#aaa' }}>Sin datos para {anio}</div>}
          </div>

          {/* Tabla mensual */}
          <div style={{ background:'#fff', border:'1px solid #e8e8e8', borderRadius:12, overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'#0d3b5e' }}>
                    {['Mes','Ppto(s)','Total precio','Costo','Margen','%','Facturado'].map(h=>(
                      <th key={h} style={{ padding:'10px 14px', textAlign: h==='Mes'||h==='Ppto(s)'?'left':'right', fontSize:11, color:'rgba(255,255,255,.8)', fontWeight:700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porMes.map((m,i)=>(
                    <tr key={m.mes} style={{ background:i%2?'#f8fafc':'#fff', borderBottom:'1px solid #f0f0f0', opacity:m.count?1:.4 }}>
                      <td style={{ padding:'8px 14px', fontWeight:m.count?600:400 }}>{MESES_FULL[m.mes]}</td>
                      <td style={{ padding:'8px 14px' }}>{m.count||'—'}</td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontWeight:600 }}>{m.precio?fmt(m.precio):'—'}</td>
                      <td style={{ padding:'8px 14px', textAlign:'right', color:'#555' }}>{m.costo?fmt(m.costo):'—'}</td>
                      <td style={{ padding:'8px 14px', textAlign:'right', color:m.margen>=0?'#2e8b4e':'#dc2626', fontWeight:600 }}>{m.margen?fmt(m.margen):'—'}</td>
                      <td style={{ padding:'8px 14px', textAlign:'right', color:m.precio>0&&m.margen/m.precio*100>=20?'#2e8b4e':'#dc2626' }}>{m.precio?pct(m.margen,m.precio):'—'}</td>
                      <td style={{ padding:'8px 14px', textAlign:'right', color:'#2e8b4e', fontWeight:600 }}>{m.facturado?fmt(m.facturado):'—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background:'#0d3b5e', fontWeight:700 }}>
                    <td style={{ padding:'10px 14px', color:'rgba(255,255,255,.8)', fontSize:12 }}>TOTAL {anio}</td>
                    <td style={{ padding:'10px 14px', color:'rgba(255,255,255,.7)' }}>{withCalc.length}</td>
                    <td style={{ padding:'10px 14px', textAlign:'right', color:'#fff' }}>{fmt(withCalc.reduce((a,p)=>a+p._t.totalSinIva,0))}</td>
                    <td style={{ padding:'10px 14px', textAlign:'right', color:'rgba(255,255,255,.7)' }}>{fmt(withCalc.reduce((a,p)=>a+p._t.subtotalCosto,0))}</td>
                    <td style={{ padding:'10px 14px', textAlign:'right', color:'#3dbfb8' }}>{fmt(withCalc.reduce((a,p)=>a+p._t.margenSinFee,0))}</td>
                    <td style={{ padding:'10px 14px', textAlign:'right', color:'#3dbfb8' }}>{pct(withCalc.reduce((a,p)=>a+p._t.margenSinFee,0),withCalc.reduce((a,p)=>a+p._t.subtotalPrecio,0))}</td>
                    <td style={{ padding:'10px 14px', textAlign:'right', color:'#5dc98a' }}>{fmt(facturados.reduce((a,p)=>a+p._t.totalSinIva,0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
