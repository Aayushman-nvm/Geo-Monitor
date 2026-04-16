# Cloudflare Radar API Endpoints for Cyber Geo Monitor

## Executive Summary

This document identifies the essential Cloudflare Radar API endpoints needed to build your **Cyber Geo Monitor** project. The focus is on endpoints that provide **anomaly detection**, **attack data**, **geographic/ASN context**, and data that can be **correlated with AbuseIPDB** for IP enrichment.

---

## 🎯 Core Endpoints (Must-Have)

### 1. Layer 3 Attack Data - Origin & Target Locations

**Endpoint:** `GET /radar/attacks/layer3/top/attacks`

**Purpose:** Get top attack pairs showing origin → target location relationships

**Why Critical:**
- Provides geographic attack flows (origin country → target country)
- Shows attack magnitude (mitigated bytes/attacks)
- Can be filtered by time range (supports your 15min refresh cycle)
- Directly maps to your visualization needs (attack trails on map)

**Key Parameters:**
```
- dateRange: "1h", "6h", "12h", "24h" (for your historical views)
- limit: number (top N attacks)
- protocol: UDP, TCP, ICMP, GRE (filter by attack type)
- ipVersion: IPv4, IPv6
- magnitude: MITIGATED_BYTES or MITIGATED_ATTACKS
```

**Response Contains:**
- `originCountryAlpha2` & `originCountryName`
- `targetCountryAlpha2` & `targetCountryName`
- Attack percentage/magnitude
- Confidence level annotations

**Rate Limit Impact:** ~4 requests/hour (15min intervals) = ~96 requests/day ✅ Well within 100/day limit

---

### 2. Layer 3 Attack Summary by Location

**Endpoint:** `GET /radar/attacks/layer3/top/locations/origin`
**Endpoint:** `GET /radar/attacks/layer3/top/locations/target`

**Purpose:** Get top countries originating/receiving attacks

**Why Critical:**
- Identifies hotspot regions for heatmap overlay
- Provides regional threat density data
- Complements the attack pairs endpoint

**Key Parameters:**
```
- dateRange: matches your time windows
- limit: top N countries
- protocol: filter by attack type
- normalization: PERCENTAGE (for heatmap intensity)
```

**Response Contains:**
- Country codes & names
- Attack percentages
- Can aggregate for regional hotspot calculation

**Rate Limit Impact:** ~8 requests/hour (4 for origin, 4 for target) = ~192 requests/day ⚠️ Exceeds limit

