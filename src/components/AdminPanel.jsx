import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { S, Label, Toast, Modal } from '../styles.jsx';
import { ROLES, ROLES_LABELS } from '../roles';

export default function AdminPanel() {
  const [cfg, setCfg]           = useState({ oh_pct:15, bco_pct:5.5, fee_agencia:0, rebate_pct:2 });
  const [categorias, setCats]   = useState([]);
  const [clientes, setClis]     = useState([]);
  const [ejecutivos, setEjecs]  = useState([]);
  const [productores, setProds]  = useState([]);
  const [newProd, setNewProd]    = useState({ nombre:'', cargo:'' });
  const [editProd, setEditProd]  = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [toast, setToast]       = useState('');
  const [tab, setTab]           = useState('usuarios');
  const [saving, setSaving]     = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);

  // Forms
  const [newCat,  setNewCat]  = useState('');
  const [newCli,  setNewCli]  = useState({ nombre:'', ruc:'', contacto:'', telefono:'', email:'', notas:'', fee_agencia:0, bco_aplica:false });
  const [editCli, setEditCli] = useState(null);
  const [newEjec,  setNewEjec]  = useState({ nombre:'', email:'', cargo:'' });
  const [editEjec, setEditEjec] = useState(null);
  const [newUser,  setNewUser]  = useState({ email:'', password:'', role:'ventas' });
  const [editUser, setEditUser] = useState(null);

  useEffect(() => {
    fetchAll();
    const saved = localStorage.getItem('matilda_logo');
    if (saved) setLogoPreview(saved);
  }, []);

  async function fetchAll() {
    const [cfgR, catR, cliR, ejecR, prodR] = await Promise.all([
      supabase.from('config').select('*').single(),
      supabase.from('categorias').select('*').order('nombre'),
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('ejecutivos').select('*').order('nombre'),
      supabase.from('productores').select('*').order('nombre'),
    ]);
    if (cfgR.data)  setCfg(cfgR.data);
    if (catR.data)  setCats(catR.data);
    if (cliR.data)  setClis(cliR.data);
    if (ejecR.data) setEjecs(ejecR.data);
    if (prodR.data) setProds(prodR.data);
  }

  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 2500); }

  // ── Config ─────────────────────────────────────────────────
  async function saveCfg() {
    setSaving(true);
    const { error } = await supabase.from('config').upsert({ id:1, ...cfg });
    setSaving(false);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast('Configuración guardada ✓');
  }

  // ── Categorías ─────────────────────────────────────────────
  async function addCat() {
    if (!newCat.trim()) return;
    const { error } = await supabase.from('categorias').insert({ nombre: newCat.trim().toUpperCase() });
    if (error) { showToast('Error: ' + error.message); return; }
    setNewCat(''); fetchAll(); showToast('Categoría agregada ✓');
  }
  async function deleteCat(id) {
    if (!window.confirm('¿Eliminar categoría?')) return;
    await supabase.from('categorias').delete().eq('id', id); fetchAll();
  }

  // ── Clientes ───────────────────────────────────────────────
  async function saveCli() {
    if (!newCli.nombre.trim()) return;
    const { error } = await supabase.from('clientes').insert(newCli);
    if (error) { showToast('Error: ' + error.message); return; }
    setNewCli({ nombre:'', ruc:'', contacto:'', telefono:'', email:'', notas:'' });
    fetchAll(); showToast('Cliente agregado ✓');
  }
  async function updateCli() {
    const { error } = await supabase.from('clientes').update(editCli).eq('id', editCli.id);
    if (error) { showToast('Error: ' + error.message); return; }
    setEditCli(null); fetchAll(); showToast('Cliente actualizado ✓');
  }
  async function deleteCli(id) {
    if (!window.confirm('¿Eliminar cliente?')) return;
    await supabase.from('clientes').delete().eq('id', id); fetchAll();
  }

  // ── Productores ────────────────────────────────────────────
  async function saveProd() {
    if (!newProd.nombre.trim()) return;
    const { error } = await supabase.from('productores').insert(newProd);
    if (error) { showToast('Error: ' + error.message); return; }
    setNewProd({ nombre:'', cargo:'' }); fetchAll(); showToast('Productor agregado ✓');
  }
  async function updateProd() {
    const { error } = await supabase.from('productores').update(editProd).eq('id', editProd.id);
    if (error) { showToast('Error: ' + error.message); return; }
    setEditProd(null); fetchAll(); showToast('Productor actualizado ✓');
  }
  async function deleteProd(id) {
    if (!window.confirm('¿Eliminar productor?')) return;
    await supabase.from('productores').delete().eq('id', id); fetchAll();
  }

  // ── Ejecutivos ─────────────────────────────────────────────
  async function saveEjec() {
    if (!newEjec.nombre.trim()) return;
    const { error } = await supabase.from('ejecutivos').insert(newEjec);
    if (error) { showToast('Error: ' + error.message); return; }
    setNewEjec({ nombre:'', email:'', cargo:'' }); fetchAll(); showToast('Ejecutivo agregado ✓');
  }
  async function updateEjec() {
    const { error } = await supabase.from('ejecutivos').update(editEjec).eq('id', editEjec.id);
    if (error) { showToast('Error: ' + error.message); return; }
    setEditEjec(null); fetchAll(); showToast('Ejecutivo actualizado ✓');
  }
  async function deleteEjec(id) {
    if (!window.confirm('¿Eliminar ejecutivo?')) return;
    await supabase.from('ejecutivos').delete().eq('id', id); fetchAll();
  }

  // ── Usuarios ───────────────────────────────────────────────
  async function createUser() {
    if (!newUser.email || !newUser.password) { showToast('Email y contraseña requeridos'); return; }
    const { error } = await supabase.auth.admin.createUser({
      email: newUser.email,
      password: newUser.password,
      email_confirm: true,
      user_metadata: { role: newUser.role },
    });
    if (error) { showToast('Error: ' + error.message); return; }
    setNewUser({ email:'', password:'', role:'ventas' });
    showToast('Usuario creado ✓');
  }

  async function updateUserRole(userId, role) {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { role },
    });
    if (error) { showToast('Error: ' + error.message); return; }
    showToast('Rol actualizado ✓');
    setEditUser(null);
  }

  // ── Logo ───────────────────────────────────────────────────
  function handleLogo(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target.result;
      setLogoPreview(data);
      localStorage.setItem('matilda_logo', data);
    };
    reader.readAsDataURL(file);
  }

  // ── Backup ─────────────────────────────────────────────────
  async function downloadBackup() {
    showToast('Generando backup…');
    try {
      const [ppR, cliR, catR, ejecR, liqR, cfgR, brR, prR] = await Promise.all([
        supabase.from('presupuestos').select('*'),
        supabase.from('clientes').select('*'),
        supabase.from('categorias').select('*'),
        supabase.from('ejecutivos').select('*'),
        supabase.from('liquidaciones').select('*'),
        supabase.from('config').select('*'),
        supabase.from('briefs').select('*'),
        supabase.from('propuestas').select('*'),
      ]);
      const backup = {
        fecha: new Date().toISOString(), version: '2.0',
        tablas: {
          presupuestos:  ppR.data  || [],
          clientes:      cliR.data || [],
          categorias:    catR.data || [],
          ejecutivos:    ejecR.data|| [],
          liquidaciones: liqR.data || [],
          config:        cfgR.data || [],
          briefs:        brR.data  || [],
          propuestas:    prR.data  || [],
        }
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `matilda_hub_backup_${new Date().toISOString().slice(0,10)}.json`;
      a.click(); URL.revokeObjectURL(url);
      showToast(`Backup descargado ✓`);
    } catch(e) { showToast('Error: ' + e.message); }
  }

  const TABS = [
    ['usuarios',    '👥 Usuarios'],
    ['productores', '🎯 Productores'],
    ['ejecutivos',  '👤 Ejecutivos'],
    ['clientes',    '🏢 Clientes'],
    ['categorias',  '🏷️ Categorías'],
    ['config',      '⚙️ Config'],
    ['logo',        '🖼️ Logo'],
    ['backup',      '💾 Backup'],
  ];

  const ROLES_LIST = [
    { id:'admin',      label:'Admin',       desc:'Acceso total al sistema' },
    { id:'ventas',     label:'Ventas',      desc:'CRM, briefs, ver propuestas y presupuestos' },
    { id:'creativo',   label:'Creativo',    desc:'Ver briefs, crear propuestas, calendario' },
    { id:'produccion', label:'Producción',  desc:'Briefs, presupuestos completos, implementaciones' },
    { id:'financiero', label:'Financiero',  desc:'Presupuestos, liquidaciones, aprobar estados' },
  ];

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:700, color:'#0d3b5e', marginBottom:16 }}>⚙️ Administración</h2>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'2px solid #dde6ef', flexWrap:'wrap' }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding:'8px 14px', border:'none',
            borderBottom: tab===k ? '2px solid #c8264a' : '2px solid transparent',
            background:'none', cursor:'pointer', fontSize:13,
            fontWeight: tab===k ? 700 : 400,
            color: tab===k ? '#c8264a' : '#5a7a9a',
            marginBottom: -2,
          }}>{l}</button>
        ))}
      </div>

      {/* ── USUARIOS ── */}
      {tab === 'usuarios' && (
        <div>
          <div style={S.card}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:6 }}>Crear nuevo usuario</h3>
            <p style={{ fontSize:12, color:'#8aa0b8', marginBottom:16 }}>El usuario recibirá acceso según el rol asignado.</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><Label>Email *</Label><input style={S.input} type="email" value={newUser.email} onChange={e=>setNewUser(p=>({...p,email:e.target.value}))} placeholder="usuario@matilda.agency"/></div>
              <div><Label>Contraseña *</Label><input style={S.input} type="password" value={newUser.password} onChange={e=>setNewUser(p=>({...p,password:e.target.value}))} placeholder="Mínimo 6 caracteres"/></div>
              <div style={{ gridColumn:'1/-1' }}>
                <Label>Rol</Label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:8, marginTop:4 }}>
                  {ROLES_LIST.map(r => (
                    <div key={r.id} onClick={() => setNewUser(p=>({...p,role:r.id}))} style={{
                      padding:'10px 12px', borderRadius:9, cursor:'pointer',
                      border: newUser.role===r.id ? '2px solid #0d3b5e' : '1px solid #dde6ef',
                      background: newUser.role===r.id ? '#eef4fb' : '#fff',
                    }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#0d3b5e' }}>{r.label}</div>
                      <div style={{ fontSize:11, color:'#8aa0b8', marginTop:2 }}>{r.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button style={{ ...S.btnPrimary, marginTop:14 }} onClick={createUser}>+ Crear usuario</button>
            <p style={{ fontSize:12, color:'#8aa0b8', marginTop:10 }}>Para eliminar usuarios andá a Supabase → Authentication → Users.</p>
          </div>

          {/* Tabla de roles por rol */}
          <div style={S.card}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:14 }}>Permisos por rol</h3>
            <div style={{ overflowX:'auto' }}>
              <table style={{ ...S.table, fontSize:12 }}>
                <thead>
                  <tr>
                    <th style={S.th}>Módulo</th>
                    {ROLES_LIST.map(r=><th key={r.id} style={{ ...S.th, textAlign:'center' }}>{r.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['CRM', '✅','✅','—','—','—'],
                    ['Clientes', '✅','✅','—','✅','✅'],
                    ['Proyectos/Briefs', '✅','✅','✅','✅','👁'],
                    ['Propuestas', '✅','👁','✅','✅','—'],
                    ['Calendario', '✅','✅','✅','✅','✅'],
                    ['Presupuestos', '✅','—','—','✅','✅'],
                    ['Liquidaciones', '✅','—','—','✅','✅'],
                    ['Implementaciones', '✅','—','—','✅','✅'],
                    ['Admin', '✅','—','—','—','—'],
                  ].map(([mod,...vals]) => (
                    <tr key={mod}>
                      <td style={{ ...S.td, fontWeight:500 }}>{mod}</td>
                      {vals.map((v,i) => <td key={i} style={{ ...S.td, textAlign:'center', color:v==='✅'?'#2e8b4e':v==='👁'?'#d97706':'#ccc' }}>{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize:11, color:'#8aa0b8', marginTop:8 }}>✅ Acceso completo · 👁 Solo lectura · — Sin acceso</p>
            </div>
          </div>
        </div>
      )}

      {/* ── EJECUTIVOS ── */}
      {tab === 'productores' && (
        <div>
          <div style={S.card}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:14 }}>Agregar productor</h3>
            <div style={S.grid2}>
              <div><Label>Nombre completo *</Label><input style={S.input} value={newProd.nombre} onChange={e=>setNewProd(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Juan Villao"/></div>
              <div><Label>Cargo</Label><input style={S.input} value={newProd.cargo} onChange={e=>setNewProd(p=>({...p,cargo:e.target.value}))} placeholder="Ej: Productor de Eventos"/></div>
            </div>
            <button style={{ ...S.btnPrimary, marginTop:12 }} onClick={saveProd}>+ Agregar productor</button>
          </div>
          {editProd && (
            <div style={S.card}>
              <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:14 }}>Editar productor</h3>
              <div style={S.grid2}>
                <div><Label>Nombre</Label><input style={S.input} value={editProd.nombre} onChange={e=>setEditProd(p=>({...p,nombre:e.target.value}))}/></div>
                <div><Label>Cargo</Label><input style={S.input} value={editProd.cargo} onChange={e=>setEditProd(p=>({...p,cargo:e.target.value}))}/></div>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:12 }}>
                <button style={S.btnPrimary} onClick={updateProd}>Guardar</button>
                <button style={S.btnSecondary} onClick={()=>setEditProd(null)}>Cancelar</button>
              </div>
            </div>
          )}
          <div style={S.card}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:14 }}>Productores ({productores.length})</h3>
            <table style={S.table}>
              <thead><tr>{['Nombre','Cargo',''].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {productores.map(p=>(
                  <tr key={p.id}>
                    <td style={S.td}><strong>{p.nombre}</strong></td>
                    <td style={S.td}>{p.cargo}</td>
                    <td style={S.td}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button style={S.btnSm} onClick={()=>setEditProd({...p})}>✏️</button>
                        <button style={S.btnRed} onClick={()=>deleteProd(p.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {productores.length===0 && <tr><td colSpan={3} style={{ ...S.td, textAlign:'center', color:'#8aa0b8' }}>Sin productores</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'ejecutivos' && (
        <div>
          <div style={S.card}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:14 }}>Agregar ejecutivo</h3>
            <div style={S.grid2}>
              <div><Label>Nombre completo *</Label><input style={S.input} value={newEjec.nombre} onChange={e=>setNewEjec(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Camille Andrade"/></div>
              <div><Label>Cargo</Label><input style={S.input} value={newEjec.cargo} onChange={e=>setNewEjec(p=>({...p,cargo:e.target.value}))} placeholder="Ej: Ejecutiva de Eventos"/></div>
              <div style={{ gridColumn:'1/-1' }}><Label>Email</Label><input style={S.input} type="email" value={newEjec.email} onChange={e=>setNewEjec(p=>({...p,email:e.target.value}))}/></div>
            </div>
            <button style={{ ...S.btnPrimary, marginTop:12 }} onClick={saveEjec}>+ Agregar ejecutivo</button>
          </div>
          <div style={S.card}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:14 }}>Equipo ({ejecutivos.length})</h3>
            <table style={S.table}>
              <thead><tr>{['Nombre','Cargo','Email',''].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {ejecutivos.map(e=>(
                  <tr key={e.id}>
                    <td style={S.td}><strong>{e.nombre}</strong></td>
                    <td style={S.td}>{e.cargo}</td>
                    <td style={S.td}>{e.email}</td>
                    <td style={S.td}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button style={S.btnSm} onClick={()=>setEditEjec({...e})}>✏️</button>
                        <button style={S.btnRed} onClick={()=>deleteEjec(e.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {ejecutivos.length===0 && <tr><td colSpan={4} style={{ ...S.td, textAlign:'center', color:'#8aa0b8' }}>Sin ejecutivos</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CLIENTES ── */}
      {tab === 'clientes' && (
        <div>
          <div style={S.card}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:14 }}>Agregar cliente</h3>
            <div style={S.grid2}>
              <div><Label>Nombre / Razón social *</Label><input style={S.input} value={newCli.nombre} onChange={e=>setNewCli(p=>({...p,nombre:e.target.value}))}/></div>
              <div><Label>RUC / Cédula</Label><input style={S.input} value={newCli.ruc} onChange={e=>setNewCli(p=>({...p,ruc:e.target.value}))}/></div>
              <div><Label>Contacto</Label><input style={S.input} value={newCli.contacto} onChange={e=>setNewCli(p=>({...p,contacto:e.target.value}))}/></div>
              <div><Label>Teléfono</Label><input style={S.input} value={newCli.telefono} onChange={e=>setNewCli(p=>({...p,telefono:e.target.value}))}/></div>
              <div style={{ gridColumn:'1/-1' }}><Label>Email</Label><input style={S.input} type="email" value={newCli.email} onChange={e=>setNewCli(p=>({...p,email:e.target.value}))}/></div>
              <div>
                <Label>Fee agencia (%)</Label>
                <input type="number" step="0.1" min="0" style={S.input} value={newCli.fee_agencia||0} onChange={e=>setNewCli(p=>({...p,fee_agencia:parseFloat(e.target.value)||0}))}/>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, paddingTop:20 }}>
                <input type="checkbox" id="bco_new" checked={!!newCli.bco_aplica} onChange={e=>setNewCli(p=>({...p,bco_aplica:e.target.checked}))} style={{ width:16, height:16, cursor:'pointer' }}/>
                <label htmlFor="bco_new" style={{ fontSize:13, cursor:'pointer', color:'#333' }}>Aplica BCO</label>
              </div>
              <div style={{ gridColumn:'1/-1' }}><Label>Notas</Label><textarea style={{ ...S.input, minHeight:60, resize:'vertical' }} value={newCli.notas} onChange={e=>setNewCli(p=>({...p,notas:e.target.value}))}/></div>
            </div>
            <button style={{ ...S.btnPrimary, marginTop:12 }} onClick={saveCli}>+ Agregar cliente</button>
          </div>
          <div style={S.card}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:14 }}>Clientes ({clientes.length})</h3>
            <table style={S.table}>
              <thead><tr>{['Nombre','RUC','Contacto','Email','Fee %','BCO',''].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {clientes.map(c=>(
                  <tr key={c.id}>
                    <td style={S.td}><strong>{c.nombre}</strong></td>
                    <td style={S.td}>{c.ruc}</td>
                    <td style={S.td}>{c.contacto}</td>
                    <td style={S.td}>{c.email}</td>
                    <td style={S.td}>{c.fee_agencia > 0 ? `${c.fee_agencia}%` : '—'}</td>
                    <td style={S.td}>{c.bco_aplica ? '✅' : '—'}</td>
                    <td style={S.td}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button style={S.btnSm} onClick={()=>setEditCli({...c})}>✏️</button>
                        <button style={S.btnRed} onClick={()=>deleteCli(c.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {clientes.length===0 && <tr><td colSpan={7} style={{ ...S.td, textAlign:'center', color:'#8aa0b8' }}>Sin clientes</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CATEGORÍAS ── */}
      {tab === 'categorias' && (
        <div style={S.card}>
          <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:16 }}>Categorías de ítems</h3>
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <input style={{ ...S.input, flex:1 }} value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCat()} placeholder="Nueva categoría…"/>
            <button style={S.btnPrimary} onClick={addCat}>+ Agregar</button>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {categorias.map(c=>(
              <div key={c.id} style={{ display:'flex', alignItems:'center', gap:6, background:'#eef4fb', border:'1px solid #c8d8e8', borderRadius:6, padding:'5px 10px' }}>
                <span style={{ fontSize:13, fontWeight:600, color:'#0d3b5e' }}>{c.nombre}</span>
                <button onClick={()=>deleteCat(c.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#c8264a', fontSize:14 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CONFIG ── */}
      {tab === 'config' && (
        <div style={S.card}>
          <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:6 }}>Porcentajes globales de presupuestos</h3>
          <p style={{ fontSize:12, color:'#8aa0b8', marginBottom:16 }}>⚠️ Solo aplica a presupuestos nuevos creados después del cambio.</p>
          <div style={S.grid4}>
            {[['OH (%)','oh_pct'],['BCO (%)','bco_pct'],['Fee agencia (%)','fee_agencia'],['Rebate (%)','rebate_pct']].map(([l,k])=>(
              <div key={k}><Label>{l}</Label><input type="number" step="0.1" style={S.input} value={cfg[k]??0} onChange={e=>setCfg(p=>({...p,[k]:parseFloat(e.target.value)??0}))}/></div>
            ))}
          </div>
          <div style={{ marginTop:16 }}>
            <button style={S.btnPrimary} onClick={saveCfg} disabled={saving}>{saving?'Guardando…':'💾 Guardar configuración'}</button>
          </div>
        </div>
      )}

      {/* ── LOGO ── */}
      {tab === 'logo' && (
        <div style={S.card}>
          <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:16 }}>🖼️ Logo de Matilda</h3>
          <p style={{ fontSize:13, color:'#5a7a9a', marginBottom:16 }}>El logo aparece en el header y en todos los PDFs generados.</p>
          <div style={{ display:'flex', alignItems:'flex-start', gap:24 }}>
            <div style={{ flex:1 }}>
              <Label>Subir logo (PNG con fondo transparente ideal)</Label>
              <input type="file" accept="image/*" onChange={handleLogo} style={{ marginTop:8, fontSize:13 }}/>
            </div>
            <div style={{ textAlign:'center' }}>
              <Label>Vista previa</Label>
              <div style={{ marginTop:8, padding:12, background:'#0d3b5e', borderRadius:8, minWidth:160, minHeight:80, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {logoPreview
                  ? <img src={logoPreview} alt="logo" style={{ maxHeight:60, maxWidth:140, objectFit:'contain' }}/>
                  : <span style={{ color:'#8ab4d4', fontSize:12 }}>Sin logo</span>
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BACKUP ── */}
      {tab === 'backup' && (
        <div>
          <div style={S.card}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:8 }}>💾 Copia de seguridad</h3>
            <p style={{ fontSize:13, color:'#5a7a9a', marginBottom:20, lineHeight:1.6 }}>
              Descargá un archivo JSON con todos los datos: presupuestos, ítems, clientes, ejecutivos, briefs, propuestas, liquidaciones y configuración.
            </p>
            <div style={{ background:'#f0f4f8', borderRadius:10, padding:20, marginBottom:16, display:'flex', alignItems:'center', gap:20 }}>
              <div style={{ fontSize:48 }}>📦</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:'#0d3b5e', marginBottom:4 }}>Backup completo Matilda Hub</div>
                <div style={{ fontSize:13, color:'#5a7a9a' }}>Presupuestos · Clientes · Briefs · Propuestas · Ejecutivos · Liquidaciones · Config</div>
                <div style={{ fontSize:12, color:'#8aa0b8', marginTop:4 }}>Formato JSON · v2.0</div>
              </div>
              <button style={{ ...S.btnPrimary, padding:'12px 24px', fontSize:15, background:'#2e8b4e' }} onClick={downloadBackup}>
                ⬇ Descargar backup
              </button>
            </div>
            <div style={{ background:'#fff8e6', border:'1px solid #f0d080', borderRadius:8, padding:'12px 16px' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#7a5500', marginBottom:4 }}>📅 Recomendación</div>
              <div style={{ fontSize:12, color:'#a07020', lineHeight:1.6 }}>
                Hacé un backup <strong>una vez por semana</strong> y guardalo en Google Drive en una carpeta "Backups Matilda". Nombrá cada archivo con la fecha para tener historial.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modales edición */}
      {editCli && (
        <Modal title="Editar cliente" onClose={()=>setEditCli(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div><Label>Nombre</Label><input style={S.input} value={editCli.nombre} onChange={e=>setEditCli(p=>({...p,nombre:e.target.value}))}/></div>
            <div><Label>RUC</Label><input style={S.input} value={editCli.ruc||''} onChange={e=>setEditCli(p=>({...p,ruc:e.target.value}))}/></div>
            <div><Label>Contacto</Label><input style={S.input} value={editCli.contacto||''} onChange={e=>setEditCli(p=>({...p,contacto:e.target.value}))}/></div>
            <div><Label>Teléfono</Label><input style={S.input} value={editCli.telefono||''} onChange={e=>setEditCli(p=>({...p,telefono:e.target.value}))}/></div>
            <div><Label>Email</Label><input style={S.input} value={editCli.email||''} onChange={e=>setEditCli(p=>({...p,email:e.target.value}))}/></div>
            <div>
              <Label>Fee agencia (%)</Label>
              <input type="number" step="0.1" min="0" style={S.input} value={editCli.fee_agencia||0} onChange={e=>setEditCli(p=>({...p,fee_agencia:parseFloat(e.target.value)||0}))}/>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10, paddingTop:8 }}>
              <input type="checkbox" id="bco_edit" checked={!!editCli.bco_aplica} onChange={e=>setEditCli(p=>({...p,bco_aplica:e.target.checked}))} style={{ width:16, height:16, cursor:'pointer' }}/>
              <label htmlFor="bco_edit" style={{ fontSize:13, cursor:'pointer', color:'#333' }}>Aplica BCO</label>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
              <button style={S.btnSecondary} onClick={()=>setEditCli(null)}>Cancelar</button>
              <button style={S.btnPrimary} onClick={updateCli}>Guardar</button>
            </div>
          </div>
        </Modal>
      )}

      {editEjec && (
        <Modal title="Editar ejecutivo" onClose={()=>setEditEjec(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div><Label>Nombre</Label><input style={S.input} value={editEjec.nombre} onChange={e=>setEditEjec(p=>({...p,nombre:e.target.value}))}/></div>
            <div><Label>Cargo</Label><input style={S.input} value={editEjec.cargo||''} onChange={e=>setEditEjec(p=>({...p,cargo:e.target.value}))}/></div>
            <div><Label>Email</Label><input style={S.input} type="email" value={editEjec.email||''} onChange={e=>setEditEjec(p=>({...p,email:e.target.value}))}/></div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
              <button style={S.btnSecondary} onClick={()=>setEditEjec(null)}>Cancelar</button>
              <button style={S.btnPrimary} onClick={updateEjec}>Guardar</button>
            </div>
          </div>
        </Modal>
      )}

      <Toast msg={toast}/>
    </div>
  );
}
