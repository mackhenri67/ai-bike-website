-- Run after 0012_complete_repairs.sql. Keeps existing IDs and order references.
begin;
alter table public.product_variants add column if not exists options jsonb not null default '{}'::jsonb;
alter table public.product_variants add column if not exists retired boolean not null default false;
update public.product_variants set options=jsonb_strip_nulls(jsonb_build_object('Size',nullif(trim(size),''),'Color',nullif(trim(color),''))) where options='{}'::jsonb;

-- Product, pictures and combination stocks are committed together. Checkout
-- takes this same product lock, so a stale editor cannot overwrite a sale.
create or replace function public.lnr_save_product_options(p_id uuid,p_input jsonb)
returns uuid language plpgsql set search_path=public,pg_temp as $$
declare pid uuid:=p_id; p public.products%rowtype; v public.product_variants%rowtype;
 row_value jsonb; vid uuid; kept uuid[]:='{}'; seen jsonb:='[]'; opts jsonb; keys_value text[]; first_keys text[];
 qty integer; price_value numeric; total_stock integer:=0; label_value text; image_value jsonb; position_value integer:=0;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>500000 then raise exception 'Invalid product input.';end if;
 if nullif(trim(p_input->>'name'),'') is null or nullif(trim(p_input->>'slug'),'') is null then raise exception 'Name and slug are required.';end if;
 if jsonb_typeof(p_input->'variants') is distinct from 'array' or jsonb_array_length(p_input->'variants')>200 then raise exception 'Use at most 200 combinations.';end if;
 if (p_input->>'price')::numeric<=0 or (p_input->>'stock')::numeric<0 or (p_input->>'stock')::numeric<>trunc((p_input->>'stock')::numeric) then raise exception 'Invalid price or stock.';end if;
 if pid is not null then
  select * into p from public.products where id=pid for update;
  if not found then raise exception 'Product no longer exists.';end if;
  if p_input->>'expected_stock' is null or p.stock<>(p_input->>'expected_stock')::integer then raise exception 'Stock changed while editing. Close and reopen this product before saving.';end if;
 else
  insert into public.products(name,slug,price,stock) values(trim(p_input->>'name'),p_input->>'slug',(p_input->>'price')::numeric,0) returning id into pid;
 end if;
 for row_value in select value from jsonb_array_elements(p_input->'variants') loop
  opts:=row_value->'options';
  if jsonb_typeof(opts) is distinct from 'object' or opts='{}'::jsonb then raise exception 'Every combination needs customization choices.';end if;
  if exists(select 1 from jsonb_each(opts) e where jsonb_typeof(e.value)<>'string' or length(trim(e.key)) not between 1 and 80 or length(trim(e.value#>>'{}')) not between 1 and 150) then raise exception 'Invalid customization label or value.';end if;
  select array_agg(key order by key) into keys_value from jsonb_object_keys(opts) key;
  if cardinality(keys_value)>10 then raise exception 'Use at most 10 customization fields.';end if;
  if first_keys is null then first_keys:=keys_value;elsif first_keys<>keys_value then raise exception 'Every combination must use the same fields.';end if;
  if seen @> jsonb_build_array(opts) then raise exception 'Duplicate customization combination.';end if;
  seen:=seen||jsonb_build_array(opts);
  if coalesce(row_value->>'stock','') !~ '^[0-9]{1,7}$' or jsonb_typeof(row_value->'available') is distinct from 'boolean' then raise exception 'Stock must be a nonnegative whole number and availability must be set.';end if;
  qty:=(row_value->>'stock')::integer;price_value:=(row_value->>'price')::numeric;
  if price_value is null or price_value<=0 then raise exception 'Set a positive combination price.';end if;
  select string_agg(key||': '||value,' · ' order by key) into label_value from jsonb_each_text(opts);
  vid:=nullif(row_value->>'id','')::uuid;
  if vid is not null then
   select * into v from public.product_variants where id=vid and product_id=pid for update;
   if not found or v.retired then raise exception 'A combination changed. Reopen the product.';end if;
   if v.options<>opts then raise exception 'Generate a new row when changing combination choices.';end if;
   if row_value->>'expected_stock' is null or v.stock<>(row_value->>'expected_stock')::integer then raise exception 'Combination stock changed. Reopen the product.';end if;
   update public.product_variants set sku=nullif(row_value->>'sku',''),name=label_value,price=price_value,stock=qty,available=(row_value->>'available')::boolean,sort_order=position_value where id=vid;
  else
   insert into public.product_variants(product_id,sku,name,size,color,options,price,stock,available,sort_order)
   values(pid,nullif(row_value->>'sku',''),label_value,null,null,opts,price_value,qty,(row_value->>'available')::boolean,position_value) returning id into vid;
  end if;
  kept:=array_append(kept,vid);position_value:=position_value+10;
  if (row_value->>'available')::boolean then total_stock:=total_stock+qty;end if;
 end loop;
 -- Archive removed choices rather than delete rows referenced by past orders.
 update public.product_variants set retired=true,available=false where product_id=pid and not(id=any(kept));
 update public.products set category_id=nullif(p_input->>'category_id','')::uuid,name=trim(p_input->>'name'),slug=p_input->>'slug',sku=nullif(p_input->>'sku',''),description=nullif(p_input->>'description',''),
 tagline=array(select jsonb_array_elements_text(p_input->'tagline')),specs=array(select jsonb_array_elements_text(p_input->'specs')),
 price=(p_input->>'price')::numeric,compare_at_price=(p_input->>'compare_at_price')::numeric,cost=(p_input->>'cost')::numeric,
 stock=case when cardinality(kept)>0 then total_stock else (p_input->>'stock')::integer end,
 status=(p_input->>'status'),is_featured=(p_input->>'is_featured')::boolean,is_new_arrival=(p_input->>'is_new_arrival')::boolean,sort_order=coalesce((p_input->>'sort_order')::integer,0) where id=pid;
 delete from public.product_images where product_id=pid;
 position_value:=0;
 for image_value in select value from jsonb_array_elements(p_input->'images') loop
  if nullif(trim(image_value->>'url'),'') is not null then
   insert into public.product_images(product_id,url,alt,sort_order,is_primary)values(pid,trim(image_value->>'url'),nullif(image_value->>'alt',''),position_value,position_value=0);
   position_value:=position_value+10;
  end if;
 end loop;
 return pid;
end;$$;
revoke all on function public.lnr_save_product_options(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.lnr_save_product_options(uuid,jsonb) to service_role;

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
  if length(coalesce(size_value,''))>4000 or length(coalesce(color_value,''))>150 then raise exception 'Product options are invalid.';end if;
  builder:=coalesce((item->>'builder_validated')::boolean,false);
  vid:=null;price_value:=p.price;
  if exists(select 1 from public.product_variants where product_id=pid and not retired) then
   if nullif(item->>'variantId','') is not null then
    select * into v from public.product_variants where id=(item->>'variantId')::uuid and product_id=pid and available and not retired for update;
   else
    if lower(coalesce(size_value,'')) in('one size','standard') then size_value:=null;end if;
    if lower(coalesce(color_value,'')) in('default','standard') then color_value:=null;end if;
    select * into v from public.product_variants where product_id=pid and available and not retired and (size is not null or color is not null) and nullif(trim(size),'') is not distinct from size_value and nullif(trim(color),'') is not distinct from color_value order by id limit 1 for update;
   end if;
   if not found then raise exception 'The selected customization combination is unavailable.';end if;
   if v.stock<qty then raise exception 'Not enough stock for the selected combination.';end if;
   vid:=v.id;price_value:=v.price;
   select string_agg(key||': '||value,' · ' order by key) into size_value from jsonb_each_text(v.options);color_value:=null;
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

 if p_status='cancelled' then

 for r in select distinct product_id from public.order_items where order_id=p_order and product_id is not null order by product_id loop
  if exists(select 1 from public.product_variants where product_id=r.product_id and not retired) then
   update public.products set stock=(select coalesce(sum(stock) filter(where available and not retired),0) from public.product_variants where product_id=r.product_id) where id=r.product_id;
  end if;
 end loop;
 end if;
 update public.orders set status=p_status,stock_restored_at=case when p_status='cancelled' then now() else stock_restored_at end where id=p_order;
 insert into public.order_status_history(order_id,status,note,created_by)values(p_order,p_status,case when p_status='cancelled' then coalesce(nullif(trim(p_note),''),'Order cancelled; stock restored') else nullif(trim(p_note),'') end,p_admin);
end;$$;

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

 for r in select distinct product_id from public.order_items where order_id=p_order and product_id is not null order by product_id loop
  if exists(select 1 from public.product_variants where product_id=r.product_id and not retired) then
   update public.products set stock=(select coalesce(sum(stock) filter(where available and not retired),0) from public.product_variants where product_id=r.product_id) where id=r.product_id;
  end if;
 end loop;
 update public.orders set stock_restored_at=now() where id=p_order;
 insert into public.order_status_history(order_id,status,note,created_by)values(p_order,'cancelled','Legacy cancellation repaired; stock restored once',p_admin);
end;$$;

commit;
