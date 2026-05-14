import dotenv from "dotenv";
dotenv.config();

const baseUrl = "http://ip-api.com/json";

export interface GeoEntry {
  ip: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionCode?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  asn?: string;
  asnDetails?: Record<string, unknown> | null;
  status: 'success' | 'fail' | 'error';
  error?: string;
  raw?: unknown;
}

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
): Promise<GeoEntry[]> {
  const ips = Array.isArray(uniqueIPs) ? uniqueIPs : [uniqueIPs];
  const results: GeoEntry[] = [];

  console.log(`[GEO LOCATE] Started - Total IPs: ${ips.length}`);

  for (const ip of uniqueIPs) {
    try {
      const res = await fetch(`${baseUrl}/${ip}`);
      const data: GeoResponse = await res.json();

      if (data.status === "success") {
        // Safely extract optional fields that may not be declared on GeoResponse
        const rawRecord = data as unknown as Record<string, unknown>;
        const asField = typeof rawRecord['as'] === 'string' ? (rawRecord['as'] as string) : undefined;
        const asnField = typeof rawRecord['asn'] === 'string' ? (rawRecord['asn'] as string) : undefined;
        const asnDetailsField = rawRecord['asnDetails'] ? (rawRecord['asnDetails'] as Record<string, unknown>) : undefined;

        results.push({
          ip: data.query || ip,
          country: data.country,
          countryCode: data.countryCode,
          region: data.regionName,
          regionCode: data.region,
          city: data.city,
          zip: data.zip,
          lat: data.lat,
          lon: data.lon,
          timezone: data.timezone,
          isp: data.isp,
          org: data.org,
          as: asField,
          asn: asnField,
          asnDetails: asnDetailsField ?? null,
          status: 'success',
          raw: data,
        });
       } else {
        results.push({ ip, status: 'fail', raw: data, error: data.message || 'Lookup failed' });
       }

    } catch (err) {
      results.push({
        ip,
        status: "error",
        error: "Geo Locate IP error"
      });
    }

    // rate limiting
    await new Promise(r => setTimeout(r, delayMs));
  }
  console.log(`[GEO LOCATE] Completed - Processed ${ips.length} IPs`);

  return results;
}