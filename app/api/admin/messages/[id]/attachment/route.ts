import {chatRequest,chatUuid} from "@/lib/chat/server";
import {uploadChatImage,discardChatImage} from "@/lib/chat/image-server";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export function POST(request:Request,context:{params:Promise<{id:string}>}){return chatRequest(async()=>uploadChatImage(request,true,chatUuid((await context.params).id)));}
export function DELETE(request:Request){return chatRequest(()=>discardChatImage(request,true));}
