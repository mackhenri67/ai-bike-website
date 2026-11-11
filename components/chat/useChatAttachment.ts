"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {CHAT_IMAGE_LIMIT,CHAT_IMAGE_TYPES} from "@/lib/chat/images";
export function useChatAttachment(endpoint:string){
 const [preview,setPreview]=useState<string|null>(null),[name,setName]=useState(""),[imageId,setImageId]=useState<string|null>(null),[uploading,setUploading]=useState(false),[error,setError]=useState<string|null>(null);
 const draft=useRef<{file:File;id:string;version:number}|null>(null),version=useRef(0),active=useRef(true),sending=useRef(false);
 const discard=useCallback(async(id:string)=>{try{await fetch(endpoint,{method:"DELETE",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({image_id:id})});}catch{/* Files remain private if cleanup needs to be retried. */}},[endpoint]);
 useEffect(()=>{active.current=true;return()=>{active.current=false;if(draft.current&&!sending.current)void discard(draft.current.id);};},[discard]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 const upload=async(item:NonNullable<typeof draft.current>)=>{
  if(active.current){setUploading(true);setError(null);}const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  try{const form=new FormData();form.set("file",item.file);form.set("image_id",item.id);const response=await fetch(endpoint,{method:"POST",credentials:"same-origin",body:form,signal:controller.signal});const result=await response.json();if(!response.ok)throw new Error(result.error||"Image upload failed. Please try again.");if(!active.current||item.version!==version.current){void discard(item.id);return;}setImageId(result.id);}
  catch(e){if(active.current&&item.version===version.current)setError(controller.signal.aborted?"Image upload timed out. Please retry.":e instanceof Error?e.message:"Image upload failed.");else void discard(item.id);}
  finally{clearTimeout(timeout);if(active.current&&item.version===version.current)setUploading(false);}
 };
 const clear=(remove:boolean)=>{if(remove&&draft.current)void discard(draft.current.id);++version.current;draft.current=null;if(active.current){setImageId(null);setPreview(null);setName("");setUploading(false);setError(null);}};
 const choose=(file:File)=>{if(sending.current)return;if(!CHAT_IMAGE_TYPES.includes(file.type)||!file.size||file.size>CHAT_IMAGE_LIMIT){clear(true);setError("Choose a PNG, JPG or WebP image up to 3MB.");return;}clear(true);const item={file,id:crypto.randomUUID(),version:++version.current};draft.current=item;setName(file.name);setPreview(URL.createObjectURL(file));void upload(item);};
 return{preview,name,imageId,uploading,error,choose,remove:()=>clear(true),retry:()=>{if(draft.current&&!uploading)void upload(draft.current);},beginSend:()=>{sending.current=true;},sent:()=>{sending.current=false;clear(false);},failed:()=>{sending.current=false;if(!active.current&&draft.current)void discard(draft.current.id);}};
}
