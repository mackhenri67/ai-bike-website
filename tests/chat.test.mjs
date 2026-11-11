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
const query = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) =>
  Object.values((await query(sql, args)).rows[0])[0];
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
    "0017_customer_admin_chat.sql",
    "0018_chat_images.sql",
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

});
after(async () => {
  if (db) await db.close();
});

const send = (user=a,asAdmin=false,conversation=null,body="Hello shop",client=crypto.randomUUID()) =>
 scalar("select public.lnr_chat_send($1,$2,$3,$4,$5)",[user,asAdmin,conversation,body,client]);
const thread = (user=a,asAdmin=false,conversation=null,before=null) =>
 scalar("select public.lnr_chat_thread($1,$2,$3,$4)",[user,asAdmin,conversation,before]);
const inbox = (user=admin,beforeTime=null,beforeId=null,search="") =>
 scalar("select public.lnr_chat_inbox($1,$2,$3,$4,false)",[user,beforeTime,beforeId,search]);
const read = (user,asAdmin,conversation,through) => query("select public.lnr_chat_read($1,$2,$3,$4)",[user,asAdmin,conversation,through]);

test("Customer starts one saved conversation and admin replies to that customer",async()=>{
 assert.equal((await thread()).conversation_id,null);
 assert.deepEqual((await inbox()).conversations,[]);
 const first=await send();
 await send(admin,true,first.conversation_id,"Hello! How can we help?");
 const customer=await thread();const shop=await thread(admin,true,first.conversation_id);
 assert.deepEqual(customer.messages,shop.messages);
 assert.equal(customer.messages.length,2);
 assert.equal(customer.messages[1].sender_role,"admin");
 assert.equal(await scalar("select count(*) from public.chat_conversations"),1);
});
test("Customers cannot read, reply to, or mark another customer's thread read",async()=>{
 const first=await send();const second=await send(b);
 assert.notEqual(first.conversation_id,second.conversation_id);
 for(const action of [()=>thread(b,false,first.conversation_id),()=>send(b,false,first.conversation_id),()=>read(b,false,first.conversation_id,first.message.id)])await assert.rejects(action(),/not available/);
 assert.equal((await thread(b)).messages.length,1);
});
test("An ordinary customer cannot impersonate an admin; inactive customers are blocked",async()=>{
 await assert.rejects(inbox(a),/Administrator access/);
 await assert.rejects(send(a,true),/Administrator access/);
 await assert.rejects(send(admin,false),/customer account/);
 await query("update public.customers set status='inactive' where id=$1",[ca]);
 await assert.rejects(thread(),/active customer/);
 await assert.rejects(send(),/active customer/);
});
test("Read cursors are separate, monotonic, and do not consume messages arriving later",async()=>{
 const first=await send();const cid=first.conversation_id;
 assert.equal((await inbox()).unread_count,1);
 await read(admin,true,cid,first.message.id);
 const next=await send();
 await read(admin,true,cid,first.message.id);
 assert.equal((await inbox()).unread_count,1);
 await read(admin,true,cid,next.message.id);
 assert.equal((await inbox()).unread_count,0);
 const reply=await send(admin,true,cid,"Reply");
 assert.equal((await thread()).unread_count,1);
 await read(a,false,cid,reply.message.id);
 await send(admin,true,cid,"New reply");
 await read(a,false,cid,first.message.id);
 assert.equal((await thread()).unread_count,1);
});
test("A retried send saves exactly once and reusing its ID for different text fails",async()=>{
 const client=crypto.randomUUID();const first=await send(a,false,null,"One message",client);
 const retry=await send(a,false,null,"One message",client);
 assert.deepEqual(retry,first);
 await assert.rejects(send(a,false,null,"Different message",client),/new reference/);
 assert.equal(await scalar("select count(*) from public.chat_messages"),1);
 assert.equal((await inbox()).unread_count,1);
});
test("Earlier messages are paginated in order without loss or duplication",async()=>{
 const first=await send();
 await query("insert into public.chat_messages(conversation_id,sender_user_id,sender_role,body,client_id) select $1,$2,'admin','Historic message '||i,gen_random_uuid() from generate_series(1,64)i",[first.conversation_id,admin]);
 const latest=await thread();assert.equal(latest.messages.length,50);assert.equal(latest.has_more,true);
 const older=await thread(a,false,null,latest.messages[0].id);assert.equal(older.messages.length,15);assert.equal(older.has_more,false);
 const all=[...older.messages,...latest.messages];assert.equal(new Set(all.map(m=>m.id)).size,65);
 assert.ok(all.every((m,i)=>i===0||BigInt(m.id)>BigInt(all[i-1].id)));
});
test("Admin inbox supports customer search and a stable older-conversation cursor",async()=>{
 await send();
 for(let i=0;i<32;i++){
  const customer=await scalar("insert into public.customers(full_name,email)values($1,$2)returning id",[`Rider ${i}`,`rider${i}@example.com`]);
  const cid=await scalar("insert into public.chat_conversations(customer_id,last_message_at)values($1,now()+($2||' seconds')::interval)returning id",[customer,i+1]);
  const mid=await scalar("insert into public.chat_messages(conversation_id,sender_user_id,sender_role,body,client_id)values($1,$2,'customer','Question',gen_random_uuid())returning id",[cid,a]);
  await query("update public.chat_conversations set last_message_id=$1 where id=$2",[mid,cid]);
 }
 const latest=await inbox();assert.equal(latest.conversations.length,30);assert.equal(latest.has_more,true);
 const last=latest.conversations.at(-1);const earlier=await inbox(admin,last.last_message_at,last.id);
 assert.equal(earlier.conversations.length,3);assert.equal(earlier.has_more,false);
 assert.equal(new Set([...latest.conversations,...earlier.conversations].map(c=>c.id)).size,33);
 assert.equal((await inbox(admin,null,null,"rider31@example.com")).conversations.length,1);
 assert.equal((await inbox(admin,null,null,"Customer A")).conversations[0].customer_name,"Customer A");
});
test("Browser roles have no direct chat-table or privileged-RPC access",async()=>{
 const first=await send();
 for(const role of ["anon","authenticated"]){
  await db.exec(`set role ${role}`);
  try{
   await assert.rejects(query("select * from public.chat_messages"),/permission denied/);
   await assert.rejects(query("select * from public.chat_conversations"),/permission denied/);
   await assert.rejects(thread(admin,true,first.conversation_id),/permission denied/);
   await assert.rejects(send(admin,true,first.conversation_id),/permission denied/);
   await assert.rejects(inbox(),/permission denied/);
   await assert.rejects(read(a,false,first.conversation_id,first.message.id),/permission denied/);
  }finally{await db.exec("reset role");}
 }
 await db.exec("set role service_role");
 try{assert.equal((await thread(admin,true,first.conversation_id)).messages.length,1);}
 finally{await db.exec("reset role");}
});
test("Send validation and the per-minute limit preserve idempotent retries",async()=>{
 for(const body of ["", "   ", "x".repeat(2001)])await assert.rejects(send(a,false,null,body),/message or choose an image/);
 const client=crypto.randomUUID();await send(a,false,null,"Original",client);
 for(let i=1;i<30;i++)await send(a,false,null,`Message ${i}`);
 await assert.rejects(send(),/Too many messages/);
 await send(a,false,null,"Original",client);
 assert.equal(await scalar("select count(*) from public.chat_messages"),30);
});
test("Migration can be rerun without losing messages or read markers",async()=>{
 const first=await send(a,false,null,"Literal text <script>alert(1)</script>");
 await read(admin,true,first.conversation_id,first.message.id);
 await db.exec(readFileSync(path.join(root,"supabase/migrations/0018_chat_images.sql"),"utf8"));
 assert.equal((await thread()).messages[0].body,"Literal text <script>alert(1)</script>");
 assert.equal((await inbox()).unread_count,0);
});


