import type {OrderRow,EventRegistrationRow} from "./data/types";
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

export const ACCOUNT_EVENT_FILTERS=[["all","All"],["pending","Pending"],["paid","Paid"],["cancelled","Cancelled"]] as const;
export type AccountEventFilter=typeof ACCOUNT_EVENT_FILTERS[number][0];
export function filterAccountEvents<T extends Pick<EventRegistrationRow,"status"|"payment_status">>(registrations:T[],filter:AccountEventFilter):T[]{
 return registrations.filter(reg=>{
  if(filter==="all")return true;
  if(filter==="cancelled")return reg.status==="cancelled";
  if(reg.status==="cancelled")return false;
  return filter==="paid"?reg.payment_status==="paid":reg.payment_status!=="paid";
 });
}
