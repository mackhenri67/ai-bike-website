export const PAYMENT_PROOFS_BUCKET = "payment-proofs";
export function isOwnProofPath(path: string, userId: string): boolean {
  return (
    path.startsWith(userId + "/") &&
    path.length < 600 &&
    !path.includes("..") &&
    !path.includes("://")
  );
}

/** Only a new upload in this registration's private folder can be submitted.
 * Public event banners and another registration/order's proof are not valid. */
export function isEventProofPath(path: string, userId: string, code: string): boolean {
  const reference = code.replace(/[^a-zA-Z0-9-]/g, "");
  const prefix = `${userId}/events/${reference}/`;
  return (
    reference.length > 0 &&
    isOwnProofPath(path, userId) &&
    path.startsWith(prefix) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/i.test(path.slice(prefix.length))
  );
}
