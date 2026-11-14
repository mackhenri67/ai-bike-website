import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";

test("admin deletion is authorized, atomic, isolated and retryable with image cleanup",async()=>{
 const db=new PGlite();
 try{
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create table chat_conversations(id uuid primary key);
 create table chat_attachments(id uuid primary key,conversation_id uuid references chat_conversations(id),object_path text);
 create table chat_messages(id int primary key,conversation_id uuid references chat_conversations(id),attachment_id uuid references chat_attachments(id));
 create function lnr_chat_actor(p_user uuid,p_admin boolean)returns uuid language plpgsql as $$
 begin if p_user is distinct from '10000000-0000-4000-8000-000000000001'::uuid or not p_admin then raise exception 'Administrator access required.';end if;return null;end;$$;
 `);
 await db.exec(readFileSync(new URL("../supabase/migrations/0022_admin_conversation_delete.sql",import.meta.url),"utf8"));
 const admin="10000000-0000-4000-8000-000000000001",customer="10000000-0000-4000-8000-000000000002",a="20000000-0000-4000-8000-000000000001",b="20000000-0000-4000-8000-000000000002",image="30000000-0000-4000-8000-000000000001";
 await db.query("insert into chat_conversations values($1),($2)",[a,b]);
 await db.query("insert into chat_attachments values($1,$2,'customer/conversation/image.png')",[image,a]);
 await db.query("insert into chat_messages values(1,$1,$2),(2,$3,null)",[a,image,b]);
 await assert.rejects(db.query("select lnr_chat_delete_conversation($1,$2)",[customer,a]),/Administrator/);
 assert.equal((await db.query("select count(*)::int as n from chat_messages")).rows[0].n,2);
 await db.query("select lnr_chat_delete_conversation($1,$2)",[admin,a]);
 assert.deepEqual((await db.query("select id from chat_conversations")).rows,[{id:b}]);
 assert.equal((await db.query("select count(*)::int as n from chat_attachments")).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int as n from chat_messages")).rows[0].n,1);
 assert.equal((await db.query("select object_path from chat_image_cleanup")).rows[0].object_path,"customer/conversation/image.png");
 await db.query("select lnr_chat_delete_conversation($1,$2)",[admin,a]);
 assert.equal((await db.query("select count(*)::int as n from chat_image_cleanup")).rows[0].n,1);
 await db.exec("set role authenticated");
 await assert.rejects(db.query("select lnr_chat_delete_conversation($1,$2)",[admin,b]),/permission denied/);
 await assert.rejects(db.query("select * from chat_image_cleanup"),/permission denied/);
 }finally{await db.close();}
});
