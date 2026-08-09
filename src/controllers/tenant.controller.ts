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
    return c.json({
      success: true,
      message: "Tenant created successfully",
      data: {
        tenantId: tenant[0].id,
      },
      status: 201,
    }, 201);
  }

  async getTenants(c: Context){
    const tenants = await this.tenantService.getTenants();
    return c.json({
      success: true,
      message: "Tenants fetched successfully",
      data: tenants,
      status: 200,
    }, 200);
  }

  async getTenantById(c: Context, id: string){
    const tenant = await this.tenantService.getTenantById(id);
      return c.json({
      success: true,
      message: "Tenant fetched successfully",
      data: tenant,
      status: 200,
    }, 200  );
  }
  
  async updateTenant(c: Context, id: string, body: TenantBody){
    const tenant = await this.tenantService.updateTenant(id, body);
    return c.json({
      success: true,
      message: "Tenant updated successfully",
      data: tenant,
      status: 200,
    }, 200);
  }

  async deleteTenant(c: Context, id: string){
    await this.tenantService.deleteTenant(id);
    return c.json({
      success: true,
      message: "Tenant deleted successfully",
      status: 200,
    }, 200);
  }
}
