import { eq } from "drizzle-orm";
import * as bcrypt from "bcrypt";
import { db } from "../db/connection";
import { tenants, users } from "../db/schema";
import type { CreateUser } from "../types";
import { Config } from "../config";
import { ConflictError, NotFoundError } from "../utils/errors";

const userSelect = {
  id: users.id,
  tenantId: users.tenantId,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

export class UserService {
  async createUser({
    email,
    password,
    firstName,
    lastName,
    tenantId,
    role = "user",
  }: CreateUser) {
    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (!tenant) {
      throw new NotFoundError("Tenant not found");
    }

    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (existingUser.length > 0) {
      throw new ConflictError("User already exists!");
    }

    const hashedPassword = await bcrypt.hash(password, Config.auth.bcryptCost);
    const [user] = await db
      .insert(users)
      .values({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        tenantId,
        role,
      })
      .returning(userSelect);

    return user;
  }

  async getUsers() {
    return db.select(userSelect).from(users);
  }

  async getUserById(id: string) {
    const [user] = await db
      .select(userSelect)
      .from(users)
      .where(eq(users.id, id));

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  }

  async getUserByEmail(email: string) {
    const [user] = await db
      .select(userSelect)
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  }
}
