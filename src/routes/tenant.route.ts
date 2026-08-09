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

tenantRoutes.get("/", authenticate, canAccess("admin"), (c) =>
  tenantController.getTenants(c),
);

tenantRoutes.get("/:id", authenticate, canAccess("admin"), (c) =>
  tenantController.getTenantById(c, c.req.param("id")),
);

tenantRoutes.put(
  "/:id",
  authenticate,
  canAccess("admin"),
  validateBody(tenantSchema),
  (c) =>
    tenantController.updateTenant(
      c,
      c.req.param("id"),
      c.req.valid("json") as TenantBody,
    ),
);

tenantRoutes.delete("/:id", authenticate, canAccess("admin"), (c) =>
  tenantController.deleteTenant(c, c.req.param("id")),
);

export default tenantRoutes;
