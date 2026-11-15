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
const { NextRequest } = nodeRequire("next/server");
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

const admin={id:'admin-a',email:'admin@example.com',app_metadata:{role:'admin'}};
const state={saved:false,error:null};
const form=(values)=>{const f=new FormData();for(const [k,v] of Object.entries(values))f.set(k,v);return f;};
const passwords=(values={})=>form({current_password:'OldPassword1',new_password:'NewPassword2',confirm_password:'NewPassword2',...values});
function setup({verified=admin,verifyError=null,refreshError=null,denied=false}={}){
 const calls=[];
 const load=loader({
  '@/lib/auth/guards':{requireAdmin:async()=>{if(denied)throw new Error('denied');return admin;}},
  '@/lib/supabase/config':{getSupabaseConfig:()=>({url:'https://example.supabase.co',anonKey:'public'})},
  '@supabase/supabase-js':{createClient:()=>({auth:{signInWithPassword:async(v)=>{calls.push(['verify',v]);return {data:{user:verified},error:verifyError};},updateUser:async(v)=>{calls.push(['update',v]);return {error:null};}}})},
  '@/lib/supabase/server':{createAdminSessionClient:async()=>({auth:{signInWithPassword:async(v)=>{calls.push(['refresh',v]);return {error:refreshError};}}})},
  '@/lib/supabase/admin':{getAdminClient:()=>({rpc:async(name,values)=>{calls.push(['rpc',name,values]);return {error:null};}})},
  'next/cache':{revalidatePath:()=>{}},
 });return {actions:load('app/admin/(shell)/settings/security-shipping-actions.ts'),calls,load};
}
test('Wrong current password or different account cannot update password',async()=>{
 for(const options of [{verifyError:{message:'bad'}},{verified:{...admin,id:'other'}},{verified:{...admin,app_metadata:{}}}]){const {actions,calls}=setup(options);assert.equal((await actions.changeAdminPassword(state,passwords())).saved,false);assert.equal(calls.some(c=>c[0]==='update'),false);}
});
test('Invalid password fields and unauthorized session cannot mutate auth',async()=>{
 for(const values of [{new_password:'short'},{confirm_password:'Mismatch'},{new_password:'OldPassword1',confirm_password:'OldPassword1'}]){const {actions,calls}=setup();assert.equal((await actions.changeAdminPassword(state,passwords(values))).saved,false);assert.equal(calls.length,0);}
 const {actions,calls}=setup({denied:true});await assert.rejects(actions.changeAdminPassword(state,passwords()),/denied/);assert.equal(calls.length,0);
});
test('Own password update refreshes admin session and does not return credentials',async()=>{
 const {actions,calls}=setup();const result=await actions.changeAdminPassword(state,passwords());assert.equal(result.saved,true);assert.deepEqual(calls.map(c=>c[0]),['verify','update','refresh']);assert.equal(calls[0][1].email,admin.email);assert.equal(calls[1][1].current_password,'OldPassword1');assert(!JSON.stringify(result).includes('Password2'));
});
test('Refresh failure after saved password correctly requests a new sign-in',async()=>{const {actions}=setup({refreshError:{message:'expired'}});const result=await actions.changeAdminPassword(state,passwords());assert.equal(result.saved,true);assert.match(result.notice,/sign in again/);});
test('Shipping action validates rate and uses the trusted signed-in admin ID',async()=>{const {actions,calls}=setup();assert.equal((await actions.saveShippingFee(state,form({shipping_fee:'12.345'}))).saved,false);assert.equal(calls.length,0);assert.equal((await actions.saveShippingFee(state,form({shipping_fee:'85.50',p_admin:'attacker'}))).saved,true);assert.equal(calls[0][2].p_admin,admin.id);assert.equal(calls[0][2].p_fee,85.5);});
test('Fee validation accepts zero/decimals and rejects malformed or excessive values',()=>{const {load}=setup();const {parseShippingFee}=load('lib/admin-settings-validation.ts');for(const v of ['0','190','85.50'])assert.equal(parseShippingFee(v),Number(v));for(const v of ['',null,'-1','1.234','100001','1e3','NaN'])assert.equal(parseShippingFee(v),null);});
