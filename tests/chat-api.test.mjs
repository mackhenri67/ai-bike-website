import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
function loader(mocks = {}, fallback = () => undefined) {
  const cache = new Map();
  function load(filename) {
    const full = path.resolve(root, filename);
    if (cache.has(full)) return cache.get(full).exports;
    const unit = { exports: {} };
    cache.set(full, unit);
    const code = ts.transpileModule(readFileSync(full, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: full,
    }).outputText;
    function localRequire(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === "server-only") return {};
      const replacement = fallback(id);
      if (replacement !== undefined) return replacement;
      if (id.startsWith("@/") || id.startsWith(".")) {
        const base = id.startsWith("@/")
          ? path.join(root, id.slice(2))
          : path.resolve(path.dirname(full), id);
        const found = [base, base + ".ts", base + ".tsx"].find(existsSync);
        if (!found) throw new Error("Unresolved " + id);
        return load(found);
      }
      return nodeRequire(id);
    }
    vm.runInThisContext(
      "(function(exports,require,module){\n" + code + "\n})",
      { filename: full },
    )(unit.exports, localRequire, unit);
    return unit.exports;
  }
  return load;
}
const customer={id:"10000000-0000-4000-8000-000000000002",app_metadata:{}};
const admin={id:"10000000-0000-4000-8000-000000000001",app_metadata:{role:"admin"}};
const conversation="20000000-0000-4000-8000-000000000001";
const client="30000000-0000-4000-8000-000000000001";
const get=(url="/api/chat")=>new Request("https://shop.test"+url);
const post=(value,origin="https://shop.test")=>new Request("https://shop.test/api/chat",{method:"POST",headers:{"Content-Type":"application/json",Origin:origin},body:JSON.stringify(value)});
const send={operation:"send",body:"Is this bike available?",client_id:client};
function setup(){
 const state={customer:null,admin:null,error:null,calls:[]};
 const load=loader({
  "@/lib/supabase/server":{getUser:async()=>state.customer,getAdminUser:async()=>state.admin},
  "@/lib/supabase/admin":{getAdminClient:()=>({rpc:async(name,params)=>{state.calls.push({name,params});return {data:{ok:true},error:state.error};}})},
  "@/lib/data/customer/customers":{getOrCreateCustomer:async()=>({status:"active"})},
 });
 return {state,customer:load("app/api/chat/route.ts"),inbox:load("app/api/admin/messages/route.ts"),thread:load("app/api/admin/messages/[id]/route.ts")};
}
test("Customer and admin messaging endpoints require their corresponding login",async()=>{
 const app=setup();
 assert.equal((await app.customer.GET(get())).status,401);
 app.state.customer=customer;
 assert.equal((await app.inbox.GET(get())).status,401);
 app.state.customer=null;app.state.admin=admin;
 assert.equal((await app.customer.GET(get())).status,401);
 assert.equal((await app.inbox.GET(get())).status,200);
 assert.equal(app.state.calls.at(-1).params.p_user,admin.id);
});
test("Customer metadata cannot grant access to the admin inbox",async()=>{
 const app=setup();app.state.admin={...customer,user_metadata:{role:"admin"}};
 assert.equal((await app.inbox.GET(get())).status,403);
 assert.equal(app.state.calls.length,0);
});
test("The server fixes the sender identity and role instead of trusting posted values",async()=>{
 const app=setup();app.state.customer=customer;
 assert.equal((await app.customer.POST(post({...send,user_id:admin.id,p_user:admin.id,p_admin:true,sender_role:"admin"}))).status,200);
 assert.equal(app.state.calls.at(-1).params.p_user,customer.id);
 assert.equal(app.state.calls.at(-1).params.p_admin,false);
 assert.equal(app.state.calls.at(-1).params.p_conversation,null);
});
test("Cross-origin requests and invalid messages/cursors never reach a privileged RPC",async()=>{
 const app=setup();app.state.customer=customer;
 assert.equal((await app.customer.POST(post(send,"https://unrelated.test"))).status,403);
 for(const body of ["", "  ", "x".repeat(2001)])assert.equal((await app.customer.POST(post({...send,body}))).status,400);
 for(const cursor of ["-1","invalid","9999999999999999999"])assert.equal((await app.customer.GET(get("/api/chat?before="+cursor))).status,400);
 assert.equal((await app.customer.POST(post({...send,client_id:"invalid"}))).status,400);
 assert.equal(app.state.calls.length,0);
});
test("Admin replies use the authenticated admin and the conversation in the route",async()=>{
 const app=setup();app.state.admin=admin;
 const ctx={params:Promise.resolve({id:conversation})};
 assert.equal((await app.thread.POST(post({...send,conversation_id:client,user_id:customer.id}),ctx)).status,200);
 assert.equal(app.state.calls.at(-1).params.p_user,admin.id);
 assert.equal(app.state.calls.at(-1).params.p_admin,true);
 assert.equal(app.state.calls.at(-1).params.p_conversation,conversation);
 assert.equal((await app.thread.GET(get(),ctx)).status,200);
});
test("Read acknowledgements pass the displayed cursor and require a valid reference",async()=>{
 const app=setup();app.state.customer=customer;
 assert.equal((await app.customer.POST(post({operation:"read",conversation_id:conversation,through:"123"}))).status,200);
 assert.equal(app.state.calls.at(-1).params.p_through,"123");
 assert.equal(app.state.calls.at(-1).params.p_user,customer.id);
 assert.equal((await app.customer.POST(post({operation:"read",conversation_id:conversation,through:"-1"}))).status,400);
});
test("Responses are private and report rate-limit/setup failures without success",async()=>{
 const app=setup();app.state.customer=customer;
 assert.match((await app.customer.GET(get())).headers.get("cache-control"),/private.*no-store/);
 app.state.error={code:"P0001",message:"Too many messages. Please wait a minute and try again."};
 assert.equal((await app.customer.POST(post(send))).status,429);
 app.state.error={code:"PGRST202",message:"Missing function"};
 assert.equal((await app.customer.GET(get())).status,503);
});
