import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import { type DashboardStats, type QueryResult } from "@/lib/data/types";
import { missingServiceRoleMessage, toFriendlyDbError } from "./errors";

export async function getDashboardStats(): Promise<QueryResult<DashboardStats>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  try {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [products, newOrders, processingOrders, sales, lowStock] =
      await Promise.all([
        admin.from("products").select("id", { count: "exact", head: true }),
        admin
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        admin
          .from("orders")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "shipping"]),
        admin
          .from("orders")
          .select("subtotal, discount, custom_build_id, labor_cost")
          .gte("created_at", startOfToday.toISOString())
          .not("status", "eq", "cancelled"),
        admin
          .from("products")
          .select("id", { count: "exact", head: true })
          .lt("stock", 5)
          .neq("status", "archived"),
      ]);

    if (sales.error) {
      return { data: null, error: toFriendlyDbError(sales.error) };
    }

    // Dashboard Total Sales is intentionally Product Sales + Labor Revenue.
    // Custom-bike builds and event tickets are separate dashboard filters.
    const todaySales =
      (sales.data as
        | {
            subtotal: number;
            discount: number;
            custom_build_id: string | null;
            labor_cost: number;
          }[]
        | null)?.reduce((sum, row) => {
        const productSales = row.custom_build_id
          ? 0
          : Math.max(0, Number(row.subtotal) - Number(row.discount ?? 0));
        return sum + productSales + Number(row.labor_cost ?? 0);
      }, 0) ?? 0;

    // --- Event signals (real data, no placeholders) -------------------------
    const nowIso = new Date().toISOString();
    const [{ data: nextEvent }, pendingSignups, draftEvents, outOfStock] =
      await Promise.all([
        admin
          .from("events")
          .select("id, slug, title, event_date, capacity, slots_booked")
          .eq("status", "published")
          .gte("event_date", nowIso)
          .order("event_date", { ascending: true })
          .limit(1)
          .maybeSingle(),
        admin
          .from("event_registrations")
          .select("id", { count: "exact", head: true })
          .eq("payment_status", "pending")
          .eq("status", "registered"),
        admin
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("status", "draft"),
        admin
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("stock", 0)
          .neq("status", "archived"),
      ]);

    const nextEventData = (nextEvent as
      | {
          id: string;
          slug: string;
          title: string;
          event_date: string;
          start_time: string | null;
          capacity: number;
          slots_booked: number;
        }
      | null) ?? null;

    return {
      data: {
        newOrders: newOrders.count ?? 0,
        processingOrders: processingOrders.count ?? 0,
        totalProducts: products.count ?? 0,
        todaySales,
        lowStockCount: lowStock.count ?? 0,
        nextEvent: nextEventData
          ? {
              id: nextEventData.id,
              title: nextEventData.title,
              slug: nextEventData.slug,
              eventDate: nextEventData.event_date,
              capacity: Number(nextEventData.capacity) || 0,
              slotsBooked: Number(nextEventData.slots_booked) || 0,
            }
          : null,
        pendingSignups: pendingSignups.count ?? 0,
        draftEvents: draftEvents.count ?? 0,
        outOfStock: outOfStock.count ?? 0,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load dashboard stats.",
    };
  }
}

export type RevenueRange = "daily" | "weekly" | "monthly";

export type RevenuePoint = {
  label: string;
  /** Kept as an alias for Total Sales for compatibility with existing consumers. */
  value: number;
  totalSales: number;
  productSales: number;
  ticketSales: number;
  customBuildSales: number;
  laborRevenue: number;
};

type OrderRevenueRow = {
  created_at: string;
  subtotal: number;
  discount: number;
  custom_build_id: string | null;
  labor_cost: number;
};

type TicketRevenueRow = {
  created_at: string;
  amount_paid: number;
};

const REVENUE_BUCKETS: Record<RevenueRange, number> = {
  daily: 7,
  weekly: 8,
  monthly: 12,
};

/** 00:00 UTC of the given day. */
function startOfUtcDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

/** Monday 00:00 UTC of the week containing `date`. */
function startOfUtcWeek(date: Date): Date {
  const copy = startOfUtcDay(date);
  copy.setUTCDate(copy.getUTCDate() - ((copy.getUTCDay() + 6) % 7));
  return copy;
}

