import {revalidatePath} from "next/cache";
import {returnActor,returnBody,returnClient,returnHttp,returnRpc,returnUuid,ReturnError} from "@/lib/returns/server";
export const dynamic="force-dynamic";
export function GET(request:Request){return returnHttp(async()=>{
 await returnActor(true);
 const page=Number(new URL(request.url).searchParams.get("page")??0);
 if(!Number.isInteger(page)||page<0||page>1000)throw new ReturnError("Invalid catalogue page.");
 const {data,error,count}=await returnClient().from("products")
 .select("id,name,price,stock,category:categories(is_active),product_variants(id,name,size,color,options,retired,price,stock,available)",{count:"exact"})
 .eq("status","active").order("name").order("id").range(page*100,page*100+99);
 if(error)throw new ReturnError("The catalogue could not be loaded.",503);
 return {products:data??[],hasMore:(page+1)*100<(count??0)};
});}
export function POST(request:Request){return returnHttp(async()=>{
 const {user}=await returnActor(true);const body=await returnBody(request);
 if(!body.sale||typeof body.sale!=="object"||Array.isArray(body.sale))throw new ReturnError("Enter valid sale details.");
 const result=await returnRpc("lnr_record_store_sale",{p_admin:user.id,p_id:returnUuid(body.id),p_input:body.sale});
 for(const path of ["/admin/orders","/admin/dashboard","/products","/custom-bike-builder","/"])revalidatePath(path);
 return result;
});}
