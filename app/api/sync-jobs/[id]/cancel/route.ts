import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncJobs } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return NextResponse.json({ error: `Cannot cancel job in status ${job.status}` }, { status: 400 });
  }

  // Mark as cancelled - cancellation semantics: stop subsequent work, record actual result
  await db
    .update(syncJobs)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(syncJobs.id, jobId));

  return NextResponse.json({ data: { id: jobId, status: "cancelled" } });
}
