import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
let db;const admin='10000000-0000-4000-8000-000000000001',user='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const customer='20000000-0000-4000-8000-000000000001',product='30000000-0000-4000-8000-000000000001',variant='40000000-0000-4000-8000-000000000001';
const order='50000000-0000-4000-8000-000000000001',item1='60000000-0000-4000-8000-000000000001',item2='60000000-0000-4000-8000-000000000002',asset='70000000-0000-4000-8000-000000000001',request='80000000-0000-4000-8000-000000000001';
const migration=readFileSync(new URL('../supabase/migrations/0025_store_sales_and_build_returns.sql',import.meta.url),'utf8');
const q=(s,a=[])=>db.query(s,a);const scalar=async(s,a=[])=>Object.values((await q(s,a)).rows[0])[0];
const sale=(items=[{productId:product,quantity:2}],extra={},actor=admin,id=order)=>scalar('select lnr_record_store_sale($1,$2,$3::jsonb)',[actor,id,JSON.stringify({kind:'parts',paymentMethod:'cash',confirmed:true,items,...extra})]);
before(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);create table customers(id uuid primary key,auth_user_id uuid,status text);
 create table categories(id uuid primary key,is_active boolean);
 create table products(id uuid primary key,name text,price numeric,stock int,status text,category_id uuid);
 create table product_variants(id uuid primary key,product_id uuid,price numeric,stock int,options jsonb,size text,color text,available boolean,retired boolean);
 create table orders(id uuid primary key default gen_random_uuid(),order_number text unique,customer_id uuid,customer_name text,customer_email text,customer_phone text,shipping_address text,subtotal numeric,discount numeric,shipping_fee numeric,total numeric,payment_method text constraint orders_payment_method_check check(payment_method in('gcash','cod')),payment_status text,status text,custom_build_id uuid,payment_reference text,notes text,created_at timestamptz default clock_timestamp());
 create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid references orders(id),product_id uuid,product_variant_id uuid,product_name text,size text,color text,unit_price numeric,quantity int,line_total numeric);
 create table order_number_counters(year int primary key,last_number bigint);
 create table order_status_history(order_id uuid,status text,note text,created_by uuid);
 create function lnr_is_admin(p_user uuid)returns boolean language sql stable as $$select coalesce(p_user='10000000-0000-4000-8000-000000000001'::uuid,false)$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 grant usage on schema public,storage,auth to anon,authenticated,service_role;
 `);
 await db.exec(readFileSync(new URL('../supabase/migrations/0024_order_returns.sql',import.meta.url),'utf8'));await db.exec(migration);await db.exec(readFileSync(new URL('../supabase/migrations/0027_manual_sale_custom_items.sql',import.meta.url),'utf8'));
});
beforeEach(async()=>{await db.exec('reset role;truncate return_request_events,return_evidence,return_requests,order_items,order_status_history,orders,order_number_counters,products,product_variants,customers,auth.users,storage.objects cascade');await q('insert into auth.users values($1),($2),($3)',[admin,user,other]);await q("insert into customers values($1,$2,'active')",[customer,user]);await q("insert into products values($1,'Frameset',1000,5,'active',null)",[product]);});
after(async()=>{await db.close();});
test('Custom items save their name and price without creating products or deducting stock',async()=>{
 const result=await sale([{type:'custom',name:'Special order saddle',unitPrice:345.75,quantity:2}],{address:'Barangay Bonbon, Tabaco City'});
 assert.equal(Number(result.total),691.5);assert.equal(await scalar('select stock from products'),5);assert.equal(await scalar('select count(*)::int from products'),1);
 const line=(await q('select * from order_items')).rows[0];assert.equal(line.is_custom_item,true);assert.equal(line.product_id,null);assert.equal(line.product_name,'Special order saddle');assert.equal(await scalar('select shipping_address from orders'),'Barangay Bonbon, Tabaco City');
});
test('Mixed sale prices catalogue products on the server and custom items as entered by admin',async()=>{
 const result=await sale([{productId:product,quantity:1,unitPrice:1},{type:'custom',name:'Custom fitting part',unitPrice:250,quantity:2}]);assert.equal(Number(result.total),1500);assert.equal(await scalar('select stock from products'),4);
});
test('Retries remain idempotent for custom and catalogue lines',async()=>{
 const items=[{productId:product,quantity:1},{type:'custom',name:'Custom part',unitPrice:50,quantity:1}];const first=await sale(items);const next=await sale(items);assert.equal(first.orderNumber,next.orderNumber);assert.equal(await scalar('select count(*)::int from order_items'),2);assert.equal(await scalar('select stock from products'),4);
});
test('Invalid custom prices, names, quantities and oversized address fail without a partial sale',async()=>{
 for(const custom of [{name:'',unitPrice:5},{name:'A',unitPrice:5},{name:'Valid part',unitPrice:-1},{name:'Valid part',unitPrice:1.234},{name:'Valid part',unitPrice:'100'},{name:'Valid part',unitPrice:null}])await assert.rejects(sale([{type:'custom',quantity:1,...custom}]),/custom/);
 await assert.rejects(sale([{type:'custom',name:'Part',unitPrice:5,quantity:0}]),/Quantity/);
 await assert.rejects(sale(undefined,{address:'x'.repeat(1001)}),/too long/);
 assert.equal(await scalar('select count(*)::int from orders'),0);assert.equal(await scalar('select stock from products'),5);
});
test('Invalid catalogue stock rolls back custom lines in the same sale',async()=>{
 await assert.rejects(sale([{type:'custom',name:'One-off part',unitPrice:50,quantity:1},{productId:product,quantity:99}]),/insufficient stock/);assert.equal(await scalar('select count(*)::int from order_items'),0);assert.equal(await scalar('select count(*)::int from orders'),0);
});
test('Only admins can create custom sale lines and rerunning the migration preserves them',async()=>{
 const items=[{type:'custom',name:'Custom part',unitPrice:50,quantity:1}];await assert.rejects(sale(items,{},user),/Administrator/);await sale(items);await db.exec(readFileSync(new URL('../supabase/migrations/0027_manual_sale_custom_items.sql',import.meta.url),'utf8'));assert.equal(await scalar('select is_custom_item from order_items'),true);
});
