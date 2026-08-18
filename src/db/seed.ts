/**
 * Development seed script
 *
 * Creates:
 *   - 5 tenants (restaurants)
 *   - 5 managers (1 per tenant)
 *   - 10 staff (2 per tenant)
 *   - 50 customers (10 per tenant)
 *   - 1 platform admin (no tenant)
 *
 * All passwords: Qwerty123
 *
 * Usage:  bun run src/db/seed.ts
 */

import * as bcrypt from "bcrypt";
import { inArray } from "drizzle-orm";
import { db } from "./connection";
import { tenants, users } from "./schema";

const SEED_PASSWORD = "Qwerty123";
const BCRYPT_COST = 12;
const CUSTOMERS_PER_TENANT = 10;

// ── Data ────────────────────────────────────────────────────────────

const restaurantNames = [
  {
    name: "The Golden Fork",
    description: "Fine dining with a modern twist",
    location: "New York, NY",
  },
  {
    name: "Sakura Bento",
    description: "Authentic Japanese cuisine",
    location: "Los Angeles, CA",
  },
  {
    name: "Bella Napoli",
    description: "Traditional Italian pizzeria",
    location: "Chicago, IL",
  },
  {
    name: "Spice Route",
    description: "Indian & Thai fusion restaurant",
    location: "Houston, TX",
  },
  {
    name: "Coastal Catch",
    description: "Fresh seafood by the bay",
    location: "Miami, FL",
  },
];

const managerNames = [
  { firstName: "Alice", lastName: "Johnson" },
  { firstName: "Bob", lastName: "Williams" },
  { firstName: "Carlos", lastName: "Garcia" },
  { firstName: "Diana", lastName: "Patel" },
  { firstName: "Edward", lastName: "Kim" },
];

const staffPool = [
  { firstName: "Frank", lastName: "Miller" },
  { firstName: "Grace", lastName: "Lee" },
  { firstName: "Henry", lastName: "Davis" },
  { firstName: "Iris", lastName: "Chen" },
  { firstName: "Jack", lastName: "Brown" },
  { firstName: "Karen", lastName: "Singh" },
  { firstName: "Liam", lastName: "Wilson" },
  { firstName: "Mia", lastName: "Lopez" },
  { firstName: "Noah", lastName: "Anderson" },
  { firstName: "Olivia", lastName: "Taylor" },
];

const customerPool = [
  { firstName: "Zoe", lastName: "Adams" },
  { firstName: "Aaron", lastName: "Baker" },
  { firstName: "Bella", lastName: "Clark" },
  { firstName: "Chris", lastName: "Dixon" },
  { firstName: "Daisy", lastName: "Evans" },
  { firstName: "Ethan", lastName: "Foster" },
  { firstName: "Fiona", lastName: "Green" },
  { firstName: "George", lastName: "Hall" },
  { firstName: "Hannah", lastName: "Ingram" },
  { firstName: "Ivan", lastName: "Jones" },
  { firstName: "Julia", lastName: "King" },
  { firstName: "Kevin", lastName: "Lambert" },
  { firstName: "Laura", lastName: "Mitchell" },
  { firstName: "Mike", lastName: "Nelson" },
  { firstName: "Nina", lastName: "Owens" },
  { firstName: "Oscar", lastName: "Perry" },
  { firstName: "Paula", lastName: "Quinn" },
  { firstName: "Quinn", lastName: "Roberts" },
  { firstName: "Rachel", lastName: "Stewart" },
  { firstName: "Sam", lastName: "Turner" },
  { firstName: "Tina", lastName: "Underwood" },
  { firstName: "Uma", lastName: "Vance" },
  { firstName: "Victor", lastName: "Wallace" },
  { firstName: "Wendy", lastName: "Xu" },
  { firstName: "Xander", lastName: "Young" },
  { firstName: "Yara", lastName: "Zhang" },
  { firstName: "Zach", lastName: "Allen" },
  { firstName: "Amy", lastName: "Brooks" },
  { firstName: "Ben", lastName: "Carter" },
  { firstName: "Chloe", lastName: "Diaz" },
  { firstName: "Derek", lastName: "Edwards" },
  { firstName: "Emma", lastName: "Fleming" },
  { firstName: "Felix", lastName: "Gomez" },
  { firstName: "Gina", lastName: "Harris" },
  { firstName: "Hugo", lastName: "Ivanov" },
  { firstName: "Irene", lastName: "Jensen" },
  { firstName: "Jake", lastName: "Kowalski" },
  { firstName: "Kira", lastName: "Liu" },
  { firstName: "Leo", lastName: "Morales" },
  { firstName: "Maya", lastName: "Nguyen" },
];

