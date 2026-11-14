"use client";
import {RETURN_LABELS,returnEvidenceUrl,type ReturnRecord} from "@/lib/returns/types";
import styles from "./Returns.module.css";
export const returnDate=(s:string)=>new Date(s).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"});
export default function ReturnDetails({request:r,admin=false}:{request:ReturnRecord;admin?:boolean}){
 return <div className={styles.details}><span className={styles.badge} data-status={r.status}>{RETURN_LABELS[r.status]}</span><p className={styles.muted}>Submitted {returnDate(r.created_at)}</p>
 <h3>Reason for request</h3><p className={styles.pre}>{r.reason}</p>
 {r.review_note?<><h3>Admin response</h3><p className={styles.pre}>{r.review_note}</p></>:null}
 {r.reviewed_at?<p className={styles.muted}>Reviewed {returnDate(r.reviewed_at)}</p>:null}
 {r.return_method?<><h3>Return arrangement</h3><p>{r.return_method==="rider_pickup"?"Rider pickup requested":"Drop-off at the physical store"}</p>{r.pickup_details?<p className={styles.pre}>{r.pickup_details}</p>:<p className={styles.muted}>LNR Cycle Center, Karangahan Boulevard, Tabaco City, Albay.</p>}</>:null}
 {r.refund_reference?<><h3>Refund record</h3><p className={styles.pre}>{r.refund_reference}</p></>:null}
 <h3>Submitted photos and videos</h3><div className={styles.mediaGrid}>{r.evidence?.map(f=><figure key={f.id}>{f.mime_type.startsWith("video/")?<video controls preload="metadata" src={returnEvidenceUrl(f.id,admin)} aria-label={f.file_name}/>:<img src={returnEvidenceUrl(f.id,admin)} alt="Submitted return evidence" loading="lazy"/>}<figcaption><a href={returnEvidenceUrl(f.id,admin)} target="_blank" rel="noopener noreferrer">{f.file_name}</a></figcaption></figure>)}</div>
 <p className={styles.muted}>If a video does not play in this browser, open its filename to view or download it.</p>
 {r.events?.length?<details className={styles.history}><summary>Request history</summary><ol>{[...r.events].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)).map((h,i)=><li key={h.created_at+i}><strong>{RETURN_LABELS[h.status as keyof typeof RETURN_LABELS]??h.status}</strong><span>{returnDate(h.created_at)}</span>{h.note?<p>{h.note}</p>:null}</li>)}</ol></details>:null}</div>;
}
