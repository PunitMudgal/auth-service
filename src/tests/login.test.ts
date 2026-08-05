import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import * as bcrypt from "bcrypt";
import app from "../index";
import { db, pool } from "../db/connection";
import { refreshTokens, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { Config } from "../config";

async function insertTestUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const { password: rawPassword, ...rest } = overrides;
  const password = rawPassword ?? "its@secret";
  const hashedPassword = await bcrypt.hash(password, Config.auth.bcryptCost);

  const [user] = await db
    .insert(users)
    .values({
      firstName: "Punit",
      lastName: "sharma",
      email: "punit@gmail.com",
      password: hashedPassword,
      ...rest,
    })
    .returning({ id: users.id });

  if (!user) {
    throw new Error("Failed to insert test user");
  }

  return user;
}

describe("POST /api/v1/auth/login", () => {
  beforeAll(async () => {
    // Ensure DB is reachable (pool is created on import)
    await pool.query("SELECT 1");
  });

  beforeEach(async () => {
    // Truncate users between tests
    await db.delete(users);
  });

  describe("Given valid credentials", () => {
    it("should return the 200 status code", async () => {
      // Arrange
      await insertTestUser();

      // Act
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "punit@gmail.com",
          password: "its@secret",
        }),
      });

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe("Login successful");
    });

    it("should return the expected response format without exposing the password", async () => {
      // Arrange
      await insertTestUser();

      // Act
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "punit@gmail.com",
          password: "its@secret",
        }),
      });

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        message: "Login successful",
        data: {
          user: {
            id: expect.any(String),
            firstName: "Punit",
            lastName: "sharma",
            email: "punit@gmail.com",
            role: "user",
          },
        },
        status: 200,
      });
      expect(data.data.user.password).toBeUndefined();
    });

    it("should set the auth cookies", async () => {
      // Arrange
      await insertTestUser();

      // Act
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "punit@gmail.com",
          password: "its@secret",
        }),
      });

      // Assert
      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("access_token=");
      expect(setCookie).toContain("refresh_token=");
      expect(setCookie).toContain("HttpOnly");
    });

    it("should persist a refresh token for the logged-in user", async () => {
      // Arrange
      const user = await insertTestUser();

      // Act
      await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "punit@gmail.com",
          password: "its@secret",
        }),
      });

      // Assert
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
      // Act
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "nobody@example.com",
          password: "its@secret",
        }),
      });

      // Assert
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe("Invalid email or password");
    });

    it("should return 401 for a wrong password", async () => {
      // Arrange
      await insertTestUser();

      // Act
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "punit@gmail.com",
          password: "wrong-password",
        }),
      });

      // Assert
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe("Invalid email or password");
    });

    it("should return 401 for an inactive user account", async () => {
      // Arrange
      await insertTestUser({ isActive: false });

      // Act
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "punit@gmail.com",
          password: "its@secret",
        }),
      });

      // Assert
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should return 400 when required fields are missing", async () => {
      // Act
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "punit@gmail.com",
        }),
      });

      // Assert
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should return 400 when email is missing", async () => {
      // Act
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: "its@secret",
        }),
      });

      // Assert
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.status).toBe(400);
    });

    it("should return 400 when the request body is empty", async () => {
      // Act
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      // Assert
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.status).toBe(400);
    });
  });
});
