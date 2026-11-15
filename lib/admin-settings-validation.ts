export function parseShippingFee(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,6}(\.\d{1,2})?$/.test(value.trim())) return null;
  const fee = Number(value.trim());
  return Number.isFinite(fee) && fee >= 0 && fee <= 100000 ? fee : null;
}
export function passwordValidation(current: unknown, next: unknown, confirm: unknown): string | null {
  if (typeof current !== "string" || !current || typeof next !== "string" || typeof confirm !== "string") return "Complete all password fields.";
  if (next.length < 8 || next.length > 128) return "Use a new password with 8 to 128 characters.";
  if (next !== confirm) return "The new passwords do not match.";
  if (current === next) return "Choose a different new password.";
  return null;
}
