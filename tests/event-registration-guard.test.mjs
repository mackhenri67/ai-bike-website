import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
function setup(){
 const state={user:{id:'session-user'},active:null,lookupError:null,filters:[],calls:[],rpcError:null};
 const client={from(table){const query={select(){return query},eq(key,value){state.filters.push({table,key,value});return query},async maybeSingle(){return table==='customers'?{data:{id:'own-customer'},error:null}:{data:state.active,error:state.lookupError}}};return query},async rpc(name,params){state.calls.push({name,params});return {data:{registrationCode:'NEW-TICKET',paymentMethod:'gcash'},error:state.rpcError}}};
 const mocks={'server-only':{},'@/lib/supabase/server':{getUser:async()=>state.user,createClient:async()=>null},'@/lib/supabase/admin':{getAdminClient:()=>client},'@/lib/storage/proofs':{paymentProofUrl:async()=>null},'@/lib/data/admin/errors':{missingServiceRoleMessage:()=> 'Not configured',toFriendlyDbError:e=>e.message}};
 const unit={exports:{}};const code=ts.transpileModule(readFileSync(new URL('../lib/data/customer/events.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInThisContext('(function(exports,require){'+code+'})')(unit.exports,id=>{if(id in mocks)return mocks[id];throw Error('Unexpected module '+id)});
 return {state,api:unit.exports};
}
const input={eventId:'event',customerId:'forged-customer',riderName:'Rider',emergencyContact:'Contact 09171234567'};
test('Existing active ticket blocks the signup before any RPC or contact update',async()=>{
 const {state,api}=setup();state.active={registration_code:'EXISTING',payment_status:'paid'};
 const result=await api.createEventRegistration(input);assert.match(result.error,/already have an active registration/);assert.equal(result.data,null);assert.equal(state.calls.length,0);
 assert.ok(state.filters.some(f=>f.table==='customers'&&f.key==='auth_user_id'&&f.value==='session-user'));
 assert.ok(state.filters.some(f=>f.table==='event_registrations'&&f.key==='customer_id'&&f.value==='own-customer'));
 assert.ok(state.filters.some(f=>f.key==='status'&&f.value==='registered'));
});
test('No active ticket allows signup using the session user; a lookup failure fails closed',async()=>{
 const {state,api}=setup();assert.equal((await api.createEventRegistration(input)).data.registrationCode,'NEW-TICKET');assert.equal(state.calls[0].params.p_user,'session-user');
 state.lookupError={message:'Unavailable'};state.calls=[];assert.match((await api.createEventRegistration(input)).error,/could not be checked/);assert.equal(state.calls.length,0);
});
test('A unique-index race gives a useful message, and signed-out requests cannot register',async()=>{
 const {state,api}=setup();state.rpcError={code:'23505',message:'duplicate key'};assert.match((await api.createEventRegistration(input)).error,/already have an active registration/);
 state.user=null;state.calls=[];assert.match((await api.createEventRegistration(input)).error,/Sign in/);assert.equal(state.calls.length,0);
});
