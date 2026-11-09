-- Requires 0012; compatible with subsequent 0013/0014 updates.
-- Keeps historic plate numbers intact. New registrations use emergency_contact.
begin;
alter table public.event_registrations add column if not exists emergency_contact text;
create or replace function public.lnr_register_event_with_contact(p_user uuid,p_event uuid,p_rider text,p_emergency text,p_category text)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare result jsonb; digits text;
begin
 digits:=regexp_replace(coalesce(p_emergency,''),'[^0-9]','','g');
 if p_emergency is null or length(trim(p_emergency))>250 or length(trim(p_emergency))<3 or p_emergency !~ '[[:alpha:]]' or length(digits) not between 7 and 15 then raise exception 'Enter an emergency contact name and phone number.';end if;
 result:=public.lnr_register_event(p_user,p_event,p_rider,null,p_category);
 update public.event_registrations r set emergency_contact=trim(p_emergency)
 where r.registration_code=result->>'registrationCode' and exists(select 1 from public.customers c where c.id=r.customer_id and c.auth_user_id=p_user);
 if not found then raise exception 'Registration not available for your account.';end if;
 return result;
end;$$;
revoke all on function public.lnr_register_event_with_contact(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.lnr_register_event_with_contact(uuid,uuid,text,text,text) to service_role;
commit;
