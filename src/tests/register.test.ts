import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import app from "../index";
import { db, pool } from "../db/connection";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

describe("POST /api/v1/auth/register", () => {
    beforeAll(async () => {
        // Ensure DB is reachable (pool is created on import)
        await pool.query("SELECT 1");
    });

    beforeEach(async () => {
        // Truncate users between tests
        await db.delete(users);
    });

    afterAll(async () => {
        await pool.end();
    });

    describe("Given all fields", () => {
        it("should return the 201 status code", async () => {
            // Arrange
            const userData = {
                firstName: "Punit",
                lastName: "sharma",
                email: "punit@gmail.com",
                password: "its@secret",
            };

            // Act — Hono equivalent of supertest(app).post(...).send(...)
            const response = await app.request("/api/v1/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(userData),
            });

            // Assert
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
                    user: [
                        {
                            firstName: userData.firstName,
                            lastName: userData.lastName,
                            email: userData.email,
                        },
                    ],
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
            };
            const response = await app.request("/api/v1/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(userData),
            })
            const user = await db.select().from(users).where(eq(users.email, userData.email));
            expect(user).toBeDefined();
            expect(user?.[0]?.firstName).toBe(userData.firstName);
        }); 

        
    });
});
