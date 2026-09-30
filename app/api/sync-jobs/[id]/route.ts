import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncJobs, syncRuns, syncItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

// Get sync job with ownership check
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = params.id;

  const [job] = await db
    .select()
    .from(syncJobs)
    .where(and(eq(syncJobs.id, jobId), eq(syncJobs.userId, session.user.id)))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: "Sync job not found" }, { status: 404 });
  }

  // Get runs and items for this job
  const runs = await db.select().from(syncRuns).where(eq(syncRuns.syncJobId, jobId));
  const items = await db.select().from(syncItems).where(eq(syncItems.syncJobId, jobId)).limit(100);

  return NextResponse.json({
    data: {
      job,
      runs,
      items,
    },
  });
}
