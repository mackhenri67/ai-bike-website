import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { before, beforeEach, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let db;
const admin = "10000000-0000-4000-8000-000000000001",
  a = "10000000-0000-4000-8000-000000000002",
  b = "10000000-0000-4000-8000-000000000003";
const ca = "20000000-0000-4000-8000-000000000001",
  cb = "20000000-0000-4000-8000-000000000002";
const event = "50000000-0000-4000-8000-000000000001";
const query = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) =>
  Object.values((await query(sql, args)).rows[0])[0];
const register = (user = a) =>
  scalar("select public.lnr_register_event($1,$2,'Rider',null,'Open')", [
    user,
    event,
  ]);
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}');
 create function auth.jwt()returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid()returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb default '{}',unique(bucket_id,name));
 alter table storage.objects enable row level security;
 create function storage.foldername(name text)returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
 grant select on storage.buckets to anon,authenticated,service_role;
 alter default privileges in schema public grant all on tables to service_role;
 alter default privileges in schema public grant usage,select on sequences to service_role;`);
  for (const f of [
    "0001_admin_schema.sql",
    "0002_rls_and_storage.sql",
    "0003_seed_catalog.sql",
    "0004_seed_media.sql",
    "0005_seed_customers_orders.sql",
    "0006_customer_accounts.sql",
    "0007_customer_carts.sql",
    "0008_gcash_payments.sql",
    "0009_events_registrations.sql",
    "0010_bike_builder.sql",
    "0011_seed_builder_categories.sql",
    "0012_complete_repairs.sql",
    "0013_product_customization_stock.sql",
    "0014_customer_account_cancellation.sql",
    "0015_event_emergency_contact.sql",
    "0016_event_payment_proof_replacement.sql",
  ]) {
    try {
      await db.exec(
        readFileSync(path.join(root, "supabase/migrations", f), "utf8"),
      );
    } catch (e) {
      throw new Error(`Migration ${f}: ${e.message}`);
    }
  }
  await query(
    "insert into auth.users(id,email,raw_app_meta_data)values($1,'admin@example.com','{\"role\":\"admin\"}'),($2,'a@example.com','{}'),($3,'b@example.com','{}')",
    [admin, a, b],
  );
});
beforeEach(async () => {
  await db.exec(
    "reset role;truncate public.customers,public.orders,public.products,public.events,public.payment_submission_history,public.order_number_counters,storage.objects cascade;",
  );
  await query(
    "insert into public.customers(id,auth_user_id,full_name,email)values($1,$2,'Customer A','a@example.com'),($3,$4,'Customer B','b@example.com')",
    [ca, a, cb, b],
  );
  await query(
    "insert into public.events(id,event_code,slug,title,event_date,location,price,capacity,status)values($1,'EVT-TEST','test-event','Test Ride',now()+interval '30 days','Tabaco',100,1,'published')",
    [event],
  );
});
after(async () => {
  if (db) await db.close();
});

const paymentPath = (code, user = a, filename = "11111111-1111-4111-8111-111111111111.png") => `${user}/events/${code}/${filename}`;
const upload = async (filePath) => {
  await query("insert into storage.objects(bucket_id,name)values('payment-proofs',$1) on conflict do nothing", [filePath]);
  return filePath;
};
const submitProof = (code, filePath, user = a) => query(
  "select public.lnr_submit_event_payment($1,$2,'GCash Sender','09171234567','REF-1',$3)",
  [user, code, filePath],
);
const registration = async () => (await query("select * from public.event_registrations limit 1")).rows[0];

test("Fresh registration requires an explicit receipt from its own private folder", async () => {
  const { registrationCode: code } = await register();
  assert.equal((await registration()).proof_screenshot_url, null);
  await submitProof(code, await upload(paymentPath(code)));
  const row = await registration();
  assert.equal(row.proof_screenshot_url, paymentPath(code));
  assert.equal(row.payment_status, "pending");
  assert.equal(row.payment_sender_name, "GCash Sender");
});

test("Incorrect pending banner can be replaced without another registration or losing history", async () => {
  const { registrationCode: code } = await register();
  const banner = "https://example.invalid/event-banner.jpg";
  await query("update public.event_registrations set proof_screenshot_url=$1, payment_sender_name='Old sender'", [banner]);
  const filePath = await upload(paymentPath(code));
  await submitProof(code, filePath);
  assert.equal((await registration()).proof_screenshot_url, filePath);
  assert.equal((await registration()).payment_status, "pending");
  const history = (await query("select * from public.payment_submission_history")).rows;
  assert.equal(history.length, 1);
  assert.equal(history[0].previous_submission.proof_screenshot_url, banner);
  assert.equal(history[0].previous_submission.payment_sender_name, "Old sender");
  assert.equal(history[0].changed_by, a);
  assert.equal(await scalar("select count(*) from public.event_registrations"), 1);
  assert.equal(await scalar("select slots_booked from public.events where id=$1", [event]), 1);
  await submitProof(code, filePath);
  assert.equal(await scalar("select count(*) from public.payment_submission_history"), 1, "retry must not duplicate history");
});

test("Public banner, another event/order path, foreign owner and nonexistent upload are rejected", async () => {
  const { registrationCode: code } = await register();
  const filename = "11111111-1111-4111-8111-111111111111.png";
  for (const filePath of [
    "https://example.invalid/event-banner.jpg",
    `${a}/orders/ORD-1/${filename}`,
    paymentPath("EVR-OTHER"),
    paymentPath(code, b),
    `${a}/events/${code}/../${filename}`,
  ]) {
    await upload(filePath);
    await assert.rejects(submitProof(code, filePath), /registration's payment form/);
  }
  await assert.rejects(submitProof(code, paymentPath(code)), /not found/);
  assert.equal((await registration()).proof_screenshot_url, null);
});

test("Another customer cannot replace an owned pending receipt", async () => {
  const { registrationCode: code } = await register();
  const first = await upload(paymentPath(code));
  await submitProof(code, first);
  await assert.rejects(submitProof(code, await upload(paymentPath(code, b)), b), /not available/);
  assert.equal((await registration()).proof_screenshot_url, first);
  assert.equal(await scalar("select count(*) from public.payment_submission_history"), 0);
});

test("Verified payments cannot be overwritten or reset by reapplying the migration", async () => {
  const { registrationCode: code } = await register();
  const first = await upload(paymentPath(code));
  await submitProof(code, first);
  await query("select public.lnr_review_event_payment($1,'paid',$2,null)", [(await registration()).id, admin]);
  await assert.rejects(submitProof(code, await upload(paymentPath(code, a, "22222222-2222-4222-8222-222222222222.png"))), /cannot be changed/);
  await db.exec(readFileSync(path.join(root, "supabase/migrations/0016_event_payment_proof_replacement.sql"), "utf8"));
  assert.equal((await registration()).proof_screenshot_url, first);
  assert.equal((await registration()).payment_status, "paid");
  assert.equal(await scalar("select count(*) from public.payment_submission_history"), 0);
});

test("Rejected proof replacement clears rejection and keeps the previous review in history", async () => {
  const { registrationCode: code } = await register();
  await submitProof(code, await upload(paymentPath(code)));
  await query("select public.lnr_review_event_payment($1,'rejected',$2,'Wrong image')", [(await registration()).id, admin]);
  await submitProof(code, await upload(paymentPath(code, a, "22222222-2222-4222-8222-222222222222.png")));
  const row = await registration();
  assert.equal(row.payment_status, "pending");
  assert.equal(row.rejection_reason, null);
  assert.equal(row.reviewed_at, null);
  assert.equal(row.reviewed_by, null);
  assert.equal(await scalar("select previous_submission->>'rejection_reason' from public.payment_submission_history"), "Wrong image");
});

test("Cancelled registrations and browser RPC calls cannot submit payments", async () => {
  const { registrationCode: code } = await register();
  const filePath = await upload(paymentPath(code));
  await query("update public.event_registrations set status='cancelled'");
  await assert.rejects(submitProof(code, filePath), /cannot be changed/);
  await db.exec("set role authenticated");
  try { await assert.rejects(submitProof(code, filePath), /permission denied/); }
  finally { await db.exec("reset role"); }
});
