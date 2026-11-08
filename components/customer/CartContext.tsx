"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  addToCart,
  DEFAULT_CART_ITEMS,
  decrementQuantity,
  incrementQuantity,
  removeItem,
  toggleItemSelection,
  toggleSelectAll,
  type AddToCartInput,
  type CartItem,
} from "./cart-store";
import { usePathname } from "next/navigation";
import { isAdmin } from "@/lib/auth/roles";
import { getBrowserClient } from "@/lib/supabase/client";
import { loadCustomerCart, saveCustomerCart } from "@/app/cart/actions";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const STORAGE_KEY = "lnr-cycle-cart-v1";

type CartContextValue = {
  items: CartItem[];
  /** Sum of all quantities — drives the header cart badge. */
  badgeCount: number;
  addItem: (input: AddToCartInput) => void;
  toggleItemSelection: (key: string) => void;
  toggleSelectAll: () => void;
  incrementQuantity: (key: string) => void;
  decrementQuantity: (key: string) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const refreshSessionRef = useRef<(() => void) | null>(null);
  // Hydration-safe: render the defaults (which is also what SSR prerenders),
  // then restore a previously persisted cart in an effect. The one-time default
  // write that follows in the save effect is immediately overwritten with the
  // restored cart in the same tick.
  const [items, setItems] = useState<CartItem[]>(DEFAULT_CART_ITEMS);
  // Signed-in auth user id, `null` when signed out or auth is unavailable.
  const [session, setSession] = useState<{ userId: string } | null>(null);
  // Gates DB writes until the per-account cart load has been decided, so the
  // SSR defaults (or a guest cart) are never persisted before login resolves.
  const [syncReady, setSyncReady] = useState(false);

  // Latest items, readable from async auth callbacks.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Keeps the account cart from being loaded twice (getSession + the initial
  // auth event both fire on mount).
  const lastLoadedUserIdRef = useRef<string | null>(null);

  // Restore a previously persisted guest cart from localStorage.
  useEffect(() => {
    let persisted: CartItem[] | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) persisted = parsed as CartItem[];
      }
    } catch {
      // Corrupt or unavailable storage — fall back to defaults.
    }
    // Restoring an external store (localStorage) must update state from an
    // effect so server markup and the first client render stay identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (persisted) setItems(persisted);
  }, []);

  // Follow the auth session so the cart follows the signed-in account:
  //  * sign-in   → load that account's saved cart from the database
  //  * sign-out  → clear ONLY the client-side cart (the DB copy is kept)
  useEffect(() => {
    let client: ReturnType<typeof getBrowserClient> | null = null;
    try {
      client = getBrowserClient();
    } catch {
      // Supabase not configured — cart stays localStorage-only (guests).
      return;
    }

    let cancelled = false;
    let authVersion = 0;

    const restoreAccountCart = async (userId: string) => {
      if (lastLoadedUserIdRef.current === userId) return;
      lastLoadedUserIdRef.current = userId;

      let saved: CartItem[] | null = null;
      try {
        saved = await loadCustomerCart();
      } catch {
        // Load failed — keep the current local cart below.
      }
      if (cancelled || lastLoadedUserIdRef.current !== userId) return;

      if (saved && saved.length > 0) {
        // The account has a saved cart — it is the source of truth.
        setItems(saved);
      } else {
        // No saved cart yet. Keep whatever the guest had locally (unless it is
        // the pristine demo defaults) and claim it for this account so the
        // first sign-in does not lose the guest's items.
        const current = itemsRef.current;
        const pristine =
          JSON.stringify(current) === JSON.stringify(DEFAULT_CART_ITEMS);
        if (!pristine) {
          try {
            await saveCustomerCart(current);
          } catch {
            // Non-fatal — the cart still works in memory/localStorage.
          }
        }
      }

      if (!cancelled && lastLoadedUserIdRef.current === userId)
        setSyncReady(true);
    };

    const handleSession = (userId: string | null) => {
      const previous = lastLoadedUserIdRef.current;
      if (previous !== userId) {
        setSyncReady(false);
        if (previous) {
          itemsRef.current = [];
          setItems([]);
        }
      }
      if (!userId) lastLoadedUserIdRef.current = null;
      setSession(userId ? { userId } : null);
      if (userId) void restoreAccountCart(userId);
    };

    // Server Actions change cookies without a browser SIGNED_IN event.
    // Re-reading on navigation also restores saved carts after those logins.
    const refresh = () => {
      const version = authVersion;
      void client!.auth
        .getSession()
        .then(({ data }: { data: { session: Session | null } }) => {
          if (!cancelled && version === authVersion)
            handleSession(
              isAdmin(data.session?.user)
                ? null
                : (data.session?.user.id ?? null),
            );
        })
        .catch(() => {});
    };
    refreshSessionRef.current = refresh;
    refresh();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(
      (event: AuthChangeEvent, currentSession: Session | null) => {
        if (cancelled) return;
        authVersion++;
        if (event === "SIGNED_OUT") {
          // Clear the client cart so the signed-out user can no longer see or
          // use the previous customer's items. The saved DB cart is untouched.
          lastLoadedUserIdRef.current = null;
          itemsRef.current = [];
          setSyncReady(false);
          setSession(null);
          setItems([]);
          try {
            window.localStorage.removeItem(STORAGE_KEY);
          } catch {
            // Ignore storage failures — state is already cleared.
          }
        } else {
          handleSession(
            isAdmin(currentSession?.user)
              ? null
              : (currentSession?.user.id ?? null),
          );
        }
      },
    );

    return () => {
      cancelled = true;
      refreshSessionRef.current = null;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    refreshSessionRef.current?.();
  }, [pathname]);

  // Persist the cart: always to localStorage (guest + signed in), and to the
  // signed-in customer's saved cart when authenticated.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Quota exceeded or storage unavailable — cart still works in-memory.
    }

    if (!session?.userId || !syncReady) return;

    // Debounce the server write so rapid quantity changes don't hammer the DB.
    const timer = window.setTimeout(() => {
      void saveCustomerCart(items).catch(() => {
        // Non-fatal sync failure — the cart stays in memory/localStorage.
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [items, session, syncReady]);

  const addItem = useCallback((input: AddToCartInput) => {
    setItems((current) => addToCart(current, input));
  }, []);

  const toggleSelection = useCallback((key: string) => {
    setItems((current) => toggleItemSelection(current, key));
  }, []);

  const toggleAll = useCallback(() => {
    setItems((current) => toggleSelectAll(current));
  }, []);

  const increment = useCallback((key: string) => {
    setItems((current) => incrementQuantity(current, key));
  }, []);

  const decrement = useCallback((key: string) => {
    setItems((current) => decrementQuantity(current, key));
  }, []);

  const remove = useCallback((key: string) => {
    setItems((current) => removeItem(current, key));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const badgeCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      badgeCount,
      addItem,
      toggleItemSelection: toggleSelection,
      toggleSelectAll: toggleAll,
      incrementQuantity: increment,
      decrementQuantity: decrement,
      removeItem: remove,
      clearCart: clear,
    }),
    [
      items,
      badgeCount,
      addItem,
      toggleSelection,
      toggleAll,
      increment,
      decrement,
      remove,
      clear,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider.");
  }
  return context;
}
