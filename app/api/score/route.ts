// app/api/score/route.ts

import { NextResponse } from "next/server";
import { calculateThreatScore } from "@/lib/scoring/calculateScore";
import type { RedisThreat, BlacklistItem } from "@/types/redis";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    console.log("[SCORE] Starting threat scoring...");

    // Auth check (optional)
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { 
      geoData, 
      uniqueIPs, 
      hijackIPs, 
      blacklist, 
      topOrigins, 
      topAttacks 
    } = body;

    // ============================================
    // Build Country Hotness Map
    // ============================================
    const countryHotness = buildCountryHotness(topOrigins);

    // ============================================
    // Process & Score Threats
    // ============================================
    console.log("[SCORE] Scoring threats...");

    const threats: RedisThreat[] = [];

    for (let i = 0; i < geoData.length; i++) {
      const geo = geoData[i];
      const ip = uniqueIPs[i];

      const hijackSource = hijackIPs.find((h: any) => h.ip === ip);
      const abuseEntry = blacklist.find(
        (b: BlacklistItem) => b.ipAddress === ip,
      );

      const asn = extractASN(geo.as);
      if (!asn) continue;

      // Get country hotness
      const countryHotnessScore = countryHotness.get(geo.countryCode) || 0;

      // Calculate threat score with proper attack magnitude
      const threatScore = calculateThreatScore({
        abuseConfidence: abuseEntry?.abuseConfidenceScore || 0,
        totalReports: abuseEntry?.totalReports,
        lastReportedAt: abuseEntry?.lastReportedAt,

        bgpHijack: hijackSource
          ? {
              confidenceScore: hijackSource.hijack.confidence_score,
              duration: hijackSource.hijack.duration,
            }
          : undefined,

        countryCode: geo.countryCode,
        topAttacks: topAttacks,

        occurrenceCount: 1,
        firstSeenHoursAgo: 0,

        countryHotness: countryHotnessScore,
      });

      // Extract individual components for display
      const attackMagnitude = hijackSource
        ? calculateBGPAttackMagnitude(
            {
              confidenceScore: hijackSource.hijack.confidence_score,
              duration: hijackSource.hijack.duration,
            },
            geo.countryCode,
            topAttacks,
          )
        : calculateBlacklistAttackMagnitude(
            {
              totalReports: abuseEntry?.totalReports || 0,
              lastReportedAt:
                abuseEntry?.lastReportedAt || new Date().toISOString(),
            },
            geo.countryCode,
            topAttacks,
          );

      // Build threat object
      const threat: RedisThreat = {
        id: `${ip}_${Date.now()}`,
        ip,
        lat: geo.lat,
        lon: geo.lon,
        country: geo.country,
        countryCode: geo.countryCode,
        city: geo.city,
        asn,
        asnName: geo.org,
        isp: geo.isp,

        threatScore,
        abuseConfidence: abuseEntry?.abuseConfidenceScore || 0,
        attackMagnitude,
        countryHotness: countryHotnessScore,

        isHighThreat: threatScore > 75,
        isClusteredThreat: threatScore >= 50 && threatScore <= 75,

        dataSource: hijackSource ? "bgp_hijack" : "abuseipdb_blacklist",

        bgpHijack: hijackSource
          ? {
              eventId: hijackSource.hijack.id,
              hijackerASN: hijackSource.hijack.hijacker_asn,
              victimASN: hijackSource.hijack.victim_asns[0],
              confidenceScore: hijackSource.hijack.confidence_score,
              prefixes: hijackSource.hijack.prefixes,
              duration: hijackSource.hijack.duration,
            }
          : undefined,

        firstSeen: abuseEntry?.lastReportedAt || new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        occurrences: 1,
      };

      threats.push(threat);
    }

    console.log(`[SCORE] Generated ${threats.length} threats`);

    return NextResponse.json({
      success: true,
      data: {
        threats,
      },
      stats: {
        threatsGenerated: threats.length,
        highSeverity: threats.filter((t) => t.isHighThreat).length,
        clusteredThreats: threats.filter((t) => t.isClusteredThreat).length,
        bgpHijacks: threats.filter((t) => t.dataSource === "bgp_hijack").length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[SCORE] Error:", error);
    return NextResponse.json(
      { error: "Threat scoring failed", details: error },
      { status: 500 },
    );
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Build country hotness map from Cloudflare top origins
 */
function buildCountryHotness(topOrigins: any[]): Map<string, number> {
  const map = new Map<string, number>();

  topOrigins.forEach((origin: any, index: number) => {
    // Rank 1 = 100, Rank 2 = 80, Rank 3 = 60, Rank 4 = 40, Rank 5 = 20
    const score = Math.max(0, 100 - index * 20);
    map.set(origin.originCountryAlpha2, score);
  });

  return map;
}

function extractASN(asString: string | null): number | null {
  if (!asString) return null;
  const match = asString.match(/AS(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function calculateBGPAttackMagnitude(
  hijackEvent: any,
  countryCode: string,
  topAttacks: any[],
): number {
  // 1. Base score from BGP confidence (0-12 scale)
  // Scale to 0-50 (half of total magnitude)
  const bgpScore = (hijackEvent.confidence_score / 12) * 50;

  // 2. Country-level attack percentage
  const countryAttacks = topAttacks.filter(
    (attack: any) => attack.originCountryAlpha2 === countryCode,
  );

  const totalCountryAttackPercent = countryAttacks.reduce(
    (sum: number, attack: any) => sum + parseFloat(attack.value),
    0,
  );

  const countryScore = Math.min(30, totalCountryAttackPercent * 1.5);

  // 3. Hijack duration bonus
  const durationMinutes = hijackEvent.duration / 60;
  const durationScore = Math.min(20, durationMinutes / 10);

  return Math.round(bgpScore + countryScore + durationScore);
}

function calculateBlacklistAttackMagnitude(
  abuseEntry: any,
  countryCode: string,
  topAttacks: any[],
): number {
  // 1. Base score from total reports
  const reportScore = Math.min(40, abuseEntry.totalReports * 2);

  // 2. Country-level attack percentage
  const countryAttacks = topAttacks.filter(
    (attack: any) => attack.originCountryAlpha2 === countryCode,
  );

  const totalCountryAttackPercent = countryAttacks.reduce(
    (sum: number, attack: any) => sum + parseFloat(attack.value),
    0,
  );

  const countryScore = Math.min(30, totalCountryAttackPercent * 1.5);

  // 3. Recency bonus
  const lastReported = new Date(abuseEntry.lastReportedAt);
  const hoursSinceReport =
    (Date.now() - lastReported.getTime()) / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 30 - hoursSinceReport);

  return Math.round(reportScore + countryScore + recencyScore);
}