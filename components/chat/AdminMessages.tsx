"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatConversation, ChatInbox } from "@/lib/chat/types";
import ChatThread from "./ChatThread";
import ChatIcon from "./ChatIcon";
import { chatFetch, useChatThread } from "./useChatThread";
import styles from "./AdminMessages.module.css";

function merge(old: ChatConversation[], next: ChatConversation[]) {
  const map = new Map(old.map(item => [item.id, item]));
  next.forEach(item => map.set(item.id, item));
  return [...map.values()].sort((a, b) => Date.parse(b.last_message_at) - Date.parse(a.last_message_at) || b.id.localeCompare(a.id));
}
function Conversation({ conversation, back }: { conversation: ChatConversation; back: () => void }) {
  const chat = useChatThread(`/api/admin/messages/${conversation.id}`, 5000, "admin");
  return <div className={styles.conversation}>
    <header className={styles.threadHeader}><button type="button" className={styles.back} onClick={back}>← Inbox</button><div><h2>{conversation.customer_name}</h2><p>{conversation.customer_email || "Customer conversation"}</p></div></header>
    <ChatThread chat={chat} role="admin" name={conversation.customer_name}/>
  </div>;
}
export default function AdminMessages() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [inbox, setInbox] = useState<ChatInbox & { query: string }>({ conversations: [], has_more: false, unread_count: 0, query: "" });
  const [selected, setSelected] = useState<ChatConversation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const olderLoaded = useRef(false);

  useEffect(() => {
    let active = true, busy = false;
    olderLoaded.current = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const data = await chatFetch<ChatInbox>(`/api/admin/messages?${new URLSearchParams({ q: query })}`, undefined, controller.signal);
        if (!active) return;
        setInbox(previous => ({ ...data, query, conversations: previous.query === query ? merge(previous.conversations, data.conversations) : data.conversations, has_more: olderLoaded.current && previous.query === query ? previous.has_more : data.has_more }));
        setLoaded(true); setError(null);
      } catch (e) { if (active && !controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load conversations."); }
      finally { busy = false; }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    const wake = () => void refresh();
    const seen = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setInbox(previous => ({ ...previous, conversations: previous.conversations.map(item => item.id === id ? { ...item, unread_count: 0 } : item) }));
      void refresh();
    };
    window.addEventListener("lnr:messages-updated", seen); window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => { active = false; controller.abort(); window.clearInterval(interval); window.removeEventListener("lnr:messages-updated", seen); window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake); };
  }, [query, retry]);

  const more = async () => {
    const last = inbox.conversations.at(-1);
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = new URLSearchParams({ q: query, before_id: last.id, before_time: last.last_message_at });
      const data = await chatFetch<ChatInbox>(`/api/admin/messages?${next}`);
      olderLoaded.current = true;
      setInbox(previous => previous.query === query ? { ...data, query, conversations: merge(previous.conversations, data.conversations) } : previous);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load conversations."); }
    finally { setLoadingMore(false); }
  };
  return <section className={styles.page}>
    <h1 className={styles.title}>Messages</h1><p className={styles.subtitle}>Read customer questions and reply as LNR Cycle Center.</p>
    {error ? <p className={styles.error} role="status">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p> : null}
    <div className={`${styles.inbox} ${selected ? styles.selected : ""}`}>
      <aside className={styles.listPane} aria-label="Customer conversations">
        <form className={styles.search} onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setSelected(null); }}>
          <label htmlFor="conversation-search" className={styles.srOnly}>Search customers</label><input id="conversation-search" value={search} maxLength={80} placeholder="Search name or email" onChange={event => setSearch(event.target.value)}/><button type="submit">Search</button>
        </form>
        <div className={styles.list}>
          {!loaded && !error ? <p className={styles.empty}>Loading conversations…</p> : null}
          {loaded && !inbox.conversations.length ? <p className={styles.empty}>{query ? "No matching conversations." : "Customers appear here when they send their first message."}</p> : null}
          {inbox.conversations.map(item => <button key={item.id} type="button" className={`${styles.listItem} ${selected?.id === item.id ? styles.active : ""}`} aria-pressed={selected?.id === item.id} onClick={() => setSelected(item)}>
            <span className={styles.avatar}>{item.customer_name.slice(0, 1).toUpperCase()}</span><span className={styles.preview}><strong>{item.customer_name}</strong><span>{item.last_sender === "admin" ? "You: " : ""}{item.last_message}</span><time dateTime={item.last_message_at}>{new Date(item.last_message_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></span>
            {item.unread_count > 0 ? <span className={styles.unread} aria-label={`${item.unread_count} unread messages`}>{item.unread_count > 99 ? "99+" : item.unread_count}</span> : null}
          </button>)}
          {inbox.has_more ? <button type="button" className={styles.loadMore} onClick={() => void more()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more conversations"}</button> : null}
        </div>
      </aside>
      <div className={styles.threadPane}>{selected ? <Conversation key={selected.id} conversation={selected} back={() => setSelected(null)}/> : <div className={styles.welcome}><ChatIcon size={42}/><h2>Your customer inbox</h2><p>Select a conversation to read messages and send a reply.</p></div>}</div>
    </div>
  </section>;
}
