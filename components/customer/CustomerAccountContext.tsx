"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { isAdmin } from "@/lib/auth/roles";
import { getBrowserClient } from "@/lib/supabase/client";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

type CustomerAccount = {
  name: string;
  email: string;
};

type CustomerAccountContextValue = {
  account: CustomerAccount | null;
  authenticated: boolean;
  ready: boolean;
};

type AccountMenuResponse = {
  name?: unknown;
  email?: unknown;
};

const CustomerAccountContext = createContext<CustomerAccountContextValue | null>(null);

/**
 * Keeps the signed-in customer's directory profile in the persistent app root.
 * The customers table is the single display-name source of truth. Auth metadata
 * is deliberately not used as a temporary name, because it may contain the
 * original signup name after the customer edits their profile.
 */
export function CustomerAccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const accountRef = useRef<CustomerAccount | null>(null);
  const lastUserIdRef = useRef<string | null | undefined>(undefined);
  const refreshAuthRef = useRef<(() => void) | null>(null);
  const previousPathRef = useRef(pathname);

  useEffect(() => {
    let active = true;
    let requestVersion = 0;

    const updateAccount = (next: CustomerAccount | null) => {
      accountRef.current = next;
      setAccount(next);
    };

    const loadAccount = async (user: User | null | undefined, forceRefresh = false) => {
      const userId = user?.id ?? null;
      if (!forceRefresh && lastUserIdRef.current === userId) {
        const isCustomer = Boolean(user?.email && !isAdmin(user));
        setAuthenticated(isCustomer);
        // If this is a duplicate initial-session notification, do not mark
        // the account ready before the first directory-name request finishes.
        if (!isCustomer || accountRef.current) setReady(true);
        return;
      }
      lastUserIdRef.current = userId;
      const request = ++requestVersion;

      if (!user?.email || isAdmin(user)) {
        updateAccount(null);
        setAuthenticated(false);
        setReady(true);
        return;
      }

      const email = user.email;
      const sameCustomer =
        accountRef.current?.email.toLowerCase() === email.toLowerCase();

      setAuthenticated(true);
      // Preserve an already-loaded directory name on token refresh. For a new
      // account, keep the name area blank until the canonical profile arrives.
      if (!sameCustomer) {
        updateAccount(null);
        setReady(false);
      }

      try {
        const response = await fetch("/api/customer/account-menu", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Customer profile could not be loaded.");

        const payload = (await response.json()) as AccountMenuResponse;
        const name = typeof payload.name === "string" ? payload.name.trim() : "";
        const resolvedEmail =
          typeof payload.email === "string" && payload.email.trim()
            ? payload.email.trim()
            : email;

        if (!name) throw new Error("Customer name is missing.");
        if (active && request === requestVersion) {
          updateAccount({ name, email: resolvedEmail });
          setReady(true);
        }
      } catch {
        if (active && request === requestVersion) {
          // Do not fall back to the potentially stale Auth full_name value.
          // A neutral label is preferable to showing the wrong customer name.
          if (!accountRef.current || accountRef.current.email.toLowerCase() !== email.toLowerCase()) {
            updateAccount({ name: "My Account", email });
          }
          setReady(true);
        }
      }
    };

    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: unknown }>).detail;
      const name = typeof detail?.name === "string" ? detail.name.trim() : "";
      if (!name || !accountRef.current) return;

      // Invalidate any older fetch so it cannot overwrite the just-saved name.
      requestVersion += 1;
      updateAccount({ ...accountRef.current, name });
      setReady(true);
    };

    window.addEventListener("lnr:customer-profile-updated", handleProfileUpdated);

    let client: ReturnType<typeof getBrowserClient>;
    try {
      client = getBrowserClient();
    } catch {
      setAuthenticated(false);
      setReady(true);
      return () => {
        active = false;
        window.removeEventListener("lnr:customer-profile-updated", handleProfileUpdated);
      };
    }

    const refreshAuth = () => {
      void client.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
        if (active) void loadAccount(data.user, true);
      }).catch(() => {
        if (active && !accountRef.current) setReady(true);
      });
    };
    refreshAuthRef.current = refreshAuth;
    refreshAuth();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (!active) return;
      // Refreshing a token does not change the customer profile. Avoid an
      // unnecessary profile request while keeping the current name visible.
      if (event === "TOKEN_REFRESHED") return;
      void loadAccount(session?.user, event === "USER_UPDATED");
    });

    return () => {
      active = false;
      requestVersion += 1;
      refreshAuthRef.current = null;
      window.removeEventListener("lnr:customer-profile-updated", handleProfileUpdated);
      subscription.unsubscribe();
    };
  }, []);

  // Login and logout are server actions in this app. Re-check the browser
  // session after route changes so a server-updated auth cookie is reflected
  // without remounting the account provider. An existing name stays visible
  // while the same account is refreshed.
  useEffect(() => {
    if (previousPathRef.current === pathname) return;
    previousPathRef.current = pathname;
    refreshAuthRef.current?.();
  }, [pathname]);

  const value = useMemo(
    () => ({ account, authenticated, ready }),
    [account, authenticated, ready],
  );

  return (
    <CustomerAccountContext.Provider value={value}>
      {children}
    </CustomerAccountContext.Provider>
  );
}

export function useCustomerAccount(): CustomerAccountContextValue {
  const value = useContext(CustomerAccountContext);
  if (!value) {
    throw new Error("useCustomerAccount must be used within CustomerAccountProvider.");
  }
  return value;
}
