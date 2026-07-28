import { pgTable, text, timestamp, varchar, unique } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
    firstName: varchar("first_name", {length: 100}).notNull(),
    lastName: varchar("last_name", {length: 100}).notNull(),
    email:varchar("email", {length: 255}).notNull().unique(),
    password:varchar("password", {length: 255}).notNull(),
    createdAt:timestamp("created_at", {mode: "date"}).defaultNow().notNull(),
    updatedAt:timestamp("updated_at", {mode: "date"}).defaultNow().notNull(),
}, (table) => [
    unique("email_unique").on(table.email),
]);