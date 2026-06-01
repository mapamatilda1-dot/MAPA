-- ============================================================
-- MATILDA HUB — Schema unificado v1
-- Ejecutar completo en Supabase > SQL Editor > New query
-- ============================================================
-- Este schema reemplaza los schemas anteriores de presupuestos
-- y gestor de proyectos. Corre todo de una vez en un proyecto
-- Supabase nuevo (o el mismo del sistema de presupuestos).
-- ============================================================


-- ============================================================
-- 0. FUNCIÓN updated_at (compartida por todas las tablas)
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ============================================================
-- 1. CONFIG (ajustes globales de presupuestos)
-- ============================================================
create table if not exists config (
  id          int primary key default 1,
  oh_pct      numeric default 15,
  bco_pct     numeric default 5.5,
  fee_agencia numeric default 5,
  rebate_pct  numeric default 2,
  updated_at  timestamptz default now()
);
insert into config (id) values (1) on conflict do nothing;


-- ============================================================
-- 2. CLIENTES (unificado — reemplaza Firebase + clientes de ppto)
-- ============================================================
create table if not exists clientes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  ruc         text default '',
  contacto    text default '',      -- nombre de la persona de contacto
  telefono    text default '',
  email       text default '',
  notas       text default '',
  activo      boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

drop trigger if exists trg_clientes on clientes;
create trigger trg_clientes
  before update on clientes
  for each row execute function update_updated_at();


-- ============================================================
-- 3. CONTACTOS CRM (historial de interacciones por cliente)
-- ============================================================
create table if not exists contactos_crm (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid references clientes(id) on delete cascade,
  tipo          text default 'Llamada',   -- Llamada | Email | Reunión | WhatsApp | Visita
  estado        text default 'Prospecto', -- Prospecto | En negociación | Propuesta enviada | Ganado | Perdido
  fecha         date not null,
  resultado     text default '',
  proximo_contacto date,
  evidencia     text default '',          -- URL o texto de evidencia
  validado      boolean default false,
  created_by    text default '',
  created_at    timestamptz default now()
);


