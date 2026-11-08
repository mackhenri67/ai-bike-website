"use client";

import { Fragment, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { CatalogProduct } from "@/lib/products";
import ProductCard from "../ProductCard";
import { ChevronDownIcon, SearchIcon } from "../icons";
import styles from "./BikeEquipment.module.css";

export type EquipmentCategoryRow = {
  slug: string;
  name: string;
  /** Comma-joined customization axis labels (or "No options"). */
  customization: string;
  /** Live item count derived from the actual product rows. */
  count: number;
  /** Grouped sub-rows rendered indented under this row (e.g. Parts → its categories). */
  children?: EquipmentCategoryRow[];
};

export type SortOption = { value: string; label: string };

type BikeEquipmentProps = {
  products: CatalogProduct[];
  rows: EquipmentCategoryRow[];
  activeCategory: string | null;
  query: string;
  activeSort: string;
  sortOptions: readonly SortOption[];
  allProductsCount: number;
  categoryCount: number;
};

/**
 * Interactive storefront "Bike Equipment" browsing block: an expandable
 * Filter table (Category | Items), a search field,
 * a sort control and the product grid. Every piece of product/category
 * data is passed in from the server page — nothing is hardcoded here.
 *
 * Category, search and sort are URL-param driven: choosing a category,
 * running a search or changing the sort navigates to the same page with the
 * new query string so the server renders the filtered/sorted catalog.
 */
export default function BikeEquipment({
  products,
  rows,
  activeCategory,
  query,
  activeSort,
  sortOptions,
  allProductsCount,
  categoryCount,
}: BikeEquipmentProps) {
  const router = useRouter();
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(query);

  /** Rebuilds a `/products` URL from the current filters + a patch. */
  const buildHref = (patch: {
    category?: string | null;
    q?: string;
    sort?: string;
  }): string => {
    const params = new URLSearchParams();
    const category =
      patch.category === undefined ? activeCategory : patch.category;
    const q = patch.q === undefined ? query : patch.q;
    const sort = patch.sort === undefined ? activeSort : patch.sort;
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    if (sort && sort !== "featured") params.set("sort", sort);
    const queryString = params.toString();
    return `/products${queryString ? `?${queryString}` : ""}`;
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(buildHref({ q: searchInput.trim() }));
  };

  const handleSort = (value: string) => {
    router.push(buildHref({ sort: value }));
  };

  const selectCategory = (slug: string | null) => {
    router.push(buildHref({ category: slug }));
  };

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    slug: string | null
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectCategory(slug);
    }
  };

  const countLabel = `${categoryCount} ${
    categoryCount === 1 ? "product" : "products"
  }`;

  return (
    <section
      className={styles.equipment}
      aria-labelledby="bike-equipment-heading"
    >
      <h2 id="bike-equipment-heading" className={styles.visuallyHidden}>
        Browse products catalog
      </h2>
{/* --- Toolbar: filter toggle, search, sort ---------------------------- */}
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.filterToggle}
          onClick={() => setFilterOpen((open) => !open)}
          aria-expanded={filterOpen}
          aria-controls="bike-equipment-filters"
        >
          Filter
          <ChevronDownIcon
            size={14}
            className={filterOpen ? styles.chevronOpen : styles.chevron}
          />
        </button>

        <form className={styles.searchForm} role="search" onSubmit={handleSearch}>
          <SearchIcon size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search products ..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Search products"
          />
        </form>

        <label className={styles.sortLabel}>
          <span className={styles.sortLabelText}>Sort</span>
          <select
            className={styles.sortSelect}
            value={activeSort}
            onChange={(event) => handleSort(event.target.value)}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* --- Expandable filter table ---------------------------------------- */}
      {filterOpen ? (
        <div className={styles.filterPanel} id="bike-equipment-filters">
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col" className={styles.itemsCol}>
                    Items
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  className={
                    activeCategory === null ? styles.activeRow : styles.row
                  }
                  onClick={() => selectCategory(null)}
                  onKeyDown={(event) => handleRowKeyDown(event, null)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={activeCategory === null}
                >
                  <td className={styles.categoryCell}>All products</td>
                  <td className={styles.itemsCell}>{allProductsCount}</td>
                </tr>
                {rows.map((row) => (
                  <Fragment key={row.slug}>
                    <tr
                      className={
                        activeCategory === row.slug
                          ? styles.activeRow
                          : styles.row
                      }
                      onClick={() => selectCategory(row.slug)}
                      onKeyDown={(event) => handleRowKeyDown(event, row.slug)}
                      role="button"
                      tabIndex={0}
                      aria-pressed={activeCategory === row.slug}
                    >
                      <td className={styles.categoryCell}>{row.name}</td>
                      <td className={styles.itemsCell}>{row.count}</td>
                    </tr>
                    {(row.children ?? []).map((child, childIdx) => {
                      const isChildActive = activeCategory === child.slug;
                      const isFirst = childIdx === 0;
                      return (
                        <tr
                          key={child.slug}
                          className={[
                            styles.childRow,
                            isChildActive ? styles.activeRow : "",
                            isFirst ? styles.childRowFirst : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => selectCategory(child.slug)}
                          onKeyDown={(event) =>
                            handleRowKeyDown(event, child.slug)
                          }
                          role="button"
                          tabIndex={0}
                          aria-pressed={isChildActive}
                        >
                          <td className={styles.subCategoryCell}>
                            {child.name}
                          </td>
                          <td className={styles.itemsCell}>{child.count}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>


        </div>
      ) : null}

      {/* --- Result count + product grid ------------------------------------- */}
      <p className={styles.count} aria-live="polite">
        {countLabel}
        {query ? (
          <>
            {" "}
            matching &ldquo;{query}&rdquo;
          </>
        ) : null}
      </p>

      {products.length > 0 ? (
        <div className={styles.grid}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} showCategory />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>
          No products found{query ? ` for "${query}"` : ""} in this category.
          Try a different filter or search term.
        </p>
      )}
    </section>
  );
}