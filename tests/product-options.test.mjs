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
const combination = (Size, Color, stock = 3) => ({ options: { Size, Color }, stock, price: 120, available: true });
const payload = (rows) => ({ name: 'Custom bike', slug: 'custom-bike', category_id: null, sku: null, description: '', tagline: [], specs: ['Aluminium'], price: 100, compare_at_price: null, cost: null, stock: 5, status: 'active', is_featured: false, is_new_arrival: false, sort_order: 0, images: [], variants: rows, expected_stock: 5 });
const save = (data, id = product) => scalar('select public.lnr_save_product_options($1,$2::jsonb)', [id, JSON.stringify(data)]);
const rows = () => query('select * from public.product_variants where product_id=$1 and not retired order by sort_order',[product]).then(r=>r.rows);
const editable = (r) => ({...r, expected_stock:r.stock});
test('Arbitrary fields and exact Green/Small, Green/Medium, Black/Large, Black/XS stock combinations persist',async()=>{
 await save(payload([combination('Small','Green',2),combination('Medium','Green',4),combination('Large','Black',6),combination('XS','Black',8)]));
 assert.equal(await stock(),20);const r=await rows();assert.equal(r.length,4);assert(!r.some(x=>x.options.Color==='Green'&&x.options.Size==='Large'));
 assert.deepEqual(await scalar('select specs from public.products where id=$1',[product]),['Aluminium']);
});
test('Non size/color customization keys work, and duplicate combinations roll back',async()=>{
 const row={options:{Travel:'120mm',Diameter:'31.8mm'},stock:7,price:250,available:true};await save(payload([row]));assert.equal(await stock(),7);
 await assert.rejects(save({...payload([row,row]),expected_stock:7}),/Duplicate/);assert.equal((await rows()).length,1);
});
test('Checkout uses saved combination price and labels, deducts stock, cancellation restores once',async()=>{
 await save(payload([combination('Small','Green',2),combination('Large','Black',4)]));const r=await rows();
 const result=await place([{productId:product,variantId:r[0].id,quantity:2,size:'fake',color:'fake',price:1}]);assert.equal(result.total,430);assert.equal(await stock(),4);
 assert.equal(await scalar('select size from public.order_items limit 1'),'Color: Green · Size: Small');
 const id=await orderId();await cancel(id);await cancel(id);assert.equal(await stock(),6);assert.equal((await rows())[0].stock,2);
});
test('Sold out or unavailable combinations cannot be ordered',async()=>{
 await save(payload([combination('Small','Green',0),{...combination('Large','Black',4),available:false}]));const r=await rows();
 for(const row of r)await assert.rejects(place([{productId:product,variantId:row.id,quantity:1}]),/stock|unavailable/);
 assert.equal(await scalar('select count(*) from public.orders'),0);
});
test('Omitting the ID cannot select an arbitrary generic combination',async()=>{
 await save(payload([combination('Small','Green',2)]));await assert.rejects(place([{productId:product,quantity:1}]),/unavailable/);assert.equal(await stock(),2);
});
test('Stable combination IDs survive edits and referenced choices are archived on removal',async()=>{
 await save(payload([combination('Small','Green',2),combination('Large','Black',4)]));const r=await rows();await place([{productId:product,variantId:r[0].id,quantity:1}]);
 await save({...payload([editable(r[1])]),expected_stock:5});assert.equal((await rows())[0].id,r[1].id);assert.equal(await scalar('select product_variant_id from public.order_items limit 1'),r[0].id);
 await cancel(await orderId());assert.equal(await stock(),4);assert.equal(await scalar('select stock from public.product_variants where id=$1',[r[0].id]),2);
});
test('Stale stock editors fail atomically without overwriting checkout deductions',async()=>{
 await save(payload([combination('Small','Green',3)]));const r=await rows();await place([{productId:product,variantId:r[0].id,quantity:1}]);
 await assert.rejects(save({...payload(r.map(editable)),expected_stock:3}),/Stock changed/);assert.equal(await stock(),2);
});
test('Wrong-product IDs, negative stock and inconsistent field sets fail atomically',async()=>{
 const other=await save(payload([combination('Small','Green',3)]),null);const foreign=(await query('select * from public.product_variants where product_id=$1',[other])).rows[0];
 await assert.rejects(save(payload([editable(foreign)])),/combination changed/);
 await assert.rejects(save(payload([combination('Small','Green',-1)])),/Stock must/);
 await assert.rejects(save(payload([combination('Small','Green'),{options:{Travel:'100mm'},stock:1,price:100,available:true}])) ,/same fields/);
 assert.equal(await stock(),5);assert.equal((await rows()).length,0);
});
test('Browser roles cannot call the product save RPC',async()=>{
 await db.exec('set role authenticated');try{await assert.rejects(save(payload([])),/permission denied/);}finally{await db.exec('reset role');}
});
test('Existing legacy Size/Color records migrate in place and keep their ID',async()=>{
 await query("insert into public.product_variants(id,product_id,size,color,price,stock)values($1,$2,'S','Black',100,3)",[variant,product]);
 await db.exec(readFileSync(path.join(root,'supabase/migrations/0013_product_customization_stock.sql'),'utf8'));
 const legacy=(await rows())[0];assert.equal(legacy.id,variant);assert.deepEqual(legacy.options,{Size:'S',Color:'Black'});
 await save(payload([editable(legacy)]));assert.equal((await rows())[0].id,variant);assert.equal(await stock(),3);
});
test('Products with no customization choices still use ordinary product stock',async()=>{
 await save(payload([]));await place([{productId:product,quantity:2}]);assert.equal(await stock(),3);await cancel(await orderId());assert.equal(await stock(),5);
});
