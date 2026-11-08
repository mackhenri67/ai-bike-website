import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
const { NextRequest } = nodeRequire("next/server");
function loader(mocks = {}, fallback = () => undefined) {
  const cache = new Map();
  function load(filename) {
    const full = path.resolve(root, filename);
    if (cache.has(full)) return cache.get(full).exports;
    const unit = { exports: {} };
    cache.set(full, unit);
    const code = ts.transpileModule(readFileSync(full, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: full,
    }).outputText;
    function localRequire(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === "server-only") return {};
      const replacement = fallback(id);
      if (replacement !== undefined) return replacement;
      if (id.startsWith("@/") || id.startsWith(".")) {
        const base = id.startsWith("@/")
          ? path.join(root, id.slice(2))
          : path.resolve(path.dirname(full), id);
        const found = [base, base + ".ts", base + ".tsx"].find(existsSync);
        if (!found) throw new Error("Unresolved " + id);
        return load(found);
      }
      return nodeRequire(id);
    }
    vm.runInThisContext(
      "(function(exports,require,module){\n" + code + "\n})",
      { filename: full },
    )(unit.exports, localRequire, unit);
    return unit.exports;
  }
  return load;
}
const customer = {
  id: "customer-a",
  email: "customer@example.com",
  app_metadata: {},
  user_metadata: {},
};
const admin = {
  id: "admin-a",
  email: "admin@example.com",
  app_metadata: { role: "admin" },
  user_metadata: {},
};
const spoof = { ...customer, user_metadata: { role: "admin" } };
const redirect = (destination) => {
  throw Object.assign(new Error("redirect"), { destination });
};
const actions = [
  ["categories", "saveCategoryAction", [{ name: "Parts" }]],
  ["categories", "deleteCategoryAction", ["id"]],
  ["customers", "deleteCustomerAction", ["id"]],
  ["events", "saveEventAction", [{ title: "Ride", price: 0, capacity: 1 }]],
  ["events", "deleteEventAction", ["id"]],
  ["events", "updateEventStatusAction", ["id", "published"]],
  ["orders", "updateOrderStatusAction", ["id", "cancelled"]],
  ["orders", "getNewOrderIds", []],
  ["orders", "reviewGcashPaymentAction", ["id", "paid"]],
  ["products", "saveProductAction", [{ name: "Wheel" }]],
  ["products", "deleteProductAction", ["id"]],
  ["registrations", "reviewRegistrationAction", ["id", "paid"]],
  ["registrations", "updateRegistrationStatusAction", ["id", "cancelled"]],
  ["settings", "saveGcashSettingsAction", [undefined, new FormData()]],
  ["dashboard", "saveHomepageBanner", ["https://example.com/banner.png"]],
  ["dashboard", "removeHomepageBanner", ["banner"]],
];
for (const [label, user] of [
  ["signed out", null],
  ["customer", customer],
  ["spoofed metadata", spoof],
])
  for (const [area, name, args] of actions) {
    test(`${label} cannot execute ${name}`, async () => {
      let writes = 0;
      const load = loader(
        {
          "@/lib/supabase/server": { getAdminUser: async () => user },
          "next/navigation": { redirect },
          "next/cache": { revalidatePath() {} },
          "@/lib/supabase/admin": {
            getAdminClient() {
              writes++;
              throw new Error("Unexpected privileged client");
            },
          },
        },
        (id) =>
          id.startsWith("@/lib/data/admin/")
            ? new Proxy(
                {},
                {
                  get: () => () => {
                    writes++;
                    throw new Error("Unexpected write");
                  },
                },
              )
            : undefined,
      );
      const file =
        area === "dashboard"
          ? "app/admin/(shell)/dashboard/banner-actions.ts"
          : `app/admin/(shell)/${area}/actions.ts`;
      await assert.rejects(load(file)[name](...args), {
        destination: "/admin/login",
      });
      assert.equal(writes, 0);
    });
  }
