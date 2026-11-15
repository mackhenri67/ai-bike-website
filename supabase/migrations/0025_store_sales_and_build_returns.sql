-- Apply after 0024_order_returns.sql. Adds in-store sales and whole-build returns.
-- Does not delete orders or change existing stock. Existing returns retain item scope.
begin;
alter table public.orders add column if not exists sale_channel text not null default 'online' check(sale_channel in('online','in_store'));
alter table public.orders add column if not exists recorded_by uuid references auth.users(id);
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check(payment_method in('gcash','cod','cash'));
alter table public.return_requests add column if not exists return_scope text not null default 'item' check(return_scope in('item','build'));
create unique index if not exists lnr_one_active_build_return on public.return_requests(order_id) where return_scope='build' and status<>'rejected';

-- Canonical evidence/return anchor: custom bikes are returned as one order.
create or replace function public.lnr_return_target(p_user uuid,p_item uuid)
returns uuid language plpgsql stable set search_path=public,pg_temp as $$
declare cid uuid;o public.orders%rowtype;target uuid;
begin
 cid:=public.lnr_return_customer(p_user);
 select orders.* into o from public.orders join public.order_items i on i.order_id=orders.id where i.id=p_item and orders.customer_id=cid;
 if o.id is null then raise exception 'Order item not available.';end if;
 if o.custom_build_id is null then return p_item;end if;
 select id into target from public.order_items where order_id=o.id order by id limit 1;
 return target;
end;$$;

create or replace function public.lnr_return_item_context(p_user uuid,p_item uuid)
returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare cid uuid;o public.orders%rowtype;i public.order_items%rowtype;eligible boolean;
begin
 cid:=public.lnr_return_customer(p_user);
 select * into i from public.order_items where id=p_item;
 select * into o from public.orders where id=i.order_id and customer_id=cid;
 if o.id is null then raise exception 'Order item not available.';end if;
 eligible:=o.status='completed' and o.completed_at is not null and now()>=o.completed_at and now()<o.completed_at+interval '3 days';
 return jsonb_build_object('eligible',coalesce(eligible,false),'completed_at',o.completed_at,'deadline',o.completed_at+interval '3 days',
 'order_status',o.status,'scope',case when o.custom_build_id is not null then 'build' else 'item' end,
 'product_name',case when o.custom_build_id is not null then 'Custom bike build' else i.product_name end,
 'quantity',case when o.custom_build_id is not null then 1 else i.quantity end,
 'item_value',case when o.custom_build_id is not null then greatest(o.subtotal-o.discount,0) else i.line_total end,
 'build_items',case when o.custom_build_id is not null then (select jsonb_agg(jsonb_build_object('product_name',x.product_name,'quantity',x.quantity,'size',x.size,'color',x.color) order by x.id) from public.order_items x where x.order_id=o.id) else '[]'::jsonb end,
 'requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object(
 'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'mime_type',e.mime_type,'file_name',e.file_name,'byte_size',e.byte_size))from public.return_evidence e where e.request_id=r.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('status',h.status,'note',h.note,'created_at',h.created_at,'actor_role',h.actor_role)order by h.id)from public.return_request_events h where h.request_id=r.id),'[]'::jsonb)
 )order by r.created_at desc)from public.return_requests r where r.order_id=o.id and (o.custom_build_id is not null or r.order_item_id=i.id) and r.customer_id=cid),'[]'::jsonb));
end;$$;
create or replace function public.lnr_prepare_return_upload(p_user uuid,p_item uuid,p_asset uuid,p_name text,p_mime text,p_size integer)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare cid uuid;ctx jsonb;e public.return_evidence%rowtype;ext text;
begin
 cid:=public.lnr_return_customer(p_user);perform pg_advisory_xact_lock(hashtextextended(cid::text,24));
 p_item:=public.lnr_return_target(p_user,p_item);
 ctx:=public.lnr_return_item_context(p_user,p_item);
 if not (ctx->>'eligible')::boolean then raise exception 'Return requests must be submitted within three days of delivery.';end if;
 if p_asset is null or p_size is null or p_size<1 or p_size>20971520 or p_mime is null or
 p_mime not in('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime')or
 (p_mime like 'image/%'and p_size>5242880)then raise exception 'Use a photo up to 5 MB or a video up to 20 MB.';end if;
 select * into e from public.return_evidence where id=p_asset;
 if found then
  if e.customer_id<>cid or e.order_item_id<>p_item or e.request_id is not null or e.mime_type<>p_mime or e.byte_size<>p_size then raise exception 'Evidence reference is not available.';end if;
  return jsonb_build_object('id',e.id,'path',e.object_path);
 end if;
 if(select count(*)from public.return_evidence where customer_id=cid and created_at>clock_timestamp()-interval '10 minutes')>=20 then raise exception 'Too many uploads. Please try again in a few minutes.';end if;
 ext:=case p_mime when'image/jpeg'then'jpg'when'image/png'then'png'when'image/webp'then'webp'when'video/webm'then'webm'when'video/quicktime'then'mov'else'mp4'end;
 insert into public.return_evidence(id,customer_id,order_item_id,object_path,file_name,mime_type,byte_size)
 values(p_asset,cid,p_item,p_user::text||'/'||p_asset::text||'.'||ext,left(coalesce(nullif(btrim(p_name),''),'Evidence'),120),p_mime,p_size)returning * into e;
 return jsonb_build_object('id',e.id,'path',e.object_path);
