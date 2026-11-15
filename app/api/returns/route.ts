import {returnClient,returnActor,returnBody,returnHttp,returnRpc,returnUuid,ReturnError} from "@/lib/returns/server";
export const dynamic="force-dynamic";export const runtime="nodejs";
export function GET(request:Request){return returnHttp(async()=>{
 const {user,customerId}=await returnActor();const params=new URL(request.url).searchParams;
 if(params.get("summary")==="1"){
  const page=Number(params.get("page")??0);
  if(!Number.isInteger(page)||page<0||page>1000)throw new ReturnError("Invalid return page.");
  const {data,error,count}=await returnClient().from("return_requests")
   .select("id,order_id,order_item_id,status,updated_at",{count:"exact"})
   .eq("customer_id",customerId).order("created_at",{ascending:false}).order("id",{ascending:false}).range(page*200,page*200+199);
  if(error)throw new ReturnError("Return history could not be loaded. Please check that returns are set up and try again.",503);
  return {requests:data??[],hasMore:(page+1)*200<(count??0)};
 }
 return returnRpc("lnr_return_item_context",{p_user:user.id,p_item:returnUuid(params.get("item"))});
});}
export function POST(request:Request){return returnHttp(async()=>{
 const {user}=await returnActor();const b=await returnBody(request);
 if(b.operation==="method"){
  if(!["rider_pickup","store_dropoff"].includes(String(b.method))||b.details!=null&&typeof b.details!=="string")throw new ReturnError("Choose a return method and provide valid pickup details.");
  return returnRpc("lnr_select_return_method",{p_user:user.id,p_request:returnUuid(b.id),p_method:b.method,p_details:b.details??null});
 }
 if(b.operation!=="submit"||typeof b.reason!=="string"||!Array.isArray(b.assets)||b.assets.length<1||b.assets.length>3)throw new ReturnError("Provide a reason and one to three evidence files.");
 return returnRpc("lnr_submit_return",{p_user:user.id,p_item:returnUuid(b.item),p_id:returnUuid(b.id),p_reason:b.reason,p_assets:b.assets.map(returnUuid)});
});}
