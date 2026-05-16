// app/api/enrich-ips/route.ts

import { NextResponse } from "next/server";
import { getBlacklist } from "@/services/abuseipdb";
import { geolocateBatch, GeoEntry } from "@/services/geolocateIP";
import { getIpAsn, CloudflareAsnInfo } from "@/services/cloudflare";
import { redis } from "@/lib/redis";
import type { BlacklistItem } from "@/types/redis";
import type {
  CloudflareBGPEvent,
  AbuseIPDBBlacklist,
  AbuseIpData,
} from "@/types/types";

interface EnrichRequest {
  bgpHijacks?: { result?: { events?: CloudflareBGPEvent[] } } | null;
  includeBlacklist?: boolean;
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    console.log("[ENRICH-IPS] Starting enrichment...");

    // Auth check (optional)
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as EnrichRequest;
    const { bgpHijacks, includeBlacklist = true } = body;

    // ============================================
    // Extract IPs from BGP Hijacks
    // ============================================
    console.log("[ENRICH-IPS] Extracting IPs from BGP hijacks...");

    interface HijackEvent {
      id: number;
      confidence_score: number;
      prefixes: string[];
      hijack?: CloudflareBGPEvent;
    }

    const hijackIPs: Array<{ ip: string; hijack: HijackEvent }> = [];

    // Process BGP hijack events
    const hijackEvents: HijackEvent[] = bgpHijacks?.result?.events || [];

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

    console.log(
      `[ENRICH-IPS] Extracted ${hijackIPs.length} IPs from BGP hijacks`,
    );

    // ============================================
    // HYBRID: Check Redis for Blacklist First
    // AbuseIPDB updates once per day, has 5 calls/day limit
    // ============================================
    let blacklist: AbuseIPDBBlacklist = { meta: { generatedAt: "" }, data: [] };

