import { Hono } from "hono";
import { AuthController } from "../controllers/auth.controller";
import { AuthService } from "../services/auth.service";
const authRoutes = new Hono();
const authController = new AuthController(new AuthService());

authRoutes.post("/register", (c) => authController.register(c));

export default authRoutes;
