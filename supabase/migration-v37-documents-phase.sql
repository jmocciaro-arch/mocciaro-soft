-- =====================================================================
-- MIGRATION v37 — FASE DOCUMENTOS COMERCIALES
-- Mocciaro Soft. Multiempresa, multi-moneda, trazable.
--
-- Depende de:  v35 (tt_companies + satélites), v36 (RLS + fn_user_has_company_access)
-- Prefijo:     tt_*
-- Idempotente: IF NOT EXISTS, DROP POLICY IF EXISTS, ON CONFLICT DO NOTHING
--
-- Contenido:
--   1. Tipos (ENUMS como CHECK con listas canónicas)
--   2. tt_documents              — cabecera
--   3. tt_document_lines         — líneas con snapshot de producto
--   4. tt_document_relations     — derivaciones y vínculos
--   5. tt_document_configs       — config por empresa + tipo
--   6. tt_document_numbering     — contadores atómicos
--   7. tt_document_events        — bitácora de trazabilidad
--   8. fn_next_document_number() — numeración concurrencia-safe
--   9. RLS endurecida para las 6 tablas
--  10. Seeds: configs default para las 4 empresas × tipos principales
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. PREREQUISITOS
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

-- Constantes canónicas de tipos de documento
--   quote            Cotización / Presupuesto
--   sales_order      Orden de venta
--   purchase_order   Orden de compra
--   delivery_note    Remito / Albarán
--   invoice          Factura
--   proforma         Factura proforma
--   receipt          Recibo de pago
--   internal         Documento interno (movimiento, nota)
--   credit_note      Nota de crédito
--   debit_note       Nota de débito

-- ---------------------------------------------------------------------
-- 1. tt_documents  — cabecera
-- ---------------------------------------------------------------------
create table if not exists tt_documents (
  id                uuid primary key default gen_random_uuid(),

  -- ámbito
  company_id        uuid not null references tt_companies(id) on delete restrict,
  doc_type          text not null check (doc_type in (
                      'quote','sales_order','purchase_order','delivery_note',
                      'invoice','proforma','receipt','internal',
                      'credit_note','debit_note')),
  direction         text not null check (direction in ('sales','purchase','internal')),

  -- identificación (se completa al emitir)
  doc_number        bigint,
  doc_year          int,
  doc_code          text,                  -- nombre humano renderizado
  doc_date          date not null default current_date,

  -- contraparte (polimórfica + snapshot; no FK dura a tt_clients/tt_suppliers
  -- para no acoplar al legacy)
  counterparty_type text check (counterparty_type in ('customer','supplier','internal','other')),
  counterparty_id   uuid,
  counterparty_name text,
  counterparty_tax_id text,
  counterparty_email text,
  counterparty_address text,

  -- moneda y totales
  currency_code     text not null,
  exchange_rate     numeric(20,8) not null default 1,
  subtotal          numeric(20,2) not null default 0,
  discount_total    numeric(20,2) not null default 0,
  tax_total         numeric(20,2) not null default 0,
  total             numeric(20,2) not null default 0,

  -- estado
  status            text not null default 'draft' check (status in (
                      'draft','issued','sent','accepted','rejected',
                      'partially_delivered','delivered',
                      'partially_invoiced','invoiced',
                      'paid','cancelled','voided')),

  -- fechas auxiliares
  valid_until       date,
  due_date          date,

  -- referencias libres
  external_ref      text,
  customer_po_number text,

  -- libres
  notes             text,
  internal_notes    text,
  metadata          jsonb not null default '{}'::jsonb,

  -- audit
  created_by        uuid references tt_users(id),
  created_at        timestamptz not null default now(),
  updated_by        uuid references tt_users(id),
  updated_at        timestamptz not null default now(),
  issued_at         timestamptz,
  cancelled_at      timestamptz,
  cancelled_reason  text,
  locked            boolean not null default false     -- true una vez emitido
);

create index if not exists idx_tt_documents_company_type on tt_documents(company_id, doc_type);
create index if not exists idx_tt_documents_status       on tt_documents(status);
create index if not exists idx_tt_documents_doc_date     on tt_documents(doc_date);
create index if not exists idx_tt_documents_counterparty on tt_documents(counterparty_type, counterparty_id);
create unique index if not exists uq_tt_documents_number
  on tt_documents(company_id, doc_type, doc_year, doc_number)
  where doc_number is not null;

