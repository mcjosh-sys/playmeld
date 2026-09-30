import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncJobs, connectedAccounts, workspaces } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createSyncJobSchema } from "@/lib/validations";

export const runtime = "nodejs";

// List sync jobs with ownership check
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.userId, session.user.id))
    .orderBy(desc(syncJobs.createdAt))
    .limit(50);

  return NextResponse.json({ data: jobs });
}

// Create sync job - must verify ownership of source and destination accounts
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createSyncJobSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
    }

    const {
      sourceAccountId,
      destinationAccountId,
      sourcePlaylistId,
      createNewPlaylist,
      destinationPlaylistName,
      destinationPlaylistDescription,
      preserveDuplicates,
      preserveOrder,
    } = parsed.data;

    // Ownership checks - both accounts must belong to authenticated user
    const [sourceAccount] = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, sourceAccountId), eq(connectedAccounts.userId, session.user.id)))
      .limit(1);

    if (!sourceAccount) {
      return NextResponse.json({ error: "Source account not found or not owned" }, { status: 404 });
    }

    const [destAccount] = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, destinationAccountId), eq(connectedAccounts.userId, session.user.id)))
      .limit(1);

    if (!destAccount) {
      return NextResponse.json({ error: "Destination account not found or not owned" }, { status: 404 });
    }

    // Get user's workspace for billing check
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, session.user.id))
      .limit(1);

    // TODO: Check billing limits server-side (enforce plan limits)
    // For now allow all

    // Create sync job - pending, will be processed async
    const [job] = await db
      .insert(syncJobs)
      .values({
        userId: session.user.id,
        workspaceId: workspace?.id,
        sourceAccountId,
        destinationAccountId,
        sourcePlaylistId,
        sourcePlaylistName: destinationPlaylistName || sourcePlaylistId, // will be updated after reading source
        status: "pending",
        config: {
          createNewPlaylist,
          preserveDuplicates,
          preserveOrder,
          description: destinationPlaylistDescription,
        },
      })
      .returning();

    // In a real implementation, enqueue job to worker
    // For MVP, job is created and will be processed by separate worker endpoint or background task
    // Return 202 Accepted with job id

    return NextResponse.json({ data: job }, { status: 202 });
  } catch (err) {
    console.error("Error creating sync job", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to create sync job" }, { status: 500 });
  }
}
