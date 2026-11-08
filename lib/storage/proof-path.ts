export const PAYMENT_PROOFS_BUCKET = "payment-proofs";
export function isOwnProofPath(path: string, userId: string): boolean {
  return (
    path.startsWith(userId + "/") &&
    path.length < 600 &&
    !path.includes("..") &&
    !path.includes("://")
  );
}
