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
import { authenticate } from "../middleware/auth";
import { canAccess } from "../middleware/can-access";
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

authRoutes.post("/forgot-password", validateBody(forgotPasswordSchema), (c) =>
  authController.forgotPassword(c, c.req.valid("json") as ForgotPasswordBody),
);

authRoutes.post("/reset-password", validateBody(resetPasswordSchema), (c) =>
  authController.resetPassword(c, c.req.valid("json") as ResetPasswordBody),
);

authRoutes.get("/sessions", authenticate, (c) => authController.getSessions(c));

authRoutes.delete("/sessions/:id", authenticate, (c) =>
  authController.revokeSession(c, c.req.param("id")),
);

// ─── Admin session management ─────────────────────────────────────────

authRoutes.get(
  "/admin/users/:userId/sessions",
  authenticate,
  canAccess("admin"),
  (c) => authController.adminGetUserSessions(c, c.req.param("userId")),
);

authRoutes.delete(
  "/admin/users/:userId/sessions/:sessionId",
  authenticate,
  canAccess("admin"),
  (c) =>
    authController.adminRevokeUserSession(
      c,
      c.req.param("userId"),
      c.req.param("sessionId"),
    ),
);

authRoutes.delete(
  "/admin/users/:userId/sessions",
  authenticate,
  canAccess("admin"),
  (c) => authController.adminRevokeAllUserSessions(c, c.req.param("userId")),
);

export default authRoutes;