**Optimization Strategy:**
- Alternate between origin/target calls (4 origin + 4 target = 8/hour)
- OR only fetch one direction per cycle, alternate cycles
- **Recommended:** Fetch only `top/attacks` (endpoint #1) which contains both origin & target in one call

---

### 3. Layer 3 Attack Timeseries

**Endpoint:** `GET /radar/attacks/layer3/timeseries`

**Purpose:** Track attack volume over time

**Why Critical:**
- Shows temporal patterns (20% of your threat score)
- Identifies attack spikes/clusters
- Provides historical comparison data

**Key Parameters:**
```
- aggInterval: "15m", "1h" (matches your refresh rate)
- dateRange: sliding windows for your 1hr/12hr/24hr views
- location: filter by country
- protocol: filter by attack type
```

**Response Contains:**
- Timestamps array
- Attack byte volumes over time
- Confidence annotations for anomaly detection

**Rate Limit Impact:** ~4 requests/hour = ~96 requests/day ✅

---

### 4. Layer 3 Attack Summary by Protocol/Vector

**Endpoint:** `GET /radar/attacks/layer3/summary/{dimension}`

**Dimensions:** `PROTOCOL`, `VECTOR`, `IP_VERSION`

**Purpose:** Understand attack types and methods

**Why Critical:**
- Categorizes threats (DDoS vectors: UDP flood, SYN flood, etc.)
- Enriches modal data (shows what type of attack is happening)
- Helps with AI context generation (Groq can explain attack types)

**Key Parameters:**
```
- dimension: PROTOCOL, VECTOR, IP_VERSION
- dateRange: your time windows
- location: filter by country
- direction: ORIGIN or TARGET
```

**Response Contains:**
- Attack distribution by type (e.g., UDP: 45%, TCP: 30%, ICMP: 25%)
- Protocol-specific metadata

**Rate Limit Impact:** ~12 requests/hour (3 dimensions × 4 intervals) = ~288 requests/day ⚠️

**Optimization:**
- Fetch only VECTOR dimension (most informative)
- Reduce to 2 intervals instead of 4
- **Recommended:** ~8 requests/hour = ~192 requests/day (still over)

---

### 5. Internet Outages & Anomalies

**Endpoint:** `GET /radar/annotations/outages`

**Purpose:** Detect network-level anomalies beyond attacks

**Why Critical:**
- Identifies infrastructure disruptions
- Flags BGP hijacks, cable cuts, routing anomalies
- Enriches threat context (is the attack causing an outage?)
- Important for your 30% "traffic anomaly magnitude" score component

**Key Parameters:**
```
- dateRange: your time windows
- location: filter by country
- asn: filter by autonomous system (for ASN-level correlation)
- eventType: OUTAGE, TRAFFIC_ANOMALY
```

**Response Contains:**
- Outage/anomaly events with timestamps
- Affected ASNs and locations
- Event descriptions
- Confidence scores

**Rate Limit Impact:** ~4 requests/hour = ~96 requests/day ✅

---

### 6. BGP Hijack Events

**Endpoint:** `GET /radar/bgp/hijacks/events`

**Purpose:** Detect BGP routing attacks (route hijacking)

**Why Critical:**
- High-severity threat type (routing manipulation)
- Shows victim/hijacker ASNs
- Provides confidence scores (useful for threat scoring)
- Rare but critical events (should trigger high-threat alerts)

**Key Parameters:**
```
- dateRange: your time windows
- minConfidence: 5 (mid to high confidence only)
- sortBy: TIME or CONFIDENCE
- involvedCountry: filter by country
```

**Response Contains:**
- Hijacker/victim ASNs
- Affected IP prefixes
- Confidence scores
- Event duration
- Country codes

**Rate Limit Impact:** ~4 requests/hour = ~96 requests/day ✅

---

## 🔍 Entity/Context Endpoints (Enrichment)

### 7. ASN Details

**Endpoint:** `GET /radar/entities/asns/{asn}`

**Purpose:** Get detailed info about suspicious ASNs

**Why Critical:**
- Resolves ASN → ISP name (for your "which ISP is causing the attack" requirement)
- Provides estimated user population (helps assess impact)
- Shows related ASNs (for clustering detection)
- Essential for AbuseIPDB correlation (query IPs by ASN range)

**Key Parameters:**
```
- asn: the ASN number from attack data
```

**Response Contains:**
- ASN name & organization
- Country & location
- Estimated users per location
- Related ASNs
- Confidence level

**Usage Pattern:**
- Fetch on-demand when user clicks on attack/hotspot
- NOT in the 15min cron loop
- Cache ASN data for 24 hours

**Rate Limit Impact:** Minimal (on-demand only, ~20-50/day)

---

### 8. ASN List by Location

**Endpoint:** `GET /radar/entities/asns`

**Purpose:** Get all ASNs in a country/region

**Why Critical:**
- Build initial ASN → location mapping
- Pre-populate cache for faster lookups
- Identify major ISPs per region

**Key Parameters:**
```
- location: country code (e.g., "US", "CN", "RU")
- orderBy: POPULATION (get major ISPs first)
- limit: top N ASNs
```

**Response Contains:**
- ASN number
- ASN name & org name
- Country

**Usage Pattern:**
- One-time fetch during initialization
- Update weekly via separate cron
- **Not part of 15min cycle**

**Rate Limit Impact:** Initial: ~50 requests (one per major country), then ~7/week

---

### 9. IP to ASN Lookup

**Endpoint:** `GET /radar/entities/asns/ip`

**Purpose:** Resolve an IP address to its ASN

**Why Critical:**
- **Bridge to AbuseIPDB:** Takes IPs from AbuseIPDB → finds their ASN
- Completes the correlation loop: Attack ASN → Query AbuseIPDB → Get IPs → Resolve back to ASN
- Validates that IPs from AbuseIPDB actually belong to suspicious ASNs

**Key Parameters:**
```
- ip: IPv4 or IPv6 address
```

**Response Contains:**
- ASN number
- ASN name

**Usage Pattern:**
- After fetching reported IPs from AbuseIPDB
- Batch lookups (group IPs, then query)
- Cache IP→ASN mappings for 24hrs

**Rate Limit Impact:** ~100-200/day (depends on AbuseIPDB result volume)

⚠️ **Could be rate-limited if you query every IP individually**

**Optimization:**
- Group IPs by /24 subnet, query subnet representative
- Use IP geolocation API to get ASN directly (ip-api.com includes ASN)
- Only query Cloudflare for ASN name enrichment

---

### 10. Location Details

**Endpoint:** `GET /radar/entities/locations/{location}`

**Purpose:** Get country/region metadata

**Why Critical:**
- Human-readable country names
- Additional geographic context for modals
- Low priority (mostly static data)

**Usage Pattern:**
- One-time fetch during initialization
- Cache permanently

**Rate Limit Impact:** Negligible (~50 requests total, once)

---

## 🚫 Endpoints to SKIP

### ❌ Layer 7 (HTTP) Attack Endpoints
- **Reason:** Layer 7 attacks don't provide IP-level data that correlates with AbuseIPDB
- AbuseIPDB tracks network-level abuse (Layer 3/4), not application-level
- Your project focuses on geographic + IP-based threats

### ❌ Bot/AI/Workers Endpoints
- **Reason:** Not related to cybersecurity threat monitoring
- Out of scope for your project's attack visualization focus

### ❌ HTTP Traffic/Browser/Device Endpoints
- **Reason:** Normal traffic patterns, not attack data
- Would bloat your dataset without providing threat intelligence

### ❌ Quality/Speed Endpoints
- **Reason:** Network performance data, not security threats
- Unrelated to anomaly detection or attack mapping

---

## 📊 Recommended Data Flow Architecture

### Stage 1: Vercel Cron (Every 15min)

```
┌─────────────────────────────────────────────┐
│  Cloudflare Radar API Calls                 │
├─────────────────────────────────────────────┤
│  1. /attacks/layer3/top/attacks             │  ← Origin→Target pairs
│     (limit=50, dateRange=1h)                │  
│                                             │
│  2. /attacks/layer3/timeseries              │  ← Temporal patterns
│     (aggInterval=15m, dateRange=1h)         │
│                                             │
│  3. /attacks/layer3/summary/VECTOR          │  ← Attack types
│     (dateRange=1h)                          │
│                                             │
│  4. /annotations/outages                    │  ← Infrastructure anomalies
│     (dateRange=1h)                          │
│                                             │
│  5. /bgp/hijacks/events                     │  ← BGP attacks
│     (dateRange=1h, minConfidence=5)         │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│  Extract ASNs from Results                  │
│  (origin/target ASNs, hijacker/victim ASNs) │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│  AbuseIPDB Query                            │
│  - Get reported IPs for suspicious ASNs     │
│  - Filter by confidenceMinimum=75           │
│  - Batch requests (max 1000/day limit)      │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│  IP Geolocation (ip-api.com or ipinfo.io)   │
│  - Get lat/lon for each IP                  │
│  - Extract ASN (if not already known)       │
│  - Free tier: 45/min, no API key            │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│  Threat Score Calculation                   │
│  - AbuseIPDB confidence: 40%                │
│  - Traffic anomaly magnitude: 30%           │
│  - Temporal clustering: 20%                 │
│  - Geographic clustering: 10%               │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│  Store in Upstash Redis                     │
│  - Key: "threats:{timestamp}"               │
│  - TTL: 24 hours                            │
│  - Structure: JSON with all enriched data   │
└─────────────────────────────────────────────┘
```

### Stage 2: Client Polling (Every 60s)

```
┌─────────────────────────────────────────────┐
│  Client polls /api/threats                  │
│  - Returns latest cached data from Redis    │
│  - No direct API calls                      │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│  Render on Map                              │
│  - High-threat IPs (>75): Pulsing beacons   │
│  - Clustered threats (50-75): Trails        │
│  - Regional heatmap overlay                 │
└─────────────────────────────────────────────┘
```

### Stage 3: On-Demand ASN Enrichment

```
┌─────────────────────────────────────────────┐
│  User Clicks Attack/Hotspot                 │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│  Check Cache: /api/asn/{asn}                │
│  - If cached (24hr TTL): return immediately │
│  - If not cached: fetch from Cloudflare     │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│  Cloudflare: /entities/asns/{asn}           │
│  - Get ISP name, location, users            │
│  - Cache for 24 hours                       │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│  Display Modal                              │
│  - IP list, ASN details, attack vector      │
│  - Groq AI summary (if requested)           │
└─────────────────────────────────────────────┘
```

---

## 📈 Rate Limit Budget Analysis

### Cloudflare Radar Free Tier: **100 requests/day**

#### 15-Minute Cron Cycle (4 times/hour = 96 times/day)

| Endpoint                                | Calls/Cycle | Total/Day | Priority |
|-----------------------------------------|-------------|-----------|----------|
| `/attacks/layer3/top/attacks`           | 1           | 96        | 🔴 MUST  |
| `/attacks/layer3/timeseries`            | 1           | 96        | 🔴 MUST  |
| `/attacks/layer3/summary/VECTOR`        | 1           | 96        | 🟡 NICE  |
| `/annotations/outages`                  | 1           | 96        | 🟡 NICE  |
| `/bgp/hijacks/events`                   | 1           | 96        | 🟢 EXTRA |
| **SUBTOTAL (MINIMUM)**                  | **2**       | **192**   | ❌ OVER  |
| **SUBTOTAL (RECOMMENDED)**              | **3**       | **288**   | ❌ OVER  |

⚠️ **PROBLEM:** Even the minimum setup (2 calls/cycle) exceeds the 100/day limit!

---

## 🛠️ Solution: Optimize Cron Schedule

### Option A: Reduce Frequency to 30 Minutes

```
30-min intervals = 48 calls/day per endpoint

Endpoints:
1. /attacks/layer3/top/attacks     → 48/day
2. /attacks/layer3/timeseries      → 48/day
                                     -------
                        TOTAL:        96/day ✅ Under limit!
```

**Trade-off:** Less real-time (30min refresh vs 15min)

---

### Option B: Rotate Endpoints Across Cycles

```
Cycle 1 (00:00, 00:30, 01:00...):
  - /attacks/layer3/top/attacks
  - /attacks/layer3/timeseries
  
Cycle 2 (00:15, 00:45, 01:15...):
  - /attacks/layer3/summary/VECTOR
  - /annotations/outages
```

**Result:**
- 2 calls per 15-min cycle
- 8 calls per hour
- 192 calls per day ❌ Still over

**Adjusted:** Use 30-min rotation

```
Cycle 1 (00:00, 01:00, 02:00...):  24 calls/day
  - /attacks/layer3/top/attacks
  - /attacks/layer3/timeseries

Cycle 2 (00:30, 01:30, 02:30...):  24 calls/day
  - /attacks/layer3/summary/VECTOR
  - /annotations/outages
                                    ---------
                      TOTAL:         96/day ✅
```

---

### Option C: Smart Caching + Conditional Fetching

```
- Fetch /top/attacks every 15min (critical)       → 96/day
- Fetch /timeseries only if attack spike detected → ~20/day
- Fetch /summary and /outages on-demand           → ~10/day
                                                    --------
                                        TOTAL:      ~126/day
```

⚠️ Still slightly over, but manageable with request backoff

---

## ✅ Final Recommended Setup

### Core Endpoints (30-min intervals = 48 cycles/day)

```javascript
// Cycle A: Every hour on the hour (00:00, 01:00, 02:00...)
async function cronCycleA() {
  // Critical: Attack pairs with origin/target
  const attacks = await fetch(
    'https://api.cloudflare.com/client/v4/radar/attacks/layer3/top/attacks?dateRange=1h&limit=50'
  );
  
  // Critical: Attack timeseries for temporal patterns
  const timeseries = await fetch(
    'https://api.cloudflare.com/client/v4/radar/attacks/layer3/timeseries?aggInterval=15m&dateRange=1h'
  );
  
  // 2 calls × 24 cycles = 48 calls/day
}

// Cycle B: Every hour on the half-hour (00:30, 01:30, 02:30...)
async function cronCycleB() {
  // Attack vectors (DDoS types)
  const vectors = await fetch(
    'https://api.cloudflare.com/client/v4/radar/attacks/layer3/summary/VECTOR?dateRange=1h'
  );
  
  // Network anomalies
  const outages = await fetch(
    'https://api.cloudflare.com/client/v4/radar/annotations/outages?dateRange=1h'
  );
  
  // 2 calls × 24 cycles = 48 calls/day
}

// TOTAL: 96 calls/day ✅ Exactly at limit!
```

### On-Demand Enrichment (User-Triggered)

```javascript
// When user clicks on an attack marker
async function enrichASN(asn) {
  // Check Redis cache first
  const cached = await redis.get(`asn:${asn}`);
  if (cached) return cached;
  
  // Fetch from Cloudflare if not cached
  const asnDetails = await fetch(
    `https://api.cloudflare.com/client/v4/radar/entities/asns/${asn}`
  );
  
  // Cache for 24 hours
  await redis.set(`asn:${asn}`, asnDetails, { ex: 86400 });
  
  return asnDetails;
}

