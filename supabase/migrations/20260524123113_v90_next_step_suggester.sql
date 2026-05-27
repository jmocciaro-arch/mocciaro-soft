-- v90 Next-Step Suggester FINAL

create extension if not exists pg_cron;

-- 1. current_company_id()
create or replace function current_company_id()
returns uuid
language plpgsql
stable
security definer
as $$
declare
  v_company_id uuid;
  v_auth_id    uuid := auth.uid();
begin
  if v_auth_id is null then return null; end if;
  begin
    v_company_id := nullif(current_setting('request.jwt.claims', true)::jsonb->>'company_id', '')::uuid;
    if v_company_id is not null then return v_company_id; end if;
  exception when others then null;
  end;
  begin
    v_company_id := nullif(current_setting('app.company_id', true), '')::uuid;
    if v_company_id is not null then return v_company_id; end if;
  exception when others then null;
  end;
  begin
    select uc.company_id into v_company_id
      from tt_user_companies uc
      join tt_users u on u.id = uc.user_id
     where u.auth_id = v_auth_id
       and coalesce(uc.is_default, false) = true
     limit 1;
    return v_company_id;
  exception when others then return null;
  end;
end;
$$;

-- 2. tt_role_action_permissions
create table if not exists tt_role_action_permissions (
  role_id      uuid not null references tt_roles(id) on delete cascade,
  action_code  text not null,
  created_at   timestamptz not null default now(),
  primary key (role_id, action_code)
);

create index if not exists tt_role_action_permissions_action_idx
  on tt_role_action_permissions (action_code);

alter table tt_role_action_permissions enable row level security;

drop policy if exists tt_role_action_permissions_read_all on tt_role_action_permissions;
create policy tt_role_action_permissions_read_all on tt_role_action_permissions
  for select using (true);

drop policy if exists tt_role_action_permissions_admin_write on tt_role_action_permissions;
create policy tt_role_action_permissions_admin_write on tt_role_action_permissions
  for all using (
    exists (
      select 1 from tt_user_roles ur
        join tt_roles r on r.id = ur.role_id
        join tt_users u on u.id = ur.user_id
       where u.auth_id = auth.uid()
         and r.name in ('super_admin', 'admin')
    )
  );

-- 3. SEED ADMIN tier
insert into tt_role_action_permissions (role_id, action_code)
select r.id, ac.action_code
  from tt_roles r
 cross join (values
   ('preview_pdf'),('add_internal_note'),('send_email'),('send_whatsapp_link'),
   ('send_whatsapp_api'),('duplicate_for_client'),('convert_to_sales_order'),
   ('mark_won'),('mark_lost'),('schedule_followup'),('schedule_reminder'),
   ('create_calendar_reminder'),('generate_delivery_note'),('generate_purchase_order'),
   ('reserve_stock'),('print'),('confirm_delivery'),('generate_invoice'),
   ('send_to_supplier'),('register_supplier_invoice'),('upload_pdf_to_drive'),
   ('assign_technician'),('schedule_visit'),('attach_diagnosis'),
   ('close_ticket'),('register_aeat'),('register_afip'),('export_xml'),('push_to_hubspot')
 ) as ac(action_code)
 where r.name in ('super_admin','admin','gerencia_general','gerente_comercial','gerente_compras','gerente_finanzas')
on conflict do nothing;

-- SEED COMERCIAL tier
insert into tt_role_action_permissions (role_id, action_code)
select r.id, ac.action_code
  from tt_roles r
 cross join (values
   ('preview_pdf'),('add_internal_note'),('send_email'),('send_whatsapp_link'),
   ('duplicate_for_client'),('convert_to_sales_order'),('mark_won'),('mark_lost'),
   ('schedule_followup'),('schedule_reminder'),('create_calendar_reminder'),
   ('generate_delivery_note'),('generate_purchase_order'),('reserve_stock'),
   ('print'),('confirm_delivery'),('generate_invoice'),('send_to_supplier'),
   ('register_supplier_invoice'),('upload_pdf_to_drive'),('assign_technician'),
   ('schedule_visit'),('attach_diagnosis')
 ) as ac(action_code)
 where r.name in ('ventas_manager','compras_manager','deposito_manager',
                  'ventas_user','compras_user','deposito_user',
                  'facturacion_user','contabilidad_user','tesoreria_user','soporte_user')
