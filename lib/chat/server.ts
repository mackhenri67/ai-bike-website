import "server-only";
import { NextResponse } from "next/server";
import { getUser, getAdminUser } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/roles";
import { getOrCreateCustomer } from "@/lib/data/customer/customers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class ChatError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const chatJson = (value: unknown, status = 200) => NextResponse.json(value, {
  status, headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
});
export async function chatRequest(work: () => Promise<unknown>) {
  try { return chatJson(await work()); }
  catch (error) {
    return chatJson({ error: error instanceof ChatError ? error.message : "Messages could not be loaded. Please try again." }, error instanceof ChatError ? error.status : 500);
  }
}
export function chatUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new ChatError("Invalid conversation reference.");
  return value;
}
export function chatCursor(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{1,19}$/.test(value) || BigInt(value) > BigInt("9223372036854775807")) throw new ChatError("Invalid message reference.");
  return value;
}
export async function chatActor(admin: boolean) {
  // Always read the corresponding cookie jar; never fall back to the other login.
  const user = admin ? await getAdminUser() : await getUser();
  if (!user) throw new ChatError("Please sign in again to use messages.", 401);
  if (admin && !isAdmin(user)) throw new ChatError("Administrator access required.", 403);
  if (!admin && isAdmin(user)) throw new ChatError("Sign in with a customer account.", 403);
  return user;
}
export async function chatRpc(name: string, params: Record<string, unknown>) {
  const client = getAdminClient();
  if (!client) throw new ChatError("Messaging is temporarily unavailable.", 503);
  const { data, error } = await client.rpc(name, params);
  if (error) {
    if (["PGRST202", "42P01", "42883"].includes(error.code)) throw new ChatError("Messaging is not set up yet. Please contact the shop administrator.", 503);
    if (error.message.includes("Too many messages")) throw new ChatError(error.message, 429);
    if (error.code === "P0001") throw new ChatError(error.message, /required|access/.test(error.message) ? 403 : 400);
    throw new ChatError("Your message could not be saved. Please try again.", 500);
  }
  return data;
}
export async function chatBody(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new ChatError("Request not allowed.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ChatError("Send a JSON message.", 415);
  const text = await request.text();
  if (text.length > 14000) throw new ChatError("The message is too long.", 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new ChatError("Invalid message."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ChatError("Invalid message.");
  return body as Record<string, unknown>;
}
export async function postChat(request: Request, admin: boolean, conversation: string | null) {
  const user = await chatActor(admin);
  const body = await chatBody(request);
  if (body.operation === "read") {
    const id = chatUuid(conversation ?? body.conversation_id);
    const through = chatCursor(body.through);
    if (!through) throw new ChatError("Missing message reference.");
    await chatRpc("lnr_chat_read", { p_user: user.id, p_admin: admin, p_conversation: id, p_through: through });
    return { ok: true };
  }
  if (body.operation !== "send" || typeof body.body !== "string" || !body.body.trim() || body.body.trim().length > 2000) throw new ChatError("Enter a message between 1 and 2000 characters.");
  const clientId = chatUuid(body.client_id);
  if (!admin) {
    const customer = await getOrCreateCustomer(user);
    if (!customer || customer.status !== "active") throw new ChatError("An active customer account is required.", 403);
  }
  return chatRpc("lnr_chat_send", { p_user: user.id, p_admin: admin, p_conversation: conversation, p_body: body.body.trim(), p_client: clientId });
}
