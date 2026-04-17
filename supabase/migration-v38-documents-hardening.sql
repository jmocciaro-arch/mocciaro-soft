-- =====================================================================
-- MIGRATION v38 — HARDENING de la Fase DOCUMENTOS COMERCIALES
-- Mocciaro Soft
--
-- Depende de:  v37 (tablas y fn_next_document_number)
-- Objetivo:    consistencia, seguridad y concurrencia a nivel prod.
-- Idempotente.
--
-- Contenido:
--   1. Trigger: totales automáticos tras cambios en tt_document_lines
--   2. Trigger: protección de líneas cuando el doc está emitido
--   3. Trigger: inmutabilidad de tt_document_events (UPDATE/DELETE)
--   4. Trigger: bloquear borrado de docs con relaciones
--   5. fn_issue_document  — emisión atómica con SELECT ... FOR UPDATE
--   6. fn_derive_document — derivación atómica con FOR UPDATE sobre líneas
--   7. REVOKEs defensivos
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TOTALES AUTOMÁTICOS
-- ---------------------------------------------------------------------
create or replace function fn_recompute_document_totals(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub  numeric(20,2);
  v_tax  numeric(20,2);
  v_disc numeric(20,2);
begin
  select
    coalesce(sum(subtotal), 0),
    coalesce(sum(tax_amount), 0),
    coalesce(sum(discount_amount), 0)
  into v_sub, v_tax, v_disc
  from tt_document_lines
  where document_id = p_document_id;

  update tt_documents
  set subtotal       = v_sub,
      tax_total      = v_tax,
      discount_total = v_disc,
      total          = v_sub + v_tax
  where id = p_document_id;
end;
$$;

comment on function fn_recompute_document_totals is
  'Recomputa subtotal/tax/discount/total del documento desde la suma de sus líneas.';

create or replace function fn_trigger_recompute_totals()
returns trigger
language plpgsql as $$
begin
  perform fn_recompute_document_totals(coalesce(new.document_id, old.document_id));
  return coalesce(new, old);
end;
$$;

-- INSERT y DELETE siempre disparan (el set de líneas cambió).
drop trigger if exists tg_tt_document_lines_totals_ins on tt_document_lines;
drop trigger if exists tg_tt_document_lines_totals_del on tt_document_lines;
drop trigger if exists tg_tt_document_lines_totals_upd on tt_document_lines;

create trigger tg_tt_document_lines_totals_ins
  after insert on tt_document_lines
  for each row execute function fn_trigger_recompute_totals();

create trigger tg_tt_document_lines_totals_del
  after delete on tt_document_lines
  for each row execute function fn_trigger_recompute_totals();

-- UPDATE: sólo recomputar si cambiaron campos que afectan totales.
create trigger tg_tt_document_lines_totals_upd
  after update on tt_document_lines
  for each row
  when (
    new.subtotal        is distinct from old.subtotal or
    new.tax_amount      is distinct from old.tax_amount or
    new.discount_amount is distinct from old.discount_amount
  )
  execute function fn_trigger_recompute_totals();

-- ---------------------------------------------------------------------
-- 2. PROTECCIÓN DE LÍNEAS EN DOCUMENTOS EMITIDOS
-- ---------------------------------------------------------------------
-- Regla: si el documento está locked o status != 'draft', NO se pueden
-- modificar campos comerciales. Sí se permite cambiar los contadores
-- de derivación (quantity_delivered, quantity_invoiced) porque la función
-- fn_derive_document los actualiza legítimamente.
create or replace function fn_protect_lines_on_locked_doc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_locked boolean;
  v_doc_id uuid := coalesce(new.document_id, old.document_id);
begin
  select status, locked into v_status, v_locked
  from tt_documents where id = v_doc_id;

  if v_status = 'draft' and v_locked = false then
    return coalesce(new, old);           -- libre edición
  end if;

  if TG_OP = 'INSERT' then
    raise exception 'No se pueden agregar líneas a documento % (status=%, locked=%)',
      v_doc_id, v_status, v_locked using errcode = 'check_violation';
  end if;

  if TG_OP = 'DELETE' then
    raise exception 'No se pueden eliminar líneas de documento % (status=%, locked=%)',
      v_doc_id, v_status, v_locked using errcode = 'check_violation';
  end if;

  -- UPDATE: permitir sólo cambios en quantity_delivered / quantity_invoiced.
  if (new.quantity          is distinct from old.quantity)
  or (new.unit_price        is distinct from old.unit_price)
  or (new.discount_pct      is distinct from old.discount_pct)
  or (new.discount_amount   is distinct from old.discount_amount)
  or (new.tax_rate          is distinct from old.tax_rate)
  or (new.tax_amount        is distinct from old.tax_amount)
  or (new.subtotal          is distinct from old.subtotal)
  or (new.total             is distinct from old.total)
  or (new.product_name      is distinct from old.product_name)
  or (new.product_sku       is distinct from old.product_sku)
  or (new.product_id        is distinct from old.product_id)
  or (new.description       is distinct from old.description)
  or (new.unit              is distinct from old.unit)
  or (new.line_number       is distinct from old.line_number)
  or (new.attributes::text  is distinct from old.attributes::text)
  or (new.image_url         is distinct from old.image_url)
  or (new.notes             is distinct from old.notes)
  or (new.source_line_id    is distinct from old.source_line_id)
  then
    raise exception 'No se pueden modificar campos comerciales en líneas de documento % (status=%, locked=%)',
      v_doc_id, v_status, v_locked using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists tg_tt_document_lines_protect on tt_document_lines;
create trigger tg_tt_document_lines_protect
  before insert or update or delete on tt_document_lines
  for each row execute function fn_protect_lines_on_locked_doc();

-- ---------------------------------------------------------------------
-- 3. EVENTOS INMUTABLES
-- ---------------------------------------------------------------------
create or replace function fn_reject_event_mutations()
returns trigger
language plpgsql as $$
begin
  raise exception 'tt_document_events es append-only (operación % denegada)', TG_OP
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists tg_tt_document_events_no_update on tt_document_events;
drop trigger if exists tg_tt_document_events_no_delete on tt_document_events;

create trigger tg_tt_document_events_no_update
  before update on tt_document_events
  for each row execute function fn_reject_event_mutations();

create trigger tg_tt_document_events_no_delete
  before delete on tt_document_events
  for each row execute function fn_reject_event_mutations();

-- RLS: negar UPDATE y DELETE explícitamente (defensa en profundidad)
drop policy if exists docev_no_update on tt_document_events;
drop policy if exists docev_no_delete on tt_document_events;
create policy docev_no_update on tt_document_events
  for update to authenticated using (false) with check (false);
create policy docev_no_delete on tt_document_events
  for delete to authenticated using (false);

-- GRANTs: revocar escritura destructiva (defensa en profundidad extra)
revoke update, delete on tt_document_events from authenticated;

-- ---------------------------------------------------------------------
-- 4. BLOQUEO DE BORRADO DE DOCUMENTOS CON RELACIONES
-- ---------------------------------------------------------------------
-- FK ya tiene ON DELETE RESTRICT; este trigger mejora el mensaje.
create or replace function fn_prevent_delete_linked_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out int;
  v_in  int;
begin
  select count(*) into v_out from tt_document_relations where source_document_id = old.id;
  select count(*) into v_in  from tt_document_relations where target_document_id = old.id;
  if v_out > 0 or v_in > 0 then
    raise exception
      'Documento % no puede eliminarse: tiene % derivaciones salientes y % entrantes. Usá cancel en lugar de delete.',
      old.id, v_out, v_in using errcode = 'foreign_key_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists tg_tt_documents_prevent_delete_linked on tt_documents;
create trigger tg_tt_documents_prevent_delete_linked
  before delete on tt_documents
  for each row execute function fn_prevent_delete_linked_document();

-- ---------------------------------------------------------------------
-- 5. fn_issue_document  — emisión atómica
-- ---------------------------------------------------------------------
-- Pasos en UNA sola transacción:
--   1. SELECT ... FOR UPDATE sobre el doc (bloquea otras emisiones/ediciones)
--   2. Validar status = 'draft'
--   3. Cargar config y empresa
--   4. Invocar fn_next_document_number (atómica por índice único)
--   5. Renderizar doc_code desde el template
--   6. UPDATE doc: status=issued, doc_number, doc_year, doc_code, issued_at, locked=true
--   7. INSERT de eventos 'issued' y 'numbered'
-- Si algo falla, rollback total — el número se pierde (hueco aceptable).
create or replace function fn_issue_document(
  p_document_id uuid,
  p_actor_id    uuid,
  p_doc_date    date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc           tt_documents%rowtype;
  v_cfg           tt_document_configs%rowtype;
  v_company_name  text;
  v_company_prefix text;
  v_number        bigint;
  v_year          int;
  v_date          date;
  v_template      text;
  v_prefix        text;
  v_padding       int;
  v_pad_match     text;
  v_type_short    text;
  v_code          text;
begin
  -- 1. Lock del documento
  select * into v_doc
  from tt_documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Documento % no encontrado', p_document_id using errcode='no_data_found';
  end if;

  -- 2. Sólo drafts
  if v_doc.status <> 'draft' then
    raise exception 'Sólo drafts pueden emitirse (status actual: %)', v_doc.status
      using errcode='check_violation';
  end if;

  -- 3. Config (no FOR UPDATE: es lectura; cambios concurrentes al template
  --    no afectan la atomicidad del número)
  select * into v_cfg
  from tt_document_configs
  where company_id = v_doc.company_id and doc_type = v_doc.doc_type;

  select name, code_prefix into v_company_name, v_company_prefix
  from tt_companies
  where id = v_doc.company_id;

  v_date := coalesce(p_doc_date, v_doc.doc_date, current_date);
  v_year := extract(year from v_date)::int;

  -- 4. Numeración atómica
  v_number := fn_next_document_number(
    v_doc.company_id,
    v_doc.doc_type,
    v_year,
    coalesce(v_cfg.reset_yearly, true)
  );

  -- 5. Render del code
  v_type_short := case v_doc.doc_type
    when 'quote'          then 'COTI'
    when 'sales_order'    then 'OV'
    when 'purchase_order' then 'OC'
    when 'delivery_note'  then 'REM'
    when 'invoice'        then 'FAC'
    when 'proforma'       then 'PROF'
    when 'receipt'        then 'REC'
    when 'internal'       then 'INT'
    when 'credit_note'    then 'NC'
    when 'debit_note'     then 'ND'
    else upper(v_doc.doc_type)
  end;

  v_prefix  := upper(coalesce(v_cfg.prefix_override, v_company_prefix, ''));
  v_template := coalesce(v_cfg.name_template,
    '{date:YYYY} {date:MM} {date:DD} {type}-{prefix}.{year}.{number:6}');
  v_padding := coalesce(v_cfg.number_padding, 6);

  v_code := v_template;
  v_code := replace(v_code, '{date:YYYY}',   to_char(v_date, 'YYYY'));
  v_code := replace(v_code, '{date:MM}',     to_char(v_date, 'MM'));
  v_code := replace(v_code, '{date:DD}',     to_char(v_date, 'DD'));
  v_code := replace(v_code, '{date}',        to_char(v_date, 'YYYY-MM-DD'));
  v_code := replace(v_code, '{type}',        v_type_short);
  v_code := replace(v_code, '{prefix}',      v_prefix);
  v_code := replace(v_code, '{year}',        v_year::text);
  v_code := replace(v_code, '{counterparty}', upper(coalesce(v_doc.counterparty_name, '')));
  v_code := replace(v_code, '{currency}',    upper(coalesce(v_doc.currency_code, '')));
  v_code := replace(v_code, '{company}',     coalesce(v_company_name, ''));

  -- Padding dinámico {number:N}
  v_pad_match := substring(v_code from '\{number:(\d+)\}');
  if v_pad_match is not null then
    v_code := regexp_replace(
      v_code, '\{number:\d+\}',
      lpad(v_number::text, v_pad_match::int, '0'),
      'g'
    );
  end if;
  -- {number} sin padding usa number_padding de config
  if v_code like '%{number}%' then
    v_code := replace(v_code, '{number}', lpad(v_number::text, v_padding, '0'));
  end if;

  -- 6. Update atómico
  update tt_documents
  set status     = 'issued',
      doc_number = v_number,
      doc_year   = v_year,
      doc_code   = v_code,
      doc_date   = v_date,
      issued_at  = now(),
      locked     = true,
      updated_by = p_actor_id
  where id = p_document_id;

  -- 7. Eventos
  insert into tt_document_events (document_id, event_type, actor_id, from_status, to_status, payload)
    values (p_document_id, 'issued', p_actor_id, 'draft', 'issued',
            jsonb_build_object('number', v_number, 'year', v_year, 'code', v_code,
                               'template', v_template, 'prefix', v_prefix));

  insert into tt_document_events (document_id, event_type, actor_id, payload)
    values (p_document_id, 'numbered', p_actor_id,
            jsonb_build_object('number', v_number, 'year', v_year));

  return jsonb_build_object(
    'document_id', p_document_id,
    'number',      v_number,
    'year',        v_year,
    'code',        v_code
  );
end;
$$;

comment on function fn_issue_document is
  'Emisión atómica: locks el doc, asigna número, renderiza code, lo bloquea, registra eventos. Rollback total si algo falla.';

-- ---------------------------------------------------------------------
-- 6. fn_derive_document  — derivación atómica con FOR UPDATE en líneas
-- ---------------------------------------------------------------------
-- Pasos:
--   1. Lock del doc origen
--   2. Validar status >= 'issued'
--   3. Crear cabecera destino (draft)
--   4. Loop sobre líneas origen CON FOR UPDATE (impide doble derivación
--      concurrente de las mismas líneas)
--   5. Validar remainder (cantidad pedida <= pendiente)
--   6. Copiar línea al destino con snapshot
--   7. Incrementar quantity_delivered/quantity_invoiced en origen
--   8. Insertar tt_document_relations
--   9. Eventos derived_out / derived_in
--  10. Auto-transition del origen si aplica
create or replace function fn_derive_document(
  p_source_id         uuid,
  p_target_type       text,
  p_relation_type     text,
  p_remainder_field   text,        -- 'quantity_delivered' | 'quantity_invoiced' | null
  p_direction         text,        -- DOC_TYPE_DIRECTION del target
  p_mode              text,        -- 'full' | 'selected'
  p_line_ids          uuid[],
  p_line_quantities   jsonb,
  p_copy_counterparty boolean,
  p_notes             text,
  p_actor_id          uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src              tt_documents%rowtype;
  v_new_id           uuid := gen_random_uuid();
  v_line             tt_document_lines%rowtype;
  v_override         numeric;
  v_pending          numeric;
  v_used             numeric;
  v_lineno           int := 1;
  v_gross            numeric;
  v_pct_disc         numeric;
  v_total_disc       numeric;
  v_sub              numeric;
  v_tax              numeric;
  v_line_total       numeric;
  v_inserted         int := 0;
  v_all_done         boolean;
  v_some_done        boolean;
  v_new_parent_stat  text;
begin
  -- 1. Lock del doc origen
  select * into v_src from tt_documents where id = p_source_id for update;
  if not found then
    raise exception 'Documento origen % no encontrado', p_source_id using errcode='no_data_found';
  end if;

  -- 2. Origen debe estar emitido o posterior
  if v_src.status not in (
    'issued','sent','accepted',
    'partially_delivered','delivered',
    'partially_invoiced','invoiced'
  ) then
    raise exception 'Origen debe estar emitido (o posterior). Actual: %', v_src.status
      using errcode='check_violation';
  end if;

  if p_mode = 'selected' and (p_line_ids is null or array_length(p_line_ids, 1) is null) then
    raise exception 'mode=selected requiere line_ids';
  end if;

  -- 3. Cabecera destino (en draft)
  insert into tt_documents (
    id, company_id, doc_type, direction, doc_date,
    counterparty_type, counterparty_id, counterparty_name,
    counterparty_tax_id, counterparty_email, counterparty_address,
    currency_code, exchange_rate, external_ref,
    status, notes, metadata, created_by, updated_by
  ) values (
    v_new_id, v_src.company_id, p_target_type, p_direction, current_date,
    case when p_copy_counterparty then v_src.counterparty_type    else null end,
    case when p_copy_counterparty then v_src.counterparty_id      else null end,
    case when p_copy_counterparty then v_src.counterparty_name    else null end,
    case when p_copy_counterparty then v_src.counterparty_tax_id  else null end,
    case when p_copy_counterparty then v_src.counterparty_email   else null end,
    case when p_copy_counterparty then v_src.counterparty_address else null end,
    v_src.currency_code, v_src.exchange_rate, v_src.doc_code,
    'draft', p_notes,
    jsonb_build_object('derived_from', v_src.id, 'relation', p_relation_type),
    p_actor_id, p_actor_id
  );

  -- 4. FOR UPDATE sobre las líneas que se usarán (impide concurrencia)
  for v_line in
    select * from tt_document_lines
    where document_id = p_source_id
      and (p_mode = 'full' or id = any(p_line_ids))
    order by line_number
    for update
  loop
    -- Override manual de cantidad si el caller lo pasó
    if p_line_quantities is not null and p_line_quantities ? v_line.id::text then
      v_override := (p_line_quantities ->> v_line.id::text)::numeric;
    else
      v_override := null;
    end if;

    -- 5. Calcular pendiente según contexto
    if p_remainder_field = 'quantity_delivered' then
      v_pending := v_line.quantity - v_line.quantity_delivered;
    elsif p_remainder_field = 'quantity_invoiced' then
      v_pending := v_line.quantity - v_line.quantity_invoiced;
    else
      v_pending := v_line.quantity;
    end if;

    v_used := coalesce(v_override, v_pending);

    if p_remainder_field is not null then
      if v_used <= 0 then continue; end if;
      if v_used > v_pending then
        raise exception
          'Línea % (%): cantidad a derivar % supera pendiente %',
          v_line.line_number, v_line.product_name, v_used, v_pending
          using errcode='check_violation';
      end if;
    end if;

    -- Money
    v_gross      := v_used * v_line.unit_price;
    v_pct_disc   := round(v_gross * coalesce(v_line.discount_pct, 0) / 100, 2);
    v_total_disc := round(coalesce(v_line.discount_amount, 0) + v_pct_disc, 2);
    v_sub        := greatest(0, round(v_gross - v_total_disc, 2));
    v_tax        := round(v_sub * coalesce(v_line.tax_rate, 0) / 100, 2);
    v_line_total := round(v_sub + v_tax, 2);

    -- 6. Copiar la línea al destino
    insert into tt_document_lines (
      document_id, line_number,
      product_id, product_sku, product_name, description,
      quantity, unit, unit_price,
      discount_pct, discount_amount,
      tax_rate, tax_amount,
      subtotal, total,
      attributes, image_url, notes,
      source_line_id
    ) values (
      v_new_id, v_lineno,
      v_line.product_id, v_line.product_sku, v_line.product_name, v_line.description,
      v_used, v_line.unit, v_line.unit_price,
      v_line.discount_pct, v_total_disc,
      v_line.tax_rate, v_tax,
      v_sub, v_line_total,
      v_line.attributes, v_line.image_url, v_line.notes,
      v_line.id
    );

    v_lineno   := v_lineno + 1;
    v_inserted := v_inserted + 1;

    -- 7. Incrementar remainder del origen (permitido por fn_protect_lines_on_locked_doc)
    if p_remainder_field = 'quantity_delivered' then
      update tt_document_lines
      set quantity_delivered = quantity_delivered + v_used
      where id = v_line.id;
    elsif p_remainder_field = 'quantity_invoiced' then
      update tt_document_lines
      set quantity_invoiced = quantity_invoiced + v_used
      where id = v_line.id;
    end if;
  end loop;

  if v_inserted = 0 then
    raise exception 'No hay cantidades pendientes para derivar' using errcode='check_violation';
  end if;

  -- 8. Relación
  insert into tt_document_relations (source_document_id, target_document_id, relation_type, notes, created_by)
    values (p_source_id, v_new_id, p_relation_type, p_notes, p_actor_id);

  -- 9. Eventos bidireccionales
  insert into tt_document_events (document_id, event_type, actor_id, related_document_id, payload, notes)
    values (p_source_id, 'derived_out', p_actor_id, v_new_id,
            jsonb_build_object('target_type', p_target_type, 'relation', p_relation_type, 'mode', p_mode),
            p_notes);

  insert into tt_document_events (document_id, event_type, actor_id, related_document_id, payload)
    values (v_new_id, 'derived_in', p_actor_id, p_source_id,
            jsonb_build_object('source_type', v_src.doc_type, 'relation', p_relation_type));

  -- 10. Auto-transition del origen (solo si aplica)
  if p_remainder_field = 'quantity_delivered' then
    select bool_and(quantity_delivered >= quantity),
           bool_or (quantity_delivered > 0)
    into v_all_done, v_some_done
    from tt_document_lines
    where document_id = p_source_id;

    v_new_parent_stat := case
      when v_all_done  then 'delivered'
      when v_some_done then 'partially_delivered'
      else null
    end;
  elsif p_remainder_field = 'quantity_invoiced' then
    select bool_and(quantity_invoiced >= quantity),
           bool_or (quantity_invoiced > 0)
    into v_all_done, v_some_done
    from tt_document_lines
    where document_id = p_source_id;

    v_new_parent_stat := case
      when v_all_done  then 'invoiced'
      when v_some_done then 'partially_invoiced'
      else null
    end;
  else
    v_new_parent_stat := null;
  end if;

  if v_new_parent_stat is not null and v_new_parent_stat <> v_src.status then
    update tt_documents set status = v_new_parent_stat, updated_by = p_actor_id
    where id = p_source_id;

    insert into tt_document_events (document_id, event_type, actor_id, from_status, to_status, payload)
      values (p_source_id, 'status_changed', p_actor_id, v_src.status, v_new_parent_stat,
              jsonb_build_object('auto', true, 'trigger', 'derive'));
  end if;

  return jsonb_build_object(
    'document_id',  v_new_id,
    'relation',     p_relation_type,
    'lines_copied', v_inserted
  );
end;
$$;

comment on function fn_derive_document is
  'Derivación atómica con SELECT ... FOR UPDATE sobre las líneas del origen. Evita doble derivación y over-delivery/invoicing.';

-- =====================================================================
-- FIN v38
-- =====================================================================
