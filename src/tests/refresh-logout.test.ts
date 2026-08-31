import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import * as bcrypt from "bcrypt";
import app from "../app";
import { db, pool } from "../db/connection";
import { refreshTokens, tenants, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { Config } from "../config";
import { generateRefreshToken, hashToken } from "../utils/jwt";

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

async function loginAndGetRefreshToken() {
  const response = await app.request("/api/v1/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "punit@gmail.com",
      password: "its@secret",
    }),
  });

  expect(response.status).toBe(200);
  const refreshToken = getCookieValue(
    response.headers.get("set-cookie"),
    "refresh_token",
  );
  if (!refreshToken) {
    throw new Error("Login did not set a refresh token cookie");
  }
  return refreshToken;
}

function refreshRequest(refreshToken: string) {
  return app.request("/api/v1/refresh", {
    method: "POST",
    headers: { Cookie: `refresh_token=${refreshToken}` },
  });
}

function logoutRequest(refreshToken?: string) {
  return app.request("/api/v1/logout", {
    method: "POST",
    headers: refreshToken ? { Cookie: `refresh_token=${refreshToken}` } : {},
  });
}

describe("POST /api/v1/refresh", () => {
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

  describe("Given a valid refresh token", () => {
    it("should return 200 and issue new auth cookies", async () => {
      await insertTestUser(tenantId);
      const refreshToken = await loginAndGetRefreshToken();

      const response = await refreshRequest(refreshToken);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe("Token refreshed successfully");

      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("access_token=");
      expect(setCookie).toContain("refresh_token=");
    });

    it("should rotate the refresh token: revoke the old one and persist a new one", async () => {
      const user = await insertTestUser(tenantId);
      const refreshToken = await loginAndGetRefreshToken();
      const oldHash = await hashToken(refreshToken);

      const response = await refreshRequest(refreshToken);
      expect(response.status).toBe(200);

      const newRefreshToken = getCookieValue(
        response.headers.get("set-cookie"),
        "refresh_token",
      );
      expect(newRefreshToken).toBeDefined();
      expect(newRefreshToken).not.toBe(refreshToken);
      const newHash = await hashToken(newRefreshToken!);

      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));

      expect(rows).toHaveLength(2);
      const oldRow = rows.find((row) => row.tokenHash === oldHash);
      const newRow = rows.find((row) => row.tokenHash === newHash);
      expect(oldRow?.revokedAt).not.toBeNull();
      expect(newRow?.revokedAt).toBeNull();
    });

    it("should issue a rotated refresh token that can be used again", async () => {
      await insertTestUser(tenantId);
      const refreshToken = await loginAndGetRefreshToken();

      const first = await refreshRequest(refreshToken);
      expect(first.status).toBe(200);

      const secondRefreshToken = getCookieValue(
        first.headers.get("set-cookie"),
        "refresh_token",
      );
      expect(secondRefreshToken).toBeDefined();

      const second = await refreshRequest(secondRefreshToken!);
      expect(second.status).toBe(200);
      const data = await second.json();
      expect(data.success).toBe(true);
    });
  });

  describe("Reuse detection", () => {
    it("should revoke all of the user's sessions when a rotated token is reused", async () => {
      const user = await insertTestUser(tenantId);
      const refreshToken = await loginAndGetRefreshToken();

      const rotated = await refreshRequest(refreshToken);
      expect(rotated.status).toBe(200);

      // Presenting the already-rotated token again signals a stolen token
      const reused = await refreshRequest(refreshToken);
      expect(reused.status).toBe(401);
      const data = await reused.json();
      expect(data.message).toBe(
        "Refresh token reused — all sessions terminated for security",
      );

      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
    });
  });

  describe("Given an invalid or missing refresh token", () => {
    it("should return 401 when no refresh token is provided", async () => {
      const response = await app.request("/api/v1/refresh", {
        method: "POST",
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe("Refresh token not provided");
    });

    it("should return 401 for a validly signed token that is not stored", async () => {
      await insertTestUser(tenantId);
      const forged = await generateRefreshToken({
        sub: "does-not-exist",
        email: "ghost@gmail.com",
        role: "customer",
        tenantId: null,
      });

      const response = await refreshRequest(forged);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.message).toBe("Invalid refresh token");
    });

    it("should return 401 for an expired refresh token", async () => {
      const user = await insertTestUser(tenantId);
      const expiredToken = await generateRefreshToken({
        sub: user.id,
        email: "punit@gmail.com",
        role: "customer",
        tenantId: user.tenantId,
      });
      const tokenHash = await hashToken(expiredToken);

      await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() - 60_000),
        ipAddress: "127.0.0.1",
      });

      const response = await refreshRequest(expiredToken);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.message).toBe("Refresh token has expired");
    });

    it("should return 401 for a soft-deleted user's refresh token", async () => {
      const user = await insertTestUser(tenantId);
      const refreshToken = await loginAndGetRefreshToken();

      await db
        .update(users)
        .set({ deletedAt: new Date(), isActive: false })
        .where(eq(users.id, user.id));

      const response = await refreshRequest(refreshToken);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.message).toBe("User account no longer exists");
    });
  });
});

describe("POST /api/v1/logout", () => {
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

  it("should return 200 and revoke the refresh token", async () => {
    const user = await insertTestUser(tenantId);
    const refreshToken = await loginAndGetRefreshToken();

    const response = await logoutRequest(refreshToken);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("Logged out successfully");

    const rows = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revokedAt).not.toBeNull();
  });

  it("should clear the auth cookies", async () => {
    await insertTestUser(tenantId);
    const refreshToken = await loginAndGetRefreshToken();

    const response = await logoutRequest(refreshToken);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("access_token=");
    expect(setCookie).toContain("refresh_token=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("should succeed even when no refresh token is provided", async () => {
    const response = await logoutRequest();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it("should prevent a logged-out refresh token from refreshing again", async () => {
    await insertTestUser(tenantId);
    const refreshToken = await loginAndGetRefreshToken();

    const logout = await logoutRequest(refreshToken);
    expect(logout.status).toBe(200);

    const response = await refreshRequest(refreshToken);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.message).toBe(
      "Refresh token reused — all sessions terminated for security",
    );
  });
});