    if (includeBlacklist) {
      const cachedBlacklist = await redis.get("abuseipdb:blacklist");

      if (cachedBlacklist) {
        console.log("[ENRICH-IPS] Using cached AbuseIPDB blacklist");
        try {
          // cachedBlacklist may be a string, an object, or double-stringified JSON.
          if (typeof cachedBlacklist === "object" && cachedBlacklist !== null) {
            // already parsed by client
            blacklist = cachedBlacklist as unknown as AbuseIPDBBlacklist;
          } else if (typeof cachedBlacklist === "string") {
            try {
              blacklist = JSON.parse(cachedBlacklist) as AbuseIPDBBlacklist;
            } catch (err) {
              // Try double-JSON ("\"{...}\"")
              try {
                const inner = JSON.parse(cachedBlacklist);
                if (typeof inner === "string") {
                  blacklist = JSON.parse(inner) as AbuseIPDBBlacklist;
                } else {
                  blacklist = inner as AbuseIPDBBlacklist;
                }
              } catch (err2) {
                console.warn(
                  "[ENRICH-IPS] Failed to parse cached blacklist, falling back to empty",
                  err2,
                );
                blacklist = { meta: { generatedAt: "" }, data: [] };
              }
            }
          } else {
            blacklist = { meta: { generatedAt: "" }, data: [] };
          }
        } catch (err) {
          console.warn(
            "[ENRICH-IPS] Unexpected cache format for blacklist, continuing",
            err,
          );
          blacklist = { meta: { generatedAt: "" }, data: [] };
        }
      } else {
        console.log("[ENRICH-IPS] Fetching fresh AbuseIPDB blacklist...");
        blacklist = await getBlacklist({ min: 75, limit: 500 });

        // Cache for 23 hours (82800 seconds) - leaves 1 hour buffer before next day
        // This ensures only 1 API call per day instead of 5
        await redis.set("abuseipdb:blacklist", JSON.stringify(blacklist), {
          ex: 86400,
        });

        console.log(
          `[ENRICH-IPS] Got ${blacklist.data.length} blacklisted IPs (fresh)`,
        );
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

    console.log(
      `[ENRICH-IPS] Total unique IPs to process: ${uniqueIPs.length}`,
    );

    // ============================================
    // HYBRID: Check Redis for Cached Geolocation
    // IP geolocation is static - cache for 7 days
    // ============================================
    console.log("[ENRICH-IPS] Geolocating IPs...");

    const geoData: GeoEntry[] = [];
    const uncachedIPs: string[] = [];
    const geoHashKey = "geo:ips";

    // Safe parse helper for cached values which may be objects, strings, or double-stringified
    const safeParse = <T,>(cached: unknown): T | null => {
      if (cached == null) return null;
      if (typeof cached === 'object') return cached as T;
      if (typeof cached === 'string') {
        try {
          return JSON.parse(cached) as T;
        } catch (err) {
          // Not JSON: return the raw string/object as best-effort
          return cached as unknown as T;
        }
      }
      return null;
    };

    // Check which IPs we already have cached in the single HASH
    const geoCheckPromises = uniqueIPs.map(async (ip) => {
      const cached = await redis.hget(geoHashKey, ip);
      if (cached) {
        const parsed = safeParse<GeoEntry>(cached);
        if (parsed) geoData.push(parsed);
        else uncachedIPs.push(ip);
      } else {
        uncachedIPs.push(ip);
      }
    });

    await Promise.all(geoCheckPromises);

    console.log(
      `[ENRICH-IPS] Found ${geoData.length} cached geolocations, fetching ${uncachedIPs.length} fresh`,
    );

    // Fetch only uncached IPs
    if (uncachedIPs.length > 0) {
      const freshGeoData = await geolocateBatch(uncachedIPs, 1400);

      // Cache fresh results in the single Redis HASH to avoid many top-level keys
      try {
        const hsetPayload: Record<string, string> = {};
        freshGeoData.forEach((g) => {
          hsetPayload[g.ip] = JSON.stringify(g);
        });
        if (Object.keys(hsetPayload).length > 0) {
          await redis.hset(geoHashKey, hsetPayload);
          // Set TTL on the hash (applies to entire hash). Refresh TTL on writes.
          try {
            await redis.expire(geoHashKey, 604800);
          } catch (err) {
            // expire may not be supported by some clients; ignore if it fails
          }
        }
      } catch (err) {
        console.error(
          "[ENRICH-IPS] Failed to cache fresh geo data in hash",
          err,
        );
      }

      geoData.push(...freshGeoData);
    }

    // ============================================
    // ASN enrichment (use a single Redis HASH to avoid many top-level keys)
    // Key: 'asn:ips'  Field: ip -> JSON string of ASN result
    // ============================================
    const asnHashKey = "asn:ips";
    const lookupIPs: string[] = [];
    const geoByIp = new Map<string, GeoEntry>();

    for (const g of geoData) geoByIp.set(g.ip, g);

    // Check existing ASN in geo data or in redis hash
    for (const geo of geoData) {
      // If geo.as already contains an AS string (e.g. "AS13335 ...") skip
      if (geo.as && /AS\d+/.test(String(geo.as))) continue;

      try {
        const cached = await redis.hget(asnHashKey, geo.ip);
        if (cached) {
          const asnInfo = safeParse<CloudflareAsnInfo>(cached);
          if (asnInfo) {
            const asnNum = asnInfo.asn;
            const orgName = (asnInfo.orgName || asnInfo.name || "") as string;
            geo.as = `AS${asnNum} ${orgName}`.trim();
            geo.asnDetails = asnInfo;
            // Update geo cache (hash) with merged ASN info
            try {
              await redis.hset(geoHashKey, { [geo.ip]: JSON.stringify(geo) });
              await redis.expire(geoHashKey, 604800);
            } catch (err) {
              console.error(
                "[ENRICH-IPS] Failed to update geo hash with ASN info",
                err,
              );
            }
          } else {
            lookupIPs.push(geo.ip);
          }
        } else {
          lookupIPs.push(geo.ip);
        }
      } catch (err) {
        // On any redis/parse error, enqueue for lookup so we don't lose enrichment
        lookupIPs.push(geo.ip);
      }
    }

    // Perform ASN lookups sequentially to avoid rate limits (cron is not latency sensitive)
    for (const ip of lookupIPs) {
      try {
        const asnRes = await getIpAsn(ip);
        const asnInfoRaw = asnRes?.result?.asn || null;
        if (asnInfoRaw) {
          const asnInfo = asnInfoRaw as CloudflareAsnInfo;
          // Cache in single redis hash
          await redis.hset(asnHashKey, { [ip]: JSON.stringify(asnInfo) });

          // Merge into geo entry and update geo cache
          const geo = geoByIp.get(ip);
          if (geo) {
            const asnNum = asnInfo.asn;
            const orgName = (asnInfo.orgName || asnInfo.name || "") as string;
            geo.as = `AS${asnNum} ${orgName}`.trim();
            geo.asnDetails = asnInfo as CloudflareAsnInfo;
            try {
              await redis.hset(geoHashKey, { [ip]: JSON.stringify(geo) });
              await redis.expire(geoHashKey, 604800);
            } catch (err) {
              console.error(
                "[ENRICH-IPS] Failed to update geo hash after ASN lookup",
                err,
              );
            }
          }
        }
      } catch (err) {
        console.error("[ENRICH-IPS] ASN lookup failed for", ip, err);
      }
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
      { error: "IP enrichment failed", details: String(error) },
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
