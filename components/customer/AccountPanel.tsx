"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { EventRegistrationRow, OrderRow } from "@/lib/data/types";
import { cancelAccountItem } from "@/app/profile/account-actions";
import { accountPaymentLabel } from "@/lib/account-payment";
import EventTicketCard from "./EventTicketCard";
import BuildReviewForm from "./BuildReviewForm";
import ReturnOrderItem, { ReturnItemDialog } from "./returns/ReturnOrderItem";
import { filterAccountOrders, ACCOUNT_ORDER_FILTERS, type AccountOrderFilter, filterAccountEvents, ACCOUNT_EVENT_FILTERS, type AccountEventFilter } from "@/lib/account-orders";
import { returnFetch } from "@/lib/returns/client";
import { PRODUCT_PLACEHOLDER_SRC } from "./data";
import styles from "./AccountPanel.module.css";
const money=(v:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(v);
const date=(v:string)=>new Date(v).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"});
function Modal({ title, children, onClose, busy=false, ticketStyle=false }: { title: string; children: ReactNode; onClose:()=>void; busy?:boolean; ticketStyle?:boolean }) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;if(dialog&&!dialog.open)dialog.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[]);
  return <dialog ref={ref} className={`${styles.dialog} ${ticketStyle ? styles.ticketDialog : ""}`} aria-label={title} onCancel={(event)=>{event.preventDefault();if(!busy)onClose();}} onClose={()=>{if(!ref.current?.open)onClose();}} onClick={(event)=>{if(!busy&&event.target===event.currentTarget)onClose();}}><div className={styles.dialogContent}><button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Close dialog">×</button>{children}</div></dialog>;
}
function OrderMenu({ order, onCancel, onReturn }: { order: OrderRow; onCancel: () => void; onReturn: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <details className={styles.menu} onToggle={(event) => {
    if (timer.current) clearTimeout(timer.current);
    const menu = event.currentTarget;
    if (menu.open && !["pending", "completed"].includes(order.status)) timer.current = setTimeout(() => { menu.open = false; }, 3000);
  }}><summary aria-label={`Actions for ${order.order_number}`}>⋮</summary><div>{order.status === "pending" ? <button type="button" className={styles.cancelAction} onClick={(event) => { const menu = event.currentTarget.closest("details"); if (menu) menu.open = false; onCancel(); }}>Cancel order</button> : order.status === "completed" ? <button type="button" className={styles.returnAction} onClick={(event) => { const menu=event.currentTarget.closest("details"); if(menu)menu.open=false; onReturn(); }}>Return / refund</button> : <p role="status">Orders can only be cancelled while still processing.</p>}</div></details>;
}
function PaymentReceipt({ order }: { order: OrderRow }) {
  const [failed, setFailed] = useState(false);
  const receipt = order.payment_receipt;
  return <><h2 className={styles.confirmTitle}>Payment receipt</h2><p className={styles.confirmText}>{order.order_number} · {money(Number(order.total))}</p><p className={styles.confirmText}>Payment status: {accountPaymentLabel(order)}</p>
    {receipt?.sender ? <p className={styles.confirmText}>Sender: {receipt.sender}</p> : null}
    <p className={styles.confirmText}>Reference: {receipt?.reference || order.payment_reference || "Not supplied"}</p>
    {receipt?.url && !failed ? <img src={receipt.url} alt="Your submitted payment receipt" className={styles.receiptImage} onError={() => setFailed(true)} /> : <p className={styles.confirmText}>{receipt?.url ? "The receipt could not be loaded. Refresh the page and try again." : "No submitted receipt is available for this order."}</p>}
    {!receipt && order.status === "pending" && order.payment_method === "gcash" ? <Link href={`/gcash-payment/${encodeURIComponent(order.order_number)}`} className={styles.textLink}>Continue payment</Link> : null}
  </>;
}
export default function AccountPanel({ kind, orders=[], registrations=[], initialTicketCode }: { kind:"orders"|"events";orders?:OrderRow[];registrations?:EventRegistrationRow[]; initialTicketCode?:string }) {
  const router=useRouter();const [ticket,setTicket]=useState<EventRegistrationRow|null>(() => registrations.find((reg) => reg.registration_code === initialTicketCode) ?? null);const [cancel,setCancel]=useState<{id:string;name:string}|null>(null);const [pending,setPending]=useState(false);const [error,setError]=useState<string|null>(null);
  const [receiptOrder, setReceiptOrder] = useState<OrderRow | null>(null);
  const [filter,setFilter]=useState<AccountOrderFilter>("all");
  const [query,setQuery]=useState("");
  const [eventFilter,setEventFilter]=useState<AccountEventFilter>("all");
  const [returnOrderIds,setReturnOrderIds]=useState<string[]>([]);
  const [returnsLoading,setReturnsLoading]=useState(false);
  const [returnsError,setReturnsError]=useState<string|null>(null);
  const [reloadReturns,setReloadReturns]=useState(0);
  const [cancelledIds,setCancelledIds]=useState<Set<string>>(()=>new Set());
  const [notice,setNotice]=useState("");
  const [returnOrder,setReturnOrder]=useState<OrderRow|null>(null);
  const [returnItem,setReturnItem]=useState<{order:OrderRow;item:NonNullable<OrderRow["order_items"]>[number]}|null>(null);
  useEffect(()=>{
    if(kind!=="orders")return;
    const c=new AbortController();let sequence=0;
    async function load(){
      const run=++sequence;setReturnsLoading(true);setReturnsError(null);
      try{
        const ids=new Set<string>();let page=0;
        do{
          const result=await returnFetch<{requests:{order_id:string}[];hasMore:boolean}>(`/api/returns?summary=1&page=${page}`,undefined,c.signal);
          for(const request of result.requests)ids.add(request.order_id);
          if(!result.hasMore)break;
          page++;
        }while(page<=1000);
        if(!c.signal.aborted&&run===sequence)setReturnOrderIds([...ids]);
      }catch(e){if(!c.signal.aborted&&run===sequence)setReturnsError(e instanceof Error?e.message:"Could not load returns.");}
      finally{if(!c.signal.aborted&&run===sequence)setReturnsLoading(false);}
    }
    const refresh=()=>{void load();};refresh();
    window.addEventListener("lnr:returns-updated",refresh);window.addEventListener("focus",refresh);
    return()=>{c.abort();window.removeEventListener("lnr:returns-updated",refresh);window.removeEventListener("focus",refresh);};
  },[kind,reloadReturns]);
  const effectiveOrders=orders.map(o=>cancelledIds.has(o.id)?{...o,status:"cancelled" as const}:o);
  const effectiveRegistrations=registrations.map(reg=>cancelledIds.has(reg.id)?{...reg,status:"cancelled" as const}:reg);
  const visibleRegistrations=filterAccountEvents(effectiveRegistrations,eventFilter);
  const visibleOrders=filterAccountOrders(effectiveOrders,filter,returnOrderIds,query);
  function openReturn(order:OrderRow){
    const items=order.order_items??[];
    if(order.custom_build_id&&items.length)setReturnItem({order,item:items[0]});
    else if(items.length===1)setReturnItem({order,item:items[0]});
    else if(items.length)setReturnOrder(order);
    else setNotice("The order items could not be loaded. Refresh this page or contact the shop.");
  }
  async function confirmCancellation(){if(!cancel||pending)return;setPending(true);setError(null);try{const result=await cancelAccountItem(kind==='orders'?'order':'event',cancel.id);if(result.error)setError(result.error);else{setCancelledIds(old=>new Set([...old,cancel.id]));setNotice(kind==='orders'?'Order cancelled successfully.':'Registration cancelled successfully.');setCancel(null);router.refresh();}}catch{setError('Cancellation could not be completed. Please try again.');}finally{setPending(false);}}
  return <><section className={styles.card}><h2 className={styles.cardTitle}>{kind==='orders'?'Order history':'Event registrations'}</h2>
    {notice?<p className={styles.notice} role="status">{notice}</p>:null}
    {kind==='orders'?<div className={styles.toolbar}><div className={styles.filters} role="group" aria-label="Filter orders">{ACCOUNT_ORDER_FILTERS.map(([key,label])=><button type="button" key={key} aria-pressed={filter===key} className={filter===key?styles.selectedFilter:styles.filter} onClick={()=>setFilter(key)}>{label}<span>{filterAccountOrders(effectiveOrders,key,returnOrderIds).length}</span></button>)}</div><label className={styles.search}>Search orders<input aria-label="Search orders" placeholder="Order number or product" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>:null}
    {kind==='events'?<div className={styles.toolbar}><div className={styles.filters} role="group" aria-label="Filter event registrations">{ACCOUNT_EVENT_FILTERS.map(([key,label])=><button type="button" key={key} aria-pressed={eventFilter===key} className={eventFilter===key?styles.selectedFilter:styles.filter} onClick={()=>setEventFilter(key)}>{label}<span>{filterAccountEvents(effectiveRegistrations,key).length}</span></button>)}</div></div>:null}
    {kind==='orders'&&filter==='returns'&&returnsLoading?<p role="status">Loading returns…</p>:null}
    {kind==='orders'&&filter==='returns'&&returnsError?<p className={styles.error} role="alert">{returnsError} <button type="button" onClick={()=>setReloadReturns(v=>v+1)}>Try again</button></p>:null}
    {kind==='orders'?(visibleOrders.length?<ul className={styles.list}>{visibleOrders.map(order=><li key={order.id} className={styles.row}>
      <div className={styles.items}>{order.custom_build_id?<span className={styles.buildLabel}>Custom Build</span>:null}{order.order_items?.map(item=><ReturnOrderItem key={item.id} order={order} item={item}/>)}<p className={styles.meta}>{order.order_number} · {date(order.created_at)}</p><details className={styles.orderDetails}><summary>Order details</summary><p>Delivery: {order.shipping_address||'Not provided'}</p><p>Subtotal: {money(Number(order.subtotal))} · Delivery: {money(Number(order.shipping_fee))}</p><p>Payment status: {accountPaymentLabel(order)}</p></details>{order.status === "completed" && order.custom_build_id ? <BuildReviewForm orderId={order.id} review={order.build_review ?? null}/> : null}</div>
      <div className={styles.amount}><strong>{money(Number(order.total))}</strong><span>{order.payment_method==='gcash'?'GCash':'Cash on Delivery'}</span><span>Payment: {accountPaymentLabel(order)}</span><span className={`${styles.badge} ${order.status==='completed'?styles.confirmed:order.status==='shipping'?styles.shipping:order.status==='cancelled'?styles.cancelled:styles.waiting}`}>{({pending:'Processing',shipping:'Shipping',completed:'Delivered',cancelled:'Cancelled'} as Record<string,string>)[order.status]??order.status}</span>{order.payment_method==='gcash'?<button type="button" onClick={() => setReceiptOrder(order)} className={styles.receiptButton}>View Payment</button>:null}</div>
      <OrderMenu order={order} onReturn={()=>openReturn(order)} onCancel={()=>{setError(null);setCancel({id:order.id,name:order.order_number});}}/>
    </li>)}</ul>:<p className={styles.empty}>{orders.length?"No orders match this filter or search.":"No orders yet."} <Link href="/products">Browse products</Link>.</p>):(visibleRegistrations.length?<ul className={styles.list}>{visibleRegistrations.map(reg=><li key={reg.id} className={styles.row}>
      <img src={reg.event?.banner_image_url??PRODUCT_PLACEHOLDER_SRC} alt={reg.event?.title??'Event'} className={styles.eventImage}/><div className={styles.eventInfo}><h3>{reg.event?.title??'Event'}</h3><p>{reg.event?date(reg.event.event_date):'Date to be announced'}</p><p>Rider: {reg.rider_name}</p><p className={styles.meta}>{reg.registration_code}</p></div>
      <div className={styles.amount}><strong>{money(Number(reg.amount_paid))}</strong><span className={`${styles.badge} ${reg.status==='cancelled'?styles.cancelled:reg.payment_status==='paid'?styles.confirmed:styles.waiting}`}>{reg.status==='cancelled'?'Cancelled':reg.payment_status==='paid'?'Confirmed':reg.payment_status==='rejected'?'Payment rejected':reg.proof_screenshot_url?'Awaiting review':'Awaiting payment'}</span></div>
      <div className={styles.actions}><button type="button" className={styles.preview} onClick={()=>setTicket(reg)}>View Ticket</button>{reg.status!=='cancelled'?<button type="button" className={styles.cancelButton} onClick={()=>{setError(null);setCancel({id:reg.id,name:reg.event?.title??reg.registration_code});}}>Cancel</button>:null}</div>
    </li>)}</ul>:<p className={styles.empty}>{registrations.length?"No event registrations match this filter.":"No registrations yet."} <Link href="/events">Browse events</Link>.</p>)}
  </section>
  {returnOrder?<Modal title="Choose an item to return" onClose={()=>setReturnOrder(null)}><h2 className={styles.confirmTitle}>Choose an item</h2><p className={styles.confirmText}>Select the product to request a return/refund or check its review status.</p><div className={styles.returnPicker}>{returnOrder.order_items?.map(item=><button type="button" key={item.id} onClick={()=>{setReturnItem({order:returnOrder,item});setReturnOrder(null);}}>{item.product_name}<span>Quantity: {item.quantity}</span></button>)}</div></Modal>:null}
  {returnItem?<ReturnItemDialog key={returnItem.item.id} order={returnItem.order} item={returnItem.item} onClose={()=>setReturnItem(null)}/>:null}
  {ticket?<Modal title="Event entry pass" ticketStyle onClose={()=>setTicket(null)}><div className={styles.ticketSurface}><EventTicketCard registration={ticket}/></div></Modal>:null}
  {receiptOrder?<Modal title="Payment receipt" onClose={()=>setReceiptOrder(null)}><PaymentReceipt key={receiptOrder.id} order={receiptOrder}/></Modal>:null}
  {cancel?<Modal title="Confirm cancellation" onClose={()=>{if(!pending)setCancel(null);}} busy={pending}><h2 className={styles.confirmTitle}>Confirm Cancellation?</h2><p className={styles.confirmText}>Your {kind==='orders'?'order':'registration'} for <strong>{cancel.name}</strong> will be cancelled. If you already paid, contact the shop to arrange any applicable refund.</p>{error?<p className={styles.error} role="alert">{error}</p>:null}<div className={styles.confirmActions}><button type="button" className={styles.keep} onClick={()=>setCancel(null)} disabled={pending}>Keep it</button><button type="button" className={styles.danger} onClick={confirmCancellation} disabled={pending}>{pending?'Cancelling…':'Confirm cancellation'}</button></div></Modal>:null}
  </>;
}
