export const PRODUCTS_PER_PAGE=25;
export function paginateProducts<T>(items:T[],requested:unknown){
 const parsed=typeof requested==='string'&&/^[1-9][0-9]*$/.test(requested)?Number(requested):1;
 const pages=Math.max(1,Math.ceil(items.length/PRODUCTS_PER_PAGE));
 const page=Number.isSafeInteger(parsed)?Math.min(parsed,pages):1;
 return {items:items.slice((page-1)*PRODUCTS_PER_PAGE,page*PRODUCTS_PER_PAGE),page,pages,total:items.length};
}
export function productListingHref({category,q,sort,page=1}:{category?:string|null;q?:string;sort?:string;page?:number}){
 const params=new URLSearchParams();if(category)params.set('category',category);if(q)params.set('q',q);if(sort&&sort!=='featured')params.set('sort',sort);if(page>1)params.set('page',String(page));
 return '/products'+(params.size?'?'+params.toString():'');
}
