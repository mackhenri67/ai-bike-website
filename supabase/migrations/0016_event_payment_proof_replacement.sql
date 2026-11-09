-- Requires migrations 0012 through 0015. No existing data is deleted or reset.
-- Allow customers to correct a pending/rejected proof; verified payments stay locked.
begin;

create or replace function public.lnr_submit_event_payment(
 p_user uuid, p_code text, p_name text, p_phone text, p_reference text, p_proof text
) returns void language plpgsql set search_path=public,pg_temp as $$
declare
 r public.event_registrations%rowtype;
 proof_prefix text;
begin
 select * into r from public.event_registrations
 where registration_code=p_code for update;
 if not found or public.lnr_is_admin(p_user) or not exists(
  select 1 from public.customers
  where id=r.customer_id and auth_user_id=p_user and status='active'
 ) then
  raise exception 'This registration is not available for your account.';
 end if;
 if r.status<>'registered' or r.payment_status not in ('pending','rejected') then
  raise exception 'This payment cannot be changed.';
 end if;
 if nullif(trim(p_name),'') is null or length(p_name)>150
    or p_phone is null or p_phone !~ '^09[0-9]{9}$'
    or length(coalesce(p_reference,''))>100 then
  raise exception 'Check the payment sender details.';
 end if;

 -- The browser uploader writes UUID filenames into this registration's folder.
 -- Do not accept a public banner URL, order proof, or another event's proof.
 proof_prefix := p_user::text || '/events/' ||
   regexp_replace(r.registration_code,'[^a-zA-Z0-9-]','','g') || '/';
 if p_proof is null or left(p_proof,length(proof_prefix))<>proof_prefix
    or substring(p_proof from length(proof_prefix)+1) !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$' then
  raise exception 'Upload your GCash receipt using this registration''s payment form.';
 end if;
 perform public.lnr_check_proof(p_user,p_proof);

 -- Retrying the exact same successful submission must not create history twice.
 if r.payment_status='pending' and r.proof_screenshot_url=p_proof
    and r.payment_sender_name is not distinct from trim(p_name)
    and r.payment_phone_number is not distinct from p_phone
    and r.reference_number is not distinct from nullif(trim(p_reference),'') then
  return;
 end if;

 if r.proof_screenshot_url is not null then
  insert into public.payment_submission_history(
   source_kind,source_id,previous_submission,changed_by
  ) values ('event',r.id,to_jsonb(r),p_user);
 end if;
 update public.event_registrations set
  proof_screenshot_url=p_proof, payment_status='pending',
  payment_sender_name=trim(p_name), payment_phone_number=p_phone,
  reference_number=nullif(trim(p_reference),''),
  rejection_reason=null, reviewed_at=null, reviewed_by=null
 where id=r.id;
end;
$$;

revoke all on function public.lnr_submit_event_payment(uuid,text,text,text,text,text)
 from public,anon,authenticated;
grant execute on function public.lnr_submit_event_payment(uuid,text,text,text,text,text)
 to service_role;

commit;
