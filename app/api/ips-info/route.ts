import { getIPDetails } from "@/services/abuseipdb";
import { NextResponse } from "next/server";
import { geolocateBatch } from "@/services/geolocateIP";
import { getIpAsn, CloudflareAsnInfo } from "@/services/cloudflare";
import { redis } from "@/lib/redis";
import type { GeoEntry, CloudflareTopTarget } from "@/types/types"

// Normalized ASN shape returned to frontend
interface NormalizedAsn {
  asn: number | null;
  name?: string | null;
  orgName?: string | null;
  website?: string | null;
  country?: string | null;
  countryName?: string | null;
  source?: string | null;
  estimatedUsers?: number | null;
  _raw?: unknown;
}

// AbuseIPDB response (partial, only fields we use)
interface AbuseIpData {
  data?: {
    ipAddress?: string;
    countryCode?: string;
    abuseConfidenceScore?: number;
    lastReportedAt?: string;
    totalReports?: number;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

interface AbuseCacheEntry { fetchedAt: string; data: AbuseIpData }

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ip: string = body?.ip;
    if (!ip) {
      return NextResponse.json(
        { error: "Missing ip in request body" },
        { status: 400 }
      );
    }

    const geoCacheKey = `geo:ip:${ip}`;
    const asnHashKey = "asn:ips";

    // Try cache for geo
    let geo: GeoEntry | null = null;
    let geoCached = false;
    try {
      const cached = await redis.get(geoCacheKey);
      if (cached) {
        geo = JSON.parse(cached as string);
        geoCached = true;
      }
    } catch (err) {
      // ignore cache errors
      console.error("[IPS-INFO] Geo cache read error", err);
    }

    // If no geo, fetch via geolocateBatch
    if (!geo) {
      try {
        const fresh = await geolocateBatch([ip], 1400);
        if (Array.isArray(fresh) && fresh.length > 0) {
          geo = fresh[0];
          // Cache for 7 days
          try {
            await redis.set(geoCacheKey, JSON.stringify(geo), { ex: 604800 });
          } catch (err) {
            console.error("[IPS-INFO] Failed to cache geo", err);
          }
        }
      } catch (err) {
        console.error("[IPS-INFO] geolocateBatch error", err);
      }
    }

    // Normalize function to produce consistent ASN payload for frontend
    const normalizeAsn = (raw: unknown): NormalizedAsn | null => {
      if (!raw) return null;
      const r = raw as Record<string, unknown>;
      const asnNum =
        (typeof r['asn'] === 'number' ? (r['asn'] as number) : null) ||
        (typeof r['ASN'] === 'number' ? (r['ASN'] as number) : null) ||
        (r['asn_number'] ? Number(r['asn_number']) : null) || null;

      const name = (r['name'] as string) || (r['orgName'] as string) || (r['org_name'] as string) || null;
      const orgName = (r['orgName'] as string) || (r['org_name'] as string) || (r['name'] as string) || null;
      const website = (r['website'] as string) || (r['url'] as string) || null;
      const country = (r['country'] as string) || (r['countryName'] as string) || (r['country_name'] as string) || null;
      const countryName = (r['countryName'] as string) || (r['country_name'] as string) || (r['country'] as string) || null;
      const source = (r['source'] as string) || (r['sourceName'] as string) || null;

      // estimatedUsers can be a number or nested object
      let estimatedUsers: number | null = null;
      if (typeof r['estimatedUsers'] === 'number') estimatedUsers = r['estimatedUsers'] as number;
      else if (r['estimatedUsers'] && typeof r['estimatedUsers'] === 'object' && (r['estimatedUsers'] as any).estimatedUsers) estimatedUsers = Number((r['estimatedUsers'] as any).estimatedUsers);
      else if (typeof r['estimated_users'] === 'number') estimatedUsers = r['estimated_users'] as number;

      return {
        asn: asnNum,
        name: name ?? null,
        orgName: orgName ?? null,
        website: website ?? null,
        country: country ?? null,
        countryName: countryName ?? null,
        source: source ?? null,
        estimatedUsers: estimatedUsers ?? null,
        _raw: raw,
      };
    };

    // Try to get ASN from redis hash
    let asnInfo: NormalizedAsn | null = null;
    let asnCached = false;

    try {
      const cachedAsn = await redis.hget(asnHashKey, ip);
      if (cachedAsn) {
        const parsed = JSON.parse(cachedAsn as string) as CloudflareAsnInfo;
        asnInfo = normalizeAsn(parsed);
        asnCached = true;
      }
    } catch (err) {
      console.error("[IPS-INFO] ASN hash read error", err);
    }

    // If ASN not cached, and geo doesn't already include AS info, fetch from Cloudflare
    const geoHasAs = geo && geo.as && /AS\d+/.test(String(geo.as));

    if (!asnInfo && !geoHasAs) {
      try {
        const res = await getIpAsn(ip);
        const candidate = res?.result?.asn || null;
        if (candidate) {
          const candidateInfo = candidate as CloudflareAsnInfo;
          asnInfo = normalizeAsn(candidateInfo);
          // cache raw candidate in hash
          try {
            await redis.hset(asnHashKey, { [ip]: JSON.stringify(candidateInfo) });
            asnCached = true;
          } catch (err) {
            console.error('[IPS-INFO] failed to hset asn', err);
          }
        }
      } catch (err) {
        console.error("[IPS-INFO] getIpAsn error", err);
      }
    }

    // Merge ASN into geo entry for convenience
    if (geo) {
      if (asnInfo) {
        geo.as =
          geo.as ||
          `AS${asnInfo.asn} ${asnInfo.orgName || asnInfo.name || ""}`.trim();
        // cast normalized ASN to loose record to satisfy GeoEntry.asnDetails typing
        geo.asnDetails = geo.asnDetails || (asnInfo as unknown as Record<string, unknown>);
        // update cache with merged info
        try {
          await redis.set(geoCacheKey, JSON.stringify(geo), { ex: 604800 });
        } catch (err) {
          console.error("[IPS-INFO] failed to update geo cache with ASN", err);
        }
      }
    }

    // ============================================
    // AbuseIPDB enrichment (on-demand). Cached in redis hash 'abuse:ips' with fetchedAt metadata.
    // If cached and fresh (<24h) use cache, otherwise call getIPDetails and cache result.
    // ============================================
    const abuseHashKey = 'abuse:ips';
    let abuseData: AbuseIpData | null = null;
    try {
      const cachedAbuse = await redis.hget(abuseHashKey, ip);
      if (cachedAbuse) {
        const parsed = JSON.parse(cachedAbuse as string) as AbuseCacheEntry;
        const ageMs = Date.now() - new Date(parsed.fetchedAt).getTime();
        const oneDay = 24 * 60 * 60 * 1000;
        if (ageMs < oneDay && parsed.data) {
          abuseData = parsed.data as AbuseIpData;
        }
      }
    } catch (err) {
      console.error('[IPS-INFO] abuse hash read error', err);
    }

    if (!abuseData) {
      try {
        const ipDetails = (await getIPDetails(ip)) as AbuseIpData | null;
        if (ipDetails) {
          abuseData = ipDetails;
          try {
            await redis.hset(abuseHashKey, { [ip]: JSON.stringify({ fetchedAt: new Date().toISOString(), data: ipDetails }) });
          } catch (err) {
            console.error('[IPS-INFO] failed to hset abuse data', err);
          }
        }
      } catch (err) {
        console.error('[IPS-INFO] getIPDetails error', err);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ip,
        geo: geo || null,
        asn: asnInfo || null,
        abuse: abuseData || null,
      },
      cached: { geo: geoCached, asn: asnCached },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[IPS-INFO] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch IP info", details: String(error) },
      { status: 500 }
    );
  }
}
