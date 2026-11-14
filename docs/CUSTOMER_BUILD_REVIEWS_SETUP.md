# Customer Custom-Build Reviews

## What this adds

- Customers can review an eligible custom bike build from **Account Overview → My Orders** after the order is marked **Completed**.
- A review contains a 1–5 star rating, a short written review, and one JPG/PNG/WebP photo (maximum 5 MB).
- The customer must explicitly consent to public display of the review, abbreviated display name, and photo.
- New reviews are private and start as **Pending**.
- Admins review submissions under **Admin → Customers → Build Reviews** and can approve or reject them, with an optional note.
- Only **Approved** reviews appear in the homepage carousel above the LNR location/map section.
- Review photos are stored in the private `customer-build-reviews` bucket. Server-side code creates short-lived signed image URLs.

## Install

1. Merge this branch into the production branch after reviewing the Vercel preview/build.
2. In Supabase, open **SQL Editor** and run the complete file:
   `supabase/migrations/0023_customer_build_reviews.sql`
3. Redeploy the Vercel project after the migration is successful.
4. Test with a customer account that places a new custom build through the manual or AI bike builder.
5. In Admin → Orders, mark the test order **Completed**. The customer should now see the review form under that order in **Account Overview → My Orders**.
6. Submit a test photo, rating, and review; confirm it appears as Pending under **Admin → Customers → Build Reviews**.
7. Approve it and confirm that it appears on the homepage carousel. Reject another test review and confirm that it does not appear publicly.

## Important eligibility note

Migration 0023 adds a `custom_build_id` marker to orders and updates the checkout transaction so orders containing bike-builder selections receive that marker. This is done from the server/database checkout payload, not from a customer-editable field.

**Only custom-build orders placed after migration 0023 is applied are automatically marked eligible.** Existing historical orders were not tagged by the old schema. Do not bulk-mark historical orders based only on their status. If older completed builds should be reviewable, first identify their order numbers from shop records and backfill only those verified orders.

## Validation

- Review submission checks the authenticated customer owns the order.
- The order must be marked Completed and have a server-generated custom-build marker.
- One review is allowed per custom-build order. Rejected reviews can be corrected and resubmitted.
- Admin approval/rejection actions require the existing admin guard.
- No sample testimonials or review records are seeded.
