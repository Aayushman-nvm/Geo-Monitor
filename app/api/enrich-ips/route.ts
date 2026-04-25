import { geolocateBatch } from "@/services/geolocateIP";

export async function POST(req: Request) {
  try {
    const { ip } = await req.json();

    const data = await geolocateBatch(ip);

    return Response.json({ "IP Info": data });
  } catch (err) {
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}