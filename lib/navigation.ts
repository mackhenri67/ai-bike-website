/** Accept a local destination without allowing backslash/control-character redirects. */
export function sanitizeNext(
  value: string | null | undefined,
  fallback = "/checkout",
): string {
  const candidate = (value ?? "").trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  )
    return fallback;
  try {
    const url = new URL(candidate, "https://lnr.invalid");
    return url.origin === "https://lnr.invalid"
      ? url.pathname + url.search + url.hash
      : fallback;
  } catch {
    return fallback;
  }
}
