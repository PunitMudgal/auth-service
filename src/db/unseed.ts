/**
 * Development unseed script
 *
 * Removes seed data created by src/db/seed.ts:
 *   - seed tenants (and cascaded tenant users)
 *   - platform admin account
 *
 * Usage: bun run src/db/unseed.ts
 */

import { inArray } from "drizzle-orm";
import { db } from "./connection";
import { tenants, users } from "./schema";

const seedTenantNames = [
  "The Golden Fork",
  "Sakura Bento",
  "Bella Napoli",
  "Spice Route",
  "Coastal Catch",
];

const seedAdminEmail = "admin@codebuff.com";

async function unseed() {
  console.log("🧹 Removing seeded data...\n");

  // Deleting tenants first cascades to managers/staff/customers in those tenants.
  const deletedTenants = await db
    .delete(tenants)
    .where(inArray(tenants.name, seedTenantNames))
    .returning({ id: tenants.id, name: tenants.name });

  const deletedAdmins = await db
    .delete(users)
    .where(inArray(users.email, [seedAdminEmail]))
    .returning({ id: users.id, email: users.email });

  console.log(`  ✅ Deleted tenants      → ${deletedTenants.length}`);
  console.log(`  ✅ Deleted admin users  → ${deletedAdmins.length}`);
  console.log("\n🎉 Unseed complete\n");

  process.exit(0);
}

unseed().catch((err) => {
  console.error("❌ Unseed failed:", err);
  process.exit(1);
});
