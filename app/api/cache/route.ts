// app/api/cache/route.ts

import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    console.log("[CACHE] Storing data in Redis...");

    // Auth check (optional)
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { threats, hotspots, stats, attackFlows } = body;

    // Store all data in Redis with 24 hour expiry
    await Promise.all([
      redis.set("threats:latest", JSON.stringify(threats), { ex: 900 }),
      redis.set("hotspots:latest", JSON.stringify(hotspots), { ex: 900 }),
      redis.set("stats:summary", JSON.stringify(stats), { ex: 900 }),
      redis.set("flows:latest", JSON.stringify(attackFlows), { ex: 900 }),
    ]);

    console.log("[CACHE] All data stored successfully");

    return NextResponse.json({
      success: true,
      stored: {
        threats: threats.length,
        hotspots: hotspots.length,
        attackFlows: attackFlows.length,
        stats: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CACHE] Error:", error);
    return NextResponse.json(
      { error: "Cache storage failed", details: error },
      { status: 500 },
    );
  }
}

// Optional: GET endpoint to retrieve cached data
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json(
        { error: "Missing 'key' query parameter" },
        { status: 400 },
      );
    }

    const data = await redis.get(key);

    if (!data) {
      return NextResponse.json(
        { error: "Key not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      key,
      data: JSON.parse(data as string),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CACHE] GET Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve cache", details: error },
      { status: 500 },
    );
  }
}

// Optional: DELETE endpoint to clear specific cache keys
export async function DELETE(request: Request) {
  try {
    // Auth check
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json(
        { error: "Missing 'key' query parameter" },
        { status: 400 },
      );
    }

    await redis.del(key);

    return NextResponse.json({
      success: true,
      deleted: key,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CACHE] DELETE Error:", error);
    return NextResponse.json(
      { error: "Failed to delete cache key", details: error },
      { status: 500 },
    );
  }
}