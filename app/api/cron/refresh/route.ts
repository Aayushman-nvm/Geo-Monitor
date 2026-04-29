// app/api/cron/refresh/route.ts

import { NextResponse } from "next/server";
import { getTraffic, getAnomalies } from "@/services/cloudflare";
import { getBlacklist } from "@/services/abuseipdb";
import { geolocateBatch } from "@/services/geolocateIP";
import { calculateThreatScore } from "@/lib/scoring/calculateScore";
import { redis } from "@/lib/redis";
import type {
  RedisThreat,
  RedisHotspot,
  RedisStats,
  AttackFlow,
  RawAttack,
  BlacklistItem,
} from "@/types/redis";
import centroidsArray from "@/data/country-centroid.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    console.log("[CRON] Starting refresh...");

    // Auth check
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ============================================
    // STEP 1: Fetch Cloudflare Data
    // ============================================
    console.log("[CRON] Fetching Cloudflare data...");

    const [trafficData, anomalyData] = await Promise.all([
      getTraffic(),
      getAnomalies(),
    ]);

    // Cache raw responses for debugging
    await Promise.all([
      redis.set(
        "cloudflare:attacks:raw",
        JSON.stringify(trafficData?.topAttacks),
        { ex: 86400 },
      ),
      redis.set(
        "cloudflare:hijacks:raw",
        JSON.stringify(anomalyData?.bgpHijacks),
        { ex: 86400 },
      ),
      redis.set(
        "cloudflare:outages:raw",
        JSON.stringify(anomalyData?.outages),
        { ex: 86400 },
      ),
    ]);

    // ============================================
    // STEP 2: Extract IPs from BGP Hijacks
    // ============================================
    console.log("[CRON] Extracting IPs from BGP hijacks...");

    const hijackIPs: Array<{
      ip: string;
      hijack: any;
    }> = [];

    // Process BGP hijack events
    const hijackEvents = anomalyData?.bgpHijacks.result?.events || [];

    for (const event of hijackEvents) {
      // Only process high-confidence hijacks
      if (event.confidence_score < 4) continue;

      // Extract first IP from each prefix
      for (const prefix of event.prefixes) {
        const ip = getFirstIPFromCIDR(prefix);
        if (ip) {
          hijackIPs.push({ ip, hijack: event });
        }
      }

      // Limit to avoid quota exhaustion (max 20 IPs per hijack event)
      if (hijackIPs.length >= 20) break;
    }

    console.log(`[CRON] Extracted ${hijackIPs.length} IPs from BGP hijacks`);

    // ============================================
    // STEP 3: Get AbuseIPDB Blacklist
    // ============================================
    console.log("[CRON] Fetching AbuseIPDB blacklist...");

    const blacklist = await getBlacklist({ min: 75, limit: 500 }); // Top 500 with 75+ confidence

    // Cache blacklist
    await redis.set("abuseipdb:blacklist", JSON.stringify(blacklist), {
      ex: 86400,
    }); // 6 hours

    console.log(`[CRON] Got ${blacklist.data.length} blacklisted IPs`);

    // ============================================
    // STEP 4: Combine IP Lists
    // ============================================
    const allIPs = [
      ...hijackIPs.map((h) => h.ip),
      ...blacklist.data.slice(0, 100).map((b: BlacklistItem) => b.ipAddress), // Limit blacklist to 100
    ];

    // Deduplicate
    const uniqueIPs = Array.from(new Set(allIPs));

    console.log(`[CRON] Total unique IPs to process: ${uniqueIPs.length}`);

    // ============================================
    // STEP 5: Geolocate All IPs
    // ============================================
    console.log("[CRON] Geolocating IPs...");

    const geoData = await geolocateBatch(uniqueIPs, 1400); // 43 requests/min

    console.log(`[CRON] Geolocated ${geoData.length} IPs`);

    // ============================================
    // STEP 6: Build Country Hotness Map
    // ============================================
    const countryHotness = buildCountryHotness(
      trafficData?.topOrigins.result.top_0,
    );

    // ============================================
    // STEP 7: Process & Score Threats
    // ============================================
    console.log("[CRON] Scoring threats...");

    const threats: RedisThreat[] = [];

    for (let i = 0; i < geoData.length; i++) {
      const geo = geoData[i];
      const ip = uniqueIPs[i];

      const hijackSource = hijackIPs.find((h) => h.ip === ip);
      const abuseEntry = blacklist.data.find(
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
        topAttacks: trafficData?.topAttacks.result.top_0,

        occurrenceCount: 1, // Will update with historical data later
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
            trafficData?.topAttacks.result.top_0,
          )
        : calculateBlacklistAttackMagnitude(
            {
              totalReports: abuseEntry?.totalReports || 0,
              lastReportedAt:
                abuseEntry?.lastReportedAt || new Date().toISOString(),
            },
            geo.countryCode,
            trafficData?.topAttacks.result.top_0,
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

    console.log(`[CRON] Generated ${threats.length} threats`);

    // ============================================
    // STEP 8: Build Hotspots
    // ============================================
    console.log("[CRON] Building hotspots...");

    const hotspots = buildHotspots(
      threats,
      trafficData?.topOrigins.result.top_0,
      trafficData?.topTargets.result.top_0,
    );

    // ============================================
    // STEP 9: Calculate Stats
    // ============================================
    const stats: RedisStats = {
      totalThreats: threats.length,
      highSeverityCount: threats.filter((t) => t.isHighThreat).length,
      bgpHijackCount: threats.filter((t) => t.dataSource === "bgp_hijack")
        .length,
      outageCount: anomalyData?.outages.result?.annotations?.length || 0,
      activeCountries: new Set(threats.map((t) => t.countryCode)).size,
      topAttackingCountry:
        trafficData?.topOrigins.result.top_0[0]?.originCountryName || "Unknown",
      topTargetedCountry:
        trafficData?.topTargets.result.top_0[0]?.targetCountryName || "Unknown",
      lastUpdated: new Date().toISOString(),
    };

    // After STEP 9 (Calculate Stats), add STEP 9.5:

    // ============================================
    // STEP 9.5: Extract Attack Flows for Trails
    // ============================================
    console.log("[CRON] Processing attack flows...");

    const hotspotMap = Object.fromEntries(
      hotspots.map((h) => [h.countryCode, h.coords]),
    );

    const attackFlows: AttackFlow[] = trafficData?.topAttacks.result.top_0
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

    console.log(`[CRON] Extracted ${attackFlows.length} attack flows`);
    // ============================================
    // STEP 10: Store in Redis
    // ============================================
    console.log("[CRON] Storing in Redis...");

    await Promise.all([
      redis.set("threats:latest", JSON.stringify(threats), { ex: 86400 }),
      redis.set("hotspots:latest", JSON.stringify(hotspots), { ex: 86400 }),
      redis.set("stats:summary", JSON.stringify(stats), { ex: 86400 }),
      redis.set("flows:latest", JSON.stringify(attackFlows), { ex: 86400 }),
    ]);

    console.log("[CRON] Refresh complete!");

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        threatsGenerated: threats.length,
        hotspotsGenerated: hotspots.length,
        highSeverity: stats.highSeverityCount,
        bgpHijacks: stats.bgpHijackCount,
      },
    });
  } catch (error) {
    console.error("[CRON] Error:", error);
    return NextResponse.json(
      { error: "Refresh failed", details: error },
      { status: 500 },
    );
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract first usable IP from CIDR notation
 * Example: "1.1.1.0/24" → "1.1.1.1"
 */
function getFirstIPFromCIDR(cidr: string): string | null {
  try {
    const [baseIP, mask] = cidr.split("/");
    const parts = baseIP.split(".").map(Number);

    // For /24, just use .1
    if (parseInt(mask) === 24) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
    }

    // For other masks, still use first IP
    return `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3] + 1}`;
  } catch {
    return null;
  }
}

