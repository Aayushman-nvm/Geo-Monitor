# Cyber Geo Monitor — Project Blueprint

## Goal

Build a **Cyber Geo Monitor: Global Network Anomaly & Threat Intelligence Dashboard** that aggregates real-time network traffic and converts them into meaningful insights.

---

# Tech Stack

## Frontend

* Next.js (App Router)
* React
* Tailwind CSS
* Map:

  * 2D: Leaflet + react-leaflet
  * 3D (optional): react-globe.gl

## Backend (Serverless)

* Next.js API routes
* Edge functions (optional)

## Caching

* Primary: Vercel Edge Cache
* Optional: Upstash Redis (free tier)

## Data Sources

* USGS (earthquakes)
* NASA FIRMS (fires)
* Cloudflare Radar (cyber trends)
* Submarine Cable Map (static dataset)

---

# Folder Structure

```
/app
  /api
    /cyber/route.ts

  /components
    Map.tsx
    EventCard.tsx
    Filters.tsx

  /lib
    fetchers.ts
    normalizers.ts
    ruleEngine.ts
    cache.ts

  /types
    event.ts

  /hooks
    useEvents.ts

  page.tsx

/public
  cables.json
```

---

# Event Schema (CRITICAL)

## Unified Event Schema

```ts
export type GeoEvent = {
  id: string
  type: "cyber"
  source: string

  location: {
    lat: number
    lng: number
    region?: string
    country?: string
  }

  timestamp: number

  severity: number // 1–10

  metadata: Record<string, any>

  insight: string
}
```

---

# Data Pipeline

```
External APIs → Fetchers → Normalizers → Rule Engine → Cache → API Route → Frontend
```

---

# API Integration Tasks

## 1. Cloudflare Radar (Cyber)

* Use summaries/trends only

### Task

* [ ] Fetch trend data
* [ ] Convert to regional events

# Rule Engine

## Goal

Convert structured data into human-readable insights.

### Example Logic

```ts
if (event.type === "earthquake") {
  if (event.metadata.magnitude > 7)
    return "High magnitude earthquake detected"
}
```

---

# Map Rendering Strategy

## 2D Map (Leaflet)

### Techniques

* Marker clustering
* Lazy rendering
* Debounce updates

### Tasks

* [ ] Setup map
* [ ] Add markers
* [ ] Add clustering
* [ ] Add filters

---

## 3D Globe (Optional)

### Library

* react-globe.gl

### Tips

* Limit number of points
* Use arcs/points selectively

---

# Performance Rules

* DO NOT render 1000+ markers directly
* Use clustering
* Cache API responses (5–10 min)
* Avoid frequent re-renders

---

# AI / Summarization Strategy

## Recommended Approach

Hybrid:

```
Rules → Structured Insight → Optional AI polish
```

## Free Options

* HuggingFace inference API
* Small 1B–3B models

## Rule

* AI only for final sentence polishing
* NOT for logic

---

# API Routes Plan

## /api/events

* Aggregates all sources
* Returns unified data

### Tasks

* [ ] Combine all fetchers
* [ ] Apply rule engine
* [ ] Return final events

---

# Execution Timeline

## Week 1

* [ ] Setup project
* [ ] USGS integration
* [ ] Basic map

## Week 2

* [ ] NASA FIRMS
* [ ] Event schema
* [ ] Rule engine

## Week 3

* [ ] Cyber data
* [ ] UI polish
* [ ] Filters

## Final Days

* [ ] Caching
* [ ] Deployment
* [ ] Cleanup

---

# Constraints (DO NOT BREAK)

* No database
* No heavy scraping
* No unnecessary domains (finance, etc.)
* Serverless only

---

# Final Output

A deployed application that:

* Displays global events on a map
* Provides structured insights
* Uses multiple real-world data sources
* Runs fully serverless

---

# Positioning

"Built a serverless geospatial intelligence platform aggregating real-time global event data with custom signal processing and visualization."
