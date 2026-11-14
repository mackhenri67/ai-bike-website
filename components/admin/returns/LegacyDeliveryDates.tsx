"use client";
import {useState,type FormEvent} from "react";
import {returnFetch} from "@/lib/returns/client";
import {returnDate} from "@/components/customer/returns/ReturnDetails";
import common from "@/components/customer/returns/Returns.module.css";
import styles from "./ReturnsManager.module.css";
type Delivery={id:string;order_number:string;customer_name:string;created_at:string};
type Data={orders:Delivery[];page:number;total:number;hasMore:boolean};
export default function LegacyDeliveryDates(){
 const[data,setData]=useState<Data|null>(null);const[page,setPage]=useState(0);const[order,setOrder]=useState("");const[when,setWhen]=useState("");
 const[confirmed,setConfirmed]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState<string|null>(null);const[notice,setNotice]=useState<string|null>(null);
 async function load(p=0){setBusy(true);setError(null);try{setData(await returnFetch<Data>("/api/admin/returns?missingDates=1&page="+p));setPage(p);}catch(e){setError(e instanceof Error?e.message:"Could not load deliveries.");}finally{setBusy(false);}}
 async function save(e:FormEvent){e.preventDefault();if(!confirmed)return;setBusy(true);setError(null);try{await returnFetch("/api/admin/returns",{operation:"record_completion",order,when:when+"+08:00"});setNotice("Actual delivery time recorded. The three-day deadline uses that time, not today.");setOrder("");setWhen("");setConfirmed(false);await load(page);}catch(e){setError(e instanceof Error?e.message:"Could not save delivery date.");}finally{setBusy(false);}}
 return <details className={styles.legacy} onToggle={e=>{if(e.currentTarget.open&&!data&&!busy)void load();}}><summary>Delivery dates for older completed orders</summary>
 <p>Older orders have no completion timestamp. Enter only the actual delivery time verified with shop records or the customer. A date more than three days ago will keep the online request window closed.</p>
 {data?.orders.length?<form className={common.form} onSubmit={save}><label>Completed order<select value={order} onChange={e=>setOrder(e.target.value)} required disabled={busy}><option value="">Choose an order</option>{data.orders.map(o=><option key={o.id} value={o.id}>{o.order_number} · {o.customer_name} · Ordered {returnDate(o.created_at)}</option>)}</select></label><label>Verified delivery date/time (Philippine time)<input type="datetime-local" step={60} value={when} onChange={e=>setWhen(e.target.value)} required disabled={busy}/></label><label className={styles.check}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required disabled={busy}/>I verified the actual delivery time. This is not a new delivery or an extension of the return window.</label><button className={common.primary} disabled={busy||!confirmed}>{busy?"Saving…":"Record actual delivery time"}</button></form>:data?<p>No orders on this page need a delivery date.</p>:null}
 {data?<div className={styles.actions}><button type="button" className={common.secondary} disabled={busy||!page} onClick={()=>void load(page-1)}>Previous</button><button type="button" className={common.secondary} disabled={busy||!data.hasMore} onClick={()=>void load(page+1)}>Next</button></div>:null}
 {error?<p className={common.error} role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}</details>;
}
