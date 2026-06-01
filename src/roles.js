// ============================================================
// MATILDA HUB — Roles y permisos unificados v2
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
    proformas:       ['admin', 'produccion'],
    presupuestos:    ['admin', 'produccion', 'financiero'],
    solicitudes:     ['admin', 'produccion', 'financiero'],
    liquidaciones:   ['admin', 'produccion', 'financiero'],
    calendario:      ['admin', 'ventas', 'creativo', 'produccion', 'financiero'],
    implementaciones:['admin', 'produccion', 'financiero'],
    dashboard:       ['admin', 'financiero'],
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
export function canViewCRM(role)  { return ['admin', 'ventas'].includes(role); }
export function canEditCRM(role)  { return ['admin', 'ventas'].includes(role); }

// ─── Briefs ───────────────────────────────────────────────────
export function canViewBriefs(role)   { return true; }
export function canCreateBrief(role)  { return ['admin', 'ventas', 'creativo', 'produccion'].includes(role); }
export function canEditBrief(role)    { return ['admin', 'ventas', 'creativo', 'produccion'].includes(role); }
export function canDeleteBrief(role)  { return role === 'admin'; }

// ─── Propuestas creativas ─────────────────────────────────────
export function canViewPropuestas(role)   { return ['admin', 'ventas', 'creativo', 'produccion'].includes(role); }
export function canCreatePropuesta(role)  { return ['admin', 'creativo', 'produccion'].includes(role); }
export function canEditPropuesta(role)    { return ['admin', 'creativo', 'produccion'].includes(role); }

// ─── Presupuestos ─────────────────────────────────────────────
// Ventas NO tiene acceso a presupuestos
const ESTADOS_BLOQUEADOS_PPTO = ['facturado'];

export function canViewPresupuestos(role) {
  return ['admin', 'produccion', 'financiero'].includes(role);
}
export function canViewCostosReales(role) {
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
  const soloFinanciero = ['pendiente_facturar', 'facturado'];
  if (soloFinanciero.includes(nuevoEstado)) return role === 'financiero';
  // Solo admin puede mover a aprobacion_majo y enviado_cliente
  const soloAdmin = ['aprobacion_majo', 'enviado_cliente'];
  if (soloAdmin.includes(nuevoEstado)) return false;
  return ['produccion', 'financiero'].includes(role);
}
export function canApproveCostoReal(role)  { return ['admin', 'financiero', 'produccion'].includes(role); }
export function canEditBcoReal(role)       { return ['admin', 'financiero', 'produccion'].includes(role); }
export function canMarkEjecutado(role)     { return ['admin', 'produccion', 'financiero'].includes(role); }
export function canMarkCerradoProduccion(role) { return ['admin', 'produccion'].includes(role); }

// PDF y Excel — Producción NO puede bajar PDF financiero ni Excel
export function canDownloadPdfFinanciero(role) { return ['admin', 'financiero'].includes(role); }
export function canDownloadExcel(role)          { return ['admin', 'financiero'].includes(role); }
export function canDownloadPdfCliente(role)     { return ['admin', 'produccion', 'financiero'].includes(role); }

// ─── Solicitudes ──────────────────────────────────────────────
export function canViewSolicitudes(role)   { return ['admin', 'produccion', 'financiero'].includes(role); }
export function canCreateSolicitud(role)   { return ['admin', 'produccion'].includes(role); }
export function canAprobarSolicitud(role)  { return ['admin', 'financiero'].includes(role); }

// ─── Liquidaciones ────────────────────────────────────────────
const ESTADOS_BLOQUEADOS_LIQ = ['liquidado'];
export function canViewLiquidaciones(role)  { return ['admin', 'produccion', 'financiero'].includes(role); }
export function canEditLiq(role, estadoActual) {
  if (role === 'admin') return true;
  if (role === 'produccion') return !ESTADOS_BLOQUEADOS_LIQ.includes(estadoActual);
  return false;
}
export function canChangeLiqToLiquidado(role) { return ['admin', 'financiero'].includes(role); }

