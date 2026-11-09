import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getOrCreateCustomer } from "@/lib/data/customer/customers";
import { getCustomerDefaultLocation } from "@/lib/data/customer/locations";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import CheckoutView from "./checkout-view";
import styles from "./page.module.css";

export default async function CheckoutScreen({ direct }: { direct: boolean }) {
  const checkoutPath = direct ? "/checkout/buy-now" : "/checkout";
  const user = await getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(checkoutPath)}`);
  }

  const customer = await getOrCreateCustomer(user);
  if (!customer) {
    return (
      <>
        <CustomerHeader />
        <main className={styles.page}>
          <div className={styles.container}>
            <h1 className={styles.title}>Checkout</h1>
            <p className={styles.text}>
              We couldn&apos;t load your customer account. Please try again later.
            </p>
          </div>
        </main>
        <CustomerFooter />
      </>
    );
  }

  const location = await getCustomerDefaultLocation(customer.id);
  if (!location) {
    redirect(`/location?next=${encodeURIComponent(checkoutPath)}`);
  }

  return (
    <>
      <CustomerHeader />
      <main className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Checkout</h1>
          <CheckoutView key={direct ? "buy-now" : "cart"}
            direct={direct}
            customerName={customer.full_name}
            location={{
              label: location.label,
              address: location.address,
            }}
          />
        </div>
      </main>
      <CustomerFooter />
    </>
  );
}

