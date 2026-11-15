import type {OrderRow} from "./data/types";
export const ACCOUNT_ORDER_FILTERS=[
 ["all","All orders"],["pending","Processing"],["shipping","Shipping"],
 ["completed","Delivered"],["returns","Returns / refunds"],["cancelled","Cancelled"],
] as const;
export type AccountOrderFilter=typeof ACCOUNT_ORDER_FILTERS[number][0];
export function filterAccountOrders(orders:OrderRow[],filter:AccountOrderFilter,returnOrderIds:string[],query=""){
 const returned=new Set(returnOrderIds);const term=query.trim().toLowerCase();
 return orders.filter(order=>{
  const matchesFilter=filter==="all"|| (filter==="returns"?returned.has(order.id):order.status===filter);
  const matchesQuery=!term||order.order_number.toLowerCase().includes(term)||order.order_items?.some(item=>item.product_name.toLowerCase().includes(term));
  return matchesFilter&&matchesQuery;
 });
}
