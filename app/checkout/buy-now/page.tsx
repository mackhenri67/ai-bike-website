import type { Metadata } from "next";
import CheckoutScreen from "../checkout-screen";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Buy Now Checkout | LNR Cycle Center" };
export default function BuyNowPage() { return <CheckoutScreen direct={true} />; }
