"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {returnFetch} from "@/lib/returns/client";
import {RETURN_LABELS,type ReturnRecord,type ReturnStatus} from "@/lib/returns/types";
import ReturnDetails,{returnDate} from "@/components/customer/returns/ReturnDetails";
import common from "@/components/customer/returns/Returns.module.css";
import styles from "./ReturnsManager.module.css";
import LegacyDeliveryDates from "./LegacyDeliveryDates";
type Page={requests:ReturnRecord[];page:number;total:number;hasMore:boolean};
function Review({request:initial,onClose,onChanged}:{request:ReturnRecord;onClose:()=>void;onChanged:()=>Promise<void>}){
 const[request,setRequest]=useState(initial);const[decision,setDecision]=useState<"approved"|"rejected"|"received"|"refunded"|null>(null);
 const[note,setNote]=useState("");const[confirmed,setConfirmed]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState<string|null>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();},[]);
 async function save(){
  if(!decision||busy)return;setBusy(true);setError(null);
  try{const changed=await returnFetch<ReturnRecord>("/api/admin/returns",{id:request.id,status:decision,note});setRequest(old=>({...old,...changed}));setDecision(null);setNote("");setConfirmed(false);await onChanged();}
  catch(e){setError(e instanceof Error?e.message:"Could not save the decision.");}
  finally{setBusy(false);}
 }
 const choices:("approved"|"rejected"|"received"|"refunded")[]=request.status==="pending"?["approved","rejected"]:request.status==="return_selected"?["received"]:request.status==="received"?["refunded"]:[];
 const label={approved:"Approve request",rejected:"Reject request",received:"Mark item received",refunded:"Record completed refund"};
 return <dialog ref={dialog} className={common.dialog} aria-labelledby="return-review-title" onCancel={e=>{if(busy)e.preventDefault();}} onClose={onClose}><header className={common.header}><div><p className={common.eyebrow}>{request.order?.order_number} · {request.order?.customer_name}</p><h2 id="return-review-title">{request.item?.product_name??"Return/refund request"}</h2></div><button type="button" className={common.close} disabled={busy} aria-label="Close return review" onClick={()=>dialog.current?.close()}>×</button></header>
 <div className={common.body}><p className={common.muted}>Quantity: {request.item?.quantity} · {[request.item?.size,request.item?.color].filter(Boolean).join(" · ")}</p>
 <p className={common.muted}>Customer contact: {request.order?.customer_phone||"Not provided"}<br/>Original delivery: {request.order?.shipping_address||"Not provided"}</p>
 <p className={common.muted}>Original item value: {new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(request.item?.line_total)||0)}. Confirm any applicable discount or charges before arranging the refund.</p>
 <ReturnDetails request={request} admin/>
 {choices.length&&!decision?<div className={styles.actions}>{choices.map(status=><button key={status} type="button" className={status==="rejected"?styles.reject:common.primary} onClick={()=>{setDecision(status);setError(null);}}>{label[status]}</button>)}</div>:null}
 {decision?<form className={common.form} onSubmit={e=>{e.preventDefault();void save();}}><h3>{label[decision]}</h3>
 <p className={common.muted}>{decision==="approved"?"Approval lets the customer choose pickup or store drop-off. It does not send money or add stock.":decision==="received"?"Confirm the physical item has arrived. Inspect it before changing stock through Products. Receiving does not automatically restock it.":decision==="refunded"?"Record this only after the actual refund has been completed outside this website. This action does not transfer funds.":"Explain the rejection. The customer will see this reason."}</p>
 <label>{decision==="refunded"?"Actual refund reference and details":decision==="rejected"?"Reason for rejection":"Note for the customer (optional)"}<textarea value={note} onChange={e=>setNote(e.target.value)} minLength={["rejected","refunded"].includes(decision)?10:undefined} maxLength={2000} required={["rejected","refunded"].includes(decision)} rows={3} disabled={busy}/></label>
 {decision==="refunded"?<label className={styles.check}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required disabled={busy}/>I confirm the shop has actually completed the refund.</label>:null}
 <div className={styles.actions}><button type="button" className={common.secondary} onClick={()=>{setDecision(null);setNote("");}} disabled={busy}>Back</button><button className={decision==="rejected"?styles.reject:common.primary} disabled={busy||decision==="refunded"&&!confirmed}>{busy?"Saving…":"Confirm"}</button></div>
 </form>:null}
 {request.status==="approved"?<p className={common.notice}>Awaiting the customer’s return-method selection in My Orders.</p>:null}
 {error?<p className={common.error} role="alert">{error}</p>:null}</div></dialog>;
}
export default function ReturnsManager(){
 const[status,setStatus]=useState<"all"|ReturnStatus>("pending");const[page,setPage]=useState(0);
 const[data,setData]=useState<Page>({requests:[],page:0,total:0,hasMore:false});const[error,setError]=useState<string|null>(null);const[loading,setLoading]=useState(true);const[selected,setSelected]=useState<ReturnRecord|null>(null);
 const seq=useRef(0);
 const load=useCallback(async()=>{const current=++seq.current;try{const result=await returnFetch<Page>("/api/admin/returns?"+new URLSearchParams({status,page:String(page)}));if(current===seq.current){setData(result);setError(null);}}catch(e){if(current===seq.current)setError(e instanceof Error?e.message:"Could not load requests.");}finally{if(current===seq.current)setLoading(false);}},[page,status]);
 useEffect(()=>{setLoading(true);void load();const interval=setInterval(()=>{if(document.visibilityState!=="hidden")void load();},20000);return()=>{seq.current++;clearInterval(interval);};},[load]);
 return <section className={styles.card}><div className={styles.toolbar}><div><h2>Return/refund requests</h2><p>Review evidence and coordinate approved returns.</p></div><div className={styles.controls}><label>Status<select value={status} onChange={e=>{setStatus(e.target.value as typeof status);setPage(0);}}><option value="all">All statuses</option>{Object.entries(RETURN_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button type="button" className={common.secondary} onClick={()=>void load()}>Refresh</button></div></div>
 {error?<p className={common.error} role="alert">{error}</p>:null}
 {loading?<p className={styles.empty} role="status">Loading requests…</p>:<><div className={styles.tableWrap}><table><thead><tr><th>Order / customer</th><th>Product</th><th>Submitted</th><th>Status</th><th>Return method</th><th>Action</th></tr></thead><tbody>{data.requests.map(r=><tr key={r.id}><td><strong>{r.order?.order_number}</strong><small>{r.order?.customer_name}</small></td><td>{r.item?.product_name}<small>Quantity: {r.item?.quantity} · {r.evidence.length} evidence file(s)</small></td><td>{returnDate(r.created_at)}</td><td><span className={common.badge} data-status={r.status}>{RETURN_LABELS[r.status]}</span></td><td>{r.return_method==="rider_pickup"?"Rider pickup":r.return_method==="store_dropoff"?"Store drop-off":"Not selected"}</td><td><button type="button" className={common.secondary} onClick={()=>setSelected(r)} aria-label={"Review return for "+r.order?.order_number}>View / review</button></td></tr>)}</tbody></table></div>
 {!data.requests.length?<p className={styles.empty}>No return/refund requests in this status.</p>:null}
 <div className={styles.pagination}><span>{data.total} request(s) · Page {page+1}</span><button type="button" className={common.secondary} disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><button type="button" className={common.secondary} disabled={!data.hasMore} onClick={()=>setPage(p=>p+1)}>Next</button></div></>}
 <LegacyDeliveryDates/>
 {selected?<Review request={selected} onClose={()=>setSelected(null)} onChanged={load}/>:null}
 </section>;
}
