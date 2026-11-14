"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatConversation, ChatInbox } from "@/lib/chat/types";
import ChatThread from "./ChatThread";
import ChatIcon from "./ChatIcon";
import { Trash2Icon as TrashIcon } from "@/components/admin/icons";
import { chatFetch, useChatThread } from "./useChatThread";
import styles from "./AdminMessages.module.css";

function merge(old: ChatConversation[], next: ChatConversation[]) {
  const map = new Map(old.map(item => [item.id, item]));
  next.forEach(item => map.set(item.id, item));
  return [...map.values()].sort((a, b) => Date.parse(b.last_message_at) - Date.parse(a.last_message_at) || b.id.localeCompare(a.id));
}
function Conversation({ conversation, back, remove }: { conversation: ChatConversation; back: () => void; remove: () => void }) {
  const chat = useChatThread(`/api/admin/messages/${conversation.id}`, 5000, "admin");
  return <div className={styles.conversation}>
    <header className={styles.threadHeader}><button type="button" className={styles.back} onClick={back}>← Inbox</button><div className={styles.threadIdentity}><h2>{conversation.customer_name}</h2><p>{conversation.customer_email || "Customer conversation"}</p></div><button type="button" className={styles.deleteIconButton} onClick={remove} aria-label="Delete conversation" title="Delete conversation"><TrashIcon size={19}/></button></header>
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
  const removed = useRef(new Set<string>());
  const [deleting,setDeleting] = useState<ChatConversation|null>(null);
  const [deletingBusy,setDeletingBusy] = useState(false);
  const [deleteError,setDeleteError] = useState<string|null>(null);
  const [notice,setNotice] = useState<string|null>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(deleting)confirmDialog.current?.showModal();},[deleting]);
  const removeConversation=async()=>{
    if(!deleting || deletingBusy)return;
    setDeletingBusy(true);setDeleteError(null);
    try {
      const response=await fetch(`/api/admin/messages/${deleting.id}`,{method:"DELETE",credentials:"same-origin"});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || "Could not delete conversation.");
      removed.current.add(deleting.id);
      setInbox(previous=>({...previous,conversations:previous.conversations.filter(item=>item.id!==deleting.id)}));
      setSelected(null);setDeleting(null);
      setNotice(result.cleanupPending ? "Conversation deleted. Attachment storage cleanup is pending and will retry on a later deletion." : "Conversation deleted.");
      window.dispatchEvent(new CustomEvent("lnr:messages-updated"));
    } catch(e){setDeleteError(e instanceof Error ? e.message : "Could not delete conversation.");}
    finally{setDeletingBusy(false);}
  };

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
        setInbox(previous => ({ ...data, query, conversations: previous.query === query && olderLoaded.current ? merge(previous.conversations, data.conversations).filter(item=>!removed.current.has(item.id)) : data.conversations.filter(item=>!removed.current.has(item.id)), has_more: olderLoaded.current && previous.query === query ? previous.has_more : data.has_more }));
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
      setInbox(previous => previous.query === query ? { ...data, query, conversations: merge(previous.conversations, data.conversations).filter(item=>!removed.current.has(item.id)) } : previous);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load conversations."); }
    finally { setLoadingMore(false); }
  };
  return <section className={styles.page}>
    <h1 className={styles.title}>Messages</h1>{notice?<p role="status">{notice}</p>:null}<p className={styles.subtitle}>Read customer questions and reply as LNR Cycle Center.</p>
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
      <div className={styles.threadPane}>{selected ? <Conversation key={selected.id} conversation={selected} back={() => setSelected(null)} remove={()=>{setDeleteError(null);setDeleting(selected);}}/> : <div className={styles.welcome}><ChatIcon size={42}/><h2>Your customer inbox</h2><p>Select a conversation to read messages and send a reply.</p></div>}</div>
    </div>
  {deleting ? <dialog ref={confirmDialog} className={styles.confirmDialog} aria-labelledby="delete-conversation-title" onCancel={event=>{if(deletingBusy)event.preventDefault();else setDeleting(null);}}>
    <h2 id="delete-conversation-title">Delete conversation?</h2>
    <p>This permanently removes the conversation with {deleting.customer_name}, including messages and image attachments, for both you and the customer. The customer can start a new conversation afterward.</p>
    {deleteError?<p role="alert" className={styles.error}>{deleteError}</p>:null}
    <div className={styles.confirmActions}><button type="button" autoFocus disabled={deletingBusy} onClick={()=>setDeleting(null)}>Keep conversation</button><button type="button" disabled={deletingBusy} className={styles.deleteButton} onClick={()=>void removeConversation()}>{deletingBusy?"Deleting…":"Delete conversation"}</button></div>
   </dialog>:null}
  </section>;
}
