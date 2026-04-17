# UPDATED Implementation Guide - Real API Response Analysis

## Critical Discoveries from Real Data

### ✅ What We Have (Useful Data)

1. **Top Attacks (topAttacks)** - Country-level attack flows ✅
   - Origin → Target pairs (BR → US, US → CN, etc.)
   - Attack magnitude as percentages
   - Perfect for map trails visualization

2. **Top Origins (topOrigins)** - Attack source rankings ✅
   - Top attacking countries with percentages
   - Can derive "hotspot intensity"

3. **Top Targets (topTargets)** - Most attacked countries ✅
   - Can overlay with AbuseIPDB data

4. **BGP Hijacks** - HIGH-VALUE CRITICAL DATA ✅
   - Contains actual ASNs (hijacker_asn, victim_asns)
   - Includes confidence scores
   - Has IP prefixes (CIDR ranges like "41.220.10.0/24")
   - **This is our bridge to IPs!**

5. **Outages** - Infrastructure context ✅
   - Contains ASNs affected
   - Government-directed vs weather vs technical
   - Good for additional context

### ❌ What We DON'T Have (Missing Data)

1. **NO individual IPs** in attack data
   - Only country-level aggregates
   - No IP addresses to geolocate directly

2. **Timeseries is not useful** for our use case
   - Just normalized values (0-1 scale)
   - No actionable data for threat scoring
   - Skip this endpoint entirely

3. **ASN List** endpoint returns ALL ASNs
   - Not filtered by suspicious activity
   - Too broad to be useful

---

## 🔄 REVISED Data Flow Strategy

### The Problem
Cloudflare gives us **countries** and **ASNs**, but NOT individual IPs.  
AbuseIPDB needs IPs OR ASN ranges.

### The Solution: Two-Pronged Approach

```
┌─────────────────────────────────────────────────────────────┐
│ PATH 1: BGP Hijack Events → IP Prefixes → Individual IPs   │
└─────────────────────────────────────────────────────────────┘

1. Fetch BGP hijacks (contains IP prefixes like "41.220.10.0/24")
2. Extract first IP from each /24 range (e.g., 41.220.10.1)
3. Query AbuseIPDB with that IP
4. Geolocate the IP (ip-api.com)
5. Score and display

┌─────────────────────────────────────────────────────────────┐
│ PATH 2: AbuseIPDB Blacklist → Country Correlation          │
└─────────────────────────────────────────────────────────────┘

1. Fetch AbuseIPDB global blacklist (top 500 abusive IPs)
2. Geolocate all IPs (get country codes)
3. Match with Cloudflare's top attacking countries
4. Boost threat scores for IPs in "hot" countries
5. Score and display
```

---

## 📊 REVISED Redis Cache Structure

Based on what data we **actually get** from APIs:

### Redis Keys

```typescript
// MAIN DATA (Updated every 30 min by cron)
threats:latest              // RedisThreat[] - processed & scored threats
hotspots:latest             // RedisHotspot[] - country-level heatmap
stats:summary               // RedisStats - dashboard metrics

// HISTORICAL (Rolling window)
history:1h                  // Last 2 hours of snapshots
history:12h                 // Last 12 hours
history:24h                 // Last 24 hours

// CLOUDFLARE RAW CACHE (30 min TTL, for debugging)
cloudflare:attacks:raw      // Raw topAttacks response
cloudflare:hijacks:raw      // Raw bgpHijacks response
cloudflare:outages:raw      // Raw outages response

// ABUSEIPDB CACHE (6 hour TTL)
abuseipdb:blacklist         // Global blacklist response

// ON-DEMAND ENRICHMENT (24 hour TTL)
asn:{asn}:details           // Cloudflare ASN details
ip:{ip}:asn                 // IP → ASN lookup
summary:cluster:{id}        // Groq AI summary
```

---

## 🎯 REVISED Threat Data Structure

