import { getAdminClient } from "@/lib/supabase/admin";
import type { RetailerReference } from "@/components/admin/products/retailer-options";
import CustomizationSettings from "@/components/admin/products/CustomizationSettings";
import type { Metadata } from "next";
import { listCategories } from "@/lib/data/admin/categories";
import { listProducts } from "@/lib/data/admin/products";
import ProductsManager from "@/components/admin/products/ProductsManager";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Products | LnR Cycle Center",
};

/**
 * Products content area. The Admin shell (sidebar, header, layout + auth
 * guard) comes from the (shell) layout — this page only provides the title
 * and the products card. The catalog is loaded server-side so the client
 * manager renders instantly without a data round-trip.
 */
export default async function AdminProductsPage() {
  const [productsResult, categoriesResult] = await Promise.all([
    listProducts(),
    listCategories(),
  ]);

  const referenceResult = await getAdminClient()?.from("product_option_references").select("product_id,reference");
  const references = (referenceResult?.data ?? []).map(row => ({...row.reference,productId:row.product_id}) as RetailerReference);
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Products</h1>
      <p className={styles.pageDescription}>Manage your catalogue, purchase options, and available stock.</p>

      <CustomizationSettings products={productsResult.data ?? []} categories={categoriesResult.data ?? []} references={references}/>
      <ProductsManager
        references={references}
        initialProducts={productsResult.data ?? []}
        categories={categoriesResult.data ?? []}
        error={productsResult.error ?? categoriesResult.error ?? undefined}
      />
    </section>
  );
}
