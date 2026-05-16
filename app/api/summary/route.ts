import { getThreatSummary } from "@/services/groq";
import { redis } from "@/lib/redis";

const HASH_KEY = "threat:summaries";

// Safe parse helper for cached values which may be objects, strings, or double-stringified
const safeParse = <T,>(cached: unknown): T | null => {
  if (cached == null) return null;
  if (typeof cached === 'object') return cached as T;
  if (typeof cached === 'string') {
    try {
      return JSON.parse(cached) as T;
    } catch (err) {
      // Not JSON: return the raw string
      return cached as unknown as T;
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const threat = body?.threat;
    const ip = body?.ip || threat?.ip;

    if (!ip) {
      return Response.json({ error: "Missing ip" }, { status: 400 });
    }

    // Fetch one field from hash
    const cached = await redis.hget(HASH_KEY, ip);

    if (cached) {
      const parsed = safeParse<unknown>(cached);
      return Response.json({ summary: parsed ?? cached, cached: true });
    }

    if (!threat) {
      return Response.json({ error: 'Threat payload required to generate summary' }, { status: 400 });
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
