import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import * as bcrypt from "bcrypt";
import app from "../index";
import { db, pool } from "../db/connection";
import { tenants, users } from "../db/schema";
import { Config } from "../config";
import { generateAccessToken } from "../utils/jwt";

async function createTestTenant(name = `tenant-${crypto.randomUUID()}`) {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name,
      description: "Test tenant",
    })
    .returning({ id: tenants.id, name: tenants.name });

  if (!tenant) {
    throw new Error("Failed to create test tenant");
  }

  return tenant;
}

async function insertTestUser(
  overrides: Partial<typeof users.$inferInsert> = {},
) {
  const { password: rawPassword, ...rest } = overrides;
  const password = rawPassword ?? "its@secret";
  const hashedPassword = await bcrypt.hash(password, Config.auth.bcryptCost);

  const [user] = await db
    .insert(users)
    .values({
      firstName: "Punit",
      lastName: "sharma",
      email: `user-${crypto.randomUUID()}@gmail.com`,
      password: hashedPassword,
      role: "user",
      ...rest,
    })
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
      tenantId: users.tenantId,
      firstName: users.firstName,
      lastName: users.lastName,
    });

  if (!user) {
    throw new Error("Failed to insert test user");
  }

  return user;
}

async function authHeaderFor(
  user: { id: string; email: string; role: "admin" | "manager" | "user" },
) {
  const token = await generateAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  return { Authorization: `Bearer ${token}` };
}

describe("Users API", () => {
  let tenantId: string;
  let adminHeaders: Record<string, string>;
  let userHeaders: Record<string, string>;

  beforeAll(async () => {
    await pool.query("SELECT 1");
  });

  beforeEach(async () => {
    await db.delete(users);
    await db.delete(tenants);

    const tenant = await createTestTenant();
    tenantId = tenant.id;

    const admin = await insertTestUser({
      email: "admin@gmail.com",
      role: "admin",
      tenantId,
    });
    const regularUser = await insertTestUser({
      email: "member@gmail.com",
      role: "user",
      tenantId,
    });

    adminHeaders = await authHeaderFor(admin);
    userHeaders = await authHeaderFor(regularUser);
  });

  describe("POST /api/v1/users", () => {
    it("should create a user when admin provides valid data", async () => {
      const payload = {
        firstName: "New",
        lastName: "User",
        email: "newuser@gmail.com",
        password: "its@secret",
        tenantId,
        role: "user",
      };

      const response = await app.request("/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        message: "User created successfully",
        data: {
          user: {
            id: expect.any(String),
            tenantId,
            firstName: payload.firstName,
            lastName: payload.lastName,
            email: payload.email,
            role: "user",
            isActive: true,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          },
        },
        status: 201,
      });
      expect(data.data.user.password).toBeUndefined();
    });

    it("should default role to user when role is omitted", async () => {
      const response = await app.request("/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({
          firstName: "Default",
          lastName: "Role",
          email: "defaultrole@gmail.com",
          password: "its@secret",
          tenantId,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.data.user.role).toBe("user");
    });

    it("should return 401 when no access token is provided", async () => {
      const response = await app.request("/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: "New",
          lastName: "User",
          email: "newuser@gmail.com",
          password: "its@secret",
          tenantId,
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should return 403 when a non-admin tries to create a user", async () => {
      const response = await app.request("/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...userHeaders,
        },
        body: JSON.stringify({
          firstName: "New",
          lastName: "User",
          email: "newuser@gmail.com",
          password: "its@secret",
          tenantId,
        }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should return 400 when tenantId is missing", async () => {
      const response = await app.request("/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({
          firstName: "New",
          lastName: "User",
          email: "newuser@gmail.com",
          password: "its@secret",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.status).toBe(400);
    });

    it("should return 400 when email is missing", async () => {
      const response = await app.request("/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({
          firstName: "New",
          lastName: "User",
          password: "its@secret",
          tenantId,
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should return 404 when tenant does not exist", async () => {
      const response = await app.request("/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({
          firstName: "New",
          lastName: "User",
          email: "newuser@gmail.com",
          password: "its@secret",
          tenantId: crypto.randomUUID(),
        }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe("Tenant not found");
    });

    it("should return 409 when email already exists", async () => {
      const response = await app.request("/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({
          firstName: "Dup",
          lastName: "User",
          email: "admin@gmail.com",
          password: "its@secret",
          tenantId,
        }),
      });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe("User already exists!");
    });
  });

  describe("GET /api/v1/users", () => {
    it("should return all users for an admin", async () => {
      const response = await app.request("/api/v1/users", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe("Users fetched successfully");
      expect(data.data).toHaveLength(2);
      expect(data.data.every((user: { password?: string }) => !user.password)).toBe(
        true,
      );
    });

    it("should return 401 when no access token is provided", async () => {
      const response = await app.request("/api/v1/users", {
        method: "GET",
      });

      expect(response.status).toBe(401);
    });

    it("should return 403 for a non-admin user", async () => {
      const response = await app.request("/api/v1/users", {
        method: "GET",
        headers: userHeaders,
      });

      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/v1/users/:id", () => {
    it("should return a user by id", async () => {
      const created = await insertTestUser({
        email: "byid@gmail.com",
        tenantId,
        firstName: "ById",
      });

      const response = await app.request(`/api/v1/users/${created.id}`, {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        message: "User fetched successfully",
        data: {
          id: created.id,
          tenantId,
          firstName: "ById",
          lastName: "sharma",
          email: "byid@gmail.com",
          role: "user",
          isActive: true,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
        status: 200,
      });
    });

    it("should return 404 when user id does not exist", async () => {
      const response = await app.request(
        `/api/v1/users/${crypto.randomUUID()}`,
        {
          method: "GET",
          headers: adminHeaders,
        },
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.message).toBe("User not found");
    });

    it("should return 403 for a non-admin user", async () => {
      const created = await insertTestUser({
        email: "forbidden-id@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/users/${created.id}`, {
        method: "GET",
        headers: userHeaders,
      });

      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/v1/users/email/:email", () => {
    it("should return a user by email", async () => {
      await insertTestUser({
        email: "byemail@gmail.com",
        tenantId,
        firstName: "ByEmail",
      });

      const response = await app.request(
        "/api/v1/users/email/byemail@gmail.com",
        {
          method: "GET",
          headers: adminHeaders,
        },
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.email).toBe("byemail@gmail.com");
      expect(data.data.firstName).toBe("ByEmail");
      expect(data.data.password).toBeUndefined();
    });

    it("should return 404 when email does not exist", async () => {
      const response = await app.request(
        "/api/v1/users/email/missing@gmail.com",
        {
          method: "GET",
          headers: adminHeaders,
        },
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.message).toBe("User not found");
    });

    it("should return 403 for a non-admin user", async () => {
      const response = await app.request(
        "/api/v1/users/email/admin@gmail.com",
        {
          method: "GET",
          headers: userHeaders,
        },
      );

      expect(response.status).toBe(403);
    });
  });
});
