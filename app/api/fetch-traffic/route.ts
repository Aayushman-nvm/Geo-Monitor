// app/api/fetch-traffic/route.ts
import { NextResponse } from "next/server";
import { getTraffic, getAnomalies } from "@/services/cloudflare";
import { redis } from "@/lib/redis";
import type { CloudflareTrafficData, CloudflareBGPHijacks, CloudflareOutages } from "@/types/types"

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    console.log("[FETCH-TRAFFIC] Starting fetch...");

    // Optional auth
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check Redis cache first
    const [cachedTraffic, cachedHijacks, cachedOutages] = await Promise.all([
      redis.get("cloudflare:traffic:raw"),
      redis.get("cloudflare:hijacks:raw"),
      redis.get("cloudflare:outages:raw"),
    ]);

    let trafficData: CloudflareTrafficData | null = null;
    let hijacksData: CloudflareBGPHijacks | null = null;
    let outagesData: CloudflareOutages | null = null;

    const fetchTasks: Promise<void>[] = [];

    // Traffic (attacks/origins/targets) - 15 min
    if (cachedTraffic) {
      console.log("[FETCH-TRAFFIC] Using cached traffic data");
      trafficData = JSON.parse(cachedTraffic as string);
    } else {
      console.log("[FETCH-TRAFFIC] Fetching fresh traffic data...");
      fetchTasks.push((async () => {
        const data = await getTraffic();
        trafficData = data || null;
        try {
          await redis.set("cloudflare:traffic:raw", JSON.stringify(data), { ex: 900 });
        } catch (err) {
          console.error('[FETCH-TRAFFIC] Failed to cache traffic:', err);
        }
      })());
    }

    // BGP hijacks - 15 min
    if (cachedHijacks) {
      console.log("[FETCH-TRAFFIC] Using cached BGP hijacks");
      hijacksData = JSON.parse(cachedHijacks as string);
    } else {
      console.log("[FETCH-TRAFFIC] Fetching fresh BGP hijacks...");
      fetchTasks.push((async () => {
        const data = await getAnomalies();
        hijacksData = (data && data.bgpHijacks) || null;
        try {
          await redis.set("cloudflare:hijacks:raw", JSON.stringify((data && data.bgpHijacks) || null), { ex: 900 });
        } catch (err) {
          console.error('[FETCH-TRAFFIC] Failed to cache hijacks:', err);
        }
      })());
    }

    // Outages - 1 hour
    if (cachedOutages) {
      console.log("[FETCH-TRAFFIC] Using cached outages");
      outagesData = JSON.parse(cachedOutages as string);
    } else {
      console.log("[FETCH-TRAFFIC] Fetching fresh outages...");
      fetchTasks.push((async () => {
        const data = await getAnomalies();
        outagesData = (data && data.outages) || null;
        try {
          await redis.set("cloudflare:outages:raw", JSON.stringify((data && data.outages) || null), { ex: 3600 });
        } catch (err) {
          console.error('[FETCH-TRAFFIC] Failed to cache outages:', err);
        }
      })());
    }

    if (fetchTasks.length > 0) await Promise.all(fetchTasks);

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
    return NextResponse.json({ error: "Failed to fetch traffic data", details: String(error) }, { status: 500 });
  }
}