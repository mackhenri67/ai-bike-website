"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { UserResponse } from "@supabase/supabase-js";
import { getAdminBrowserClient } from "@/lib/supabase/client";
import { getNewOrderIds } from "@/app/admin/(shell)/orders/actions";

/**
 * localStorage prefix for the per-admin set of already-viewed ("seen") new
 * order ids. Keyed by Supabase user id so each admin keeps their own state.
 */
const SEEN_KEY_PREFIX = "lnr_admin_new_orders_seen:";

/** How often to refresh the new-orders count (near real-time, no page refresh). */
const POLL_INTERVAL_MS = 8000;

type NewOrdersState = {
  /** Total number of current "new" (pending) orders. */
  count: number;
  /** Number of pending orders the admin has not viewed yet. Drives the badge. */
  unreadCount: number;
};

const NewOrdersContext = createContext<NewOrdersState>({
  count: 0,
  unreadCount: 0,
});

/**
 * Reads the current new-orders state. Must be used inside <NewOrdersProvider>.
 */
export function useNewOrders(): NewOrdersState {
  return useContext(NewOrdersContext);
}

function readSeenIds(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeSeenIds(key: string, ids: Set<string>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Ignore quota / storage-disabled errors — notifications still work in-memory.
  }
}

function isOrdersPath(pathname: string): boolean {
  return pathname === "/admin/orders" || pathname.startsWith("/admin/orders/");
}

/**
 * Single source of truth for the real-time "new orders" notification shared by
 * the Admin sidebar's Orders badge and the dashboard's New Orders card.
 *
 * Why polling instead of Supabase Realtime: the `orders` table has no public
 * RLS read policy (only reachable via the service-role client), so a browser
 * client cannot subscribe to its changes without weakening the project's
 * security model. This provider keeps that model intact by fetching only the
 * (non-PII) pending order ids from a guarded server action, and auto-clears
 * the badge when the admin is viewing the Orders page.
 */
export function NewOrdersProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const seenRef = useRef<Set<string>>(new Set());
  const keyRef = useRef<string | null>(null);
  const onOrdersRef = useRef(false);

  useEffect(() => {
    onOrdersRef.current = isOrdersPath(pathname);
  }, [pathname]);

  const refresh = useCallback(async () => {
    const result = await getNewOrderIds();
    if (result.error) return;

    const ids = result.ids;
    setCount(ids.length);

    const key = keyRef.current;
    if (!key) {
      // Admin auth not resolved yet — assume everything is unread for now.
      setUnreadCount(ids.length);
      return;
    }

    if (onOrdersRef.current) {
      // The admin is viewing Orders — consider every current new order seen.
      ids.forEach((id) => seenRef.current.add(id));
      writeSeenIds(key, seenRef.current);
      setUnreadCount(0);
      return;
    }

    const unseen = ids.filter((id) => !seenRef.current.has(id));
    setUnreadCount(unseen.length);
  }, []);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Resolve the per-admin storage key from the authenticated session once.
  useEffect(() => {
    let cancelled = false;
    let client: ReturnType<typeof getAdminBrowserClient> | null = null;
    try {
      client = getAdminBrowserClient();
    } catch {
      // Supabase unconfigured — notifications still refresh, just not persisted.
    }

    client?.auth.getUser().then((response: UserResponse) => {
      if (cancelled) return;
      keyRef.current = SEEN_KEY_PREFIX + (response.data?.user?.id ?? "default");
      seenRef.current = readSeenIds(keyRef.current);
      void refreshRef.current();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Initial fetch + poll + refresh on focus/visibility and on route changes.
  useEffect(() => {
    void refreshRef.current();
    const timer = setInterval(
      () => void refreshRef.current(),
      POLL_INTERVAL_MS,
    );

    const onActive = () => {
      if (document.visibilityState === "visible") void refreshRef.current();
    };

    document.addEventListener("visibilitychange", onActive);
    window.addEventListener("focus", onActive);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onActive);
      window.removeEventListener("focus", onActive);
    };
  }, []);

  // Refresh immediately whenever the route changes (e.g. entering/exiting
  // the Orders page so the badge clears/appears without waiting for a poll).
  useEffect(() => {
    void refreshRef.current();
  }, [pathname]);

  return (
    <NewOrdersContext.Provider value={{ count, unreadCount }}>
      {children}
    </NewOrdersContext.Provider>
  );
}
