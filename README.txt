LnR Cycle Center — event categories and emergency contact replacement files

WHAT THIS FIX CHANGES
- Admin Events add/edit form supports multiple registration category names and individual fees.
- Editing an existing event loads its currently saved categories and fees.
- Customer registration shows those categories and their individual prices.
- The selected ticket fee is looked up on the server from the event record; the browser does not submit the amount to charge.
- Emergency contact name and phone number are collected in separate fields and displayed separately in Admin Registrations.
- Existing events are migrated to one “General Admission” category at their existing event price.
- Existing registration emergency_contact text is retained for older registrations; new records also populate the separate columns.

FILES
This archive contains complete replacement files under their original project paths, plus one new Supabase migration:
- components/admin/events/EventsManager.tsx
- components/admin/events/EventsManager.module.css
- components/admin/events/RegistrationsManager.tsx
- app/events/[slug]/register/register-view.tsx
- app/events/[slug]/register/action.ts
- app/admin/(shell)/events/actions.ts
- lib/data/admin/events.ts
- lib/data/customer/events.ts
- lib/data/types.ts
- supabase/migrations/0030_event_registration_categories_and_emergency_contact.sql

APPLY
1. Back up the listed existing files in your project.
2. Extract this ZIP into the root of your repository. Allow it to replace the files at the same paths.
3. In Supabase Dashboard → SQL Editor, run the new migration file:
   supabase/migrations/0030_event_registration_categories_and_emergency_contact.sql
   Run it once, after your existing migrations (through 0029).
4. Run `npm run build` locally and resolve any project-specific build errors before deploying.
5. Test by creating/editing an event with at least two categories and different fees. Register as a customer using each category and verify the payment amount. Check Admin → Registrations for the separate emergency-contact name and phone fields.

IMPORTANT
- This archive contains actual source replacement files. It does not contain an installer, patch script, or automated file editor.
- No changes have been pushed to GitHub and no Supabase migration has been applied by this archive.
- The replacements were prepared against the current main-branch source retrieved for this task. A full project build and live Supabase test have not been run here.
