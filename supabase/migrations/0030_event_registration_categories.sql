-- LnR Cycle Center: per-event registration categories and per-category fees.
-- Apply after 0029_labor_cost_and_revenue_breakdown.sql.
-- Existing events keep their single events.price fee when registration_categories is empty.

begin;

alter table public.events
  add column if not exists registration_categories jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_registration_categories_array_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_registration_categories_array_check
      check (jsonb_typeof(registration_categories) = 'array');
  end if;
end;
$$;

-- The existing lnr_register_event_with_contact wrapper calls this function,
-- so emergency-contact handling remains unchanged.
create or replace function public.lnr_register_event(
  p_user uuid,
  p_event uuid,
  p_rider text,
  p_plate text,
  p_category text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  c public.customers%rowtype;
  e public.events%rowtype;
  v_category text;
  v_selected jsonb;
  v_amount numeric(10,2);
  code text;
begin
  select * into c
  from public.customers
  where auth_user_id = p_user and status = 'active';

  if not found or public.lnr_is_admin(p_user) then
    raise exception 'Sign in with an active customer account.';
  end if;

  if nullif(trim(p_rider), '') is null
     or length(trim(p_rider)) > 150
     or length(coalesce(p_plate, '')) > 60
     or length(coalesce(p_category, '')) > 100 then
    raise exception 'Check the rider details.';
  end if;

  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'Event not found.'; end if;

  select registration_code into code
  from public.event_registrations
  where event_id = p_event and customer_id = c.id and status = 'registered';
  if found then
    raise exception 'You already have an active registration for this event. Open My Events to view or cancel your ticket before signing up again.';
  end if;

  if e.status <> 'published' or e.event_date <= now() then
    raise exception 'This event is not open for registration.';
  end if;

  if jsonb_array_length(coalesce(e.registration_categories, '[]'::jsonb)) > 0 then
    if nullif(trim(p_category), '') is null then
      raise exception 'Choose the registration category you want to join.';
    end if;

    select item into v_selected
    from jsonb_array_elements(e.registration_categories) as options(item)
    where lower(trim(coalesce(item->>'name', ''))) = lower(trim(p_category))
    limit 1;

    if v_selected is null then
      raise exception 'The selected registration category is no longer available. Please reload the event and choose again.';
    end if;

    if jsonb_typeof(v_selected->'price') <> 'number'
       or nullif(trim(coalesce(v_selected->>'name', '')), '') is null
       or length(trim(v_selected->>'name')) > 60 then
      raise exception 'The selected registration category has invalid configuration.';
    end if;

    v_amount := (v_selected->>'price')::numeric;
    if v_amount < 0 or v_amount > 99999999.99 then
      raise exception 'The selected registration fee is outside the supported range.';
    end if;
    v_category := trim(v_selected->>'name');
  else
    -- Backward compatibility for events created before custom categories.
    v_category := coalesce(nullif(trim(p_category), ''), e.category);
    v_amount := e.price;
  end if;

  code := 'EVR-' || extract(year from now()) || '-' || upper(replace(gen_random_uuid()::text, '-', ''));

  insert into public.event_registrations (
    registration_code, event_id, customer_id, customer_name, customer_email,
    customer_phone, rider_name, plate_number, category, amount_paid,
    payment_method, payment_status, status
  ) values (
    code, e.id, c.id, c.full_name, c.email, c.phone, trim(p_rider),
    nullif(trim(p_plate), ''), v_category, v_amount, 'gcash',
    case when v_amount = 0 then 'paid' else 'pending' end, 'registered'
  );

  return jsonb_build_object('registrationCode', code, 'paymentMethod', 'gcash');
end;
$$;

revoke all on function public.lnr_register_event(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.lnr_register_event(uuid, uuid, text, text, text)
  to service_role;

commit;
