import { Context } from "hono";
import { AuthService } from "../services/auth.service";

export class AuthController {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  async register(c: Context) {
    const { email, password, firstName, lastName } = await c.req.json();

    const user = await this.authService.register({
      email,
      password,
      firstName,
      lastName,
    });
    return c.json(
      {
        success: true,
        message: "User registered successfully",
        data: {
          user,
          // token
        },
        status: 201,
      },
      201,
    );
  }
}
