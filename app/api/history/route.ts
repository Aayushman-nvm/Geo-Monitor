// app/api/history/route.ts

import { NextResponse } from "next/server";
import type { AttackFlow, RawAttack, RedisHotspot } from "@/types/redis";
import centroidsArray from "@/data/country-centroid.json";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request: Request) {
  try {
    console.log("[HISTORY] Processing attack flows...");

    // Auth check (optional)
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { topAttacks, hotspots } = body;

    // Build hotspot coordinate map
    const hotspotMap = Object.fromEntries(
      hotspots.map((h: RedisHotspot) => [h.countryCode, h.coords]),
    );

    // Extract attack flows
    const attackFlows: AttackFlow[] = topAttacks
      .map((attack: RawAttack) => {
        const originCoords =
          hotspotMap[attack.originCountryAlpha2] ??
          getCountryCentroid(attack.originCountryAlpha2);

        const targetCoords =
          hotspotMap[attack.targetCountryAlpha2] ??
          getCountryCentroid(attack.targetCountryAlpha2);

        return {
          id: `${attack.originCountryAlpha2}_to_${attack.targetCountryAlpha2}`,
          originCountry: attack.originCountryName,
          originCountryCode: attack.originCountryAlpha2,
          targetCountry: attack.targetCountryName,
          targetCountryCode: attack.targetCountryAlpha2,
          magnitude: parseFloat(attack.value),
          originCoords,
          targetCoords,
        };
      })
      .filter((flow: AttackFlow) => flow.originCoords && flow.targetCoords);

    console.log(`[HISTORY] Extracted ${attackFlows.length} attack flows`);

    return NextResponse.json({
      success: true,
      data: {
        attackFlows,
      },
      stats: {
        flowsGenerated: attackFlows.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[HISTORY] Error:", error);
    return NextResponse.json(
      { error: "Attack flow processing failed", details: error },
      { status: 500 },
    );
  }
}

// ============================================
// Helper Functions
// ============================================

type Centroid = { lat: number; lon: number };

// Build a lookup map once
const centroidMap: Record<string, Centroid> = Object.fromEntries(
  centroidsArray.map((c: any) => [
    c.alpha2,
    { lat: c.latitude, lon: c.longitude },
  ]),
);

export function getCountryCentroid(countryCode: string): Centroid | null {
  return centroidMap[countryCode.toUpperCase()] || null;
}