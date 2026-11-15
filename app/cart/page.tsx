import type { Metadata } from "next";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import CartView from "@/components/customer/CartView";

import { getShippingFee } from "@/lib/data/shipping";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shopping Cart | LNR Cycle Center",
  description: "Review the items in your LNR Cycle Center shopping cart.",
};

export default async function CartPage() {
  const shipping = await getShippingFee();
  return (
    <>
      <CustomerHeader />
      <CartView shippingFee={shipping.data} />
      <CustomerFooter />
    </>
  );
}
