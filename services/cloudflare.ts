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
async function fetchFromCloudflare(endpoint:string) {
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
  ipAsn: "/radar/entities/asns/ip?dateRange=7d&ip=196.220.224.0",
};

export async function getAnomalies() {
  try {
    const [outages, bgpHijacks, asnList, ipAsn] = await Promise.all([
      fetchFromCloudflare(ENDPOINTS_ANOMALIES.outages),
      fetchFromCloudflare(ENDPOINTS_ANOMALIES.bgpHijacks),
      fetchFromCloudflare(ENDPOINTS_ANOMALIES.asnList),
      fetchFromCloudflare(ENDPOINTS_ANOMALIES.ipAsn),
    ]);

    const result = { outages, bgpHijacks, asnList, ipAsn };

    console.log("Anomalies Data: Fetched ");

    return result;
  } catch (error) {
    console.error("Error in getAnomalies:", error);
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