/**
 * Build country hotness map from Cloudflare top origins
 */
function buildCountryHotness(topOrigins: any[]): Map<string, number> {
  const map = new Map<string, number>();

  topOrigins.forEach((origin, index) => {
    // Rank 1 = 100, Rank 2 = 80, Rank 3 = 60, Rank 4 = 40, Rank 5 = 20
    const score = Math.max(0, 100 - index * 20);
    map.set(origin.originCountryAlpha2, score);
  });

  return map;
}

/**
 * Build hotspot data for heatmap
 */
function buildHotspots(
  threats: RedisThreat[],
  topOrigins: any[],
  topTargets: any[],
): RedisHotspot[] {
  const byCountry = new Map<string, RedisThreat[]>();

  threats.forEach((threat) => {
    if (!byCountry.has(threat.countryCode)) {
      byCountry.set(threat.countryCode, []);
    }
    byCountry.get(threat.countryCode)!.push(threat);
  });

  const hotspots: RedisHotspot[] = [];

  byCountry.forEach((countryThreats, countryCode) => {
    const origin = topOrigins.find(
      (o) => o.originCountryAlpha2 === countryCode,
    );
    const target = topTargets.find(
      (t) => t.targetCountryAlpha2 === countryCode,
    );

    const avgScore =
      countryThreats.reduce((sum, t) => sum + t.threatScore, 0) /
      countryThreats.length;

    // Count ASNs
    const asnCounts = new Map<number, number>();
    countryThreats.forEach((t) => {
      asnCounts.set(t.asn, (asnCounts.get(t.asn) || 0) + 1);
    });

    const topASNs = Array.from(asnCounts.entries())
      .map(([asn, count]) => ({
        asn,
        name: countryThreats.find((t) => t.asn === asn)!.asnName,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    hotspots.push({
      countryCode,
      countryName: countryThreats[0].country,

      attackOriginRank: origin?.rank || null,
      attackOriginPercent: origin ? parseFloat(origin.value) : null,
      attackTargetRank: target?.rank || null,
      attackTargetPercent: target ? parseFloat(target.value) : null,

      threatDensity: Math.min(100, avgScore * (countryThreats.length / 10)),
      threatCount: countryThreats.length,
      avgThreatScore: Math.round(avgScore),

      topASNs,

      coords: {
        lat: countryThreats[0].lat,
        lon: countryThreats[0].lon,
      },
    });
  });

  return hotspots.sort((a, b) => b.threatDensity - a.threatDensity);
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
  // Find if this country is in topAttacks as origin
  const countryAttacks = topAttacks.filter(
    (attack) => attack.originCountryAlpha2 === countryCode,
  );

  // Sum all attack percentages where this country is the origin
  const totalCountryAttackPercent = countryAttacks.reduce(
    (sum, attack) => sum + parseFloat(attack.value),
    0,
  );

  // Scale to 0-30
  const countryScore = Math.min(30, totalCountryAttackPercent * 1.5);

  // 3. Hijack duration bonus (longer = more severe)
  // Duration in seconds, normalize to 0-20
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
  // More reports = more attack activity
  const reportScore = Math.min(40, abuseEntry.totalReports * 2);

  // 2. Country-level attack percentage (same as above)
  const countryAttacks = topAttacks.filter(
    (attack) => attack.originCountryAlpha2 === countryCode,
  );

  const totalCountryAttackPercent = countryAttacks.reduce(
    (sum, attack) => sum + parseFloat(attack.value),
    0,
  );

  const countryScore = Math.min(30, totalCountryAttackPercent * 1.5);

  // 3. Recency bonus
  // More recent = higher score
  const lastReported = new Date(abuseEntry.lastReportedAt);
  const hoursSinceReport =
    (Date.now() - lastReported.getTime()) / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 30 - hoursSinceReport);

  return Math.round(reportScore + countryScore + recencyScore);
}

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