```typescript
// types/redis.ts

export interface RedisThreat {
  // Identity
  id: string;                          // "{ip}_{timestamp}"
  ip: string;                          // "41.220.10.1"
  
  // Geolocation (from ip-api.com)
  lat: number;
  lon: number;
  country: string;                     // "Uganda"
  countryCode: string;                 // "UG"
  city: string;
  
  // ASN info (from ip-api.com OR Cloudflare)
  asn: number;                         // 36901
  asnName: string;                     // "DATANET.COM LLC"
  isp: string;
  
  // Threat scoring
  threatScore: number;                 // 0-100
  abuseConfidence: number;             // 0-100 from AbuseIPDB
  attackMagnitude: number;             // Derived from Cloudflare percentages
  countryHotness: number;              // 0-100 based on Cloudflare rankings
  
  isHighThreat: boolean;               // score > 75
  isClusteredThreat: boolean;          // score 50-75
  
  // Attack context (from Cloudflare)
  dataSource: 'bgp_hijack' | 'abuseipdb_blacklist' | 'correlated';
  
  // If from BGP hijack
  bgpHijack?: {
    eventId: number;
    hijackerASN: number;
    victimASN: number;
    confidenceScore: number;           // 0-12 from Cloudflare
    prefixes: string[];                // ["41.220.10.0/24"]
    duration: number;                  // seconds
  };
  
  // If from outage
  outage?: {
    cause: 'GOVERNMENT_DIRECTED' | 'WEATHER' | 'TECHNICAL';
    type: 'NATIONWIDE' | 'REGIONAL';
    description: string;
  };
  
  // Temporal
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  
  // Clustering (optional)
  cluster?: {
    id: string;
    relatedIPs: string[];
    region: string;
  };
}

export interface RedisHotspot {
  countryCode: string;                 // "BR"
  countryName: string;                 // "Brazil"
  
  // Derived from Cloudflare data
  attackOriginRank: number;            // 1-5 (from topOrigins)
  attackOriginPercent: number;         // 22.7% (from topOrigins)
  attackTargetRank: number | null;     // 5 (from topTargets) or null
  attackTargetPercent: number | null;  // 2.8% or null
  
  // Derived from threat correlation
  threatDensity: number;               // 0-100 (how many threats from this country)
  threatCount: number;                 // Raw count of IPs from this country
  avgThreatScore: number;              // Average score of all threats
  
  // Top ASNs in this country
  topASNs: Array<{
    asn: number;
    name: string;
    count: number;
  }>;
  
  // Country centroid for heatmap
  coords: { lat: number; lon: number };
}

export interface RedisStats {
  totalThreats: number;
  highSeverityCount: number;
  bgpHijackCount: number;              // NEW
  outageCount: number;                 // NEW
  activeCountries: number;
  topAttackingCountry: string;         // "Brazil"
  topTargetedCountry: string;          // "China"
  lastUpdated: string;
}
```

---

## 🔨 Processing Logic: Step-by-Step

### File: `app/api/cron/refresh/route.ts`

