import { TenantBody } from "../config/tenant.schema";
import { db } from "../db/connection";
import { tenants } from "../db/schema";

export class TenantService {    

  async createTenant(body: TenantBody){
    return await db.insert(tenants).values({
      name: body.name,
      description: body.description
    }).returning({
      id: tenants.id,
      name: tenants.name,
      description: tenants.description
    });
  }

}
