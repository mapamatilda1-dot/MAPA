// ============================================================
// MATILDA HUB — Roles y permisos unificados
// ============================================================

export const ROLES = {
  admin:      'admin',
  ventas:     'ventas',
  creativo:   'creativo',
  produccion: 'produccion',
  financiero: 'financiero',
};

export const ROLES_LABELS = {
  admin:      'Admin',
  ventas:     'Ventas',
  creativo:   'Creativo',
  produccion: 'Producción',
  financiero: 'Financiero',
};

// ─── Navegación disponible por rol ───────────────────────────
export function getNavTabs(role) {
  const tabs = {
    crm:             ['admin', 'ventas'],
    briefs:          ['admin', 'ventas', 'creativo', 'produccion', 'financiero'],
    propuestas:      ['admin', 'ventas', 'creativo', 'produccion'],
    presupuestos:    ['admin', 'produccion', 'financiero'],
    liquidaciones:   ['admin', 'produccion', 'financiero'],
    calendario:      ['admin', 'ventas', 'creativo', 'produccion', 'financiero'],
    implementaciones:['admin', 'produccion', 'financiero'],
    admin_panel:     ['admin'],
  };
  return Object.entries(tabs)
    .filter(([, roles]) => roles.includes(role))
    .map(([tab]) => tab);
}

// ─── Clientes ─────────────────────────────────────────────────
export function canViewClientes(role) {
  return ['admin', 'ventas', 'produccion', 'financiero'].includes(role);
}
export function canEditClientes(role) {
  return ['admin', 'ventas'].includes(role);
}

// ─── CRM / Contactos ──────────────────────────────────────────
export function canViewCRM(role) {
  return ['admin', 'ventas'].includes(role);
}
export function canEditCRM(role) {
  return ['admin', 'ventas'].includes(role);
}

// ─── Briefs ───────────────────────────────────────────────────
export function canViewBriefs(role) {
  return true; // todos los roles ven briefs
}
export function canCreateBrief(role) {
  return ['admin', 'ventas', 'creativo', 'produccion'].includes(role);
}
export function canEditBrief(role) {
  return ['admin', 'ventas', 'creativo', 'produccion'].includes(role);
}
export function canDeleteBrief(role) {
  return role === 'admin';
}

// ─── Propuestas creativas ─────────────────────────────────────
export function canViewPropuestas(role) {
  return ['admin', 'ventas', 'creativo', 'produccion'].includes(role);
}
export function canCreatePropuesta(role) {
  return ['admin', 'creativo', 'produccion'].includes(role);
}
export function canEditPropuesta(role) {
  return ['admin', 'creativo', 'produccion'].includes(role);
}

// ─── Presupuestos ─────────────────────────────────────────────
// Estados que solo financiero/admin pueden asignar
const ESTADOS_FINANCIERO = ['pendiente_facturar', 'facturado'];
// Estados que bloquean edición
const ESTADOS_BLOQUEADOS_PPTO = ['facturado'];

export function canViewPresupuestos(role) {
  // Producción ve valores completos (cliente + costo) porque ellos cotizan
  return ['admin', 'produccion', 'financiero'].includes(role);
}
export function canViewCostosReales(role) {
  // Producción y financiero/admin ven costos reales
  return ['admin', 'produccion', 'financiero'].includes(role);
}
export function canCreatePresupuesto(role) {
  return ['admin', 'produccion'].includes(role);
}
export function canEditPpto(role, estadoActual) {
  if (role === 'admin') return true;
  if (role === 'produccion') return !ESTADOS_BLOQUEADOS_PPTO.includes(estadoActual);
  return false;
}
export function canChangeEstadoPpto(role, nuevoEstado) {
  if (role === 'admin') return true;
  if (ESTADOS_FINANCIERO.includes(nuevoEstado)) return role === 'financiero';
  if (role === 'produccion') return true;
  return false;
}
export function canApproveCostoReal(role) {
  return ['admin', 'financiero', 'produccion'].includes(role);
}
export function canEditBcoReal(role) {
  return ['admin', 'financiero', 'produccion'].includes(role);
}
export function canMarkEjecutado(role) {
  return ['admin', 'produccion', 'financiero'].includes(role);
}

