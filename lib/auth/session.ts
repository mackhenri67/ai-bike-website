export type SessionArea = "customer" | "admin";
export const SESSION_COOKIES: Record<SessionArea, string> = {
  customer: "lnr-customer-auth",
  admin: "lnr-admin-auth",
};
