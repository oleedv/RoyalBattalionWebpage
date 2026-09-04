import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { Permission } from "shared";
import { requirePermission } from "./permissions";

type Vars = { userId: string; permissions: Permission[] };

function appWith(permissions: Permission[]) {
  const app = new Hono<{ Variables: Vars }>();
  app.use("*", async (c, next) => {
    c.set("userId", "test-user");
    c.set("permissions", permissions);
    await next();
  });
  app.get("/whitelist", requirePermission("view:whitelist"), (c) => c.json({ ok: true }));
  app.post("/whitelist", requirePermission("manage:whitelist"), (c) => c.json({ ok: true }));
  app.patch("/whitelist/1", requirePermission("manage:whitelist"), (c) => c.json({ ok: true }));
  app.delete("/whitelist/1", requirePermission("manage:whitelist"), (c) => c.json({ ok: true }));
  app.post("/whitelist/bulk", requirePermission("manage:whitelist"), (c) => c.json({ ok: true }));
  return app;
}

async function jsonStatus(app: Hono<{ Variables: Vars }>, path: string, method = "GET") {
  const res = await app.request(path, { method });
  const body = await res.json();
  return { status: res.status, body };
}

describe("view:whitelist cannot mutate whitelist", () => {
  const app = appWith(["view:whitelist"]);

  test("can read whitelist entries", async () => {
    const { status, body } = await jsonStatus(app, "/whitelist");
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  test("cannot add an entry", async () => {
    const { status, body } = await jsonStatus(app, "/whitelist", "POST");
    expect(status).toBe(403);
    expect(body).toEqual({ success: false, error: "Insufficient permissions" });
  });

  test("cannot edit an entry", async () => {
    const { status, body } = await jsonStatus(app, "/whitelist/1", "PATCH");
    expect(status).toBe(403);
    expect(body).toEqual({ success: false, error: "Insufficient permissions" });
  });

  test("cannot delete an entry", async () => {
    const { status, body } = await jsonStatus(app, "/whitelist/1", "DELETE");
    expect(status).toBe(403);
    expect(body).toEqual({ success: false, error: "Insufficient permissions" });
  });

  test("cannot bulk-modify entries", async () => {
    const { status, body } = await jsonStatus(app, "/whitelist/bulk", "POST");
    expect(status).toBe(403);
    expect(body).toEqual({ success: false, error: "Insufficient permissions" });
  });
});

describe("manage:whitelist can mutate whitelist", () => {
  const app = appWith(["manage:whitelist"]);

  test("can add, edit, and delete", async () => {
    expect((await jsonStatus(app, "/whitelist", "POST")).status).toBe(200);
    expect((await jsonStatus(app, "/whitelist/1", "PATCH")).status).toBe(200);
    expect((await jsonStatus(app, "/whitelist/1", "DELETE")).status).toBe(200);
  });
});

test("developer bypasses both view and manage gates", async () => {
  const app = appWith(["developer"]);
  expect((await jsonStatus(app, "/whitelist")).status).toBe(200);
  expect((await jsonStatus(app, "/whitelist", "POST")).status).toBe(200);
});
