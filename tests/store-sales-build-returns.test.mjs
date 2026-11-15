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
 await db.exec(readFileSync(new URL('../supabase/migrations/0024_order_returns.sql',import.meta.url),'utf8'));await db.exec(migration);
});
beforeEach(async()=>{await db.exec('reset role;truncate return_request_events,return_evidence,return_requests,order_items,order_status_history,orders,order_number_counters,products,product_variants,customers,auth.users,storage.objects cascade');await q('insert into auth.users values($1),($2),($3)',[admin,user,other]);await q("insert into customers values($1,$2,'active')",[customer,user]);await q("insert into products values($1,'Frameset',1000,5,'active',null)",[product]);});
after(async()=>{await db.close();});
test('In-store cash sale is completed, attributed, stock-counted, and visible to sales totals without fake customers',async()=>{
 const result=await sale();assert.equal(Number(result.total),2000);
 const row=(await q('select * from orders')).rows[0];assert.equal(row.sale_channel,'in_store');assert.equal(row.payment_method,'cash');assert.equal(row.payment_status,'paid');assert.equal(row.status,'completed');assert.equal(row.customer_name,'Walk-in customer');assert.equal(row.customer_id,null);assert.equal(row.recorded_by,admin);assert.ok(row.completed_at);assert.equal(Number(row.shipping_fee),0);assert.equal(await scalar('select stock from products'),3);assert.equal(await scalar('select count(*)::int from order_status_history'),1);
});
test('Retries do not create a second sale or deduct stock twice',async()=>{
 const first=await sale();const retry=await sale();assert.equal(first.orderNumber,retry.orderNumber);assert.equal(await scalar('select stock from products'),3);assert.equal(await scalar('select count(*)::int from orders'),1);
});
test('Customer and anonymous callers cannot record physical sales',async()=>{
 await assert.rejects(sale(undefined,{},user),/Administrator/);await assert.rejects(sale(undefined,{},null),/Administrator/);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(sale(),/permission denied/);await db.exec('reset role');}
 assert.equal(await scalar('select count(*)::int from orders'),0);
});
test('Insufficient aggregate stock rolls the whole transaction back',async()=>{
 await assert.rejects(sale([{productId:product,quantity:3},{productId:product,quantity:3}]),/insufficient stock/);
 assert.equal(await scalar('select stock from products'),5);assert.equal(await scalar('select count(*)::int from orders'),0);assert.equal(await scalar('select count(*)::int from order_items'),0);
});
test('Variants are explicit, belong to the product and use server catalogue prices',async()=>{
 await q("insert into product_variants values($1,$2,1200,3,'{\"Size\":\"M\"}',null,null,true,false)",[variant,product]);
 await assert.rejects(sale(),/combination/);
 const result=await sale([{productId:product,variantId:variant,quantity:2,price:1}],{kind:'custom'});assert.equal(Number(result.total),2400);assert.ok(await scalar('select custom_build_id from orders'));assert.equal(await scalar('select stock from product_variants'),1);assert.equal(await scalar('select size from order_items'),'Size: M');
});
test('Requires payment confirmation, validates GCash reference and quantities',async()=>{
 await assert.rejects(sale(undefined,{confirmed:false}),/Confirm payment/);await assert.rejects(sale(undefined,{paymentMethod:'gcash'}),/reference/);await assert.rejects(sale([{productId:product,quantity:0}]),/Quantity/);
 const result=await sale(undefined,{paymentMethod:'gcash',reference:'GCASH-REAL-123'});assert.equal(Number(result.total),2000);assert.equal(await scalar('select payment_reference from orders'),'GCASH-REAL-123');
});
async function build(){await q("insert into orders(id,order_number,customer_id,customer_name,status,subtotal,discount,total,payment_method,custom_build_id,completed_at) values($1,'ORD-BUILD',$2,'Rider','completed',3000,100,3090,'gcash',gen_random_uuid(),clock_timestamp())",[order,customer]);await q("insert into order_items(id,order_id,product_name,quantity,line_total)values($1,$2,'Frame',1,2000),($3,$2,'Wheels',1,1000)",[item1,order,item2]);}
async function evidence(target=item2){const data=await scalar('select lnr_prepare_return_upload($1,$2,$3,$4,$5,$6)',[user,target,asset,'damage.png','image/png',8]);await q("insert into storage.objects values('return-evidence',$1,'{\"size\":8,\"mimetype\":\"image/png\"}')",[data.path]);}
const submit=(target=item2,id=request)=>scalar('select lnr_submit_return($1,$2,$3,$4,$5::uuid[])',[user,target,id,'The complete bike arrived damaged.',[asset]]);
test('Whole-build request canonicalizes evidence and returns one shared request from every component',async()=>{
 await build();const context=await scalar('select lnr_return_item_context($1,$2)',[user,item2]);assert.equal(context.scope,'build');assert.equal(Number(context.item_value),2900);assert.equal(context.build_items.length,2);
 await evidence();assert.equal(await scalar('select order_item_id from return_evidence'),item1);
 const r=await submit();assert.equal(r.return_scope,'build');assert.equal(r.order_item_id,item1);
 const first=await scalar('select lnr_return_item_context($1,$2)',[user,item1]);const second=await scalar('select lnr_return_item_context($1,$2)',[user,item2]);assert.equal(first.requests[0].id,second.requests[0].id);
 await assert.rejects(submit(item1,'80000000-0000-4000-8000-000000000002'),/already has/);
 await scalar('select lnr_review_return($1,$2,$3,$4)',[admin,request,'approved',null]);await scalar('select lnr_select_return_method($1,$2,$3,$4)',[user,request,'store_dropoff',null]);assert.equal(await scalar('select status from return_requests'),'return_selected');
});
test('Build ownership and deadline cannot be bypassed by choosing another component',async()=>{
 await build();await q("insert into customers values('20000000-0000-4000-8000-000000000002',$1,'active')",[other]);await assert.rejects(scalar('select lnr_return_target($1,$2)',[other,item2]),/not available/);
 await db.exec('alter table orders disable trigger lnr_capture_order_completion');await q("update orders set completed_at=clock_timestamp()-interval '4 days'");await db.exec('alter table orders enable trigger lnr_capture_order_completion');await assert.rejects(evidence(item1),/three days/);await assert.rejects(submit(item2),/three days/);
});
test('Existing part request keeps its scope and prevents a duplicate whole-build refund',async()=>{
 await build();await q("insert into return_requests(id,order_id,order_item_id,customer_id,reason)values($1,$2,$3,$4,'Previously reported wheel issue')",[request,order,item2,customer]);await evidence(item1);await assert.rejects(submit(item1,'80000000-0000-4000-8000-000000000002'),/already has/);assert.equal(await scalar('select return_scope from return_requests'),'item');
});
test('Migration is repeatable without resetting sales or stock',async()=>{
 await sale();await db.exec(migration);assert.equal(await scalar('select stock from products'),3);assert.equal(await scalar('select count(*)::int from orders'),1);
});
