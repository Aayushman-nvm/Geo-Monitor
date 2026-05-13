

// lib/scoring/calculateScore.ts

interface ThreatScoringInput {
  // From AbuseIPDB
  abuseConfidence: number;           // 0-100
  totalReports?: number;             // Number of abuse reports
  lastReportedAt?: string;           // ISO timestamp
  
  // From Cloudflare BGP
  bgpHijack?: {
    confidenceScore: number;         // 0-12
    duration: number;                // seconds
  };
  
  // Geographic context
  countryCode: string;
  topAttacks: Array<{                // Cloudflare topAttacks data
    originCountryAlpha2: string;
    value: string;                   // Attack percentage
  }>;
  
  // Temporal data
  occurrenceCount: number;           // How many times we've seen this IP
  firstSeenHoursAgo: number;         // Hours since first detection
  
  // Country hotness
  countryHotness: number;            // 0-100 from rankings
}

export function calculateThreatScore(input: ThreatScoringInput): number {
  // 1. Calculate Attack Magnitude (0-100)
  const attackMagnitude = input.bgpHijack
    ? calculateBGPAttackMagnitude(
        input.bgpHijack,
        input.countryCode,
        input.topAttacks
      )
    : calculateBlacklistAttackMagnitude(
        {
          totalReports: input.totalReports || 0,
          lastReportedAt: input.lastReportedAt || new Date().toISOString()
        },
        input.countryCode,
        input.topAttacks
      );
  
  // 2. Calculate Temporal Clustering (0-100)
  const temporalClustering = calculateTemporalScore(
    input.occurrenceCount,
    input.firstSeenHoursAgo
  );
  
  // 3. Apply weighted formula
  const threatScore = 
    (input.abuseConfidence * 0.35) +
    (attackMagnitude * 0.35) +
    (temporalClustering * 0.15) +
    (input.countryHotness * 0.15);
  
  return Math.round(Math.min(100, Math.max(0, threatScore)));
}

export function calculateBGPAttackMagnitude(
  hijack: { confidenceScore: number; duration: number },
  countryCode: string,
  topAttacks: Array<{ originCountryAlpha2: string; value: string }>
): number {
  // BGP confidence contribution (0-50)
  const bgpScore = (hijack.confidenceScore / 12) * 50;
  
  // Country attack percentage contribution (0-30)
  const countryAttackSum = topAttacks
    .filter(a => a.originCountryAlpha2 === countryCode)
    .reduce((sum, a) => sum + parseFloat(a.value), 0);
  const countryScore = Math.min(30, countryAttackSum * 1.5);
  
  // Duration contribution (0-20)
  const durationMinutes = hijack.duration / 60;
  const durationScore = Math.min(20, durationMinutes / 10);
  
  return Math.round(bgpScore + countryScore + durationScore);
}

export function calculateBlacklistAttackMagnitude(
  abuse: { totalReports: number; lastReportedAt: string },
  countryCode: string,
  topAttacks: Array<{ originCountryAlpha2: string; value: string }>
): number {
  // Report volume contribution (0-40)
  const reportScore = Math.min(40, abuse.totalReports * 2);
  
  // Country attack percentage contribution (0-30)
  const countryAttackSum = topAttacks
    .filter(a => a.originCountryAlpha2 === countryCode)
    .reduce((sum, a) => sum + parseFloat(a.value), 0);
  const countryScore = Math.min(30, countryAttackSum * 1.5);
  
  // Recency contribution (0-30)
  const hoursSince = (Date.now() - new Date(abuse.lastReportedAt).getTime()) / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 30 - hoursSince);
  
  return Math.round(reportScore + countryScore + recencyScore);
}

export function calculateTemporalScore(
  occurrenceCount: number,
  firstSeenHoursAgo: number
): number {
  // Frequency score (0-70)
  // More occurrences in shorter time = higher score
  const frequencyScore = Math.min(70, occurrenceCount * 10);
  
  // Persistence score (0-30)
  // Seen over longer period = persistent threat
  const persistenceScore = Math.min(30, firstSeenHoursAgo / 2);
  
  return frequencyScore + persistenceScore;
}

export function getThreatLevel(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}