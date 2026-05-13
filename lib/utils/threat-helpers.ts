// lib/utils/threat-helpers.ts

/**
 * Shared helper functions for threat processing
 * These can be imported by any route that needs them
 */

import type { RedisThreat } from "@/types/redis";

/**
 * Extract ASN number from AS string
 * Example: "AS13335 Cloudflare" → 13335
 */
export function extractASN(asString: string | null): number | null {
  if (!asString) return null;
  const match = asString.match(/AS(\d+)/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Extract first usable IP from CIDR notation
 * Example: "1.1.1.0/24" → "1.1.1.1"
 */
export function getFirstIPFromCIDR(cidr: string): string | null {
  try {
    const [baseIP, mask] = cidr.split("/");
    const parts = baseIP.split(".").map(Number);

    // For /24, just use .1
    if (parseInt(mask) === 24) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
    }

    // For other masks, still use first IP
    return `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3] + 1}`;
  } catch {
    return null;
  }
}

/**
 * Build country hotness map from Cloudflare top origins
 * Returns a map of country code → hotness score (0-100)
 */
export function buildCountryHotness(topOrigins: any[]): Map<string, number> {
  const map = new Map<string, number>();

  topOrigins.forEach((origin: any, index: number) => {
    // Rank 1 = 100, Rank 2 = 80, Rank 3 = 60, Rank 4 = 40, Rank 5 = 20
    const score = Math.max(0, 100 - index * 20);
    map.set(origin.originCountryAlpha2, score);
  });

  return map;
}

/**
 * Calculate attack magnitude for BGP hijack events
 */
export function calculateBGPAttackMagnitude(
  hijackEvent: {
    confidenceScore: number;
    duration: number;
  },
  countryCode: string,
  topAttacks: any[],
): number {
  // 1. Base score from BGP confidence (0-12 scale)
  // Scale to 0-50 (half of total magnitude)
  const bgpScore = (hijackEvent.confidenceScore / 12) * 50;

  // 2. Country-level attack percentage
  const countryAttacks = topAttacks.filter(
    (attack: any) => attack.originCountryAlpha2 === countryCode,
  );

  const totalCountryAttackPercent = countryAttacks.reduce(
    (sum: number, attack: any) => sum + parseFloat(attack.value),
    0,
  );

  const countryScore = Math.min(30, totalCountryAttackPercent * 1.5);

  // 3. Hijack duration bonus
  const durationMinutes = hijackEvent.duration / 60;
  const durationScore = Math.min(20, durationMinutes / 10);

  return Math.round(bgpScore + countryScore + durationScore);
}

/**
 * Calculate attack magnitude for blacklisted IPs
 */
export function calculateBlacklistAttackMagnitude(
  abuseEntry: {
    totalReports: number;
    lastReportedAt: string;
  },
  countryCode: string,
  topAttacks: any[],
): number {
  // 1. Base score from total reports
  const reportScore = Math.min(40, abuseEntry.totalReports * 2);

  // 2. Country-level attack percentage
  const countryAttacks = topAttacks.filter(
    (attack: any) => attack.originCountryAlpha2 === countryCode,
  );

  const totalCountryAttackPercent = countryAttacks.reduce(
    (sum: number, attack: any) => sum + parseFloat(attack.value),
    0,
  );

  const countryScore = Math.min(30, totalCountryAttackPercent * 1.5);

  // 3. Recency bonus
  const lastReported = new Date(abuseEntry.lastReportedAt);
  const hoursSinceReport =
    (Date.now() - lastReported.getTime()) / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 30 - hoursSinceReport);

  return Math.round(reportScore + countryScore + recencyScore);
}

/**
 * Group threats by country
 */
export function groupThreatsByCountry(
  threats: RedisThreat[],
): Map<string, RedisThreat[]> {
  const byCountry = new Map<string, RedisThreat[]>();

  threats.forEach((threat) => {
    if (!byCountry.has(threat.countryCode)) {
      byCountry.set(threat.countryCode, []);
    }
    byCountry.get(threat.countryCode)!.push(threat);
  });

  return byCountry;
}