on conflict do nothing;

-- SEED VIEWER tier
insert into tt_role_action_permissions (role_id, action_code)
select r.id, ac.action_code
  from tt_roles r
 cross join (values ('preview_pdf'),('add_internal_note')) as ac(action_code)
 where r.name = 'auditor_readonly'
on conflict do nothing;

-- 4. Vista legible
create or replace view v_role_actions_readable as
select r.name as role_name, rap.action_code, rap.created_at
  from tt_role_action_permissions rap
  join tt_roles r on r.id = rap.role_id
 order by r.name, rap.action_code;

-- 5. fn_can_execute_action
create or replace function fn_can_execute_action(
  p_user_id    uuid,
  p_company_id uuid,
  p_action     text
) returns boolean
language plpgsql
security definer
stable
as $$
declare v_tt_user_id uuid;
begin
  if p_user_id is null then
    return p_action in ('noop_test','send_email','send_whatsapp_link',
                        'create_calendar_reminder','schedule_followup','schedule_reminder');
  end if;
  select id into v_tt_user_id from tt_users where auth_id = p_user_id limit 1;
  if v_tt_user_id is null then return false; end if;
  if not exists (select 1 from tt_user_companies
                  where user_id = v_tt_user_id and company_id = p_company_id) then
    return false;
  end if;
  return exists (
    select 1 from tt_user_roles ur
      join tt_role_action_permissions rap on rap.role_id = ur.role_id
     where ur.user_id = v_tt_user_id and rap.action_code = p_action
  );
end;
$$;

-- 6. tt_doc_actions_log
create table if not exists tt_doc_actions_log (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  user_id         uuid not null references auth.users(id),
  doc_type        text not null check (doc_type in (
                    'quotation','sales_order','delivery_note','invoice',
                    'purchase_order','collection','sat_ticket','contact')),
  doc_id          uuid not null,
  action_code     text not null,
  status          text not null check (status in ('ok','error','pending','cancelled')),
  channel         text check (channel in ('email','whatsapp','print','system','manual','api') or channel is null),
  payload         jsonb,
  error_message   text,
  duration_ms     int,
  created_at      timestamptz not null default now()
);

create index if not exists tt_doc_actions_log_doc_idx on tt_doc_actions_log (company_id, doc_type, doc_id, created_at desc);
create index if not exists tt_doc_actions_log_user_idx on tt_doc_actions_log (company_id, user_id, created_at desc);
create index if not exists tt_doc_actions_log_status_idx on tt_doc_actions_log (status, created_at desc) where status in ('error','pending');

alter table tt_doc_actions_log enable row level security;

drop policy if exists tt_doc_actions_log_select_own_company on tt_doc_actions_log;
create policy tt_doc_actions_log_select_own_company on tt_doc_actions_log
  for select using (company_id = current_company_id());

drop policy if exists tt_doc_actions_log_insert_authorized on tt_doc_actions_log;
create policy tt_doc_actions_log_insert_authorized on tt_doc_actions_log
  for insert with check (
    company_id = current_company_id()
    and user_id = auth.uid()
    and fn_can_execute_action(auth.uid(), company_id, action_code)
  );

-- 7. tt_scheduled_actions
create table if not exists tt_scheduled_actions (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  user_id         uuid not null references auth.users(id),
  doc_type        text not null,
  doc_id          uuid not null,
  action_code     text not null,
  run_at          timestamptz not null,
  status          text not null default 'pending'
                    check (status in ('pending','running','done','failed','cancelled')),
  retry_count     int not null default 0,
  max_retries     int not null default 3,
  payload         jsonb,
  last_error      text,
  locked_at       timestamptz,
  locked_by       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (doc_id, action_code, run_at)
);

