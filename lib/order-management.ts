import type {OrderRow} from "./data/types";
export type OrderKind="parts"|"custom";
export type OrderView="all"|"custom";
export const ORDER_STATUS_TABS=[['all','All'],['pending','Pending'],['shipping','Shipping'],['completed','Completed'],['cancelled','Cancelled'],['returns','Returns / refunds']] as const;
export type OrderManagementTab=typeof ORDER_STATUS_TABS[number][0];
export function orderMatchesKind(order:Pick<OrderRow,'custom_build_id'>,kind:OrderKind|OrderView){if(kind==='all')return true;return kind==='custom'?Boolean(order.custom_build_id):!order.custom_build_id;}
export function orderSaleLabel(order:Pick<OrderRow,'sale_channel'>){return order.sale_channel==='in_store'?'In-store sale':'Online sale';}
export function orderDay(value:string){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
export function orderDateLabel(value:string){return new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date(value));}
