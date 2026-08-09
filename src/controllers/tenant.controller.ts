import { Context } from "hono";
import { TenantService } from "../services/tenant.service";
import { TenantBody } from "../config/tenant.schema";

export class TenantController {

  private tenantService: TenantService;

  constructor(tenantService: TenantService) {
    this.tenantService = tenantService;
  }

  async createTenant(c: Context, body: TenantBody){
    const tenant = await this.tenantService.createTenant(body);
    return c.json(tenant[0].id);
  }
}
