import {returnActor,returnBody,returnClient,returnHttp,returnRpc,returnUuid,ReturnError} from "@/lib/returns/server";
import {RETURN_BUCKET,RETURN_MIME_TYPES} from "@/lib/returns/types";
export const dynamic="force-dynamic";export const runtime="nodejs";
export function POST(request:Request){return returnHttp(async()=>{
 const {user}=await returnActor();const b=await returnBody(request);
 if(typeof b.name!=="string"||b.name.length>200||typeof b.mime!=="string"||!(RETURN_MIME_TYPES as readonly string[]).includes(b.mime)||typeof b.size!=="number"||!Number.isInteger(b.size)||b.size<1||b.size>(b.mime.startsWith("image/")?5:20)*1024*1024)throw new ReturnError("Use JPG, PNG or WebP photos up to 5 MB, or MP4, WebM or MOV videos up to 20 MB.");
 const asset=await returnRpc("lnr_prepare_return_upload",{p_user:user.id,p_item:returnUuid(b.item),p_asset:returnUuid(b.id),p_name:b.name,p_mime:b.mime,p_size:b.size}) as {id:string;path:string};
 const storage=returnClient().storage.from(RETURN_BUCKET);const existing=await storage.info(asset.path);
 if(existing.data){if(existing.data.size!==b.size||existing.data.contentType!==b.mime)throw new ReturnError("The existing upload does not match. Choose the file again.");return {...asset,exists:true};}
 const {data,error}=await storage.createSignedUploadUrl(asset.path,{upsert:false});
 if(error||!data)throw new ReturnError("The evidence upload could not be prepared.",503);
 return {...asset,exists:false,token:data.token};
});}
