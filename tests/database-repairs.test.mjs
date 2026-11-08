import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { before, beforeEach, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let db;
const admin = "10000000-0000-4000-8000-000000000001",
  a = "10000000-0000-4000-8000-000000000002",
  b = "10000000-0000-4000-8000-000000000003";
const ca = "20000000-0000-4000-8000-000000000001",
  cb = "20000000-0000-4000-8000-000000000002";
const product = "30000000-0000-4000-8000-000000000001",
  variant = "40000000-0000-4000-8000-000000000001",
  event = "50000000-0000-4000-8000-000000000001";
const query = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) =>
  Object.values((await query(sql, args)).rows[0])[0];
const place = (
  items = [
    { productId: product, quantity: 5, size: "One Size", color: "Default" },
  ],
  method = "cod",
) =>
  scalar("select public.lnr_place_order($1,$2::jsonb,$3)", [
    a,
    JSON.stringify(items),
    method,
  ]);
const orderId = () => scalar("select id from public.orders limit 1");
const stock = () =>
  scalar("select stock from public.products where id=$1", [product]);
const cancel = async (id) =>
  query("select public.lnr_set_order_status($1,'cancelled',$2,null)", [
    id,
    admin,
  ]);
const register = (user = a) =>
  scalar("select public.lnr_register_event($1,$2,'Rider',null,'Open')", [
    user,
    event,
  ]);
