"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatSent, ChatThread } from "@/lib/chat/types";

export async function chatFetch<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 15000);
  try {
    const response = await fetch(url, {
      method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin", signal: controller.signal,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => null);
    if (!result) throw new Error("Messaging is temporarily unavailable. Please refresh and try again.");
    if (!response.ok) throw new Error(result.error || "Messages are temporarily unavailable.");
    return result as T;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error("The connection timed out. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
function mergeMessages(old: ChatMessage[], next: ChatMessage[]) {
  const map = new Map(old.map(message => [message.id, message]));
  next.forEach(message => map.set(message.id, message));
  return [...map.values()].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);
}
export function useChatThread(endpoint: string, pollMs = 5000, role: "customer" | "admin" = "customer") {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);
  const loadedOlder = useRef(false);
  const acked = useRef("0");
  const ackBusy = useRef(false);
  const abort = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (busy.current || !alive.current || document.visibilityState === "hidden") return;
    busy.current = true;
    const controller = new AbortController();
    abort.current = controller;
    try {
      const data = await chatFetch<ChatThread>(endpoint, undefined, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      setMessages(previous => mergeMessages(previous, data.messages));
      setConversationId(data.conversation_id);
      setUnread(data.unread_count);
      if (!loadedOlder.current) setHasMore(data.has_more);
      setLoaded(true); setError(null);
    } catch (e) {
      if (alive.current && !controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load messages.");
    } finally { busy.current = false; }
  }, [endpoint]);

  useEffect(() => {
    alive.current = true;
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), pollMs);
    const wake = () => void refresh();
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive.current = false; abort.current?.abort(); window.clearTimeout(initial); window.clearInterval(interval);
      window.removeEventListener("focus", wake); window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [refresh, pollMs]);

  const loadOlder = async () => {
    if (loadingOlder || !messages.length || !hasMore) return;
    setLoadingOlder(true);
    try {
      const data = await chatFetch<ChatThread>(`${endpoint}?before=${messages[0].id}`);
      if (!alive.current) return;
      loadedOlder.current = true;
      setMessages(previous => mergeMessages(previous, data.messages)); setHasMore(data.has_more); setError(null);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Could not load history."); }
    finally { if (alive.current) setLoadingOlder(false); }
  };
  const markRead = useCallback(async () => {
    const last = messages.filter(message => message.sender_role !== role).at(-1)?.id;
    if (!conversationId || !last || !unread || ackBusy.current || BigInt(last) <= BigInt(acked.current) || document.visibilityState === "hidden") return;
    ackBusy.current = true;
    try {
      await chatFetch(endpoint, { operation: "read", conversation_id: conversationId, through: last });
      if (!alive.current) return;
      acked.current = last; setUnread(0);
      window.dispatchEvent(new CustomEvent("lnr:messages-updated", { detail: { id: conversationId } }));
    } catch { /* Keep unread until a later acknowledgement succeeds. */ }
    finally { ackBusy.current = false; }
  }, [conversationId, endpoint, messages, role, unread]);

  const send = async (body: string, clientId: string, imageId: string | null = null) => {
    const result = await chatFetch<ChatSent>(endpoint, { operation: "send", body, client_id: clientId, image_id: imageId });
    if (!alive.current) return;
    setConversationId(result.conversation_id);
    setMessages(previous => mergeMessages(previous, [result.message])); setLoaded(true); setError(null);
    window.dispatchEvent(new CustomEvent("lnr:messages-updated"));
    void refresh();
  };
  return { messages, conversationId, unread, hasMore, loaded, error, loadingOlder, loadOlder, markRead, send, refresh, attachmentEndpoint: `${endpoint}/attachment` };
}
export type ChatModel = ReturnType<typeof useChatThread>;