// Expected usage: ~10-20 ASN lookups/day (well under limit)
```

---

## 🔗 AbuseIPDB Integration Strategy

### Problem: How to Get IPs from ASN Data?

Cloudflare Radar gives you **ASNs** involved in attacks, but not individual IPs.  
AbuseIPDB needs **IPs** to query.

### Solution: Multi-Step Correlation

```
1. Cloudflare Radar
   ↓
   Extract suspicious ASNs (e.g., AS12345 in Russia launching attacks)

2. Query AbuseIPDB by Network
   ↓
   GET /api/v2/check-block?network=AS12345
   (AbuseIPDB supports ASN queries!)
   ↓
   Returns: List of reported IPs within that ASN

3. Geolocate IPs
   ↓
   Use ip-api.com (free, 45 req/min, no key)
   GET http://ip-api.com/json/1.2.3.4
   ↓
   Returns: { lat, lon, country, city, isp, as }

4. Combine Data
   ↓
   For each IP:
   - Cloudflare ASN context (attack involved in)
   - AbuseIPDB confidence score (abuse history)
   - Geolocation (map coordinates)
   
5. Calculate Threat Score
   ↓
   Score = (
     AbuseIPDB.confidenceScore * 0.40 +
     CloudflareAttackMagnitude * 0.30 +
     TemporalClustering * 0.20 +
     GeographicClustering * 0.10
   )

