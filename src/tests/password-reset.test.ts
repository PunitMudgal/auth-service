import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import * as bcrypt from "bcrypt";
import app from "../app";
import { db, pool } from "../db/connection";
import { passwordResetTokens, refreshTokens, tenants, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { Config } from "../config";
import { hashToken } from "../utils/jwt";

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

async function forgotPassword(email: string) {
  const response = await app.request("/api/v1/forgot-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
  return { response, data: await response.json() };
}

async function resetPassword(token: string, newPassword: string) {
  const response = await app.request("/api/v1/reset-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, newPassword }),
  });
  return { response, data: await response.json() };
}

async function login(email: string, password: string) {
  return app.request("/api/v1/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
}

function refreshRequest(refreshToken: string) {
  return app.request("/api/v1/refresh", {
    method: "POST",
    headers: { Cookie: `refresh_token=${refreshToken}` },
  });
}

describe("POST /api/v1/forgot-password", () => {
  let tenantId: string;

  beforeAll(async () => {
    await pool.query("SELECT 1");
  });

  beforeEach(async () => {
    await db.delete(passwordResetTokens);
    await db.delete(refreshTokens);
    await db.delete(users);
    await db.delete(tenants);
    const tenant = await createTestTenant();
    tenantId = tenant.id;
  });

  it("should issue a reset token for a registered email", async () => {
    await insertTestUser(tenantId);

    const { response, data } = await forgotPassword("punit@gmail.com");

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.resetToken).toBeDefined();
  });

  it("should not reveal whether an email is registered", async () => {
    const { response, data } = await forgotPassword("nobody@gmail.com");

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeUndefined();
  });

  it("should store only the hashed reset token", async () => {
    const user = await insertTestUser(tenantId);

    const { data } = await forgotPassword("punit@gmail.com");
    const rawToken = data.data.resetToken as string;

    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(rawToken);
    expect(rows[0]?.tokenHash).toBe(await hashToken(rawToken));
  });

  it("should return 400 for an invalid email", async () => {
    const { response } = await forgotPassword("not-an-email");

    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/reset-password", () => {
  let tenantId: string;

  beforeAll(async () => {
    await pool.query("SELECT 1");
  });

  beforeEach(async () => {
    await db.delete(passwordResetTokens);
    await db.delete(refreshTokens);
    await db.delete(users);
    await db.delete(tenants);
    const tenant = await createTestTenant();
    tenantId = tenant.id;
  });

  it("should reset the password so the new one works and the old one does not", async () => {
    await insertTestUser(tenantId);
    const { data } = await forgotPassword("punit@gmail.com");
    const rawToken = data.data.resetToken as string;

    const reset = await resetPassword(rawToken, "brand-new-secret");

    expect(reset.response.status).toBe(200);
    expect(reset.data.success).toBe(true);

    const oldLogin = await login("punit@gmail.com", "its@secret");
    expect(oldLogin.status).toBe(401);

    const newLogin = await login("punit@gmail.com", "brand-new-secret");
    expect(newLogin.status).toBe(200);
  });

  it("should mark the reset token as used", async () => {
    const user = await insertTestUser(tenantId);
    const { data } = await forgotPassword("punit@gmail.com");
    const rawToken = data.data.resetToken as string;

    await resetPassword(rawToken, "brand-new-secret");

    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.usedAt).not.toBeNull();
  });

  it("should revoke all of the user's sessions", async () => {
    await insertTestUser(tenantId);

    const loginResponse = await login("punit@gmail.com", "its@secret");
    const refreshToken = getCookieValue(
      loginResponse.headers.get("set-cookie"),
      "refresh_token",
    );
    expect(refreshToken).toBeDefined();

    const { data } = await forgotPassword("punit@gmail.com");
    const rawToken = data.data.resetToken as string;
    await resetPassword(rawToken, "brand-new-secret");

    const refresh = await refreshRequest(refreshToken!);
    expect(refresh.status).toBe(401);
  });

  it("should return 401 for an invalid token", async () => {
    await insertTestUser(tenantId);

    const { response, data } = await resetPassword(
      "totally-made-up-token",
      "brand-new-secret",
    );

    expect(response.status).toBe(401);
    expect(data.message).toBe("Invalid or already used reset token");
  });

  it("should return 401 for an already-used token", async () => {
    await insertTestUser(tenantId);
    const { data } = await forgotPassword("punit@gmail.com");
    const rawToken = data.data.resetToken as string;

    const first = await resetPassword(rawToken, "brand-new-secret");
    expect(first.response.status).toBe(200);

    const second = await resetPassword(rawToken, "another-secret");
    expect(second.response.status).toBe(401);
    expect(second.data.message).toBe("Invalid or already used reset token");
  });

  it("should return 401 for an expired token", async () => {
    const user = await insertTestUser(tenantId);
    const rawToken = "expired-reset-token";
    const tokenHash = await hashToken(rawToken);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() - 60_000),
    });

    const { response, data } = await resetPassword(
      rawToken,
      "brand-new-secret",
    );

    expect(response.status).toBe(401);
    expect(data.message).toBe("Reset token has expired");
  });

  it("should return 400 for a weak new password", async () => {
    await insertTestUser(tenantId);
    const { data } = await forgotPassword("punit@gmail.com");
    const rawToken = data.data.resetToken as string;

    const { response } = await resetPassword(rawToken, "123");

    expect(response.status).toBe(400);
  });
});
