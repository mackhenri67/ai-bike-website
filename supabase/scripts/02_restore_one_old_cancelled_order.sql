-- OPTIONAL. Only for a cancellation made BEFORE applying the fix, where stock
-- was not already restored manually. Change the two values below.
do $$declare
 order_number_to_repair text := 'REPLACE_WITH_ORDER_NUMBER';
 admin_email text := 'REPLACE_WITH_ADMIN_EMAIL';
 target_order uuid;admin_id uuid;
begin
 if order_number_to_repair not like 'ORD-%' or position('@' in admin_email)<2 then raise exception 'Enter the order number and administrator email first.';end if;
 select id into strict target_order from public.orders where order_number=trim(order_number_to_repair);
 select id into strict admin_id from auth.users where lower(email)=lower(trim(admin_email));
 perform public.lnr_restore_old_cancelled_stock(target_order,admin_id);
 raise notice 'Stock restoration checked for %. The marker prevents this script restoring it twice.',order_number_to_repair;
end;$$;