-- ---------------------------------------------------------------------
-- 2. tt_document_lines  — líneas
-- ---------------------------------------------------------------------
create table if not exists tt_document_lines (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid not null references tt_documents(id) on delete cascade,
  line_number       int not null,

  -- producto (FK suave: sobrevive al borrado del producto vía snapshot)
  product_id        uuid,
  product_sku       text,
  product_name      text not null,
  description       text,

  -- cantidades
  quantity          numeric(20,4) not null check (quantity >= 0),
  unit              text not null default 'u',

  -- precios
  unit_price        numeric(20,4) not null default 0 check (unit_price >= 0),
  discount_pct      numeric(5,2)  not null default 0 check (discount_pct  between 0 and 100),
  discount_amount   numeric(20,2) not null default 0 check (discount_amount >= 0),

  -- impuestos
  tax_rate          numeric(5,2)  not null default 0 check (tax_rate >= 0),
  tax_amount        numeric(20,2) not null default 0 check (tax_amount >= 0),

  -- totales
  subtotal          numeric(20,2) not null default 0,
  total             numeric(20,2) not null default 0,

  -- atributos libres y media
  attributes        jsonb not null default '{}'::jsonb,
  image_url         text,
  notes             text,

  -- derivación
  source_line_id    uuid references tt_document_lines(id) on delete set null,
  quantity_delivered numeric(20,4) not null default 0,
  quantity_invoiced  numeric(20,4) not null default 0,

  created_at        timestamptz not null default now()
);

create index if not exists idx_tt_document_lines_doc    on tt_document_lines(document_id);
create index if not exists idx_tt_document_lines_prod   on tt_document_lines(product_id);
create index if not exists idx_tt_document_lines_source on tt_document_lines(source_line_id);
create unique index if not exists uq_tt_document_lines_order
  on tt_document_lines(document_id, line_number);

-- ---------------------------------------------------------------------
-- 3. tt_document_relations  — vínculos entre documentos
-- ---------------------------------------------------------------------
create table if not exists tt_document_relations (
  id                  uuid primary key default gen_random_uuid(),
  source_document_id  uuid not null references tt_documents(id) on delete restrict,
  target_document_id  uuid not null references tt_documents(id) on delete restrict,
  relation_type       text not null check (relation_type in (
                        'converted_to',    -- cotización → orden
                        'delivered_as',    -- orden → remito
                        'invoiced_as',     -- orden/remito → factura
                        'paid_by',         -- factura → recibo
                        'amended_by',      -- doc → nc/nd
                        'cancelled_by',    -- doc → cancelación formal
                        'copied_from',     -- duplicado
                        'split_into',      -- un doc que se partió
                        'merged_into')),   -- varios que se unificaron
  notes               text,
  created_by          uuid references tt_users(id),
  created_at          timestamptz not null default now(),
  unique (source_document_id, target_document_id, relation_type)
);

create index if not exists idx_tt_doc_rel_source on tt_document_relations(source_document_id);
create index if not exists idx_tt_doc_rel_target on tt_document_relations(target_document_id);

-- ---------------------------------------------------------------------
-- 4. tt_document_configs  — config por empresa + tipo
-- ---------------------------------------------------------------------
create table if not exists tt_document_configs (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references tt_companies(id) on delete cascade,
  doc_type              text not null check (doc_type in (
                          'quote','sales_order','purchase_order','delivery_note',
                          'invoice','proforma','receipt','internal',
                          'credit_note','debit_note')),

  -- motor de nombres
  name_template         text not null default '{date:YYYY} {date:MM} {date:DD} {type}-{prefix}.{year}.{number:6}',
  number_padding        int  not null default 6 check (number_padding between 1 and 12),
  reset_yearly          boolean not null default true,
  prefix_override       text,      -- null → usa tt_companies.code_prefix

  -- logo y branding
  logo_url              text,
  header_html           text,      -- snippet libre (se usará en futura fase PDF)
  footer_html           text,

  -- flags de visualización
  show_prices           boolean not null default true,
  show_images           boolean not null default false,
  show_attributes       boolean not null default true,
  show_taxes            boolean not null default true,
  show_notes            boolean not null default true,
  show_discounts        boolean not null default true,
  show_footer           boolean not null default true,
  show_payment_terms    boolean not null default true,

  -- firma y QR
  signature_url         text,
  signature_required    boolean not null default false,
  qr_enabled            boolean not null default false,
  qr_payload_template   text,      -- ej: '{doc_code}|{company_tax_id}|{total}|{currency}'

  -- plantillas de texto
  default_header_note   text,
  default_footer_note   text,
  terms_and_conditions  text,

  -- defaults operativos
  default_validity_days int,       -- para cotizaciones
  default_due_days      int,       -- para facturas

  metadata              jsonb not null default '{}'::jsonb,
  is_active             boolean not null default true,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (company_id, doc_type)
);

