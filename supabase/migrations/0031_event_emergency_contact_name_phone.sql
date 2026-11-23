-- LnR Cycle Center — separate emergency-contact name and phone number.
-- Apply after 0030_event_registration_categories.sql.
-- Legacy emergency_contact is retained for existing records and older clients.

begin;

alter table public.event_registrations
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

-- A new six-argument wrapper stores both fields separately and keeps the
-- legacy combined field populated for backward compatibility.
create or replace function public.lnr_register_event_with_contact(
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
  result jsonb;
  digits text;
  clean_name text;
  clean_phone text;
begin
  clean_name := trim(coalesce(p_emergency_name, ''));
  clean_phone := trim(coalesce(p_emergency_phone, ''));
  digits := regexp_replace(clean_phone, '[^0-9]', '', 'g');

  if clean_name = ''
     or length(clean_name) > 120
     or clean_name !~ '[[:alpha:]]' then
    raise exception 'Enter the emergency contact person’s name.';
  end if;

  if clean_phone = ''
     or length(clean_phone) > 30
     or length(digits) not between 7 and 15 then
    raise exception 'Enter a valid emergency contact phone number.';
  end if;

  -- The underlying function validates the event, category, current category
  -- price, account, duplicate registration, and event registration window.
  result := public.lnr_register_event(
    p_user,
    p_event,
    p_rider,
    null,
    p_category
  );

  update public.event_registrations as r
  set emergency_contact_name = clean_name,
      emergency_contact_phone = clean_phone,
      emergency_contact = clean_name || ' · ' || clean_phone
  where r.registration_code = result->>'registrationCode'
    and exists (
      select 1
      from public.customers as c
      where c.id = r.customer_id
        and c.auth_user_id = p_user
    );

  if not found then
    raise exception 'Registration not available for your account.';
  end if;

  return result;
end;
$$;

revoke all on function public.lnr_register_event_with_contact(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.lnr_register_event_with_contact(uuid, uuid, text, text, text, text)
  to service_role;

commit;
