"use client";
import SharedGcashPayment, { type PaymentDetails } from "@/components/customer/SharedGcashPayment";
import type { GcashSettingsRow } from "@/lib/data/types";
import { submitEventGcashPaymentAction } from "./action";
type Props = {
 registrationCode:string;eventTitle:string;amount:number;settings:GcashSettingsRow|null;
 paymentStatus?:string;submittedProof?:string|null;rejectionReason?:string|null;paymentReference?:string|null;
 senderName?:string|null;phoneNumber?:string|null;
};
export default function EventPaymentView(props: Props) {
 const payment: PaymentDetails|null = props.submittedProof || props.paymentStatus === "paid" || props.paymentStatus === "rejected" ? {
   status: props.paymentStatus === "paid" ? "paid" : props.paymentStatus === "rejected" ? "rejected" : "pending",
   screenshot_url: props.submittedProof || "",sender_name:props.senderName || "Not supplied",phone_number:props.phoneNumber || "Not supplied",reference_number:props.paymentReference || null,rejection_reason:props.rejectionReason || null,
 } : null;
 return <SharedGcashPayment key={props.registrationCode} context={{kind:"event",code:props.registrationCode,title:props.eventTitle}} submitAction={submitEventGcashPaymentAction}
   order={{id:props.registrationCode,orderNumber:props.registrationCode,total:props.amount,paymentStatus:props.paymentStatus || "pending"}}
   settings={{qrCodeUrl:props.settings?.qr_code_url || null,gcashNumber:props.settings?.gcash_number || null}} payment={payment}/>;
}