// ─── Liquidaciones ────────────────────────────────────────────
const ESTADOS_BLOQUEADOS_LIQ = ['liquidado'];

export function canViewLiquidaciones(role) {
  return ['admin', 'produccion', 'financiero'].includes(role);
}
export function canEditLiq(role, estadoActual) {
  if (role === 'admin') return true;
  if (role === 'produccion') return !ESTADOS_BLOQUEADOS_LIQ.includes(estadoActual);
  return false;
}
export function canChangeLiqToLiquidado(role) {
  return ['admin', 'financiero'].includes(role);
}

// ─── Calendario ───────────────────────────────────────────────
// Todos ven el calendario (briefs, propuestas, implementaciones)
export function canViewCalendario(role) {
  return true;
}

// ─── Implementaciones ─────────────────────────────────────────
export function canViewImplementaciones(role) {
  return ['admin', 'produccion', 'financiero'].includes(role);
}
export function canEditImplementaciones(role) {
  return ['admin', 'produccion'].includes(role);
}

// ─── Admin panel ──────────────────────────────────────────────
export function canAccessAdmin(role) {
  return role === 'admin';
}

// ─── Estados de presupuesto (compatibilidad con código existente)
export const ESTADOS_PPTO = [
  'borrador', 'enviado_cliente', 'aprobado',
  'pendiente_facturar', 'facturado', 'cancelado',
];
export const ESTADOS_PPTO_LABELS = {
  borrador:           'Borrador',
  enviado_cliente:    'Enviado a cliente',
  aprobado:           'Aprobado',
  pendiente_facturar: 'Pendiente facturar',
  facturado:          'Facturado',
  cancelado:          'Cancelado',
};
export const ESTADOS_PPTO_COLORS = {
  borrador:           '#8aa0b8',
  enviado_cliente:    '#0d3b5e',
  aprobado:           '#3dbfb8',
  pendiente_facturar: '#e8a020',
  facturado:          '#2e8b4e',
  cancelado:          '#c8264a',
};

export const ESTADOS_LIQ        = ['abierta', 'enviada', 'liquidado'];
export const ESTADOS_LIQ_LABELS = { abierta: 'Abierta', enviada: 'Enviada', liquidado: 'Liquidado' };

export const ESTADOS_BRIEF = ['pendiente', 'en_progreso', 'con_cambios', 'entregado'];
export const ESTADOS_BRIEF_LABELS = {
  pendiente:   'Pendiente',
  en_progreso: 'En progreso',
  con_cambios: 'Con cambios',
  entregado:   'Entregado',
};
export const ESTADOS_BRIEF_COLORS = {
  pendiente:   '#8aa0b8',
  en_progreso: '#e8a020',
  con_cambios: '#c8264a',
  entregado:   '#2e8b4e',
};

export const ESTADOS_PROPUESTA = ['borrador', 'enviada', 'aprobada', 'rechazada'];
export const ESTADOS_PROPUESTA_LABELS = {
  borrador:  'Borrador',
  enviada:   'Enviada',
  aprobada:  'Aprobada',
  rechazada: 'Rechazada',
};
export const ESTADOS_PROPUESTA_COLORS = {
  borrador:  '#8aa0b8',
  enviada:   '#0d3b5e',
  aprobada:  '#2e8b4e',
  rechazada: '#c8264a',
};

// ─── Categorías de liquidación ────────────────────────────────
export const CATS_LIQUIDACION = [
  'Alimentación e Hidratación',
  'Materiales / Suministros',
  'Hospedaje',
  'Movilización / Combustible / Transporte',
  'No deducible',
];
