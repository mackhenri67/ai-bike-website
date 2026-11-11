"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatModel } from "./useChatThread";
import {useChatAttachment} from "./useChatAttachment";
import {chatImageUrl} from "@/lib/chat/images";
import styles from "./ChatThread.module.css";

function MessageImage({id,role,onLoad}:{id:string;role:"customer"|"admin";onLoad:()=>void}){
 const [failed,setFailed]=useState(false);const url=chatImageUrl(id,role);
 return failed?<p className={styles.imageError}>Image unavailable. Refresh to try again.</p>:<a href={url} target="_blank" rel="noreferrer" className={styles.imageLink} aria-label="Open attached image in full size">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={url} alt="Image attached to this message" width={260} height={200} loading="lazy" className={styles.messageImage} onLoad={onLoad} onError={()=>setFailed(true)}/></a>;
}
export default function ChatThread({ chat, role, name }: { chat: ChatModel; role: "customer" | "admin"; name: string }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const attempt = useRef<{ body: string; image: string|null; id: string } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const attachment=useChatAttachment(chat.attachmentEndpoint);
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
    if ((!body&&!attachment.imageId)||sendingRef.current||attachment.uploading||(attachment.preview&&!attachment.imageId)) return;
    if (!attempt.current || attempt.current.body !== body || attempt.current.image!==attachment.imageId) attempt.current = { body, image:attachment.imageId, id: crypto.randomUUID() };
    sendingRef.current = true; setSending(true); setSendError(null);
    attachment.beginSend();
    try {
      nearBottom.current = true;
      await chat.send(body, attempt.current.id,attempt.current.image);
      attachment.sent();
      setDraft(current => current.trim() === body ? "" : current); attempt.current = null;
    } catch (error) { attachment.failed(); setSendError(error instanceof Error ? error.message : "Message not sent. Please try again."); }
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
        {message.image?<MessageImage id={message.image.id} role={role} onLoad={()=>{if(nearBottom.current&&scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;}}/>:null}
        {message.body?<p>{message.body}</p>:null}
        <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
      </article>)}
    </div>
    <form onSubmit={submit} className={styles.composer}>
      {attachment.preview?<div className={styles.attachment}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.preview} alt="Image selected to send" width={60} height={60}/><div><strong>{attachment.name}</strong><span role="status">{attachment.uploading?"Uploading image…":attachment.imageId?"Ready to send":"Image not uploaded"}</span></div><button type="button" onClick={attachment.remove} disabled={sending} aria-label="Remove attached image">×</button>
      </div>:null}
      {attachment.error?<p className={styles.sendError} role="alert">{attachment.error}{attachment.preview&&!attachment.uploading?<button type="button" onClick={attachment.retry}>Retry upload</button>:null}</p>:null}
      <label className={styles.srOnly} htmlFor={`chat-compose-${role}`}>Message to {name}</label>
      <textarea id={`chat-compose-${role}`} ref={composer} maxLength={2000} rows={2} value={draft} placeholder="Write a message…" onChange={event => setDraft(event.target.value)} onKeyDown={event => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
      }}/>
      <div className={styles.composeActions}><div className={styles.composeTools}>
        <input ref={fileInput} type="file" className={styles.srOnly} tabIndex={-1} aria-label="Choose chat image" disabled={sending||attachment.uploading} accept="image/png,image/jpeg,image/webp" onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file)attachment.choose(file);}}/>
        <button type="button" className={styles.attachButton} disabled={sending||attachment.uploading} onClick={()=>fileInput.current?.click()} aria-label="Attach image" title="PNG, JPG or WebP, up to 3MB"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m21 11-8 8a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8l8-8"/></svg></button><small>{draft.length}/2000</small>
      </div><button type="submit" disabled={sending||attachment.uploading||(!draft.trim()&&!attachment.imageId)||!!(attachment.preview&&!attachment.imageId)}>{sending?"Sending…":"Send"}<span aria-hidden="true">↗</span></button></div>
      {sendError ? <p className={styles.sendError} role="alert">{sendError} Your draft is still here.</p> : null}
    </form>
  </div>;
}
