import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db/connection";
import { passwordResetTokens, refreshTokens, users } from "../db/schema";
import type { LoginUser, RegisterUser, UserRole } from "../types";
import * as bcrypt from "bcrypt";
import {
  ConflictError,
  UnauthorizedError,
} from "../utils/errors";
import { hashToken } from "../utils/jwt";
import { Config } from "../config";
import { logger } from "../utils/logger";

const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

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
  tenantId: string | null;
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
      .where(and(eq(users.email, email), isNull(users.deletedAt)));

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
        tenantId: users.tenantId,
        isActive: users.isActive,
      })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

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

  /**
   * Issue a time-limited password reset token for the given email.
   * Only the token's SHA-256 hash is stored. Returns the raw token (which in
   * production would be emailed to the user) or null when no active user exists
   * so callers can respond without leaking whether an email is registered.
   */
  async createPasswordResetToken(email: string): Promise<string | null> {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)));

    if (!user) {
      return null;
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = await hashToken(rawToken);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
    });

    return rawToken;
  }

  /**
   * Validate a password reset token, set a new password, mark the token as used,
   * and revoke every active session so the new password takes effect everywhere.
   */
  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = await hashToken(rawToken);
    const [token] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash));

    if (!token) {
      throw new UnauthorizedError("Invalid or already used reset token");
    }

    if (token.usedAt) {
      throw new UnauthorizedError("Invalid or already used reset token");
    }

    if (token.expiresAt < new Date()) {
      throw new UnauthorizedError("Reset token has expired");
    }

    const [user] = await db
      .select({ id: users.id, isActive: users.isActive })
      .from(users)
      .where(and(eq(users.id, token.userId), isNull(users.deletedAt)));

    if (!user) {
      throw new UnauthorizedError("User account no longer exists");
    }

    if (!user.isActive) {
      throw new UnauthorizedError("User account is not allowed to authenticate");
    }

    const hashedPassword = await bcrypt.hash(newPassword, Config.auth.bcryptCost);

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, token.id));

      // Revoke all active sessions so the new password takes effect everywhere
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokens.userId, user.id),
            isNull(refreshTokens.revokedAt),
          ),
        );
    });
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
