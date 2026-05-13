// app/api/fetch-traffic/route.ts

import { NextResponse } from "next/server";
import { getTraffic, getAnomalies } from "@/services/cloudflare";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    console.log("[FETCH-TRAFFIC] Starting fetch...");

    // Auth check (optional - remove if you want this publicly accessible)
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ============================================
    // HYBRID: Check Redis First
    // ============================================
    const [cachedTraffic, cachedHijacks, cachedOutages] = await Promise.all([
      redis.get("cloudflare:traffic:raw"),
      redis.get("cloudflare:hijacks:raw"),
      redis.get("cloudflare:outages:raw"),
    ]);

    let trafficData: any;
    let hijacksData: any;
    let outagesData: any;

    // ============================================
    // Fetch Only Missing/Expired Data
    // ============================================
    const fetchPromises: Promise<any>[] = [];

    // Traffic data (attacks/origins/targets) - 15 min TTL
    if (cachedTraffic) {
      console.log("[FETCH-TRAFFIC] Using cached traffic data");
      trafficData = JSON.parse(cachedTraffic as string);
    } else {
      console.log("[FETCH-TRAFFIC] Fetching fresh traffic data...");
      fetchPromises.push(
        getTraffic().then((data) => {
          trafficData = data;
          // Cache for 15 minutes (900 seconds)
          redis.set(
            "cloudflare:traffic:raw",
            JSON.stringify(data),
            { ex: 900 },
          );
        })
      );
    }

    // BGP Hijacks - 15 min TTL (real-time events)
    if (cachedHijacks) {
      console.log("[FETCH-TRAFFIC] Using cached BGP hijacks");
      hijacksData = JSON.parse(cachedHijacks as string);
    } else {
      console.log("[FETCH-TRAFFIC] Fetching fresh BGP hijacks...");
      fetchPromises.push(
        getAnomalies().then((data) => {
          hijacksData = data?.bgpHijacks;
          // Cache for 15 minutes (900 seconds)
          redis.set(
            "cloudflare:hijacks:raw",
            JSON.stringify(data?.bgpHijacks),
            { ex: 900 },
          );
        })
      );
    }

    // Outages - 1 hour TTL (updates hourly)
    if (cachedOutages) {
      console.log("[FETCH-TRAFFIC] Using cached outages");
      outagesData = JSON.parse(cachedOutages as string);
    } else {
      console.log("[FETCH-TRAFFIC] Fetching fresh outages...");
      fetchPromises.push(
        getAnomalies().then((data) => {
          outagesData = data?.outages;
          // Cache for 1 hour (3600 seconds)
          redis.set(
            "cloudflare:outages:raw",
            JSON.stringify(data?.outages),
            { ex: 3600 },
          );
        })
      );
    }

    // Wait for any fresh fetches
    if (fetchPromises.length > 0) {
      await Promise.all(fetchPromises);
    }

    console.log("[FETCH-TRAFFIC] Data ready (cached + fresh)");

    return NextResponse.json({
      success: true,
      data: {
        traffic: trafficData,
        anomalies: {
          bgpHijacks: hijacksData,
          outages: outagesData,
        },
      },
      cached: {
        traffic: !!cachedTraffic,
        hijacks: !!cachedHijacks,
        outages: !!cachedOutages,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[FETCH-TRAFFIC] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch traffic data", details: error },
      { status: 500 },
    );
  }
}