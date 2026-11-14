-- Customer reviews for received custom bike builds.
-- Apply after the current main-branch migrations (through 0022).
-- Existing orders remain unchanged; new builder-created orders are tagged.

begin;

alter table public.orders
  add column if not exists custom_build_id uuid;

create unique index if not exists orders_custom_build_id_unique_idx
  on public.orders(custom_build_id);

create table if not exists public.customer_build_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  custom_build_id uuid not null unique references public.orders(custom_build_id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null check (length(btrim(review_text)) between 5 and 600),
  image_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_build_reviews_status_created_idx
  on public.customer_build_reviews(status, created_at desc);
create index if not exists customer_build_reviews_customer_created_idx
  on public.customer_build_reviews(customer_id, created_at desc);

alter table public.customer_build_reviews enable row level security;
revoke all on public.customer_build_reviews from public, anon, authenticated;
grant all on public.customer_build_reviews to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-build-reviews',
  'customer-build-reviews',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict(id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists customer_build_reviews_private_guard on storage.objects;
create policy customer_build_reviews_private_guard
on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id <> 'customer-build-reviews')
with check (bucket_id <> 'customer-build-reviews');

-- Preserve the existing checkout transaction and tag an order when at least
-- one line came from the custom bike builder (builder_validated = true).
create or replace function public.lnr_place_order(
  p_user uuid,
  p_items jsonb,
  p_method text
)
returns jsonb
language plpgsql
set search_path=public,pg_temp
as $$
declare
  c public.customers%rowtype;
  loc public.customer_locations%rowtype;
  p public.products%rowtype;
  v public.product_variants%rowtype;
  item jsonb;
  qty integer;
  pid uuid;
  vid uuid;
  size_value text;
  color_value text;
  price_value numeric;
  total_value numeric := 0;
  oid uuid;
  number_value text;
  sequence_value bigint;
  year_value integer := extract(year from now());
  builder boolean;
  has_custom_build boolean := false;
begin
  if p_method not in ('gcash', 'cod') or p_method is null then
    raise exception 'Choose a valid payment method.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 100
     or octet_length(p_items::text) > 200000 then
    raise exception 'Your cart is invalid or too large.';
  end if;

  select * into c
  from public.customers
  where auth_user_id = p_user and status = 'active';
  if not found or public.lnr_is_admin(p_user) then
    raise exception 'Sign in with an active customer account.';
  end if;

  select * into loc
  from public.customer_locations
  where customer_id = c.id
  order by is_default desc, created_at desc
  limit 1;
  if not found or nullif(trim(loc.address), '') is null then
    raise exception 'Save a delivery location before checkout.';
  end if;

  insert into public.order_number_counters(year, last_number)
  values (
    year_value,
    coalesce((
      select max(substring(order_number from '^ORD-[0-9]{4}-([0-9]+)$')::bigint)
      from public.orders
      where order_number like 'ORD-' || year_value || '-%'
    ), 0) + 1
  )
  on conflict(year) do update
    set last_number = order_number_counters.last_number + 1
  returning last_number into sequence_value;

  number_value := 'ORD-' || year_value || '-' || lpad(sequence_value::text, 6, '0');

  insert into public.orders(
    order_number, customer_id, customer_name, customer_email, customer_phone,
    shipping_address, shipping_latitude, shipping_longitude, subtotal,
    shipping_fee, discount, total, payment_method, payment_status, status
  )
  values (
    number_value, c.id, c.full_name, c.email, c.phone,
    loc.address, loc.latitude, loc.longitude, 0,
    190, 0, 190, p_method, 'pending', 'pending'
  )
  returning id into oid;

  for item in
    select value
    from jsonb_array_elements(p_items)
    order by value->>'productId', value->>'size', value->>'color'
  loop
    if jsonb_typeof(item) is distinct from 'object'
       or jsonb_typeof(item->'quantity') is distinct from 'number'
       or coalesce(item->>'quantity', '') !~ '^[0-9]{1,5}$' then
      raise exception 'A cart quantity is invalid.';
    end if;

    qty := (item->>'quantity')::integer;
    if qty not between 1 and 10000 then
      raise exception 'A cart quantity is invalid.';
    end if;

    if coalesce(item->>'productId', '') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'A product reference is invalid. Refresh your cart.';
    end if;

    pid := (item->>'productId')::uuid;
    select * into p from public.products where id = pid for update;
    if not found or p.status <> 'active' then
      raise exception 'A product is no longer available. Refresh your cart.';
    end if;
    if p.category_id is not null and not exists (
      select 1 from public.categories where id = p.category_id and is_active
    ) then
      raise exception 'A product category is unavailable.';
    end if;

    size_value := nullif(trim(item->>'size'), '');
    color_value := nullif(trim(item->>'color'), '');
    if length(coalesce(size_value, '')) > 4000
       or length(coalesce(color_value, '')) > 150 then
      raise exception 'Product options are invalid.';
    end if;

    builder := coalesce((item->>'builder_validated')::boolean, false);
    if builder then
      has_custom_build := true;
    end if;

    vid := null;
    price_value := p.price;

    if exists (
      select 1 from public.product_variants
      where product_id = pid and not retired
    ) then
      if nullif(item->>'variantId', '') is not null then
        select * into v
        from public.product_variants
        where id = (item->>'variantId')::uuid
          and product_id = pid and available and not retired
        for update;
      else
        if lower(coalesce(size_value, '')) in ('one size', 'standard') then size_value := null; end if;
        if lower(coalesce(color_value, '')) in ('default', 'standard') then color_value := null; end if;
        select * into v
        from public.product_variants
        where product_id = pid and available and not retired
          and (size is not null or color is not null)
          and nullif(trim(size), '') is not distinct from size_value
          and nullif(trim(color), '') is not distinct from color_value
        order by id
        limit 1
        for update;
      end if;

      if not found then
        raise exception 'The selected customization combination is unavailable.';
      end if;
      if v.stock < qty then
        raise exception 'Not enough stock for the selected combination.';
      end if;

      vid := v.id;
      price_value := v.price;
      select string_agg(key || ': ' || value, ' · ' order by key)
      into size_value from jsonb_each_text(v.options);
      color_value := null;
      update public.product_variants set stock = stock - qty where id = vid;
    elsif not builder and (
      lower(coalesce(size_value, '')) not in ('', 'one size', 'standard')
      or lower(coalesce(color_value, '')) not in ('', 'default', 'standard')
    ) then
      raise exception 'This product does not offer the selected size/color.';
    end if;

    if p.stock < qty then
      raise exception 'Not enough stock. Reduce the total quantity of this product.';
    end if;
    update public.products set stock = stock - qty where id = pid;

    insert into public.order_items(
      order_id, product_id, product_variant_id, product_name,
      size, color, unit_price, quantity, line_total
    )
    values (
      oid, pid, vid, p.name, size_value, color_value,
      price_value, qty, price_value * qty
    );

    total_value := total_value + price_value * qty;
  end loop;

  update public.orders
  set subtotal = total_value,
      total = total_value + 190,
      custom_build_id = case when has_custom_build then gen_random_uuid() else null end
  where id = oid;

  insert into public.order_status_history(order_id, status, note)
  values (oid, 'pending', 'Order placed');

  return jsonb_build_object(
    'orderNumber', number_value,
    'total', total_value + 190,
    'paymentMethod', p_method
  );
end;
$$;

commit;
