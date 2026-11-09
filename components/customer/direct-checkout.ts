"use client";
import { useSyncExternalStore } from "react";
import type { AddToCartInput, CartItem } from "./cart-store";
const KEY = "lnr-direct-checkout-v1";
const EVENT = "lnr-direct-checkout-changed";
let cachedRaw: string | null = null;
let cachedItems: CartItem[] | null = null;
/** A separate per-tab purchase draft. This never writes to the customer's cart. */
export function saveDirectCheckout(inputs: AddToCartInput[]): void {
  if (!inputs.length || inputs.length > 100) throw new Error("Choose products before checking out.");
  try {
    const items = inputs.map((item, index) => ({ ...item, key: `direct-${index}`, selected: true }));
    window.sessionStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(EVENT));
  } catch { throw new Error("Your browser could not save this purchase. Enable session storage and try again."); }
}
export function clearDirectCheckout(): void {
  try { window.sessionStorage.removeItem(KEY); window.dispatchEvent(new Event(EVENT)); } catch { /* no draft */ }
}
export function readDirectCheckout(): CartItem[] | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try { raw = window.sessionStorage.getItem(KEY); } catch { return null; }
  if (raw === cachedRaw) return cachedItems;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    cachedItems = Array.isArray(parsed) && parsed.length > 0 && parsed.length <= 100 && parsed.every((item) => item && typeof item.productId === "string" && Number.isInteger(item.quantity) && item.quantity > 0) ? parsed as CartItem[] : null;
  } catch { cachedItems = null; }
  return cachedItems;
}
function subscribe(listener: () => void) { window.addEventListener(EVENT, listener); window.addEventListener("storage", listener); return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); }; }
const serverSnapshot = () => null;
export function useDirectCheckout() { return useSyncExternalStore(subscribe, readDirectCheckout, serverSnapshot); }
