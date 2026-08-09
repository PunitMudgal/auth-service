import { Hono } from "hono";
import { TenantController } from "../controllers/tenant.controller";
import { TenantService } from "../services/tenant.service";
import { TenantBody, tenantSchema } from "../config/tenant.schema";
import { validateBody } from "../middleware/validate-body";
import { canAccess } from "../middleware/can-access";
import { authenticate } from "../middleware/auth";

const tenantRoutes = new Hono();
const tenantController = new TenantController(new TenantService());

tenantRoutes.post(
  "/",
  authenticate,
  canAccess("admin"),
  validateBody(tenantSchema),
  (c) =>
    tenantController.createTenant(c, c.req.valid("json") as TenantBody),
);

export default tenantRoutes;
