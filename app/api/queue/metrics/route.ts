import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getQueueMetrics } from "@/lib/queue";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only allow for monitoring - in prod, restrict to admin or specific users
  // For now, allow any authenticated user to see metrics (safe, no secrets)

  try {
    const metrics = await getQueueMetrics();

    if (!metrics) {
      return NextResponse.json({
        data: {
          status: "redis_not_available",
          message: "BullMQ requires REDIS_URL. Using DB fallback for Vercel.",
          fallback: "Use /api/cron/process-pending-jobs or /api/sync-jobs/[id]/process for manual processing",
        },
      });
    }

    return NextResponse.json({ data: metrics });
  } catch (err) {
    console.error("Error getting queue metrics", err);
    return NextResponse.json({ error: "Failed to get metrics" }, { status: 500 });
  }
}
