"use client";

import { clearDirectCheckout } from "./direct-checkout";
import { useEffect } from "react";
import { useCart } from "./CartContext";

/**
 * Clears the localStorage cart once, right after a successful order. Mounted
 * on the checkout success page so the "placed order" items are not submitted
 * again on a future checkout.
 */
export default function ClearCartOnMount({ direct = false, orderNumber }: { direct?: boolean; orderNumber?: string } = {}) {
  const { clearCart } = useCart();

  useEffect(() => {
    const marker = orderNumber ? `lnr-checkout-cleaned:${orderNumber}` : null;
    try { if (marker && sessionStorage.getItem(marker)) return; } catch { /* storage unavailable */ }
    if (direct) clearDirectCheckout(); else clearCart();
    try { if (marker) sessionStorage.setItem(marker, "1"); } catch { /* storage unavailable */ }
    // Only run once when the success page appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
