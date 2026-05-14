// app/api/cron/refresh/route.ts

import { NextResponse } from "next/server";
import type {
  RedisThreat,
  RedisHotspot,
  RedisStats,
} from "@/types/redis";
import type { CloudflareTopOrigin, CloudflareTopTarget } from "@/types/types"

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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const cronSecret = process.env.CRON_SECRET;
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cronSecret}`,
    };

    // ============================================
    // STEP 1: Fetch Cloudflare Data
    // ============================================
    console.log("[CRON] Step 1: Fetching Cloudflare data...");

    const trafficResponse = await fetch(`${baseUrl}/api/fetch-traffic`, {
      method: "GET",
      headers,
    });

    if (!trafficResponse.ok) {
      throw new Error("Failed to fetch traffic data");
    }

    const trafficResult = await trafficResponse.json();
    const { traffic: trafficData, anomalies: anomalyData } = trafficResult.data;

    // ============================================
    // STEP 2: Enrich IPs
    // ============================================
    console.log("[CRON] Step 2: Enriching IPs...");

    const enrichResponse = await fetch(`${baseUrl}/api/enrich-ips`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        bgpHijacks: anomalyData?.bgpHijacks,
        includeBlacklist: true,
      }),
    });

    if (!enrichResponse.ok) {
      throw new Error("Failed to enrich IPs");
    }

    const enrichResult = await enrichResponse.json();
    const { hijackIPs, blacklist, geoData, uniqueIPs } = enrichResult.data;

    // ============================================
    // STEP 3: Score Threats
    // ============================================
    console.log("[CRON] Step 3: Scoring threats...");

    const scoreResponse = await fetch(`${baseUrl}/api/score`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        geoData,
        uniqueIPs,
        hijackIPs,
        blacklist,
        topOrigins: trafficData?.topOrigins.result.top_0,
        topAttacks: trafficData?.topAttacks.result.top_0,
      }),
    });

    if (!scoreResponse.ok) {
      throw new Error("Failed to score threats");
    }

    const scoreResult = await scoreResponse.json();
    const threats: RedisThreat[] = scoreResult.data.threats;

    // ============================================
    // STEP 4: Build Hotspots (kept in cron)
    // ============================================
    console.log("[CRON] Step 4: Building hotspots...");

    const hotspots = buildHotspots(
      threats,
      trafficData?.topOrigins.result.top_0,
      trafficData?.topTargets.result.top_0,
    );

    // ============================================
    // STEP 5: Calculate Stats (kept in cron)
    // ============================================
    console.log("[CRON] Step 5: Calculating stats...");

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

    // ============================================
    // STEP 6: Build Attack Flows
    // ============================================
    console.log("[CRON] Step 6: Building attack flows...");

    const historyResponse = await fetch(`${baseUrl}/api/history`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        topAttacks: trafficData?.topAttacks.result.top_0,
        hotspots,
      }),
    });

    if (!historyResponse.ok) {
      throw new Error("Failed to build attack flows");
    }

    const historyResult = await historyResponse.json();
    const attackFlows = historyResult.data.attackFlows;

    // ============================================
    // STEP 7: Cache Everything
    // ============================================
    console.log("[CRON] Step 7: Caching data...");

    const cacheResponse = await fetch(`${baseUrl}/api/cache`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        threats,
        hotspots,
        stats,
        attackFlows,
      }),
    });

    if (!cacheResponse.ok) {
      throw new Error("Failed to cache data");
    }

    console.log("[CRON] Refresh complete!");

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        threatsGenerated: threats.length,
        hotspotsGenerated: hotspots.length,
        highSeverity: stats.highSeverityCount,
        bgpHijacks: stats.bgpHijackCount,
        attackFlows: attackFlows.length,
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
// Helper Functions (kept in cron)
// ============================================

/**
 * Build hotspot data for heatmap
 */
function buildHotspots(
  threats: RedisThreat[],
  topOrigins: CloudflareTopOrigin[],
  topTargets: CloudflareTopTarget[],
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