import "server-only";
import {NextResponse} from "next/server";
import {getUser,getAdminUser} from "@/lib/supabase/server";
import {getAdminClient} from "@/lib/supabase/admin";
import {isAdmin} from "@/lib/auth/roles";
export class ReturnError extends Error{constructor(message:string,public status=400){super(message);}}
export const noStore={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"};
export function returnClient(){const c=getAdminClient();if(!c)throw new ReturnError("The shop service is unavailable.",503);return c;}
export async function returnActor(admin=false){
 const user=admin?await getAdminUser():await getUser();
 if(!user)throw new ReturnError("Please sign in again.",401);
 if(admin&&!isAdmin(user))throw new ReturnError("Administrator access required.",403);
 if(!admin&&isAdmin(user))throw new ReturnError("Use a customer account.",403);
 let customerId:string|null=null;
 if(!admin){const {data,error}=await returnClient().from("customers").select("id,status").eq("auth_user_id",user.id).maybeSingle();
  if(error)throw new ReturnError("Customer account could not be checked.",503);
  if(!data||data.status!=="active")throw new ReturnError("An active customer account is required.",403);
  customerId=data.id;
 }
 return {user,customerId};
}
export function returnUuid(v:unknown):string{if(typeof v!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))throw new ReturnError("Invalid return reference.");return v;}
export async function returnBody(request:Request){
 const origin=request.headers.get("origin");
 if((origin&&origin!==new URL(request.url).origin)||request.headers.get("sec-fetch-site")==="cross-site")throw new ReturnError("Request not allowed.",403);
 if(!request.headers.get("content-type")?.startsWith("application/json"))throw new ReturnError("Send JSON data.",415);
 const text=await request.text();if(text.length>16000)throw new ReturnError("The request is too large.",413);
 let b:unknown;try{b=JSON.parse(text);}catch{throw new ReturnError("Invalid request data.");}
 if(!b||typeof b!=="object"||Array.isArray(b))throw new ReturnError("Invalid request data.");
 return b as Record<string,unknown>;
}
export async function returnRpc(name:string,params:Record<string,unknown>){
 const {data,error}=await returnClient().rpc(name,params);
 if(error){
  if(["42P01","42883","PGRST202","PGRST205"].includes(error.code))throw new ReturnError("Returns are not set up yet. Apply migration 0024.",503);
  if(error.code==="P0001")throw new ReturnError(error.message);
  if(error.code==="23505")throw new ReturnError("This item already has an active return/refund request.",409);
  throw new ReturnError("The return request could not be saved. Please try again.",500);
 }return data;
}
export async function returnHttp(work:()=>Promise<unknown>){try{const data=await work();return data instanceof Response?data:NextResponse.json(data,{headers:noStore});}catch(e){return NextResponse.json({error:e instanceof ReturnError?e.message:"The return service is unavailable. Please try again."},{status:e instanceof ReturnError?e.status:500,headers:noStore});}}