6. Store in Redis & Display
```

### Example Code Flow

```javascript
// Step 1: Extract ASNs from Cloudflare attack data
const attacks = await fetchCloudflareAttacks();
const suspiciousASNs = new Set();

attacks.top_0.forEach(attack => {
  if (attack.value > threshold) {
    // Extract ASN from origin (you'll need to query /entities/asns by location)
    suspiciousASNs.add(attack.originASN); // hypothetical field
  }
});

// Step 2: Query AbuseIPDB for each ASN
const reportedIPs = [];
for (const asn of suspiciousASNs) {
  const response = await fetch(
    `https://api.abuseipdb.com/api/v2/check-block?network=${asn}`,
    { headers: { 'Key': ABUSEIPDB_KEY } }
  );
  const data = await response.json();
  reportedIPs.push(...data.data.reportedAddress);
}

// Step 3: Geolocate IPs
const enrichedIPs = await Promise.all(
  reportedIPs.map(async (ip) => {
    const geo = await fetch(`http://ip-api.com/json/${ip.ipAddress}`).then(r => r.json());
    return {
      ip: ip.ipAddress,
      abuseScore: ip.abuseConfidenceScore,
      lat: geo.lat,
      lon: geo.lon,
      country: geo.country,
      isp: geo.isp,
      asn: geo.as
    };
  })
);

