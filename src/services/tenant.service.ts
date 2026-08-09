import { eq } from "drizzle-orm";
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

  async getTenants(){
    return await db.select().from(tenants);
  }

  async getTenantById(id: string){
    return await db.select().from(tenants).where(eq(tenants.id, id));
  }

  async updateTenant(id: string, body: TenantBody){
    return await db.update(tenants).set(body).where(eq(tenants.id, id)).returning({
      id: tenants.id,
      name: tenants.name,
      description: tenants.description
    });
  }

  async deleteTenant(id: string){
    return await db.delete(tenants).where(eq(tenants.id, id)).returning({
      id: tenants.id,
      name: tenants.name,
      description: tenants.description
    });
  }

}
