import {chatRequest} from "@/lib/chat/server";
import {downloadChatImage} from "@/lib/chat/image-server";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export function GET(_request:Request,context:{params:Promise<{id:string}>}){return chatRequest(async()=>downloadChatImage(false,(await context.params).id));}
