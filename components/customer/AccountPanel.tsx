"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { EventRegistrationRow, OrderRow } from "@/lib/data/types";
import { cancelAccountItem } from "@/app/profile/account-actions";
import { accountPaymentLabel } from "@/lib/account-payment";
import EventTicketCard from "./EventTicketCard";
import BuildReviewForm from "./BuildReviewForm";
import ReturnOrderItem from "./returns/ReturnOrderItem";
import { PRODUCT_PLACEHOLDER_SRC } from "./data";
import styles from "./AccountPanel.module.css";
const money=(v:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(v);
const date=(v:string)=>new Date(v).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"});
function Modal({ title, children, onClose, busy=false, ticketStyle=false }: { title: string; children: ReactNode; onClose:()=>void; busy?:boolean; ticketStyle?:boolean }) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;if(dialog&&!dialog.open)dialog.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{dialog?.close();document.body.style.overflow=previous;};},[]);
  return <dialog ref={ref} className={`${styles.dialog} ${ticketStyle ? styles.ticketDialog : ""}`} aria-label={title} onCancel={(event)=>{if(busy)event.preventDefault();}} onClose={onClose} onClick={(event)=>{if(!busy&&event.target===event.currentTarget)ref.current?.close();}}><div className={styles.dialogContent}><button type="button" className={styles.close} onClick={()=>ref.current?.close()} disabled={busy} aria-label="Close dialog">×</button>{children}</div></dialog>;
}
function OrderMenu({ order, onCancel }: { order: OrderRow; onCancel: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <details className={styles.menu} onToggle={(event) => {
    if (timer.current) clearTimeout(timer.current);
    const menu = event.currentTarget;
    if (menu.open && order.status !== "pending") timer.current = setTimeout(() => { menu.open = false; }, 3000);
  }}><summary aria-label={`Actions for ${order.order_number}`}>⋮</summary><div>{order.status === "pending" ? <button type="button" className={styles.cancelAction} onClick={(event) => { const menu = event.currentTarget.closest("details"); if (menu) menu.open = false; onCancel(); }}>Cancel order</button> : <p role="status">Orders can only be cancelled while still processing.</p>}</div></details>;
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
  async function confirmCancellation(){if(!cancel||pending)return;setPending(true);setError(null);try{const result=await cancelAccountItem(kind==='orders'?'order':'event',cancel.id);if(result.error)setError(result.error);else{setCancel(null);router.refresh();}}catch{setError('Cancellation could not be completed. Please try again.');}finally{setPending(false);}}
  return <><section className={styles.card}><h2 className={styles.cardTitle}>{kind==='orders'?'All Orders':'All Registrations'}</h2>
    {kind==='orders'?(orders.length?<ul className={styles.list}>{orders.map(order=><li key={order.id} className={styles.row}>
      <div className={styles.items}>{order.order_items?.map(item=><ReturnOrderItem key={item.id} order={order} item={item}/>)}<p className={styles.meta}>{order.order_number} · {date(order.created_at)}</p><details className={styles.orderDetails}><summary>Order details</summary><p>Delivery: {order.shipping_address||'Not provided'}</p><p>Subtotal: {money(Number(order.subtotal))} · Delivery: {money(Number(order.shipping_fee))}</p><p>Payment status: {accountPaymentLabel(order)}</p></details>{order.status === "completed" && order.custom_build_id ? <BuildReviewForm orderId={order.id} review={order.build_review ?? null}/> : null}</div>
      <div className={styles.amount}><strong>{money(Number(order.total))}</strong><span>{order.payment_method==='gcash'?'GCash':'Cash on Delivery'}</span><span>Payment: {accountPaymentLabel(order)}</span><span className={`${styles.badge} ${order.status==='completed'?styles.confirmed:order.status==='shipping'?styles.shipping:order.status==='cancelled'?styles.cancelled:styles.waiting}`}>{({pending:'Processing',shipping:'Shipping',completed:'Delivered',cancelled:'Cancelled'} as Record<string,string>)[order.status]??order.status}</span>{order.payment_method==='gcash'?<button type="button" onClick={() => setReceiptOrder(order)} className={styles.receiptButton}>View Payment</button>:null}</div>
      <OrderMenu order={order} onCancel={()=>{setError(null);setCancel({id:order.id,name:order.order_number});}}/>
    </li>)}</ul>:<p className={styles.empty}>No orders yet. <Link href="/products">Browse products</Link>.</p>):(registrations.length?<ul className={styles.list}>{registrations.map(reg=><li key={reg.id} className={styles.row}>
      <img src={reg.event?.banner_image_url??PRODUCT_PLACEHOLDER_SRC} alt={reg.event?.title??'Event'} className={styles.eventImage}/><div className={styles.eventInfo}><h3>{reg.event?.title??'Event'}</h3><p>{reg.event?date(reg.event.event_date):'Date to be announced'}</p><p>Rider: {reg.rider_name}</p><p className={styles.meta}>{reg.registration_code}</p></div>
      <div className={styles.amount}><strong>{money(Number(reg.amount_paid))}</strong><span className={`${styles.badge} ${reg.status==='cancelled'?styles.cancelled:reg.payment_status==='paid'?styles.confirmed:styles.waiting}`}>{reg.status==='cancelled'?'Cancelled':reg.payment_status==='paid'?'Confirmed':reg.payment_status==='rejected'?'Payment rejected':reg.proof_screenshot_url?'Awaiting review':'Awaiting payment'}</span></div>
      <div className={styles.actions}><button type="button" className={styles.preview} onClick={()=>setTicket(reg)}>View Ticket</button>{reg.status!=='cancelled'?<button type="button" className={styles.cancelButton} onClick={()=>{setError(null);setCancel({id:reg.id,name:reg.event?.title??reg.registration_code});}}>Cancel</button>:null}</div>
    </li>)}</ul>:<p className={styles.empty}>No registrations yet. <Link href="/events">Browse events</Link>.</p>)}
  </section>
  {ticket?<Modal title="Event entry pass" ticketStyle onClose={()=>setTicket(null)}><div className={styles.ticketSurface}><EventTicketCard registration={ticket}/></div></Modal>:null}
  {receiptOrder?<Modal title="Payment receipt" onClose={()=>setReceiptOrder(null)}><PaymentReceipt key={receiptOrder.id} order={receiptOrder}/></Modal>:null}
  {cancel?<Modal title="Confirm cancellation" onClose={()=>{if(!pending)setCancel(null);}} busy={pending}><h2 className={styles.confirmTitle}>Confirm Cancellation?</h2><p className={styles.confirmText}>Your {kind==='orders'?'order':'registration'} for <strong>{cancel.name}</strong> will be cancelled. If you already paid, contact the shop to arrange any applicable refund.</p>{error?<p className={styles.error} role="alert">{error}</p>:null}<div className={styles.confirmActions}><button type="button" className={styles.keep} onClick={()=>setCancel(null)} disabled={pending}>Keep it</button><button type="button" className={styles.danger} onClick={confirmCancellation} disabled={pending}>{pending?'Cancelling…':'Cancel'}</button></div></Modal>:null}
  </>;
}
