"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";
import { isAdmin } from "@/lib/auth/roles";
import ChatIcon from "./ChatIcon";
import ChatThread from "./ChatThread";
import { useChatThread } from "./useChatThread";
import styles from "./FloatingCustomerChat.module.css";

function CustomerChat() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const chat = useChatThread("/api/chat", open ? 5000 : 15000);
  const close = () => { setOpen(false); toggle.current?.focus(); };
  return <div className={styles.widget}>
    {open ? <section id="customer-chat" className={styles.panel} role="dialog" aria-labelledby="customer-chat-title" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
      <header className={styles.heading}><div><h2 id="customer-chat-title">Message the shop</h2><p>LNR Cycle Center</p></div><button type="button" onClick={close} aria-label="Close chat">×</button></header>
      <ChatThread chat={chat} role="customer" name="LNR Cycle Center"/>
    </section> : null}
    <button type="button" ref={toggle} className={styles.bubble} aria-label={`${open ? "Close" : "Open"} shop chat${chat.unread ? `, ${chat.unread} unread messages` : ""}`} aria-expanded={open} aria-controls="customer-chat" onClick={() => open ? close() : setOpen(true)}>
      {open ? <span aria-hidden="true" className={styles.closeIcon}>×</span> : <ChatIcon size={26}/>}
      {!open && chat.unread > 0 ? <span className={styles.badge}>{chat.unread > 99 ? "99+" : chat.unread}</span> : null}
    </button>
  </div>;
}
function GuestChat({ ready }: { ready: boolean }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const signIn = useRef<HTMLAnchorElement>(null);
  const pathname = usePathname();
  const returnTo = pathname === "/login" || pathname === "/signup" ? "/" : pathname;
  const loginHref = `/login?next=${encodeURIComponent(returnTo)}`;
  const close = () => { setOpen(false); toggle.current?.focus(); };
  useEffect(() => { if (open && ready) signIn.current?.focus(); }, [open, ready]);
  return <div className={styles.widget}>
    {open ? <section id="customer-chat" className={styles.panel} role="dialog" aria-labelledby="guest-chat-title" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
      <header className={styles.heading}><div><h2 id="guest-chat-title">Message the shop</h2><p>LNR Cycle Center</p></div><button type="button" onClick={close} aria-label="Close chat">×</button></header>
      <div className={styles.guest}>
        <span className={styles.guestIcon}><ChatIcon size={34}/></span>
        {ready ? <><h3>Sign in to start a conversation</h3><p>Ask about products, orders or events and keep your messages together in your account.</p><Link ref={signIn} href={loginHref} className={styles.signIn}>Sign in to chat</Link></> : <p role="status">Checking your account…</p>}
      </div>
    </section> : null}
    <button type="button" ref={toggle} className={styles.bubble} aria-label={`${open ? "Close" : "Open"} shop chat`} aria-expanded={open} aria-controls="customer-chat" onClick={() => open ? close() : setOpen(true)}>
      {open ? <span aria-hidden="true" className={styles.closeIcon}>×</span> : <ChatIcon size={26}/>}
    </button>
  </div>;
}
function CustomerChatAccess() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true, changed = false;
    let client: ReturnType<typeof getBrowserClient>;
    try { client = getBrowserClient(); } catch {
      // Keep the public chat launcher usable even before auth is configured.
      queueMicrotask(() => { if (active) setReady(true); });
      return () => { active = false; };
    }
    const id = (user?: User | null) => user && !isAdmin(user) ? user.id : null;
    void client.auth.getUser().then(({ data }: { data: { user: User | null } }) => { if (active && !changed) { setUserId(id(data.user)); setReady(true); } }).catch(() => { if (active && !changed) setReady(true); });
    const { data: { subscription } } = client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (!active) return;
      if (event !== "INITIAL_SESSION") changed = true;
      setUserId(id(session?.user));
      setReady(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return userId ? <CustomerChat key={userId}/> : <GuestChat ready={ready}/>;
}
export default function FloatingCustomerChat() {
  const pathname = usePathname();
  return pathname === "/admin" || pathname.startsWith("/admin/") ? null : <CustomerChatAccess/>;
}
