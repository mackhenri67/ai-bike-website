"use client";

import { Fragment, useMemo, useState } from "react";
import type { CustomerRow } from "@/lib/data/types";
import { deleteCustomerAction } from "@/app/admin/(shell)/customers/actions";
import styles from "./CustomersManager.module.css";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
  TrashIcon,
} from "./icons";

type DisplayCustomer = {
  /** Database row id — used for persistence, never shown to the admin. */
  dbId: string;
  name: string;
  email: string;
  joinDate: string;
  phone: string;
  address: string;
  status: "active" | "inactive";
};

/* Column widths: Full Name 30% / Email Address 30% / Join Date 20% / Actions 20%. */
const COLUMN_WIDTHS = [30, 30, 20, 20];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toDisplayCustomer(customer: CustomerRow): DisplayCustomer {
  return {
    dbId: customer.id,
    name: customer.full_name,
    email: customer.email ?? "—",
    joinDate: formatDate(customer.created_at),
    phone: customer.phone ?? "—",
    address: customer.address ?? "—",
    status: customer.status,
  };
}

type CustomersManagerProps = {
  initialCustomers: CustomerRow[];
  error?: string | null;
};

export default function CustomersManager({
  initialCustomers,
  error: initialError,
}: CustomersManagerProps) {
  const [customers, setCustomers] = useState<DisplayCustomer[]>(
    () => initialCustomers.map(toDisplayCustomer),
  );
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DisplayCustomer | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const visibleCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(q) ||
        customer.email.toLowerCase().includes(q) ||
        customer.phone.toLowerCase().includes(q),
    );
  }, [customers, query]);

  const error = actionError ?? initialError ?? null;

  /** Accordion behavior: only one customer is expanded at a time. */
  const toggleExpand = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const result = await deleteCustomerAction(deleting.dbId);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setActionError(null);
    setCustomers((current) =>
      current.filter((customer) => customer.dbId !== deleting.dbId),
    );
    setDeleting(null);
  };

  return (
    <div className={styles.card}>
      {error ? (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      ) : null}

      {/* --- Search bar --- */}
      <div className={styles.search}>
        <SearchIcon size={16} className={styles.searchIcon} />
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search customers..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search customers"
        />
      </div>

      {/* --- Customers table --- */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <colgroup>
            {COLUMN_WIDTHS.map((width, index) => (
              <col key={`customer-column-${index}`} style={{ width: `${width}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Full Name</th>
              <th scope="col">Email Address</th>
              <th scope="col">Join Date</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleCustomers.length > 0 ? (
              visibleCustomers.map((customer) => {
                const expanded = expandedId === customer.dbId;
                return (
                  <Fragment key={customer.dbId}>
                    <tr className={styles.row}>
                      <td className={styles.cellName}>
                        <button
                          type="button"
                          className={styles.expandButton}
                          onClick={() => toggleExpand(customer.dbId)}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Collapse" : "Expand"} ${customer.name}`}
                        >
                          <span className={styles.expandChevron}>
                            {expanded ? (
                              <ChevronUpIcon size={16} />
                            ) : (
                              <ChevronDownIcon size={16} />
                            )}
                          </span>
                          <span className={styles.customerName}>
                            {customer.name}
                          </span>
                        </button>
                      </td>
                      <td>{customer.email}</td>
                      <td>{customer.joinDate}</td>
                      <td className={styles.cellActions}>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => setDeleting(customer)}
                          aria-label={`Delete ${customer.name}`}
                        >
                          <TrashIcon size={18} />
                        </button>
                      </td>
                    </tr>

                    {expanded ? (
                      <tr className={styles.detailsRow}>
                        <td colSpan={4}>
                          <div className={styles.details}>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>
                                Phone Number:
                              </span>
                              <span className={styles.detailValue}>
                                {customer.phone}
                              </span>
                            </div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>
                                Address:
                              </span>
                              <span className={styles.detailValue}>
                                {customer.address}
                              </span>
                            </div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>
                                Status:
                              </span>
                              <span className={styles.detailValue}>
                                {customer.status === "active"
                                  ? "Active"
                                  : "Inactive"}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className={styles.emptyCell}>
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>


      {/* --- Delete customer confirmation modal --- */}
      {deleting ? (
        <div
          className={styles.overlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleting(null);
          }}
        >
          <div
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-customer-title"
          >
            <h2 id="delete-customer-title" className={styles.confirmTitle}>
              Delete Customer?
            </h2>
            <p className={styles.confirmText}>
              Are you sure you want to delete this customer? This action cannot
              be undone.
            </p>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDeleting(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.deleteConfirmButton}
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

