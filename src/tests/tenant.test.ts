import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import * as bcrypt from "bcrypt";
import app from "../app";
import { db, pool } from "../db/connection";
import { tenants, users } from "../db/schema";
import { Config } from "../config";
import { generateAccessToken } from "../utils/jwt";
import { eq } from "drizzle-orm";

async function createTestTenant(
  overrides: Partial<typeof tenants.$inferInsert> = {},
) {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `tenant-${crypto.randomUUID()}`,
      description: "Test tenant",
      location: "Test location",
      ...overrides,
    })
    .returning({
      id: tenants.id,
      name: tenants.name,
      description: tenants.description,
    });

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
      role: "customer",
      ...rest,
    })
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
      tenantId: users.tenantId,
    });

  if (!user) {
    throw new Error("Failed to insert test user");
  }

  return user;
}

async function authHeaderFor(user: {
  id: string;
  email: string;
  role: "admin" | "manager" | "staff" | "customer";
  tenantId: string | null;
}) {
  const token = await generateAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  });
  return { Authorization: `Bearer ${token}` };
}

describe.serial("Tenants API", () => {
  let adminHeaders: Record<string, string>;
  let userHeaders: Record<string, string>;
  let managerHeaders: Record<string, string>;

  beforeAll(async () => {
    await pool.query("SELECT 1");
  });

  beforeEach(async () => {
    await db.delete(users);
    await db.delete(tenants);

    const tenant = await createTestTenant({ name: "seed-tenant" });
    const admin = await insertTestUser({
      email: "admin@gmail.com",
      role: "admin",
      tenantId: tenant.id,
    });
    const regularUser = await insertTestUser({
      email: "member@gmail.com",
      role: "customer",
      tenantId: tenant.id,
    });
    const managerUser = await insertTestUser({
      email: "manager@gmail.com",
      role: "manager",
      tenantId: tenant.id,
    });

    adminHeaders = await authHeaderFor(admin);
    userHeaders = await authHeaderFor(regularUser);
    managerHeaders = await authHeaderFor(managerUser);
  });

  describe("POST /api/v1/tenant", () => {
    it("should create a tenant when admin provides valid data", async () => {
      const payload = {
        name: "Acme Corp",
        location: "New York, USA",
        description: "Main organization",
      };

      const response = await app.request("/api/v1/tenant", {
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
        message: "Tenant created successfully",
        data: {
          tenantId: expect.any(String),
        },
        status: 201,
      });

      const saved = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, data.data.tenantId));
      expect(saved[0]?.name).toBe(payload.name);
      expect(saved[0]?.location).toBe(payload.location);
      expect(saved[0]?.description).toBe(payload.description);
    });

    it("should create a tenant without description", async () => {
      const response = await app.request("/api/v1/tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({
          name: "No Description Tenant",
          location: "Paris, France",
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.data.tenantId).toBeDefined();
    });

    it("should return 401 when no access token is provided", async () => {
      const response = await app.request("/api/v1/tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Unauthorized Tenant",
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should return 403 when a non-admin tries to create a tenant", async () => {
      const response = await app.request("/api/v1/tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...userHeaders,
        },
        body: JSON.stringify({
          name: "Forbidden Tenant",
        }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should return 403 when a manager tries to create a tenant", async () => {
      const response = await app.request("/api/v1/tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...managerHeaders,
        },
        body: JSON.stringify({
          name: "Manager Tenant",
        }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should return 400 when name is missing", async () => {
      const response = await app.request("/api/v1/tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({
          description: "Missing name",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.status).toBe(400);
    });

    it("should return 400 when name is empty", async () => {
      const response = await app.request("/api/v1/tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({
          name: "   ",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe("GET /api/v1/tenant", () => {
    it("should return all tenants for an admin", async () => {
      await createTestTenant({ name: "second-tenant" });

      const response = await app.request("/api/v1/tenant", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe("Tenants fetched successfully");
      expect(data.data.length).toBeGreaterThanOrEqual(2);
      expect(data.status).toBe(200);
    });

    it("should return 401 when no access token is provided", async () => {
      const response = await app.request("/api/v1/tenant", {
        method: "GET",
      });

      expect(response.status).toBe(401);
    });

    it("should return 403 for a non-admin user", async () => {
      const response = await app.request("/api/v1/tenant", {
        method: "GET",
        headers: userHeaders,
      });

      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/v1/tenant/:id", () => {
    it("should return a tenant by id", async () => {
      const tenant = await createTestTenant({
        name: "lookup-tenant",
        description: "Find me",
      });

      const response = await app.request(`/api/v1/tenant/${tenant.id}`, {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe("Tenant fetched successfully");
      expect(data.data).toEqual([
        expect.objectContaining({
          id: tenant.id,
          name: "lookup-tenant",
          description: "Find me",
        }),
      ]);
    });

    it("should return an empty array when tenant id does not exist", async () => {
      const response = await app.request(
        `/api/v1/tenant/${crypto.randomUUID()}`,
        {
          method: "GET",
          headers: adminHeaders,
        },
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it("should return 403 for a non-admin user", async () => {
      const tenant = await createTestTenant({ name: "forbidden-lookup" });

      const response = await app.request(`/api/v1/tenant/${tenant.id}`, {
        method: "GET",
        headers: userHeaders,
      });

      expect(response.status).toBe(403);
    });
  });

  describe("PUT /api/v1/tenant/:id", () => {
    it("should update a tenant when admin provides valid data", async () => {
      const tenant = await createTestTenant({
        name: "before-update",
        description: "old",
      });

      const response = await app.request(`/api/v1/tenant/${tenant.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({
          name: "after-update",
          location: "Berlin, Germany",
          description: "new",
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        message: "Tenant updated successfully",
        data: [
          {
            id: tenant.id,
            name: "after-update",
            location: "Berlin, Germany",
            description: "new",
          },
        ],
        status: 200,
      });
    });

    it("should return 400 when name is missing on update", async () => {
      const tenant = await createTestTenant({ name: "update-validation" });

      const response = await app.request(`/api/v1/tenant/${tenant.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({
          description: "only description",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should return 401 when no access token is provided", async () => {
      const tenant = await createTestTenant({ name: "update-unauth" });

      const response = await app.request(`/api/v1/tenant/${tenant.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "should-fail",
        }),
      });

      expect(response.status).toBe(401);
    });

    it("should return 403 for a non-admin user", async () => {
      const tenant = await createTestTenant({ name: "update-forbidden" });

      const response = await app.request(`/api/v1/tenant/${tenant.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...userHeaders,
        },
        body: JSON.stringify({
          name: "should-fail",
        }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe("DELETE /api/v1/tenant/:id", () => {
    it("should delete a tenant when admin is authenticated", async () => {
      const tenant = await createTestTenant({ name: "to-delete" });

      const response = await app.request(`/api/v1/tenant/${tenant.id}`, {
        method: "DELETE",
        headers: adminHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        message: "Tenant deleted successfully",
        status: 200,
      });

      const remaining = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenant.id));
      expect(remaining).toHaveLength(0);
    });

    it("should return 401 when no access token is provided", async () => {
      const tenant = await createTestTenant({ name: "delete-unauth" });

      const response = await app.request(`/api/v1/tenant/${tenant.id}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(401);
    });

    it("should return 403 for a non-admin user", async () => {
      const tenant = await createTestTenant({ name: "delete-forbidden" });

      const response = await app.request(`/api/v1/tenant/${tenant.id}`, {
        method: "DELETE",
        headers: userHeaders,
      });

      expect(response.status).toBe(403);
    });
  });
});
