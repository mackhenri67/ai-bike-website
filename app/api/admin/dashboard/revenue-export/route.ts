import { NextResponse } from "next/server";
import { returnActor, returnClient, returnHttp, ReturnError } from "@/lib/returns/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OrderItem = {
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
};

type OrderRow = {
  id: string;
  created_at: string;
  subtotal: number;
  discount: number;
  labor_cost: number;
  custom_build_id: string | null;
  order_items: OrderItem[] | null;
};

type TicketRow = {
  created_at: string;
  amount_paid: number;
  category: string | null;
  event: { title: string } | { title: string }[] | null;
};

type ExportRow = {
  date: string;
  item: string;
  type: string;
  quantity: number;
  unitCost: number;
  labor: number;
  total: number;
};

function csvCell(value: string | number): string {
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function peso(value: number): string {
  return value.toFixed(2);
}

function dateKey(value: string): string {
  return new Date(value).toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });
}

function dateLabel(key: string, monthly: boolean): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  return monthly
    ? date.toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" })
    : date.toLocaleDateString("en-PH", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function csvResponse(rows: string[][], filename: string) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function GET(request: Request) {
  return returnHttp(async () => {
    await returnActor(true);
    const params = new URL(request.url).searchParams;
    const period = params.get("period") ?? "7d";
    if (!["7d", "30d", "6m", "12m"].includes(period)) {
      throw new ReturnError("Choose a valid export date range.");
    }

    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    if (period === "7d") start.setUTCDate(start.getUTCDate() - 6);
    else if (period === "30d") start.setUTCDate(start.getUTCDate() - 29);
    else if (period === "6m") start.setUTCMonth(start.getUTCMonth() - 6);
    else start.setUTCMonth(start.getUTCMonth() - 12);
    start.setUTCHours(0, 0, 0, 0);

    const admin = returnClient();
    const [ordersResult, ticketsResult] = await Promise.all([
      admin
        .from("orders")
        .select("id, created_at, subtotal, discount, labor_cost, custom_build_id, order_items(product_name, unit_price, quantity, line_total)")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .neq("status", "cancelled")
        .order("created_at", { ascending: true }),
      admin
        .from("event_registrations")
        .select("created_at, amount_paid, category, event:events(title)")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .eq("payment_status", "paid")
        .eq("status", "registered")
        .order("created_at", { ascending: true }),
    ]);

    if (ordersResult.error || ticketsResult.error) {
      throw new ReturnError("Detailed sales could not be loaded for export.", 503);
    }

    const detailed: ExportRow[] = [];
    const productRevenue = { product: 0, custom: 0, labor: 0, ticket: 0 };
    const groupedOrders = (ordersResult.data ?? []) as OrderRow[];
    for (const order of groupedOrders) {
      const date = dateKey(order.created_at);
      const subtotal = Math.max(0, Number(order.subtotal ?? 0) - Number(order.discount ?? 0));
      const labor = Number(order.labor_cost ?? 0);
      const items = order.order_items ?? [];

      if (order.custom_build_id) {
        detailed.push({
          date,
          item: labor > 0 ? `Custom Bike Build (Labor: ₱${peso(labor)})` : "Custom Bike Build",
          type: "Custom Build",
          quantity: 1,
          unitCost: subtotal,
          labor,
          total: subtotal + labor,
        });
        productRevenue.custom += subtotal;
      } else if (items.length > 0) {
        const lineSum = items.reduce((sum, item) => sum + Number(item.line_total ?? Number(item.unit_price) * Number(item.quantity)), 0);
        let laborAdded = false;
        for (const item of items) {
          const gross = Number(item.line_total ?? Number(item.unit_price) * Number(item.quantity));
          const net = lineSum > 0 ? gross * (subtotal / lineSum) : 0;
          const rowLabor = laborAdded ? 0 : labor;
          laborAdded = true;
          detailed.push({
            date,
            item: rowLabor > 0 ? `${item.product_name} (Labor: ₱${peso(rowLabor)})` : item.product_name,
            type: "Product",
            quantity: Number(item.quantity ?? 0),
            unitCost: Number(item.unit_price ?? 0),
            labor: rowLabor,
            total: net + rowLabor,
          });
          productRevenue.product += net;
        }
        if (!laborAdded && labor > 0) {
          detailed.push({ date, item: "Labor", type: "Labor", quantity: 1, unitCost: 0, labor, total: labor });
        }
      } else if (subtotal > 0 || labor > 0) {
        detailed.push({
          date,
          item: labor > 0 ? `Order (Labor: ₱${peso(labor)})` : "Order",
          type: "Product",
          quantity: 1,
          unitCost: subtotal,
          labor,
          total: subtotal + labor,
        });
        productRevenue.product += subtotal;
      }
      productRevenue.labor += labor;
    }

    const tickets = (ticketsResult.data ?? []) as TicketRow[];
    for (const ticket of tickets) {
      const eventValue = Array.isArray(ticket.event) ? ticket.event[0] : ticket.event;
      const amount = Number(ticket.amount_paid ?? 0);
      const eventName = eventValue?.title ?? "Event Registration";
      const category = ticket.category ? ` — ${ticket.category}` : "";
      detailed.push({
        date: dateKey(ticket.created_at),
        item: `${eventName}${category}`,
        type: "Event Ticket",
        quantity: 1,
        unitCost: amount,
        labor: 0,
        total: amount,
      });
      productRevenue.ticket += amount;
    }

    detailed.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.item.localeCompare(b.item));
    const monthly = period === "6m" || period === "12m";
    const headers = ["Date Sold", "Item / Event Name", "Type", "Quantity", "Unit Cost (PHP)", "Labor (PHP)", "Total (PHP)"];
    const rows: string[][] = [headers];
    let currentGroup = "";
    let groupTotal = 0;
    let grandTotal = 0;
    for (const row of detailed) {
      const group = monthly ? row.date.slice(0, 7) : row.date;
      if (currentGroup && group !== currentGroup) {
        rows.push([monthly ? "MONTHLY TOTAL" : "DAILY TOTAL", "", "", "", "", "", peso(groupTotal)]);
        rows.push(["", "", "", "", "", "", ""]);
        groupTotal = 0;
      }
      currentGroup = group;
      rows.push([
        dateLabel(row.date, false),
        row.item,
        row.type,
        String(row.quantity),
        peso(row.unitCost),
        row.labor > 0 ? `(₱${peso(row.labor)})` : "",
        peso(row.total),
      ]);
      groupTotal += row.total;
      grandTotal += row.total;
    }
    if (currentGroup) {
      rows.push([monthly ? "MONTHLY TOTAL" : "DAILY TOTAL", "", "", "", "", "", peso(groupTotal)]);
      rows.push(["", "", "", "", "", "", ""]);
    }
    rows.push(["REVENUE SUMMARY", "", "", "", "", "", ""]);
    rows.push(["Product Sales", "", "", "", "", "", peso(productRevenue.product)]);
    rows.push(["Custom Build Sales", "", "", "", "", "", peso(productRevenue.custom)]);
    rows.push(["Labor Revenue", "", "", "", "", "", peso(productRevenue.labor)]);
    rows.push(["Event Ticket Sales", "", "", "", "", "", peso(productRevenue.ticket)]);
    rows.push(["GRAND TOTAL", "", "", "", "", "", peso(grandTotal)]);

    return csvResponse(rows, `detailed-sales-${period}.csv`);
  });
}
