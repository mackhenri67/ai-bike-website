"use client";
import { getBrowserClient } from "@/lib/supabase/client";
import { isAdmin } from "@/lib/auth/roles";
export async function uploadPaymentProof(
  file: File,
  kind: "orders" | "events",
  reference: string,
): Promise<string> {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("Choose a PNG, JPG or WebP image up to 10MB.");
  const client = getBrowserClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user || isAdmin(user))
    throw new Error("Sign in with a customer account before uploading.");
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const path = `${user.id}/${kind}/${reference.replace(/[^a-zA-Z0-9-]/g, "")}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await client.storage
    .from("payment-proofs")
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "0",
    });
  if (error)
    throw new Error(
      "The screenshot could not be uploaded. Check your login and the payment-proofs bucket.",
    );
  return data.path;
}
