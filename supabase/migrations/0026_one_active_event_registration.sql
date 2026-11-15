-- Requires 0012_complete_repairs.sql and 0015_event_emergency_contact.sql.
-- No tickets are deleted or automatically cancelled by this migration.
begin;
lock table public.event_registrations in share row exclusive mode;
do $$begin
 if exists(select 1 from public.event_registrations where status='registered' group by event_id,customer_id having count(*)>1) then
  raise exception 'Duplicate active registrations already exist. Review and cancel the extra tickets in admin before applying this migration. No tickets were changed.';
 end if;
end;$$;
create unique index if not exists event_registration_one_active_per_customer
 on public.event_registrations(event_id,customer_id) where status='registered';
create or replace function public.lnr_register_event(p_user uuid,p_event uuid,p_rider text,p_plate text,p_category text)returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare c public.customers%rowtype;e public.events%rowtype;code text;
begin
 select * into c from public.customers where auth_user_id=p_user and status='active';
 if not found or public.lnr_is_admin(p_user) then raise exception 'Sign in with an active customer account.';end if;
 if nullif(trim(p_rider),'') is null or length(p_rider)>150 or length(coalesce(p_plate,''))>60 or length(coalesce(p_category,''))>100 then raise exception 'Check the rider details.';end if;
 select * into e from public.events where id=p_event for update;if not found then raise exception 'Event not found.';end if;
 select registration_code into code from public.event_registrations where event_id=p_event and customer_id=c.id and status='registered';
 if found then raise exception 'You already have an active registration for this event. Open My Events to view or cancel your ticket before signing up again.';end if;
 if e.status<>'published' or e.event_date<=now() then raise exception 'This event is not open for registration.';end if;
 code:='EVR-'||extract(year from now())||'-'||upper(replace(gen_random_uuid()::text,'-',''));
 insert into public.event_registrations(registration_code,event_id,customer_id,customer_name,customer_email,customer_phone,rider_name,plate_number,category,amount_paid,payment_method,payment_status,status)values(code,e.id,c.id,c.full_name,c.email,c.phone,trim(p_rider),nullif(trim(p_plate),''),nullif(trim(p_category),''),e.price,'gcash',case when e.price=0 then 'paid' else 'pending' end,'registered');
 return jsonb_build_object('registrationCode',code,'paymentMethod','gcash');
end;$$;
revoke all on function public.lnr_register_event(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.lnr_register_event(uuid,uuid,text,text,text) to service_role;
commit;
