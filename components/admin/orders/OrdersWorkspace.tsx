"use client";
import {useState} from "react";
import {useSearchParams,useRouter} from "next/navigation";
import type {OrderRow} from "@/lib/data/types";
import {ORDER_STATUS_TABS,orderMatchesKind,type OrderKind,type OrderManagementTab} from "@/lib/order-management";
import OrdersManager from "./OrdersManager";
import ReturnsManager from "../returns/ReturnsManager";
import ManualOrderDialog from "./ManualOrderDialog";
import styles from "./OrdersManager.module.css";
export default function OrdersWorkspace({initialOrders,error}:{initialOrders:OrderRow[];error?:string|null}){
 const params=useSearchParams();const router=useRouter();const [manual,setManual]=useState(false);
 const kind:OrderKind=params.get('kind')==='custom'?'custom':'parts';
 const raw=params.get('tab');const tab:OrderManagementTab=ORDER_STATUS_TABS.find(([key])=>key===raw)?.[0]??'all';
 function select(nextKind:OrderKind,nextTab:OrderManagementTab){router.replace('/admin/orders?'+new URLSearchParams({kind:nextKind,tab:nextTab}),{scroll:false});}
 return <><div className={styles.workspaceTop}><div className={styles.kindSwitch} role="group" aria-label="Order type">{([['parts','Parts'],['custom','Custom Bikes']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={kind===key} onClick={()=>select(key,tab)}>{label}</button>)}</div><button type="button" className={styles.manualButton} onClick={()=>setManual(true)}>＋ Manual order</button></div>
 <div className={styles.statusFilters} role="group" aria-label="Filter orders by status">{ORDER_STATUS_TABS.map(([key,label])=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>select(kind,key)}>{label}</button>)}</div>
 {tab==='returns'?<ReturnsManager key={kind} kind={kind}/>:<><p className={styles.workspaceHint}>Online orders and in-store sales are grouped by placement date (Philippine time). Mark online orders Completed only after delivery.</p><OrdersManager key={kind} initialOrders={initialOrders.filter(o=>orderMatchesKind(o,kind))} error={error} activeTab={tab}/></>}
 {manual?<ManualOrderDialog kind={kind} onClose={()=>setManual(false)} onSaved={()=>{setManual(false);select(kind,'completed');router.refresh();}}/>:null}
 </>;
}
