import {chatRequest} from "@/lib/chat/server";
import {uploadChatImage,discardChatImage} from "@/lib/chat/image-server";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export function POST(request:Request){return chatRequest(()=>uploadChatImage(request,false,null));}
export function DELETE(request:Request){return chatRequest(()=>discardChatImage(request,false));}