/** First day 00:00 UTC of the month containing `date`. */
function startOfUtcMonth(date: Date): Date {
  const copy = startOfUtcDay(date);
  copy.setUTCDate(1);
  return copy;
}

/**
 * Revenue by period and sales type. Product sales, custom-bike sales, and
 * labor revenue come from non-cancelled orders. Ticket sales come only from
 * paid, active event registrations. Total Sales is Product Sales + Labor
 * Revenue, as requested; Ticket and Custom Build Sales remain separate.
 */
export async function getRevenueSeries(
  range: RevenueRange,
): Promise<QueryResult<RevenuePoint[]>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  try {
    const count = REVENUE_BUCKETS[range];
    const now = new Date();
    const anchor =
      range === "daily"
        ? startOfUtcDay(now)
        : range === "weekly"
          ? startOfUtcWeek(now)
          : startOfUtcMonth(now);

    const buckets: { start: Date; end: Date; label: string }[] = [];
    for (let index = count - 1; index >= 0; index -= 1) {
      const start = new Date(anchor);
      if (range === "daily") start.setUTCDate(start.getUTCDate() - index);
      else if (range === "weekly") start.setUTCDate(start.getUTCDate() - index * 7);
      else start.setUTCMonth(start.getUTCMonth() - index);

      const end = new Date(start);
      if (range === "daily") end.setUTCDate(end.getUTCDate() + 1);
      else if (range === "weekly") end.setUTCDate(end.getUTCDate() + 7);
      else end.setUTCMonth(end.getUTCMonth() + 1);

      buckets.push({
        start,
        end,
        label:
          range === "daily"
            ? start.toLocaleDateString("en-US", { weekday: "short" })
            : range === "weekly"
              ? start.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : start.toLocaleDateString("en-US", {
                  month: "short",
                  year: "2-digit",
                }),
      });
    }

    const firstBucket = buckets[0];
    const [ordersResult, ticketsResult] = await Promise.all([
      admin
        .from("orders")
        .select("created_at, subtotal, discount, custom_build_id, labor_cost")
        .gte("created_at", firstBucket.start.toISOString())
        .not("status", "eq", "cancelled"),
      admin
        .from("event_registrations")
        .select("created_at, amount_paid")
        .gte("created_at", firstBucket.start.toISOString())
        .eq("payment_status", "paid")
        .eq("status", "registered"),
    ]);

    if (ordersResult.error) {
      return { data: null, error: toFriendlyDbError(ordersResult.error) };
    }
    if (ticketsResult.error) {
      return { data: null, error: toFriendlyDbError(ticketsResult.error) };
    }

    const orderRows = (ordersResult.data ?? []) as OrderRevenueRow[];
    const ticketRows = (ticketsResult.data ?? []) as TicketRevenueRow[];

    const series = buckets.map((bucket) => {
      const ordersInBucket = orderRows.filter((row) => {
        const created = new Date(row.created_at);
        return created >= bucket.start && created < bucket.end;
      });
      const ticketsInBucket = ticketRows.filter((row) => {
        const created = new Date(row.created_at);
        return created >= bucket.start && created < bucket.end;
      });

      const productSales = ordersInBucket.reduce((sum, row) => {
        if (row.custom_build_id) return sum;
        return sum + Math.max(0, Number(row.subtotal) - Number(row.discount ?? 0));
      }, 0);
      const customBuildSales = ordersInBucket.reduce((sum, row) => {
        if (!row.custom_build_id) return sum;
        return sum + Math.max(0, Number(row.subtotal) - Number(row.discount ?? 0));
      }, 0);
      const laborRevenue = ordersInBucket.reduce(
        (sum, row) => sum + Number(row.labor_cost ?? 0),
        0,
      );
      const ticketSales = ticketsInBucket.reduce(
        (sum, row) => sum + Number(row.amount_paid ?? 0),
        0,
      );
      const totalSales = productSales + laborRevenue;

      return {
        label: bucket.label,
        value: totalSales,
        totalSales,
        productSales,
        ticketSales,
        customBuildSales,
        laborRevenue,
      };
    });

    return { data: series, error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load revenue analytics.",
    };
  }
}
