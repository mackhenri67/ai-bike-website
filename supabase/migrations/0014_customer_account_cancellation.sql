-- Requires 0013. No tables or historical rows are deleted.
begin;
create or replace function public.lnr_cancel_customer_order(p_order uuid,p_user uuid)returns void language plpgsql set search_path=public,pg_temp as $$
declare o public.orders%rowtype;r record;p_status text:='cancelled';p_note text:='Cancelled by customer';
begin

 select * into o from public.orders where id=p_order for update;
 if not found or not exists(select 1 from public.customers where id=o.customer_id and auth_user_id=p_user and status='active') or public.lnr_is_admin(p_user) then raise exception 'Order not available for your account.';end if;
 if o.status='cancelled' then return;end if;
 if o.status<>'pending' then raise exception 'Orders can only be cancelled while still processing.';end if;
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
 insert into public.order_status_history(order_id,status,note,created_by)values(p_order,p_status,case when p_status='cancelled' then coalesce(nullif(trim(p_note),''),'Order cancelled; stock restored') else nullif(trim(p_note),'') end,p_user);
end;$$;
create or replace function public.lnr_cancel_customer_registration(p_registration uuid,p_user uuid)returns void language plpgsql set search_path=public,pg_temp as $$
declare r public.event_registrations%rowtype;eid uuid; event_time timestamptz;
begin
 select event_id into eid from public.event_registrations where id=p_registration;
 if not found then raise exception 'Registration not found.';end if;
 select event_date into event_time from public.events where id=eid for update;
 select * into r from public.event_registrations where id=p_registration for update;
 if not found or not exists(select 1 from public.customers where id=r.customer_id and auth_user_id=p_user and status='active') or public.lnr_is_admin(p_user) then raise exception 'Registration not available for your account.';end if;
 if r.status='cancelled' then return;end if;
 if event_time<=now() then raise exception 'This event has already started. Contact the shop.';end if;
 -- Existing registration trigger adjusts event slots once on this transition.
 update public.event_registrations set status='cancelled' where id=r.id;
end;$$;
revoke all on function public.lnr_cancel_customer_order(uuid,uuid),public.lnr_cancel_customer_registration(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lnr_cancel_customer_order(uuid,uuid),public.lnr_cancel_customer_registration(uuid,uuid) to service_role;
commit;
