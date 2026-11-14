-- Publish reviews immediately after customers submit them.
-- Requires 0023_customer_build_reviews.sql.

begin;

-- Reviews submitted under the earlier workflow were held as pending.
-- Move those existing submissions to the published state.
update public.customer_build_reviews
set status = 'approved'
where status = 'pending';

alter table public.customer_build_reviews
  alter column status set default 'approved';

alter table public.customer_build_reviews
  drop constraint if exists customer_build_reviews_status_check;

alter table public.customer_build_reviews
  add constraint customer_build_reviews_status_check
  check (status in ('approved', 'rejected'));

commit;