-- ---------------------------------------------------------------------
-- 5. tt_document_numbering  — contadores
-- ---------------------------------------------------------------------
create table if not exists tt_document_numbering (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references tt_companies(id) on delete cascade,
  doc_type    text not null check (doc_type in (
                'quote','sales_order','purchase_order','delivery_note',
                'invoice','proforma','receipt','internal',
                'credit_note','debit_note')),
  year        int  not null,      -- 0 cuando no hay reinicio anual
  last_number bigint not null default 0,
  updated_at  timestamptz not null default now(),
  unique (company_id, doc_type, year)
);

-- ---------------------------------------------------------------------
-- 6. tt_document_events  — bitácora
-- ---------------------------------------------------------------------
create table if not exists tt_document_events (
  id                  uuid primary key default gen_random_uuid(),
  document_id         uuid not null references tt_documents(id) on delete cascade,
  event_type          text not null,                       -- created, status_changed, line_added, line_updated, line_removed, issued, sent, accepted, rejected, derived_out, derived_in, cancelled, voided, numbered, email_sent, pdf_generated
  from_status         text,
  to_status           text,
  actor_id            uuid references tt_users(id),
  related_document_id uuid references tt_documents(id) on delete set null,
  payload             jsonb not null default '{}'::jsonb,
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_tt_document_events_doc     on tt_document_events(document_id, created_at desc);
create index if not exists idx_tt_document_events_type    on tt_document_events(event_type);
create index if not exists idx_tt_document_events_related on tt_document_events(related_document_id);

-- ---------------------------------------------------------------------
-- 7. fn_next_document_number  — concurrencia segura
-- ---------------------------------------------------------------------
create or replace function fn_next_document_number(
  p_company_id  uuid,
  p_doc_type    text,
  p_year        int default null,
  p_reset_yearly boolean default true
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int;
  v_next bigint;
begin
  v_year := coalesce(p_year, extract(year from current_date)::int);
  if not p_reset_yearly then
    v_year := 0;                               -- singleton cross-year
  end if;

  insert into tt_document_numbering as n
    (company_id, doc_type, year, last_number)
  values
    (p_company_id, p_doc_type, v_year, 1)
  on conflict (company_id, doc_type, year) do update
    set last_number = n.last_number + 1,
        updated_at  = now()
  returning n.last_number into v_next;

  return v_next;
end;
$$;

comment on function fn_next_document_number is
  'Incrementa y devuelve el próximo número correlativo. Atómico vía INSERT ... ON CONFLICT DO UPDATE. Si reset_yearly=false, usa year=0 como contador único.';

-- ---------------------------------------------------------------------
-- 8. RLS — policies usando helpers de v36
-- ---------------------------------------------------------------------
alter table tt_documents            enable row level security;
alter table tt_document_lines       enable row level security;
alter table tt_document_relations   enable row level security;
alter table tt_document_configs     enable row level security;
alter table tt_document_numbering   enable row level security;
alter table tt_document_events      enable row level security;

-- service_role: bypass total
drop policy if exists docs_service_all       on tt_documents;
drop policy if exists doclines_service_all   on tt_document_lines;
drop policy if exists docrel_service_all     on tt_document_relations;
drop policy if exists docconf_service_all    on tt_document_configs;
drop policy if exists docnum_service_all     on tt_document_numbering;
drop policy if exists docev_service_all      on tt_document_events;

create policy docs_service_all     on tt_documents            for all to service_role using (true) with check (true);
create policy doclines_service_all on tt_document_lines       for all to service_role using (true) with check (true);
create policy docrel_service_all   on tt_document_relations   for all to service_role using (true) with check (true);
create policy docconf_service_all  on tt_document_configs     for all to service_role using (true) with check (true);
create policy docnum_service_all   on tt_document_numbering   for all to service_role using (true) with check (true);
create policy docev_service_all    on tt_document_events      for all to service_role using (true) with check (true);

-- tt_documents
drop policy if exists docs_select on tt_documents;
drop policy if exists docs_insert on tt_documents;
drop policy if exists docs_update on tt_documents;
drop policy if exists docs_delete on tt_documents;

create policy docs_select on tt_documents for select to authenticated
  using (public.fn_user_has_company_access(company_id));

create policy docs_insert on tt_documents for insert to authenticated
  with check (public.fn_is_admin_user() and public.fn_user_has_company_access(company_id));

create policy docs_update on tt_documents for update to authenticated
  using      (public.fn_is_admin_user() and public.fn_user_has_company_access(company_id))
  with check (public.fn_is_admin_user() and public.fn_user_has_company_access(company_id));

create policy docs_delete on tt_documents for delete to authenticated
  using (public.fn_is_admin_user() and public.fn_user_has_company_access(company_id) and status = 'draft');

-- tt_document_lines: reusar el company del doc padre
drop policy if exists doclines_select on tt_document_lines;
drop policy if exists doclines_write  on tt_document_lines;

create policy doclines_select on tt_document_lines for select to authenticated
  using (exists (
    select 1 from tt_documents d
    where d.id = tt_document_lines.document_id
      and public.fn_user_has_company_access(d.company_id)
  ));

create policy doclines_write on tt_document_lines for all to authenticated
  using (public.fn_is_admin_user() and exists (
    select 1 from tt_documents d
    where d.id = tt_document_lines.document_id
      and public.fn_user_has_company_access(d.company_id)
  ))
  with check (public.fn_is_admin_user() and exists (
    select 1 from tt_documents d
    where d.id = tt_document_lines.document_id
      and public.fn_user_has_company_access(d.company_id)
  ));

-- tt_document_relations: source y target deben estar accesibles
drop policy if exists docrel_select on tt_document_relations;
drop policy if exists docrel_write  on tt_document_relations;

create policy docrel_select on tt_document_relations for select to authenticated
  using (exists (
    select 1 from tt_documents d
    where d.id in (tt_document_relations.source_document_id, tt_document_relations.target_document_id)
      and public.fn_user_has_company_access(d.company_id)
  ));

create policy docrel_write on tt_document_relations for all to authenticated
  using (public.fn_is_admin_user())
  with check (public.fn_is_admin_user());

-- tt_document_configs: lectura por acceso, escritura admin
drop policy if exists docconf_select on tt_document_configs;
drop policy if exists docconf_write  on tt_document_configs;

create policy docconf_select on tt_document_configs for select to authenticated
  using (public.fn_user_has_company_access(company_id));

create policy docconf_write on tt_document_configs for all to authenticated
  using      (public.fn_is_admin_user() and public.fn_user_has_company_access(company_id))
  with check (public.fn_is_admin_user() and public.fn_user_has_company_access(company_id));

-- tt_document_numbering: lectura admin, escritura solo por RPC (service_role ya lo cubre)
drop policy if exists docnum_select on tt_document_numbering;

create policy docnum_select on tt_document_numbering for select to authenticated
  using (public.fn_is_admin_user() and public.fn_user_has_company_access(company_id));

-- tt_document_events: lectura por acceso al doc
drop policy if exists docev_select on tt_document_events;
drop policy if exists docev_write  on tt_document_events;

create policy docev_select on tt_document_events for select to authenticated
  using (exists (
    select 1 from tt_documents d
    where d.id = tt_document_events.document_id
      and public.fn_user_has_company_access(d.company_id)
  ));

create policy docev_write on tt_document_events for insert to authenticated
  with check (public.fn_is_admin_user());

-- ---------------------------------------------------------------------
-- 9. Trigger: updated_at automático
-- ---------------------------------------------------------------------
create or replace function fn_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tg_tt_documents_touch           on tt_documents;
drop trigger if exists tg_tt_document_configs_touch    on tt_document_configs;
drop trigger if exists tg_tt_document_numbering_touch  on tt_document_numbering;

create trigger tg_tt_documents_touch
  before update on tt_documents
  for each row execute function fn_touch_updated_at();

create trigger tg_tt_document_configs_touch
  before update on tt_document_configs
  for each row execute function fn_touch_updated_at();

create trigger tg_tt_document_numbering_touch
  before update on tt_document_numbering
  for each row execute function fn_touch_updated_at();

-- ---------------------------------------------------------------------
-- 10. SEEDS — configs default para TODAS las empresas × tipos
-- ---------------------------------------------------------------------
insert into tt_document_configs (company_id, doc_type)
  select c.id, t.doc_type
  from tt_companies c
  cross join (values
    ('quote'),('sales_order'),('purchase_order'),('delivery_note'),
    ('invoice'),('proforma'),('receipt'),('internal'),
    ('credit_note'),('debit_note')
  ) as t(doc_type)
  where c.is_active = true
on conflict (company_id, doc_type) do nothing;

-- Ajustes finos post-seed: cotizaciones con 30 días de validez, facturas con 30 días de pago
update tt_document_configs set default_validity_days = 30 where doc_type = 'quote'   and default_validity_days is null;
update tt_document_configs set default_due_days      = 30 where doc_type = 'invoice' and default_due_days      is null;

-- =====================================================================
-- FIN v37
-- =====================================================================
