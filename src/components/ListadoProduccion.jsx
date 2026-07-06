import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

const S = {
  inp: { fontFamily:'inherit', fontSize:13, padding:'7px 10px', border:'1px solid #ddd', borderRadius:7, outline:'none', width:'100%' },
  btn: { padding:'7px 14px', borderRadius:8, border:'none', fontFamily:'inherit', fontSize:13, fontWeight:600, cursor:'pointer' },
  th: { padding:'9px 12px', fontSize:11, fontWeight:700, color:'#5a7a9a', textTransform:'uppercase', letterSpacing:.5, textAlign:'left', background:'#f0f4f8', borderBottom:'2px solid #dde6ef' },
  td: { padding:'8px 10px', fontSize:13, borderBottom:'1px solid #eef2f7', verticalAlign:'middle' },
};

export default function ListadoProduccion({ briefId, briefNombre, clienteNombre }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFor, setUploadingFor] = useState(null);

  const emptyItem = () => ({ id: null, brief_id: briefId, nombre: '', medida: '', cantidad: 1, imagen_url: '', notas: '', _new: true });

  useEffect(() => { load(); }, [briefId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('listado_produccion').select('*').eq('brief_id', briefId).order('orden').order('created_at');
    setItems([...(data || []), emptyItem()]);
    setLoading(false);
  }

  function updItem(idx, k, v) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [k]: v } : it));
  }

  async function saveItem(idx) {
    const it = items[idx];
    if (!it.nombre.trim()) return; // No guardar filas vacías
    const payload = { brief_id: briefId, nombre: it.nombre, medida: it.medida, cantidad: Number(it.cantidad) || 1, imagen_url: it.imagen_url, notas: it.notas };
    if (it._new || !it.id) {
      const { data } = await supabase.from('listado_produccion').insert(payload).select().single();
      if (data) {
        setItems(prev => {
          const next = [...prev];
          next[idx] = { ...data };
          // Agregar nueva fila vacía al final si la última no lo es
          if (idx === next.length - 1) next.push(emptyItem());
          return next;
        });
      }
    } else {
      await supabase.from('listado_produccion').update(payload).eq('id', it.id);
    }
  }

  async function deleteItem(idx) {
    const it = items[idx];
    if (it.id) await supabase.from('listado_produccion').delete().eq('id', it.id);
    setItems(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (!next.some(x => x._new || !x.id)) next.push(emptyItem());
      return next;
    });
  }

  async function uploadImagen(idx, file) {
    setUploadingFor(idx);
    const ext = file.name.split('.').pop();
    const fileName = `${briefId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('listado-produccion').upload(fileName, file);
    if (error) { alert('Error: ' + error.message); setUploadingFor(null); return; }
    const { data: urlData } = supabase.storage.from('listado-produccion').getPublicUrl(fileName);
    updItem(idx, 'imagen_url', urlData.publicUrl);
    // Guardar automáticamente si el item ya tiene nombre
    const it = items[idx];
    if (it.nombre.trim()) await saveItem(idx);
    setUploadingFor(null);
  }

  function descargarExcel() {
    const data = items.filter(it => it.nombre.trim()).map((it, i) => ({
      '#': i + 1,
      'Nombre / Elemento': it.nombre,
      'Medida': it.medida || '—',
      'Cantidad': it.cantidad || 1,
      'Notas / Referencia': it.notas || '',
      'Imagen URL': it.imagen_url || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([]);

    // Header de proyecto
    XLSX.utils.sheet_add_aoa(ws, [
      [`LISTADO DE PRODUCCIÓN — ${(briefNombre || '').toUpperCase()}`],
      [`Cliente: ${clienteNombre || ''}`, '', `Fecha: ${new Date().toLocaleDateString('es-EC')}`],
      [],
    ]);

    // Headers de columnas
    const headers = ['#', 'Nombre / Elemento', 'Medida', 'Cantidad', 'Notas / Referencia', 'Imagen URL'];
    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: 'A4' });

    // Datos
    data.forEach((row, i) => {
      XLSX.utils.sheet_add_aoa(ws, [[row['#'], row['Nombre / Elemento'], row['Medida'], row['Cantidad'], row['Notas / Referencia'], row['Imagen URL']]], { origin: `A${5 + i}` });
    });

    // Ancho de columnas
    ws['!cols'] = [{ wch: 4 }, { wch: 35 }, { wch: 18 }, { wch: 10 }, { wch: 40 }, { wch: 50 }];

    // Merge del título
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];

    XLSX.utils.book_append_sheet(wb, ws, 'Listado');
    XLSX.writeFile(wb, `Listado_Produccion_${(briefNombre || 'brief').replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
  }

  const itemsReales = items.filter(it => it.nombre.trim());

  if (loading) return <div style={{ padding:'2rem', textAlign:'center', color:'#888' }}>Cargando listado…</div>;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:'#0d3b5e' }}>Listado de producción</div>
          <div style={{ fontSize:12, color:'#8aa0b8', marginTop:2 }}>{itemsReales.length} elemento{itemsReales.length !== 1 ? 's' : ''} · Hacé clic en cualquier celda para editar, Tab para avanzar</div>
        </div>
        <button onClick={descargarExcel} disabled={itemsReales.length === 0}
          style={{ ...S.btn, background: itemsReales.length > 0 ? '#2e8b4e' : '#ccc', color:'#fff' }}>
          📥 Descargar Excel
        </button>
      </div>

      <div style={{ overflowX:'auto', border:'1px solid #dde6ef', borderRadius:10, background:'#fff' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
          <thead>
            <tr>
              <th style={{ ...S.th, width:32 }}>#</th>
              <th style={{ ...S.th, width:'30%' }}>Nombre / Elemento *</th>
              <th style={{ ...S.th, width:'15%' }}>Medida</th>
              <th style={{ ...S.th, width:80 }}>Cantidad</th>
              <th style={{ ...S.th }}>Notas / Referencia</th>
              <th style={{ ...S.th, width:110 }}>Imagen</th>
              <th style={{ ...S.th, width:40 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                <td style={{ ...S.td, color:'#8aa0b8', textAlign:'center', fontSize:12 }}>{it.nombre.trim() ? idx + 1 : '+'}</td>
                <td style={S.td}>
                  <input
                    style={{ ...S.inp, fontWeight: it.nombre ? 600 : 400 }}
                    value={it.nombre}
                    onChange={e => updItem(idx, 'nombre', e.target.value)}
                    onBlur={() => saveItem(idx)}
                    placeholder={idx === items.length - 1 ? 'Agregar elemento...' : ''}
                  />
                </td>
                <td style={S.td}>
                  <input
                    style={S.inp}
                    value={it.medida}
                    onChange={e => updItem(idx, 'medida', e.target.value)}
                    onBlur={() => saveItem(idx)}
                    placeholder="Ej: 2m x 1m"
                  />
                </td>
                <td style={S.td}>
                  <input
                    type="number" min={1}
                    style={{ ...S.inp, textAlign:'center' }}
                    value={it.cantidad}
                    onChange={e => updItem(idx, 'cantidad', e.target.value)}
                    onBlur={() => saveItem(idx)}
                  />
                </td>
                <td style={S.td}>
                  <input
                    style={S.inp}
                    value={it.notas}
                    onChange={e => updItem(idx, 'notas', e.target.value)}
                    onBlur={() => saveItem(idx)}
                    placeholder="Notas, materiales, referencia..."
                  />
                </td>
                <td style={{ ...S.td, textAlign:'center' }}>
                  {it.imagen_url ? (
                    <div style={{ position:'relative', display:'inline-block' }}>
                      <img src={it.imagen_url} alt="" style={{ width:52, height:52, objectFit:'cover', borderRadius:6, border:'1px solid #ddd' }}/>
                      <label style={{ position:'absolute', bottom:-4, right:-4, width:20, height:20, borderRadius:'50%', background:'#0d3b5e', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                        <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => { const f=e.target.files[0]; if(f) uploadImagen(idx, f); }}/>
                        <span style={{ color:'#fff', fontSize:11 }}>↑</span>
                      </label>
                    </div>
                  ) : (
                    <label style={{ cursor:'pointer', display:'inline-block', padding:'4px 8px', borderRadius:6, border:'1px dashed #c8d4e0', fontSize:11, color:'#8aa0b8' }}>
                      <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => { const f=e.target.files[0]; if(f) uploadImagen(idx, f); }}/>
                      {uploadingFor === idx ? '⏳' : '📷'}
                    </label>
                  )}
                </td>
                <td style={{ ...S.td, textAlign:'center' }}>
                  {(it.id || it.nombre.trim()) && (
                    <button onClick={() => deleteItem(idx)}
                      style={{ background:'none', border:'none', color:'#c8264a', cursor:'pointer', fontSize:16, padding:4 }}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {itemsReales.length === 0 && (
        <div style={{ textAlign:'center', padding:'24px', color:'#8aa0b8', fontSize:13 }}>
          Empezá escribiendo en la primera fila de la tabla
        </div>
      )}
    </div>
  );
}
