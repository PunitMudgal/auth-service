import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import * as bcrypt from "bcrypt";
import app from "../index";
import { db, pool } from "../db/connection";
import { tenants, users } from "../db/schema";
import { Config } from "../config";
import { generateAccessToken } from "../utils/jwt";
import { eq } from "drizzle-orm";

let cachedDefaultPasswordHash: string | undefined;

async function createTestTenant(name = `tenant-${crypto.randomUUID()}`) {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name,
      description: "Test tenant",
      location: "Test location",
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
  const hashedPassword = rawPassword
    ? await bcrypt.hash(password, Config.auth.bcryptCost)
    : (cachedDefaultPasswordHash ??= await bcrypt.hash(
        password,
        Config.auth.bcryptCost,
      ));

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
      firstName: users.firstName,
      lastName: users.lastName,
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

describe.serial("Users API", () => {
  let tenantId: string;
  let adminHeaders: Record<string, string>;
  let userHeaders: Record<string, string>;
  let managerHeaders: Record<string, string>;

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
      role: "customer",
      tenantId,
    });
    const managerUser = await insertTestUser({
      email: "manager@gmail.com",
      role: "manager",
      tenantId,
    });

    adminHeaders = await authHeaderFor(admin);
    userHeaders = await authHeaderFor(regularUser);
    managerHeaders = await authHeaderFor(managerUser);
  });

  describe("POST /api/v1/user", () => {
    it("should create a user when admin provides valid data", async () => {
      const payload = {
        firstName: "New",
        lastName: "User",
        email: "newuser@gmail.com",
        password: "its@secret",
        tenantId,
        role: "customer",
      };

      const response = await app.request("/api/v1/user", {
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
            role: "customer",
            isActive: true,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          },
        },
        status: 201,
      });
      expect(data.data.user.password).toBeUndefined();
    });

    it("should default role to customer when role is omitted", async () => {
      const response = await app.request("/api/v1/user", {
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
      expect(data.data.user.role).toBe("customer");
    });

    it("should create a user with manager role when admin provides valid data", async () => {
      const response = await app.request("/api/v1/user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({
          firstName: "Manager",
          lastName: "User",
          email: "managerrole@gmail.com",
          password: "its@secret",
          tenantId,
          role: "manager",
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.data.user.role).toBe("manager");
    });

    it("should return 401 when no access token is provided", async () => {
      const response = await app.request("/api/v1/user", {
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

    it("should return 403 when a non-admin/customer tries to create a user", async () => {
      const response = await app.request("/api/v1/user", {
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
      const response = await app.request("/api/v1/user", {
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
      const response = await app.request("/api/v1/user", {
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
      const response = await app.request("/api/v1/user", {
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
      const response = await app.request("/api/v1/user", {
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

  describe("GET /api/v1/user", () => {
    it("should return all users for an admin", async () => {
      const response = await app.request("/api/v1/user", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe("Users fetched successfully");
      expect(data.data.items).toHaveLength(3);
      expect(data.data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 3,
        totalPages: 1,
      });
      expect(
        data.data.items.every((user: { password?: string }) => !user.password),
      ).toBe(true);
    });

    it("should return 401 when no access token is provided", async () => {
      const response = await app.request("/api/v1/user", {
        method: "GET",
      });

      expect(response.status).toBe(401);
    });

    it("should return 403 for a non-admin/customer user", async () => {
      const response = await app.request("/api/v1/user", {
        method: "GET",
        headers: userHeaders,
      });

      expect(response.status).toBe(403);
    });

    it("should return the users of the manager's own tenant", async () => {
      const response = await app.request("/api/v1/user", {
        method: "GET",
        headers: managerHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(3);
      expect(data.data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 3,
        totalPages: 1,
      });
    });

    it("should not leak users from other tenants to a manager", async () => {
      const otherTenant = await createTestTenant();
      await insertTestUser({
        email: "other-tenant-a@gmail.com",
        tenantId: otherTenant.id,
      });
      await insertTestUser({
        email: "other-tenant-b@gmail.com",
        tenantId: otherTenant.id,
      });

      const response = await app.request("/api/v1/user", {
        method: "GET",
        headers: managerHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(3);
      const emails = data.data.items.map((u: { email: string }) => u.email);
      expect(emails).not.toContain("other-tenant-a@gmail.com");
      expect(emails).not.toContain("other-tenant-b@gmail.com");
      expect(data.data.pagination.total).toBe(3);
    });

    it("should return users across all tenants for an admin", async () => {
      const otherTenant = await createTestTenant();
      await insertTestUser({
        email: "admin-cross-tenant@gmail.com",
        tenantId: otherTenant.id,
      });

      const response = await app.request("/api/v1/user", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(4);
      const emails = data.data.items.map((u: { email: string }) => u.email);
      expect(emails).toContain("admin-cross-tenant@gmail.com");
    });

    it("should return 403 for a staff user", async () => {
      const staffUser = await insertTestUser({
        email: "staff@gmail.com",
        role: "staff",
        tenantId,
      });
      const staffHeaders = await authHeaderFor(staffUser);

      const response = await app.request("/api/v1/user", {
        method: "GET",
        headers: staffHeaders,
      });

      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/v1/user (pagination)", () => {
    it("should paginate results and report total counts", async () => {
      for (let i = 0; i < 15; i++) {
        await insertTestUser({
          email: `page-${i}@gmail.com`,
          tenantId,
          firstName: "PageUser",
        });
      }

      const page1 = await app.request("/api/v1/user?page=1&limit=5", {
        method: "GET",
        headers: adminHeaders,
      });
      expect(page1.status).toBe(200);
      const page1Data = await page1.json();
      expect(page1Data.data.items).toHaveLength(5);
      expect(page1Data.data.pagination).toEqual({
        page: 1,
        limit: 5,
        total: 18,
        totalPages: 4,
      });

      const page2 = await app.request("/api/v1/user?page=2&limit=5", {
        method: "GET",
        headers: adminHeaders,
      });
      const page2Data = await page2.json();
      expect(page2Data.data.items).toHaveLength(5);
      expect(page2Data.data.pagination).toEqual({
        page: 2,
        limit: 5,
        total: 18,
        totalPages: 4,
      });

      const page1Ids = page1Data.data.items.map((u: { id: string }) => u.id);
      const page2Ids = page2Data.data.items.map((u: { id: string }) => u.id);
      expect(page1Ids.some((id: string) => page2Ids.includes(id))).toBe(false);
    });

    it("should use default page and limit when none are provided", async () => {
      const response = await app.request("/api/v1/user", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 3,
        totalPages: 1,
      });
    });

    it("should return 400 when page is invalid", async () => {
      const response = await app.request("/api/v1/user?page=0", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(400);
    });

    it("should return 400 when limit is too large", async () => {
      const response = await app.request("/api/v1/user?limit=101", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(400);
    });

    it("should return 400 when page is not a number", async () => {
      const response = await app.request("/api/v1/user?page=abc", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/v1/user (search)", () => {
    it("should filter users by first name", async () => {
      await insertTestUser({
        email: "search-first@gmail.com",
        tenantId,
        firstName: "UniqueSearchFirst",
      });

      const response = await app.request(
        "/api/v1/user?search=UniqueSearchFirst",
        {
          method: "GET",
          headers: adminHeaders,
        },
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].email).toBe("search-first@gmail.com");
      expect(data.data.pagination.total).toBe(1);
    });

    it("should filter users by last name", async () => {
      await insertTestUser({
        email: "search-last@gmail.com",
        tenantId,
        lastName: "UniqueSearchLast",
      });

      const response = await app.request(
        "/api/v1/user?search=UniqueSearchLast",
        {
          method: "GET",
          headers: adminHeaders,
        },
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].email).toBe("search-last@gmail.com");
    });

    it("should filter users by email case-insensitively", async () => {
      await insertTestUser({
        email: "search-target@gmail.com",
        tenantId,
      });

      const response = await app.request("/api/v1/user?search=SEARCH-TARGET", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].email).toBe("search-target@gmail.com");
    });

    it("should return an empty list when nothing matches", async () => {
      const response = await app.request(
        "/api/v1/user?search=zzz-no-match-zzz",
        {
          method: "GET",
          headers: adminHeaders,
        },
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(0);
      expect(data.data.pagination.total).toBe(0);
      expect(data.data.pagination.totalPages).toBe(0);
    });
  });

  describe("GET /api/v1/user (filters)", () => {
    it("should filter users by role for an admin", async () => {
      const response = await app.request("/api/v1/user?role=customer", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].role).toBe("customer");
      expect(data.data.items[0].email).toBe("member@gmail.com");
      expect(data.data.pagination.total).toBe(1);
    });

    it("should filter managers by role for an admin", async () => {
      const response = await app.request("/api/v1/user?role=manager", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].role).toBe("manager");
    });

    it("should filter users by active status for an admin", async () => {
      await insertTestUser({
        email: "inactive-admin-filter@gmail.com",
        tenantId,
        isActive: false,
      });

      const response = await app.request("/api/v1/user?isActive=false", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].email).toBe("inactive-admin-filter@gmail.com");
      expect(data.data.items[0].isActive).toBe(false);
    });

    it("should let a manager filter their tenant's customers", async () => {
      const response = await app.request("/api/v1/user?role=customer", {
        method: "GET",
        headers: managerHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].role).toBe("customer");
      expect(data.data.items[0].email).toBe("member@gmail.com");
    });

    it("should let a manager filter their tenant's staff only", async () => {
      await insertTestUser({
        email: "staff-filter@gmail.com",
        role: "staff",
        tenantId,
      });

      const response = await app.request("/api/v1/user?role=staff", {
        method: "GET",
        headers: managerHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].email).toBe("staff-filter@gmail.com");
      expect(data.data.items[0].role).toBe("staff");
    });

    it("should let a manager filter by active status", async () => {
      await insertTestUser({
        email: "inactive-manager-filter@gmail.com",
        tenantId,
        isActive: false,
      });

      const response = await app.request("/api/v1/user?isActive=false", {
        method: "GET",
        headers: managerHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].email).toBe(
        "inactive-manager-filter@gmail.com",
      );
      expect(data.data.items[0].isActive).toBe(false);
    });

    it("should not let a manager filter by the admin role", async () => {
      const response = await app.request("/api/v1/user?role=admin", {
        method: "GET",
        headers: managerHeaders,
      });

      expect(response.status).toBe(403);
    });

    it("should let a manager filter by the manager role in their tenant", async () => {
      const response = await app.request("/api/v1/user?role=manager", {
        method: "GET",
        headers: managerHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].email).toBe("manager@gmail.com");
      expect(data.data.items[0].role).toBe("manager");
    });

    it("should return 400 for an invalid role filter", async () => {
      const response = await app.request("/api/v1/user?role=superadmin", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(400);
    });

    it("should return 400 for an invalid isActive filter", async () => {
      const response = await app.request("/api/v1/user?isActive=yes", {
        method: "GET",
        headers: adminHeaders,
      });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/v1/user/:id", () => {
    it("should return a user by id", async () => {
      const created = await insertTestUser({
        email: "byid@gmail.com",
        tenantId,
        firstName: "ById",
      });

      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId));

      const response = await app.request(`/api/v1/user/${created.id}`, {
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
          role: "customer",
          isActive: true,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          tenant: {
            id: tenant.id,
            name: tenant.name,
            description: tenant.description,
            location: tenant.location,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          },
        },
        status: 200,
      });
    });

    it("should return 404 when user id does not exist", async () => {
      const response = await app.request(
        `/api/v1/user/${crypto.randomUUID()}`,
        {
          method: "GET",
          headers: adminHeaders,
        },
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.message).toBe("User not found");
    });

    it("should return 403 for a non-admin/customer user", async () => {
      const created = await insertTestUser({
        email: "forbidden-id@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "GET",
        headers: userHeaders,
      });

      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/v1/user/email/:email", () => {
    it("should return a user by email", async () => {
      await insertTestUser({
        email: "byemail@gmail.com",
        tenantId,
        firstName: "ByEmail",
      });

      const response = await app.request(
        "/api/v1/user/email/byemail@gmail.com",
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
        "/api/v1/user/email/missing@gmail.com",
        {
          method: "GET",
          headers: adminHeaders,
        },
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.message).toBe("User not found");
    });

    it("should return 403 for a non-admin/customer user", async () => {
      const response = await app.request("/api/v1/user/email/admin@gmail.com", {
        method: "GET",
        headers: userHeaders,
      });

      expect(response.status).toBe(403);
    });
  });

  describe("PATCH /api/v1/user/:id", () => {
    it("should update a user when admin provides valid data", async () => {
      const created = await insertTestUser({
        email: "patch-me@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({
          firstName: "Updated",
          lastName: "Name",
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        message: "User updated successfully",
        data: {
          user: {
            id: created.id,
            tenantId,
            firstName: "Updated",
            lastName: "Name",
            email: "patch-me@gmail.com",
            role: "customer",
            isActive: true,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          },
        },
        status: 200,
      });
      expect(data.data.user.password).toBeUndefined();

      const [saved] = await db
        .select()
        .from(users)
        .where(eq(users.id, created.id));
      expect(saved?.firstName).toBe("Updated");
      expect(saved?.lastName).toBe("Name");
    });

    it("should update the role when admin provides it", async () => {
      const created = await insertTestUser({
        email: "promote-me@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({ role: "manager" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.user.role).toBe("manager");
    });

    it("should update the email when admin provides it", async () => {
      const created = await insertTestUser({
        email: "old-email@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({ email: "new-email@gmail.com" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.user.email).toBe("new-email@gmail.com");
    });

    it("should deactivate a user when admin sets isActive to false", async () => {
      const created = await insertTestUser({
        email: "deactivate-me@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({ isActive: false }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.user.isActive).toBe(false);
    });

    it("should not expose the password after updating it", async () => {
      const created = await insertTestUser({
        email: "new-password@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({ password: "brand-new-secret" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.user.password).toBeUndefined();

      const [saved] = await db
        .select({ password: users.password })
        .from(users)
        .where(eq(users.id, created.id));
      const isHashed = await bcrypt.compare(
        "brand-new-secret",
        saved!.password,
      );
      expect(isHashed).toBe(true);
    });

    it("should return 409 when updating to an email that already exists", async () => {
      const created = await insertTestUser({
        email: "dupe-email@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({ email: "admin@gmail.com" }),
      });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe("User already exists!");
    });

    it("should return 400 when the update body is empty", async () => {
      const created = await insertTestUser({
        email: "empty-patch@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.status).toBe(400);
    });

    it("should return 400 when an invalid role is provided", async () => {
      const created = await insertTestUser({
        email: "invalid-role@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({ role: "superadmin" }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should return 400 when the password is too short", async () => {
      const created = await insertTestUser({
        email: "short-password@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders,
        },
        body: JSON.stringify({ password: "123" }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should return 404 when the user does not exist", async () => {
      const response = await app.request(
        `/api/v1/user/${crypto.randomUUID()}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...adminHeaders,
          },
          body: JSON.stringify({ firstName: "Ghost" }),
        },
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.message).toBe("User not found");
    });

    it("should return 401 when no access token is provided", async () => {
      const created = await insertTestUser({
        email: "patch-unauth@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ firstName: "Nope" }),
      });

      expect(response.status).toBe(401);
    });

    it("should return 403 for a customer user", async () => {
      const created = await insertTestUser({
        email: "patch-forbidden@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...userHeaders,
        },
        body: JSON.stringify({ firstName: "Nope" }),
      });

      expect(response.status).toBe(403);
    });

    it("should return 403 for a manager user", async () => {
      const created = await insertTestUser({
        email: "patch-manager-forbidden@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...managerHeaders,
        },
        body: JSON.stringify({ firstName: "Nope" }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe("DELETE /api/v1/user/:id", () => {
    it("should soft delete a user when admin is authenticated", async () => {
      const created = await insertTestUser({
        email: "to-delete@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "DELETE",
        headers: adminHeaders,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        message: "User deleted successfully",
        status: 200,
      });

      // Row still exists but is flagged as deleted and deactivated
      const [saved] = await db
        .select()
        .from(users)
        .where(eq(users.id, created.id));
      expect(saved?.deletedAt).not.toBeNull();
      expect(saved?.isActive).toBe(false);
    });

    it("should no longer return the soft-deleted user from reads", async () => {
      const created = await insertTestUser({
        email: "gone-from-reads@gmail.com",
        tenantId,
      });

      await app.request(`/api/v1/user/${created.id}`, {
        method: "DELETE",
        headers: adminHeaders,
      });

      const byId = await app.request(`/api/v1/user/${created.id}`, {
        method: "GET",
        headers: adminHeaders,
      });
      expect(byId.status).toBe(404);

      const list = await app.request("/api/v1/user", {
        method: "GET",
        headers: adminHeaders,
      });
      const listData = await list.json();
      expect(
        listData.data.items.some(
          (user: { id: string }) => user.id === created.id,
        ),
      ).toBe(false);
    });

    it("should prevent the soft-deleted user from logging in", async () => {
      const created = await insertTestUser({
        email: "cannot-login@gmail.com",
        tenantId,
      });

      await app.request(`/api/v1/user/${created.id}`, {
        method: "DELETE",
        headers: adminHeaders,
      });

      const login = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "cannot-login@gmail.com",
          password: "its@secret",
        }),
      });

      expect(login.status).toBe(401);
    });

    it("should return 404 when the user does not exist", async () => {
      const response = await app.request(
        `/api/v1/user/${crypto.randomUUID()}`,
        {
          method: "DELETE",
          headers: adminHeaders,
        },
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.message).toBe("User not found");
    });

    it("should return 404 when the user is already soft deleted", async () => {
      const created = await insertTestUser({
        email: "already-deleted@gmail.com",
        tenantId,
      });

      await app.request(`/api/v1/user/${created.id}`, {
        method: "DELETE",
        headers: adminHeaders,
      });

      const second = await app.request(`/api/v1/user/${created.id}`, {
        method: "DELETE",
        headers: adminHeaders,
      });

      expect(second.status).toBe(404);
    });

    it("should return 401 when no access token is provided", async () => {
      const created = await insertTestUser({
        email: "delete-unauth@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(401);
    });

    it("should return 403 for a customer user", async () => {
      const created = await insertTestUser({
        email: "delete-forbidden@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "DELETE",
        headers: userHeaders,
      });

      expect(response.status).toBe(403);
    });

    it("should return 403 for a manager user", async () => {
      const created = await insertTestUser({
        email: "delete-manager-forbidden@gmail.com",
        tenantId,
      });

      const response = await app.request(`/api/v1/user/${created.id}`, {
        method: "DELETE",
        headers: managerHeaders,
      });

      expect(response.status).toBe(403);
    });
  });
});
