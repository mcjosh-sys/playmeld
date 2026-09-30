import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "playmeld",
    version: "0.1.0",
  });
}

export const runtime = "nodejs";
