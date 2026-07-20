import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Content-Type': 'application/json' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) throw new Error('No autenticado');

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verificar que quien llama esté logueado y sea admin — esto evita que
    // cualquiera con la clave pública (anon) pueda gestionar usuarios.
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) throw new Error('Sesión inválida');
    if (userData.user.user_metadata?.role !== 'admin') throw new Error('Solo un administrador puede gestionar usuarios');

    const { action, email, password, role, userId } = await req.json();

    if (action === 'list') {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (error) throw error;
      const usuarios = (data?.users || [])
        .map(u => ({ id: u.id, email: u.email, role: u.user_metadata?.role || '', created_at: u.created_at }))
        .sort((a, b) => (a.email || '').localeCompare(b.email || ''));
      return new Response(JSON.stringify({ usuarios }), { headers: CORS });
    }

    if (action === 'create') {
      if (!email || !password) throw new Error('Email y contraseña requeridos');
      const { error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { role: role || 'ventas' },
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: CORS });
    }

    if (action === 'updateRole') {
      if (!userId || !role) throw new Error('Falta userId o role');
      const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: { role } });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: CORS });
    }

    if (action === 'delete') {
      if (!userId) throw new Error('Falta userId');
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: CORS });
    }

    throw new Error('Acción no reconocida: ' + action);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 400, headers: CORS });
  }
});