// Step 4: Calculate threat scores & store
const threats = enrichedIPs.map(ip => ({
  ...ip,
  threatScore: calculateScore(ip)
}));

await redis.set('threats:latest', JSON.stringify(threats), { ex: 3600 });
```

---

## 📝 Key Takeaways

### Must-Have Endpoints (96 API calls/day)
1. ✅ `/attacks/layer3/top/attacks` — Origin/target attack pairs
2. ✅ `/attacks/layer3/timeseries` — Temporal attack patterns

### Nice-to-Have Endpoints (rotated, 48 API calls/day)
3. 🟡 `/attacks/layer3/summary/VECTOR` — Attack types
4. 🟡 `/annotations/outages` — Network anomalies

### Optional Endpoints (on-demand, <10 calls/day)
5. 🟢 `/bgp/hijacks/events` — BGP route hijacks (critical but rare)
6. 🟢 `/entities/asns/{asn}` — ASN details (user-triggered)

### Not Needed
- ❌ Layer 7 attack endpoints (HTTP-level, not IP-based)
- ❌ Bot/traffic/browser endpoints (not security threats)
- ❌ Quality/speed endpoints (performance, not security)

### Critical Integration Points
- **Cloudflare ASNs** → Query **AbuseIPDB by ASN** → Get reported IPs
- **IPs from AbuseIPDB** → Query **ip-api.com** → Get coordinates
- Combine: Cloudflare threat context + AbuseIPDB abuse score + Geolocation = **Threat Score**

---

## 🚀 Next Steps

1. **Test API Endpoints**
   - Run sample queries with your Cloudflare API token
   - Verify response structures match your needs
   - Check actual rate limits (100/day is strict!)

2. **Build Proof of Concept**
   - Single cron job: fetch `/top/attacks` + `/timeseries`
   - Parse results, extract ASNs
   - Query AbuseIPDB for one sample ASN
   - Geolocate returned IPs
   - Store in Redis, display on basic map

3. **Iterate & Scale**
   - Add endpoint rotation (cycle A/B)
   - Implement threat scoring algorithm
   - Build 3D map visualization
   - Add Groq AI summaries
   - Deploy to Vercel

4. **Monitor & Optimize**
   - Track actual API usage (Cloudflare dashboard)
   - Adjust cron frequency if needed
   - Optimize caching strategy
   - Fine-tune threat scoring weights

---

## 📚 Additional Resources

- **Cloudflare Radar API Docs:** https://developers.cloudflare.com/api/operations/radar-get-attacks-layer3-top-attacks
- **AbuseIPDB API Docs:** https://docs.abuseipdb.com/
- **ip-api.com Docs:** https://ip-api.com/docs/api:json
- **Upstash Redis Docs:** https://docs.upstash.com/redis

---

**Total Estimated Daily API Usage:**

| Service           | Free Limit    | Your Usage  | Status |
|-------------------|---------------|-------------|--------|
| Cloudflare Radar  | 100 req/day   | ~96 req/day | ✅ OK  |
| AbuseIPDB         | 1000 req/day  | ~200/day    | ✅ OK  |
| IP Geolocation    | 45/min (no limit) | ~200/day | ✅ OK  |
| Groq AI           | 14,400/day    | ~100/day    | ✅ OK  |
| Upstash Redis     | 10k cmds/day  | ~3k/day     | ✅ OK  |

**Project is 100% feasible on free tiers!** 🎉