// ─── Calendario ───────────────────────────────────────────────
export function canViewCalendario(role) { return true; }

// ─── Implementaciones ─────────────────────────────────────────
export function canViewImplementaciones(role)  { return ['admin', 'produccion', 'financiero'].includes(role); }
export function canEditImplementaciones(role)  { return ['admin', 'produccion'].includes(role); }

// ─── Dashboard ────────────────────────────────────────────────
export function canViewDashboard(role) { return ['admin', 'financiero'].includes(role); }

// ─── Admin panel ──────────────────────────────────────────────
export function canAccessAdmin(role) { return role === 'admin'; }

// ─── Estados de presupuesto ───────────────────────────────────
export const ESTADOS_PPTO = [
  'borrador',
  'revision_mel',
  'aprobacion_majo',
  'enviado_cliente',
  'aprobado',
  'pendiente_facturar',
  'facturado',
  'cancelado',
];
export const ESTADOS_PPTO_LABELS = {
  borrador:           'Borrador',
  revision_mel:       'Revisión MEL',
  aprobacion_majo:    'Aprobación Majo',
  enviado_cliente:    'Enviado a cliente',
  aprobado:           'Aprobado',
  pendiente_facturar: 'Pendiente facturar',
  facturado:          'Facturado',
  cancelado:          'Cancelado',
};
export const ESTADOS_PPTO_COLORS = {
  borrador:           '#8aa0b8',
  revision_mel:       '#7c3aed',
  aprobacion_majo:    '#d97706',
  enviado_cliente:    '#0d3b5e',
  aprobado:           '#3dbfb8',
  pendiente_facturar: '#e8a020',
  facturado:          '#2e8b4e',
  cancelado:          '#c8264a',
};

// Botón de flujo en vista previa
export function getFlujoBtnLabel(estado) {
  switch (estado) {
    case 'borrador':        return 'Enviar para revisión MEL';
    case 'revision_mel':    return 'Enviar para aprobación Majo';
    case 'aprobacion_majo': return 'Cambiar estado a Enviado al cliente';
    case 'enviado_cliente': return 'Marcar como Aprobado';
    default: return null;
  }
}
export function getFlujoBtnNextEstado(estado) {
  switch (estado) {
    case 'borrador':        return 'revision_mel';
    case 'revision_mel':    return 'aprobacion_majo';
    case 'aprobacion_majo': return 'enviado_cliente';
    case 'enviado_cliente': return 'aprobado';
    default: return null;
  }
}

export const ESTADOS_LIQ        = ['abierta', 'enviada', 'liquidado'];
export const ESTADOS_LIQ_LABELS = { abierta:'Abierta', enviada:'Enviada', liquidado:'Liquidado' };

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

// ─── Fee y BCO por cliente ────────────────────────────────────
// fee_agencia en %, bco_aplica true/false
export const FEE_POR_CLIENTE = {
  'TESALIA':             { fee: 7,  bco: true  },
  'LA FABRIL':           { fee: 0,  bco: false },
  'HOLCIM':              { fee: 0,  bco: true  },
  'DISENSA':             { fee: 0,  bco: true  },
  'NUTRICIA':            { fee: 12, bco: false },
  'CERVECERIA NACIONAL': { fee: 10, bco: true  },
  'BIMBO':               { fee: 0,  bco: false },
  'ESPOL':               { fee: 13, bco: false },
};

export function getFeeForCliente(nombreCliente) {
  if (!nombreCliente) return null;
  const upper = nombreCliente.toUpperCase();
  for (const [key, val] of Object.entries(FEE_POR_CLIENTE)) {
    if (upper.includes(key)) return val;
  }
  return null;
}

// ─── Categorías de liquidación ────────────────────────────────
export const CATS_LIQUIDACION = [
  'Alimentación e Hidratación',
  'Materiales / Suministros',
  'Hospedaje',
  'Movilización / Combustible / Transporte',
  'No deducible',
];

