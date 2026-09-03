import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import * as bcrypt from "bcryptjs";
import app from "../app";
import { db, pool } from "../db/connection";
import { refreshTokens, tenants, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { Config } from "../config";
import { hashToken } from "../utils/jwt";

// Each login runs bcrypt at cost 12, so tests that log in are slow under load.
const LOGIN_TEST_TIMEOUT = 20000;

async function createTestTenant() {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `tenant-${crypto.randomUUID()}`,
      description: "Test tenant",
      location: "Test location",
    })
    .returning({ id: tenants.id });

  if (!tenant) {
    throw new Error("Failed to create test tenant");
  }

  return tenant;
}

async function insertTestUser(
  tenantId: string,
  overrides: Partial<typeof users.$inferInsert> = {},
) {
  const { password: rawPassword, ...rest } = overrides;
  const password = rawPassword ?? "its@secret";
  const hashedPassword = await bcrypt.hash(password, Config.auth.bcryptCost);

  const [user] = await db
    .insert(users)
    .values({
      tenantId,
      firstName: "Punit",
      lastName: "sharma",
      email: "punit@gmail.com",
      password: hashedPassword,
      ...rest,
    })
    .returning({ id: users.id, tenantId: users.tenantId });

  if (!user) {
    throw new Error("Failed to insert test user");
  }

  return user;
}

function getCookieValue(
  setCookie: string | null,
  name: string,
): string | undefined {
  if (!setCookie) return undefined;
  const match = setCookie.match(new RegExp(`${name}=([^;\\s]+)`));
  return match?.[1];
}

async function loginAndGetTokens(email = "punit@gmail.com") {
  const response = await app.request("/api/v1/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: "its@secret" }),
  });

  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const accessToken = getCookieValue(setCookie, "access_token");
  const refreshToken = getCookieValue(setCookie, "refresh_token");
  if (!accessToken || !refreshToken) {
    throw new Error("Login did not set auth cookies");
  }
  return { accessToken, refreshToken };
}

function sessionsGet(accessToken: string, refreshToken?: string) {
  return app.request("/api/v1/sessions", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(refreshToken ? { Cookie: `refresh_token=${refreshToken}` } : {}),
    },
  });
}

