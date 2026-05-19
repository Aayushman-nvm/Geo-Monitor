# Redis Cache Structure (Need to update)

## Cached Data Overview

The Redis cache stores the following primary datasets:

- `hotspots`
- `threats`
- `stats`
- `flows`

Each dataset is stored as JSON and refreshed periodically from upstream APIs and threat intelligence feeds.

---

# Hotspots Cache

Stores an array of country-level threat hotspot objects.

## Structure

```json
[
  {
    "countryCode": "US",
    "countryName": "United States",
    "attackOriginRank": 1,
    "attackOriginPercent": 20.530784,
    "attackTargetRank": 3,
    "attackTargetPercent": 18.791399,
    "threatDensity": 98,
    "threatCount": 14,
    "avgThreatScore": 70,
    "topASNs": [
      {
        "asn": 8075,
        "name": "Microsoft Azure Cloud (westus3)",
        "count": 3
      },
      {
        "asn": 14061,
        "name": "DigitalOcean, LLC",
        "count": 2
      },
      {
        "asn": 45102,
        "name": "Alibaba.com LLC",
        "count": 2
      },
      {
        "asn": 398324,
        "name": "Censys, Inc.",
        "count": 2
      },
      {
        "asn": 135377,
        "name": "UCLOUD",
        "count": 1
      }
    ],
    "coords": {
      "lat": 37.7308,
      "lon": -122.3838
    }
  }
]
```

## Description

Each hotspot object represents a country with concentrated threat activity.

### Fields

| Field | Description |
|---|---|
| `countryCode` | ISO country code |
| `countryName` | Full country name |
| `attackOriginRank` | Ranking as attack source |
| `attackOriginPercent` | Percentage of attacks originating from country |
| `attackTargetRank` | Ranking as attack target |
| `attackTargetPercent` | Percentage of attacks targeting country |
| `threatDensity` | Relative concentration score |
| `threatCount` | Number of active threats |
| `avgThreatScore` | Average threat severity |
| `topASNs` | Most active ASNs in country |
| `coords` | Geographic coordinates |

---

# Threats Cache

Stores an array of individual threat intelligence objects.

## Structure

```json
[
  {
    "id": "103.102.220.1_1777138094726",
    "ip": "103.102.220.1",
    "lat": 34.5554,
    "lon": 69.2075,
    "country": "Afghanistan",
    "countryCode": "AF",
    "city": "Kabul",
    "asn": 137039,
    "asnName": "Zohak Technology",
    "isp": "Zohak Technology (Z-Tech)",
    "threatScore": 20,
    "abuseConfidence": 0,
    "attackMagnitude": null,
    "countryHotness": 0,
    "isHighThreat": false,
    "isClusteredThreat": false,
    "dataSource": "bgp_hijack",
    "bgpHijack": {
      "eventId": 145607,
      "hijackerASN": 131284,
      "victimASN": 137039,
      "confidenceScore": 12,
      "prefixes": [
        "103.102.220.0/24"
      ],
      "duration": 1118
    },
    "firstSeen": "2026-04-25T17:28:14.726Z",
    "lastSeen": "2026-04-25T17:28:14.726Z",
    "occurrences": 1
  }
]
```

## Description

Each threat object represents a detected malicious or suspicious event.

### Fields

| Field | Description |
|---|---|
| `id` | Unique threat identifier |
| `ip` | Threat IP address |
| `lat` / `lon` | Geographic coordinates |
| `country` | Country name |
| `countryCode` | ISO country code |
| `city` | City name |
| `asn` | Autonomous System Number |
| `asnName` | ASN organization name |
| `isp` | Internet service provider |
| `threatScore` | Calculated threat severity |
| `abuseConfidence` | Abuse confidence score |
| `attackMagnitude` | Relative attack size |
| `countryHotness` | Country threat activity metric |
| `isHighThreat` | High severity indicator |
| `isClusteredThreat` | Indicates grouped attack activity |
| `dataSource` | Source of threat data |
| `bgpHijack` | Optional BGP hijack metadata |
| `firstSeen` | First detection timestamp |
| `lastSeen` | Last detection timestamp |
| `occurrences` | Number of detections |

---

# Stats Cache

Stores aggregated platform statistics.

## Structure

```json
{
  "totalThreats": 117,
  "highSeverityCount": 0,
  "bgpHijackCount": 17,
  "outageCount": 5,
  "activeCountries": 30,
  "topAttackingCountry": "United States",
  "topTargetedCountry": "China",
  "lastUpdated": "2026-04-25T17:28:14.767Z"
}
```

## Description

Provides summarized analytics for the current threat landscape.

### Fields

| Field | Description |
|---|---|
| `totalThreats` | Total tracked threats |
| `highSeverityCount` | Number of critical threats |
| `bgpHijackCount` | Active BGP hijack events |
| `outageCount` | Recorded outage events |
| `activeCountries` | Number of affected countries |
| `topAttackingCountry` | Highest attack-origin country |
| `topTargetedCountry` | Most targeted country |
| `lastUpdated` | Last cache refresh timestamp |

---

# Flows Cache

Stores attack flow visualization data between countries.

## Structure

```json
[
  {
    "id": "US_to_CN",
    "originCountry": "United States",
    "originCountryCode": "US",
    "targetCountry": "China",
    "targetCountryCode": "CN",
    "magnitude": 15.365228,
    "originCoords": {
      "lat": 42.2809,
      "lon": -83.7489
    },
    "targetCoords": {
      "lat": 40.0045,
      "lon": 116.329
    }
  }
]
```

## Description

Represents directional attack or threat traffic between countries.

### Fields

| Field | Description |
|---|---|
| `id` | Unique flow identifier |
| `originCountry` | Source country |
| `originCountryCode` | Source ISO code |
| `targetCountry` | Destination country |
| `targetCountryCode` | Destination ISO code |
| `magnitude` | Relative attack volume |
| `originCoords` | Source coordinates |
| `targetCoords` | Destination coordinates |

---

# Redis Storage Notes

## Recommended Redis Keys

```text
threatmap:hotspots
threatmap:threats
threatmap:stats
threatmap:flows
```

## Recommended Storage Format

- Store all datasets as serialized JSON strings.
- Use Redis TTLs for automatic refresh expiration.
- Compress large datasets if memory usage becomes high.

## Example Redis Commands

```bash
SET threatmap:stats "<json>"
SET threatmap:threats "<json>"
SET threatmap:hotspots "<json>"
SET threatmap:flows "<json>"
```

## Suggested TTL

```text
60s - 300s
```

Depending on refresh frequency and API rate limits.