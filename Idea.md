# Cyber Geo Monitor

Real-time global cybersecurity threat visualization using free APIs and serverless architecture.

## Core Idea

Monitor global cyber threats by correlating traffic anomalies (Cloudflare Radar) with malicious IP data (AbuseIPDB), then visualize on interactive 2D/3D maps with intelligent scoring and clustering.

## Data Flow

1. **Fetch** (Vercel Cron every 15min): Cloudflare Radar API → unusual traffic by region/country/ISP
2. **Enrich**: Query AbuseIPDB for IPs in suspicious ISP ranges → geolocate IPs
3. **Score**: Calculate threat scores based on:
   - AbuseIPDB confidence (40%)
   - Traffic anomaly magnitude (30%)
   - Temporal clustering (20%)
   - Geographic clustering (10%)
4. **Store**: Cache in Upstash Redis with 24hr rolling history
5. **Serve**: Client polls cached data every 60s (no WebSockets)

## Visual System

- **High-threat IPs (score >75)**: Pulsing beacon markers
- **Clustered threats (score 50-75)**: Smooth animated trails between related IPs
- **Normal activity (<50)**: Standard blobs
- **Regional hotspots**: Heatmap overlay showing aggregated threat density

### Interactions
- Click heatmap → Modal with country/region/ISPs/IP list
- Click individual blob → Compact modal with single IP details
- Historical view: 1hr/12hr/24hr snapshots in timeline modal

## Tech Stack

- **Frontend**: Next.js 15, React, Tailwind CSS
- **3D Visualization**: Three.js + react-three-fiber OR Deck.gl
- **2D Maps**: Mapbox GL JS (free tier) or Leaflet
- **Caching**: Vercel KV or Upstash Redis (free)
- **AI Context**: Groq API (llama-3.2-3b, 14k req/day free) for JSON → plain English summaries
- **Deployment**: Vercel (serverless, free tier)

## API Budget (All Free)

| Service | Free Limit | Usage |
|---------|-----------|-------|
| Cloudflare Radar | 100 req/day | 96 req/day (every 15min) |
| AbuseIPDB | 1000 req/day | ~200 req/day (batched) |
| IP Geolocation | 30k req/month | ~8k req/month |
| Groq AI | 14,400 req/day | ~100 req/day (on-demand) |
| Upstash Redis | 10k commands/day | ~3k commands/day |

## Key Features

✅ **Serverless**: No backend servers, just Vercel cron + API routes  
✅ **Real-time**: Data refreshes every 15min, client polls every 60s  
✅ **Historical**: View past 1hr/12hr/24hr threat patterns  
✅ **AI Summaries**: Auto-generated threat context from JSON data  
✅ **Zero Cost**: Entirely on free tiers  
✅ **Lightweight**: Optimized for low-spec machines  

## Caching Strategy

```
Main APIs (15min cron) → Vercel KV (10min TTL) → Client (60s polling)
                      ↓
              Historical aggregates (1hr TTL)
```

Client never hits main APIs directly—always polls processed cache.

## Deployment

1. Clone repo
2. Add API keys to `.env.local`
3. Deploy to Vercel
4. Enable cron job in `vercel.json`
5. Done ✨

---

**Goal**: Build a free, serverless, real-time cyber threat intelligence platform that stays within API rate limits and runs on any machine.