function sessionsDelete(
  accessToken: string,
  sessionId: string,
  refreshToken?: string,
) {
  return app.request(`/api/v1/sessions/${sessionId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(refreshToken ? { Cookie: `refresh_token=${refreshToken}` } : {}),
    },
  });
}

function refreshRequest(refreshToken: string) {
  return app.request("/api/v1/refresh", {
    method: "POST",
    headers: { Cookie: `refresh_token=${refreshToken}` },
  });
}

describe("GET /api/v1/sessions", () => {
  let tenantId: string;

  beforeAll(async () => {
    await pool.query("SELECT 1");
  });

  beforeEach(async () => {
    await db.delete(refreshTokens);
    await db.delete(users);
    await db.delete(tenants);
    const tenant = await createTestTenant();
    tenantId = tenant.id;
  });

  it("should return 401 when no access token is provided", async () => {
    const response = await app.request("/api/v1/sessions", {
      method: "GET",
    });

    expect(response.status).toBe(401);
  });

  it(
    "should list the user's active sessions without exposing token hashes",
    async () => {
      await insertTestUser(tenantId);
      const { accessToken } = await loginAndGetTokens();

      const response = await sessionsGet(accessToken);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(1);

      const session = data.data.items[0];
      expect(session.id).toBeDefined();
      expect(session.ipAddress).toBeDefined();
      expect(session.createdAt).toBeDefined();
      expect(session.expiresAt).toBeDefined();
      expect(session.tokenHash).toBeUndefined();
    },
    LOGIN_TEST_TIMEOUT,
  );

  it(
    "should list one session per login",
    async () => {
      await insertTestUser(tenantId);
      await loginAndGetTokens();
      const { accessToken } = await loginAndGetTokens();

      const response = await sessionsGet(accessToken);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(2);
    },
    LOGIN_TEST_TIMEOUT,
  );

  it(
    "should flag the session matching the current refresh token",
    async () => {
      await insertTestUser(tenantId);
      await loginAndGetTokens();
      const current = await loginAndGetTokens();

      const response = await sessionsGet(
        current.accessToken,
        current.refreshToken,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(2);

      const currentSessions = data.data.items.filter(
        (s: { isCurrent: boolean }) => s.isCurrent,
      );
      const otherSessions = data.data.items.filter(
        (s: { isCurrent: boolean }) => !s.isCurrent,
      );
      expect(currentSessions).toHaveLength(1);
      expect(otherSessions).toHaveLength(1);
    },
    LOGIN_TEST_TIMEOUT,
  );

  it(
    "should exclude expired sessions",
    async () => {
      const user = await insertTestUser(tenantId);
      const { accessToken } = await loginAndGetTokens();

      await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash: await hashToken("expired-session-token"),
        expiresAt: new Date(Date.now() - 60_000),
        ipAddress: "127.0.0.1",
      });

      const response = await sessionsGet(accessToken);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(1);
    },
    LOGIN_TEST_TIMEOUT,
  );
});

describe("DELETE /api/v1/sessions/:id", () => {
  let tenantId: string;

  beforeAll(async () => {
    await pool.query("SELECT 1");
  });

  beforeEach(async () => {
    await db.delete(refreshTokens);
    await db.delete(users);
    await db.delete(tenants);
    const tenant = await createTestTenant();
    tenantId = tenant.id;
  });

  it(
    "should revoke a specific session",
    async () => {
      const user = await insertTestUser(tenantId);
      const first = await loginAndGetTokens();
      const second = await loginAndGetTokens();

      const list = await sessionsGet(second.accessToken);
      const items = (await list.json()).data.items as Array<{ id: string }>;
      expect(items).toHaveLength(2);

      const response = await sessionsDelete(second.accessToken, items[0].id);
      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);

      const after = await sessionsGet(second.accessToken);
      expect((await after.json()).data.items).toHaveLength(1);

      // Identify which token belongs to the remaining active session so we can
      // refresh it first (refreshing a revoked token triggers reuse detection,
      // which revokes every session).
      const firstHash = await hashToken(first.refreshToken);
      const secondHash = await hashToken(second.refreshToken);
      const rows = await db
        .select({
          tokenHash: refreshTokens.tokenHash,
          revokedAt: refreshTokens.revokedAt,
        })
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      const activeHash = rows.find((row) => row.revokedAt === null)?.tokenHash;

      const activeToken =
        activeHash === firstHash ? first.refreshToken : second.refreshToken;
      const revokedToken =
        activeHash === firstHash ? second.refreshToken : first.refreshToken;

      const activeRefresh = await refreshRequest(activeToken);
      expect(activeRefresh.status).toBe(200);

      const revokedRefresh = await refreshRequest(revokedToken);
      expect(revokedRefresh.status).toBe(401);
    },
    LOGIN_TEST_TIMEOUT,
  );

  it(
    "should return 404 when revoking another user's session",
    async () => {
      await insertTestUser(tenantId);
      const userA = await loginAndGetTokens();

      await insertTestUser(tenantId, { email: "other@gmail.com" });
      const userB = await loginAndGetTokens("other@gmail.com");

      const bList = await sessionsGet(userB.accessToken);
      const bSessionId = (await bList.json()).data.items[0].id as string;

      const response = await sessionsDelete(userA.accessToken, bSessionId);
      expect(response.status).toBe(404);

      const bAfter = await sessionsGet(userB.accessToken);
      expect((await bAfter.json()).data.items).toHaveLength(1);
    },
    LOGIN_TEST_TIMEOUT,
  );

  it("should return 404 for a non-existent session", async () => {
    await insertTestUser(tenantId);
    const { accessToken } = await loginAndGetTokens();

    const response = await sessionsDelete(accessToken, crypto.randomUUID());
    expect(response.status).toBe(404);
  });

  it("should return 401 when no access token is provided", async () => {
    const response = await app.request(
      `/api/v1/sessions/${crypto.randomUUID()}`,
      { method: "DELETE" },
    );

    expect(response.status).toBe(401);
  });

  it(
    "should clear the cookies when the current session is revoked",
    async () => {
      await insertTestUser(tenantId);
      const { accessToken, refreshToken } = await loginAndGetTokens();

      const list = await sessionsGet(accessToken, refreshToken);
      const sessionId = (await list.json()).data.items[0].id as string;

      const response = await sessionsDelete(
        accessToken,
        sessionId,
        refreshToken,
      );
      expect(response.status).toBe(200);

      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("Max-Age=0");
    },
    LOGIN_TEST_TIMEOUT,
  );
});
