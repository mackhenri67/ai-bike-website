-- Adds per-event ticket categories and separate emergency-contact fields.
-- Existing events are preserved and receive one General Admission option at
-- their current event price. Existing registration records remain untouched.
begin;

alter table public.events
  add column if not exists registration_categories jsonb not null default '[]'::jsonb;

update public.events
set registration_categories = jsonb_build_array(
  jsonb_build_object('name', 'General Admission', 'price', price)
)
where registration_categories is null
   or jsonb_typeof(registration_categories) <> 'array'
   or jsonb_array_length(registration_categories) = 0;

alter table public.event_registrations
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

-- New RPC accepts the separate contact fields. The fee is looked up from the
-- event row on the server; it is never accepted from the browser.
create or replace function public.lnr_register_event_with_contact_v2(
  p_user uuid,
  p_event uuid,
  p_rider text,
  p_emergency_name text,
  p_emergency_phone text,
  p_category text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_event public.events%rowtype;
  v_result jsonb;
  v_fee numeric(10,2);
  v_phone_digits text;
  v_emergency_legacy text;
begin
  if p_emergency_name is null
     or length(trim(p_emergency_name)) < 2
     or length(trim(p_emergency_name)) > 120
     or p_emergency_name !~ '[[:alpha:]]' then
    raise exception 'Enter a valid emergency contact name.';
  end if;

  v_phone_digits := regexp_replace(coalesce(p_emergency_phone, ''), '[^0-9]', '', 'g');
  if p_emergency_phone is null
     or length(trim(p_emergency_phone)) > 30
     or length(v_phone_digits) not between 7 and 15 then
    raise exception 'Enter a valid emergency contact phone number.';
  end if;

  select * into v_event
  from public.events
  where id = p_event;
  if not found then
    raise exception 'Event not found.';
  end if;

  select (option_row ->> 'price')::numeric(10,2)
    into v_fee
  from jsonb_array_elements(coalesce(v_event.registration_categories, '[]'::jsonb)) as option_row
  where lower(trim(option_row ->> 'name')) = lower(trim(coalesce(p_category, '')))
  limit 1;

  if not found or v_fee is null or v_fee < 0 then
    raise exception 'Please select a valid registration category.';
  end if;

  -- Retain the existing registration/one-active-ticket enforcement.
  v_result := public.lnr_register_event(p_user, p_event, p_rider, null, p_category);
  v_emergency_legacy := trim(p_emergency_name) || ' · ' || trim(p_emergency_phone);

  update public.event_registrations r
  set emergency_contact_name = trim(p_emergency_name),
      emergency_contact_phone = trim(p_emergency_phone),
      emergency_contact = v_emergency_legacy,
      amount_paid = v_fee,
      payment_status = case when v_fee = 0 then 'paid' else 'pending' end
  where r.registration_code = v_result ->> 'registrationCode'
    and exists (
      select 1 from public.customers c
      where c.id = r.customer_id and c.auth_user_id = p_user
    );

  if not found then
    raise exception 'Registration not available for your account.';
  end if;

  return v_result;
end;
$$;

revoke all on function public.lnr_register_event_with_contact_v2(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.lnr_register_event_with_contact_v2(uuid, uuid, text, text, text, text)
  to service_role;

commit;
