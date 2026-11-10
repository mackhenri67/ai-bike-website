"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatModel } from "./useChatThread";
import styles from "./ChatThread.module.css";

export default function ChatThread({ chat, role, name }: { chat: ChatModel; role: "customer" | "admin"; name: string }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const attempt = useRef<{ body: string; id: string } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  const { messages, markRead } = chat;

  useEffect(() => { composer.current?.focus(); }, []);
  useEffect(() => {
    if (nearBottom.current && scroll.current) {
      scroll.current.scrollTop = scroll.current.scrollHeight;
      void markRead();
    }
  }, [messages, markRead]);
  useEffect(() => {
    const wake = () => { if (nearBottom.current) void markRead(); };
    document.addEventListener("visibilitychange", wake); window.addEventListener("focus", wake);
    return () => { document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); };
  }, [markRead]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sendingRef.current) return;
    if (!attempt.current || attempt.current.body !== body) attempt.current = { body, id: crypto.randomUUID() };
    sendingRef.current = true; setSending(true); setSendError(null);
    try {
      nearBottom.current = true;
      await chat.send(body, attempt.current.id);
      setDraft(current => current.trim() === body ? "" : current); attempt.current = null;
    } catch (error) { setSendError(error instanceof Error ? error.message : "Message not sent. Please try again."); }
    finally { sendingRef.current = false; setSending(false); composer.current?.focus(); }
  };
  return <div className={styles.thread}>
    {chat.error ? <p className={styles.error} role="status">{chat.error} <button type="button" onClick={() => void chat.refresh()}>Retry</button></p> : null}
    <div ref={scroll} className={styles.messages} role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions" onScroll={() => {
      const el = scroll.current;
      nearBottom.current = !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (nearBottom.current) void chat.markRead();
    }}>
      {chat.hasMore ? <button type="button" className={styles.history} disabled={chat.loadingOlder} onClick={async () => {
        const height = scroll.current?.scrollHeight ?? 0; nearBottom.current = false;
        await chat.loadOlder();
        requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop += scroll.current.scrollHeight - height; });
      }}>{chat.loadingOlder ? "Loading…" : "Load earlier messages"}</button> : null}
      {!chat.loaded && !chat.error ? <p className={styles.empty}>Loading messages…</p> : null}
      {chat.loaded && !messages.length ? <p className={styles.empty}>{role === "customer" ? "Have a question about a product, order or event? Send the shop a message here." : "This customer has not sent a message yet."}</p> : null}
      {messages.map(message => <article key={message.id} className={`${styles.message} ${message.sender_role === role ? styles.own : styles.incoming}`}>
        <span className={styles.sender}>{message.sender_role === role ? "You" : name}</span>
        <p>{message.body}</p>
        <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
      </article>)}
    </div>
    <form onSubmit={submit} className={styles.composer}>
      <label className={styles.srOnly} htmlFor={`chat-compose-${role}`}>Message to {name}</label>
      <textarea id={`chat-compose-${role}`} ref={composer} maxLength={2000} rows={2} value={draft} placeholder="Write a message…" onChange={event => setDraft(event.target.value)} onKeyDown={event => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
      }}/>
      <div className={styles.composeActions}><small>{draft.length}/2000</small><button type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"} <span aria-hidden="true">↗</span></button></div>
      {sendError ? <p className={styles.sendError} role="alert">{sendError} Your message is still in the box.</p> : null}
    </form>
  </div>;
}
