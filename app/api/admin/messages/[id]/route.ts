import { getAdminClient } from "@/lib/supabase/admin";
import { chatActor, chatOrigin, ChatError, chatCursor, chatRequest, chatRpc, chatUuid, postChat } from "@/lib/chat/server";
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


export function DELETE(request: Request, context: Context) {
 return chatRequest(async () => {
  const user = await chatActor(true);
  chatOrigin(request);
  const id = chatUuid((await context.params).id);
  await chatRpc("lnr_chat_delete_conversation", { p_user: user.id, p_conversation: id });
  const client = getAdminClient();
  if (!client) throw new ChatError("Messaging is temporarily unavailable.", 503);
  // Durable queue keeps failed Storage cleanups available for later retries.
  // A subsequent deletion retries the oldest outstanding files as well.
  const {data: files, error: queueError, count} = await client.from("chat_image_cleanup").select("object_path",{count:"exact"}).order("created_at").limit(100);
  let cleanupPending = !!queueError || (count ?? 0) > (files?.length ?? 0);
  if (files?.length) {
   const paths = files.map(file => file.object_path as string);
   const {error} = await client.storage.from("chat-images").remove(paths);
   if (!error) {
    const result = await client.from("chat_image_cleanup").delete().in("object_path", paths);
    cleanupPending = cleanupPending || !!result.error;
   } else cleanupPending = true;
  }
  return {ok:true, cleanupPending};
 });
}
