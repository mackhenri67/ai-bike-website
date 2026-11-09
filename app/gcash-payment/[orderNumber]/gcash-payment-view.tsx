"use client";
import SharedGcashPayment, { type SharedGcashPaymentProps } from "@/components/customer/SharedGcashPayment";
import { submitGcashPaymentAction } from "./actions";
export default function GcashPaymentView(props: Omit<SharedGcashPaymentProps, "submitAction" | "context">) {
  return <SharedGcashPayment key={props.order.id} {...props} submitAction={submitGcashPaymentAction}/>;
}
