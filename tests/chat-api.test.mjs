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

const imageId="40000000-0000-4000-8000-000000000001";
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
function imageRequest(bytes=png,type="image/png",origin="https://shop.test"){
 const form=new FormData();form.set("image_id",imageId);form.set("file",new File([bytes],"photo.png",{type}));
 return new Request("https://shop.test/api/chat/attachment",{method:"POST",headers:{Origin:origin},body:form});
}
function imageSetup(){
 const state={customer:null,admin:null,calls:[],storageCalls:[],uploadError:null,rpcError:null};
 const storage={
  upload:async(...args)=>{state.storageCalls.push({operation:"upload",args});return{error:state.uploadError};},
  download:async(...args)=>{state.storageCalls.push({operation:"download",args});return{data:new Blob([png],{type:"image/png"}),error:null};},
  remove:async(...args)=>{state.storageCalls.push({operation:"remove",args});return{error:null};},
 };
 const service={rpc:async(name,params)=>{
  state.calls.push({name,params});
  const data=name==="lnr_chat_prepare_image"?{id:imageId,conversation_id:conversation,path:"private/photo.png",ready:false}:name==="lnr_chat_image"?{path:"private/photo.png",mime_type:"image/png"}:name==="lnr_chat_discard_image"?"private/photo.png":{ok:true};
  return{data,error:state.rpcError};
 },storage:{from:(bucket)=>{assert.equal(bucket,"chat-images");return storage;}}};
 const load=loader({
  "@/lib/supabase/server":{getUser:async()=>state.customer,getAdminUser:async()=>state.admin},
  "@/lib/supabase/admin":{getAdminClient:()=>service},
  "@/lib/data/customer/customers":{getOrCreateCustomer:async()=>({status:"active"})},
 });
 return{state,customer:load("app/api/chat/attachment/route.ts"),admin:load("app/api/admin/messages/[id]/attachment/route.ts"),customerImage:load("app/api/chat/images/[id]/route.ts"),adminImage:load("app/api/admin/chat-images/[id]/route.ts")};
}
test("Image upload requires the correct login and rejects foreign origins before storage",async()=>{
 const app=imageSetup();
 assert.equal((await app.customer.POST(imageRequest())).status,401);
 app.state.admin=admin;
 assert.equal((await app.customer.POST(imageRequest())).status,401);
 app.state.customer=customer;
 assert.equal((await app.customer.POST(imageRequest(png,"image/png","https://foreign.test"))).status,403);
 assert.equal(app.state.calls.length,0);assert.equal(app.state.storageCalls.length,0);
});
test("Customer and admin uploads fix identity and conversation on the server",async()=>{
 const app=imageSetup();app.state.customer=customer;
 assert.equal((await app.customer.POST(imageRequest())).status,200);
 assert.equal(app.state.calls[0].params.p_user,customer.id);
 assert.equal(app.state.calls[0].params.p_admin,false);
 assert.equal(app.state.calls[0].params.p_conversation,null);
 assert.equal(app.state.storageCalls[0].args[2].upsert,false);
 assert.equal(app.state.calls.at(-1).name,"lnr_chat_finish_image");
 app.state.admin=admin;app.state.calls=[];
 assert.equal((await app.admin.POST(imageRequest(),{params:Promise.resolve({id:conversation})})).status,200);
 assert.equal(app.state.calls[0].params.p_user,admin.id);
 assert.equal(app.state.calls[0].params.p_admin,true);
 assert.equal(app.state.calls[0].params.p_conversation,conversation);
 const chat=setup();chat.state.customer=customer;
 assert.equal((await chat.customer.POST(post({...send,body:"",image_id:imageId}))).status,200);
 assert.equal(chat.state.calls.at(-1).params.p_image,imageId);
});
test("Invalid image bytes, wrong MIME types and oversized bodies never reach storage",async()=>{
 const app=imageSetup();app.state.customer=customer;
 assert.equal((await app.customer.POST(imageRequest(new TextEncoder().encode("<svg/>")))).status,415);
 assert.equal((await app.customer.POST(imageRequest(png,"image/jpeg"))).status,415);
 assert.equal((await app.customer.POST(imageRequest(new Uint8Array(3*1024*1024+1)))).status,400);
 const oversized=new Request("https://shop.test/api/chat/attachment",{method:"POST",headers:{Origin:"https://shop.test","Content-Type":"multipart/form-data; boundary=test"},body:new Uint8Array(3*1024*1024+70000)});
 assert.equal((await app.customer.POST(oversized)).status,413);
 assert.equal(app.state.calls.length,0);assert.equal(app.state.storageCalls.length,0);
});
test("Image reads use an authorized private route and draft cleanup uses the owner",async()=>{
 const app=imageSetup();app.state.customer=customer;
 const ctx={params:Promise.resolve({id:imageId})};
 const response=await app.customerImage.GET(get(),ctx);
 assert.equal(response.status,200);assert.match(response.headers.get("cache-control"),/private.*no-store/);
 assert.equal(response.headers.get("x-content-type-options"),"nosniff");
 assert.equal(response.headers.get("content-type"),"image/png");
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),png);
 assert.equal(app.state.calls[0].params.p_user,customer.id);
 assert.equal((await app.adminImage.GET(get(),ctx)).status,401);
 app.state.admin=admin;assert.equal((await app.adminImage.GET(get(),ctx)).status,200);
 assert.equal(app.state.calls.at(-1).params.p_admin,true);
 assert.equal((await app.customer.DELETE(post({image_id:imageId}))).status,200);
 assert.equal(app.state.calls.at(-1).params.p_user,customer.id);
 assert.equal(app.state.storageCalls.at(-1).operation,"remove");
 const count=app.state.storageCalls.length;
 app.state.rpcError={code:"P0001",message:"Conversation access required."};
 assert.equal((await app.customerImage.GET(get(),ctx)).status,403);
 assert.equal(app.state.storageCalls.length,count);
});
test("Retry finishes an upload when Supabase reports an existing object with HTTP 400",async()=>{
 const app=imageSetup();app.state.customer=customer;
 app.state.uploadError={statusCode:"400",message:"The resource already exists"};
 assert.equal((await app.customer.POST(imageRequest())).status,200);
 assert.equal(app.state.calls.at(-1).name,"lnr_chat_finish_image");
});
