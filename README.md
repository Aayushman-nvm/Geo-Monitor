# Geo Monitor

"Built a serverless pseudo real-time global cybersecurity threat visualization platform that maps network anomalies, BGP hijacks, and malicious IPs onto an interactive 3D globe *built entirely on free-tier services*.

---

## Table of Contents

- [Overview](#overview)
- [Live Demo & Screenshots](#live-demo--screenshots)
- [Core Features](#core-features)
- [Technology Stack](#technology-stack)
- [Architecture & Data Flow](#architecture--data-flow)
- [Project Structure](#project-structure)
- [API Rate Limit Strategy](#api-rate-limit-strategy)
- [Environment Variables](#environment-variables)
- [Development Workflow](#development-workflow)
- [Known Limitations](#known-limitations)

---

## Overview

**Cyber Geo Monitor** aggregates real-time cybersecurity threat intelligence from multiple sources (Cloudflare Radar, AbuseIPDB, IP geolocation APIs) and visualizes them on an interactive 3D globe. The platform identifies:

- **BGP hijacking events** (routing attacks)
- **Network traffic anomalies** (DDoS patterns, outages)
- **Blacklisted malicious IPs** (abuse confidence scores)
- **Country-level threat hotspots** (attack origins/targets)
- **Attack flows** (origin → target traffic patterns)

All data is processed through a **hybrid caching architecture** using Upstash Redis to bypass API rate limits, with automated cron jobs refreshing data every 24 hours via Vercel.

---

## Live Demo & Screenshots

> **Note**: Add live deployment URL and screenshots here once deployed.

---

## Core Features

### 1. **Real-Time Threat Visualization**
- Interactive 3D globe powered by `react-globe.gl` and Three.js
- Color-coded threat markers (critical/high/medium severity)
- Animated attack flow arcs showing origin-to-target traffic patterns
- Pulsing rings for critical threats (score ≥85)

### 2. **Multi-Source Threat Intelligence**
- **Cloudflare Radar API**: BGP hijacks, DDoS attacks, outages, top attacking/targeted countries
- **AbuseIPDB**: Blacklisted IPs with abuse confidence scores and report history
- **ip-api.com**: Batch IP geolocation (1400 IPs per batch)
- **Cloudflare ASN Lookup**: Autonomous System details, organization info

### 3. **Intelligent Threat Scoring**
Custom multi-signal algorithm combines:
- Abuse confidence score (0-100)
- BGP hijack confidence (0-12)
- Attack magnitude (country-level traffic %)
- Temporal recency (hours since last report)
- Country hotness ranking (top 5 attack origins)

### 4. **AI-Powered Analysis**
- Groq AI (llama-3.2-3b) generates natural language summaries of individual threats
- On-demand general threat landscape analysis

### 5. **Efficient Caching Architecture**
- **Redis Hash-based caching** (single top-level keys for geo/ASN/abuse data)
- **7-day TTL** for static data (geolocation, ASN info)
- **23-hour TTL** for daily-updated data (AbuseIPDB blacklist)
- **24-hour TTL** for high-frequency data (Cloudflare traffic stats) - was planned to be 15 mins, but in free tier vercel cron job can only run once per day, therefore I had to store these data for longer period of time

### 6. **Interactive Modals**
- **Threat Details Modal**: Full IP analysis, ASN info, abuse reports, BGP hijack details
- **Country List Modal**: All threats in a country, sortable/filterable
- **Flow Details Modal**: Attack traffic pattern breakdown

---

## Technology Stack

### **Frontend**
| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.2.3 | React framework with App Router, API routes, SSR |
| `react-globe.gl` | 2.37.1 | WebGL-based 3D globe visualization |
| `three` | 0.183.2 | 3D rendering engine (peer dependency for globe) |
| `three-globe` | 2.45.2 | Globe data layers (polygons, points, arcs) |
| `zustand` | 5.0.12 | Lightweight state management for threat data |
| `tailwindcss` | 4.x | Utility-first CSS framework |
| `luxon` | 3.7.2 | Date/time manipulation (Not used as of now - planned for future for custom data range in API's) |

### **Backend**
| Package | Version | Purpose |
|---------|---------|---------|
| `@upstash/redis` | 1.37.0 | Serverless Redis client (REST API based) |
| `groq-sdk` | 1.1.2 | Groq AI API client for LLM summaries |

### **APIs & Services**
| Service | Rate Limit (Default) | My Usage | Savings |
|---------|---------------------|-----------|---------|
| **Cloudflare Radar** | 600 req/min | ~12 req/hour (cron) | **99.97%** less |
| **AbuseIPDB** | 1000 req/day | ~5 req/day (cached 23h) | **99.5%** less |
| **ip-api.com** | 45 req/min | ~60 req/hour (batched) | **97.8%** less |
| **Groq AI** | 30 req/min | On-demand only | **100%** when idle |

**Total API Call Reduction: ~99%** thanks to Redis caching + cron architecture.

---

## Architecture & Data Flow

### **High-Level System Design**

```
┌──────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                          │
│  (Next.js App Router + React Globe GL + Zustand Store)           │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ SWR Polling (1hr interval)
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                      /api/threats (GET)                          │
│  Returns cached data from Redis (threats, hotspots, stats, flows)│
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ Reads from
                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                      UPSTASH REDIS CACHE                                                │
│  Keys: threats:latest, hotspots:latest, stats:summary,                                  │
│        flows:latest, cloudflare:*, geo:ips (hash), asn:ips (hash), abuse:ips (hash)     │
└────────────────────────┬────────────────────────────────────────────────────────────────┘
                         │
                         │ Written by (every 24 hours - planned hourly)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│              /api/cron/refresh (CRON TRIGGER)                       │
│  Orchestrates 7-step data pipeline every hour via vercel.json       │
└┬──────┬──────┬──────┬──────┬──────┬──────┬──────────────────────────┘
 │      │      │      │      │      │      │
 │      │      │      │      │      │      └─> Step 7: /api/cache (POST)
 │      │      │      │      │      │           Store all data in Redis
 │      │      │      │      │      │
 │      │      │      │      │      └─> Step 6: /api/history (POST)
 │      │      │      │      │           Build attack flows from topAttacks
 │      │      │      │      │
 │      │      │      │      └─> Step 5: Calculate stats (in cron)
 │      │      │      │           Total threats, critical count, countries
 │      │      │      │
 │      │      │      └─> Step 4: Build hotspots (in cron)
 │      │      │           Aggregate threats by country, compute density
 │      │      │
 │      │      └─> Step 3: /api/score (POST)
 │      │           Calculate threat scores using multi-signal algorithm
 │      │
 │      └─> Step 2: /api/enrich-ips (POST)
 │             Geolocate IPs, fetch ASN details, check blacklist
 │             
 └─> Step 1: /api/fetch-traffic (GET)
           Fetch Cloudflare traffic, BGP hijacks, outages
```

### **Detailed Data Flow Breakdown**

#### **Step 1: Fetch External Data** (`/api/fetch-traffic`)
```
Cloudflare Radar API
  ├─> getTraffic()
  │     ├─> topOrigins (top 5 attacking countries)
  │     ├─> topTargets (top 5 targeted countries)
  │     └─> topAttacks (origin→target pairs with volume %)
  │
  └─> getAnomalies()
        ├─> bgpHijacks (routing attacks, confidence 0-12)
        └─> outages (network downtime annotations)

Cache in Redis:
  - cloudflare:traffic:raw (24h TTL)
  - cloudflare:hijacks:raw (24h TTL)
  - cloudflare:outages:raw (24h TTL)
```

#### **Step 2: Enrich IPs** (`/api/enrich-ips`)
```
Extract IPs from BGP hijack prefixes (e.g., 1.1.1.0/24 → 1.1.1.1)
  ├─> Max 20 IPs per hijack event (quota protection)
  └─> Filter by confidence_score >= 4

Fetch AbuseIPDB Blacklist (if not cached)
  ├─> getBlacklist({ min: 75, limit: 500 })
  └─> Cache for 23 hours (leaves 1h buffer before daily reset)

Combine & Deduplicate IPs
  ├─> hijackIPs + blacklistIPs → uniqueIPs[]
  └─> Total: ~100-150 IPs per refresh

Geolocate IPs (Hybrid Cache Strategy)
  ├─> Check Redis Hash: geo:ips → redis.hget('geo:ips', ip)
  │     └─> If found: use cached data
  └─> If missing: geolocateBatch(uncachedIPs, batchSize=1400)
        ├─> Returns: { ip, lat, lon, country, city, as, org, isp }
        └─> Cache in Redis Hash: redis.hset('geo:ips', { [ip]: JSON.stringify(geo) })
              └─> Set 7-day TTL: redis.expire('geo:ips', 604800)

Enrich ASN Details (Hybrid Cache Strategy)
  ├─> Check if geo.as exists (e.g., "AS13335 Cloudflare")
  │     └─> If yes: skip
  └─> If no: Check Redis Hash: asn:ips → redis.hget('asn:ips', ip)
        ├─> If found: merge into geo entry
        └─> If missing: getIpAsn(ip)
              ├─> Returns: { asn, name, orgName, website, country, estimatedUsers }
              └─> Cache: redis.hset('asn:ips', { [ip]: JSON.stringify(asnInfo) })
                    └─> Merge into geo and update geo:ips cache

Output:
  - hijackIPs: { ip, hijack: { id, confidence_score, prefixes, duration } }[]
  - blacklist: { ipAddress, abuseConfidenceScore, totalReports, lastReportedAt }[]
  - geoData: { ip, lat, lon, country, city, as, asnDetails }[]
  - uniqueIPs: string[]
```

**Why Hashes Instead of Individual Keys?**
- Redis pricing is based on total keys, not data size
- `geo:ips` hash holds 1000s of IPs in 1 key instead of 1000s of keys
- Same for `asn:ips` and `abuse:ips` hashes
- Reduces key count by 99.9%, avoids hitting free-tier limits

#### **Step 3: Score Threats** (`/api/score`)
```
For each IP in geoData:
  ├─> Find matching hijackSource or abuseEntry
  │
  ├─> Calculate threat score using calculateThreatScore():
  │     ├─> Abuse confidence weight: 0-40 points
  │     ├─> BGP hijack confidence: 0-30 points (scaled from 0-12)
  │     ├─> Country hotness: 0-20 points (rank-based)
  │     ├─> Recency bonus: 0-10 points (hours since last report)
  │     └─> Total: 0-100 score
  │
  ├─> Calculate attack magnitude:
  │     ├─> BGP: hijack confidence + country attack % + duration
  │     └─> Blacklist: total reports + country attack % + recency
  │
  └─> Build RedisThreat object:
        ├─> id, ip, lat, lon, country, countryCode, city
        ├─> asn, asnName, isp
        ├─> threatScore, abuseConfidence, attackMagnitude, countryHotness
        ├─> isHighThreat (score >75), isClusteredThreat (50-75)
        ├─> dataSource: "bgp_hijack" | "abuseipdb_blacklist"
        └─> bgpHijack?: { eventId, hijackerASN, victimASN, prefixes, duration }

Output: RedisThreat[] (typically 100-150 threats per refresh)
```

#### **Step 4: Build Hotspots** (in `/api/cron/refresh`)
```
Group threats by countryCode
  └─> Map<countryCode, RedisThreat[]>

For each country:
  ├─> Find matching Cloudflare data:
  │     ├─> topOrigins (attackOriginRank, attackOriginPercent)
  │     └─> topTargets (attackTargetRank, attackTargetPercent)
  │
  ├─> Calculate metrics:
  │     ├─> avgThreatScore: mean of all country threats
  │     ├─> threatDensity: min(100, avgScore * threatCount/10)
  │     └─> topASNs: top 5 ASNs by occurrence count
  │
  └─> Build RedisHotspot object:
        ├─> countryCode, countryName, coords (lat, lon)
        ├─> attackOriginRank, attackOriginPercent
        ├─> attackTargetRank, attackTargetPercent
        ├─> threatDensity, threatCount, avgThreatScore
        └─> topASNs: { asn, name, count }[]

Sort by threatDensity (descending)

Output: RedisHotspot[] (typically 30-50 countries)
```

#### **Step 5: Calculate Stats** (in `/api/cron/refresh`)
```
Aggregate global metrics:
  ├─> totalThreats: threats.length
  ├─> highSeverityCount: threats with score ≥75
  ├─> bgpHijackCount: threats from BGP source
  ├─> outageCount: anomalyData.outages.length
  ├─> activeCountries: unique country codes
  ├─> topAttackingCountry: topOrigins[0].name
  ├─> topTargetedCountry: topTargets[0].name
  └─> lastUpdated: ISO timestamp

Output: RedisStats object
```

#### **Step 6: Build Attack Flows** (`/api/history`)
```
For each attack in topAttacks:
  ├─> Find origin/target coordinates:
  │     ├─> Check hotspots map first
  │     └─> Fallback to country centroid lookup
  │
  └─> Build AttackFlow object:
        ├─> id: "{originCode}_to_{targetCode}"
        ├─> originCountry, originCountryCode, originCoords
        ├─> targetCountry, targetCountryCode, targetCoords
        └─> magnitude: parseFloat(attack.value) (% of global traffic)

Filter flows where both coords exist

Output: AttackFlow[] (typically 20-30 flows)
```

#### **Step 7: Cache Everything** (`/api/cache`)
```
Store in Redis with 24h TTL:
  ├─> threats:latest → JSON.stringify(threats)
  ├─> hotspots:latest → JSON.stringify(hotspots)
  ├─> stats:summary → JSON.stringify(stats)
  └─> flows:latest → JSON.stringify(attackFlows)

All data is now ready for frontend consumption via /api/threats
```

### **Frontend Data Consumption**

```
useThreats() hook (in page.tsx)
  ├─> Polls /api/threats every 1 hour (3600000ms) (Was suppose to poll every 15 minutes, but data doesnt change for 24 hours due to vercel cron job limitation)
  │     └─> Reads from Redis cache (instant response)
  │
  └─> Updates Zustand store:
        ├─> threats: RedisThreat[]
        ├─> hotspots: RedisHotspot[]
        ├─> stats: RedisStats
        └─> attackFlow: AttackFlow[]

Globe3D component
  ├─> Threat markers: pointsData from threats
  ├─> Country polygons: colored by hotspot density
  ├─> Attack arcs: arcsData from attackFlow
  └─> Pulsing rings: critical threats (score ≥85)

Dashboard component
  ├─> Overview stats: from RedisStats
  ├─> Threat level filters: filter threats by score
  └─> Top 5 countries: aggregate threats by country

Interactive Modals
  ├─> ThreatModal: on marker click
  │     ├─> Shows threat details
  │     └─> Optional: Fetch /api/ips-info (on-demand ASN enrichment)
  │                  └─> Fetch /api/summary (Groq AI summary)
  │
  ├─> ThreatListModal: on country polygon click
  │     └─> Shows all threats in country, sortable/filterable
  │
  └─> FlowDetailsModal: on attack arc click
        └─> Shows origin→target breakdown
```

---

## Project Structure

```
cyber-geo-monitor/
├── app/
│   ├── api/                          # Backend API routes
│   │   ├── cache/
│   │   │   └── route.ts              # Store/retrieve Redis cache (POST/GET)
│   │   ├── cron/
│   │   │   └── refresh/
│   │   │       └── route.ts          # Main cron orchestrator (7-step pipeline)
│   │   ├── enrich-ips/
│   │   │   └── route.ts              # IP enrichment (geo + ASN + blacklist)
│   │   ├── fetch-traffic/
│   │   │   └── route.ts              # Cloudflare data fetcher
│   │   ├── history/
│   │   │   └── route.ts              # Attack flow builder
│   │   ├── ips-info/
│   │   │   └── route.ts              # On-demand IP detail lookup
│   │   ├── score/
│   │   │   └── route.ts              # Threat scoring algorithm
│   │   ├── summary/
│   │   │   └── route.ts              # Groq AI summary generator
│   │   └── threats/
│   │       └── route.ts              # Main data endpoint (GET cached data)
│   │
│   ├── page.tsx                      # Main landing page (Hero + Dashboard)
│   ├── layout.tsx                    # Root layout
│   └── globals.css                   # Global styles
│
├── components/
│   ├── globe/
│   │   └── Globe3D.tsx               # 3D globe visualization (react-globe.gl)
│   │
│   ├── layout/
│   │   ├── Navbar.tsx                # Top navigation bar
│   │   └── Footer.tsx                # Footer (if exists)
│   │
│   ├── sections/
│   │   ├── HeroSection.tsx           # Landing hero with scroll fade
│   │   └── Dashboard.tsx             # Main dashboard (stats + filters + top countries)
│   │
│   ├── threat/
│   │   ├── ThreatModal.tsx           # Detailed threat popup
│   │   ├── ThreatListModal.tsx       # Country threat list popup
│   │   └── FlowDetailsModal.tsx      # Attack flow details popup
│   │
│   └── ui/
│       ├── Popup.tsx                 # Draggable popup base component
│       ├── Button.tsx                # Reusable button component
│       └── Card.tsx                  # Card layout component
│
├── hooks/
│   └── useThreats.ts                 # SWR-style polling hook for /api/threats
│
├── lib/
│   ├── redis.ts                      # Upstash Redis client initialization
│   ├── utils.ts                      # cn() utility (clsx + tailwind-merge)
│   │
│   ├── scoring/
│   │   └── calculateScore.ts         # Multi-signal threat scoring logic
│   │
│   └── utils/
│       └── threat-helpers.ts         # Shared helper functions (extractASN, etc.)
│
├── services/
│   ├── abuseipdb.ts                  # AbuseIPDB API wrapper
│   ├── cloudflare.ts                 # Cloudflare Radar API wrapper
│   ├── geolocateIP.ts                # ip-api.com batch geolocation
│   └── groq.ts                       # Groq AI API wrapper
│
├── store/
│   └── useThreatStore.ts             # Zustand store for global threat state
│
├── types/
│   ├── redis.ts                      # Redis data structure types
│   └── types.ts                      # API response types (Cloudflare, AbuseIPDB, etc.)
│
├── data/
│   ├── custom.geo.json               # Country polygons for globe
│   └── country-centroid.json         # Country centroid coordinates
│
├── public/                           # Static assets (images, icons)
│
├── .env.local                        # Environment variables (gitignored)
├── .gitignore
├── next.config.js                    # Next.js configuration
├── tailwind.config.js                # Tailwind CSS configuration
├── tsconfig.json                     # TypeScript configuration
├── package.json
├── vercel.json                       # Vercel deployment config (cron jobs)
└── README.md                         # This file
```

### **Key File Explanations**

#### **Backend Routes**
- **`/api/cron/refresh`**: The heart of the system. Runs hourly, orchestrates all 7 steps, ensures data freshness.
- **`/api/threats`**: Frontend-facing endpoint. Returns pre-computed cached data (no heavy computation).
- **`/api/enrich-ips`**: Most complex route. Handles hybrid caching for geo/ASN/abuse data with Redis hashes.
- **`/api/score`**: Implements custom threat scoring algorithm (abuse + BGP + country hotness + recency).
- **`/api/summary`**: On-demand AI summary generation (Groq llama-3.2-3b).

#### **Frontend Components**
- **`Globe3D.tsx`**: Manages globe lifecycle, data layers, click handlers, modal triggers.
- **`Dashboard.tsx`**: Main UI. Shows overview stats, threat level filters, top 5 countries, AI analysis.
- **`useThreats.ts`**: Custom hook. Polls `/api/threats` every hour, updates Zustand store.

#### **Service Wrappers**
- **`services/cloudflare.ts`**: Wraps Cloudflare Radar API. Handles auth, error handling, response parsing.
- **`services/abuseipdb.ts`**: Wraps AbuseIPDB API. Includes blacklist fetcher and single-IP lookup.
- **`services/geolocateIP.ts`**: Batch geolocation using ip-api.com (45 req/min limit).
- **`services/groq.ts`**: Groq AI client for threat summaries.

#### **Redis Cache Keys**
```
Top-level keys:
  - threats:latest          (24h TTL)
  - hotspots:latest         (24h TTL)
  - stats:summary           (24h TTL)
  - flows:latest            (24h TTL)
  - cloudflare:traffic:raw  (24h TTL)
  - cloudflare:hijacks:raw  (24h TTL)
  - cloudflare:outages:raw  (24h TTL)
  - abuseipdb:blacklist     (24h TTL)

Hash keys (single key, many fields):
  - geo:ips                 (7-day TTL, ~1000+ IP fields)
  - asn:ips                 (7-day TTL, ~1000+ IP fields)
  - abuse:ips               (24h TTL, on-demand fetches)
  - threat:summaries        (24h TTL, on-demand AI summaries)
```

---

## API Rate Limit Strategy

### **Problem Statement**
- **Cloudflare Radar**: 600 requests/minute → Using all limits = 864,000 req/day
- **AbuseIPDB**: 1000 requests/day (free tier)
- **ip-api.com**: 45 requests/minute → 64,800 req/day

**Without caching**: Would hit all limits in <1 hour of production traffic.

### **Solution: Hybrid Caching + Cron Architecture**

#### **Cloudflare Radar**
- **Default**: 600 req/min = 864,000 req/day
- **My Usage**: 12 req/hour (cron-triggered) = 288 req/day
- **Savings**: 99.97%
- **Cache Strategy**: 24-hour TTL for traffic/hijacks/outages

#### **AbuseIPDB**
- **Default**: 1000 req/day (free tier)
- **My Usage**: 5 req/day (1 blacklist fetch + 4 buffer)
- **Savings**: 99.5%
- **Cache Strategy**: 
  - Blacklist cached 23 hours (leaves 1h buffer before daily reset)
  - On-demand IP lookups cached in `abuse:ips` hash (24h TTL)

#### **ip-api.com**
- **Default**: 45 req/min = 64,800 req/day
- **My Usage**: ~60 req/hour (batched geolocations) = 1,440 req/day
- **Savings**: 97.8%
- **Cache Strategy**: 
  - Geolocation cached in `geo:ips` hash (7-day TTL)
  - Typical refresh processes ~100-150 IPs, ~80% cache hit rate after first run

#### **Groq AI**
- **Default**: 30 req/min (free tier)
- **My Usage**: 0 req/hour (on-demand only)
- **Savings**: 100% when idle
- **Cache Strategy**: 
  - Summaries cached in `threat:summaries` hash (24h TTL per IP)

### **Overall Impact**
- **Total API calls reduced by ~99%**
- **Cost**: $0/month (all free tiers)
- **Scalability**: Can handle 1000+ concurrent users without hitting rate limits
- **Latency**: <50ms response time (Redis cache vs 2-5s API calls)

---

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `UPSTASH_REDIS_REST_URL` | ✅ | Upstash Redis REST endpoint | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Upstash Redis auth token | `AXxxx...` |
| `CLOUDFLARE_API_KEY` | ✅ | Cloudflare API token with Radar access | `xxx...` |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | Cloudflare account ID | `xxx...` |
| `ABUSEIPDB_API_KEY` | ✅ | AbuseIPDB API key (free tier) | `xxx...` |
| `GROQ_API_KEY` | ✅ | Groq API key for AI summaries | `gsk_xxx...` |
| `CRON_SECRET` | ✅ | Random secret for cron auth | `your-secret-123` |
| `NEXT_PUBLIC_APP_URL` | ✅ | Full app URL (for cron internal calls) | `https://yourdomain.com` |

---

## Development Workflow

### **Running Locally**
```bash
npm run dev
```

### **Testing Individual API Routes**
```bash
# Test traffic fetching
curl http://localhost:3000/api/fetch-traffic

# Test IP enrichment
curl -X POST http://localhost:3000/api/enrich-ips \
  -H "Content-Type: application/json" \
  -d '{"bgpHijacks":null,"includeBlacklist":true}'

# Test full cron pipeline
curl -X GET http://localhost:3000/api/cron/refresh \
  -H "Authorization: Bearer my-cron-secret"

# Test cached data endpoint
curl http://localhost:3000/api/threats
```

---

## Known Limitations

1. **Data Freshness**: Updates every 24 hours (cron-based). Not true real-time streaming (Polling every hour but data richness still depends on vercel cron job).
2. **IP Coverage**: Only processes ~100-150 IPs per refresh (BGP hijacks + blacklist top 500). Global IP space is ~4 billion.
3. **BGP Hijack Detection**: Relies on Cloudflare's detection. May miss low-confidence events.
4. **Geolocation Accuracy**: ip-api.com city-level accuracy is ~80%. May misplace some threats.
5. **Free Tier Limits**: 
   - AbuseIPDB: 1000 req/day (sufficient for current usage)
   - Upstash Redis: 10,000 commands/day (sufficient for current usage)
   - Groq AI: Rate limits on burst usage
6. **No Historical Data**: Only shows current snapshot. No time-series analysis yet.
7. **Serverless architecture**: To keep this project active while being under free-tier constraints, I had to go with vercel, hence I had to stick with approach like data polling and also keep up with some cron job limitations.

---

## Services used

- **Cloudflare Radar** for threat intelligence data
- **AbuseIPDB** for IP reputation data
- **ip-api.com** for geolocation services
- **Groq** for AI summarization
- **Upstash** for serverless Redis
- **react-globe.gl** for 3D globe visualization

---

## API and Redis data

- **API_template.md** stores the template data and its structure that these external API's provide
- **Data_in_redis.md** stores the template data and its structure that I store in @upstash/redis