import { getTraffic, getAnomalies } from "@/services/cloudflare";

export async function GET() {
  try {
    const [data1, data2] = await Promise.all([
        getTraffic(),
        getAnomalies()
      ]);

    return Response.json({"Traffic": data1, "Anomalies": data2});
  } catch (err) {
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}