test("Browser factories use different cookies and different cached clients", () => {
  const calls = [];
  const load = loader({
    "./config": {
      getSupabaseConfig: () => ({
        url: "https://example.supabase.co",
        anonKey: "test",
      }),
    },
    "@supabase/ssr": {
      createBrowserClient: (url, key, options) => {
        const value = { options };
        calls.push(value);
        return value;
      },
    },
  });
  const clients = load("lib/supabase/client.ts");
  const a = clients.getBrowserClient(),
    b = clients.getAdminBrowserClient();
  assert.notEqual(a, b);
  assert.equal(a, clients.getBrowserClient());
  assert.equal(b, clients.getAdminBrowserClient());
  assert.equal(calls.length, 2);
  assert.equal(a.options.cookieOptions.name, "lnr-customer-auth");
  assert.equal(b.options.cookieOptions.name, "lnr-admin-auth");
  assert.equal(a.options.isSingleton, false);
  assert.equal(b.options.isSingleton, false);
});
for (const [route, user, destination, name] of [
  [
    "/admin/products",
    null,
    "/admin/login?next=%2Fadmin%2Fproducts",
    "lnr-admin-auth",
  ],
  [
    "/admin/products",
    customer,
    "/admin/login?next=%2Fadmin%2Fproducts",
    "lnr-admin-auth",
  ],
  ["/admin/products", admin, null, "lnr-admin-auth"],
  ["/admin/login", admin, "/admin", "lnr-admin-auth"],
  ["/admin/reset-password?code=test", null, null, "lnr-admin-auth"],
  ["/products", customer, null, "lnr-customer-auth"],
])
  test(`Proxy selects ${name} for ${route} and preserves refreshed cookies`, async () => {
    const load = loader({
      "./config": {
        getSupabaseConfig: () => ({
          url: "https://example.supabase.co",
          anonKey: "test",
        }),
      },
      "@supabase/ssr": {
        createServerClient: (url, key, options) => {
          assert.equal(options.cookieOptions.name, name);
          options.cookies.setAll([
            { name: "refreshed", value: "new", options: { path: "/" } },
          ]);
          return {
            auth: { getUser: async () => ({ data: { user }, error: null }) },
          };
        },
      },
    });
    const response = await load("lib/supabase/proxy.ts").updateSession(
      new NextRequest("https://example.com" + route),
    );
    assert.equal(
      response.headers.get("location"),
      destination ? "https://example.com" + destination : null,
    );
    assert.equal(response.cookies.get("refreshed").value, "new");
  });