```typescript
// app/api/cron/refresh/route.ts

import { NextResponse } from 'next/server';
import { getTraffic, getAnomalies } from '@/services/cloudflare';
import { getBlacklist } from '@/services/abuseipdb/client';
import { geolocateBatch } from '@/services/geo/client';
import { calculateThreatScore } from '@/lib/scoring/calculateScore';
import { redis } from '@/lib/redis';
import type { RedisThreat, RedisHotspot, RedisStats } from '@/types/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    console.log('[CRON] Starting refresh...');
    
    // Auth check
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // ============================================
    // STEP 1: Fetch Cloudflare Data
    // ============================================
    console.log('[CRON] Fetching Cloudflare data...');
    
    const [trafficData, anomalyData] = await Promise.all([
      getTraffic(),
      getAnomalies()
    ]);
    
    // Cache raw responses for debugging
    await Promise.all([
      redis.set('cloudflare:attacks:raw', JSON.stringify(trafficData.topAttacks), { ex: 1800 }),
      redis.set('cloudflare:hijacks:raw', JSON.stringify(anomalyData.bgpHijacks), { ex: 1800 }),
      redis.set('cloudflare:outages:raw', JSON.stringify(anomalyData.outages), { ex: 1800 })
    ]);
    
    // ============================================
    // STEP 2: Extract IPs from BGP Hijacks
    // ============================================
    console.log('[CRON] Extracting IPs from BGP hijacks...');
    
    const hijackIPs: Array<{
      ip: string;
      hijack: any;
    }> = [];
    
    // Process BGP hijack events
    const hijackEvents = anomalyData.bgpHijacks.result?.events || [];
    
    for (const event of hijackEvents) {
      // Only process high-confidence hijacks
      if (event.confidence_score < 4) continue;
      
      // Extract first IP from each prefix
      for (const prefix of event.prefixes) {
        const ip = getFirstIPFromCIDR(prefix);
        if (ip) {
          hijackIPs.push({ ip, hijack: event });
        }
      }
      
      // Limit to avoid quota exhaustion (max 20 IPs per hijack event)
      if (hijackIPs.length >= 20) break;
    }
    
    console.log(`[CRON] Extracted ${hijackIPs.length} IPs from BGP hijacks`);
    
    // ============================================
    // STEP 3: Get AbuseIPDB Blacklist
    // ============================================
    console.log('[CRON] Fetching AbuseIPDB blacklist...');
    
    const blacklist = await getBlacklist(75, 500); // Top 500 with 75+ confidence
    
    // Cache blacklist
    await redis.set('abuseipdb:blacklist', JSON.stringify(blacklist), { ex: 21600 }); // 6 hours
    
    console.log(`[CRON] Got ${blacklist.data.length} blacklisted IPs`);
    
    // ============================================
    // STEP 4: Combine IP Lists
    // ============================================
    const allIPs = [
      ...hijackIPs.map(h => h.ip),
      ...blacklist.data.slice(0, 100).map(b => b.ipAddress) // Limit blacklist to 100
    ];
    
    // Deduplicate
    const uniqueIPs = Array.from(new Set(allIPs));
    
    console.log(`[CRON] Total unique IPs to process: ${uniqueIPs.length}`);
    
    // ============================================
    // STEP 5: Geolocate All IPs
    // ============================================
    console.log('[CRON] Geolocating IPs...');
    
    const geoData = await geolocateBatch(uniqueIPs, 1400); // 43 requests/min
    
    console.log(`[CRON] Geolocated ${geoData.length} IPs`);
    
    // ============================================
    // STEP 6: Build Country Hotness Map
    // ============================================
    const countryHotness = buildCountryHotness(trafficData.topOrigins.result.top_0);
    
    // ============================================
    // STEP 7: Process & Score Threats
    // ============================================
    console.log('[CRON] Scoring threats...');
    
    const threats: RedisThreat[] = [];
    
    for (let i = 0; i < geoData.length; i++) {
      const geo = geoData[i];
      const ip = uniqueIPs[i];
      
      // Find if this IP came from BGP hijack
      const hijackSource = hijackIPs.find(h => h.ip === ip);
      
      // Find if this IP is in AbuseIPDB blacklist
      const abuseEntry = blacklist.data.find(b => b.ipAddress === ip);
      
      // Extract ASN from geo data
      const asn = extractASN(geo.as);
      if (!asn) continue;
      
      // Get country hotness score
      const countryHotnessScore = countryHotness.get(geo.countryCode) || 0;
      
      // Calculate attack magnitude
      const attackMagnitude = hijackSource 
        ? hijackSource.hijack.confidence_score * 8.33 // Scale 0-12 to 0-100
        : 50; // Default for blacklist entries
      
      // Calculate threat score
      const threatScore = calculateThreatScore({
        abuseConfidence: abuseEntry?.abuseConfidenceScore || 0,
        attackMagnitude,
        temporalFactor: 20, // Placeholder (will calculate from occurrence data)
        geoFactor: countryHotnessScore
      });
      
      // Build threat object
      const threat: RedisThreat = {
        id: `${ip}_${Date.now()}`,
        ip,
        lat: geo.lat,
        lon: geo.lon,
        country: geo.country,
        countryCode: geo.countryCode,
        city: geo.city,
        asn,
        asnName: geo.org,
        isp: geo.isp,
        
        threatScore,
        abuseConfidence: abuseEntry?.abuseConfidenceScore || 0,
        attackMagnitude,
        countryHotness: countryHotnessScore,
        
        isHighThreat: threatScore > 75,
        isClusteredThreat: threatScore >= 50 && threatScore <= 75,
        
        dataSource: hijackSource ? 'bgp_hijack' : 'abuseipdb_blacklist',
        
        bgpHijack: hijackSource ? {
          eventId: hijackSource.hijack.id,
          hijackerASN: hijackSource.hijack.hijacker_asn,
          victimASN: hijackSource.hijack.victim_asns[0],
          confidenceScore: hijackSource.hijack.confidence_score,
          prefixes: hijackSource.hijack.prefixes,
          duration: hijackSource.hijack.duration
        } : undefined,
        
        firstSeen: abuseEntry?.lastReportedAt || new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        occurrences: 1
      };
      
      threats.push(threat);
    }
    
    console.log(`[CRON] Generated ${threats.length} threats`);
    
    // ============================================
    // STEP 8: Build Hotspots
    // ============================================
    console.log('[CRON] Building hotspots...');
    
    const hotspots = buildHotspots(
      threats,
      trafficData.topOrigins.result.top_0,
      trafficData.topTargets.result.top_0
    );
    
    // ============================================
    // STEP 9: Calculate Stats
    // ============================================
    const stats: RedisStats = {
      totalThreats: threats.length,
      highSeverityCount: threats.filter(t => t.isHighThreat).length,
      bgpHijackCount: threats.filter(t => t.dataSource === 'bgp_hijack').length,
      outageCount: anomalyData.outages.result?.annotations?.length || 0,
      activeCountries: new Set(threats.map(t => t.countryCode)).size,
      topAttackingCountry: trafficData.topOrigins.result.top_0[0]?.originCountryName || 'Unknown',
      topTargetedCountry: trafficData.topTargets.result.top_0[0]?.targetCountryName || 'Unknown',
      lastUpdated: new Date().toISOString()
    };
    
    // ============================================
    // STEP 10: Store in Redis
    // ============================================
    console.log('[CRON] Storing in Redis...');
    
    await Promise.all([
      redis.set('threats:latest', JSON.stringify(threats), { ex: 3600 }),
      redis.set('hotspots:latest', JSON.stringify(hotspots), { ex: 3600 }),
      redis.set('stats:summary', JSON.stringify(stats), { ex: 3600 })
    ]);
    
    console.log('[CRON] Refresh complete!');
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        threatsGenerated: threats.length,
        hotspotsGenerated: hotspots.length,
        highSeverity: stats.highSeverityCount,
        bgpHijacks: stats.bgpHijackCount
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

/**
 * Extract first usable IP from CIDR notation
 * Example: "41.220.10.0/24" → "41.220.10.1"
 */
function getFirstIPFromCIDR(cidr: string): string | null {
  try {
    const [baseIP, mask] = cidr.split('/');
    const parts = baseIP.split('.').map(Number);
    
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
 */
function buildCountryHotness(topOrigins: any[]): Map<string, number> {
  const map = new Map<string, number>();
  
  topOrigins.forEach((origin, index) => {
    // Rank 1 = 100, Rank 2 = 80, Rank 3 = 60, Rank 4 = 40, Rank 5 = 20
    const score = Math.max(0, 100 - (index * 20));
    map.set(origin.originCountryAlpha2, score);
  });
  
  return map;
}

/**
 * Build hotspot data for heatmap
 */
function buildHotspots(
  threats: RedisThreat[],
  topOrigins: any[],
  topTargets: any[]
): RedisHotspot[] {
  const byCountry = new Map<string, RedisThreat[]>();
  
  threats.forEach(threat => {
    if (!byCountry.has(threat.countryCode)) {
      byCountry.set(threat.countryCode, []);
    }
    byCountry.get(threat.countryCode)!.push(threat);
  });
  
  const hotspots: RedisHotspot[] = [];
  
  byCountry.forEach((countryThreats, countryCode) => {
    const origin = topOrigins.find(o => o.originCountryAlpha2 === countryCode);
    const target = topTargets.find(t => t.targetCountryAlpha2 === countryCode);
    
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
      
      attackOriginRank: origin?.rank || null,
      attackOriginPercent: origin ? parseFloat(origin.value) : null,
      attackTargetRank: target?.rank || null,
      attackTargetPercent: target ? parseFloat(target.value) : null,
      
      threatDensity: Math.min(100, avgScore * (countryThreats.length / 10)),
      threatCount: countryThreats.length,
      avgThreatScore: Math.round(avgScore),
      
      topASNs,
      
      coords: {
        lat: countryThreats[0].lat,
        lon: countryThreats[0].lon
      }
    });
  });
  
  return hotspots.sort((a, b) => b.threatDensity - a.threatDensity);
}

function extractASN(asString: string | null): number | null {
  if (!asString) return null;
  const match = asString.match(/AS(\d+)/);
  return match ? parseInt(match[1]) : null;
}
```

