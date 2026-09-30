/**
 * Development seed data
 * Run with: npm run db:seed
 * 
 * Note: This uses Neon DB, so be careful not to pollute prod
 * Only run in development with a dev database
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";
import { createId } from "@paralleldrive/cuid2";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

async function main() {
  console.log("Seeding database...");

  // Create a test user
  const testUserId = createId();
  const testUser = {
    id: testUserId,
    email: "test@playmeld.local",
    name: "Test User",
    emailVerified: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    await db.insert(schema.users).values(testUser).onConflictDoNothing();
    console.log("Created test user:", testUser.email);
  } catch (e) {
    console.log("Test user may already exist");
  }

  // Create workspace
  const workspaceId = createId();
  try {
    await db.insert(schema.workspaces).values({
      id: workspaceId,
      name: "Test Workspace",
      slug: `test-ws-${testUserId.slice(0, 6)}`,
      ownerId: testUserId,
      plan: "pro",
    });
    console.log("Created test workspace");
  } catch (e) {
    console.log("Workspace may already exist");
  }

  console.log("Seeding complete");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed", err);
    process.exit(1);
  });
