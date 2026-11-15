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
    "0023_customer_build_reviews.sql",
    "0024_order_returns.sql",
    "0025_store_sales_and_build_returns.sql",
    "0028_admin_shipping_settings.sql",
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
    "reset role;update public.shop_settings set shipping_fee=190;truncate public.customers,public.orders,public.products,public.events,public.payment_submission_history,public.order_number_counters,storage.objects cascade;",
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

const setFee=(fee,user=admin)=>scalar('select public.lnr_set_shipping_fee($1,$2)',[user,fee]);
const checkout=(fee=190,items=[{productId:product,quantity:1}])=>scalar('select public.lnr_place_order($1,$2::jsonb,$3,$4)',[a,JSON.stringify(items),'cod',fee]);
test('Saved fee applies to new orders and historical totals stay unchanged',async()=>{
 const first=await checkout();assert.equal(first.total,290);await setFee(85.5);const second=await checkout(85.5);assert.equal(second.total,185.5);
 assert.equal(Number(await scalar('select shipping_fee from public.orders where order_number=$1',[first.orderNumber])),190);
});
test('Stale or tampered quotes never create orders or deduct stock',async()=>{
 await setFee(250);for(const fee of [190,0,null])await assert.rejects(checkout(fee),/shipping fee changed/);
 assert.equal(await stock(),5);assert.equal(Number(await scalar('select count(*) from public.orders')),0);
});
test('Free shipping applies to custom builds and tags the build',async()=>{
 await setFee(0);const placed=await checkout(0,[{productId:product,quantity:1,builder_validated:true}]);assert.equal(placed.total,100);
 assert.ok(await scalar('select custom_build_id from public.orders limit 1'));
});
test('Legacy checkout overload also uses the saved shipping fee',async()=>{
 await setFee(75);const placed=await place([{productId:product,quantity:1}]);assert.equal(placed.total,175);
});
test('Only admin writes; browser reads only the public rate, not audit information',async()=>{
 await assert.rejects(setFee(20,a),/Administrator/);await setFee(45);
 await db.exec('set role anon');try{assert.equal(Number(await scalar('select shipping_fee from public.shop_settings')),45);await assert.rejects(query('select updated_by from public.shop_settings'),/permission denied/);await assert.rejects(setFee(20),/permission denied/);}finally{await db.exec('reset role');}
});
test('Invalid shipping fees are rejected',async()=>{for(const fee of [-1,100001,1.234,null])await assert.rejects(setFee(fee),/shipping fee/);});
test('Manual in-store sales retain zero shipping',async()=>{
 await setFee(500);const payload={customerName:'Walk in',confirmed:true,kind:'parts',paymentMethod:'cash',items:[{productId:product,quantity:1}]};
 await scalar('select public.lnr_record_store_sale($1,$2,$3::jsonb)',[admin,'60000000-0000-4000-8000-000000000001',JSON.stringify(payload)]);
 assert.equal(Number(await scalar("select shipping_fee from public.orders where sale_channel='in_store'")),0);
});
test('Migration rerun preserves the saved fee and order totals',async()=>{
 await setFee(45);await checkout(45);await db.exec(readFileSync(path.join(root,'supabase/migrations/0028_admin_shipping_settings.sql'),'utf8'));
 assert.equal(Number(await scalar('select shipping_fee from public.shop_settings')),45);assert.equal(Number(await scalar('select total from public.orders limit 1')),145);
});
