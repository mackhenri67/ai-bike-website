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
const user={id:"10000000-0000-4000-8000-000000000002",app_metadata:{}};
const admin={id:"10000000-0000-4000-8000-000000000001",app_metadata:{role:"admin"}};
const item="40000000-0000-4000-8000-000000000001",asset="50000000-0000-4000-8000-000000000001",requestId="60000000-0000-4000-8000-000000000001";
function setup(){
 const state={user:null,admin:null,calls:[],filters:[],rpcError:null,active:true,signed:[],existing:null,storageError:null};
 const client={
  rpc:async(name,params)=>{state.calls.push({name,params});return {data:name==="lnr_prepare_return_upload"?{id:asset,path:"private/"+asset+".mp4"}:{ok:true},error:state.rpcError};},
  from(table){
   const query={
    select(){return query;},eq(key,value){state.filters.push({table,key,value});return query;},not(){return query;},order(){return query;},range(){return query;},
    async maybeSingle(){return {data:table==="customers"?{id:"customer-row",status:state.active?"active":"inactive"}:{object_path:"private/"+asset+".mp4",customer_id:"customer-row",request_id:requestId},error:null};},
    then(resolve){return Promise.resolve({data:[],error:null,count:0}).then(resolve);}
   };return query;
  },
  storage:{from(){return {
   info:async()=>({data:state.existing,error:null}),
   createSignedUploadUrl:async(path,options)=>{state.signed.push({path,options});return {data:{token:"upload-token"},error:state.storageError};},
   createSignedUrl:async(path,seconds)=>{state.signed.push({path,seconds});return {data:{signedUrl:"https://storage.test/signed/evidence"},error:state.storageError};}
  };}}
 };
 const load=loader({"@/lib/supabase/server":{getUser:async()=>state.user,getAdminUser:async()=>state.admin},"@/lib/supabase/admin":{getAdminClient:()=>client}});
 return {state,customer:load("app/api/returns/route.ts"),upload:load("app/api/returns/upload/route.ts"),media:load("app/api/returns/evidence/[id]/route.ts"),admin:load("app/api/admin/returns/route.ts")};
}
const get=(path)=>new Request("https://shop.test"+path);
const post=(body,origin="https://shop.test")=>new Request("https://shop.test/api/returns",{method:"POST",headers:{"Content-Type":"application/json",Origin:origin},body:JSON.stringify(body)});
const payload={operation:"submit",id:requestId,item,reason:"There is a visible crack in the frame.",assets:[asset]};
test("Return endpoints require the correct login and reject customer metadata escalation",async()=>{
 const a=setup();assert.equal((await a.customer.GET(get("/api/returns?item="+item))).status,401);
 a.state.user=user;assert.equal((await a.admin.GET(get("/api/admin/returns"))).status,401);
 a.state.admin={...user,user_metadata:{role:"admin"}};assert.equal((await a.admin.GET(get("/api/admin/returns"))).status,403);
 a.state.admin=admin;assert.equal((await a.admin.GET(get("/api/admin/returns"))).status,200);
});
test("Customer mutation uses the session user instead of posted actor IDs",async()=>{
 const a=setup();a.state.user=user;
 assert.equal((await a.customer.POST(post({...payload,p_user:admin.id,customer_id:"someone",status:"approved"}))).status,200);
 assert.equal(a.state.calls[0].params.p_user,user.id);assert.equal(a.state.calls[0].name,"lnr_submit_return");
});
test("Cross-site and malformed mutations never reach privileged database operations",async()=>{
 const a=setup();a.state.user=user;
 assert.equal((await a.customer.POST(post(payload,"https://other.test"))).status,403);
 assert.equal((await a.customer.POST(post({...payload,item:"invalid"}))).status,400);
 assert.equal((await a.customer.POST(post({...payload,assets:[]}))).status,400);
 assert.equal(a.state.calls.length,0);
});
test("Inactive customers cannot read or create returns",async()=>{
 const a=setup();a.state.user=user;a.state.active=false;
 assert.equal((await a.customer.GET(get("/api/returns?item="+item))).status,403);
 assert.equal((await a.upload.POST(post({item,id:asset,name:"x.png",mime:"image/png",size:8}))).status,403);
});
test("Video uploads are signed for a server-chosen path without proxying the file through Next.js",async()=>{
 const a=setup();a.state.user=user;
 const response=await a.upload.POST(post({item,id:asset,name:"problem.mp4",mime:"video/mp4",size:20*1024*1024,path:"forged",p_user:admin.id}));
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.path,"private/"+asset+".mp4");assert.equal(data.token,"upload-token");
 assert.equal(a.state.calls[0].params.p_user,user.id);assert.deepEqual(a.state.signed[0].options,{upsert:false});
});
test("API enforces image/video size and type limits before issuing upload capabilities",async()=>{
 const a=setup();a.state.user=user;
 for(const input of [{mime:"text/html",size:8},{mime:"image/png",size:5242881},{mime:"video/mp4",size:20971521},{mime:"video/mp4",size:0},{mime:"image/png",size:1.5}]){
  assert.equal((await a.upload.POST(post({item,id:asset,name:"x",...input}))).status,400);
 }
 assert.equal(a.state.calls.length,0);assert.equal(a.state.signed.length,0);
});
test("Existing completed uploads can be retried, but size/type mismatches fail",async()=>{
 const a=setup();a.state.user=user;a.state.existing={size:8,contentType:"image/png"};
 const body={item,id:asset,name:"x.png",mime:"image/png",size:8};
 const response=await a.upload.POST(post(body));assert.equal((await response.json()).exists,true);assert.equal(a.state.signed.length,0);
 a.state.existing.size=9;assert.equal((await a.upload.POST(post(body))).status,400);
});
test("Evidence redirects require ownership filters and admin mode requires an admin session",async()=>{
 const a=setup();a.state.user=user;const ctx={params:Promise.resolve({id:asset})};
 const response=await a.media.GET(get("/api/returns/evidence/"+asset),ctx);
 assert.equal(response.status,302);assert.match(response.headers.get("cache-control"),/no-store/);
 assert.ok(a.state.filters.some(f=>f.table==="return_evidence"&&f.key==="customer_id"&&f.value==="customer-row"));
 assert.equal(a.state.signed[0].seconds,120);
 assert.equal((await a.media.GET(get("/api/returns/evidence/"+asset+"?admin=1"),ctx)).status,401);
});
test("Review calls use the admin session and invalid decisions never reach SQL",async()=>{
 const a=setup();a.state.admin=admin;
 assert.equal((await a.admin.POST(post({id:requestId,status:"refunded",note:"GCash refund transaction reference",p_user:user.id}))).status,200);
 assert.equal(a.state.calls[0].params.p_user,admin.id);
 assert.equal((await a.admin.POST(post({id:requestId,status:"invented"}))).status,400);
});
test("Missing migration errors are actionable and never expose database internals",async()=>{
 const a=setup();a.state.user=user;a.state.rpcError={code:"PGRST202",message:"private schema internals"};
 const response=await a.customer.GET(get("/api/returns?item="+item));
 assert.equal(response.status,503);assert.match((await response.json()).error,/migration 0024/);
});

test("Only the admin session can record verified missing delivery timestamps",async()=>{
 const a=setup();a.state.user=user;
 const body={operation:"record_completion",order:requestId,when:"2026-11-13T10:00:00+08:00",p_user:user.id};
 assert.equal((await a.admin.POST(post(body))).status,401);
 a.state.admin=admin;
 assert.equal((await a.admin.POST(post(body))).status,200);
 assert.equal(a.state.calls[0].name,"lnr_set_return_completion");
 assert.equal(a.state.calls[0].params.p_user,admin.id);
 assert.equal((await a.admin.POST(post({...body,when:"invalid"}))).status,400);
});