---

## 🎨 Updated Frontend Components

### File: `components/threat/ThreatCard.tsx`

```typescript
// components/threat/ThreatCard.tsx

import { RedisThreat } from '@/types/redis';
import { useState } from 'react';

interface ThreatCardProps {
  threat: RedisThreat;
  onViewDetails: (threat: RedisThreat) => void;
}

export default function ThreatCard({ threat, onViewDetails }: ThreatCardProps) {
  const severityColor = threat.isHighThreat 
    ? 'bg-red-500' 
    : threat.isClusteredThreat 
    ? 'bg-orange-500' 
    : 'bg-yellow-500';
  
  const dataSourceLabel = threat.dataSource === 'bgp_hijack' 
    ? 'BGP Hijack' 
    : 'Blacklisted';
  
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition">
      {/* Severity Badge */}
      <div className="flex items-center justify-between mb-2">
        <div className={`${severityColor} px-2 py-1 rounded text-xs font-bold`}>
          Score: {threat.threatScore}
        </div>
        <span className="text-xs text-gray-400">{dataSourceLabel}</span>
      </div>
      
      {/* IP & Location */}
      <div className="mb-2">
        <p className="text-white font-mono text-sm">{threat.ip}</p>
        <p className="text-gray-400 text-xs">
          {threat.city}, {threat.country} ({threat.countryCode})
        </p>
      </div>
      
      {/* ASN Info */}
      <div className="mb-3">
        <p className="text-gray-300 text-xs">
          AS{threat.asn} - {threat.asnName}
        </p>
        <p className="text-gray-500 text-xs">{threat.isp}</p>
      </div>
      
      {/* BGP Hijack Details (if applicable) */}
      {threat.bgpHijack && (
        <div className="bg-red-900/20 border border-red-900/50 rounded p-2 mb-2">
          <p className="text-red-400 text-xs font-bold mb-1">
            BGP Route Hijacking Detected
          </p>
          <p className="text-gray-400 text-xs">
            Confidence: {threat.bgpHijack.confidenceScore}/12
          </p>
          <p className="text-gray-400 text-xs">
            Duration: {Math.round(threat.bgpHijack.duration / 60)} min
          </p>
        </div>
      )}
      
      {/* Outage Info (if applicable) */}
      {threat.outage && (
        <div className="bg-yellow-900/20 border border-yellow-900/50 rounded p-2 mb-2">
          <p className="text-yellow-400 text-xs font-bold mb-1">
            Network Outage: {threat.outage.cause}
          </p>
          <p className="text-gray-400 text-xs">{threat.outage.description}</p>
        </div>
      )}
      
      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <p className="text-gray-500 text-xs">Abuse Confidence</p>
          <p className="text-white text-sm">{threat.abuseConfidence}%</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Country Hotness</p>
          <p className="text-white text-sm">{threat.countryHotness}%</p>
        </div>
      </div>
      
      {/* Actions */}
      <button
        onClick={() => onViewDetails(threat)}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded transition"
      >
        View Full Details
      </button>
    </div>
  );
}
```