// ── Helpers ─────────────────────────────────────────────────────────

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function buildCustomerEmail(tenantIndex: number, customerIndex: number) {
  return `customer.t${tenantIndex + 1}.${customerIndex + 1}@customer.com`;
}

async function clearPreviousSeedData() {
  const seedTenantNames = restaurantNames.map((restaurant) => restaurant.name);

  // Deleting seed tenants cascades to their users due to FK on users.tenantId
  await db.delete(tenants).where(inArray(tenants.name, seedTenantNames));

  // Platform admin has no tenant, so remove it explicitly.
  await db.delete(users).where(inArray(users.email, ["admin@codebuff.com"]));
}

// ── Main ────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Seeding database…\n");

  await clearPreviousSeedData();

  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST);

  // 1. Platform admin (no tenant)
  const [admin] = await db
    .insert(users)
    .values({
      firstName: "Super",
      lastName: "Admin",
      email: "admin@codebuff.com",
      password: hashedPassword,
      role: "admin",
      tenantId: null,
    })
    .returning({ id: users.id });

  console.log(`  ✅ Platform admin  → admin@codebuff.com  (id: ${admin.id})`);

  // 2. Tenants
  const insertedTenants = await db
    .insert(tenants)
    .values(restaurantNames)
    .returning({ id: tenants.id, name: tenants.name });

  console.log(`  ✅ Tenants created → ${insertedTenants.length}`);

  // 3. Managers (1 per tenant)
  const managerInserts = insertedTenants.map((t, i) => ({
    firstName: managerNames[i].firstName,
    lastName: managerNames[i].lastName,
    email: `${managerNames[i].firstName.toLowerCase()}@restaurant.com`,
    password: hashedPassword,
    role: "manager" as const,
    tenantId: t.id,
  }));

  const insertedManagers = await db
    .insert(users)
    .values(managerInserts)
    .returning({
      id: users.id,
      firstName: users.firstName,
      tenantId: users.tenantId,
    });

  for (const m of insertedManagers) {
    const restaurant = insertedTenants.find((t) => t.id === m.tenantId);
    console.log(
      `  ✅ Manager          → ${m.firstName} @ ${restaurant?.name ?? "?"}`,
    );
  }

  // 4. Staff (2 per tenant)
  const staffChunks = chunks(staffPool, 2); // [[0,1], [2,3], ...]
  const staffInserts = insertedTenants.flatMap((t, tenantIdx) =>
    staffChunks[tenantIdx].map((s) => ({
      firstName: s.firstName,
      lastName: s.lastName,
      email: `${s.firstName.toLowerCase()}@restaurant.com`,
      password: hashedPassword,
      role: "staff" as const,
      tenantId: t.id,
    })),
  );

  const insertedStaff = await db.insert(users).values(staffInserts).returning({
    id: users.id,
    firstName: users.firstName,
    tenantId: users.tenantId,
  });

  for (const s of insertedStaff) {
    const restaurant = insertedTenants.find((t) => t.id === s.tenantId);
    console.log(
      `  ✅ Staff            → ${s.firstName} @ ${restaurant?.name ?? "?"}`,
    );
  }

  // 5. Customers (10 per tenant)
  const customerInserts = insertedTenants.flatMap((t, tenantIdx) =>
    Array.from({ length: CUSTOMERS_PER_TENANT }, (_, customerIdx) => {
      const customer =
        customerPool[
          (tenantIdx * CUSTOMERS_PER_TENANT + customerIdx) % customerPool.length
        ];

      return {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: buildCustomerEmail(tenantIdx, customerIdx),
        password: hashedPassword,
        role: "customer" as const,
        tenantId: t.id,
      };
    }),
  );

  await db.insert(users).values(customerInserts);

  console.log(
    `  ✅ Customers        → ${customerInserts.length} across all tenants`,
  );

  console.log(`\n🎉 Done!  All passwords are "${SEED_PASSWORD}"\n`);
  console.log("  Accounts:");
  console.log("    admin@codebuff.com          (platform admin)");
  for (let i = 0; i < managerNames.length; i++) {
    const email = `${managerNames[i].firstName.toLowerCase()}@restaurant.com`;
    console.log(
      `    ${email.padEnd(30)} (manager – ${restaurantNames[i].name})`,
    );
  }
  console.log(
    `\n  Total rows:  1 admin + 5 managers + 10 staff + 50 customers = 66 users`,
  );

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
