-- Requires 0025_store_sales_and_build_returns.sql. No catalogue products are created.
begin;
alter table public.order_items add column if not exists is_custom_item boolean not null default false;
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
 or char_length(coalesce(p_input->>'address',''))>1000 or char_length(coalesce(p_input->>'notes',''))>2000 or char_length(coalesce(p_input->>'reference',''))>150 then raise exception 'Sale details are too long.';end if;
 if method='gcash' and char_length(btrim(coalesce(p_input->>'reference','')))<4 then raise exception 'Enter the actual GCash payment reference.';end if;
 insert into public.order_number_counters(year,last_number)
 values(year_value,coalesce((select max(substring(order_number from '^ORD-[0-9]{4}-([0-9]+)$')::bigint) from public.orders where order_number like 'ORD-'||year_value||'-%'),0)+1)
 on conflict(year) do update set last_number=order_number_counters.last_number+1 returning last_number into seq;
 number_value:='ORD-'||year_value||'-'||lpad(seq::text,6,'0');
 insert into public.orders(id,order_number,customer_name,customer_phone,subtotal,shipping_fee,discount,total,payment_method,payment_status,status,payment_reference,notes,sale_channel,recorded_by,custom_build_id,shipping_address)
 values(p_id,number_value,coalesce(nullif(btrim(p_input->>'customerName'),''),'Walk-in customer'),nullif(btrim(p_input->>'phone'),''),0,0,0,0,method,'paid','completed',nullif(btrim(p_input->>'reference'),''),nullif(btrim(p_input->>'notes'),''),'in_store',p_admin,case when kind='custom' then gen_random_uuid() else null end,nullif(btrim(p_input->>'address'),''));
 for line in select value from jsonb_array_elements(p_input->'items') order by value->>'productId',value->>'variantId' loop
  if jsonb_typeof(line) is distinct from 'object' or jsonb_typeof(line->'quantity') is distinct from 'number' or coalesce(line->>'quantity','') !~ '^[0-9]{1,5}$' then raise exception 'Invalid product or quantity.';end if;
  qty:=(line->>'quantity')::int;if qty not between 1 and 10000 then raise exception 'Quantity must be between 1 and 10000.';end if;
  if line->>'type'='custom' then
   if jsonb_typeof(line->'name') is distinct from 'string' or char_length(btrim(coalesce(line->>'name',''))) not between 2 and 200 then raise exception 'Enter a custom product name (2 to 200 characters).';end if;
   if jsonb_typeof(line->'unitPrice') is distinct from 'number' or coalesce(line->>'unitPrice','') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then raise exception 'Enter a valid custom unit price with up to two decimal places.';end if;
   amount:=(line->>'unitPrice')::numeric;
   insert into public.order_items(order_id,product_name,unit_price,quantity,line_total,is_custom_item)
   values(p_id,btrim(line->>'name'),amount,qty,amount*qty,true);
   sum_value:=sum_value+amount*qty;
   continue;
  end if;
  if nullif(line->>'type','') is not null and line->>'type'<>'catalogue' then raise exception 'Choose catalogue or custom product.';end if;
  if coalesce(line->>'productId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Choose a catalogue product.';end if;
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
 if sum_value>9999999999.99 then raise exception 'The sale total is too large.';end if;
 update public.orders set subtotal=sum_value,total=sum_value where id=p_id;
 insert into public.order_status_history(order_id,status,note,created_by)values(p_id,'completed','In-store sale: payment collected and items handed over.',p_admin);
 return jsonb_build_object('orderNumber',number_value,'total',sum_value);
end;$$;
revoke all on function public.lnr_record_store_sale(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.lnr_record_store_sale(uuid,uuid,jsonb) to service_role;
commit;