### File: `components/threat/ThreatModal.tsx`

```typescript
// components/threat/ThreatModal.tsx

import { RedisThreat } from '@/types/redis';
import { useState } from 'react';

interface ThreatModalProps {
  threat: RedisThreat;
  onClose: () => void;
}

export default function ThreatModal({ threat, onClose }: ThreatModalProps) {
  const [loadingASN, setLoadingASN] = useState(false);
  const [asnDetails, setASNDetails] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [aiSummary, setAISummary] = useState<string | null>(null);
  
  // Fetch ASN details on-demand
  const fetchASNDetails = async () => {
    setLoadingASN(true);
    try {
      const res = await fetch(`/api/asn/${threat.asn}`);
      const data = await res.json();
      setASNDetails(data);
    } catch (error) {
      console.error('Failed to fetch ASN details:', error);
    } finally {
      setLoadingASN(false);
    }
  };
  
  // Generate AI summary on-demand
  const generateSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threat })
      });
      const data = await res.json();
      setAISummary(data.summary);
    } catch (error) {
      console.error('Failed to generate summary:', error);
    } finally {
      setLoadingSummary(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Threat Details</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              ✕
            </button>
          </div>
          <p className="text-gray-400 mt-1">{threat.ip}</p>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Location */}
          <Section title="Location">
            <InfoRow label="City" value={threat.city} />
            <InfoRow label="Country" value={`${threat.country} (${threat.countryCode})`} />
            <InfoRow label="Coordinates" value={`${threat.lat}, ${threat.lon}`} />
          </Section>
          
          {/* Network Info */}
          <Section title="Network Information">
            <InfoRow label="ASN" value={`AS${threat.asn}`} />
            <InfoRow label="Organization" value={threat.asnName} />
            <InfoRow label="ISP" value={threat.isp} />
            
            {!asnDetails && !loadingASN && (
              <button
                onClick={fetchASNDetails}
                className="text-blue-400 hover:text-blue-300 text-sm mt-2"
              >
                → Load detailed ASN information
              </button>
            )}
            
            {loadingASN && <p className="text-gray-400 text-sm">Loading...</p>}
            
            {asnDetails && (
              <div className="mt-2 bg-gray-800 rounded p-3">
                <InfoRow label="Estimated Users" value={asnDetails.estimatedUsers?.toLocaleString()} />
                <InfoRow label="Source" value={asnDetails.source} />
                <InfoRow label="Website" value={asnDetails.website} />
              </div>
            )}
          </Section>
          
          {/* Threat Scoring */}
          <Section title="Threat Analysis">
            <InfoRow label="Overall Threat Score" value={`${threat.threatScore}/100`} />
            <InfoRow label="Abuse Confidence" value={`${threat.abuseConfidence}%`} />
            <InfoRow label="Attack Magnitude" value={`${threat.attackMagnitude}/100`} />
            <InfoRow label="Country Hotness" value={`${threat.countryHotness}/100`} />
            <InfoRow label="Data Source" value={threat.dataSource.replace('_', ' ').toUpperCase()} />
          </Section>
          
          {/* BGP Hijack Details */}
          {threat.bgpHijack && (
            <Section title="BGP Hijack Event">
              <InfoRow label="Event ID" value={threat.bgpHijack.eventId} />
              <InfoRow label="Hijacker ASN" value={threat.bgpHijack.hijackerASN} />
              <InfoRow label="Victim ASN" value={threat.bgpHijack.victimASN} />
              <InfoRow label="Confidence Score" value={`${threat.bgpHijack.confidenceScore}/12`} />
              <InfoRow label="Duration" value={`${Math.round(threat.bgpHijack.duration / 60)} minutes`} />
              <div className="mt-2">
                <p className="text-gray-400 text-sm font-semibold">Affected Prefixes:</p>
                <div className="bg-gray-800 rounded p-2 mt-1">
                  {threat.bgpHijack.prefixes.map((prefix, idx) => (
                    <p key={idx} className="text-gray-300 text-xs font-mono">{prefix}</p>
                  ))}
                </div>
              </div>
            </Section>
          )}
          
          {/* AI Summary */}
          <Section title="AI Analysis">
            {!aiSummary && !loadingSummary && (
              <button
                onClick={generateSummary}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm"
              >
                Generate AI Summary
              </button>
            )}
            
            {loadingSummary && <p className="text-gray-400">Generating analysis...</p>}
            
            {aiSummary && (
              <div className="bg-purple-900/20 border border-purple-900/50 rounded p-4">
                <p className="text-gray-200 text-sm leading-relaxed">{aiSummary}</p>
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: any }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-gray-400 text-sm">{label}:</span>
      <span className="text-white text-sm">{value}</span>
    </div>
  );
}
```

---

## 📝 Key Takeaways

### ✅ What Changed

1. **No longer using timeseries** - not useful for our purposes
2. **BGP hijacks are our PRIMARY data source** for IPs
3. **IP prefixes → sample IPs** strategy
4. **Country-level correlation** with AbuseIPDB blacklist
5. **Simplified Redis structure** based on actual data available

### ✅ What Stays the Same

1. 30-minute cron cycle
2. On-demand ASN enrichment
3. On-demand AI summaries
4. Client polling every 60s
5. Threat scoring formula

### 🎯 Next Implementation Steps

1. ✅ Copy helper functions (`getFirstIPFromCIDR`, `extractASN`, etc.)
2. ✅ Update TypeScript types
3. ✅ Implement cron endpoint
4. ✅ Test with real API responses
5. ✅ Build frontend components
6. ✅ Deploy and monitor

Your instincts were spot-on! The timeseries data is indeed not useful, and the IP→ASN endpoint should be on-demand only. This revised guide reflects the **reality** of what data we can actually get. 🚀
