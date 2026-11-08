import type { Metadata } from "next";
import CustomerHeader from "@/components/customer/CustomerHeader";
import HeroCarousel from "@/components/customer/HeroCarousel";
import ProductSection from "@/components/customer/ProductSection";
import StoreSection from "@/components/customer/StoreSection";
import CustomBikeSection from "@/components/customer/CustomBikeSection";
import CustomerFooter from "@/components/customer/CustomerFooter";
import { getCatalogProducts } from "@/lib/products";
import { isPartProduct } from "@/lib/catalog-groups";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "LNR Cycle Center | Bikes, Parts & Accessories",
  description:
    "LNR Cycle Center — bikes, cycling parts and accessories in Tabaco City, Albay. Explore new arrivals, parts, accessories and more.",
};

/**
 * Customer-facing homepage. The product sections are fed from the same
 * Supabase catalog used by the admin panel (lib/products.ts), so products
 * created/edited there appear here automatically. The admin shell (sidebar,
 * header, admin pages) is untouched.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const catalogue = await getCatalogProducts({});
  const available = (catalogue ?? []).filter((product) => product.stock > 0);
  const newArrivals = available.filter((product) => product.isNewArrival).slice(0, 4);
  const parts = available.filter(isPartProduct).slice(0, 4);
  const accessories = available.filter((product) => product.categorySlug === "accessories").slice(0, 4);

  return (
    <div className={styles.page}>
      <CustomerHeader />

      <main>
        <HeroCarousel />

        <ProductSection
          className={styles.gap}
          title="New Arrivals"
          products={newArrivals ?? []}
          viewAllHref="/products"
        />

        <CustomBikeSection />

        <ProductSection
          title="Parts"
          products={parts ?? []}
          viewAllHref="/products?category=parts"
          className={styles.gap}
        />
        <ProductSection
          title="Accessories"
          products={accessories ?? []}
          viewAllHref="/products?category=accessories"
          className={styles.gap}
        />

        <StoreSection />
      </main>

      <CustomerFooter />
    </div>
  );
}


