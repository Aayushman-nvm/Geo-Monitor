# Cyber Geo Monitor - Complete Implementation Guide

## Table of Contents
1. [Data Pipeline Architecture](#data-pipeline-architecture)
2. [Redis Cache Structure](#redis-cache-structure)
3. [Service Layer Implementation](#service-layer-implementation)
4. [Cron Job Setup](#cron-job-setup)
5. [Frontend Integration](#frontend-integration)
6. [AbuseIPDB Integration](#abuseipdb-integration)
7. [Groq AI Integration](#groq-ai-integration)
8. [Complete Code Examples](#complete-code-examples)

---

## 1. Data Pipeline Architecture

### Flow Overview
```
┌─────────────────────────────────────────────────────────────────┐
│  VERCEL CRON (Every 30 min)                                     │
│  /api/cron/refresh                                              │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ├─► Step 1: Fetch Cloudflare Radar Data
                 │   - getTraffic() → layer3 attacks, timeseries
                 │   - getAnomalies() → outages, BGP hijacks
                 │
                 ├─► Step 2: Extract ASNs from Attack Data
                 │   - Parse origin/target countries
                 │   - Extract ASNs involved in attacks
                 │
                 ├─► Step 3: Query AbuseIPDB for Each ASN
                 │   - Check ASN reputation
                 │   - Get reported IPs within ASN
                 │
                 ├─► Step 4: Geolocate IPs
                 │   - ip-api.com for lat/lon
                 │   - Extract country, city, ISP
                 │
                 ├─► Step 5: Calculate Threat Scores
                 │   - AbuseIPDB confidence (40%)
                 │   - Traffic anomaly magnitude (30%)
                 │   - Temporal clustering (20%)
                 │   - Geographic clustering (10%)
                 │
                 ├─► Step 6: Store in Redis
                 │   - threats:latest
                 │   - threats:history:{timestamp}
                 │   - asn:{asn}:cache
                 │   - stats:summary
                 │
                 └─► Step 7: Generate AI Summary (Groq)
                     - On-demand only (not every cron)
                     - Cache for 1 hour

┌─────────────────────────────────────────────────────────────────┐
│  CLIENT POLLING (Every 60s)                                     │
│  /api/threats                                                   │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 └─► Read from Redis Cache
                     - No API calls
                     - Return processed data
                     - Frontend renders immediately
```

### Why This Structure?

✅ **Frontend reads from Redis, NOT raw APIs**
- Redis structure is your "API contract" with frontend
- Backend can change Cloudflare/AbuseIPDB logic without breaking frontend
- Faster response times (no external API latency)

✅ **Cron does all heavy lifting**
- API rate limits respected
- Expensive operations run once, serve many times
- Client polling is cheap (Redis read only)

✅ **AI summaries on-demand**
- Don't waste Groq API calls on unused summaries
- Generate when user clicks "Explain This Threat"
- Cache for 1 hour per threat cluster

---

## 2. Redis Cache Structure

### Key Design Principles

1. **Frontend reads ONLY these keys**
2. **TTL (Time To Live) prevents stale data**
3. **Structure is JSON-serializable**
4. **Atomic updates (no partial writes)**

### Redis Keys Schema

```typescript
// types/redis.ts

export interface RedisThreat {
  id: string;                          // unique ID: `${ip}_${timestamp}`
  ip: string;
  lat: number;
  lon: number;
  country: string;
  countryCode: string;
  city: string;
  asn: number;
  asnName: string;
  isp: string;
  
  // Threat data
  threatScore: number;                 // 0-100
  abuseConfidence: number;             // from AbuseIPDB
  attackMagnitude: number;             // from Cloudflare
  isHighThreat: boolean;               // score > 75
  isClusteredThreat: boolean;          // score 50-75
  
  // Attack metadata
  attackType: string;                  // "UDP Flood", "SYN Attack"
  attackVector: string;                // "VECTOR_UDP", "VECTOR_TCP"
  protocol: string;                    // "UDP", "TCP", "ICMP"
  originCountry: string;
  targetCountry: string;
  
  // Temporal data
  firstSeen: string;                   // ISO timestamp
  lastSeen: string;
  occurrences: number;
  
  // Clustering
  cluster?: {
    id: string;
    relatedIPs: string[];
    region: string;
  };
}

export interface RedisHotspot {
  countryCode: string;
  countryName: string;
  threatDensity: number;               // 0-100
  attackCount: number;
  topASNs: Array<{
    asn: number;
    name: string;
    count: number;
  }>;
  coords: { lat: number; lon: number };
}

export interface RedisStats {
  totalThreats: number;
  highSeverityCount: number;
  activeCountries: number;
  topAttackType: string;
  lastUpdated: string;
}

export interface RedisHistoricalPoint {
  timestamp: string;
  threatCount: number;
  avgThreatScore: number;
  topCountry: string;
}
```

### Redis Key Structure

```bash
# Main data (what frontend polls)
threats:latest                        # JSON: RedisThreat[]
  → TTL: 1 hour
  → Updated every cron cycle (30 min)
  → Array of current threats

hotspots:latest                       # JSON: RedisHotspot[]
  → TTL: 1 hour
  → Regional threat density for heatmap

stats:summary                         # JSON: RedisStats
  → TTL: 1 hour
  → Dashboard metrics

# Historical data (for timeline view)
history:1h                            # JSON: RedisHistoricalPoint[]
  → TTL: 2 hours
  → Last 4 data points (30min intervals)

history:12h                           # JSON: RedisHistoricalPoint[]
  → TTL: 24 hours
  → Last 24 data points

history:24h                           # JSON: RedisHistoricalPoint[]
  → TTL: 48 hours
  → Last 48 data points

# ASN cache (on-demand enrichment)
asn:{asn}:details                     # JSON: ASNDetails
  → TTL: 24 hours
  → Expensive Cloudflare API call, cache aggressively

# AI summary cache
summary:threat:{clusterId}            # JSON: { summary: string, timestamp: string }
  → TTL: 1 hour
  → Groq API response

# AbuseIPDB cache
abuse:asn:{asn}                       # JSON: AbuseIPDBResponse
  → TTL: 6 hours
  → ASN reputation doesn't change quickly

abuse:ip:{ip}                         # JSON: IPAbuseData
  → TTL: 6 hours
```

### Example Redis Data (What Frontend Sees)

```json
// GET threats:latest
[
  {
    "id": "1.2.3.4_1704067200",
    "ip": "1.2.3.4",
    "lat": 55.7558,
    "lon": 37.6173,
    "country": "Russia",
    "countryCode": "RU",
    "city": "Moscow",
    "asn": 12389,
    "asnName": "ROSTELECOM-AS",
    "isp": "Rostelecom",
    
    "threatScore": 87,
    "abuseConfidence": 92,
    "attackMagnitude": 78,
    "isHighThreat": true,
    "isClusteredThreat": false,
    
    "attackType": "UDP Flood",
    "attackVector": "VECTOR_UDP",
    "protocol": "UDP",
    "originCountry": "Russia",
    "targetCountry": "United States",
    
    "firstSeen": "2024-01-01T00:00:00Z",
    "lastSeen": "2024-01-01T00:30:00Z",
    "occurrences": 3,
    
    "cluster": {
      "id": "cluster_ru_moscow_123",
      "relatedIPs": ["1.2.3.5", "1.2.3.6"],
      "region": "Moscow"
    }
  }
]
```

```json
// GET hotspots:latest
[
  {
    "countryCode": "RU",
    "countryName": "Russia",
    "threatDensity": 85,
    "attackCount": 247,
    "topASNs": [
      { "asn": 12389, "name": "ROSTELECOM-AS", "count": 89 },
      { "asn": 8359, "name": "MTS", "count": 67 }
    ],
    "coords": { "lat": 61.5240, "lon": 105.3188 }
  }
]
```

```json
// GET stats:summary
{
  "totalThreats": 1247,
  "highSeverityCount": 89,
  "activeCountries": 47,
  "topAttackType": "UDP Flood",
  "lastUpdated": "2024-01-01T00:30:00Z"
}
```

---

## 3. Service Layer Implementation

### File: `services/abuseipdb/client.ts`

```typescript
// services/abuseipdb/client.ts

const ABUSEIPDB_API_KEY = process.env.ABUSEIPDB_API_KEY!;
const BASE_URL = 'https://api.abuseipdb.com/api/v2';

export interface AbuseIPDBCheckResponse {
  data: {
    ipAddress: string;
    isPublic: boolean;
    ipVersion: number;
    isWhitelisted: boolean;
    abuseConfidenceScore: number;
    countryCode: string;
    usageType: string;
    isp: string;
    domain: string;
    hostnames: string[];
    totalReports: number;
    numDistinctUsers: number;
    lastReportedAt: string | null;
  };
}

export interface AbuseIPDBBlacklistResponse {
  data: Array<{
    ipAddress: string;
    abuseConfidenceScore: number;
    lastReportedAt: string;
  }>;
}

/**
 * Check a single IP address
 * Rate limit: 1000/day
 */
export async function checkIP(ip: string): Promise<AbuseIPDBCheckResponse> {
  const url = `${BASE_URL}/check?ipAddress=${ip}&maxAgeInDays=90&verbose`;
  
  const response = await fetch(url, {
    headers: {
      'Key': ABUSEIPDB_API_KEY,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`AbuseIPDB API error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Get blacklisted IPs (high confidence abuse)
 * This is CRITICAL for your use case!
 * confidenceMinimum=75 means only severe abusers
 * 
 * Rate limit: 1000/day (but this endpoint is expensive, use sparingly)
 */
export async function getBlacklist(
  confidenceMinimum = 75,
  limit = 100
): Promise<AbuseIPDBBlacklistResponse> {
  const url = `${BASE_URL}/blacklist?confidenceMinimum=${confidenceMinimum}&limit=${limit}`;
  
  const response = await fetch(url, {
    headers: {
      'Key': ABUSEIPDB_API_KEY,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`AbuseIPDB API error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * IMPORTANT: There is NO direct "check by ASN" endpoint in AbuseIPDB!
 * 
 * Workaround strategy:
 * 1. Use getBlacklist() to get top 100-1000 abusive IPs globally
 * 2. Geolocate those IPs (ip-api.com returns ASN!)
 * 3. Filter by ASNs found in Cloudflare attack data
 * 
 * This way you correlate:
 * - Cloudflare: "ASN 12389 is attacking"
 * - AbuseIPDB: "These IPs are abusive"
 * - ip-api: "Those IPs belong to ASN 12389"
 * = MATCH! High threat score.
 */
export async function checkIPsByASN(asn: number): Promise<string[]> {
  // Get global blacklist
  const blacklist = await getBlacklist(75, 1000);
  
  // Geolocate each IP to find which ASN it belongs to
  const ipsInASN: string[] = [];
  
  for (const entry of blacklist.data) {
    const geoData = await geolocateIP(entry.ipAddress);
    
    if (geoData.as && geoData.as.includes(`AS${asn}`)) {
      ipsInASN.push(entry.ipAddress);
    }
  }
  
  return ipsInASN;
}
```

### File: `services/geo/client.ts`

```typescript
// services/geo/client.ts

export interface IPGeoData {
  status: string;
  country: string;
  countryCode: string;
  region: string;
  regionName: string;
  city: string;
  zip: string;
  lat: number;
  lon: number;
  timezone: string;
  isp: string;
  org: string;
  as: string;                    // e.g., "AS12389 ROSTELECOM-AS"
  query: string;                 // the IP address
}

/**
 * Geolocate an IP address using ip-api.com
 * 
 * Rate limits (FREE tier):
 * - 45 requests per minute
 * - No daily limit
 * - No API key required
 * 
 * CRITICAL: This returns ASN info, which is perfect for your pipeline!
 */
export async function geolocateIP(ip: string): Promise<IPGeoData> {
  const url = `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`IP geolocation failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.status === 'fail') {
    throw new Error(`IP geolocation failed: ${data.message}`);
  }
  
  return data;
}

/**
 * Batch geolocate IPs
 * IMPORTANT: Rate limit is 45/min, so batch carefully
 */
export async function geolocateBatch(
  ips: string[],
  delayMs = 1400  // ~43 requests/min to stay safe
): Promise<IPGeoData[]> {
  const results: IPGeoData[] = [];
  
  for (const ip of ips) {
    try {
      const data = await geolocateIP(ip);
      results.push(data);
      
      // Rate limit delay
      if (ips.indexOf(ip) < ips.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`Failed to geolocate ${ip}:`, error);
    }
  }
  
  return results;
}

/**
 * Extract ASN number from AS string
 * "AS12389 ROSTELECOM-AS" → 12389
 */
export function extractASN(asString: string): number | null {
  const match = asString.match(/AS(\d+)/);
  return match ? parseInt(match[1]) : null;
}
```

### File: `services/ai/groq.ts`

```typescript
// services/ai/groq.ts

const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const BASE_URL = 'https://api.groq.com/openai/v1';

export interface ThreatSummaryInput {
  threats: Array<{
    ip: string;
    country: string;
    asn: number;
    asnName: string;
    attackType: string;
    threatScore: number;
    abuseConfidence: number;
  }>;
  hotspot?: {
    country: string;
    attackCount: number;
    topASNs: Array<{ asn: number; name: string }>;
  };
}

/**
 * Generate plain English summary of threat data
 * 
 * Model: llama-3.2-3b-preview (fastest, cheapest)
 * Rate limit: 14,400 requests/day (FREE tier)
 * 
 * Strategy: Cache summaries for 1 hour per unique threat cluster
 */
export async function generateThreatSummary(
  input: ThreatSummaryInput
): Promise<string> {
  const prompt = buildPrompt(input);
  
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.2-3b-preview',
      messages: [
        {
          role: 'system',
          content: 'You are a cybersecurity analyst. Explain threats in plain English for non-technical users. Be concise (3-4 sentences max).'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 150
    })
  });
  
  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}

function buildPrompt(input: ThreatSummaryInput): string {
  if (input.hotspot) {
    // Regional hotspot summary
    return `
Threat Hotspot in ${input.hotspot.country}:
- ${input.hotspot.attackCount} attacks detected
- Top ISPs involved: ${input.hotspot.topASNs.map(a => a.name).join(', ')}

Explain what's happening and why this region is a threat source.
`.trim();
  } else {
    // Individual threat cluster summary
    const topThreat = input.threats[0];
    return `
Cyber Threat Detected:
- IP: ${topThreat.ip}
- Location: ${topThreat.country}
- ISP: ${topThreat.asnName}
- Attack Type: ${topThreat.attackType}
- Threat Score: ${topThreat.threatScore}/100
- Abuse Confidence: ${topThreat.abuseConfidence}%

Explain this threat in simple terms.
`.trim();
  }
}
```

---

## 4. Cron Job Setup

### File: `app/api/cron/refresh/route.ts`

This is the BRAIN of your system. It orchestrates everything.

```typescript
// app/api/cron/refresh/route.ts

import { NextResponse } from 'next/server';
import { getTraffic } from '@/services/cloudflare/getTraffic';
import { getAnomalies } from '@/services/cloudflare/getAnomalies';
import { getBlacklist } from '@/services/abuseipdb/client';
import { geolocateBatch, extractASN } from '@/services/geo/client';
import { calculateThreatScore } from '@/lib/scoring/calculateScore';
import { detectClusters } from '@/lib/scoring/clustering';
import { redis } from '@/lib/redis';
import type { RedisThreat, RedisHotspot, RedisStats } from '@/types/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel function timeout

/**
 * CRON ENDPOINT
 * 
 * Triggered every 30 minutes by Vercel Cron
 * 
 * Jobs:
 * 1. Fetch Cloudflare attack data
 * 2. Get AbuseIPDB blacklist
 * 3. Geolocate IPs
 * 4. Calculate threat scores
 * 5. Detect clusters
 * 6. Store in Redis
 */
export async function GET(request: Request) {
  try {
    console.log('[CRON] Starting refresh cycle...');
    
    // Verify cron secret (security)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // ============================================
    // STEP 1: Fetch Cloudflare Radar Data
    // ============================================
    console.log('[CRON] Step 1: Fetching Cloudflare data...');
    
    const [trafficData, anomalyData] = await Promise.all([
      getTraffic(),
      getAnomalies()
    ]);
    
    // Extract ASNs from attack data
    const suspiciousASNs = extractSuspiciousASNs(trafficData, anomalyData);
    console.log(`[CRON] Found ${suspiciousASNs.size} suspicious ASNs`);
    
    // ============================================
    // STEP 2: Get AbuseIPDB Blacklist
    // ============================================
    console.log('[CRON] Step 2: Fetching AbuseIPDB blacklist...');
    
    const blacklist = await getBlacklist(75, 500); // Top 500 abusive IPs
    console.log(`[CRON] Got ${blacklist.data.length} blacklisted IPs`);
    
    // ============================================
    // STEP 3: Geolocate IPs
    // ============================================
    console.log('[CRON] Step 3: Geolocating IPs...');
    
    const geoData = await geolocateBatch(
      blacklist.data.map(entry => entry.ipAddress)
    );
    
    // ============================================
    // STEP 4: Correlate with Cloudflare ASNs
    // ============================================
    console.log('[CRON] Step 4: Correlating data...');
    
    const correlatedThreats: RedisThreat[] = [];
    
    for (let i = 0; i < geoData.length; i++) {
      const geo = geoData[i];
      const abuse = blacklist.data[i];
      
      if (!geo.as) continue;
      
      const asn = extractASN(geo.as);
      if (!asn) continue;
      
      // Check if this ASN is in our suspicious list from Cloudflare
      const isSuspicious = suspiciousASNs.has(asn);
      
      // Get attack metadata if this ASN is involved
      const attackMeta = getAttackMetadata(asn, trafficData);
      
      // ============================================
      // STEP 5: Calculate Threat Score
      // ============================================
      const threatScore = calculateThreatScore({
        abuseConfidence: abuse.abuseConfidenceScore,
        attackMagnitude: attackMeta.magnitude,
        temporalFactor: attackMeta.temporalFactor,
        geoFactor: isSuspicious ? 10 : 5 // Boost if in Cloudflare data
      });
      
      correlatedThreats.push({
        id: `${abuse.ipAddress}_${Date.now()}`,
        ip: abuse.ipAddress,
        lat: geo.lat,
        lon: geo.lon,
        country: geo.country,
        countryCode: geo.countryCode,
        city: geo.city,
        asn: asn,
        asnName: geo.org,
        isp: geo.isp,
        
        threatScore,
        abuseConfidence: abuse.abuseConfidenceScore,
        attackMagnitude: attackMeta.magnitude,
        isHighThreat: threatScore > 75,
        isClusteredThreat: threatScore >= 50 && threatScore <= 75,
        
        attackType: attackMeta.attackType,
        attackVector: attackMeta.vector,
        protocol: attackMeta.protocol,
        originCountry: attackMeta.originCountry || geo.country,
        targetCountry: attackMeta.targetCountry || 'Unknown',
        
        firstSeen: abuse.lastReportedAt || new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        occurrences: 1
      });
    }
    
    console.log(`[CRON] Generated ${correlatedThreats.length} correlated threats`);
    
    // ============================================
    // STEP 6: Detect Clusters
    // ============================================
    console.log('[CRON] Step 5: Detecting clusters...');
    
    const clusteredThreats = detectClusters(correlatedThreats);
    
    // ============================================
    // STEP 7: Generate Hotspots
    // ============================================
    console.log('[CRON] Step 6: Generating hotspots...');
    
    const hotspots = generateHotspots(clusteredThreats);
    
    // ============================================
    // STEP 8: Calculate Stats
    // ============================================
    const stats: RedisStats = {
      totalThreats: clusteredThreats.length,
      highSeverityCount: clusteredThreats.filter(t => t.isHighThreat).length,
      activeCountries: new Set(clusteredThreats.map(t => t.countryCode)).size,
      topAttackType: getTopAttackType(clusteredThreats),
      lastUpdated: new Date().toISOString()
    };
    
    // ============================================
    // STEP 9: Store in Redis
    // ============================================
    console.log('[CRON] Step 7: Storing in Redis...');
    
    await Promise.all([
      // Main data
      redis.set('threats:latest', JSON.stringify(clusteredThreats), { ex: 3600 }),
      redis.set('hotspots:latest', JSON.stringify(hotspots), { ex: 3600 }),
      redis.set('stats:summary', JSON.stringify(stats), { ex: 3600 }),
      
      // Historical data
      addToHistory(clusteredThreats, stats)
    ]);
    
    console.log('[CRON] Refresh cycle complete!');
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        threatsGenerated: clusteredThreats.length,
        hotspotsGenerated: hotspots.length,
        highSeverity: stats.highSeverityCount
      }
    });
    
  } catch (error) {
    console.error('[CRON] Error:', error);
    return NextResponse.json(
      { error: 'Refresh failed', details: error },
      { status: 500 }
    );
  }
}

// ============================================
// Helper Functions
// ============================================

function extractSuspiciousASNs(trafficData: any, anomalyData: any): Set<number> {
  const asns = new Set<number>();
  
  // Extract from BGP hijacks
  anomalyData.bgpHijacks.result?.events?.forEach((event: any) => {
    if (event.hijacker_asn) asns.add(event.hijacker_asn);
    if (event.victim_asns) event.victim_asns.forEach((asn: number) => asns.add(asn));
  });
  
  // Extract from outages (if ASN data exists)
  anomalyData.outages.result?.annotations?.forEach((annotation: any) => {
    annotation.asns?.forEach((asn: number) => asns.add(asn));
  });
  
  return asns;
}

function getAttackMetadata(asn: number, trafficData: any) {
  // Parse Cloudflare traffic data to find attack details for this ASN
  // This is simplified - you'll need to cross-reference with ASN lookup
  
  return {
    magnitude: 50, // Placeholder
    temporalFactor: 20,
    attackType: 'UDP Flood',
    vector: 'VECTOR_UDP',
    protocol: 'UDP',
    originCountry: null,
    targetCountry: null
  };
}

function generateHotspots(threats: RedisThreat[]): RedisHotspot[] {
  const byCountry = new Map<string, RedisThreat[]>();
  
  threats.forEach(threat => {
    if (!byCountry.has(threat.countryCode)) {
      byCountry.set(threat.countryCode, []);
    }
    byCountry.get(threat.countryCode)!.push(threat);
  });
  
  const hotspots: RedisHotspot[] = [];
  
  byCountry.forEach((countryThreats, countryCode) => {
    const avgScore = countryThreats.reduce((sum, t) => sum + t.threatScore, 0) / countryThreats.length;
    
    // Count ASNs
    const asnCounts = new Map<number, number>();
    countryThreats.forEach(t => {
      asnCounts.set(t.asn, (asnCounts.get(t.asn) || 0) + 1);
    });
    
    const topASNs = Array.from(asnCounts.entries())
      .map(([asn, count]) => ({
        asn,
        name: countryThreats.find(t => t.asn === asn)!.asnName,
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    hotspots.push({
      countryCode,
      countryName: countryThreats[0].country,
      threatDensity: Math.min(100, avgScore * (countryThreats.length / 10)),
      attackCount: countryThreats.length,
      topASNs,
      coords: {
        lat: countryThreats[0].lat,
        lon: countryThreats[0].lon
      }
    });
  });
  
  return hotspots.sort((a, b) => b.threatDensity - a.threatDensity);
}

function getTopAttackType(threats: RedisThreat[]): string {
  const types = new Map<string, number>();
  threats.forEach(t => {
    types.set(t.attackType, (types.get(t.attackType) || 0) + 1);
  });
  
  return Array.from(types.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
}

async function addToHistory(threats: RedisThreat[], stats: RedisStats) {
  const timestamp = new Date().toISOString();
  const historyPoint = {
    timestamp,
    threatCount: threats.length,
    avgThreatScore: threats.reduce((sum, t) => sum + t.threatScore, 0) / threats.length,
    topCountry: threats[0]?.countryCode || 'Unknown'
  };
  
  // Add to 1h history
  const history1h = JSON.parse(await redis.get('history:1h') || '[]');
  history1h.push(historyPoint);
  if (history1h.length > 4) history1h.shift(); // Keep last 2 hours (4 x 30min)
  await redis.set('history:1h', JSON.stringify(history1h), { ex: 7200 });
  
  // Add to 12h history
  const history12h = JSON.parse(await redis.get('history:12h') || '[]');
  history12h.push(historyPoint);
  if (history12h.length > 24) history12h.shift();
  await redis.set('history:12h', JSON.stringify(history12h), { ex: 86400 });
  
  // Add to 24h history
  const history24h = JSON.parse(await redis.get('history:24h') || '[]');
  history24h.push(historyPoint);
  if (history24h.length > 48) history24h.shift();
  await redis.set('history:24h', JSON.stringify(history24h), { ex: 172800 });
}
```

### File: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/refresh",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

**CRITICAL:** Set `CRON_SECRET` in Vercel environment variables!

---

## 5. Frontend Integration

### File: `app/api/threats/route.ts` (Client Endpoint)

```typescript
// app/api/threats/route.ts

import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import type { RedisThreat, RedisHotspot, RedisStats } from '@/types/redis';

export const dynamic = 'force-dynamic';

/**
 * CLIENT POLLING ENDPOINT
 * 
 * Frontend calls this every 60 seconds
 * Simply reads from Redis cache
 * NO external API calls
 */
export async function GET() {
  try {
    const [threatsRaw, hotspotsRaw, statsRaw] = await Promise.all([
      redis.get('threats:latest'),
      redis.get('hotspots:latest'),
      redis.get('stats:summary')
    ]);
    
    const threats: RedisThreat[] = threatsRaw ? JSON.parse(threatsRaw) : [];
    const hotspots: RedisHotspot[] = hotspotsRaw ? JSON.parse(hotspotsRaw) : [];
    const stats: RedisStats = statsRaw ? JSON.parse(statsRaw) : null;
    
    return NextResponse.json({
      success: true,
      data: {
        threats,
        hotspots,
        stats
      },
      cachedAt: stats?.lastUpdated || new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[API] Error fetching threats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch threats' },
      { status: 500 }
    );
  }
}
```

### File: `hooks/useThreats.ts`

```typescript
// hooks/useThreats.ts

import { useEffect } from 'react';
import { useThreatStore } from '@/store/useThreatStore';

/**
 * Hook to poll threats API every 60 seconds
 */
export function useThreats() {
  const { threats, hotspots, stats, setData, setLoading, setError } = useThreatStore();
  
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    async function fetchThreats() {
      try {
        setLoading(true);
        
        const response = await fetch('/api/threats');
        
        if (!response.ok) {
          throw new Error('Failed to fetch threats');
        }
        
        const json = await response.json();
        
        setData({
          threats: json.data.threats,
          hotspots: json.data.hotspots,
          stats: json.data.stats
        });
        
        setError(null);
      } catch (error) {
        console.error('Error fetching threats:', error);
        setError(error instanceof Error ? error.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    
    // Initial fetch
    fetchThreats();
    
    // Poll every 60 seconds
    interval = setInterval(fetchThreats, 60000);
    
    return () => clearInterval(interval);
  }, [setData, setLoading, setError]);
  
  return { threats, hotspots, stats };
}
```

### File: `store/useThreatStore.ts`

```typescript
// store/useThreatStore.ts

import { create } from 'zustand';
import type { RedisThreat, RedisHotspot, RedisStats } from '@/types/redis';

interface ThreatStore {
  threats: RedisThreat[];
  hotspots: RedisHotspot[];
  stats: RedisStats | null;
  loading: boolean;
  error: string | null;
  
  setData: (data: {
    threats: RedisThreat[];
    hotspots: RedisHotspot[];
    stats: RedisStats;
  }) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useThreatStore = create<ThreatStore>((set) => ({
  threats: [],
  hotspots: [],
  stats: null,
  loading: false,
  error: null,
  
  setData: (data) => set({ threats: data.threats, hotspots: data.hotspots, stats: data.stats }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error })
}));
```

### File: `app/map/page.tsx` (Usage Example)

```typescript
// app/map/page.tsx

'use client';

import { useThreats } from '@/hooks/useThreats';
import Map2D from '@/components/map/Map2D';
import ThreatList from '@/components/threat/ThreatList';

export default function MapPage() {
  const { threats, hotspots, stats } = useThreats();
  
  if (!stats) {
    return <div>Loading...</div>;
  }
  
  return (
    <div className="h-screen flex">
      <div className="flex-1">
        <Map2D 
          threats={threats}
          hotspots={hotspots}
        />
      </div>
      
      <div className="w-96 bg-gray-900 p-4 overflow-y-auto">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-white">Statistics</h2>
          <p className="text-gray-400">Total Threats: {stats.totalThreats}</p>
          <p className="text-red-400">High Severity: {stats.highSeverityCount}</p>
          <p className="text-gray-400">Active Countries: {stats.activeCountries}</p>
          <p className="text-gray-400">Top Attack: {stats.topAttackType}</p>
        </div>
        
        <ThreatList threats={threats} />
      </div>
    </div>
  );
}
```

---

## 6. Scoring Algorithm Implementation

### File: `lib/scoring/calculateScore.ts`

```typescript
// lib/scoring/calculateScore.ts

export interface ScoreInput {
  abuseConfidence: number;      // 0-100 from AbuseIPDB
  attackMagnitude: number;       // 0-100 from Cloudflare
  temporalFactor: number;        // 0-100 (clustering in time)
  geoFactor: number;             // 0-100 (clustering in space)
}

/**
 * Calculate composite threat score
 * 
 * Formula:
 * - AbuseIPDB confidence: 40%
 * - Traffic anomaly magnitude: 30%
 * - Temporal clustering: 20%
 * - Geographic clustering: 10%
 * 
 * Returns: 0-100 threat score
 */
export function calculateThreatScore(input: ScoreInput): number {
  const score = 
    (input.abuseConfidence * 0.40) +
    (input.attackMagnitude * 0.30) +
    (input.temporalFactor * 0.20) +
    (input.geoFactor * 0.10);
  
  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Calculate temporal clustering factor
 * More attacks in shorter time = higher score
 */
export function calculateTemporalFactor(
  occurrences: number,
  timeWindowHours: number
): number {
  // Example: 10 attacks in 1 hour = 100 score
  //          10 attacks in 24 hours = 41 score
  const attacksPerHour = occurrences / timeWindowHours;
  return Math.min(100, attacksPerHour * 10);
}

/**
 * Calculate geographic clustering factor
 * More attacks from same region = higher score
 */
export function calculateGeoFactor(
  nearbyThreats: number,
  radiusKm: number
): number {
  // Example: 20 threats within 100km = 100 score
  //          5 threats within 100km = 25 score
  const density = nearbyThreats / (radiusKm / 100);
  return Math.min(100, density * 5);
}
```

### File: `lib/scoring/clustering.ts`

```typescript
// lib/scoring/clustering.ts

import type { RedisThreat } from '@/types/redis';

/**
 * Detect threat clusters based on:
 * 1. Geographic proximity (within 500km)
 * 2. Temporal proximity (within 1 hour)
 * 3. Same ASN
 */
export function detectClusters(threats: RedisThreat[]): RedisThreat[] {
  const clusters = new Map<string, RedisThreat[]>();
  
  threats.forEach(threat => {
    let assigned = false;
    
    // Try to assign to existing cluster
    for (const [clusterId, clusterThreats] of clusters.entries()) {
      const representative = clusterThreats[0];
      
      // Check if threat belongs to this cluster
      if (
        haversineDistance(
          threat.lat, threat.lon,
          representative.lat, representative.lon
        ) < 500 && // within 500km
        threat.asn === representative.asn
      ) {
        clusterThreats.push(threat);
        assigned = true;
        break;
      }
    }
    
    // Create new cluster if not assigned
    if (!assigned) {
      const clusterId = `cluster_${threat.countryCode}_${threat.city}_${threat.asn}`;
      clusters.set(clusterId, [threat]);
    }
  });
  
  // Update threats with cluster info
  const clusteredThreats: RedisThreat[] = [];
  
  clusters.forEach((clusterThreats, clusterId) => {
    clusterThreats.forEach(threat => {
      clusteredThreats.push({
        ...threat,
        cluster: clusterThreats.length > 1 ? {
          id: clusterId,
          relatedIPs: clusterThreats.map(t => t.ip).filter(ip => ip !== threat.ip),
          region: threat.city
        } : undefined,
        isClusteredThreat: clusterThreats.length > 1 && threat.threatScore >= 50 && threat.threatScore <= 75
      });
    });
  });
  
  return clusteredThreats;
}

/**
 * Haversine distance between two lat/lon points (in km)
 */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
```

---

## 7. Summary

### What You've Learned

✅ **Redis is your "frontend API"**
- Frontend reads ONLY from Redis
- Cron does all heavy lifting
- Structure is optimized for rendering, not raw API data

✅ **AbuseIPDB has NO ASN endpoint**
- Use `getBlacklist()` to get top abusive IPs
- Geolocate those IPs (ip-api returns ASN!)
- Correlate with Cloudflare ASN data

✅ **Groq summaries are on-demand only**
- Don't waste API calls on unused summaries
- Cache for 1 hour per unique cluster
- Generate when user clicks "Explain"

✅ **Cron orchestrates everything**
- Runs every 30 minutes
- Fetches, enriches, scores, stores
- Client just polls Redis cache

### Next Steps

1. ✅ Set up Redis (Upstash)
2. ✅ Implement cron endpoint
3. ✅ Test with manual API calls
4. ✅ Build frontend polling
5. ✅ Add AI summaries (last!)

**You're building a production-grade threat intelligence platform on free tiers.** This is impressive work! 🚀
