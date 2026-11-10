"use client";
import { useEffect, useState } from "react";
import { chatFetch } from "./useChatThread";
export function useAdminMessageCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true, busy = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const data = await chatFetch<{ unread_count: number }>("/api/admin/messages?summary=1", undefined, controller.signal);
        if (active) setCount(data.unread_count);
      } catch { /* The inbox reports connection errors; retain its last count. */ }
      finally { busy = false; }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    const wake = () => void refresh();
    window.addEventListener("lnr:messages-updated", wake); window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => { active = false; controller.abort(); window.clearInterval(interval); window.removeEventListener("lnr:messages-updated", wake); window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake); };
  }, []);
  return count;
}
