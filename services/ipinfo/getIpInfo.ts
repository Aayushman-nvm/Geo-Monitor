import dotenv from "dotenv";
dotenv.config();

const baseUrl = "https://api.ipinfo.io/lite/";
const IpInfoApi = process.env.IPINFO_API_KEY;

if (!IpInfoApi) {
  throw new Error("Missing IPINFO_API_KEY");
}

export async function getIpInfo(ip: string) {
  try {
    const res = await fetch(`${baseUrl}${ip}?token=${IpInfoApi}`);

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.error("IP fetch failed:", err);
    return null;
  }
}