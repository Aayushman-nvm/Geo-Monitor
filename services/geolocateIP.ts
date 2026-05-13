import dotenv from "dotenv";
dotenv.config();

const baseUrl = "http://ip-api.com/json";

interface GeoResponse {
  status: "success" | "fail";
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  query?: string;
  message?: string;
}

export async function geolocateBatch(
  uniqueIPs: string[] | string,
  delayMs: number = 1400
) {
  const ips = Array.isArray(uniqueIPs) ? uniqueIPs : [uniqueIPs];
  const results: any[] = [];

  console.log(`[GEO LOCATE] Started - Total IPs: ${ips.length}`);

  for (const ip of uniqueIPs) {
    try {
      const res = await fetch(`${baseUrl}/${ip}`);
      const data: GeoResponse = await res.json();

      if (data.status === "success") {
        results.push({
          // 🔹 Clean fields
          ip: data.query,
          country: data.country,
          countryCode: data.countryCode,
          region: data.regionName,
          regionCode: data.region,
          city: data.city,
          zip: data.zip,
          lat: data.lat,
          lon: data.lon,
          timezone: data.timezone,

          // 🔹 Network
          isp: data.isp,
          org: data.org,
          as: data.as,

          // 🔹 Status
          status: data.status,

          // 🔹 Full raw response
          raw: data
        });
      } else {
        results.push({
          ip,
          status: data.status,
          error: data.message || "Lookup failed",
          raw: data
        });
      }

    } catch (err: any) {
      results.push({
        ip,
        status: "error",
        error: err.message || "Network error"
      });
    }

    // rate limiting
    await new Promise(r => setTimeout(r, delayMs));
  }
  console.log(`[GEO LOCATE] Completed - Processed ${ips.length} IPs`);

  return results;
}