export const RETURN_BUCKET="return-evidence";
export const RETURN_MIME_TYPES=["image/jpeg","image/png","image/webp","video/mp4","video/webm","video/quicktime"] as const;
export const RETURN_LABELS={pending:"Awaiting admin review",approved:"Approved — choose return method",rejected:"Request rejected",return_selected:"Return method selected",received:"Returned item received",refunded:"Refund recorded"} as const;
export type ReturnStatus=keyof typeof RETURN_LABELS;
export type ReturnEvidence={id:string;mime_type:string;file_name:string;byte_size:number};
export type ReturnRecord={
 id:string;order_id:string;order_item_id:string;customer_id:string;reason:string;status:ReturnStatus;
 return_method:"rider_pickup"|"store_dropoff"|null;pickup_details:string|null;review_note:string|null;
 reviewed_at:string|null;refund_reference:string|null;created_at:string;updated_at:string;
 evidence:ReturnEvidence[];events?:{status:string;note:string|null;created_at:string;actor_role:string}[];
 order?:{order_number:string;customer_name:string;customer_phone:string|null;shipping_address:string|null;completed_at:string|null};
 item?:{product_name:string;quantity:number;line_total:number;size:string|null;color:string|null};
};
export type ReturnContext={eligible:boolean;completed_at:string|null;deadline:string|null;order_status:string;product_name:string;quantity:number;item_value:number;requests:ReturnRecord[]};
export const returnEvidenceUrl=(id:string,admin=false)=>"/api/returns/evidence/"+encodeURIComponent(id)+(admin?"?admin=1":"");
