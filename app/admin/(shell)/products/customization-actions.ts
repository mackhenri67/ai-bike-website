"use server";
import {requireAdmin} from "@/lib/auth/guards";
import {getAdminClient} from "@/lib/supabase/admin";
import {revalidatePath} from "next/cache";
import type {CategoryAxis} from "@/components/admin/products/categoryConfig";
import type {RetailerReference} from "@/components/admin/products/retailer-options";
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
function refresh(){for(const p of ['/admin/products','/products','/custom-bike-builder'])revalidatePath(p);}
export async function saveCategoryCustomization(id:string,axes:CategoryAxis[]){
 await requireAdmin();
 if(!uuid(id)||!Array.isArray(axes)||axes.length>10||axes.some(a=>!a||typeof a.flag!=='string'||!a.flag.trim()||a.flag.length>80||typeof a.label!=='string'||!a.label.trim()||a.label.length>80||!Array.isArray(a.presets)||a.presets.length>100||a.presets.some(v=>typeof v!=='string'||!v.trim()||v.length>150))||new Set(axes.map(a=>a.flag)).size!==axes.length||new Set(axes.map(a=>a.label)).size!==axes.length)return{error:'Use unique field names and valid suggested values (up to 10 fields).'};
 const db=getAdminClient();if(!db)return{error:'Database connection unavailable.'};
 const prior=await db.from('categories').select('customization_axes').eq('id',id).single();if(prior.error)return{error:'Run migration 0019 before editing customization settings.'};
 const old=(prior.data.customization_axes??[]) as CategoryAxis[];
 if(axes.some(a=>old.some(o=>o.flag===a.flag&&o.label!==a.label)))return{error:'Existing field labels are locked to preserve saved combinations. Add a new field instead.'};
 const clean=axes.map(a=>({flag:a.flag,field:a.flag,label:a.label.trim(),hint:'Enable only for products that offer this choice.',presets:[...new Set(a.presets.map(v=>v.trim()))],placeholder:'Add value'}));
 const {error}=await db.from('categories').update({customization_axes:clean}).eq('id',id);if(error)return{error:'Category fields could not be saved.'};refresh();return{error:null};
}
export async function saveRetailerReference(productId:string,reference:RetailerReference){
 await requireAdmin();
 if(!uuid(productId)||!reference||JSON.stringify(reference).length>100000||typeof reference.sourceTitle!=='string'||!reference.sourceTitle.trim()||typeof reference.sourceUrl!=='string'||!Array.isArray(reference.options)||reference.options.length>10||!Array.isArray(reference.combinations)||reference.combinations.length>200)return{error:'Invalid retailer reference.'};
 try{if(new URL(reference.sourceUrl).protocol!=='https:')throw new Error();}catch{return{error:'Use an HTTPS retailer source link.'};}
 const names=reference.options.map(o=>o.name);
 if(new Set(names).size!==names.length||reference.options.some(o=>typeof o.name!=='string'||!o.name.trim()||o.name.length>80||!Array.isArray(o.values)||o.values.length>100||o.values.some(v=>typeof v!=='string'||!v.trim()||v.length>150))||reference.combinations.some(row=>!row||Array.isArray(row)||typeof row!=='object'||Object.keys(row).length!==names.length||reference.options.some(o=>!o.values.includes(row[o.name]))))return{error:'Each combination must contain one listed value for every field.'};
 const db=getAdminClient();if(!db)return{error:'Database connection unavailable.'};
 const product=await db.from('products').select('name,slug').eq('id',productId).single();if(product.error)return{error:'Product not found.'};
 const {error}=await db.from('product_option_references').upsert({product_id:productId,reference:{...reference,name:product.data.name,slug:product.data.slug},updated_at:new Date().toISOString()});if(error)return{error:'Reference could not be saved. Check migration 0019.'};refresh();return{error:null};
}
