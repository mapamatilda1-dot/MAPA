import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { calcItem, calcPpto, fmt, fmtPct } from '../calc';
import { generatePdfClienteHTML, generatePdfFinancieroHTML } from './PdfCliente';
import { S, Label } from '../styles.jsx';

function uid() { return crypto.randomUUID(); }

function emptyItemAlcance(cfg) {
  return {
    id: uid(), item:'', detalle:'', cantidad:1, dias:1,
    costo_unit:0, costo_real_unit:null, bco_real_pct:null,
    costo_aprobado:false, oh_pct:Number(cfg?.oh_pct??15),
    bco_pct:Number(cfg?.bco_pct??5.5), precio_unit:0,
    proveedor:'', num_factura_prov:'', info:'',
    categoria:'', subcategoria:'', es_liquidacion:false,
    foto_referencia:null,
  };
}

function emptyAlcance(cfg, num) {
  return {
    id: uid(),
    nombre: `Alcance ${num}`,
    descripcion: '',
    items: [],
    incluir_en_principal: false,
    estado: 'borrador',
    fee_agencia: cfg?.fee_agencia ?? 0,
    oh_pct: cfg?.oh_pct ?? 15,
    bco_pct: cfg?.bco_pct ?? 5.5,
  };
}

function calcAlcance(alcance) {
  let subtotalPrecio = 0, subtotalCosto = 0;
  (alcance.items || []).filter(it => !it._type).forEach(it => {
    const c = calcItem(it);
    subtotalPrecio += c.precio;
    subtotalCosto  += c.totalCosto;
  });
  const fee        = subtotalPrecio * ((alcance.fee_agencia || 0) / 100);
  const totalSinIva = subtotalPrecio + fee;
  const iva        = totalSinIva * 0.15;
  const totalConIva = totalSinIva + iva;
  const margen     = totalSinIva - subtotalCosto;
  const margenPct  = totalSinIva > 0 ? margen / totalSinIva * 100 : 0;
  return { subtotalPrecio, subtotalCosto, fee, totalSinIva, iva, totalConIva, margen, margenPct };
}

