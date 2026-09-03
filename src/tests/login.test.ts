import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import * as bcrypt from "bcryptjs";
import app from "../app";
import { db, pool } from "../db/connection";
import { refreshTokens, tenants, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { Config } from "../config";

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

describe("POST /api/v1/login", () => {
  let tenantId: string;

  beforeAll(async () => {
    await pool.query("SELECT 1");
  });

  beforeEach(async () => {
    await db.delete(users);
    await db.delete(tenants);
    const tenant = await createTestTenant();
    tenantId = tenant.id;
  });

  describe("Given valid credentials", () => {
    it("should return the 200 status code", async () => {
      await insertTestUser(tenantId);

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
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe("Login successful");
    });

    it("should return the expected response format without exposing the password", async () => {
      await insertTestUser(tenantId);

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
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        message: "Login successful",
        data: {
          user: {
            id: expect.any(String),
            tenantId,
          },
        },
        status: 200,
      });
      expect(data.data.user.password).toBeUndefined();
    });

    it("should set the auth cookies", async () => {
      await insertTestUser(tenantId);

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

      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("access_token=");
      expect(setCookie).toContain("refresh_token=");
      expect(setCookie).toContain("HttpOnly");
    });

    it("should persist a refresh token for the logged-in user", async () => {
      const user = await insertTestUser(tenantId);

      await app.request("/api/v1/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "punit@gmail.com",
          password: "its@secret",
        }),
      });

      const tokens = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));

      expect(tokens).toHaveLength(1);
      expect(tokens[0]?.tokenHash).toBeDefined();
    });
  });

  describe("Given invalid credentials", () => {
    it("should return 401 for an unknown email", async () => {
      const response = await app.request("/api/v1/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "nobody@example.com",
          password: "its@secret",
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe("Invalid email or password");
    });

    it("should return 401 for a wrong password", async () => {
      await insertTestUser(tenantId);

      const response = await app.request("/api/v1/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "punit@gmail.com",
          password: "wrong-password",
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe("Invalid email or password");
    });

    it("should return 401 for an inactive user account", async () => {
      await insertTestUser(tenantId, { isActive: false });

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

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should return 400 when required fields are missing", async () => {
      const response = await app.request("/api/v1/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "punit@gmail.com",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should return 400 when email is missing", async () => {
      const response = await app.request("/api/v1/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: "its@secret",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.status).toBe(400);
    });

    it("should return 400 when the request body is empty", async () => {
      const response = await app.request("/api/v1/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.status).toBe(400);
    });
  });
});