end;$$;
create or replace function public.lnr_submit_return(p_user uuid,p_item uuid,p_id uuid,p_reason text,p_assets uuid[])
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare cid uuid;o public.orders%rowtype;i public.order_items%rowtype;r public.return_requests%rowtype;asset uuid;e public.return_evidence%rowtype;
begin
 cid:=public.lnr_return_customer(p_user);
 p_item:=public.lnr_return_target(p_user,p_item);
 select * into i from public.order_items where id=p_item for update;
 select * into o from public.orders where id=i.order_id and customer_id=cid for update;
 if o.id is null then raise exception 'Order item not available.';end if;
 select * into r from public.return_requests where id=p_id;
 if found then
  if r.customer_id<>cid or r.order_item_id<>p_item then raise exception 'Request reference is not available.';end if;
  return to_jsonb(r);
 end if;
 if o.status<>'completed' or o.completed_at is null or clock_timestamp()<o.completed_at or clock_timestamp()>=o.completed_at+interval '3 days' then raise exception 'Return requests must be submitted within three days of delivery.';end if;
 if p_id is null or p_reason is null or char_length(btrim(p_reason))not between 10 and 2000 then raise exception 'Explain the reason using 10 to 2000 characters.';end if;
 if exists(select 1 from public.return_requests where order_id=o.id and (o.custom_build_id is not null or order_item_id=i.id) and status<>'rejected')then raise exception 'This item already has a return/refund request.';end if;
 if coalesce(array_length(p_assets,1),0)not between 1 and 3 or(select count(distinct x)from unnest(p_assets)x)<>array_length(p_assets,1)then raise exception 'Attach one to three photos or videos.';end if;
 foreach asset in array p_assets loop
  select * into e from public.return_evidence where id=asset for update;
  if e.id is null or e.customer_id<>cid or e.order_item_id<>i.id or e.request_id is not null then raise exception 'One of the evidence files is not available.';end if;
  if not exists(select 1 from storage.objects s where s.bucket_id='return-evidence'and s.name=e.object_path and(s.metadata->>'size')::bigint=e.byte_size and s.metadata->>'mimetype'=e.mime_type)then raise exception 'An evidence upload is incomplete. Please retry the upload.';end if;
 end loop;
 insert into public.return_requests(id,order_id,order_item_id,customer_id,reason,return_scope)values(p_id,o.id,i.id,cid,btrim(p_reason),case when o.custom_build_id is not null then 'build' else 'item' end)returning * into r;
 update public.return_evidence set request_id=r.id where id=any(p_assets);
 insert into public.return_request_events(request_id,actor_id,actor_role,status,note)values(r.id,p_user,'customer','pending','Request submitted for admin review.');
 return to_jsonb(r);
end;$$;

-- The server supplies p_admin from its verified session. Clients cannot execute this RPC directly.
-- One transaction reserves stock, writes the completed sale, and records its history.
create or replace function public.lnr_record_store_sale(p_admin uuid,p_id uuid,p_input jsonb)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare o public.orders%rowtype;p public.products%rowtype;v public.product_variants%rowtype;
 line jsonb;pid uuid;vid uuid;qty integer;amount numeric;sum_value numeric:=0;seq bigint;number_value text;
 options_value text;year_value int:=extract(year from clock_timestamp() at time zone 'Asia/Manila');
 method text:=p_input->>'paymentMethod';kind text:=p_input->>'kind';
