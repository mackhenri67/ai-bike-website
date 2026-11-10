import { chatActor, chatCursor, chatRequest, chatRpc, postChat } from "@/lib/chat/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: Request) {
  return chatRequest(async () => {
    const user = await chatActor(false);
    return chatRpc("lnr_chat_thread", { p_user: user.id, p_admin: false, p_conversation: null, p_before: chatCursor(new URL(request.url).searchParams.get("before")) });
  });
}
export function POST(request: Request) { return chatRequest(() => postChat(request, false, null)); }
