// Run after migration 0012. Default: inspect only. --apply copies receipts into
// private storage, updates their references, then archives/removes old public copies.
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
for (const name of [".env.local", ".env"])
  if (existsSync(name)) process.loadEnvFile(name);
const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  process.stderr.write(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your existing .env first.\n",
  );
  process.exit(1);
}
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const oldPrefix = url + "/storage/v1/object/public/images/";
async function rows(table, fields) {
  const out = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await client
      .from(table)
      .select(fields)
      .range(offset, offset + 199);
    if (error)
      throw new Error(`Cannot read ${table}. Apply SQL migration 0012 first.`);
    out.push(...(data ?? []));
    if (!data || data.length < 200) return out;
  }
}
async function owner(kind, id) {
  let customerId;
  if (kind === "order") {
    const { data: payment, error } = await client
      .from("gcash_payments")
      .select("order_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!payment) return null;
    const { data: order, error: orderError } = await client
      .from("orders")
      .select("customer_id")
      .eq("id", payment.order_id)
      .maybeSingle();
    if (orderError) throw orderError;
    customerId = order?.customer_id;
  } else {
    const { data, error } = await client
      .from("event_registrations")
      .select("customer_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    customerId = data?.customer_id;
  }
  if (!customerId) return null;
  const { data, error } = await client
    .from("customers")
    .select("auth_user_id")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data?.auth_user_id ?? null;
}
function sourcePath(value) {
  if (typeof value !== "string" || !value.startsWith(oldPrefix)) return null;
  const parsed = new URL(value);
  const prefixPath = new URL(oldPrefix).pathname;
  return decodeURIComponent(parsed.pathname.slice(prefixPath.length));
}
async function copyPrivate(source, target) {
  const { data: blob, error } = await client.storage
    .from("images")
    .download(source);
  if (error || !blob)
    throw new Error(
      "Cannot download an old proof. Check that the original object still exists.",
    );
  let mime = blob.type.split(";")[0];
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime))
    mime = /\.png$/i.test(source)
      ? "image/png"
      : /\.webp$/i.test(source)
        ? "image/webp"
        : "image/jpeg";
  const { error: uploadError } = await client.storage
    .from("payment-proofs")
    .upload(target, blob, {
      contentType: mime,
      upsert: true,
      cacheControl: "0",
    });
  if (uploadError)
    throw new Error(
      "Private upload failed. Check the payment-proofs bucket and 10MB limit.",
    );
}
async function listOldObjects(prefix = "gcash-proofs", depth = 0) {
  if (depth > 12)
    throw new Error(
      "Unexpected nesting in the legacy proof folder. Review it manually.",
    );
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.from("images").list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error("Cannot list the old gcash-proofs folder.");
    for (const f of data ?? []) {
      if (!f.name || f.name === "." || f.name === "..") continue;
      const p = prefix + "/" + f.name;
      if (!f.id && !f.metadata)
        out.push(...(await listOldObjects(p, depth + 1)));
      else out.push(p);
    }
    if (!data || data.length < 100) return out;
  }
}
async function main() {
  const payments = await rows("gcash_payments", "id,screenshot_url");
  const events = await rows("event_registrations", "id,proof_screenshot_url");
  const history = await rows(
    "payment_submission_history",
    "id,source_kind,source_id,previous_submission",
  );
  const jobs = [];
  for (const p of payments)
    if (sourcePath(p.screenshot_url))
      jobs.push({
        kind: "order",
        id: p.id,
        value: p.screenshot_url,
        table: "gcash_payments",
        field: "screenshot_url",
      });
  for (const r of events)
    if (sourcePath(r.proof_screenshot_url))
      jobs.push({
        kind: "event",
        id: r.id,
        value: r.proof_screenshot_url,
        table: "event_registrations",
        field: "proof_screenshot_url",
      });
  for (const h of history) {
    const field =
      h.source_kind === "order" ? "screenshot_url" : "proof_screenshot_url";
    const value = h.previous_submission?.[field];
    if (sourcePath(value))
      jobs.push({
        kind: h.source_kind,
        id: h.id,
        ownerId: h.source_id,
        value,
        table: "payment_submission_history",
        field,
        snapshot: h.previous_submission,
      });
  }
  const oldObjects = await listOldObjects();
  process.stdout.write(
    `${apply ? "APPLY" : "DRY RUN"}: ${jobs.length} database references and ${oldObjects.length} old public proof objects.\n`,
  );
  if (!apply) {
    process.stdout.write(
      "No files or records changed. Run with --apply after applying SQL 0012.\n",
    );
    return;
  }
  let failures = 0,
    updated = 0;
  for (const job of jobs) {
    try {
      const userId = await owner(job.kind, job.ownerId ?? job.id);
      const source = sourcePath(job.value);
      const hash = createHash("sha256")
        .update(source)
        .digest("hex")
        .slice(0, 24);
      const target = `${userId ?? "admin-archive"}/legacy/${job.table}/${job.id}/${hash}`;
      await copyPrivate(source, target);
      let result;
      if (job.snapshot) {
        result = await client
          .from(job.table)
          .update({
            previous_submission: { ...job.snapshot, [job.field]: target },
          })
          .eq("id", job.id)
          .select("id");
      } else {
        result = await client
          .from(job.table)
          .update({ [job.field]: target })
          .eq("id", job.id)
          .eq(job.field, job.value)
          .select("id");
      }
      if (result.error || result.data?.length !== 1)
        throw new Error(
          "Database reference changed or could not be updated. Retry with the website stopped.",
        );
      updated++;
    } catch (e) {
      failures++;
      process.stderr.write(`Record ${job.table}/${job.id}: ${e.message}\n`);
    }
  }
  if (failures) {
    process.stderr.write(
      `${failures} records need review. Public copies were kept so nothing is lost. Fix the reported records and rerun --apply before deployment.\n`,
    );
    process.exitCode = 1;
    return;
  }
  // Preserve even unsubmitted/orphaned old receipts in an admin-only private folder.
  let archived = 0;
  for (const source of oldObjects) {
    try {
      const hash = createHash("sha256").update(source).digest("hex");
      await copyPrivate(source, `admin-archive/old-public-proofs/${hash}`);
      const { error } = await client.storage.from("images").remove([source]);
      if (error) throw new Error("Could not remove an old public copy.");
      archived++;
    } catch (e) {
      failures++;
      process.stderr.write(
        `Legacy object ${createHash("sha256").update(source).digest("hex").slice(0, 12)}: ${e.message}\n`,
      );
    }
  }
  process.stdout.write(
    `Updated ${updated} records; privately archived and removed ${archived} public proof objects.\n`,
  );
  if (failures) {
    process.stderr.write(
      "Some public copies remain. Rerun --apply after resolving the errors.\n",
    );
    process.exitCode = 1;
  }
}
main().catch((e) => {
  process.stderr.write(`Migration stopped: ${e.message}\n`);
  process.exitCode = 1;
});
