import { and, count, desc, eq, ilike, isNull, ne, or } from "drizzle-orm";
import * as bcrypt from "bcrypt";
import { db } from "../db/connection";
import { refreshTokens, tenants, users } from "../db/schema";
import type { CreateUser, UserRole } from "../types";
import type { UpdateUserBody, UserListQuery } from "../config/user.schema";
import { Config } from "../config";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";

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

const tenantSelect = {
  id: tenants.id,
  name: tenants.name,
  description: tenants.description,
  location: tenants.location,
  createdAt: tenants.createdAt,
  updatedAt: tenants.updatedAt,
};

export class UserService {
  async createUser(
    {
      email,
      password,
      firstName,
      lastName,
      tenantId,
      role = "customer",
    }: CreateUser,
    caller: { role: UserRole; tenantId: string | null },
  ) {
    if (caller.role !== "admin" && caller.role !== "manager") {
      throw new ForbiddenError("Access denied");
    }

    if (caller.role === "manager") {
      if (!caller.tenantId || tenantId !== caller.tenantId) {
        throw new ForbiddenError(
          "Managers can only create users in their own tenant",
        );
      }

      if (role !== "manager" && role !== "staff") {
        throw new ForbiddenError(
          "Managers can only create manager or staff users",
        );
      }
    }

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

  async getUsers(
    { page, limit, search, role, isActive }: UserListQuery,
    caller: { role: UserRole; tenantId: string | null },
  ) {
    // Route middleware already restricts access to admin/manager, but
    // enforce it here too so the service is safe as the last line of defense.
    if (caller.role !== "admin" && caller.role !== "manager") {
      throw new ForbiddenError("Access denied");
    }

    // Managers may only filter their tenant's manager/staff/customer users
    if (
      caller.role === "manager" &&
      role &&
      role !== "manager" &&
      role !== "customer" &&
      role !== "staff"
    ) {
      throw new ForbiddenError(
        "Managers can only filter by manager, customer or staff roles",
      );
    }

    // A manager without a tenant (shouldn't happen) has nobody to see
    if (caller.role === "manager" && !caller.tenantId) {
      return {
        items: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }

    const searchCondition = search
      ? or(
          ilike(users.firstName, `%${search}%`),
          ilike(users.lastName, `%${search}%`),
          ilike(users.email, `%${search}%`),
        )
      : undefined;

    // Admin sees every user in the app; manager is scoped to their tenant.
    const tenantCondition =
      caller.role === "manager" && caller.tenantId
        ? eq(users.tenantId, caller.tenantId)
        : undefined;

    const where = and(
      isNull(users.deletedAt),
      searchCondition,
      tenantCondition,
      role ? eq(users.role, role) : undefined,
      isActive !== undefined ? eq(users.isActive, isActive) : undefined,
    );

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          user: userSelect,
          tenant: {
            id: tenants.id,
            name: tenants.name,
            location: tenants.location,
          },
        })
        .from(users)
        .leftJoin(tenants, eq(users.tenantId, tenants.id))
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ count: count() }).from(users).where(where),
    ]);

    const items = rows.map(({ user, tenant }) => ({
      ...user,
      tenant: tenant?.id
        ? {
            id: tenant.id,
            name: tenant.name,
            location: tenant.location,
          }
        : null,
    }));

    const total = totalRows[0]?.count ?? 0;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserById(id: string) {
    const [result] = await db
      .select({
        user: userSelect,
        tenant: tenantSelect,
      })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(and(eq(users.id, id), isNull(users.deletedAt)));

    if (!result) {
      throw new NotFoundError("User not found");
    }

    return {
      ...result.user,
      tenant: result.tenant?.id ? result.tenant : null,
    };
  }

  async getUserByEmail(email: string) {
    const [user] = await db
      .select(userSelect)
      .from(users)
      .where(
        and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)),
      );

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  }

  async updateUser(id: string, body: UpdateUserBody) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));

    if (!existing) {
      throw new NotFoundError("User not found");
    }

    if (body.email) {
      const [emailTaken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, body.email), ne(users.id, id)));

      if (emailTaken) {
        throw new ConflictError("User already exists!");
      }
    }

    const values: Partial<typeof users.$inferInsert> = {
      ...(body.firstName !== undefined && { firstName: body.firstName }),
      ...(body.lastName !== undefined && { lastName: body.lastName }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.role !== undefined && { role: body.role }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      updatedAt: new Date(),
    };

    if (body.password) {
      values.password = await bcrypt.hash(
        body.password,
        Config.auth.bcryptCost,
      );
    }

    const [user] = await db
      .update(users)
      .set(values)
      .where(eq(users.id, id))
      .returning(userSelect);

    return user;
  }

  async softDeleteUser(id: string) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));

    if (!existing) {
      throw new NotFoundError("User not found");
    }

    const now = new Date();

    // Revoke all active sessions so the soft-deleted user can no longer refresh tokens
    await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(
        and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)),
      );

    const [user] = await db
      .update(users)
      .set({ deletedAt: now, isActive: false, updatedAt: now })
      .where(eq(users.id, id))
      .returning(userSelect);

    return user;
  }
}
