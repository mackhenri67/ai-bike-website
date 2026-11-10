import { chatActor, chatRequest, chatRpc, chatUuid } from "@/lib/chat/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: Request) {
  return chatRequest(async () => {
    const user = await chatActor(true);
    const params = new URL(request.url).searchParams;
    const beforeId = params.get("before_id");
    return chatRpc("lnr_chat_inbox", {
      p_user: user.id, p_query: (params.get("q") ?? "").slice(0, 80), p_summary: params.get("summary") === "1",
      p_before_time: beforeId ? params.get("before_time") : null, p_before_id: beforeId ? chatUuid(beforeId) : null,
    });
  });
}
