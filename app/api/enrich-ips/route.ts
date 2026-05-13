// app/api/enrich-ips/route.ts

import { NextResponse } from "next/server";
import { getBlacklist } from "@/services/abuseipdb";
import { geolocateBatch } from "@/services/geolocateIP";
import { redis } from "@/lib/redis";
import type { BlacklistItem } from "@/types/redis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    console.log("[ENRICH-IPS] Starting enrichment...");

    // Auth check (optional)
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { bgpHijacks, includeBlacklist = true } = body;

    // ============================================
    // Extract IPs from BGP Hijacks
    // ============================================
    console.log("[ENRICH-IPS] Extracting IPs from BGP hijacks...");

    const hijackIPs: Array<{
      ip: string;
      hijack: any;
    }> = [];

    // Process BGP hijack events
    const hijackEvents = bgpHijacks?.result?.events || [];

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

    console.log(`[ENRICH-IPS] Extracted ${hijackIPs.length} IPs from BGP hijacks`);

    // ============================================
    // HYBRID: Check Redis for Blacklist First
    // AbuseIPDB updates once per day, has 5 calls/day limit
    // ============================================
    let blacklist: any = { data: [] };

    if (includeBlacklist) {
      const cachedBlacklist = await redis.get("abuseipdb:blacklist");

      if (cachedBlacklist) {
        console.log("[ENRICH-IPS] Using cached AbuseIPDB blacklist");
        blacklist = JSON.parse(cachedBlacklist as string);
      } else {
        console.log("[ENRICH-IPS] Fetching fresh AbuseIPDB blacklist...");
        blacklist = await getBlacklist({ min: 75, limit: 500 });

        // Cache for 23 hours (82800 seconds) - leaves 1 hour buffer before next day
        // This ensures only 1 API call per day instead of 5
        await redis.set("abuseipdb:blacklist", JSON.stringify(blacklist), {
          ex: 82800,
        });

        console.log(`[ENRICH-IPS] Got ${blacklist.data.length} blacklisted IPs (fresh)`);
      }
    }

    // ============================================
    // Combine IP Lists
    // ============================================
    const allIPs = [
      ...hijackIPs.map((h) => h.ip),
      ...blacklist.data.slice(0, 100).map((b: BlacklistItem) => b.ipAddress),
    ];

    // Deduplicate
    const uniqueIPs = Array.from(new Set(allIPs));

    console.log(`[ENRICH-IPS] Total unique IPs to process: ${uniqueIPs.length}`);

    // ============================================
    // HYBRID: Check Redis for Cached Geolocation
    // IP geolocation is static - cache for 7 days
    // ============================================
    console.log("[ENRICH-IPS] Geolocating IPs...");

    const geoData: any[] = [];
    const uncachedIPs: string[] = [];

    // Check which IPs we already have cached
    const geoCheckPromises = uniqueIPs.map(async (ip) => {
      const cached = await redis.get(`geo:ip:${ip}`);
      if (cached) {
        geoData.push(JSON.parse(cached as string));
      } else {
        uncachedIPs.push(ip);
      }
    });

    await Promise.all(geoCheckPromises);

    console.log(`[ENRICH-IPS] Found ${geoData.length} cached geolocations, fetching ${uncachedIPs.length} fresh`);

    // Fetch only uncached IPs
    if (uncachedIPs.length > 0) {
      const freshGeoData = await geolocateBatch(uncachedIPs, 1400);

      // Cache each fresh result for 7 days (604800 seconds)
      const cachePromises = freshGeoData.map((geo) =>
        redis.set(`geo:ip:${geo.ip}`, JSON.stringify(geo), { ex: 604800 })
      );

      await Promise.all(cachePromises);

      geoData.push(...freshGeoData);
    }

    console.log(`[ENRICH-IPS] Total geolocated IPs: ${geoData.length}`);

    return NextResponse.json({
      success: true,
      data: {
        hijackIPs,
        blacklist: blacklist.data,
        geoData,
        uniqueIPs,
      },
      stats: {
        hijackIPsExtracted: hijackIPs.length,
        blacklistIPsCount: blacklist.data.length,
        uniqueIPsCount: uniqueIPs.length,
        geolocatedCount: geoData.length,
        geoCachedCount: geoData.length - uncachedIPs.length,
        geoFreshCount: uncachedIPs.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ENRICH-IPS] Error:", error);
    return NextResponse.json(
      { error: "IP enrichment failed", details: error },
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