import {NextResponse} from "next/server";
import {returnActor,returnClient,returnHttp,returnUuid,ReturnError,noStore} from "@/lib/returns/server";
import {RETURN_BUCKET} from "@/lib/returns/types";
export const dynamic="force-dynamic";export const runtime="nodejs";
export function GET(request:Request,context:{params:Promise<{id:string}>}){return returnHttp(async()=>{
 const admin=new URL(request.url).searchParams.get("admin")==="1";const {customerId}=await returnActor(admin);
 let query=returnClient().from("return_evidence").select("object_path,customer_id,request_id").eq("id",returnUuid((await context.params).id)).not("request_id","is",null);
 if(!admin)query=query.eq("customer_id",customerId);
 const {data,error}=await query.maybeSingle();
 if(error||!data)throw new ReturnError("Evidence not available.",404);
 const signed=await returnClient().storage.from(RETURN_BUCKET).createSignedUrl(data.object_path,120);
 if(signed.error||!signed.data)throw new ReturnError("Evidence could not be opened. Refresh and try again.",503);
 return NextResponse.redirect(signed.data.signedUrl,{status:302,headers:noStore});
});}
