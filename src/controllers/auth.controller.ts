import { Context } from "hono";
import { getCookie } from "hono/cookie";
import { AuthService } from "../services/auth.service";
import type { LoginBody } from "../config/login.schema";
import type { RegisterBody } from "../config/register.schema";
import type {
  ForgotPasswordBody,
  ResetPasswordBody,
} from "../config/password-reset.schema";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  verifyRefreshToken,
} from "../utils/jwt";
import {
  clearAuthCookies,
  getDeviceInfo,
  getRefreshExpiry,
  setAuthCookies,
} from "../utils/cookie";
import { NotFoundError, UnauthorizedError } from "../utils/errors";
import { sendPasswordResetEmail } from "../services/email.service";

export class AuthController {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  async register(c: Context, body: RegisterBody) {
    const { email, password, firstName, lastName } = body;

    const user = await this.authService.register({
      email,
      password,
      firstName,
      lastName,
    });

    const authPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      generateAccessToken(authPayload),
      generateRefreshToken(authPayload),
    ]);

    const refreshTokenHash = await hashToken(refreshToken);
    const { expiresAt } = getRefreshExpiry();
    const { ipAddress, userAgent } = getDeviceInfo(c);

    await this.authService.persistRefreshToken({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
      ipAddress,
      userAgent,
    });

    setAuthCookies(c, accessToken, refreshToken);

    return c.json(
      {
        success: true,
        message: "User registered successfully",
        data: {
          user: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
          },
        },
        status: 201,
      },
      201,
    );
  }

  async login(c: Context, body: LoginBody) {
    const { email, password } = body;

    const user = await this.authService.login({ email, password });

    const authPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      generateAccessToken(authPayload),
      generateRefreshToken(authPayload),
    ]);

    const refreshTokenHash = await hashToken(refreshToken);
    const { expiresAt } = getRefreshExpiry();
    const { ipAddress, userAgent } = getDeviceInfo(c);

    await this.authService.persistRefreshToken({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
      ipAddress,
      userAgent,
    });

    setAuthCookies(c, accessToken, refreshToken);

    return c.json(
      {
        success: true,
        message: "Login successful",
        data: {
          user: {
            id: user.id,
            tenantId: user.tenantId,
          },
        },
        status: 200,
      },
      200,
    );
  }

  async forgotPassword(c: Context, body: ForgotPasswordBody) {
    const result = await this.authService.createPasswordResetToken(body.email);

    // Always respond the same way so callers can't tell whether an email is
    // registered. In production, the token is emailed to the user.
    if (result) {
      await sendPasswordResetEmail(body.email, result.token, result.firstName);
    }

    return c.json(
      {
        success: true,
        message: "If that email is registered, a reset link has been sent",
        status: 200,
      },
      200,
    );
  }

  async resetPassword(c: Context, body: ResetPasswordBody) {
    await this.authService.resetPassword(body.token, body.newPassword);

    return c.json(
      {
        success: true,
        message: "Password reset successfully. All sessions have been terminated.",
        status: 200,
      },
      200,
    );
  }

  async getSessions(c: Context) {
    const { sub } = c.get("user");
    const rawToken = getCookie(c, "refresh_token");
    const currentTokenHash = rawToken ? await hashToken(rawToken) : undefined;

    const items = await this.authService.getActiveSessions(sub, currentTokenHash);

    return c.json(
      {
        success: true,
        message: "Sessions fetched successfully",
        data: { items },
        status: 200,
      },
      200,
    );
  }

  async revokeSession(c: Context, id: string) {
    const { sub } = c.get("user");
    const revokedTokenHash = await this.authService.revokeSession(sub, id);

    if (!revokedTokenHash) {
      throw new NotFoundError("Session not found");
    }

    // If the user revoked the session they are currently using, clear the cookies
    const rawToken = getCookie(c, "refresh_token");
    if (rawToken && (await hashToken(rawToken)) === revokedTokenHash) {
      clearAuthCookies(c);
    }

    return c.json(
      {
        success: true,
        message: "Session revoked successfully",
        status: 200,
      },
      200,
    );
  }

  async logout(c: Context) {
    const rawToken = getCookie(c, "refresh_token");

    if (rawToken) {
      const tokenHash = await hashToken(rawToken);
      await this.authService.revokeRefreshTokenByHash(tokenHash);
    }

    void this.authService.cleanupRefreshTokens();

    clearAuthCookies(c);

    return c.json({
      success: true,
      message: "Logged out successfully",
      status: 200,
    });
  }

  async refresh(c: Context) {
    const rawToken = getCookie(c, "refresh_token");
    if (!rawToken) {
      throw new UnauthorizedError("Refresh token not provided");
    }

    const payload = await verifyRefreshToken(rawToken);
    const oldTokenHash = await hashToken(rawToken);
    const existingToken =
      await this.authService.getRefreshTokenByHashUnfiltered(oldTokenHash);

    if (!existingToken) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    if (existingToken.revokedAt) {
      await this.authService.revokeAllUserRefreshTokens(existingToken.userId);
      throw new UnauthorizedError(
        "Refresh token reused — all sessions terminated for security",
      );
    }

    if (existingToken.expiresAt < new Date()) {
      throw new UnauthorizedError("Refresh token has expired");
    }

    const user = await this.authService.getUserForRefresh(payload.sub);
    const { expiresAt } = getRefreshExpiry();
    const { ipAddress, userAgent } = getDeviceInfo(c);

    const newRefreshToken = await generateRefreshToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });
    const newTokenHash = await hashToken(newRefreshToken);

    await this.authService.rotateRefreshToken({
      oldTokenHash,
      newTokenHash,
      userId: user.id,
      expiresAt,
      ipAddress,
      userAgent,
    });

    const accessToken = await generateAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });

    setAuthCookies(c, accessToken, newRefreshToken);

    void this.authService.cleanupRefreshTokens();

    return c.json({
      success: true,
      message: "Token refreshed successfully",
      status: 200,
    });
  }

  // ─── Admin session management ───────────────────────────────────────

  /**
   * Admin: list all sessions for any user.
   */
  async adminGetUserSessions(c: Context, userId: string) {
    const sessions = await this.authService.adminGetUserSessions(userId);

    return c.json({
      success: true,
      message: "Sessions fetched successfully",
      data: { items: sessions },
      status: 200,
    });
  }

  /**
   * Admin: revoke a single session for any user.
   */
  async adminRevokeUserSession(
    c: Context,
    userId: string,
    sessionId: string,
  ) {
    const revoked = await this.authService.adminRevokeUserSession(
      userId,
      sessionId,
    );

    if (!revoked) {
      throw new NotFoundError("Session not found or already revoked");
    }

    return c.json({
      success: true,
      message: "Session revoked successfully",
      status: 200,
    });
  }

  /**
   * Admin: revoke all sessions for a user.
   */
  async adminRevokeAllUserSessions(c: Context, userId: string) {
    const count = await this.authService.adminRevokeAllUserSessions(userId);

    return c.json({
      success: true,
      message: `${count} session(s) revoked successfully`,
      data: { revokedCount: count },
      status: 200,
    });
  }
}
