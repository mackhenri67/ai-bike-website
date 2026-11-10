import { chatActor, chatCursor, chatRequest, chatRpc, chatUuid, postChat } from "@/lib/chat/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return chatRequest(async () => {
    const user = await chatActor(true);
    return chatRpc("lnr_chat_thread", { p_user: user.id, p_admin: true, p_conversation: chatUuid((await context.params).id), p_before: chatCursor(new URL(request.url).searchParams.get("before")) });
  });
}
export function POST(request: Request, context: Context) {
  return chatRequest(async () => postChat(request, true, chatUuid((await context.params).id)));
}
