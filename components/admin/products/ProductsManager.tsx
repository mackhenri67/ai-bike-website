"use client";
import type { RetailerReference } from "./retailer-options";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getAdminBrowserClient } from "@/lib/supabase/client";
import {
  type CategoryRow,
  type ProductInput,
  type ProductRow,
  type ProductStatus,
} from "@/lib/data/types";
import {
  saveProductAction,
  deleteProductAction,
} from "@/app/admin/(shell)/products/actions";
import ProductFormModal, { type ProductFormPayload } from "./ProductFormModal";
import styles from "./ProductsManager.module.css";
import {
  ImageIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "./icons";

type ModalState =
  | { mode: "add" }
  | { mode: "edit"; product: ProductRow }
  | null;

type ProductsManagerProps = {
  references?: RetailerReference[];
  initialProducts: ProductRow[];
  categories: CategoryRow[];
  error?: string | null;
};

const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Draft",
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

/* Table column widths: Image 15% / Name 25% / Price 15% / Stock 15% /
   Status 15% / Actions 15%. */
const COLUMN_WIDTHS = [15, 25, 15, 15, 15, 15];

function formatPeso(value: number): string {
  return `₱${value.toLocaleString("en-US")}`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function productThumbnail(product: ProductRow): string | null {
  const images = [...(product.product_images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  return (
    images.find((image) => image.is_primary)?.url ?? images[0]?.url ?? null
  );
}

function categoryName(
  categories: CategoryRow[],
  categoryId: string | null,
): string {
  return categories.find((category) => category.id === categoryId)?.name ?? "";
}

export default function ProductsManager({
  initialProducts,
  references = [],
  categories,
  error: initialError,
}: ProductsManagerProps) {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [pageError, setPageError] = useState<string | null>(
    initialError ?? null,
  );
  const [modal, setModal] = useState<ModalState>(null);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [query, setQuery] = useState("");
  const slugEdited = useRef(false);

  const searchTerm = query.trim().toLowerCase();
  const visibleProducts = products.filter((product) => {
    if (categoryFilter && product.category_id !== categoryFilter) return false;
    if (!searchTerm) return true;
    const haystack = [
      product.name,
      product.sku,
      product.description,
      product.slug,
      categoryName(categories, product.category_id),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchTerm);
  });

  const uploadImageToStorage = async (file: File): Promise<string | null> => {
    const client = getAdminBrowserClient();
    if (!client) {
      return null;
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `products/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${safeName}`;
    const { data, error } = await client.storage
      .from("images")
      .upload(path, file, {
        contentType: file.type || "image/*",
        cacheControl: "3600",
        upsert: false,
      });
    if (error) {
      return null;
    }
    const { data: urlData } = client.storage
      .from("images")
      .getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const openAdd = () => {
    slugEdited.current = false;
    setModal({ mode: "add" });
  };

  const openEdit = (product: ProductRow) => {
    slugEdited.current = true;
    setModal({ mode: "edit", product });
  };

  const closeModal = () => {
    setModal(null);
  };

  const handleThumbnailUpload = async (file: File): Promise<string | null> => {
    setSubmitting(true);
    const url = await uploadImageToStorage(file);
    setSubmitting(false);
    return url;
  };

  const handleGalleryUpload = async (files: File[]): Promise<string[]> => {
    setSubmitting(true);
    const urls: string[] = [];
    for (const file of files) {
      const url = await uploadImageToStorage(file);
      if (url) urls.push(url);
    }
    setSubmitting(false);
    return urls;
  };

  const buildPayload = (
    payload: ProductFormPayload,
    product: ProductRow | null,
  ): ProductInput => {
    const images = [payload.thumbnail, ...payload.images].filter(Boolean);
    const variants = payload.variants.filter(
      (variant) => Object.keys(variant.options).length > 0,
    );
    const variantStock = variants.reduce(
      (sum, variant) => sum + (variant.available ? (Math.floor(Number(variant.stock)) || 0) : 0),
      0,
    );
    const specsList = payload.specs
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return {
      id: product?.id ?? null,
      expected_stock: product?.stock,
      category_id: payload.categoryId || null,
      name: payload.name,
      slug: payload.slug || slugify(payload.name),
      sku: payload.sku || null,
      description: payload.description || null,
      tagline: payload.tagline
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      specs: specsList,
      price: Number(payload.price) || 0,
      compare_at_price: payload.compareAtPrice
        ? Number(payload.compareAtPrice)
        : null,
      cost: payload.cost ? Number(payload.cost) : null,
      stock:
        variants.length > 0
          ? variantStock
          : Math.floor(Number(payload.stock)) || 0,
      status:
        payload.available && Number(payload.stock) > 0
          ? "active"
          : payload.status,
      is_featured: payload.isFeatured,
      is_new_arrival: payload.isNewArrival,
      sort_order: 0,
      images: images.map((url) => ({ url, alt: null })),
      variants: variants.map((variant) => ({
        id: variant.id,
        expected_stock: variant.expectedStock,
        options: variant.options,
        sku: variant.sku || null,
        size: variant.size || null,
        color: variant.color || null,
        price: Number(variant.price) || 0,
        stock: Math.floor(Number(variant.stock)) || 0,
        available: variant.available,
      })),
    };
  };

  const handleSave = async (payload: ProductFormPayload) => {
    const product = modal?.mode === "edit" ? modal.product : null;
    setSubmitting(true);
    const result = await saveProductAction(buildPayload(payload, product));
    setSubmitting(false);
    if (!result.error) {
      closeModal();
      setPageError(null);
      router.refresh();
    }
    return result;
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSubmitting(true);
    const result = await deleteProductAction(deleting.id);
    setSubmitting(false);
    setDeleting(null);
    if (result.error) {
      setPageError(result.error);
      return;
    }
    setPageError(null);
    router.refresh();
  };

  return (
    <div className={styles.card}>
      {/* --- Card header --- */}
      <div className={styles.header}>
        <h2 className={styles.heading}>Product Inventory</h2>
        <button type="button" className={styles.addButton} onClick={openAdd}>
          <PlusIcon size={18} />
          Add Product
        </button>
      </div>

      {pageError ? (
        <p role="alert" className={styles.pageError}>
          {pageError}
        </p>
      ) : null}

      {/* --- Filter toolbar: category dropdown + search --- */}
      <div className={styles.toolbar}>
        <div className={styles.selectWrap}>
          <select
            className={styles.categorySelect}
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            aria-label="Filter products by category"
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.search}>
          <SearchIcon size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search products…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search products"
          />
        </div>
      </div>

      {/* --- Product table --- */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              {["Product", "Name", "Price", "Stock", "Status", "Actions"].map(
                (column, index) => (
                  <th
                    key={column}
                    scope="col"
                    className={styles.th}
                    style={{ width: `${COLUMN_WIDTHS[index]}%` }}
                  >
                    {column}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visibleProducts.length > 0 ? (
              visibleProducts.map((product) => {
                const thumbnail = productThumbnail(product);
                return (
                  <tr key={product.id} className={styles.tr}>
                    <td className={styles.td}>
                      <div className={styles.thumbCell}>
                        {thumbnail ? (
                          <div className={styles.thumb}>
                            <Image
                              src={thumbnail}
                              alt=""
                              fill
                              sizes="48px"
                              unoptimized
                            />
                          </div>
                        ) : (
                          <div className={styles.thumbPlaceholder}>
                            <ImageIcon size={22} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.nameCell}>
                        <span className={styles.productName}>
                          {product.name}
                        </span>
                        <span className={styles.productDesc}>
                          {[
                            product.sku,
                            categoryName(categories, product.category_id),
                          ]
                            .filter(Boolean)
                            .join(" · ") || product.description}
                        </span>
                      </div>
                    </td>
                    <td className={styles.td}>{formatPeso(product.price)}</td>
                    <td className={styles.td}>{product.stock}</td>
                    <td className={styles.td}>
                      <span
                        className={`${styles.statusBadge} ${
                          product.status === "active"
                            ? styles.statusAvailable
                            : styles.statusUnavailable
                        }`}
                      >
                        {STATUS_LABELS[product.status]}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.actionsCell}>
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.editButton}`}
                          onClick={() => openEdit(product)}
                          aria-label={`Edit ${product.name}`}
                        >
                          <PencilIcon size={19} />
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.actionDanger}`}
                          onClick={() => setDeleting(product)}
                          aria-label={`Delete ${product.name}`}
                        >
                          <TrashIcon size={19} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className={styles.emptyCell}>
                  {initialError
                    ? "Products could not be loaded. See the message above."
                    : products.length === 0
                      ? "No products found. Click “Add Product” to create the first one."
                      : "No products match the current filter. Adjust the category or search term."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- Add / Edit product modal --- */}
      {modal && (
        <ProductFormModal
          key={modal.mode === "edit" ? modal.product.id : "add"}
          product={modal.mode === "edit" ? modal.product : null}
          categories={categories}
          references={references}
          onClose={closeModal}
          onSave={handleSave}
          submitting={submitting}
          onThumbnailUpload={handleThumbnailUpload}
          onGalleryUpload={handleGalleryUpload}
        />
      )}

      {/* --- Delete confirmation modal --- */}
      {deleting ? (
        <div className={styles.overlay}>
          <div
            className={`${styles.modal} ${styles.confirmModal}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-product-title"
          >
            <div className={styles.modalHeader}>
              <h2 id="delete-product-title" className={styles.confirmTitle}>
                Delete product?
              </h2>
            </div>
            <p className={styles.confirmText}>
              “{deleting.name}” and its variants will be permanently removed.
              This cannot be undone.
            </p>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setDeleting(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.deleteButton}
                onClick={confirmDelete}
                disabled={submitting}
              >
                {submitting ? "Deleting…" : "Delete product"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
