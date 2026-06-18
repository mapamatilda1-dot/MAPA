import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import LiquidacionesCore from './Liquidaciones';

export default function LiquidacionesTab({ userRole, userEmail }) {
  const [pptos, setPptos] = useState([]);

  useEffect(() => {
    supabase.from('presupuestos').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setPptos(data); });
  }, []);

  return <LiquidacionesCore presupuestos={pptos} userRole={userRole} userEmail={userEmail} />;
}
