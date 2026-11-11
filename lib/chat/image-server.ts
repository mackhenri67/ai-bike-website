import "server-only";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getOrCreateCustomer } from "@/lib/data/customer/customers";
import { chatActor, chatBody, ChatError, chatOrigin, chatRpc, chatUuid } from "./server";
import { CHAT_IMAGE_LIMIT, chatImageType } from "./images";
async function limitedForm(request: Request): Promise<FormData> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new ChatError("Choose an image to upload.",415);
  const limit = CHAT_IMAGE_LIMIT + 65536;
  if (Number(request.headers.get("content-length")) > limit) throw new ChatError("Choose an image up to 3MB.",413);
  const reader = request.body?.getReader(); if (!reader) throw new ChatError("Missing image.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) { await reader.cancel(); throw new ChatError("Choose an image up to 3MB.",413); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  try { return await new Response(new Uint8Array(Buffer.concat(chunks)), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new ChatError("The image upload could not be read. Please try again."); }
}
export async function uploadChatImage(request: Request, admin: boolean, conversation: string | null) {
  const user = await chatActor(admin); chatOrigin(request);
  const form = await limitedForm(request); const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > CHAT_IMAGE_LIMIT) throw new ChatError("Choose a PNG, JPG or WebP image up to 3MB.");
  const id = chatUuid(form.get("image_id")); const bytes = new Uint8Array(await file.arrayBuffer()); const type = chatImageType(bytes);
  if (!type || (file.type && file.type !== type)) throw new ChatError("The file must be an actual PNG, JPG or WebP image.",415);
  if (!admin) { const customer = await getOrCreateCustomer(user); if (!customer || customer.status !== "active") throw new ChatError("An active customer account is required.",403); }
  const prepared = await chatRpc("lnr_chat_prepare_image", { p_user:user.id,p_admin:admin,p_conversation:conversation,p_image:id,p_mime:type,p_size:bytes.length,p_name:file.name.slice(0,120) }) as {id:string;conversation_id:string;path:string;ready:boolean};
  const storage = getAdminClient(); if (!storage) throw new ChatError("Image uploads are temporarily unavailable.",503);
  if (!prepared.ready) {
    const { error } = await storage.storage.from("chat-images").upload(prepared.path,bytes,{contentType:type,upsert:false,cacheControl:"0"});
    if (error && String(error.statusCode) !== "409" && !/already exists|duplicate/i.test(error.message)) throw new ChatError("The image could not be uploaded. Please try again.",500);
    await chatRpc("lnr_chat_finish_image",{p_user:user.id,p_admin:admin,p_image:id});
  }
  return {id:prepared.id,conversation_id:prepared.conversation_id,name:file.name.slice(0,120)};
}
export async function discardChatImage(request: Request, admin: boolean) {
  const user = await chatActor(admin); const form = await chatBody(request);
  const path = await chatRpc("lnr_chat_discard_image",{p_user:user.id,p_admin:admin,p_image:chatUuid(form.image_id)});
  if (typeof path === "string") { const storage = getAdminClient(); if (!storage) throw new ChatError("Image storage is unavailable.",503); const {error} = await storage.storage.from("chat-images").remove([path]); if(error) throw new ChatError("The unused image could not be cleared. Please try again.",500); }
  return {ok:true};
}
export async function downloadChatImage(admin: boolean, imageId: string) {
  const user = await chatActor(admin);
  const info = await chatRpc("lnr_chat_image",{p_user:user.id,p_admin:admin,p_image:chatUuid(imageId)}) as {path:string;mime_type:string};
  const storage = getAdminClient(); if(!storage) throw new ChatError("Image storage is unavailable.",503);
  const {data,error} = await storage.storage.from("chat-images").download(info.path); if(error || !data) throw new ChatError("Image not available.",404);
  return new NextResponse(data.stream(),{headers:{"Content-Type":info.mime_type,"Content-Disposition":"inline; filename=chat-image","Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
}