create index if not exists tt_scheduled_actions_due_idx on tt_scheduled_actions (status, run_at) where status = 'pending';
create index if not exists tt_scheduled_actions_doc_idx on tt_scheduled_actions (company_id, doc_type, doc_id);

alter table tt_scheduled_actions enable row level security;

drop policy if exists tt_scheduled_actions_select_own_company on tt_scheduled_actions;
create policy tt_scheduled_actions_select_own_company on tt_scheduled_actions
  for select using (company_id = current_company_id());

drop policy if exists tt_scheduled_actions_insert_authorized on tt_scheduled_actions;
create policy tt_scheduled_actions_insert_authorized on tt_scheduled_actions
  for insert with check (
    company_id = current_company_id()
    and user_id = auth.uid()
    and fn_can_execute_action(auth.uid(), company_id, action_code)
  );

drop policy if exists tt_scheduled_actions_cancel_own on tt_scheduled_actions;
create policy tt_scheduled_actions_cancel_own on tt_scheduled_actions
  for update using (company_id = current_company_id() and status = 'pending')
  with check (company_id = current_company_id() and status = 'cancelled');

create or replace function fn_touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists tt_scheduled_actions_touch on tt_scheduled_actions;
create trigger tt_scheduled_actions_touch
  before update on tt_scheduled_actions
  for each row execute function fn_touch_updated_at();

-- 8. tt_reminders
create table if not exists tt_reminders (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  user_id         uuid not null references auth.users(id),
  doc_type        text,
  doc_id          uuid,
  title           text not null,
  notes           text,
  remind_at       timestamptz not null,
  acknowledged_at timestamptz,
  calendar_event_id text,
  created_at      timestamptz not null default now()
);

create index if not exists tt_reminders_due_idx on tt_reminders (user_id, remind_at) where acknowledged_at is null;

alter table tt_reminders enable row level security;

drop policy if exists tt_reminders_own on tt_reminders;
create policy tt_reminders_own on tt_reminders
  for all using (company_id = current_company_id() and user_id = auth.uid());

-- 9. fn_run_scheduled_actions (worker)
create or replace function fn_run_scheduled_actions()
returns table (processed int, failed int)
language plpgsql
security definer
as $$
declare
  v_lock_id   text := 'worker_' || extract(epoch from now())::text;
  v_processed int  := 0;
  v_failed    int  := 0;
  r record;
begin
  update tt_scheduled_actions
     set status = 'running', locked_at = now(), locked_by = v_lock_id
   where id in (
     select id from tt_scheduled_actions
      where status = 'pending' and run_at <= now() and retry_count < max_retries
      order by run_at limit 50 for update skip locked
   );

  for r in select * from tt_scheduled_actions where locked_by = v_lock_id and status = 'running'
  loop
    begin
      if r.action_code = 'noop_test' then
        update tt_scheduled_actions set status = 'done', locked_at = null, locked_by = null where id = r.id;
        v_processed := v_processed + 1;
      else
        update tt_scheduled_actions
           set status = 'pending', retry_count = retry_count + 1,
               last_error = 'worker_not_wired_yet (F1 pendiente)',
               locked_at = null, locked_by = null
         where id = r.id;
        v_failed := v_failed + 1;
      end if;

      insert into tt_doc_actions_log (company_id, user_id, doc_type, doc_id, action_code, status, channel, payload, error_message)
      values (r.company_id, r.user_id, r.doc_type, r.doc_id, r.action_code,
              case when r.action_code = 'noop_test' then 'ok' else 'pending' end,
              'system', r.payload,
              case when r.action_code = 'noop_test' then null else 'worker_not_wired_yet' end);
    exception when others then
      update tt_scheduled_actions
         set status = case when retry_count + 1 >= max_retries then 'failed' else 'pending' end,
             retry_count = retry_count + 1, last_error = SQLERRM,
             locked_at = null, locked_by = null
       where id = r.id;
      v_failed := v_failed + 1;
    end;
  end loop;

  return query select v_processed, v_failed;
end;
$$;

-- 10. pg_cron job
select cron.schedule('next_step_worker', '* * * * *', $$ select fn_run_scheduled_actions(); $$);
