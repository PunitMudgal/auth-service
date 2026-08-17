import { Context } from "hono";
import { getCookie } from "hono/cookie";
import { AuthService } from "../services/auth.service";
import type { LoginBody } from "../config/login.schema";
import type { RegisterBody } from "../config/register.schema";
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
import { UnauthorizedError } from "../utils/errors";

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
}
