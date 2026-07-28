import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import app from "../index";
import { db, pool } from "../db/connection";
import { users } from "../db/schema";

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
    });
});
