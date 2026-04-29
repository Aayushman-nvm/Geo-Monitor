import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import type { RedisThreat, RedisHotspot, RedisStats, AttackFlow } from "@/types/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [threats, hotspots, stats, attackFlow] = await Promise.all([
      redis.get<RedisThreat[]>('threats:latest'),
      redis.get<RedisHotspot[]>('hotspots:latest'),
      redis.get<RedisStats>('stats:summary'),
      redis.get<AttackFlow[]>('flows:latest'),
    ]);

    

    return NextResponse.json({
      success: true,
      data: {
        threats,
        hotspots,
        stats,
        attackFlow
      },
      cachedAt: stats?.lastUpdated || new Date().toISOString()
    });
  } catch (error) {
    console.error("[API] Error fetching threats:", error);
    return NextResponse.json(
      { error: "Failed to fetch threats" },
      { status: 500 },
    );
  }
}
