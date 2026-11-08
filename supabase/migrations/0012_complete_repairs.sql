begin;
alter table public.orders add column if not exists stock_restored_at timestamptz;
-- Public product images: only trusted administrators may change objects.
drop policy if exists images_authenticated_upload on storage.objects;
drop policy if exists images_authenticated_update on storage.objects;
drop policy if exists images_authenticated_delete on storage.objects;
drop policy if exists images_admin_insert on storage.objects;
drop policy if exists images_admin_update on storage.objects;
drop policy if exists images_admin_delete on storage.objects;
create policy images_admin_insert on storage.objects for insert to authenticated with check(bucket_id='images' and (select auth.jwt()->'app_metadata'->>'role')='admin');
create policy images_admin_update on storage.objects for update to authenticated using(bucket_id='images' and (select auth.jwt()->'app_metadata'->>'role')='admin') with check(bucket_id='images' and (select auth.jwt()->'app_metadata'->>'role')='admin');
create policy images_admin_delete on storage.objects for delete to authenticated using(bucket_id='images' and (select auth.jwt()->'app_metadata'->>'role')='admin');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('payment-proofs','payment-proofs',false,10485760,array['image/png','image/jpeg','image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists payment_proofs_insert_own on storage.objects;
drop policy if exists payment_proofs_read_own_or_admin on storage.objects;
create policy payment_proofs_insert_own on storage.objects for insert to authenticated with check(bucket_id='payment-proofs' and (storage.foldername(name))[1]=(select auth.uid())::text and coalesce((select auth.jwt()->'app_metadata'->>'role'),'customer')<>'admin');
create policy payment_proofs_read_own_or_admin on storage.objects for select to authenticated using(bucket_id='payment-proofs' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select auth.jwt()->'app_metadata'->>'role')='admin'));
-- Restrictive guards also close older manually-added broad policies for these buckets.
drop policy if exists lnr_images_insert_guard on storage.objects;
drop policy if exists lnr_images_update_guard on storage.objects;
drop policy if exists lnr_images_delete_guard on storage.objects;
create policy lnr_images_insert_guard on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'images' or (select auth.jwt()->'app_metadata'->>'role')='admin');
create policy lnr_images_update_guard on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'images' or (select auth.jwt()->'app_metadata'->>'role')='admin') with check(bucket_id<>'images' or (select auth.jwt()->'app_metadata'->>'role')='admin');
create policy lnr_images_delete_guard on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'images' or (select auth.jwt()->'app_metadata'->>'role')='admin');
drop policy if exists lnr_proofs_select_guard on storage.objects;
drop policy if exists lnr_proofs_insert_guard on storage.objects;
drop policy if exists lnr_proofs_update_guard on storage.objects;
drop policy if exists lnr_proofs_delete_guard on storage.objects;
create policy lnr_proofs_select_guard on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'payment-proofs' or ((storage.foldername(name))[1]=(select auth.uid())::text or (select auth.jwt()->'app_metadata'->>'role')='admin'));
create policy lnr_proofs_insert_guard on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'payment-proofs' or ((storage.foldername(name))[1]=(select auth.uid())::text and coalesce((select auth.jwt()->'app_metadata'->>'role'),'customer')<>'admin'));
create policy lnr_proofs_update_guard on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'payment-proofs') with check(bucket_id<>'payment-proofs');
create policy lnr_proofs_delete_guard on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'payment-proofs');

alter table public.event_registrations add column if not exists reference_number text;
alter table public.event_registrations add column if not exists payment_sender_name text;
alter table public.event_registrations add column if not exists payment_phone_number text;
create table if not exists public.payment_submission_history(id uuid primary key default gen_random_uuid(),source_kind text not null,source_id uuid not null,previous_submission jsonb not null,changed_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now());
alter table public.payment_submission_history enable row level security;
revoke all on public.payment_submission_history from anon,authenticated;
grant all on public.payment_submission_history to service_role;
create table if not exists public.order_number_counters(year integer primary key,last_number bigint not null);
alter table public.order_number_counters enable row level security;
revoke all on public.order_number_counters from anon,authenticated;
grant all on public.order_number_counters to service_role;

