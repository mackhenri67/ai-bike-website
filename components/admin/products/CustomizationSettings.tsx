"use client";
import RetailerReferenceEditor from "./RetailerReferenceEditor";
import {useState} from "react";
import {useRouter} from "next/navigation";
import type {CategoryRow} from "@/lib/data/types";
import type {CategoryAxis} from "./categoryConfig";
import type {RetailerReference} from "./retailer-options";
import {saveCategoryCustomization} from "@/app/admin/(shell)/products/customization-actions";
export default function CustomizationSettings({categories,references,products}:{categories:CategoryRow[];references:RetailerReference[];products:{id:string;name:string;slug:string}[]}){
 const router=useRouter();const[selected,setSelected]=useState(categories[0]?.id??'');const[axes,setAxes]=useState<CategoryAxis[]>(categories[0]?.customization_axes??[]);const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');
 const finish=(error:string|null)=>{setMessage(error??'Saved to Supabase. Reopen the product editor to use the updated fields.');setBusy(false);if(!error)router.refresh();};
 return <details style={{marginBottom:24,padding:16,background:'white',border:'1px solid #ddd',borderRadius:8}}><summary>Manage customization fields and source references</summary>
 <p>These settings are saved in Supabase. Product combinations and their stock are edited separately in Edit Product.</p>
 <label>Category <select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setAxes(categories.find(c=>c.id===e.target.value)?.customization_axes??[]);setMessage('');}}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 {axes.map((axis,index)=><div key={axis.flag} style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}><label>Field name <input aria-label={`Field ${index+1} name`} value={axis.label} readOnly={(categories.find(c=>c.id===selected)?.customization_axes??[]).some(a=>a.flag===axis.flag)} onChange={e=>setAxes(axes.map((a,i)=>i===index?{...a,label:e.target.value}:a))}/></label><label>Suggested values (one per line)<textarea aria-label={`Field ${index+1} suggested values`} value={axis.presets.join('\n')} onChange={e=>setAxes(axes.map((a,i)=>i===index?{...a,presets:e.target.value.split('\n')}:a))}/></label><button type="button" disabled={busy} onClick={()=>setAxes(axes.filter((_,i)=>i!==index))}>Remove field</button></div>)}
 <p>Existing field names are locked so saved product combinations keep working. Removing a template field does not delete existing product combinations.</p>
 <button type="button" disabled={busy||axes.length>=10} onClick={()=>{const flag='custom_'+crypto.randomUUID();setAxes([...axes,{flag,field:flag,label:'',hint:'Product option',presets:[],placeholder:'Add value'}]);}}>Add field</button>{' '}
 <button type="button" disabled={busy||!selected} onClick={async()=>{setBusy(true);try{const r=await saveCategoryCustomization(selected,axes.map(a=>({...a,presets:a.presets.map(v=>v.trim()).filter(Boolean)})));finish(r.error);}catch{finish('Could not save. Check your admin session and try again.');}}}>Save category fields</button>
 <RetailerReferenceEditor products={products} references={references}/>
 <p role="status">{message}</p></details>;
}
