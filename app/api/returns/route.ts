import {returnActor,returnBody,returnHttp,returnRpc,returnUuid,ReturnError} from "@/lib/returns/server";
export const dynamic="force-dynamic";export const runtime="nodejs";
export function GET(request:Request){return returnHttp(async()=>{const {user}=await returnActor();return returnRpc("lnr_return_item_context",{p_user:user.id,p_item:returnUuid(new URL(request.url).searchParams.get("item"))});});}
export function POST(request:Request){return returnHttp(async()=>{
 const {user}=await returnActor();const b=await returnBody(request);
 if(b.operation==="method"){
  if(!["rider_pickup","store_dropoff"].includes(String(b.method))||b.details!=null&&typeof b.details!=="string")throw new ReturnError("Choose a return method and provide valid pickup details.");
  return returnRpc("lnr_select_return_method",{p_user:user.id,p_request:returnUuid(b.id),p_method:b.method,p_details:b.details??null});
 }
 if(b.operation!=="submit"||typeof b.reason!=="string"||!Array.isArray(b.assets)||b.assets.length<1||b.assets.length>3)throw new ReturnError("Provide a reason and one to three evidence files.");
 return returnRpc("lnr_submit_return",{p_user:user.id,p_item:returnUuid(b.item),p_id:returnUuid(b.id),p_reason:b.reason,p_assets:b.assets.map(returnUuid)});
});}
