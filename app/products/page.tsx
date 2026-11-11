import type { Metadata } from "next";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import ListingPageHeader from "@/components/customer/ListingPageHeader";
import listingStyles from "@/components/customer/ListingPageHeader.module.css";
import BikeEquipment, {
  type EquipmentCategoryRow,
} from "@/components/customer/BikeEquipment/BikeEquipment";
import {
  getCatalogCategories,
  getCatalogProducts,
  type CatalogProduct,
} from "@/lib/products";
import { getCategoryAxes } from "@/components/admin/products/categoryConfig";
import { isPartProduct } from "@/lib/catalog-groups";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Products | LNR Cycle Center",
  description:
    "Browse all bikes, parts and accessories at LNR Cycle Center \u2014 complete bikes, components and riding kit, live from the catalog.",
};

// Always read the live catalog on every request instead of prerendering a
// static shell at build time — see DEC-009.
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    category?: string | string[] | undefined;
    q?: string | string[] | undefined;
    sort?: string | string[] | undefined;
  }>;
};

export const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name-asc", label: "Alphabetically: A\u2013Z" },
  { value: "name-desc", label: "Alphabetically: Z\u2013A" },
] as const;

/**
 * Canonical product taxonomy shown in the Filter table. The catalog's
 * top-level groups are Bikes, Parts and Accessories; Parts expands into the
 * detailed bike-equipment categories used by the Bike Builder (and seeded in
 * the categories table by migration 0011). Display names come from the live
 * categories table where they exist; a fallback label is used only for slugs
 * not present in the DB. Counts are always derived from the product rows.
 */
const EQUIPMENT_GROUPS: {
  slug: string;
  fallback: string;
  children: { slug: string; fallback: string }[];
}[] = [
  { slug: "bikes", fallback: "Bikes", children: [] },
  {
    slug: "parts",
    fallback: "Parts",
    children: [
      { slug: "frameset", fallback: "Frameset" },
      { slug: "handlebar", fallback: "Handlebar" },
      { slug: "stem", fallback: "Stem" },
      { slug: "seatpost", fallback: "Seatpost" },
      { slug: "saddle", fallback: "Saddle" },
      { slug: "wheelset", fallback: "Wheelset" },
      { slug: "tires", fallback: "Tires" },
      { slug: "front-derailleur", fallback: "Front Derailleur" },
      { slug: "rear-derailleur", fallback: "Rear Derailleur" },
      { slug: "crankset", fallback: "Crankset" },
      { slug: "cassette", fallback: "Cassette" },
      { slug: "chain", fallback: "Chain" },
      { slug: "brakeset", fallback: "Brakeset" },
      { slug: "rotors", fallback: "Rotors" },
      { slug: "pedals", fallback: "Pedals" },
    ],
  },
  { slug: "accessories", fallback: "Accessories", children: [] },
];

/** Human-readable customization fields for a category ("No options" when none). */
function customizationFields(slug: string, categories: {slug:string;customization_axes?: import("@/components/admin/products/categoryConfig").CategoryAxis[] | null}[]): string {
  const labels = getCategoryAxes(slug, categories.find(category => category.slug === slug)?.customization_axes).map((axis) => axis.label);
  return labels.length > 0 ? labels.join(", ") : "No options";
}

function sortProducts(
  products: CatalogProduct[],
  sort: string
): CatalogProduct[] {
  const list = [...products];
  switch (sort) {
    case "price-asc":
      return list.sort((a, b) => a.price - b.price);
    case "price-desc":
      return list.sort((a, b) => b.price - a.price);
    case "name-asc":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case "name-desc":
      return list.sort((a, b) => b.name.localeCompare(a.name));
    default:
      return list;
  }
}
/**
 * Products page at /products \u2014 the destination for the header Products
 * link, the search box (/products?q=...) and every homepage View All
 * button.  Renders the Browse Products browsing UI (expandable filter table,
 * search, sort, product grid).  Filtering, search and sorting are all
 * URL-param driven and composed server-side.
 */
export default async function ProductsPage({ searchParams }: Props) {
  const params = await searchParams;
  const categorySlug =
    typeof params.category === "string" ? params.category : undefined;
  const query = typeof params.q === "string" ? params.q.trim() : undefined;
  const requestedSort =
    typeof params.sort === "string" ? params.sort : undefined;

  let activeSort = "featured";
  if (
    requestedSort !== undefined &&
    SORT_OPTIONS.some((o) => o.value === requestedSort)
  ) {
    activeSort = requestedSort;
  }

  const [categoriesResult, fullList, searchList] = await Promise.all([
    getCatalogCategories(),
    getCatalogProducts({}),
    query ? getCatalogProducts({ query }) : Promise.resolve(null),
  ]);

  // When a search term is present the server-side name/description search is
  // authoritative; otherwise every active product in the catalog is the base
  // collection for counts and the grid.
  const baseList = query ? (searchList ?? []) : (fullList ?? []);

  // --- Category counts (dynamic, from the actual product rows) --------------
  const countBySlug = new Map<string, number>();
  for (const product of baseList) {
    if (!product.categorySlug) continue;
    countBySlug.set(
      product.categorySlug,
      (countBySlug.get(product.categorySlug) ?? 0) + 1
    );
  }

  // --- Filter panel rows (names from DB, fields from categoryConfig) --------
  const categoriesByName = new Map(
    (categoriesResult ?? []).map((category) => [category.slug, category.name])
  );

  const rows: EquipmentCategoryRow[] = EQUIPMENT_GROUPS.map((group) => {
    const children: EquipmentCategoryRow[] = group.children.map(
      ({ slug, fallback }) => ({
        slug,
        name: categoriesByName.get(slug) ?? fallback,
        customization: customizationFields(slug, categoriesResult ?? []),
        count: countBySlug.get(slug) ?? 0,
      })
    );
    const groupCount =
      (countBySlug.get(group.slug) ?? 0) +
      children.reduce((sum, child) => sum + child.count, 0);
    return {
      slug: group.slug,
      name: categoriesByName.get(group.slug) ?? group.fallback,
      customization:
        children.length > 0
          ? `${children.length} component categories`
          : customizationFields(group.slug, categoriesResult ?? []),
      count: groupCount,
      ...(children.length > 0 ? { children } : {}),
    };
  });

  // --- Grid: category filter (incl. Parts aggregate) + search + sort --------
  const filtered = baseList.filter((product) => {
    if (!categorySlug) return true;
    if (categorySlug === "parts") return isPartProduct(product);
    return product.categorySlug === categorySlug;
  });
  const products = sortProducts(filtered, activeSort);

  return (
    <div className={styles.page}>
      <CustomerHeader />

      <main>
        <section className={styles.section}>
          <ListingPageHeader title="Products" light>
            Complete bikes, components and accessories everything below is
            on our shop floor in Tabaco City.
          </ListingPageHeader>
          <div className={`${listingStyles.container} ${listingStyles.content}`}>
            <BikeEquipment
              products={products}
              rows={rows}
              activeCategory={categorySlug ?? null}
              query={query ?? ""}
              activeSort={activeSort}
              sortOptions={SORT_OPTIONS}
              allProductsCount={baseList.length}
              categoryCount={products.length}
            />
          </div>
        </section>
      </main>

      <CustomerFooter />
    </div>
  );
}
