import { getThreatSummary } from "@/services/groq";

export async function POST(req: Request) {
  try {
    const { threat } = await req.json();
    if (!threat) {
      throw new Error("No threat data received");
    }
    const res = await getThreatSummary(JSON.stringify(threat));
    return Response.json({ summary: res });
  } catch (error) {
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
