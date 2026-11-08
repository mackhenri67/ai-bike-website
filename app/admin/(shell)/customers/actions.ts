"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { deleteCustomer } from "@/lib/data/admin/customers";

export async function deleteCustomerAction(
  id: string,
): Promise<{ error: string | null }> {
  await requireAdmin();

  const result = await deleteCustomer(id);
  if (result.error) return { error: result.error };

  revalidatePath("/admin/customers");
  revalidatePath("/admin/dashboard");

  return { error: null };
}