const proof = async (user = a) => {
  const p = `${user}/orders/mock.jpg`;
  await query(
    "insert into storage.objects(bucket_id,name)values('payment-proofs',$1) on conflict do nothing",
    [p],
  );
  return p;
};
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}');
 create function auth.jwt()returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid()returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb default '{}',unique(bucket_id,name));
 alter table storage.objects enable row level security;
 create function storage.foldername(name text)returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
 grant select on storage.buckets to anon,authenticated,service_role;
 alter default privileges in schema public grant all on tables to service_role;
 alter default privileges in schema public grant usage,select on sequences to service_role;`);
  for (const f of [
    "0001_admin_schema.sql",
    "0002_rls_and_storage.sql",
    "0003_seed_catalog.sql",
    "0004_seed_media.sql",
    "0005_seed_customers_orders.sql",
    "0006_customer_accounts.sql",
    "0007_customer_carts.sql",
    "0008_gcash_payments.sql",
    "0009_events_registrations.sql",
    "0010_bike_builder.sql",
    "0011_seed_builder_categories.sql",
    "0012_complete_repairs.sql",
  ]) {
    try {
      await db.exec(
        readFileSync(path.join(root, "supabase/migrations", f), "utf8"),
      );
    } catch (e) {
      throw new Error(`Migration ${f}: ${e.message}`);
    }
  }
  await query(
    "insert into auth.users(id,email,raw_app_meta_data)values($1,'admin@example.com','{\"role\":\"admin\"}'),($2,'a@example.com','{}'),($3,'b@example.com','{}')",
    [admin, a, b],
  );
});
beforeEach(async () => {
  await db.exec(
    "reset role;truncate public.customers,public.orders,public.products,public.events,public.payment_submission_history,public.order_number_counters,storage.objects cascade;",
  );
  await query(
    "insert into public.customers(id,auth_user_id,full_name,email)values($1,$2,'Customer A','a@example.com'),($3,$4,'Customer B','b@example.com')",
    [ca, a, cb, b],
  );
  await query(
    "insert into public.customer_locations(customer_id,address,latitude,longitude)values($1,'Test address',13,123)",
    [ca],
  );
  await query(
    "insert into public.products(id,name,slug,price,stock)values($1,'Wheel','wheel',100,5)",
    [product],
  );
  await query(
    "insert into public.events(id,event_code,slug,title,event_date,location,price,capacity,status)values($1,'EVT-TEST','test-event','Test Ride',now()+interval '30 days','Tabaco',100,1,'published')",
    [event],
  );
});
after(async () => {
  if (db) await db.close();
});
test("Ordering all stock then cancelling restores the original stock once", async () => {
  await place();
  assert.equal(await stock(), 0);
  const id = await orderId();
  await cancel(id);
  assert.equal(await stock(), 5);
  await cancel(id);
  assert.equal(await stock(), 5);
  assert.equal(
    await scalar(
      "select count(*) from public.order_status_history where status='cancelled'",
    ),
    1,
  );
});
test("Two cancellation requests cannot restore stock twice", async () => {
  await place();
  const id = await orderId();
  await Promise.all([cancel(id), cancel(id)]);
  assert.equal(await stock(), 5);
});
test("Cancelling a shipping order restores its reserved stock", async () => {
  await place();
  const id = await orderId();
  await query("select public.lnr_set_order_status($1,'shipping',$2,null)", [
    id,
    admin,
  ]);
  await cancel(id);
  assert.equal(await stock(), 5);
});
test("Cancelling a completed order restores stock when the admin explicitly cancels it", async () => {
  await place();
  const id = await orderId();
  await query("select public.lnr_set_order_status($1,'completed',$2,null)", [
    id,
    admin,
  ]);
  await cancel(id);
  assert.equal(await stock(), 5);
});
test("A cancelled order cannot be reopened without reserving inventory again", async () => {
  await place();
  const id = await orderId();
  await cancel(id);
  await assert.rejects(
    query("select public.lnr_set_order_status($1,'pending',$2,null)", [
      id,
      admin,
    ]),
    /cannot be reopened/,
  );
  assert.equal(await stock(), 5);
});
test("Variant stock and product stock both return on cancellation", async () => {
  await query(
    "insert into public.product_variants(id,product_id,size,color,price,stock)values($1,$2,'M','Black',125,5)",
    [variant, product],
  );
  const result = await place([
    { productId: product, quantity: 5, size: "M", color: "Black" },
  ]);
  assert.equal(Number(result.total), 815);
  assert.equal(
    await scalar("select stock from public.product_variants where id=$1", [
      variant,
    ]),
    0,
  );
  await cancel(await orderId());
  assert.equal(await stock(), 5);
  assert.equal(
    await scalar("select stock from public.product_variants where id=$1", [
      variant,
    ]),
    5,
  );
});
test("Duplicate cart lines cannot oversell stock", async () => {
  await assert.rejects(
    place([
      { productId: product, quantity: 4 },
      { productId: product, quantity: 4 },
    ]),
    /Not enough stock/,
  );
  assert.equal(await stock(), 5);
  assert.equal(await scalar("select count(*) from public.orders"), 0);
});
test("Competing orders cannot both buy the final stock", async () => {
  const r = await Promise.allSettled([place(), place()]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await stock(), 0);
  assert.equal(await scalar("select count(*) from public.orders"), 1);
});
test("Archived products and invented options are rejected", async () => {
  await query("update public.products set status='archived' where id=$1", [
    product,
  ]);
  await assert.rejects(place(), /no longer available/);
  await query("update public.products set status='active' where id=$1", [
    product,
  ]);
  await assert.rejects(
    place([{ productId: product, quantity: 1, size: "Invented" }]),
    /does not offer/,
  );
});
test("Unavailable variants and invalid combinations are rejected", async () => {
  await query(
    "insert into public.product_variants(id,product_id,size,color,price,stock,available)values($1,$2,'M','Black',125,5,false)",
    [variant, product],
  );
  await assert.rejects(
    place([{ productId: product, quantity: 1, size: "M", color: "Black" }]),
    /combination is unavailable/,
  );
  assert.equal(await stock(), 5);
});
test("A history failure rolls back order, items, counter and stock", async () => {
  await db.exec(
    `create function public.test_fail_history()returns trigger language plpgsql as $$begin raise exception 'Simulated history failure';end;$$;create trigger test_fail_history before insert on public.order_status_history for each row execute function public.test_fail_history();`,
  );
  try {
    await assert.rejects(place(), /Simulated history failure/);
    assert.equal(await stock(), 5);
    assert.equal(await scalar("select count(*) from public.orders"), 0);
    assert.equal(await scalar("select count(*) from public.order_items"), 0);
    assert.equal(
      await scalar("select count(*) from public.order_number_counters"),
      0,
    );
  } finally {
    await db.exec(
      "drop trigger test_fail_history on public.order_status_history;drop function public.test_fail_history();",
    );
  }
});
test("A failed stock restoration leaves the order uncancelled", async () => {
  await place();
  const id = await orderId();
  await db.exec(
    `create function public.test_fail_restore()returns trigger language plpgsql as $$begin if new.stock>old.stock then raise exception 'Simulated restore failure';end if;return new;end;$$;create trigger test_fail_restore before update on public.products for each row execute function public.test_fail_restore();`,
  );
  try {
    await assert.rejects(cancel(id), /Simulated restore failure/);
    assert.equal(await stock(), 0);
    assert.equal(
      await scalar("select status from public.orders where id=$1", [id]),
      "pending",
    );
  } finally {
    await db.exec(
      "drop trigger test_fail_restore on public.products;drop function public.test_fail_restore();",
    );
  }
});
test("Only an administrator can cancel an order", async () => {
  await place();
  await assert.rejects(
    query("select public.lnr_set_order_status($1,'cancelled',$2,null)", [
      await orderId(),
      b,
    ]),
    /Administrator access/,
  );
  assert.equal(await stock(), 0);
});
test("One remaining event slot accepts one customer", async () => {
  const r = await Promise.allSettled([register(a), register(b)]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    await scalar("select slots_booked from public.events where id=$1", [event]),
    1,
  );
});
test("Repeat registration returns the same ticket and occupies one slot", async () => {
  const r = await Promise.all([register(), register()]);
  assert.equal(r[0].registrationCode, r[1].registrationCode);
  assert.equal(
    await scalar("select count(*) from public.event_registrations"),
    1,
  );
});
test("Cancelling an event registration releases one slot exactly once", async () => {
  await register();
  const id = await scalar("select id from public.event_registrations limit 1");
  await query("select public.lnr_set_registration_status($1,'cancelled',$2)", [
    id,
    admin,
  ]);
  await query("select public.lnr_set_registration_status($1,'cancelled',$2)", [
    id,
    admin,
  ]);
  assert.equal(
    await scalar("select slots_booked from public.events where id=$1", [event]),
    0,
  );
  await register(b);
  assert.equal(
    await scalar("select slots_booked from public.events where id=$1", [event]),
    1,
  );
});
test("A cancelled registration cannot take a slot occupied by another rider", async () => {
  await register();
  const id = await scalar("select id from public.event_registrations limit 1");
  await query("select public.lnr_set_registration_status($1,'cancelled',$2)", [
    id,
    admin,
  ]);
  await register(b);
  await assert.rejects(
    query("select public.lnr_set_registration_status($1,'registered',$2)", [
      id,
      admin,
    ]),
    /fully booked/,
  );
});
test("Event payment ownership, reference saving and paid status are protected", async () => {
  const reg = await register();
  const p = await proof();
  await assert.rejects(
    query(
      "select public.lnr_submit_event_payment($1,$2,'Sender','09171234567','REF',$3)",
      [b, reg.registrationCode, await proof(b)],
    ),
    /not available for your account/,
  );
  await query(
    "select public.lnr_submit_event_payment($1,$2,'Sender','09171234567','REF-123',$3)",
    [a, reg.registrationCode, p],
  );
  assert.equal(
    await scalar(
      "select reference_number from public.event_registrations limit 1",
    ),
    "REF-123",
  );
  assert.equal(
    await scalar(
      "select customer_name from public.event_registrations limit 1",
    ),
    "Customer A",
  );
  const id = await scalar("select id from public.event_registrations limit 1");
  await query("select public.lnr_review_event_payment($1,'paid',$2,null)", [
    id,
    admin,
  ]);
  await assert.rejects(
    query(
      "select public.lnr_submit_event_payment($1,$2,'Sender','09171234567','NEW',$3)",
      [a, reg.registrationCode, p],
    ),
    /cannot be changed/,
  );
});
test("Rejected order payment can be resubmitted with audit history", async () => {
  await place(undefined, "gcash");
  const id = await orderId();
  const p = await proof();
  await query(
    "select public.lnr_submit_order_payment($1,$2,'Sender','09171234567','REF',$3)",
    [a, id, p],
  );
  await query(
    "select public.lnr_review_order_payment($1,'rejected',$2,'Blurry proof')",
    [id, admin],
  );
  await query(
    "select public.lnr_submit_order_payment($1,$2,'Sender','09171234567','NEW-REF',$3)",
    [a, id, p],
  );
  assert.equal(
    await scalar("select payment_status from public.orders limit 1"),
    "pending",
  );
  assert.equal(
    await scalar("select count(*) from public.payment_submission_history"),
    1,
  );
});
test("Another customer cannot submit payment for an order", async () => {
  await place(undefined, "gcash");
  await assert.rejects(
    query(
      "select public.lnr_submit_order_payment($1,$2,'Sender','09171234567','REF',$3)",
      [b, await orderId(), await proof(b)],
    ),
    /not available for your account/,
  );
});
test("A missing or other-owner proof object is rejected", async () => {
  await place(undefined, "gcash");
  const id = await orderId();
  await assert.rejects(
    query(
      "select public.lnr_submit_order_payment($1,$2,'Sender','09171234567','REF',$3)",
      [a, id, `${a}/missing.png`],
    ),
    /not found/,
  );
  await assert.rejects(
    query(
      "select public.lnr_submit_order_payment($1,$2,'Sender','09171234567','REF',$3)",
      [a, id, await proof(b)],
    ),
    /own account/,
  );
});
async function asRole(user, role, fn) {
  await query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: user,
      app_metadata: { role: role === "admin" ? "admin" : "customer" },
    }),
  ]);
  await db.exec(role === "anon" ? "set role anon" : "set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
test("Private proof policies allow owner/admin and deny another customer/anonymous", async () => {
  const p = await proof();
  const count = () =>
    scalar(
      "select count(*) from storage.objects where bucket_id='payment-proofs' and name=$1",
      [p],
    );
  assert.equal(await asRole(a, "customer", count), 1);
  assert.equal(await asRole(b, "customer", count), 0);
  assert.equal(await asRole(admin, "admin", count), 1);
  assert.equal(await asRole("", "anon", count), 0);
});
test("Customer cannot change public images or upload into another customer folder", async () => {
  await assert.rejects(
    asRole(a, "customer", () =>
      query(
        "insert into storage.objects(bucket_id,name)values('images','bad.png')",
      ),
    ),
    /row-level security/,
  );
  await assert.rejects(
    asRole(a, "customer", () =>
      query(
        "insert into storage.objects(bucket_id,name)values('payment-proofs',$1)",
        [`${b}/bad.png`],
      ),
    ),
    /row-level security/,
  );
});
test("Browsers cannot invoke service-role-only checkout/cancellation RPCs", async () => {
  await assert.rejects(
    asRole(a, "customer", () => place()),
    /permission denied/,
  );
  await assert.rejects(
    asRole(a, "customer", () =>
      query("select public.lnr_set_order_status($1,'cancelled',$2,null)", [
        product,
        admin,
      ]),
    ),
    /permission denied/,
  );
});

test("An old cancelled order can be repaired once without double restoration", async () => {
  await place();
  const id = await orderId();
  await query("update public.orders set status='cancelled' where id=$1", [id]);
  assert.equal(await stock(), 0);
  await query("select public.lnr_restore_old_cancelled_stock($1,$2)", [
    id,
    admin,
  ]);
  assert.equal(await stock(), 5);
  await query("select public.lnr_restore_old_cancelled_stock($1,$2)", [
    id,
    admin,
  ]);
  assert.equal(await stock(), 5);
});
test("The old-order repair does not restore a newly cancelled order twice", async () => {
  await place();
  const id = await orderId();
  await cancel(id);
  await query("select public.lnr_restore_old_cancelled_stock($1,$2)", [
    id,
    admin,
  ]);
  assert.equal(await stock(), 5);
});
test("Restrictive bucket guards still deny access if an older broad policy exists", async () => {
  await db.exec(
    "create policy test_broad_storage on storage.objects for all to anon,authenticated using(true) with check(true)",
  );
  try {
    const p = await proof();
    assert.equal(
      await asRole(b, "customer", () =>
        scalar("select count(*) from storage.objects where name=$1", [p]),
      ),
      0,
    );
    await assert.rejects(
      asRole(a, "customer", () =>
        query(
          "insert into storage.objects(bucket_id,name)values('images','blocked.png')",
        ),
      ),
      /row-level security/,
    );
    assert.equal(
      await asRole(a, "customer", () =>
        scalar(
          "with deleted as(delete from storage.objects where name=$1 returning id)select count(*) from deleted",
          [p],
        ),
      ),
      0,
    );
  } finally {
    await db.exec("drop policy test_broad_storage on storage.objects");
  }
});
