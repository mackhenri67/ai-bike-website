import {returnActor,returnBody,returnClient,returnHttp,returnRpc,returnUuid,ReturnError} from "@/lib/returns/server";
import {RETURN_LABELS} from "@/lib/returns/types";
export const dynamic="force-dynamic";export const runtime="nodejs";
export function GET(request:Request){return returnHttp(async()=>{
 await returnActor(true);const p=new URL(request.url).searchParams;const page=Math.min(1000,Math.max(0,Number(p.get("page"))||0));
 if(!Number.isInteger(page))throw new ReturnError("Invalid page.");
 if(p.get("missingDates")==="1"){
  const {data,error,count}=await returnClient().from("orders").select("id,order_number,customer_name,created_at",{count:"exact"}).eq("status","completed").is("completed_at",null).order("created_at",{ascending:false}).range(page*50,page*50+49);
  if(error)throw new ReturnError("Apply migration 0024 to manage delivery dates.",503);
  return {orders:data??[],page,total:count??0,hasMore:(page+1)*50<(count??0)};
 }
 const status=p.get("status")??"all";if(status!=="all"&&!Object.hasOwn(RETURN_LABELS,status))throw new ReturnError("Invalid return status.");
 let q=returnClient().from("return_requests").select("*,order:orders(order_number,customer_name,customer_phone,shipping_address,completed_at),item:order_items(product_name,quantity,line_total,size,color),evidence:return_evidence(id,mime_type,file_name,byte_size),events:return_request_events(status,note,created_at,actor_role)",{count:"exact"}).order("created_at",{ascending:false}).order("id",{ascending:false}).range(page*50,page*50+49);
 if(status!=="all")q=q.eq("status",status);
 const {data,error,count}=await q;
 if(error)throw new ReturnError(["42P01","PGRST205","42703"].includes(error.code)?"Apply return/refund migration 0024 before using this page.":"Return requests could not be loaded.",503);
 return {requests:data??[],total:count??0,page,hasMore:(page+1)*50<(count??0)};
});}
export function POST(request:Request){return returnHttp(async()=>{
 const {user}=await returnActor(true);const b=await returnBody(request);
 if(b.operation==="record_completion"){
  if(typeof b.when!=="string"||!Number.isFinite(Date.parse(b.when)))throw new ReturnError("Enter a valid delivery date.");
  await returnRpc("lnr_set_return_completion",{p_user:user.id,p_order:returnUuid(b.order),p_when:b.when});
  return {ok:true};
 }
 if(typeof b.status!=="string"||!["approved","rejected","received","refunded"].includes(b.status)||b.note!=null&&typeof b.note!=="string")throw new ReturnError("Invalid return review.");
 return returnRpc("lnr_review_return",{p_user:user.id,p_request:returnUuid(b.id),p_status:b.status,p_note:b.note??null});
});}
