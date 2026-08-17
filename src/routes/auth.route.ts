import { Hono } from "hono";
import { AuthController } from "../controllers/auth.controller";
import { AuthService } from "../services/auth.service";
import { loginSchema } from "../config/login.schema";
import type { LoginBody } from "../config/login.schema";
import { registerSchema } from "../config/register.schema";
import type { RegisterBody } from "../config/register.schema";
import { forgotPasswordSchema } from "../config/password-reset.schema";
import type { ForgotPasswordBody } from "../config/password-reset.schema";
import { resetPasswordSchema } from "../config/password-reset.schema";
import type { ResetPasswordBody } from "../config/password-reset.schema";
import { validateBody } from "../middleware/validate-body";
const authRoutes = new Hono();
const authController = new AuthController(new AuthService());

authRoutes.post("/register", validateBody(registerSchema), (c) =>
  authController.register(c, c.req.valid("json") as RegisterBody),
);

authRoutes.post("/login", validateBody(loginSchema), (c) =>
  authController.login(c, c.req.valid("json") as LoginBody),
);

authRoutes.post("/refresh", (c) => authController.refresh(c));

authRoutes.post("/logout", (c) => authController.logout(c));

authRoutes.post(
  "/forgot-password",
  validateBody(forgotPasswordSchema),
  (c) => authController.forgotPassword(c, c.req.valid("json") as ForgotPasswordBody),
);

authRoutes.post(
  "/reset-password",
  validateBody(resetPasswordSchema),
  (c) => authController.resetPassword(c, c.req.valid("json") as ResetPasswordBody),
);

export default authRoutes;