begin
 if p_admin is null or not public.lnr_is_admin(p_admin) then raise exception 'Administrator access required.';end if;
 if p_id is null then raise exception 'A sale reference is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,25));
 select * into o from public.orders where id=p_id;
 if found then
  if o.sale_channel<>'in_store' or o.recorded_by is distinct from p_admin then raise exception 'Sale reference is unavailable.';end if;
  return jsonb_build_object('orderNumber',o.order_number,'total',o.total);
 end if;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>60000
 or jsonb_typeof(p_input->'items') is distinct from 'array' then raise exception 'Invalid sale details.';end if;
 if jsonb_array_length(p_input->'items') not between 1 and 100 then raise exception 'Choose one to 100 order lines.';end if;
 if method is null or method not in('cash','gcash') or kind is null or kind not in('parts','custom') then raise exception 'Choose a valid sale type and payment method.';end if;
 if (p_input->>'confirmed') is distinct from 'true' then raise exception 'Confirm payment and handover before recording the sale.';end if;
 if char_length(coalesce(p_input->>'customerName',''))>150 or char_length(coalesce(p_input->>'phone',''))>40
 or char_length(coalesce(p_input->>'notes',''))>2000 or char_length(coalesce(p_input->>'reference',''))>150 then raise exception 'Sale details are too long.';end if;
 if method='gcash' and char_length(btrim(coalesce(p_input->>'reference','')))<4 then raise exception 'Enter the actual GCash payment reference.';end if;
 insert into public.order_number_counters(year,last_number)
 values(year_value,coalesce((select max(substring(order_number from '^ORD-[0-9]{4}-([0-9]+)$')::bigint) from public.orders where order_number like 'ORD-'||year_value||'-%'),0)+1)
 on conflict(year) do update set last_number=order_number_counters.last_number+1 returning last_number into seq;
 number_value:='ORD-'||year_value||'-'||lpad(seq::text,6,'0');
 insert into public.orders(id,order_number,customer_name,customer_phone,subtotal,shipping_fee,discount,total,payment_method,payment_status,status,payment_reference,notes,sale_channel,recorded_by,custom_build_id)
 values(p_id,number_value,coalesce(nullif(btrim(p_input->>'customerName'),''),'Walk-in customer'),nullif(btrim(p_input->>'phone'),''),0,0,0,0,method,'paid','completed',nullif(btrim(p_input->>'reference'),''),nullif(btrim(p_input->>'notes'),''),'in_store',p_admin,case when kind='custom' then gen_random_uuid() else null end);
 for line in select value from jsonb_array_elements(p_input->'items') order by value->>'productId',value->>'variantId' loop
  if jsonb_typeof(line) is distinct from 'object' or coalesce(line->>'productId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or jsonb_typeof(line->'quantity') is distinct from 'number' or coalesce(line->>'quantity','') !~ '^[0-9]{1,5}$' then raise exception 'Invalid product or quantity.';end if;
  qty:=(line->>'quantity')::int;if qty not between 1 and 10000 then raise exception 'Quantity must be between 1 and 10000.';end if;
  pid:=(line->>'productId')::uuid;vid:=null;options_value:=null;
  select * into p from public.products where id=pid for update;
  if not found or p.status<>'active' then raise exception 'A selected product is unavailable.';end if;
  if p.category_id is not null and not exists(select 1 from public.categories where id=p.category_id and is_active) then raise exception 'A selected category is unavailable.';end if;
  amount:=p.price;
  if exists(select 1 from public.product_variants where product_id=pid and not retired) then
   if coalesce(line->>'variantId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Choose a product combination.';end if;
   vid:=(line->>'variantId')::uuid;
   select * into v from public.product_variants where id=vid and product_id=pid and available and not retired for update;
   if not found or v.stock<qty then raise exception 'The selected combination has insufficient stock.';end if;
   amount:=v.price;
   select string_agg(key||': '||value,' · ' order by key) into options_value from jsonb_each_text(v.options);
   update public.product_variants set stock=stock-qty where id=vid;
  elsif nullif(line->>'variantId','') is not null then raise exception 'This product has no selectable combinations.';
  end if;
  if p.stock<qty then raise exception 'A selected product has insufficient stock.';end if;
  update public.products set stock=stock-qty where id=pid;
  insert into public.order_items(order_id,product_id,product_variant_id,product_name,size,unit_price,quantity,line_total)
  values(p_id,pid,vid,p.name,options_value,amount,qty,amount*qty);
  sum_value:=sum_value+amount*qty;
 end loop;
 update public.orders set subtotal=sum_value,total=sum_value where id=p_id;
 insert into public.order_status_history(order_id,status,note,created_by)values(p_id,'completed','In-store sale: payment collected and items handed over.',p_admin);
 return jsonb_build_object('orderNumber',number_value,'total',sum_value);
end;$$;
revoke all on function public.lnr_record_store_sale(uuid,uuid,jsonb),public.lnr_return_target(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lnr_record_store_sale(uuid,uuid,jsonb),public.lnr_return_target(uuid,uuid) to service_role;
commit;
