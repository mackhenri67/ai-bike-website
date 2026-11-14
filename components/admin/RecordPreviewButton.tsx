"use client";
import { useRef, type ReactNode } from "react";
import type { ProductRow, OrderRow, EventRow, EventRegistrationRow } from "@/lib/data/types";
import styles from "./RecordPreviewButton.module.css";

type Props =
 | { kind: "product"; record: ProductRow }
 | { kind: "order"; record: OrderRow }
 | { kind: "event"; record: EventRow }
 | { kind: "signup"; record: EventRegistrationRow };
const money = (n: number) => new Intl.NumberFormat("en-PH", {style:"currency",currency:"PHP"}).format(Number(n) || 0);
const date = (s: string | null) => s ? new Date(s).toLocaleString("en-PH", {timeZone:"Asia/Manila"}) : "—";
function Photo({url,alt}:{url?:string|null;alt:string}) {
 return url ? <img className={styles.photo} src={url} alt={alt}/> : null;
}
function Fields({items}:{items:[string,ReactNode][]}) {
 return <dl className={styles.fields}>{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value ?? "—"}</dd></div>)}</dl>;
}
function Details(props:Props) {
 if (props.kind==="product") {
  const p=props.record;
  return <>
   <div className={styles.gallery}>{p.product_images?.map(i=><Photo key={i.id} url={i.url} alt={p.name}/>)}</div>
   <Fields items={[["Category",p.category?.name],["Status",p.status],["Price",money(p.price)],["Stock",p.stock],["Description",p.description],["Highlights",p.tagline?.join("\n")],["Specifications",p.specs?.join("\n")],["Created",date(p.created_at)],["Updated",date(p.updated_at)]]}/>
   <h3>Customization combinations</h3>
   {p.product_variants?.length ? p.product_variants.map(v=><Fields key={v.id} items={Object.entries(v).filter(([key])=>!["id","product_id","created_at","updated_at"].includes(key)).map(([key,value])=>[key.replaceAll("_"," "), typeof value==="object" && value!==null ? Object.entries(value).map(([k,v])=>k+": "+String(v)).join(", ") : String(value ?? "—")])}/>) : <p>No customization combinations.</p>}
  </>;
 }
 if (props.kind==="event") {
  const e=props.record;
  return <><Photo url={e.banner_image_url} alt={e.title}/><Fields items={[["Event code",e.event_code],["Description",e.description],["Category",e.category],["Starts",date(e.event_date)],["Ends",date(e.end_date)],["Location",e.location],["Organizer",e.organizer],["Fee",money(e.price)],["Capacity",e.capacity],["Booked",e.slots_booked],["Status",e.status],["Created",date(e.created_at)],["Updated",date(e.updated_at)]]}/></>;
 }
 if (props.kind==="signup") {
  const r=props.record;
  return <><Fields items={[["Registration",r.registration_code],["Event",r.event?.title],["Event date",date(r.event?.event_date ?? null)],["Venue",r.event?.location],["Customer",r.customer_name],["Rider",r.rider_name],["Email",r.customer_email],["Phone",r.customer_phone],["Emergency contact",r.emergency_contact],["Amount",money(r.amount_paid)],["Payment method",r.payment_method],["Payment status",r.payment_status],["Registration status",r.status],["Sender",r.payment_sender_name],["Payment phone",r.payment_phone_number],["Reference",r.reference_number],["Rejection reason",r.rejection_reason],["Registered",date(r.created_at)],["Reviewed",date(r.reviewed_at)]]}/><h3>Submitted payment proof</h3>{r.proof_screenshot_url ? <Photo url={r.proof_screenshot_url} alt="Customer submitted payment proof"/>:<p>No payment proof submitted.</p>}</>;
 }
 const o=props.record;
 const pay=Array.isArray(o.gcash_payments)?o.gcash_payments[0]:o.gcash_payments;
 return <><Fields items={[["Order",o.order_number],["Customer",o.customer_name],["Email",o.customer_email],["Phone",o.customer_phone],["Delivery address",o.shipping_address],["Status",o.status],["Payment method",o.payment_method],["Payment status",o.payment_status],["Subtotal",money(o.subtotal)],["Shipping",money(o.shipping_fee)],["Discount",money(o.discount)],["Total",money(o.total)],["Notes",o.notes],["Placed",date(o.created_at)]]}/>
 <h3>All ordered items</h3>{o.order_items?.map(i=><Fields key={i.id} items={[["Product",i.product_name],["Size / option",i.size],["Color / option",i.color],["Quantity",i.quantity],["Unit price",money(i.unit_price)],["Line total",money(i.line_total)]]}/>)}
 {pay ? <><h3>Payment submission</h3><Fields items={[["Sender",pay.sender_name],["Phone",pay.phone_number],["Reference",pay.reference_number],["Review status",pay.status],["Rejection reason",pay.rejection_reason]]}/><Photo url={pay.screenshot_url} alt="Customer submitted payment proof"/></>:null}</>;
}
export default function RecordPreviewButton(props:Props) {
 const dialog=useRef<HTMLDialogElement>(null);
 const title=props.kind==="product"?props.record.name:props.kind==="event"?props.record.title:props.kind==="order"?props.record.order_number:props.record.registration_code;
 return <><button type="button" className={styles.eye} title={"View "+title} aria-label={"View "+title} onClick={()=>dialog.current?.showModal()}>
 <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
 </button><dialog ref={dialog} className={styles.dialog} aria-label={"Preview "+title} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
 <div className={styles.header}><h2>{title}</h2><button type="button" autoFocus aria-label="Close preview" onClick={()=>dialog.current?.close()}>×</button></div>
 <div className={styles.body}><Details {...props}/></div>
 </dialog></>;
}