const imageDraft=(user=a,asAdmin=false,cid=null)=>scalar("select public.lnr_chat_prepare_image($1,$2,$3,$4,'image/png',100,'photo.png')",[user,asAdmin,cid,crypto.randomUUID()]);
const readyImage=async(user=a,asAdmin=false,cid=null)=>{const image=await imageDraft(user,asAdmin,cid);await query("insert into storage.objects(bucket_id,name)values('chat-images',$1)",[image.path]);await query("select public.lnr_chat_finish_image($1,$2,$3)",[user,asAdmin,image.id]);return image;};
const imageSend=(user,asAdmin,cid,image,text="",client=crypto.randomUUID())=>scalar("select public.lnr_chat_send_with_image($1,$2,$3,$4,$5,$6)",[user,asAdmin,cid,text,client,image]);
const accessImage=(user,asAdmin,image)=>scalar("select public.lnr_chat_image($1,$2,$3)",[user,asAdmin,image]);
test("Customer image-only message and admin captioned reply remain private",async()=>{
 const first=await readyImage();await assert.rejects(accessImage(admin,true,first.id),/not available/);
 const sent=await imageSend(a,false,null,first.id);assert.equal(sent.message.body,"");assert.equal(sent.message.image.id,first.id);assert.equal((await inbox()).conversations[0].last_message,"Image");assert.equal((await accessImage(admin,true,first.id)).path,first.path);
 const reply=await readyImage(admin,true,first.conversation_id);await imageSend(admin,true,first.conversation_id,reply.id,"Available frame");assert.equal((await thread()).messages.at(-1).image.id,reply.id);assert.equal((await accessImage(a,false,reply.id)).path,reply.path);await assert.rejects(accessImage(b,false,reply.id),/not available/);
});
test("Foreign images, wrong conversations and unfinished uploads cannot be sent",async()=>{
 const first=await send();const second=await send(b);const image=await readyImage(a,false,first.conversation_id);await assert.rejects(imageSend(b,false,second.conversation_id,image.id),/not available/);await assert.rejects(imageSend(admin,true,first.conversation_id,image.id),/not available/);await assert.rejects(imageDraft(b,false,first.conversation_id),/not available/);const pending=await imageDraft();await assert.rejects(imageSend(a,false,null,pending.id),/not available/);await assert.rejects(query("select public.lnr_chat_finish_image($1,false,$2)",[a,pending.id]),/not found/);
});
test("Image retries save once and sent attachments cannot be discarded",async()=>{
 const image=await readyImage();const client=crypto.randomUUID();const first=await imageSend(a,false,null,image.id,"Caption",client);assert.deepEqual(await imageSend(a,false,null,image.id,"Caption",client),first);await assert.rejects(imageSend(a,false,null,image.id,"Different"),/not available/);await assert.rejects(query("select public.lnr_chat_discard_image($1,false,$2)",[a,image.id]),/already sent/);assert.equal((await thread()).messages.length,1);
});
test("Unused drafts can be removed without changing other messages",async()=>{
 await send();const image=await readyImage();assert.equal(await scalar("select public.lnr_chat_discard_image($1,false,$2)",[a,image.id]),image.path);await assert.rejects(imageSend(a,false,null,image.id),/not available/);await assert.rejects(accessImage(a,false,image.id),/not available/);assert.equal((await thread()).messages.length,1);
});
test("Private bucket rejects broad browser reads and enforces size/type limits",async()=>{
 for(const [mime,size]of [["image/svg+xml",100],["image/png",3145729]])await assert.rejects(scalar("select public.lnr_chat_prepare_image($1,false,null,$2,$3,$4,'bad')",[a,crypto.randomUUID(),mime,size]),/up to 3MB/);
 const image=await readyImage();await db.exec("create policy test_broad_read on storage.objects for select to authenticated using(true);set role authenticated");try{await assert.rejects(query("select * from public.chat_attachments"),/permission denied/);await assert.rejects(accessImage(a,false,image.id),/permission denied/);assert.equal((await query("select * from storage.objects where bucket_id='chat-images'")).rows.length,0);}finally{await db.exec("reset role;drop policy test_broad_read on storage.objects");}assert.equal(await scalar("select public from storage.buckets where id='chat-images'"),false);
});
test("Reapplying image migration preserves attachments, text and read markers",async()=>{
 await send();const image=await readyImage();const sent=await imageSend(a,false,null,image.id);await read(admin,true,image.conversation_id,sent.message.id);await db.exec(readFileSync(path.join(root,"supabase/migrations/0018_chat_images.sql"),"utf8"));assert.equal((await thread()).messages.length,2);assert.equal((await thread()).messages.at(-1).image.id,image.id);assert.equal((await inbox()).unread_count,0);
});
