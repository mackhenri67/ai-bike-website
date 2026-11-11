export const CHAT_IMAGE_LIMIT = 3 * 1024 * 1024;
export const CHAT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export function chatImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "image/webp";
  return null;
}
export const chatImageUrl = (id: string, role: "customer" | "admin") => role === "admin" ? `/api/admin/chat-images/${encodeURIComponent(id)}` : `/api/chat/images/${encodeURIComponent(id)}`;
