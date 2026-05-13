import dotenv from "dotenv";
dotenv.config();

interface getBlacklistProps {
  min: number;
  limit: number;
}

const BASE_URL = "https://api.abuseipdb.com/api/v2";
const API_KEY = process.env.ABUSEIPDB_API_KEY;

export async function getBlacklist({ min, limit }: getBlacklistProps) {
  try {
    const response = await fetch(
      `${BASE_URL}/blacklist?confidenceMinimum=${min}&limit=${limit}`,
      {
        headers: {
          Key: API_KEY!,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    console.log("BLACKLIST DATA: Fetched ");
    return data;
  } catch (error) {
    console.error(`Error fetching Blacklist:`, error);
    return null; // prevents total failure
  }
}
export async function getIPDetails(ip: string) {
  try {
    const checkParams = new URLSearchParams({
      ipAddress: ip,
      maxAgeInDays: "90",
    });
    checkParams.append("verbose", "");

    const res = await fetch(
      `${BASE_URL}/check?${checkParams.toString()}`,
      {
        method: "GET",
        headers: {
          Key: API_KEY!,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      throw new Error(`AbuseIPDB error: ${await res.text()}`);
    }

    const data = await res.json();
    return data; // ✅ THIS WAS MISSING
  } catch (error) {
    console.error(error);
    throw error; // better to rethrow
  }
}

//getBlacklist({ min: 75, limit: 10 });