-- ============================================================
-- 4. BRIEFS (= proyectos — eje central del flujo)
-- ============================================================
create table if not exists briefs (
  id              uuid primary key default gen_random_uuid(),
  -- Datos principales
  nombre          text not null,
  cliente_id      uuid references clientes(id) on delete set null,
  cliente_nombre  text default '',       -- desnormalizado para búsquedas rápidas
  tipo_evento     text default '',       -- corporativo | lanzamiento | fiesta | otro
  -- Fechas y lugar
  fecha_entrega   date,
  fecha_evento    date,
  ciudad          text default 'Guayaquil',
  lugar           text default '',
  horario         text default '',
  -- Detalle
  pax             integer default 0,
  dias_evento     integer default 1,
  descripcion     text default '',       -- objetivos, contexto, detalles
  notas           text default '',       -- notas internas del equipo
  -- Archivo adjunto (PDF / PPT subido a Supabase Storage)
  archivo_nombre  text default '',
  archivo_url     text default '',
  -- Estado del brief
  estado          text default 'pendiente', -- pendiente | en_progreso | con_cambios | entregado
  -- Responsable y seguimiento
  responsable     text default '',
  created_by      text default '',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

drop trigger if exists trg_briefs on briefs;
create trigger trg_briefs
  before update on briefs
  for each row execute function update_updated_at();


-- ============================================================
-- 5. PROPUESTAS CREATIVAS (vinculadas al brief)
-- ============================================================
create table if not exists propuestas (
  id              uuid primary key default gen_random_uuid(),
  brief_id        uuid references briefs(id) on delete cascade,
  cliente_id      uuid references clientes(id) on delete set null,
  cliente_nombre  text default '',
  -- Contenido
  titulo          text default '',
  canva_url       text default '',       -- link de Canva con la propuesta visual
  notas           text default '',       -- descripción, concepto, entregables en texto
  -- Estado
  estado          text default 'borrador', -- borrador | enviada | aprobada | rechazada
  -- Trazabilidad
  created_by      text default '',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

drop trigger if exists trg_propuestas on propuestas;
create trigger trg_propuestas
  before update on propuestas
  for each row execute function update_updated_at();


-- ============================================================
-- 6. CATEGORÍAS DE PRESUPUESTO
-- ============================================================
create table if not exists categorias (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique
);
insert into categorias (nombre) values
  ('PERSONAL'),('ESCENARIO'),('ALIMENTACION'),('INGRESOS'),('ACTIVIDADES'),
  ('FOYER'),('AMBIENTACION'),('FIESTA'),('LOGISTICA'),('CAMISETAS'),('OTROS')
on conflict do nothing;


-- ============================================================
-- 7. PRESUPUESTOS (extendido con brief_id y propuesta_id)
-- ============================================================
create table if not exists presupuestos (
  id              uuid primary key default gen_random_uuid(),
  -- Vínculos al flujo
  brief_id        uuid references briefs(id) on delete set null,
  propuesta_id    uuid references propuestas(id) on delete set null,
  cliente_id      uuid references clientes(id) on delete set null,
  -- Campos originales (compatibilidad total con código existente)
  nomenclatura    text default '',
  nombre          text default '',
  cliente         text default '',       -- nombre desnormalizado (legacy)
  fecha_evento    date,
  ciudad          text default 'Guayaquil',
  lugar           text default '',
  horario         text default '',
  personas        integer default 0,
  dias_evento     integer default 1,
  fee_agencia     numeric default 5,
  oh_pct          numeric default 15,
  bco_pct         numeric default 5.5,
  rebate_pct      numeric default 2,
  apply_rebate    boolean default false,
  estado          text default 'borrador',
  ejecutado       boolean default false,
  notas           text default '',
  items           jsonb default '[]'::jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

drop trigger if exists trg_ppto on presupuestos;
create trigger trg_ppto
  before update on presupuestos
  for each row execute function update_updated_at();


-- ============================================================
-- 8. LIQUIDACIONES
-- ============================================================
create table if not exists liquidaciones (
  id                  uuid primary key default gen_random_uuid(),
  presupuesto_id      uuid references presupuestos(id) on delete set null,
  presupuesto_nombre  text default '',
  evento              text default '',
  responsable         text default '',
  estado              text default 'abierta', -- abierta | enviada | liquidado
  notas               text default '',
  gastos              jsonb default '[]'::jsonb,
  comprobante_url     text default '',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

drop trigger if exists trg_liq on liquidaciones;
create trigger trg_liq
  before update on liquidaciones
  for each row execute function update_updated_at();


-- ============================================================
-- 9. EJECUTIVOS (equipo interno de Matilda)
-- ============================================================
create table if not exists ejecutivos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  email       text default '',
  cargo       text default '',
  created_at  timestamptz default now()
);


-- ============================================================
-- 10. IMPLEMENTACIONES (del gestor de proyectos)
-- ============================================================
create table if not exists implementaciones (
  id            uuid primary key default gen_random_uuid(),
  brief_id      uuid references briefs(id) on delete set null,
  nombre        text not null,
  cliente_id    uuid references clientes(id) on delete set null,
  cliente_nombre text default '',
  fecha_evento  date,
  lugar         text default '',
  responsable   text default '',
  estado        text default 'pendiente',
  notas         text default '',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

drop trigger if exists trg_impl on implementaciones;
create trigger trg_impl
  before update on implementaciones
  for each row execute function update_updated_at();


-- ============================================================
-- 11. ESTADOS PERSONALIZADOS DE BRIEFS
-- ============================================================
create table if not exists estados_brief (
  id       text primary key,
  label    text not null,
  position int default 0
);
insert into estados_brief (id, label, position) values
  ('pendiente',   'Pendiente',   0),
  ('en_progreso', 'En progreso', 1),
  ('con_cambios', 'Con cambios', 2),
  ('entregado',   'Entregado',   3)
on conflict (id) do nothing;


-- ============================================================
-- 12. ROW LEVEL SECURITY (acceso autenticado a todo)
-- ============================================================
alter table config          enable row level security;
alter table clientes        enable row level security;
alter table contactos_crm   enable row level security;
alter table briefs          enable row level security;
alter table propuestas      enable row level security;
alter table categorias      enable row level security;
alter table presupuestos    enable row level security;
alter table liquidaciones   enable row level security;
alter table ejecutivos      enable row level security;
alter table implementaciones enable row level security;
alter table estados_brief   enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='config'           and policyname='auth_all') then create policy auth_all on config           for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='clientes'         and policyname='auth_all') then create policy auth_all on clientes         for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='contactos_crm'    and policyname='auth_all') then create policy auth_all on contactos_crm    for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='briefs'           and policyname='auth_all') then create policy auth_all on briefs           for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='propuestas'       and policyname='auth_all') then create policy auth_all on propuestas       for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='categorias'       and policyname='auth_all') then create policy auth_all on categorias       for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='presupuestos'     and policyname='auth_all') then create policy auth_all on presupuestos     for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='liquidaciones'    and policyname='auth_all') then create policy auth_all on liquidaciones    for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='ejecutivos'       and policyname='auth_all') then create policy auth_all on ejecutivos       for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='implementaciones' and policyname='auth_all') then create policy auth_all on implementaciones for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='estados_brief'    and policyname='auth_all') then create policy auth_all on estados_brief    for all to authenticated using (true) with check (true); end if;
end $$;


-- ============================================================
-- 13. REALTIME
-- ============================================================
alter publication supabase_realtime add table clientes;
alter publication supabase_realtime add table contactos_crm;
alter publication supabase_realtime add table briefs;
alter publication supabase_realtime add table propuestas;
alter publication supabase_realtime add table presupuestos;
alter publication supabase_realtime add table liquidaciones;
alter publication supabase_realtime add table implementaciones;


-- ============================================================
-- 14. ASIGNAR ROL ADMIN AL PRIMER USUARIO
-- (ejecutar después de crear el usuario en Authentication)
-- Reemplazá el email por el tuyo
-- ============================================================
-- update auth.users
--   set raw_user_meta_data = raw_user_meta_data || '{"role":"admin"}'
--   where email = 'camille@matilda.agency';

-- Roles disponibles:
--   admin | ventas | creativo | produccion | financiero
--
-- Ejemplo para asignar rol ventas:
-- update auth.users
--   set raw_user_meta_data = raw_user_meta_data || '{"role":"ventas"}'
--   where email = 'usuario@matilda.agency';


select 'Matilda Hub schema v1 creado correctamente ✓' as resultado;
