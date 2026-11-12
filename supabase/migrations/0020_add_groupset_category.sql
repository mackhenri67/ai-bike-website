-- Add Groupset as a normal database-backed product category.
-- Safe to run more than once: it creates the row if missing and updates
-- only its display metadata if the slug already exists. Existing products,
-- variants, prices, and stock are not changed.

insert into public.categories (
  name,
  slug,
  description,
  sort_order,
  is_active
)
values (
  'Groupset',
  'groupset',
  'Complete drivetrain component packages sold together as one product.',
  260,
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  description = coalesce(public.categories.description, excluded.description),
  is_active = true,
  updated_at = now();
