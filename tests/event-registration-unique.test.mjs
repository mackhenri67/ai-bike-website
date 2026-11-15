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
    "0015_event_emergency_contact.sql",
    "0026_one_active_event_registration.sql",
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
const withContact=(user=a,contact='Maria Cruz · 09171234567')=>scalar('select public.lnr_register_event_with_contact($1,$2,$3,$4,$5)',[user,event,'Test Rider',contact,'Fun Ride']);
for(const payment of ['pending','paid','rejected'])test(`Blocks a second active registration with ${payment} payment and preserves original contact`,async()=>{
 const first=await withContact();await query('update event_registrations set payment_status=$1',[payment]);
 await assert.rejects(withContact(a,'Another Contact 09991234567'),/already have an active registration/);
 assert.equal(await scalar('select count(*)::int from event_registrations'),1);
 assert.equal(await scalar('select slots_booked from events where id=$1',[event]),1);
 assert.equal(await scalar('select emergency_contact from event_registrations'),'Maria Cruz · 09171234567');
 assert.equal(await scalar('select registration_code from event_registrations'),first.registrationCode);
});
test('Cancelling a ticket permits a fresh registration and reserves one slot',async()=>{
 const first=await withContact();const id=await scalar('select id from event_registrations');
 await query('select lnr_cancel_customer_registration($1,$2)',[id,a]);
 assert.equal(await scalar('select slots_booked from events where id=$1',[event]),0);
 const second=await withContact();assert.notEqual(first.registrationCode,second.registrationCode);
 assert.equal(await scalar("select count(*)::int from event_registrations where status='registered'"),1);
 assert.equal(await scalar("select count(*)::int from event_registrations where status='cancelled'"),1);
 assert.equal(await scalar('select slots_booked from events where id=$1',[event]),1);
});
test('Two submission attempts create only one ticket and one capacity reservation',async()=>{
 const outcomes=await Promise.allSettled([withContact(),withContact()]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
 assert.equal(await scalar('select count(*)::int from event_registrations'),1);assert.equal(await scalar('select slots_booked from events where id=$1',[event]),1);
});
test('A different customer can register for the same event when capacity permits',async()=>{
 await query('update events set capacity=2 where id=$1',[event]);await withContact();await withContact(b);
 assert.equal(await scalar("select count(*)::int from event_registrations where status='registered'"),2);
});
test('The same customer can register for another event',async()=>{
 await withContact();const another='50000000-0000-4000-8000-000000000002';
 await query("insert into events(id,event_code,slug,title,event_date,location,price,capacity,status) values($1,'EVT-OTHER','other','Other event',now()+interval '31 days','Tabaco',100,2,'published')",[another]);
 await scalar('select lnr_register_event_with_contact($1,$2,$3,$4,null)',[a,another,'Rider','Maria Cruz 09171234567']);
 assert.equal(await scalar('select count(*)::int from event_registrations'),2);
});
test('Legacy RPC also rejects a repeat and the unique index blocks direct duplicate rows',async()=>{
 await withContact();await assert.rejects(register(),/already have an active registration/);
 await assert.rejects(query("insert into event_registrations(registration_code,event_id,customer_id,customer_name,rider_name,amount_paid,payment_method,payment_status,status) values('DUPLICATE',$1,$2,'Customer A','Rider',100,'gcash','pending','registered')",[event,ca]),/duplicate key/);
});
test('Migration can be reapplied without altering tickets, contacts or capacity',async()=>{
 const first=await withContact();await db.exec(readFileSync(path.join(root,'supabase/migrations/0026_one_active_event_registration.sql'),'utf8'));
 assert.equal(await scalar('select registration_code from event_registrations'),first.registrationCode);assert.equal(await scalar('select emergency_contact from event_registrations'),'Maria Cruz · 09171234567');assert.equal(await scalar('select slots_booked from events where id=$1',[event]),1);
});
test('Browser roles cannot invoke the privileged signup RPC',async()=>{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(withContact(),/permission denied/);}finally{await db.exec('reset role');}}
});