function loginFixture(user) {
  const outs = [];
  let customerRows = 0;
  const client = {
    auth: {
      signInWithPassword: async () => ({ data: { user }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
      signOut: async (options) => {
        outs.push(options);
        return { error: null };
      },
    },
  };
  const load = loader({
    "@/lib/supabase/server": {
      createAdminSessionClient: async () => client,
      createClient: async () => client,
    },
    "next/navigation": { redirect },
    "@/lib/data/customer/customers": {
      getOrCreateCustomer: async () => {
        customerRows++;
        return { id: "customer-row" };
      },
    },
    "@/lib/data/customer/locations": {
      getCustomerDefaultLocation: async () => ({ address: "Address" }),
    },
  });
  const form = new FormData();
  form.set("email", user.email);
  form.set("password", "test-only-password");
  return { load, form, outs, rows: () => customerRows };
}
test("Admin login rejects a customer and clears only its own attempted session", async () => {
  const f = loginFixture(customer);
  const r = await f
    .load("app/admin/login/actions.ts")
    .adminLogin(undefined, f.form);
  assert.match(r.error, /administrator access/);
  assert.deepEqual(f.outs, [{ scope: "local" }]);
});
test("Customer login rejects admin credentials without creating a customer row", async () => {
  const f = loginFixture(admin);
  const r = await f
    .load("app/login/actions.ts")
    .customerLogin(undefined, f.form);
  assert.match(r.error, /administrator account/);
  assert.equal(f.rows(), 0);
  assert.deepEqual(f.outs, [{ scope: "local" }]);
});
test("A trusted administrator can sign in", async () => {
  const f = loginFixture(admin);
  await assert.rejects(
    f.load("app/admin/login/actions.ts").adminLogin(undefined, f.form),
    { destination: "/admin" },
  );
});
test("A customer can sign in normally", async () => {
  const f = loginFixture(customer);
  await assert.rejects(
    f.load("app/login/actions.ts").customerLogin(undefined, f.form),
    { destination: "/profile" },
  );
  assert.equal(f.rows(), 1);
});
test("Cancellation data access calls the atomic RPC with the administrator ID", async () => {
  const calls = [];
  const load = loader({
    "@/lib/supabase/admin": {
      getAdminClient: () => ({
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { data: null, error: null };
        },
      }),
    },
    "@/lib/storage/proofs": { paymentProofUrl: async () => "" },
  });
  const r = await load("lib/data/admin/orders.ts").updateOrderStatus(
    "order-id",
    "cancelled",
    "admin-id",
    null,
  );
  assert.equal(r.error, null);
  assert.deepEqual(calls, [
    {
      name: "lnr_set_order_status",
      args: {
        p_order: "order-id",
        p_status: "cancelled",
        p_admin: "admin-id",
        p_note: null,
      },
    },
  ]);
});
const proofCases = [
  ["signed out", null, null, "customer-a/proof.png", 401],
  ["other customer", customer, null, "customer-b/proof.png", 403],
  ["owner", customer, null, "customer-a/proof.png", 200],
  ["admin", null, admin, "customer-b/proof.png", 200],
  ["path traversal", customer, null, "customer-a/../proof.png", 400],
];
for (const [label, user, administrator, pathValue, status] of proofCases) {
  test(`Private proof endpoint checks ${label}`, async () => {
    let downloads = 0;
    const storageClient = {
      storage: {
        from(bucket) {
          assert.equal(bucket, "payment-proofs");
          return {
            async download() {
              downloads++;
              return {
                data: new Blob(["image"], { type: "image/png" }),
                error: null,
              };
            },
          };
        },
      },
    };
    const load = loader({
      "@/lib/supabase/server": {
        getUser: async () => user,
        getAdminUser: async () => administrator,
      },
      "@/lib/supabase/admin": { getAdminClient: () => storageClient },
    });
    const response = await load("app/api/payment-proof/route.ts").GET(
      new Request(
        "https://example.com/api/payment-proof?path=" +
          encodeURIComponent(pathValue),
      ),
    );
    assert.equal(response.status, status);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(downloads, status === 200 ? 1 : 0);
  });
}

test("One-use recovery exchanges are deduplicated separately for each portal", async () => {
  const calls = [];
  const make = (area) => ({
    auth: {
      exchangeCodeForSession: async (code) => {
        calls.push({ area, code });
        return { data: { user: customer }, error: null };
      },
    },
  });
  const load = loader({
    "@/lib/supabase/client": {
      getBrowserClient: () => make("customer"),
      getAdminBrowserClient: () => make("admin"),
    },
  });
  const recover = load("lib/auth/recovery.ts").exchangeRecoveryCode;
  await Promise.all([
    recover("customer", "one-code"),
    recover("customer", "one-code"),
    recover("admin", "one-code"),
  ]);
  assert.deepEqual(calls, [
    { area: "customer", code: "one-code" },
    { area: "admin", code: "one-code" },
  ]);
});
test("Post-login destinations reject external and backslash redirects", () => {
  const safe = loader()("lib/navigation.ts").sanitizeNext;
  assert.equal(safe("//evil.example", "/profile"), "/profile");
  assert.equal(safe("/\\evil.example", "/profile"), "/profile");
  assert.equal(safe("https://evil.example", "/profile"), "/profile");
  assert.equal(safe("/checkout?from=cart"), "/checkout?from=cart");
});

for (const [label, user, error, expected] of [
  ["customer", customer, null, "/profile"],
  ["admin", admin, null, "/login?confirmation=failed"],
  ["invalid", null, { message: "Expired" }, "/login?confirmation=failed"],
]) {
  test(`Email confirmation callback handles ${label} without mixing sessions`, async () => {
    const load = loader({
      "@/lib/supabase/server": {
        createClient: async () => ({
          auth: {
            exchangeCodeForSession: async () => ({ data: { user }, error }),
            signOut: async () => ({ error: null }),
          },
        }),
      },
    });
    const response = await load("app/auth/callback/route.ts").GET(
      new Request("https://example.com/auth/callback?code=test"),
    );
    assert.equal(
      response.headers.get("location"),
      "https://example.com" + expected,
    );
  });
}
