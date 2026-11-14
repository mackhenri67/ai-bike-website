import test,{before,beforeEach,after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
let db;const admin="10000000-0000-4000-8000-000000000001",user="10000000-0000-4000-8000-000000000002",other="10000000-0000-4000-8000-000000000003";
const cid="20000000-0000-4000-8000-000000000001",cid2="20000000-0000-4000-8000-000000000002";
const order="30000000-0000-4000-8000-000000000001",foreign="30000000-0000-4000-8000-000000000002",item="40000000-0000-4000-8000-000000000001",foreignItem="40000000-0000-4000-8000-000000000002";
const asset="50000000-0000-4000-8000-000000000001",asset2="50000000-0000-4000-8000-000000000002",request="60000000-0000-4000-8000-000000000001",request2="60000000-0000-4000-8000-000000000002";
const reason="The item arrived with a visible crack.";
const sql=readFileSync(new URL("../supabase/migrations/0024_order_returns.sql",import.meta.url),"utf8");
const q=(s,a=[])=>db.query(s,a);
async function scalar(s,a=[]){return Object.values((await q(s,a)).rows[0])[0];}
async function rpc(name,args){return scalar("select "+name+"("+args.map((_,i)=>"$"+(i+1)).join(",")+")",args);}
async function upload(id=asset,who=user,target=item,mime="image/png",size=8){
 const data=await rpc("lnr_prepare_return_upload",[who,target,id,"Evidence",mime,size]);
 await q("insert into storage.objects(bucket_id,name,metadata)values('return-evidence',$1,$2::jsonb)on conflict(bucket_id,name)do update set metadata=excluded.metadata",[data.path,JSON.stringify({size,mimetype:mime})]);return data;
}
const submit=(id=request,assets=[asset],who=user,target=item)=>rpc("lnr_submit_return",[who,target,id,reason,assets]);
const review=(status,note=null,who=admin,id=request)=>rpc("lnr_review_return",[who,id,status,note]);
const method=(value,details=null,who=user,id=request)=>rpc("lnr_select_return_method",[who,id,value,details]);
before(async()=>{
 db=new PGlite();
 await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key);
 create table public.customers(id uuid primary key,auth_user_id uuid references auth.users(id),status text);
 create table public.orders(id uuid primary key,customer_id uuid references public.customers(id),status text,created_at timestamptz default now()-interval '7 days');
 create table public.order_items(id uuid primary key,order_id uuid references public.orders(id),product_name text,quantity int,line_total numeric);
 create function public.lnr_is_admin(p_user uuid)returns boolean language sql stable as $$select coalesce(p_user='10000000-0000-4000-8000-000000000001'::uuid,false)$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 create policy broad_storage on storage.objects for all to authenticated using(true)with check(true);
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to authenticated,service_role;
 `);
 await db.exec(sql);
});
beforeEach(async()=>{
 await db.exec("reset role;truncate public.return_request_events,public.return_evidence,public.return_requests,public.order_items,public.orders,public.customers,auth.users,storage.objects restart identity cascade");
 await q("insert into auth.users values($1),($2),($3)",[admin,user,other]);
 await q("insert into customers values($1,$2,'active'),($3,$4,'active')",[cid,user,cid2,other]);
 await q("insert into orders(id,customer_id,status,completed_at)values($1,$2,'completed',now()-interval '1 hour'),($3,$4,'completed',now()-interval '2 hours')",[order,cid,foreign,cid2]);
 await q("insert into order_items values($1,$2,'Frameset',1,12990),($3,$4,'Wheelset',2,8000)",[item,order,foreignItem,foreign]);
});
after(async()=>{await db.close();});
test("Owner context reports a 72-hour window and keeps other customers out",async()=>{
 const c=await rpc("lnr_return_item_context",[user,item]);assert.equal(c.eligible,true);assert.equal(Date.parse(c.deadline)-Date.parse(c.completed_at),72*60*60*1000);
 await assert.rejects(rpc("lnr_return_item_context",[other,item]),/not available/);
 await assert.rejects(rpc("lnr_return_item_context",[admin,item]),/customer account/);
});
test("Completion time is captured once and does not restart on later edits",async()=>{
 const id="30000000-0000-4000-8000-000000000003";
 await q("insert into orders(id,customer_id,status)values($1,$2,'shipping')",[id,cid]);
 assert.equal(await scalar("select completed_at from orders where id=$1",[id]),null);
 await q("update orders set status='completed' where id=$1",[id]);
 const first=await scalar("select completed_at from orders where id=$1",[id]);assert.ok(first);
 await q("update orders set completed_at=now()+interval '10 days' where id=$1",[id]);
 assert.deepEqual(await scalar("select completed_at from orders where id=$1",[id]),first);
 await q("update orders set status='shipping' where id=$1",[id]);await q("update orders set status='completed' where id=$1",[id]);
 assert.deepEqual(await scalar("select completed_at from orders where id=$1",[id]),first);
});
test("Legacy missing dates, future dates, expired orders and uncompleted orders are ineligible",async()=>{
 await db.exec("alter table orders disable trigger lnr_capture_order_completion");
 for(const completion of [null,"2020-01-01T00:00:00Z","2099-01-01T00:00:00Z"]){
  await q("update orders set completed_at=$1 where id=$2",[completion,order]);
  assert.equal((await rpc("lnr_return_item_context",[user,item])).eligible,false);
  await assert.rejects(upload(),/three days/);
  await assert.rejects(submit(),/three days/);
 }
 await q("update orders set status='shipping',completed_at=now() where id=$1",[order]);
 assert.equal((await rpc("lnr_return_item_context",[user,item])).eligible,false);
 await db.exec("alter table orders enable trigger lnr_capture_order_completion");
});
test("A photo-backed request persists its reason, ownership and history atomically",async()=>{
 await upload();const r=await submit();assert.equal(r.status,"pending");assert.equal(r.customer_id,cid);assert.equal(r.reason,reason);
 const c=await rpc("lnr_return_item_context",[user,item]);assert.equal(c.requests[0].evidence.length,1);assert.equal(c.requests[0].events.length,1);
 assert.equal(await scalar("select status from orders where id=$1",[order]),"completed");
});
test("Submission requires real uploaded metadata, not only an evidence reference",async()=>{
 await rpc("lnr_prepare_return_upload",[user,item,asset,"proof.png","image/png",8]);
 await assert.rejects(submit(),/upload is incomplete/);
 await upload();
 await q("update storage.objects set metadata='{\"size\":7,\"mimetype\":\"image/png\"}'::jsonb");
 await assert.rejects(submit(),/upload is incomplete/);
 await q("update storage.objects set metadata='{\"size\":8,\"mimetype\":\"video/mp4\"}'::jsonb");
 await assert.rejects(submit(),/upload is incomplete/);
 assert.equal(await scalar("select count(*)::int from return_requests"),0);
});
test("Request retries are idempotent and duplicate references cannot open another active request",async()=>{
 await upload();const first=await submit();const again=await submit();assert.equal(first.id,again.id);
 assert.equal(await scalar("select count(*)::int from return_request_events"),1);
 await assert.rejects(submit(request2),/already has/);
});
test("Evidence cannot be borrowed from a different customer or ordered product",async()=>{
 await upload(asset2,other,foreignItem);
 await assert.rejects(submit(request,[asset2]),/not available/);
 await assert.rejects(rpc("lnr_prepare_return_upload",[user,item,asset2,"proof.png","image/png",8]),/not available/);
});
test("Evidence count, distinct IDs and a meaningful reason are required",async()=>{
 await upload();
 await assert.rejects(submit(request,[]),/one to three/);
 await assert.rejects(submit(request,[asset,asset]),/one to three/);
 await assert.rejects(rpc("lnr_submit_return",[user,item,request,"x",[asset]]),/10 to 2000/);
});
test("Photos and videos have separate caps, allowed formats and an upload rate limit",async()=>{
 await assert.rejects(rpc("lnr_prepare_return_upload",[user,item,asset,"x","text/html",8]),/photo up to/);
 await assert.rejects(rpc("lnr_prepare_return_upload",[user,item,asset,"x","image/png",5242881]),/photo up to/);
 await upload(asset,user,item,"video/mp4",20971520);
 await assert.rejects(rpc("lnr_prepare_return_upload",[user,item,asset2,"x","video/mp4",20971521]),/photo up to/);
 for(let i=2;i<=20;i++)await rpc("lnr_prepare_return_upload",[user,item,"50000000-0000-4000-8000-"+String(i).padStart(12,"0"),"x","image/png",8]);
 await assert.rejects(rpc("lnr_prepare_return_upload",[user,item,"50000000-0000-4000-8000-000000000021","x","image/png",8]),/Too many/);
});
test("Only admins can review and customers cannot pick a method before approval",async()=>{
 await upload();await submit();
 await assert.rejects(review("approved",null,user),/Administrator/);
 await assert.rejects(method("store_dropoff"),/Wait for approval/);
 await review("approved");
 await assert.rejects(method("store_dropoff",null,other),/not found/);
 assert.equal((await method("store_dropoff")).status,"return_selected");
});
test("Pickup requires address/contact and can be changed before receipt",async()=>{
 await upload();await submit();await review("approved");
 await assert.rejects(method("rider_pickup","short"),/address and contact/);
 const r=await method("rider_pickup","Tabaco City, call 09000000000");assert.equal(r.return_method,"rider_pickup");
 const updated=await method("store_dropoff");assert.equal(updated.pickup_details,null);
});
test("A submitted request can be approved and arranged after its submission window ends",async()=>{
 await upload();await submit();await db.exec("alter table orders disable trigger lnr_capture_order_completion");
 await q("update orders set completed_at=now()-interval '5 days' where id=$1",[order]);
 await db.exec("alter table orders enable trigger lnr_capture_order_completion");
 await review("approved");assert.equal((await method("store_dropoff")).status,"return_selected");
});
test("Refund recording follows physical receipt and requires a real reference note",async()=>{
 await upload();await submit();await review("approved");
 await assert.rejects(review("refunded","GCash refund ref ABC123"),/cannot be changed/);
 await method("store_dropoff");await review("received","Item received and inspected.");
 await assert.rejects(review("refunded",""),/actual refund reference/);
 const r=await review("refunded","GCash refund reference ABC123");assert.equal(r.refund_reference,"GCash refund reference ABC123");
 await assert.rejects(method("rider_pickup","Address and contact"),/Wait for approval/);
 await assert.rejects(review("approved"),/cannot be changed/);
});
test("Rejection needs a reason and preserves history when a new request is submitted",async()=>{
 await upload();await submit();await assert.rejects(review("rejected",""),/rejection reason/);
 await review("rejected","Please provide a clearer photo.");
 await upload(asset2);await submit(request2,[asset2]);
 assert.equal(await scalar("select count(*)::int from return_requests"),2);
 assert.equal((await rpc("lnr_return_item_context",[user,item])).requests[0].id,request2);
});
test("Inactive customers, direct browser access and broad storage policies cannot bypass protections",async()=>{
 await q("update customers set status='inactive' where id=$1",[cid]);
 await assert.rejects(rpc("lnr_return_item_context",[user,item]),/active customer/);
 await db.exec("set role authenticated");
 await assert.rejects(rpc("lnr_return_item_context",[user,item]),/permission denied/);
 await assert.rejects(q("select * from return_requests"),/permission denied/);
 await assert.rejects(q("insert into storage.objects values('return-evidence','forged','{}')"),/row-level security/);
 await db.exec("reset role");
});
test("Reapplying the migration preserves records and completion timestamps",async()=>{
 await upload();await submit();const before=await scalar("select completed_at from orders where id=$1",[order]);
 await db.exec(sql);
 assert.deepEqual(await scalar("select completed_at from orders where id=$1",[order]),before);
 assert.equal(await scalar("select count(*)::int from return_requests"),1);
});

test("Mixed photo/video evidence is accepted and the customer sees approval and chosen method",async()=>{
 await upload(asset,user,item,"video/mp4",10000);await upload(asset2,user,item,"image/jpeg",1000);
 await submit(request,[asset,asset2]);await review("approved","Return approved for inspection.");
 let c=await rpc("lnr_return_item_context",[user,item]);
 assert.equal(c.requests[0].status,"approved");assert.equal(c.requests[0].evidence.length,2);
 await method("rider_pickup","Pickup at Tabaco City, contact 09000000000");
 c=await rpc("lnr_return_item_context",[user,item]);
 assert.equal(c.requests[0].return_method,"rider_pickup");assert.equal(c.requests[0].status,"return_selected");
});
test("The submission deadline is enforced at 72 hours, without a fresh window after upload",async()=>{
 await upload();
 await db.exec("alter table orders disable trigger lnr_capture_order_completion");
 await q("update orders set completed_at=now()-interval '3 days' where id=$1",[order]);
 await db.exec("alter table orders enable trigger lnr_capture_order_completion");
 assert.equal((await rpc("lnr_return_item_context",[user,item])).eligible,false);
 await assert.rejects(submit(),/three days/);
});

test("Admins can enter verified missing delivery dates without reopening old windows",async()=>{
 await db.exec("alter table orders disable trigger lnr_capture_order_completion");
 await q("update orders set completed_at=null where id=$1",[order]);
 await db.exec("alter table orders enable trigger lnr_capture_order_completion");
 await assert.rejects(rpc("lnr_set_return_completion",[user,order,new Date().toISOString()]),/Administrator/);
 await assert.rejects(rpc("lnr_set_return_completion",[admin,order,"2099-01-01T00:00:00Z"]),/verified delivery/);
 await rpc("lnr_set_return_completion",[admin,order,new Date(Date.now()-4*86400000).toISOString()]);
 assert.equal((await rpc("lnr_return_item_context",[user,item])).eligible,false);
 await assert.rejects(rpc("lnr_set_return_completion",[admin,order,new Date().toISOString()]),/already has/);
});
