"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
type ShopContextValue = { banners: string[] };
const ShopContext = createContext<ShopContextValue | null>(null);
export function ShopProvider({
  children,
  banners,
}: {
  children: ReactNode;
  banners: string[];
}) {
  const value = useMemo(() => ({ banners }), [banners]);
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}
export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error("useShop requires ShopProvider");
  return value;
}
