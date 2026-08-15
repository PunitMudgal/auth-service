import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "../db/connection";
import { refreshTokens, users } from "../db/schema";
import type { LoginUser, RegisterUser, UserRole } from "../types";
import * as bcrypt from "bcrypt";
import {
  ConflictError,
  UnauthorizedError,
} from "../utils/errors";
import { Config } from "../config";
import { logger } from "../utils/logger";

interface PersistRefreshTokenParams {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress: string;
  userAgent?: string;
  deviceName?: string;
}

interface RotateRefreshTokenParams {
  oldTokenHash: string;
  newTokenHash: string;
  userId: string;
  expiresAt: Date;
  ipAddress: string;
  userAgent?: string;
  deviceName?: string;
}

interface RefreshableUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

export class AuthService {
  async register({ email, password, firstName, lastName }: RegisterUser) {
    const existingUser = await db
      .select()
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
      })
      .returning({
        id: users.id,
        tenantId: users.tenantId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
      });
    return user;
  }

  async login({ email, password }: LoginUser) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (!user.isActive) {
      throw new UnauthorizedError("User account is not allowed to authenticate");
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    };
  }

  async persistRefreshToken(params: PersistRefreshTokenParams) {
    await db.insert(refreshTokens).values({
      userId: params.userId,
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      deviceName: params.deviceName,
    });
  }

  async getUserForRefresh(userId: string): Promise<RefreshableUser> {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new UnauthorizedError("User account no longer exists");
    }

    if (!user.isActive) {
      throw new UnauthorizedError("User account is not allowed to authenticate");
    }

    return user;
  }

  async getRefreshTokenByHashUnfiltered(tokenHash: string) {
    const [token] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));
    return token;
  }

  async revokeRefreshToken(id: string) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, id));
  }

  async revokeRefreshTokenByHash(tokenHash: string) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash));
    // Silent if missing — the user asked to always succeed
  }

  async revokeAllUserRefreshTokens(userId: string) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, userId),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }

  async updateRefreshTokenLastUsed(id: string) {
    await db
      .update(refreshTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(refreshTokens.id, id));
  }

  async rotateRefreshToken(params: RotateRefreshTokenParams) {
    const existingToken = await this.getRefreshTokenByHashUnfiltered(
      params.oldTokenHash,
    );

    if (!existingToken) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    // Reuse detection: if the token was already revoked, this indicates
    // a stolen token. Revoke ALL non-revoked tokens for this user.
    if (existingToken.revokedAt) {
      await this.revokeAllUserRefreshTokens(existingToken.userId);
      throw new UnauthorizedError(
        "Refresh token reused — all sessions terminated for security",
      );
    }

    // Reject expired tokens
    if (existingToken.expiresAt < new Date()) {
      throw new UnauthorizedError("Refresh token has expired");
    }

    // Update lastUsedAt on the token being consumed
    await this.updateRefreshTokenLastUsed(existingToken.id);

    // Revoke the old token
    await this.revokeRefreshToken(existingToken.id);

    // Insert the new token
    await db.insert(refreshTokens).values({
      userId: params.userId,
      tokenHash: params.newTokenHash,
      expiresAt: params.expiresAt,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      deviceName: params.deviceName,
    });
  }

  async cleanupRefreshTokens() {
    try {
      const revokedCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await db
        .delete(refreshTokens)
        .where(
          or(
            lt(refreshTokens.expiresAt, new Date()),
            and(
              isNotNull(refreshTokens.revokedAt),
              lt(refreshTokens.revokedAt, revokedCutoff),
            ),
          ),
        );
    } catch (error) {
      logger.warn({ error }, "Refresh token cleanup failed");
    }
  }
}
