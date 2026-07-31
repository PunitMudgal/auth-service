import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/connection";
import { refreshTokens, users } from "../db/schema";
import type { RegisterUser } from "../types";
import * as bcrypt from "bcrypt";
import {
  ConflictError,
  UnauthorizedError,
} from "../utils/errors";

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

export class AuthService {
  async register({ email, password, firstName, lastName }: RegisterUser) {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (existingUser.length > 0) {
      throw new ConflictError("User already exists!");
    }
    const hashedPassword = await bcrypt.hash(password, 3);
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
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
      });
    return user;
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
}
