"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import type {OrderItemRow,OrderRow} from "@/lib/data/types";
import {RETURN_BUCKET,RETURN_MIME_TYPES,type ReturnContext,type ReturnRecord} from "@/lib/returns/types";
import {returnFetch} from "@/lib/returns/client";
import {getBrowserClient} from "@/lib/supabase/client";
import {PRODUCT_PLACEHOLDER_SRC} from "../data";
import ReturnDetails,{returnDate} from "./ReturnDetails";
import styles from "./Returns.module.css";
type SelectedFile={id:string;file:File;mime:string};
function MethodForm({request:r,onSaved,busy,setBusy,defaultPickup}:{request:ReturnRecord;onSaved:()=>Promise<void>;busy:boolean;setBusy:(v:boolean)=>void;defaultPickup:string}){
 const[method,setMethod]=useState(r.return_method??"");const[details,setDetails]=useState(r.pickup_details??defaultPickup);const[error,setError]=useState<string|null>(null);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError(null);try{await returnFetch("/api/returns",{operation:"method",id:r.id,method,details});await onSaved();}catch(e){setError(e instanceof Error?e.message:"Could not save return method.");}finally{setBusy(false);}}
 return <form onSubmit={submit} className={styles.form}><h3>Choose how to return the item</h3><p className={styles.muted}>Your request is approved. Coordinate the return with the shop. Refund processing follows inspection and is handled separately.</p>
 <label className={styles.choice}><input type="radio" name="return-method" checked={method==="rider_pickup"} onChange={()=>setMethod("rider_pickup")} disabled={busy} required/><span><strong>Rider pickup</strong><small>The shop will contact you to confirm the schedule, availability and any pickup charges. No rider is booked automatically.</small></span></label>
 <label className={styles.choice}><input type="radio" name="return-method" checked={method==="store_dropoff"} onChange={()=>setMethod("store_dropoff")} disabled={busy} required/><span><strong>Drop off at the store</strong><small>LNR Cycle Center, Karangahan Boulevard, Tabaco City, Albay. Contact the shop to confirm the drop-off time.</small></span></label>
 {method==="rider_pickup"?<label>Pickup address and contact number<textarea value={details} onChange={e=>setDetails(e.target.value)} minLength={10} maxLength={1000} required disabled={busy} rows={3}/></label>:null}
 {error?<p className={styles.error} role="alert">{error}</p>:null}<button className={styles.primary} disabled={busy||!method}>{busy?"Saving…":"Save return method"}</button></form>;
}
function ReturnDialog({order,item,onClose}:{order:OrderRow;item:OrderItemRow;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const[context,setContext]=useState<ReturnContext|null>(null);const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);
 const[error,setError]=useState<string|null>(null);const[reason,setReason]=useState("");const[files,setFiles]=useState<SelectedFile[]>([]);const[progress,setProgress]=useState("");
 const requestId=useRef<string|null>(null);
 async function load(){setContext(await returnFetch<ReturnContext>("/api/returns?item="+encodeURIComponent(item.id)));}
 useEffect(()=>{dialog.current?.showModal();const previous=document.body.style.overflow;document.body.style.overflow="hidden";const c=new AbortController();
 returnFetch<ReturnContext>("/api/returns?item="+encodeURIComponent(item.id),undefined,c.signal).then(setContext).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});
 return()=>{c.abort();document.body.style.overflow=previous;};},[item.id]);
 function select(list:FileList|null){
  if(!list)return;setError(null);if(files.length+list.length>3){setError("Attach up to three files.");return;}
  const selected:SelectedFile[]=[];
  const mimeByExt:Record<string,string>={jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",mp4:"video/mp4",webm:"video/webm",mov:"video/quicktime"};
  for(const file of Array.from(list)){const mime=file.type||mimeByExt[file.name.split(".").pop()?.toLowerCase()??""]||"";
   if(!(RETURN_MIME_TYPES as readonly string[]).includes(mime)||file.size<1||file.size>(mime.startsWith("image/")?5:20)*1024*1024){setError("Use JPG, PNG or WebP photos up to 5 MB, or MP4, WebM or MOV videos up to 20 MB.");return;}
   selected.push({id:crypto.randomUUID(),file,mime});
  }setFiles(old=>[...old,...selected]);
 }
 async function submit(e:FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError(null);
  try{
   if(!files.length)throw new Error("Attach at least one photo or video.");
   requestId.current??=crypto.randomUUID();const assets:string[]=[];
   for(let i=0;i<files.length;i++){
    const f=files[i];setProgress("Uploading evidence "+(i+1)+" of "+files.length+"…");
    const u=await returnFetch<{id:string;path:string;token?:string;exists:boolean}>("/api/returns/upload",{item:item.id,id:f.id,name:f.file.name,mime:f.mime,size:f.file.size});
    if(!u.exists){if(!u.token)throw new Error("Could not prepare the upload.");const result=await getBrowserClient().storage.from(RETURN_BUCKET).uploadToSignedUrl(u.path,u.token,f.file,{contentType:f.mime,cacheControl:"0",upsert:false});if(result.error)throw new Error("An upload failed. Keep this window open and try submitting again.");}
    assets.push(u.id);
   }
   setProgress("Submitting for admin review…");await returnFetch("/api/returns",{operation:"submit",id:requestId.current,item:item.id,reason,assets});
   await load();setFiles([]);setReason("");requestId.current=null;
  }catch(e){setError(e instanceof Error?e.message:"Could not submit the request.");}finally{setBusy(false);setProgress("");}
 }
 const latest=context?.requests[0];const canSubmit=context?.eligible&&(!latest||latest.status==="rejected");
 return <dialog ref={dialog} className={styles.dialog} aria-labelledby={"return-title-"+item.id} onCancel={e=>{if(busy)e.preventDefault();}} onClose={onClose}>
 <header className={styles.header}><div><p className={styles.eyebrow}>{order.order_number}</p><h2 id={"return-title-"+item.id}>{item.product_name}</h2></div><button type="button" className={styles.close} disabled={busy} aria-label="Close return details" onClick={()=>dialog.current?.close()}>×</button></header>
 <div className={styles.body}><p className={styles.muted}>Quantity: {item.quantity} · {[item.size,item.color].filter(Boolean).join(" · ")}</p>
 {loading?<p role="status">Loading return options…</p>:null}
 {context?<><h3>Return/refund</h3><p className={styles.muted}>Submit within three days (72 hours) after the order is marked delivered.</p>
 {context.completed_at?<p className={styles.muted}>Delivered: {returnDate(context.completed_at)}<br/>Request deadline: {returnDate(context.deadline!)}</p>:<p className={styles.muted}>{context.order_status==="completed"?"The completion date has not been recorded. Contact the shop to verify the delivery date.":"Return/refund requests become available after delivery."}</p>}
 {latest?<ReturnDetails request={latest}/>:null}
 {latest&&["approved","return_selected"].includes(latest.status)?<MethodForm key={latest.id+latest.updated_at} request={latest} defaultPickup={[order.shipping_address,order.customer_phone].filter(Boolean).join(" · ")} onSaved={load} busy={busy} setBusy={setBusy}/>:null}
 {canSubmit?<form className={styles.form} onSubmit={submit}><h3>{latest?"Submit another request":"Request a return/refund"}</h3>
 <label>Reason for return/refund<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={10} maxLength={2000} required disabled={busy} rows={4} placeholder="Explain the issue and what happened."/></label>
 <label>Photos or videos<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mov" multiple disabled={busy||files.length>=3} onChange={e=>{select(e.target.files);e.target.value="";}}/></label>
 <p className={styles.muted}>Attach 1–3 files. Photos: up to 5 MB each. Videos: up to 20 MB each. Evidence is private to you and authorized shop administrators.</p>
 <ul className={styles.files}>{files.map(f=><li key={f.id}><span>{f.file.name} ({(f.file.size/1024/1024).toFixed(1)} MB)</span><button type="button" disabled={busy} aria-label={"Remove "+f.file.name} onClick={()=>setFiles(old=>old.filter(x=>x.id!==f.id))}>×</button></li>)}</ul>
 <p className={styles.muted}>This request covers this product and its listed quantity. Submission does not automatically approve a return or release a refund.</p>
 <button type="submit" className={styles.primary} disabled={busy||!files.length}>{busy?progress||"Submitting…":"Submit for review"}</button></form>
 :context.completed_at&&!context.eligible&&(!latest||latest.status==="rejected")?<p className={styles.notice}>The three-day online request period has ended. Contact the shop for further assistance.</p>:null}</>:null}
 {error?<p className={styles.error} role="alert">{error}</p>:null}
 {!loading?<button type="button" className={styles.secondary} disabled={busy} onClick={()=>{setLoading(true);setError(null);load().catch(e=>setError(e.message)).finally(()=>setLoading(false));}}>Refresh status</button>:null}
 </div></dialog>;
}
export default function ReturnOrderItem({order,item}:{order:OrderRow;item:OrderItemRow}){
 const[open,setOpen]=useState(false);
 return <><button type="button" className={styles.itemButton} onClick={()=>setOpen(true)} aria-label={"View "+item.product_name+" and return/refund options"}><img src={item.product?.product_images?.find(i=>i.is_primary)?.url??item.product?.product_images?.[0]?.url??PRODUCT_PLACEHOLDER_SRC} alt="" className={styles.productImage}/><span><strong>{item.product_name}</strong><span>Quantity: {item.quantity}</span><span>{[item.size,item.color].filter(v=>v&&!["One Size","Default","Standard"].includes(v)).join(" · ")}</span><small>{order.status==="completed"?"View item / return-refund options":"View ordered item"}</small></span></button>{open?<ReturnDialog order={order} item={item} onClose={()=>setOpen(false)}/>:null}</>;
}
