import { getThreatSummary } from "@/services/groq";
import { redis } from "@/lib/redis";

const HASH_KEY = "threat:summaries";

export async function POST(req: Request) {
  try {
    const { threat } = await req.json();

    if (!threat?.ip) {
      return Response.json(
        { error: "Invalid threat payload" },
        { status: 400 },
      );
    }

    const ip = threat.ip;

    // Fetch one field from hash
    const cached = await redis.hget(HASH_KEY, ip);

    if (cached) {
      return Response.json({
        summary: typeof cached === "string" ? JSON.parse(cached) : cached,
        cached: true,
      });
    }

    const summary = await getThreatSummary(JSON.stringify(threat));

    // Store as hash field
    await redis.hset(HASH_KEY, {
      [ip]: JSON.stringify(summary),
    });

    await redis.expire(HASH_KEY, 86400);

    return Response.json({
      summary,
      cached: false,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      { error: "Failed to generate summary" },
      { status: 500 },
    );
  }
}
