import { redirect } from "next/navigation";
import CheckoutScreen from "./checkout-screen";
export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout | LNR Cycle Center" };
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  if (mode === "buy-now") redirect("/checkout/buy-now");
  return <CheckoutScreen direct={false} />;
}