create or replace function public.lnr_is_admin(p_user uuid)returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from auth.users where id=p_user and raw_app_meta_data->>'role'='admin');
$$;

create or replace function public.lnr_check_proof(p_user uuid,p_path text)returns void language plpgsql set search_path=public,pg_temp as $$
begin
 if p_path is null or length(p_path)>600 or split_part(p_path,'/',1)<>p_user::text or p_path like '%..%' or p_path like '%://%' then raise exception 'Upload a new payment screenshot using your own account.'; end if;
 if not exists(select 1 from storage.objects where bucket_id='payment-proofs' and name=p_path) then raise exception 'Payment screenshot not found. Upload it again.'; end if;
end;$$;

-- Service-role-only RPC. builder_validated is set by the server after validating
-- structured builder options against the database; it is never copied from a browser flag.
create or replace function public.lnr_place_order(p_user uuid,p_items jsonb,p_method text)returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare c public.customers%rowtype; loc public.customer_locations%rowtype; p public.products%rowtype; v public.product_variants%rowtype;
 item jsonb; qty integer; pid uuid; vid uuid; size_value text; color_value text; price_value numeric; total_value numeric:=0;
 oid uuid; number_value text; sequence_value bigint; year_value integer:=extract(year from now()); builder boolean;
begin
 if p_method not in('gcash','cod') or p_method is null then raise exception 'Choose a valid payment method.'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 or octet_length(p_items::text)>200000 then raise exception 'Your cart is invalid or too large.'; end if;
 select * into c from public.customers where auth_user_id=p_user and status='active';
 if not found or public.lnr_is_admin(p_user) then raise exception 'Sign in with an active customer account.'; end if;
 select * into loc from public.customer_locations where customer_id=c.id order by is_default desc,created_at desc limit 1;
 if not found or nullif(trim(loc.address),'') is null then raise exception 'Save a delivery location before checkout.'; end if;
 insert into public.order_number_counters(year,last_number)values(year_value,coalesce((select max(substring(order_number from '^ORD-[0-9]{4}-([0-9]+)$')::bigint) from public.orders where order_number like 'ORD-'||year_value||'-%'),0)+1)
 on conflict(year) do update set last_number=order_number_counters.last_number+1 returning last_number into sequence_value;
 number_value:='ORD-'||year_value||'-'||lpad(sequence_value::text,6,'0');
 insert into public.orders(order_number,customer_id,customer_name,customer_email,customer_phone,shipping_address,shipping_latitude,shipping_longitude,subtotal,shipping_fee,discount,total,payment_method,payment_status,status)
 values(number_value,c.id,c.full_name,c.email,c.phone,loc.address,loc.latitude,loc.longitude,0,190,0,190,p_method,'pending','pending') returning id into oid;
 -- A stable product order prevents opposite cart orders from taking opposite locks.
 for item in select value from jsonb_array_elements(p_items) order by value->>'productId',value->>'size',value->>'color' loop
  if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'quantity') is distinct from 'number' or coalesce(item->>'quantity','') !~ '^[0-9]{1,5}$' then raise exception 'A cart quantity is invalid.'; end if;
  qty:=(item->>'quantity')::integer;if qty not between 1 and 10000 then raise exception 'A cart quantity is invalid.';end if;
  if coalesce(item->>'productId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'A product reference is invalid. Refresh your cart.';end if;
  pid:=(item->>'productId')::uuid;
  select * into p from public.products where id=pid for update;
  if not found or p.status<>'active' then raise exception 'A product is no longer available. Refresh your cart.';end if;
  if p.category_id is not null and not exists(select 1 from public.categories where id=p.category_id and is_active) then raise exception 'A product category is unavailable.';end if;
  size_value:=nullif(trim(item->>'size'),'');color_value:=nullif(trim(item->>'color'),'');
  if length(coalesce(size_value,''))>2000 or length(coalesce(color_value,''))>150 then raise exception 'Product options are invalid.';end if;
  builder:=coalesce((item->>'builder_validated')::boolean,false);
  vid:=null;price_value:=p.price;
  if exists(select 1 from public.product_variants where product_id=pid) then
   if nullif(item->>'variantId','') is not null then
    select * into v from public.product_variants where id=(item->>'variantId')::uuid and product_id=pid and available for update;
   else
    if lower(coalesce(size_value,'')) in('one size','standard') then size_value:=null;end if;
    if lower(coalesce(color_value,'')) in('default','standard') then color_value:=null;end if;
    select * into v from public.product_variants where product_id=pid and available and nullif(trim(size),'') is not distinct from size_value and nullif(trim(color),'') is not distinct from color_value order by id limit 1 for update;
   end if;
   if not found then raise exception 'The selected size/color combination is unavailable.';end if;
   if v.stock<qty then raise exception 'Not enough stock for the selected size/color.';end if;
   vid:=v.id;price_value:=v.price;
   if not builder then size_value:=v.size;color_value:=v.color;end if;
   update public.product_variants set stock=stock-qty where id=vid;
  elsif not builder and (lower(coalesce(size_value,'')) not in('','one size','standard') or lower(coalesce(color_value,'')) not in('','default','standard')) then
   raise exception 'This product does not offer the selected size/color.';
  end if;
  if p.stock<qty then raise exception 'Not enough stock. Reduce the total quantity of this product.';end if;
  update public.products set stock=stock-qty where id=pid;
  insert into public.order_items(order_id,product_id,product_variant_id,product_name,size,color,unit_price,quantity,line_total)values(oid,pid,vid,p.name,size_value,color_value,price_value,qty,price_value*qty);
  total_value:=total_value+price_value*qty;
 end loop;
 update public.orders set subtotal=total_value,total=total_value+190 where id=oid;
 insert into public.order_status_history(order_id,status,note)values(oid,'pending','Order placed');
 return jsonb_build_object('orderNumber',number_value,'total',total_value+190,'paymentMethod',p_method);
end;$$;

create or replace function public.lnr_set_order_status(p_order uuid,p_status text,p_admin uuid,p_note text default null)returns void language plpgsql set search_path=public,pg_temp as $$
declare o public.orders%rowtype;r record;
begin
 if not public.lnr_is_admin(p_admin) then raise exception 'Administrator access required.';end if;
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'Order not found.';end if;
 if p_status=o.status then return;end if;
 if o.status='cancelled' then raise exception 'A cancelled order cannot be reopened. Place a new order to reserve stock.';end if;
 if not(p_status='cancelled' or (o.status='pending' and p_status in('shipping','completed')) or (o.status='shipping' and p_status='completed')) then raise exception 'This status change is not allowed.';end if;
 if p_status in('shipping','completed') and o.payment_method='gcash' and o.payment_status<>'paid' then raise exception 'Verify the GCash payment before shipping/completing the order.';end if;
 if p_status='cancelled' then
  for r in select product_id,sum(quantity)::integer n from public.order_items where order_id=p_order and product_id is not null group by product_id order by product_id loop
   update public.products set stock=stock+r.n where id=r.product_id;
  end loop;
  for r in select product_variant_id,sum(quantity)::integer n from public.order_items where order_id=p_order and product_variant_id is not null group by product_variant_id order by product_variant_id loop
   update public.product_variants set stock=stock+r.n where id=r.product_variant_id;
  end loop;
 end if;
 update public.orders set status=p_status,stock_restored_at=case when p_status='cancelled' then now() else stock_restored_at end where id=p_order;
 insert into public.order_status_history(order_id,status,note,created_by)values(p_order,p_status,case when p_status='cancelled' then coalesce(nullif(trim(p_note),''),'Order cancelled; stock restored') else nullif(trim(p_note),'') end,p_admin);
end;$$;

create or replace function public.lnr_submit_order_payment(p_user uuid,p_order uuid,p_name text,p_phone text,p_reference text,p_proof text)returns void language plpgsql set search_path=public,pg_temp as $$
declare o public.orders%rowtype;old public.gcash_payments%rowtype;
begin
 select * into o from public.orders where id=p_order for update;
 if not found or not exists(select 1 from public.customers where id=o.customer_id and auth_user_id=p_user and status='active') then raise exception 'This order is not available for your account.';end if;
 if o.status<>'pending' or o.payment_method<>'gcash' or o.payment_status not in('pending','rejected') then raise exception 'This payment cannot be changed.';end if;
 if nullif(trim(p_name),'') is null or length(p_name)>150 or p_phone is null or p_phone !~ '^09[0-9]{9}$' or length(coalesce(p_reference,''))>100 then raise exception 'Check the payment sender details.';end if;
 perform public.lnr_check_proof(p_user,p_proof);
 select * into old from public.gcash_payments where order_id=p_order for update;
 if found then
  if old.status<>'rejected' then raise exception 'A payment has already been submitted for review.';end if;
  insert into public.payment_submission_history(source_kind,source_id,previous_submission,changed_by)values('order',old.id,to_jsonb(old),p_user);
  update public.gcash_payments set sender_name=trim(p_name),phone_number=p_phone,reference_number=nullif(trim(p_reference),''),screenshot_url=p_proof,status='pending',rejection_reason=null,reviewed_at=null,reviewed_by=null,created_at=now() where id=old.id;
 else
  insert into public.gcash_payments(order_id,sender_name,phone_number,reference_number,screenshot_url)values(p_order,trim(p_name),p_phone,nullif(trim(p_reference),''),p_proof);
 end if;
 update public.orders set payment_status='pending' where id=p_order;
 insert into public.order_status_history(order_id,status,note,created_by)values(p_order,o.status,'GCash proof submitted',p_user);
end;$$;
create or replace function public.lnr_review_order_payment(p_order uuid,p_decision text,p_admin uuid,p_reason text default null)returns void language plpgsql set search_path=public,pg_temp as $$
declare o public.orders%rowtype;pay public.gcash_payments%rowtype;next_status text;
begin
 if not public.lnr_is_admin(p_admin) then raise exception 'Administrator access required.';end if;
 if p_decision is null or p_decision not in('paid','rejected') then raise exception 'Invalid payment decision.';end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.status<>'pending' or o.payment_method<>'gcash' then raise exception 'This order is not awaiting payment review.';end if;
 select * into pay from public.gcash_payments where order_id=p_order for update;
 if not found or pay.status<>'pending' then raise exception 'This payment is not awaiting review.';end if;
 next_status:=case when p_decision='paid' then 'shipping' else o.status end;
 update public.gcash_payments set status=p_decision,rejection_reason=case when p_decision='rejected' then nullif(trim(p_reason),'') else null end,reviewed_by=p_admin,reviewed_at=now() where id=pay.id;
 update public.orders set payment_status=p_decision,status=next_status,payment_reference=pay.reference_number where id=p_order;
 insert into public.order_status_history(order_id,status,note,created_by)values(p_order,next_status,case when p_decision='paid' then 'GCash payment verified' else 'GCash payment rejected: '||coalesce(nullif(trim(p_reason),''),'submit a corrected proof') end,p_admin);
end;$$;

-- Existing duplicate/overbooked data is flagged rather than deleted automatically.
do $$begin
 if exists(select 1 from public.event_registrations where status='registered' group by event_id,customer_id having count(*)>1) then raise exception 'Duplicate active registrations exist. Run 00_check_existing_data.sql and review them first.';end if;
 if exists(select 1 from public.events e where e.capacity>0 and (select count(*) from public.event_registrations r where r.event_id=e.id and r.status='registered')>e.capacity) then raise exception 'An event is already over capacity. Review the real capacity/registrations first.';end if;
end;$$;
create unique index if not exists event_registration_one_active_per_customer on public.event_registrations(event_id,customer_id) where status='registered';
update public.events e set slots_booked=(select count(*) from public.event_registrations r where r.event_id=e.id and r.status='registered');
create or replace function public.lnr_registration_capacity()returns trigger language plpgsql set search_path=public,pg_temp as $$
declare e public.events%rowtype;eid uuid;delta integer:=0;
begin
 if tg_op='UPDATE' and (new.event_id<>old.event_id or new.customer_id<>old.customer_id) then raise exception 'A registration cannot be moved to another customer or event.';end if;
 if tg_op='INSERT' then eid:=new.event_id;delta:=case when new.status='registered' then 1 else 0 end;
 elsif tg_op='DELETE' then eid:=old.event_id;delta:=case when old.status='registered' then -1 else 0 end;
 else eid:=new.event_id;delta:=(case when new.status='registered' then 1 else 0 end)-(case when old.status='registered' then 1 else 0 end);end if;
 if delta=0 then return null;end if;
 select * into e from public.events where id=eid for update;
 if not found then if tg_op='DELETE' then return null;end if;raise exception 'Event not found.';end if;
 if delta>0 then
  if e.status<>'published' or e.event_date<=now() then raise exception 'This event is not open for registration.';end if;
  if e.capacity>0 and e.slots_booked>=e.capacity then raise exception 'This event is fully booked.';end if;
 end if;
 update public.events set slots_booked=greatest(0,slots_booked+delta) where id=e.id;return null;
end;$$;
drop trigger if exists lnr_registration_capacity_trigger on public.event_registrations;
create trigger lnr_registration_capacity_trigger after insert or delete or update of status,event_id,customer_id on public.event_registrations for each row execute function public.lnr_registration_capacity();
create or replace function public.lnr_register_event(p_user uuid,p_event uuid,p_rider text,p_plate text,p_category text)returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare c public.customers%rowtype;e public.events%rowtype;code text;
begin
 select * into c from public.customers where auth_user_id=p_user and status='active';
 if not found or public.lnr_is_admin(p_user) then raise exception 'Sign in with an active customer account.';end if;
 if nullif(trim(p_rider),'') is null or length(p_rider)>150 or length(coalesce(p_plate,''))>60 or length(coalesce(p_category,''))>100 then raise exception 'Check the rider details.';end if;
 select * into e from public.events where id=p_event for update;if not found then raise exception 'Event not found.';end if;
 select registration_code into code from public.event_registrations where event_id=p_event and customer_id=c.id and status='registered';
 if found then return jsonb_build_object('registrationCode',code,'paymentMethod','gcash');end if;
 if e.status<>'published' or e.event_date<=now() then raise exception 'This event is not open for registration.';end if;
 code:='EVR-'||extract(year from now())||'-'||upper(replace(gen_random_uuid()::text,'-',''));
 insert into public.event_registrations(registration_code,event_id,customer_id,customer_name,customer_email,customer_phone,rider_name,plate_number,category,amount_paid,payment_method,payment_status,status)values(code,e.id,c.id,c.full_name,c.email,c.phone,trim(p_rider),nullif(trim(p_plate),''),nullif(trim(p_category),''),e.price,'gcash',case when e.price=0 then 'paid' else 'pending' end,'registered');
 return jsonb_build_object('registrationCode',code,'paymentMethod','gcash');
end;$$;
create or replace function public.lnr_submit_event_payment(p_user uuid,p_code text,p_name text,p_phone text,p_reference text,p_proof text)returns void language plpgsql set search_path=public,pg_temp as $$
declare r public.event_registrations%rowtype;
begin
 select * into r from public.event_registrations where registration_code=p_code for update;
 if not found or not exists(select 1 from public.customers where id=r.customer_id and auth_user_id=p_user and status='active') then raise exception 'This registration is not available for your account.';end if;
 if r.status<>'registered' or r.payment_status not in('pending','rejected') then raise exception 'This payment cannot be changed.';end if;
 if nullif(trim(p_name),'') is null or length(p_name)>150 or p_phone is null or p_phone !~ '^09[0-9]{9}$' or length(coalesce(p_reference,''))>100 then raise exception 'Check the payment sender details.';end if;
 perform public.lnr_check_proof(p_user,p_proof);
 if r.proof_screenshot_url is not null then
  if r.payment_status<>'rejected' then raise exception 'A payment has already been submitted for review.';end if;
  insert into public.payment_submission_history(source_kind,source_id,previous_submission,changed_by)values('event',r.id,to_jsonb(r),p_user);
 end if;
 update public.event_registrations set proof_screenshot_url=p_proof,payment_status='pending',payment_sender_name=trim(p_name),payment_phone_number=p_phone,reference_number=nullif(trim(p_reference),''),rejection_reason=null,reviewed_at=null,reviewed_by=null where id=r.id;
end;$$;
create or replace function public.lnr_review_event_payment(p_registration uuid,p_decision text,p_admin uuid,p_reason text default null)returns void language plpgsql set search_path=public,pg_temp as $$
declare r public.event_registrations%rowtype;
begin
 if not public.lnr_is_admin(p_admin) then raise exception 'Administrator access required.';end if;
 if p_decision is null or p_decision not in('paid','rejected') then raise exception 'Invalid payment decision.';end if;
 select * into r from public.event_registrations where id=p_registration for update;
 if not found or r.status<>'registered' or r.payment_status<>'pending' or r.proof_screenshot_url is null then raise exception 'This registration is not awaiting payment review.';end if;
 update public.event_registrations set payment_status=p_decision,rejection_reason=case when p_decision='rejected' then nullif(trim(p_reason),'') else null end,reviewed_at=now(),reviewed_by=p_admin where id=r.id;
end;$$;
create or replace function public.lnr_set_registration_status(p_registration uuid,p_status text,p_admin uuid)returns void language plpgsql set search_path=public,pg_temp as $$
declare eid uuid;
begin
 if not public.lnr_is_admin(p_admin) then raise exception 'Administrator access required.';end if;
 if p_status is null or p_status not in('registered','cancelled') then raise exception 'Invalid registration status.';end if;
 select event_id into eid from public.event_registrations where id=p_registration;if not found then raise exception 'Registration not found.';end if;
 perform id from public.events where id=eid for update;perform id from public.event_registrations where id=p_registration for update;
 update public.event_registrations set status=p_status where id=p_registration;
end;$$;
-- Explicit one-time repair for a selected cancellation made before this migration.
create or replace function public.lnr_restore_old_cancelled_stock(p_order uuid,p_admin uuid)returns void language plpgsql set search_path=public,pg_temp as $$
declare o public.orders%rowtype;r record;
begin
 if not public.lnr_is_admin(p_admin) then raise exception 'Administrator access required.';end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.status<>'cancelled' then raise exception 'Choose an existing cancelled order.';end if;
 if o.stock_restored_at is not null then return;end if;
 for r in select product_id,sum(quantity)::integer n from public.order_items where order_id=p_order and product_id is not null group by product_id order by product_id loop
  update public.products set stock=stock+r.n where id=r.product_id;
 end loop;
 for r in select product_variant_id,sum(quantity)::integer n from public.order_items where order_id=p_order and product_variant_id is not null group by product_variant_id order by product_variant_id loop
  update public.product_variants set stock=stock+r.n where id=r.product_variant_id;
 end loop;
 update public.orders set stock_restored_at=now() where id=p_order;
 insert into public.order_status_history(order_id,status,note,created_by)values(p_order,'cancelled','Legacy cancellation repaired; stock restored once',p_admin);
end;$$;

-- No browser may call the privileged RPCs directly.
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and left(p.proname,4)='lnr_' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end;$$;
update public.products p set category_id=c.id from public.bike_builder_products bp
 join public.categories c on c.slug=case bp.step_number when 1 then 'frameset' when 2 then 'handlebar' when 3 then 'stem' when 4 then 'seatpost' when 5 then 'saddle' when 6 then 'wheelset' when 7 then 'tires' when 8 then 'front-derailleur' when 9 then 'rear-derailleur' when 10 then 'crankset' when 11 then 'cassette' when 12 then 'chain' when 13 then 'brakeset' when 14 then 'rotors' when 15 then 'pedals' end
 where p.id=bp.product_id and p.category_id='00000000-0000-4000-8000-000000000102'::uuid and p.sku like 'BB-%';

create table if not exists public.homepage_banners(id uuid primary key default gen_random_uuid(),image_url text not null unique,sort_order integer not null default 0,is_active boolean not null default true,created_at timestamptz not null default now());
alter table public.homepage_banners enable row level security;
drop policy if exists homepage_banners_public_read on public.homepage_banners;
create policy homepage_banners_public_read on public.homepage_banners for select to anon,authenticated using(is_active);
grant select on public.homepage_banners to anon,authenticated;
revoke insert,update,delete on public.homepage_banners from anon,authenticated;
grant all on public.homepage_banners to service_role;
insert into public.homepage_banners(id,image_url,sort_order)values('a0000000-0000-4000-8000-000000000001','/Customerpageimages/lnr%20image%20placeholder%201.png',0),('a0000000-0000-4000-8000-000000000002','/Customerpageimages/lnr%20placeholder%201.png',1)on conflict do nothing;
commit;
