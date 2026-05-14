import dotenv from "dotenv";
dotenv.config();

const BASE_URL = "https://api.cloudflare.com/client/v4";
const API_KEY = process.env.CLOUDFLARE_API_KEY;

//Common header
const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

//Fetch function
async function fetchFromCloudflare(endpoint: string) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error);
    return null; // prevents total failure
  }
}

/* =========================
   ANOMALIES ENDPOINTS
========================= */
const ENDPOINTS_ANOMALIES = {
  outages: "/radar/annotations/outages?dateRange=7d",
  bgpHijacks: "/radar/bgp/hijacks/events",
  asnList: "/radar/entities/asns",
};

/**
 * Fetch anomalies (outages, BGP hijacks, ASN list). Do NOT perform ip->ASN lookup here
 * because we need to use IPs extracted from traffic/hijack data. Use getIpAsn(ip)
 * when an IP is known.
 */
export async function getAnomalies() {
  try {
    const [outages, bgpHijacks, asnList] = await Promise.all([
      fetchFromCloudflare(ENDPOINTS_ANOMALIES.outages),
      fetchFromCloudflare(ENDPOINTS_ANOMALIES.bgpHijacks),
      fetchFromCloudflare(ENDPOINTS_ANOMALIES.asnList),
    ]);

    const result = { outages, bgpHijacks, asnList };

    console.log("Anomalies Data: Fetched");

    return result;
  } catch (error) {
    console.error("Error in getAnomalies:", error);
    return null;
  }
}

/**
 * Dynamic IP -> ASN lookup. Call this with a real IP (from traffic or hijack data)
 * instead of relying on a hardcoded IP.
 */
export interface CloudflareAsnInfo {
  asn: number;
  name?: string;
  orgName?: string;
  website?: string;
  country?: string;
  countryName?: string;
  source?: string;
  estimatedUsers?: { estimatedUsers?: number; locations?: Array<Record<string, unknown>> };
  [k: string]: unknown;
}

export async function getIpAsn(ip: string): Promise<{ result?: { asn?: CloudflareAsnInfo } } | null> {
  if (!ip) return null;
  const endpoint = `/radar/entities/asns/ip?dateRange=7d&ip=${encodeURIComponent(ip)}`;
  try {
    const data = await fetchFromCloudflare(endpoint);
    return data as { result?: { asn?: CloudflareAsnInfo } } | null;
  } catch (err) {
    console.error(`Error fetching ASN info for ip=${ip}:`, err);
    return null;
  }
}

/* =========================
   TRAFFIC ENDPOINTS
========================= */
const ENDPOINTS_TRAFFIC = {
  topAttacks: "/radar/attacks/layer3/top/attacks?dateRange=7d",
  topOrigins: "/radar/attacks/layer3/top/locations/origin?dateRange=7d",
  topTargets: "/radar/attacks/layer3/top/locations/target?dateRange=7d",
};

export async function getTraffic() {
  try {
    const [topAttacks, topOrigins, topTargets] = await Promise.all([
      fetchFromCloudflare(ENDPOINTS_TRAFFIC.topAttacks),
      fetchFromCloudflare(ENDPOINTS_TRAFFIC.topOrigins),
      fetchFromCloudflare(ENDPOINTS_TRAFFIC.topTargets),
    ]);

    const result = { topAttacks, topOrigins, topTargets };

    console.log("Traffic Data: Fetched");

    return result;
  } catch (error) {
    console.error("Error in getTraffic:", error);
    return null;
  }
}

/* =========================
   OPTIONAL: RUN BOTH
========================= */
async function main() {
  await getAnomalies();
  await getTraffic();
}

main();