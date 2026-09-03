import { and, count, desc, eq, ilike, isNull, ne, or } from "drizzle-orm";
import * as bcrypt from "bcryptjs";
import { db } from "../db/connection";
import { refreshTokens, tenants, users } from "../db/schema";
import type { CreateUser, JWTPayload, UserRole } from "../types";
import type { UpdateUserBody, UserListQuery } from "../config/user.schema";
import { Config } from "../config";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";

type Caller = Pick<JWTPayload, "sub" | "role" | "tenantId">;
type TargetUser = { id: string; role: UserRole; tenantId: string | null };
type AccessAction = "read" | "update" | "delete" | "deactivate";

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
    caller: Caller,
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
    caller: Caller,
  ) {
    if (caller.role !== "admin" && caller.role !== "manager") {
      throw new ForbiddenError("Access denied");
    }

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
        ? { id: tenant.id, name: tenant.name, location: tenant.location }
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

  async getUserById(id: string, caller: Caller) {
    const target = await this.loadUser(id);
    this.assertAccess(caller, target, "read");
    return target;
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

  async updateUser(id: string, body: UpdateUserBody, caller: Caller) {
    const target = await this.loadUser(id);
    const isSelf = caller.sub === target.id;
    const { isActive, role, ...profile } = body;

    if (isSelf && (isActive !== undefined || role !== undefined)) {
      throw new ForbiddenError("Access denied");
    }

    if (caller.role !== "admin" && role !== undefined) {
      throw new ForbiddenError("Only admins can change roles");
    }

    const hasProfileChange = Object.keys(profile).length > 0 || role !== undefined;
    const deactivating = isActive === false;
    const reactivating = isActive === true;

    if (hasProfileChange) {
      this.assertAccess(caller, target, "update");
    }
    if (deactivating) {
      this.assertAccess(caller, target, "deactivate");
    }
    if (reactivating) {
      if (caller.role !== "admin") {
        throw new ForbiddenError("Only admins can reactivate users");
      }
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

    const now = new Date();
    const values: Partial<typeof users.$inferInsert> = {
      ...(profile.firstName !== undefined && { firstName: profile.firstName }),
      ...(profile.lastName !== undefined && { lastName: profile.lastName }),
      ...(profile.email !== undefined && { email: profile.email }),
      ...(role !== undefined && { role }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: now,
    };

    if (profile.password) {
      values.password = await bcrypt.hash(
        profile.password,
        Config.auth.bcryptCost,
      );
    }

    if (deactivating) {
      await this.revokeSessions(id, now);
    }

    const [user] = await db
      .update(users)
      .set(values)
      .where(eq(users.id, id))
      .returning(userSelect);

    return user;
  }

  async softDeleteUser(id: string, caller: Caller) {
    const target = await this.loadUser(id);
    this.assertAccess(caller, target, "delete");

    const now = new Date();
    await this.revokeSessions(id, now);

    const [user] = await db
      .update(users)
      .set({ deletedAt: now, isActive: false, updatedAt: now })
      .where(eq(users.id, id))
      .returning(userSelect);

    return user;
  }

  private async loadUser(id: string) {
    const [result] = await db
      .select({ user: userSelect, tenant: tenantSelect })
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

  private async revokeSessions(userId: string, now: Date) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(
        and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
      );
  }

  private assertAccess(caller: Caller, target: TargetUser, action: AccessAction) {
    if (caller.role === "admin") return;

    if (caller.sub === target.id) {
      if (action === "read" || action === "update" || action === "delete") {
        return;
      }
      throw new ForbiddenError("Access denied");
    }

    if (!this.isManagerOf(caller, target)) {
      throw new ForbiddenError("Access denied");
    }

    if (action === "read" || action === "update") {
      if (target.role === "staff") return;
      throw new ForbiddenError("Access denied");
    }

    if (action === "delete" || action === "deactivate") {
      if (target.role === "staff" || target.role === "customer") return;
      throw new ForbiddenError("Access denied");
    }
  }

  private isManagerOf(caller: Caller, target: TargetUser) {
    return (
      caller.role === "manager" &&
      Boolean(caller.tenantId) &&
      caller.tenantId === target.tenantId
    );
  }
}
