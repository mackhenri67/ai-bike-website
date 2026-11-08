"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { updateGcashSettings } from "@/lib/data/admin/gcash";

export type SaveGcashSettingsState = {
  error: string | null;
  saved: boolean;
};

const PHONE_RE = /^(\+?63|0)9\d{9}$/;

/**
 * Server Action: persists the merchant GCash number and QR code. The QR image
 * is uploaded straight to the public `images` storage bucket from the browser
 * (same pattern as the Products manager) and only the resulting URL is saved —
 * the merchant QR code is fully editable by the admin, never hardcoded.
 */
export async function saveGcashSettingsAction(
  prevState: SaveGcashSettingsState | undefined,
  formData: FormData,
): Promise<SaveGcashSettingsState> {
  await requireAdmin();

  const qrCodeUrl = String(formData.get("qr_code_url") ?? "").trim();
  const gcashNumber = String(formData.get("gcash_number") ?? "").trim();

  if (!gcashNumber) {
    return { error: "Please enter the merchant GCash number.", saved: false };
  }
  if (!PHONE_RE.test(gcashNumber.replace(/[\s\-()]/g, ""))) {
    return {
      error:
        "Please enter a valid Philippine mobile number (e.g. 0917 123 4567).",
      saved: false,
    };
  }

  if (qrCodeUrl) {
    const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
      /\/+$/,
      "",
    );
    if (
      !storageUrl ||
      !qrCodeUrl.startsWith(`${storageUrl}/storage/v1/object/public/images/`)
    ) {
      return {
        error: "The QR code image is not valid. Please upload it again.",
        saved: false,
      };
    }
  }

  const result = await updateGcashSettings({
    qrCodeUrl: qrCodeUrl || null,
    gcashNumber,
  });
  if (result.error) return { error: result.error, saved: false };

  revalidatePath("/admin/settings");
  return { error: null, saved: true };
}
