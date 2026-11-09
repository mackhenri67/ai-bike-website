/** Display label only: never changes stored payment verification or COD records. */
export function accountPaymentLabel(order: {status:string;payment_status:string}): string {
  if (order.status === "shipping" || order.status === "completed") return "Completed";
  return ({paid:"Completed",pending:"Pending verification",rejected:"Rejected",refunded:"Refunded",failed:"Failed"} as Record<string,string>)[order.payment_status] ?? order.payment_status;
}