export default function AlcanceTab({ presupuestoId, presupuesto, cfg, logoUrl, userRole }) {
  const [alcances, setAlcances] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [openAlcance, setOpenAlcance] = useState(null);
  const [openItem, setOpenItem] = useState(null);
  const [toast, setToast]       = useState('');

  function showToast(m) { setToast(m); setTimeout(()=>setToast(''),2500); }

  useEffect(() => { if (presupuestoId) loadAlcances(); }, [presupuestoId]);

  async function loadAlcances() {
    setLoading(true);
    const { data } = await supabase.from('alcances')
      .select('*').eq('presupuesto_id', presupuestoId).order('created_at');
    setAlcances(data || []);
    setLoading(false);
  }

  async function saveAlcance(alcance) {
    setSaving(true);
    if (alcance._isNew) {
      const { _isNew, ...data } = alcance;
      await supabase.from('alcances').insert({ ...data, presupuesto_id: presupuestoId });
    } else {
      await supabase.from('alcances').update(alcance).eq('id', alcance.id);
    }
    setSaving(false);
    showToast('Alcance guardado ✓');
    loadAlcances();
  }

  async function deleteAlcance(id) {
    if (!confirm('¿Eliminar este alcance?')) return;
    await supabase.from('alcances').delete().eq('id', id);
    loadAlcances();
    if (openAlcance?.id === id) setOpenAlcance(null);
  }

  function addAlcance() {
    const nuevo = { ...emptyAlcance(cfg, alcances.length + 1), _isNew: true };
    setOpenAlcance(nuevo);
    setOpenItem(null);
  }

  function updItem(alcance, itemId, field, value) {
    const nums = ['costo_unit','precio_unit','cantidad','dias','oh_pct','bco_pct'];
    const items = alcance.items.map(it => {
      if (it.id !== itemId) return it;
      const upd = { ...it, [field]: nums.includes(field) ? Number(value) : value };
      return upd;
    });
    setOpenAlcance(prev => ({ ...prev, items }));
  }

  function addItemToAlcance() {
    const items = [...(openAlcance.items || []), emptyItemAlcance(cfg)];
    setOpenAlcance(prev => ({ ...prev, items }));
  }

  function addSubcat() {
    const nombre = window.prompt('Nombre de la subcategoría:');
    if (!nombre?.trim()) return;
    const subcat = { id:uid(), _type:'subcat', subcategoria:nombre.trim(), item:'', detalle:'', cantidad:0, dias:0, costo_unit:0, precio_unit:0, oh_pct:0, bco_pct:0, categoria:'', es_liquidacion:false };
    setOpenAlcance(prev => ({ ...prev, items:[...(prev.items||[]),subcat] }));
  }

  function openPdf(alcance, tipo) {
    // Construir un ppto-like para el PDF
    const pptoLike = {
      ...presupuesto,
      nombre: `${presupuesto.nombre} — ${alcance.nombre}`,
      items: alcance.items,
      fee_agencia: alcance.fee_agencia,
      oh_pct: alcance.oh_pct,
      bco_pct: alcance.bco_pct,
      notas: alcance.descripcion,
    };
    const html = tipo === 'cliente'
      ? generatePdfClienteHTML(pptoLike, logoUrl)
      : generatePdfFinancieroHTML(pptoLike, logoUrl);
    const w = window.open('','_blank');
    w.document.write(html);
    w.document.close();
  }

  // Totales incluidos en el principal
  const alcancesIncluidos = alcances.filter(a => a.incluir_en_principal);
  const totalIncluido = alcancesIncluidos.reduce((sum, a) => sum + calcAlcance(a).totalSinIva, 0);

  if (loading) return <div style={{ padding:'2rem', textAlign:'center', color:'#888' }}>Cargando alcances…</div>;

  // ── Editor de alcance abierto ─────────────────────────────
  if (openAlcance) {
    const t = calcAlcance(openAlcance);
    // Agrupar items por subcategoría
    const groups = [];
    let cur = null;
    (openAlcance.items || []).forEach(it => {
      if (it._type === 'subcat') { cur = { subcat: it.subcategoria, subcatId: it.id, items:[] }; groups.push(cur); }
      else { if (!cur) { cur = { subcat:'General', subcatId:null, items:[] }; groups.push(cur); } cur.items.push(it); }
    });

    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <button onClick={()=>setOpenAlcance(null)} style={{ background:'none', border:'1px solid #ddd', borderRadius:8, padding:'5px 12px', cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>← Volver</button>
          <input value={openAlcance.nombre} onChange={e=>setOpenAlcance(p=>({...p,nombre:e.target.value}))}
            style={{ ...S.input, fontSize:15, fontWeight:600, flex:1 }} placeholder="Nombre del alcance"/>
          <button onClick={()=>openPdf(openAlcance,'cliente')} style={{ ...S.btnSecondary, fontSize:12 }}>📄 PDF cliente</button>
          <button onClick={()=>openPdf(openAlcance,'financiero')} style={{ ...S.btnSecondary, fontSize:12, color:'#c8264a' }}>📊 PDF financiero</button>
          <button onClick={()=>saveAlcance(openAlcance)} disabled={saving} style={{ ...S.btnPrimary }}>{saving?'Guardando…':'💾 Guardar'}</button>
        </div>

        {/* Config */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14, background:'#f8fafc', padding:'12px 14px', borderRadius:10, border:'1px solid #dde6ef' }}>
          <div><Label>Fee agencia %</Label><input type="number" step="0.1" style={S.input} value={openAlcance.fee_agencia} onChange={e=>setOpenAlcance(p=>({...p,fee_agencia:Number(e.target.value)}))}/></div>
          <div><Label>OH %</Label><input type="number" step="0.1" style={S.input} value={openAlcance.oh_pct} onChange={e=>setOpenAlcance(p=>({...p,oh_pct:Number(e.target.value)}))}/></div>
          <div><Label>BCO %</Label><input type="number" step="0.1" style={S.input} value={openAlcance.bco_pct} onChange={e=>setOpenAlcance(p=>({...p,bco_pct:Number(e.target.value)}))}/></div>
          <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:4 }}>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
              <input type="checkbox" checked={!!openAlcance.incluir_en_principal}
                onChange={e=>setOpenAlcance(p=>({...p,incluir_en_principal:e.target.checked}))}
                style={{ width:15, height:15, cursor:'pointer', accentColor:'#0d3b5e' }}/>
              Incluir en principal
            </label>
          </div>
        </div>

        {/* Descripción */}
        <div style={{ marginBottom:14 }}>
          <Label>Descripción del alcance</Label>
          <textarea value={openAlcance.descripcion||''} onChange={e=>setOpenAlcance(p=>({...p,descripcion:e.target.value}))}
            style={{...S.input,minHeight:50,resize:'vertical'}} placeholder="Detalle del alcance solicitado..."/>
        </div>

        {/* Toolbar ítems */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <span style={{ fontSize:13, color:'#5a7a9a' }}>{(openAlcance.items||[]).filter(it=>!it._type).length} ítems · Total s/IVA: <strong style={{color:'#0d3b5e'}}>{fmt(t.totalSinIva)}</strong></span>
          <div style={{ display:'flex', gap:8 }}>
            <button style={{...S.btnPrimary,background:'#0d3b5e'}} onClick={addSubcat}>+ Subcategoría</button>
            <button style={{...S.btnPrimary,background:'#c8264a'}} onClick={addItemToAlcance}>+ Ítem</button>
          </div>
        </div>

        {/* Items */}
        {groups.map(grupo => (
          <div key={grupo.subcatId||'general'} style={{ marginBottom:12 }}>
            {grupo.subcatId && (
              <div style={{ background:'#0d3b5e', color:'#fff', padding:'6px 14px', borderRadius:8, fontSize:12, fontWeight:700, letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>
                {grupo.subcat}
              </div>
            )}
            {grupo.items.map(it => {
              const c = calcItem(it);
              const isOpen = openItem === it.id;
              return (
                <div key={it.id} style={{ border:'1px solid #dde6ef', borderRadius:8, marginBottom:6, overflow:'hidden' }}>
                  <div onClick={()=>setOpenItem(isOpen?null:it.id)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', cursor:'pointer', background:isOpen?'#eef4fb':'#fff' }}>
                    <span style={{ flex:1, fontSize:13, fontWeight:500 }}>{it.item||'(sin nombre)'}</span>
                    <span style={{ fontSize:12, color:'#8aa0b8' }}>{it.cantidad}×{it.dias} · P:{fmt(c.precio)} · C:{fmt(c.totalCosto)}</span>
                    <span style={{ fontSize:13, color:c.margen>=0?'#2e8b4e':'#c8264a', fontWeight:600 }}>{fmt(c.margen)}</span>
                    <button onClick={e=>{e.stopPropagation();setOpenAlcance(p=>({...p,items:p.items.filter(x=>x.id!==it.id)}));}} style={{background:'none',border:'none',color:'#c8264a',cursor:'pointer',fontSize:16}}>✕</button>
                  </div>
                  {isOpen && (
                    <div style={{ padding:'12px 14px', background:'#fafcfe', borderTop:'1px solid #dde6ef', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      <div style={{gridColumn:'1/-1'}}><Label>Nombre del ítem</Label><input style={S.input} value={it.item} onChange={e=>updItem(openAlcance,it.id,'item',e.target.value)}/></div>
                      <div style={{gridColumn:'1/-1'}}><Label>Detalle</Label><textarea style={{...S.input,minHeight:48,resize:'vertical'}} value={it.detalle} onChange={e=>updItem(openAlcance,it.id,'detalle',e.target.value)}/></div>
                      <div><Label>Cantidad</Label><input type="number" style={S.input} value={it.cantidad} onChange={e=>updItem(openAlcance,it.id,'cantidad',e.target.value)}/></div>
                      <div><Label>Días</Label><input type="number" style={S.input} value={it.dias} onChange={e=>updItem(openAlcance,it.id,'dias',e.target.value)}/></div>
                      <div><Label>Costo unitario ($)</Label><input type="number" step="0.01" style={S.input} value={it.costo_unit} onChange={e=>updItem(openAlcance,it.id,'costo_unit',e.target.value)}/></div>
                      <div><Label>Precio unitario ($)</Label><input type="number" step="0.01" style={S.input} value={it.precio_unit} onChange={e=>updItem(openAlcance,it.id,'precio_unit',e.target.value)}/></div>
                      <div><Label>OH %</Label><input type="number" step="0.1" style={S.input} value={it.oh_pct} onChange={e=>updItem(openAlcance,it.id,'oh_pct',e.target.value)}/></div>
                      <div><Label>BCO %</Label><input type="number" step="0.1" style={S.input} value={it.bco_pct} onChange={e=>updItem(openAlcance,it.id,'bco_pct',e.target.value)}/></div>
                      <div><Label>Proveedor</Label><input style={S.input} value={it.proveedor||''} onChange={e=>updItem(openAlcance,it.id,'proveedor',e.target.value)}/></div>
                      <div><Label># Factura</Label><input style={S.input} value={it.num_factura_prov||''} onChange={e=>updItem(openAlcance,it.id,'num_factura_prov',e.target.value)}/></div>
                      <div style={{gridColumn:'1/-1',background:'#eef4fb',borderRadius:8,padding:'10px 12px',display:'flex',gap:20}}>
                        <span style={{fontSize:13}}>Precio total: <strong>{fmt(c.precio)}</strong></span>
                        <span style={{fontSize:13}}>Costo total: <strong>{fmt(c.totalCosto)}</strong></span>
                        <span style={{fontSize:13,color:c.margen>=0?'#2e8b4e':'#c8264a'}}>Margen: <strong>{fmt(c.margen)} ({fmtPct(c.margenPct)})</strong></span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Totales del alcance */}
        {(openAlcance.items||[]).filter(it=>!it._type).length > 0 && (
          <div style={{ background:'#0d3b5e', borderRadius:10, padding:'14px 18px', marginTop:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
              {[['Subtotal precio',fmt(t.subtotalPrecio)],['Fee',fmt(t.fee)],['Total s/IVA',fmt(t.totalSinIva)],['IVA 15%',fmt(t.iva)],['Total c/IVA',fmt(t.totalConIva)]].map(([l,v])=>(
                <div key={l} style={{textAlign:'center'}}>
                  <div style={{fontSize:10,color:'rgba(255,255,255,.6)',marginBottom:3}}>{l}</div>
                  <div style={{fontSize:14,fontWeight:700,color:'#fff'}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{textAlign:'center',marginTop:8,fontSize:12,color:t.margen>=0?'#5dc98a':'#ff6b6b',fontWeight:600}}>
              Margen s/fee: {fmt(t.subtotalPrecio-t.subtotalCosto)} ({t.subtotalPrecio>0?((t.subtotalPrecio-t.subtotalCosto)/t.subtotalPrecio*100).toFixed(1):'0.0'}%)
            </div>
          </div>
        )}

        {toast && <div style={{position:'fixed',bottom:24,right:24,background:'#0d3b5e',color:'#fff',padding:'10px 18px',borderRadius:10,fontSize:13,zIndex:999}}>{toast}</div>}
      </div>
    );
  }

  // ── Lista de alcances ─────────────────────────────────────
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:600, color:'#0d3b5e' }}>Alcances del presupuesto</div>
          {alcancesIncluidos.length > 0 && (
            <div style={{ fontSize:12, color:'#2e8b4e', marginTop:3 }}>
              Total incluido en principal: <strong>{fmt(totalIncluido)}</strong>
            </div>
          )}
        </div>
        <button onClick={addAlcance} style={S.btnPrimary}>+ Nuevo alcance</button>
      </div>

      {alcances.length === 0 && (
        <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', border:'2px dashed #e8e8e8', borderRadius:12 }}>
          <div style={{ fontSize:20, marginBottom:8 }}>➕</div>
          <div style={{ fontSize:14 }}>Sin alcances aún</div>
          <div style={{ fontSize:12, marginTop:4 }}>Creá un alcance cuando el cliente solicite trabajos adicionales</div>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {alcances.map(a => {
          const t = calcAlcance(a);
          const estadoColor = { borrador:'#888', enviado:'#0d3b5e', aprobado:'#2e8b4e', facturado:'#7c3aed' };
          return (
            <div key={a.id} style={{ background:'#fff', border:`1px solid ${a.incluir_en_principal?'#2e8b4e44':'#e8e8e8'}`, borderLeft:`4px solid ${a.incluir_en_principal?'#2e8b4e':'#ddd'}`, borderRadius:'0 10px 10px 0', padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:8, justifyContent:'space-between' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                    <span style={{ fontWeight:600, fontSize:15 }}>{a.nombre}</span>
                    {a.incluir_en_principal && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:'#e8f5ee', color:'#2e8b4e', fontWeight:500 }}>✓ Incluido en principal</span>}
                    <select value={a.estado||'borrador'} onChange={async e=>{
                      await supabase.from('alcances').update({estado:e.target.value}).eq('id',a.id);
                      loadAlcances();
                    }} style={{fontSize:11,padding:'2px 8px',border:'1px solid #ddd',borderRadius:6,background:'#fff',fontFamily:'inherit',cursor:'pointer'}}>
                      {['borrador','enviado','aprobado','facturado'].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                    </select>
                  </div>
                  {a.descripcion && <div style={{ fontSize:12, color:'#888', marginBottom:6, fontStyle:'italic' }}>{a.descripcion}</div>}
                  <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:12 }}>
                    <span>💵 Total s/IVA: <strong style={{color:'#0d3b5e'}}>{fmt(t.totalSinIva)}</strong></span>
                    <span>Total c/IVA: <strong>{fmt(t.totalConIva)}</strong></span>
                    <span style={{color:t.margen>=0?'#2e8b4e':'#dc2626'}}>Margen: <strong>{fmt(t.margen)} ({t.margenPct.toFixed(1)}%)</strong></span>
                    <span style={{color:'#888'}}>{(a.items||[]).filter(it=>!it._type).length} ítems</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap' }}>
                  <button onClick={()=>openPdf(a,'cliente')} style={{...S.btnSm,fontSize:11}}>📄 PDF</button>
                  <button onClick={()=>openPdf(a,'financiero')} style={{...S.btnSm,fontSize:11,color:'#c8264a'}}>📊 Fin.</button>
                  <button onClick={()=>{setOpenAlcance(a);setOpenItem(null);}} style={S.btnSm}>Editar</button>
                  <button onClick={()=>deleteAlcance(a.id)} style={{...S.btnRed,fontSize:11}}>🗑</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {toast && <div style={{position:'fixed',bottom:24,right:24,background:'#0d3b5e',color:'#fff',padding:'10px 18px',borderRadius:10,fontSize:13,zIndex:999}}>{toast}</div>}
    </div>
  );
}
