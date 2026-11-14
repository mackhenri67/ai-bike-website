# Customer Custom-Build Reviews

## What this adds

- Customers can review an eligible custom bike build from **Account Overview → My Orders** after the order is marked **Completed**.
- A review contains a 1–5 star rating, a written review, and one JPG/PNG/WebP photo (maximum 5 MB).
- Customers explicitly consent to public display of the review, abbreviated display name, and photo.
- **Reviews publish immediately** when submitted; no admin approval is required.
- Admins can view every review under **Admin → Customers → Build Reviews** and remove a review when necessary. Removing it also attempts to delete its stored photo.
- The homepage displays reviews in a horizontally scrolling, touch-friendly carousel. Only published reviews appear there.
- Review photos are stored in the private customer-build-reviews bucket. Server-side code creates short-lived signed image URLs.

## Install

1. Merge this branch into the production branch after reviewing the Vercel preview/build.
2. In Supabase, ensure migration 0023_customer_build_reviews.sql has been applied. If it has not, run that migration first.
3. Run supabase/migrations/0024_publish_customer_reviews_immediately.sql in Supabase SQL Editor. This follow-up migration is required whether 0023 was applied before or after this PR; it publishes existing pending reviews and changes the default to published.
4. Redeploy the Vercel project after the database migrations are successful.
5. Test with a customer account that places a new custom build through the manual or AI bike builder.
6. In Admin → Orders, mark the test order **Completed**. The customer should now see the review form under that order in **Account Overview → My Orders**.
7. Submit a test photo, rating, and review. Confirm it appears on the homepage carousel immediately and is visible under **Admin → Customers → Build Reviews**.
8. Use the admin Remove review action and confirm it disappears from the homepage.

## Important eligibility note

Migration 0023 adds a custom_build_id marker to orders and updates the checkout transaction so orders containing bike-builder selections receive that marker. This is done from the server/database checkout payload, not from a customer-editable field.

**Only custom-build orders placed after migration 0023 is applied are automatically marked eligible.** Existing historical orders were not tagged by the old schema. Do not bulk-mark historical orders based only on their status. If older completed builds should be reviewable, first identify their order numbers from shop records and backfill only those verified orders.

## Validation

- Review submission checks the authenticated customer owns the order.
- The order must be marked Completed and have a server-generated custom-build marker.
- One review is allowed per custom-build order.
- Review rows are created as published; there is no pending-approval step.
- Admin removal is protected by the existing admin guard.
- Review photos remain in private storage and are served with expiring signed URLs.
