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
    "0027_manual_sale_custom_items.sql",
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

after(async()=>{if(db)await db.close();});
test('Store sales upgrade works with real order schema and variant/cancellation stock rules',async()=>{
 await query("insert into products(id,name,slug,price,stock)values($1,'Physical wheel','physical-wheel-test',100,5)",[product]);
 const saleId='99000000-0000-4000-8000-000000000001';
 const result=await scalar('select lnr_record_store_sale($1,$2,$3::jsonb)',[admin,saleId,JSON.stringify({kind:'custom',paymentMethod:'cash',confirmed:true,items:[{productId:product,quantity:2}]})]);
 assert.equal(Number(result.total),200);assert.equal(await stock(),3);
 assert.ok(await scalar('select completed_at from orders where id=$1',[saleId]));
 assert.ok(await scalar('select custom_build_id from orders where id=$1',[saleId]));
 assert.equal(await scalar('select sale_channel from orders where id=$1',[saleId]),'in_store');
 await cancel(saleId);assert.equal(await stock(),5);await cancel(saleId);assert.equal(await stock(),5);
 const roles=await query("select privilege_type from information_schema.routine_privileges where routine_name='lnr_record_store_sale' and grantee in('anon','authenticated','PUBLIC')");assert.equal(roles.rows.length,0);
});

test('Custom line upgrade stores address and works with production order-item constraints',async()=>{
 const id='99000000-0000-4000-8000-000000000002';
 const result=await scalar('select lnr_record_store_sale($1,$2,$3::jsonb)',[admin,id,JSON.stringify({kind:'parts',paymentMethod:'cash',confirmed:true,address:'Test barangay, Tabaco City',items:[{type:'custom',name:'Special fitting part',unitPrice:125.5,quantity:2}]})]);
 assert.equal(Number(result.total),251);const line=(await query('select * from order_items where order_id=$1',[id])).rows[0];assert.equal(line.is_custom_item,true);assert.equal(line.product_id,null);assert.equal(await scalar('select shipping_address from orders where id=$1',[id]),'Test barangay, Tabaco City');
});
