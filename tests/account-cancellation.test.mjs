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
const product = "30000000-0000-4000-8000-000000000001",
  variant = "40000000-0000-4000-8000-000000000001",
  event = "50000000-0000-4000-8000-000000000001";
const query = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) =>
  Object.values((await query(sql, args)).rows[0])[0];
const place = (
  items = [
    { productId: product, quantity: 5, size: "One Size", color: "Default" },
  ],
  method = "cod",
) =>
  scalar("select public.lnr_place_order($1,$2::jsonb,$3)", [
    a,
    JSON.stringify(items),
    method,
  ]);
const orderId = () => scalar("select id from public.orders limit 1");
const stock = () =>
  scalar("select stock from public.products where id=$1", [product]);
const cancel = async (id) =>
  query("select public.lnr_set_order_status($1,'cancelled',$2,null)", [
    id,
    admin,
  ]);
const register = (user = a) =>
  scalar("select public.lnr_register_event($1,$2,'Rider',null,'Open')", [
    user,
    event,
  ]);
const proof = async (user = a) => {
  const p = `${user}/orders/mock.jpg`;
  await query(
    "insert into storage.objects(bucket_id,name)values('payment-proofs',$1) on conflict do nothing",
    [p],
  );
  return p;
};
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
    "insert into public.customer_locations(customer_id,address,latitude,longitude)values($1,'Test address',13,123)",
    [ca],
  );
  await query(
    "insert into public.products(id,name,slug,price,stock)values($1,'Wheel','wheel',100,5)",
    [product],
  );
  await query(
    "insert into public.events(id,event_code,slug,title,event_date,location,price,capacity,status)values($1,'EVT-TEST','test-event','Test Ride',now()+interval '30 days','Tabaco',100,1,'published')",
    [event],
  );
});
after(async () => {
  if (db) await db.close();
});
const ownCancel=(id,user=a)=>query('select public.lnr_cancel_customer_order($1,$2)',[id,user]);
const ownCancelEvent=(id,user=a)=>query('select public.lnr_cancel_customer_registration($1,$2)',[id,user]);
test('Customer cancellation restores product and exact combination stock once',async()=>{
 await query("insert into public.product_variants(id,product_id,options,price,stock)values($1,$2,'{\"Travel\":\"120mm\"}',100,5)",[variant,product]);
 await place([{productId:product,variantId:variant,quantity:5}]);assert.equal(await stock(),0);const id=await orderId();await ownCancel(id);await ownCancel(id);assert.equal(await stock(),5);assert.equal(await scalar('select stock from public.product_variants where id=$1',[variant]),5);
});
test('Another customer cannot cancel an order or restore its stock',async()=>{
 await place();await assert.rejects(ownCancel(await orderId(),b),/not available/);assert.equal(await stock(),0);assert.equal(await scalar('select status from public.orders limit 1'),'pending');
});
test('Shipping/completed orders cannot be cancelled by a customer',async()=>{
 await place();const id=await orderId();await query("update public.orders set status='shipping' where id=$1",[id]);await assert.rejects(ownCancel(id),/still processing/);assert.equal(await stock(),0);await query("update public.orders set status='completed' where id=$1",[id]);await assert.rejects(ownCancel(id),/still processing/);assert.equal(await stock(),0);
});
test('Refund/payment status is not falsely marked refunded on cancellation',async()=>{
 await place();await query("update public.orders set payment_status='paid'");await ownCancel(await orderId());assert.equal(await scalar('select payment_status from public.orders limit 1'),'paid');
});
test('Own event cancellation releases one slot exactly once',async()=>{
 const result=await register();const id=await scalar('select id from public.event_registrations limit 1');await ownCancelEvent(id);await ownCancelEvent(id);assert.equal(await scalar('select slots_booked from public.events where id=$1',[event]),0);assert.equal(await scalar('select status from public.event_registrations where id=$1',[id]),'cancelled');assert(result);
});
test('Other customers cannot cancel registrations or release their slots',async()=>{
 await register();const id=await scalar('select id from public.event_registrations limit 1');await assert.rejects(ownCancelEvent(id,b),/not available/);assert.equal(await scalar('select slots_booked from public.events where id=$1',[event]),1);
});
test('Started event cancellations are rejected without releasing the slot',async()=>{
 await register();const id=await scalar('select id from public.event_registrations limit 1');await query("update public.events set event_date=now()-interval '1 hour' where id=$1",[event]);await assert.rejects(ownCancelEvent(id),/already started/);assert.equal(await scalar('select slots_booked from public.events where id=$1',[event]),1);
});
test('Browser roles cannot call either privileged cancellation function',async()=>{
 await db.exec('set role authenticated');try{await assert.rejects(ownCancel(product),/permission denied/);await assert.rejects(ownCancelEvent(product),/permission denied/);}finally{await db.exec('reset role');}
});
