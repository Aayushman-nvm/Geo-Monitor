import {getIPDetails} from "@/services/abuseipdb"

export async function POST(req: Request) {
  try {

    const { ip } = await req.json();

    if (!ip) {
      throw new Error("No IP found in payload");
    }

    const data = await getIPDetails(ip);

    return Response.json({ ipDetails: data });
  } catch (err) {
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
