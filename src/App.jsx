import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { getNavTabs, ROLES_LABELS, canAccessAdmin } from './roles';
import Login from './components/Login';
import CRM from './components/CRM';
import Briefs from './components/Briefs';
import Propuestas from './components/Propuestas';
import Calendario from './components/Calendario';
import Presupuestos from './components/Presupuestos';
import LiquidacionesTab from './components/LiquidacionesTab';
import Implementaciones from './components/Implementaciones';
import AdminPanel from './components/AdminPanel';
import Proformas from './components/Proformas';
import Solicitudes from './components/Solicitudes';
import Dashboard from './components/Dashboard';

// Placeholders — se reemplazarán en las fases siguientes
const Placeholder = ({ nombre }) => (
  <div style={{ padding: '2rem', color: '#888', fontSize: 15, textAlign: 'center' }}>
    <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
    <div style={{ fontWeight: 500 }}>{nombre}</div>
    <div style={{ fontSize: 13, marginTop: 6 }}>En construcción — Fase siguiente</div>
  </div>
);

// Tab labels y orden visual
const TAB_CONFIG = {
  crm:              { label: 'CRM',            icon: '◎' },
  briefs:           { label: 'Proyectos',       icon: '◇' },
  propuestas:       { label: 'Propuestas',      icon: '◈' },
  proformas:        { label: 'Proformas',       icon: '📋' },
  presupuestos:     { label: 'Presupuestos',    icon: '💰' },
  solicitudes:      { label: 'Solicitudes',     icon: '📤' },
  liquidaciones:    { label: 'Liquidaciones',   icon: '🧾' },
  calendario:       { label: 'Calendario',      icon: '📅' },
  implementaciones: { label: 'Implementac.',    icon: '⚙️' },
  dashboard:        { label: 'Dashboard',       icon: '📊' },
  admin_panel:      { label: 'Admin',           icon: '⚙' },
};

export default function App() {
  const [session, setSession]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Cuando cambia el usuario, setear tab inicial según su rol
  useEffect(() => {
    if (!session) { setActiveTab(null); return; }
    const role = session.user?.user_metadata?.role || 'produccion';
    const tabs = getNavTabs(role);
    setActiveTab(role === 'admin' ? 'calendario' : (tabs[0] || 'briefs'));
  }, [session?.user?.id]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
      Cargando...
    </div>
  );

  if (!session) return <Login />;

  const role     = session.user?.user_metadata?.role || 'produccion';
  const email    = session.user?.email || '';
  const initials = email.slice(0, 2).toUpperCase();
  const tabs     = getNavTabs(role);

  async function logout() {
    await supabase.auth.signOut();
  }

  function renderContent() {
    switch (activeTab) {
      case 'crm':              return <CRM userRole={role} />;
      case 'briefs':           return <Briefs userRole={role} userEmail={email} />;
      case 'propuestas':       return <Propuestas userRole={role} userEmail={email} />;
      case 'proformas':        return <Proformas userRole={role} userEmail={email} />;
      case 'presupuestos':     return <Presupuestos userRole={role} userEmail={email} logoUrl={null} onNavigate={tab=>setActiveTab(tab)} />;
      case 'solicitudes':      return <Solicitudes userRole={role} userEmail={email} userName={email.split('@')[0]} />;
      case 'liquidaciones':    return <LiquidacionesTab userRole={role} />;
      case 'calendario':       return <Calendario />;
      case 'implementaciones': return <Implementaciones userRole={role} />;
      case 'dashboard':        return <Dashboard />;
      case 'admin_panel':      return <AdminPanel />;
      default:                 return <Placeholder nombre="Seleccioná una sección" />;
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f4f0' }}>
      {/* Header */}
      <header style={{
        background: '#0d3b5e', color: '#fff',
        display: 'flex', alignItems: 'center',
        padding: '0 1.5rem', height: 52, gap: 12,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#0d3b5e',
          }}>M</div>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.01em' }}>
            Matilda Hub
          </span>
        </div>

        {/* Rol badge */}
        <div style={{
          background: 'rgba(255,255,255,0.15)', borderRadius: 20,
          padding: '3px 10px', fontSize: 11, fontWeight: 500,
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}>
          {ROLES_LABELS[role] || role}
        </div>

        {/* User chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 500,
          }}>{initials}</div>
          <span style={{ fontSize: 12, opacity: 0.85 }}>{email}</span>
        </div>

        <button onClick={logout} style={{
          background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
          color: '#fff', borderRadius: 7, padding: '4px 12px',
          fontSize: 12, cursor: 'pointer',
        }}>
          Salir
        </button>
      </header>

      {/* Navigation */}
      <nav style={{
        background: '#fff', borderBottom: '1px solid #e8e8e8',
        display: 'flex', padding: '0 1.5rem', overflowX: 'auto',
        gap: 2,
      }}>
        {tabs.map(tab => {
          const cfg = TAB_CONFIG[tab] || { label: tab, icon: '' };
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '12px 14px', background: 'transparent',
                border: 'none', borderBottom: isActive ? '2px solid #0d3b5e' : '2px solid transparent',
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                color: isActive ? '#0d3b5e' : '#666',
                cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'color .15s, border-color .15s',
              }}
            >
              <span style={{ fontSize: 13 }}>{cfg.icon}</span>
              {cfg.label}
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <main style={{ flex: 1, padding: '1.5rem', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        {renderContent()}
      </main>
    </div>
  );
}
