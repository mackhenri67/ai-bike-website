import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function LegacyTicketLink({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/profile?tab=events&ticket=${encodeURIComponent(code)}`);
}
