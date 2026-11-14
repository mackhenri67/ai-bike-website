export async function returnFetch<T>(url:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch(url,{method:body?"POST":"GET",cache:"no-store",credentials:"same-origin",signal,...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result)throw new Error(result?.error??"The request could not be completed.");
 return result as T;
}
