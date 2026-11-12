-- =============================================================================
-- LnR Cycle Center — 10-step Bike Builder: Groupset + Bar Tape / Grips
--
-- This migration changes only the customer-facing builder flow and adds the
-- Bar Tape / Grips product category. It DOES NOT delete or rename the existing
-- product categories for front/rear derailleurs, cranksets, cassettes, chains,
-- brakesets, or rotors. Those categories remain available in the Products
-- catalogue and Admin product editor.
--
-- Stable legacy DB step rows 8–14 are also retained. The application maps only
-- the ten selected database rows to the customer-facing steps 1–10.
-- =============================================================================

begin;

-- 1. Ensure both selectable product categories exist.
insert into public.categories (
  name, slug, description, sort_order, is_active
)
values
  (
    'Bar Tape / Grips',
    'bar-tape-grips',
    'Handlebar tape and handlebar grips.',
    125,
    true
  ),
  (
    'Groupset',
    'groupset',
    'Complete drivetrain component packages sold together as one product.',
    260,
    true
  )
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- 2. Add new stable DB step rows. These are mapped by the application to
-- display positions 3 and 9 respectively. Existing DB rows 1–15 are retained.
insert into public.bike_builder_steps (
  step_number, name, description, customization_axes, notice
)
values
  (
    16,
    'Bar Tape / Grips',
    'Choose handlebar tape or grips that suit your preferred comfort, grip, and riding style. Select only options available for the product.',
    '[]'::jsonb,
    'Check the handlebar type and diameter before choosing grips or tape.'
  ),
  (
    17,
    'Groupset',
    'Choose a complete groupset package. Review the included shifters, derailleurs, crankset, cassette, chain, and brakes before selecting.',
    '[]'::jsonb,
    'Confirm that the groupset matches the frame, wheel freehub, and braking system before assembly.'
  )
on conflict (step_number) do update
set
  name = excluded.name,
  description = excluded.description,
  customization_axes = excluded.customization_axes,
  notice = excluded.notice,
  updated_at = now();

commit;
