import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import app from "../index";
import { db, pool } from "../db/connection";
import { tenants, users } from "../db/schema";
import { eq } from "drizzle-orm";

async function createTestTenant() {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `tenant-${crypto.randomUUID()}`,
      description: "Test tenant",
    })
    .returning({ id: tenants.id });

  if (!tenant) {
    throw new Error("Failed to create test tenant");
  }

  return tenant;
}

describe("POST /api/v1/auth/register", () => {
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

  describe("Given all fields", () => {
    it("should return the 201 status code", async () => {
      const userData = {
        firstName: "Punit",
        lastName: "sharma",
        email: "punit@gmail.com",
        password: "its@secret",
        tenantId,
      };

      const response = await app.request("/api/v1/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe("User registered successfully");
    });

    it("should return the expected response format", async () => {
      const userData = {
        firstName: "Punit",
        lastName: "sharma",
        email: "punit@gmail.com",
        password: "its@secret",
        tenantId,
      };

      const response = await app.request("/api/v1/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        message: "User registered successfully",
        data: {
          user: {
            id: expect.any(String),
            tenantId,
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email,
            role: "user",
          },
        },
        status: 201,
      });
    });

    it("should persist the user to database", async () => {
      const userData = {
        firstName: "Punit",
        lastName: "sharma",
        email: "punit@gmail.com",
        password: "its@secret",
        tenantId,
      };
      await app.request("/api/v1/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });
      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, userData.email));
      expect(user).toBeDefined();
      expect(user?.[0]?.firstName).toBe(userData.firstName);
      expect(user?.[0]?.tenantId).toBe(tenantId);
    });
  });

  describe("Given missing fields", () => {
    it("should return 400 when email is missing", async () => {
      const response = await app.request("/api/v1/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: "Punit",
          lastName: "sharma",
          password: "its@secret",
          tenantId,
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.status).toBe(400);
    });

    it("should return 400 when password is missing", async () => {
      const response = await app.request("/api/v1/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: "Punit",
          lastName: "sharma",
          email: "punit@gmail.com",
          tenantId,
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.status).toBe(400);
    });

    it("should return 400 when tenantId is missing", async () => {
      const response = await app.request("/api/v1/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: "Punit",
          lastName: "sharma",
          email: "punit@gmail.com",
          password: "its@secret",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.status).toBe(400);
    });
  });
});
