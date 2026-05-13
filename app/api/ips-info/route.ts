import { getIPDetails } from "@/services/abuseipdb";
import { NextResponse } from "next/server";
import { geolocateBatch } from "@/services/geolocateIP";
import { getIpAsn } from "@/services/cloudflare";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
    let geo: any = null;
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
    const normalizeAsn = (raw: any) => {
      if (!raw) return null;
      const asnNum =
        raw.asn ||
        raw.ASN ||
        (raw.asn_number && Number(raw.asn_number)) ||
        null;
      const name = raw.name || raw.orgName || raw.org_name || null;
      const orgName = raw.orgName || raw.org_name || raw.name || null;
      const website = raw.website || raw.url || null;
      const country = raw.country || raw.countryName || raw.country_name || null;
      const countryName =
        raw.countryName || raw.country_name || raw.country || null;
      const source = raw.source || raw.sourceName || null;
      // estimatedUsers can be a number or an object { estimatedUsers: N }
      let estimatedUsers = null;
      if (raw.estimatedUsers && typeof raw.estimatedUsers === "number")
        estimatedUsers = raw.estimatedUsers;
      else if (
        raw.estimatedUsers &&
        typeof raw.estimatedUsers === "object" &&
        raw.estimatedUsers.estimatedUsers
      )
        estimatedUsers = raw.estimatedUsers.estimatedUsers;
      else if (raw.estimated_users && typeof raw.estimated_users === "number")
        estimatedUsers = raw.estimated_users;

      return {
        asn: asnNum,
        name,
        orgName,
        website,
        country,
        countryName,
        source,
        estimatedUsers,
        // keep raw for debugging if needed
        _raw: raw,
      };
    };

    // Try to get ASN from redis hash
    let asnInfo: any = null;
    let asnCached = false;

    try {
      const cachedAsn = await redis.hget(asnHashKey, ip);
      if (cachedAsn) {
        const parsed = JSON.parse(cachedAsn as string);
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
        const candidate = res?.result?.asn || res?.asn || null;
        if (candidate) {
          const normalized = normalizeAsn(candidate);
          asnInfo = normalized;
          // cache in hash
          try {
            await redis.hset(asnHashKey, { [ip]: JSON.stringify(candidate) });
            asnCached = true;
          } catch (err) {
            console.error("[IPS-INFO] failed to hset asn", err);
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
        geo.asnDetails = geo.asnDetails || asnInfo;
        // update cache with merged info
        try {
          await redis.set(geoCacheKey, JSON.stringify(geo), { ex: 604800 });
        } catch (err) {
          console.error("[IPS-INFO] failed to update geo cache with ASN", err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ip,
        geo: geo || null,
        asn: asnInfo || null,
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
