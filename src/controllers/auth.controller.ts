import { Context } from "hono";
import { setCookie } from "hono/cookie";
import { AuthService } from "../services/auth.service";
import type { RegisterBody } from "../config/register.schema";
import {
  generateAccessToken,
  generateRefreshToken,
  parseDurationToSeconds,
} from "../utils/jwt";
import { Config } from "../config";

export class AuthController {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  async register(c: Context, body: RegisterBody) {
    const { email, password, firstName, lastName } = body;

    const [user] = await this.authService.register({
      email,
      password,
      firstName,
      lastName,
    });

    const jwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      generateAccessToken(jwtPayload),
      generateRefreshToken(jwtPayload),
    ]);

    const isProduction = process.env.NODE_ENV === "production";

    const baseCookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "Strict" as const,
      path: "/",
    };

    setCookie(c, "access_token", accessToken, {
      ...baseCookieOptions,
      maxAge: parseDurationToSeconds(Config.jwt.accessExpiresIn),
    });

    setCookie(c, "refresh_token", refreshToken, {
      ...baseCookieOptions,
      maxAge: parseDurationToSeconds(Config.jwt.refreshExpiresIn),
      path: "/api/v1/auth", // only sent to auth endpoints
    });

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
}
