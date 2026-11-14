"use client";
import {useSearchParams,useRouter} from "next/navigation";
import type {OrderRow} from "@/lib/data/types";
import OrdersManager from "./OrdersManager";
import ReturnsManager from "../returns/ReturnsManager";
import styles from "../events/EventsWorkspace.module.css";
export default function OrdersWorkspace({initialOrders,error}:{initialOrders:OrderRow[];error?:string|null}){
 const params=useSearchParams();const router=useRouter();const returns=params.get("tab")==="returns";
 function select(value:boolean){router.replace("/admin/orders"+(value?"?tab=returns":""),{scroll:false});}
 return <><div className={styles.tabs} role="tablist" aria-label="Order management">{[false,true].map(t=><button key={String(t)} id={t?"returns-tab":"orders-tab"} type="button" role="tab" aria-selected={returns===t} aria-controls={t?"returns-panel":"orders-panel"} tabIndex={returns===t?0:-1} onClick={()=>select(t)} onKeyDown={e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const next=e.key==="Home"?false:e.key==="End"?true:!t;select(next);document.getElementById(next?"returns-tab":"orders-tab")?.focus();}}}>{t?"Returns & refunds":"Orders"}</button>)}</div>{!returns?<p className={styles.description}>Mark an order Completed only after delivery. This starts the customer’s three-day return/refund window.</p>:null}<div id="orders-panel" role="tabpanel" aria-labelledby="orders-tab" hidden={returns}><OrdersManager initialOrders={initialOrders} error={error}/></div><div id="returns-panel" role="tabpanel" aria-labelledby="returns-tab" hidden={!returns}>{returns?<ReturnsManager/>:null}</div></>;
}
