# API Templates

## Cloudflare Outages (Raw)

```json
{
  "success": true,
  "errors": [],
  "result": {
    "annotations": [
      {
        "id": "1585",
        "dataSource": "ALL",
        "description": "Suspension of Internet service during Sudanese Certificate Examination sessions",
        "scope": null,
        "startDate": "2026-04-22T11:45:00Z",
        "endDate": "2026-04-22T15:15:00Z",
        "locations": [
          "SD"
        ],
        "asns": [
          15706,
          36998,
          36972
        ],
        "origins": [],
        "eventType": "OUTAGE",
        "linkedUrl": "https://bsky.app/profile/radar.cloudflare.com/post/3mjf6c7xbn22c",
        "asnsDetails": [
          {
            "asn": "15706",
            "name": "Sudatel",
            "location": {
              "code": "SD",
              "name": "Sudan"
            }
          },
          {
            "asn": "36998",
            "name": "SDN-MOBITEL",
            "location": {
              "code": "SD",
              "name": "Sudan"
            }
          },
          {
            "asn": "36972",
            "name": "MTNSD",
            "location": {
              "code": "SD",
              "name": "Sudan"
            }
          }
        ],
        "locationsDetails": [
          {
            "name": "Sudan",
            "code": "SD"
          }
        ],
        "originsDetails": [],
        "outage": {
          "outageCause": "GOVERNMENT_DIRECTED",
          "outageType": "NATIONWIDE"
        }
      },
      {
        "...": "..."
      }
    ]
  }
}
```

---

## Cloudflare Hijacks (Raw)

```json
{
  "success": true,
  "errors": [],
  "result": {
    "asn_info": [
      {
        "asn": 999,
        "org_name": "CORIX NETWORKS",
        "country_code": "US"
      },
      {
        "...": "..."
      }
    ],
    "events": [
      {
        "duration": 1118,
        "event_type": 0,
        "hijack_msgs_count": 4,
        "hijacker_asn": 131284,
        "hijacker_country": "AF",
        "id": 145607,
        "is_stale": false,
        "max_hijack_ts": "2026-04-25T16:43:14.784",
        "max_msg_ts": "2026-04-25T16:56:26.471",
        "min_hijack_ts": "2026-04-25T16:37:48.711",
        "on_going_count": 0,
        "peer_asns": [
          6939,
          24940,
          32590
        ],
        "peer_ip_count": 3,
        "prefixes": [
          "103.102.220.0/24"
        ],
        "tags": [
          {
            "name": "irr_new_origin_invalid",
            "score": 4
          },
          {
            "name": "irr_old_origin_valid",
            "score": 0
          },
          {
            "name": "rpki_new_origin_invalid",
            "score": 8
          },
          {
            "name": "rpki_old_origin_valid",
            "score": 0
          }
        ],
        "victim_asns": [
          137039
        ],
        "victim_countries": [
          "AF"
        ],
        "confidence_score": 12
      },
      {
        "...": "..."
      }
    ],
    "total_monitors": 272
  },
  "result_info": {
    "count": 50,
    "total_count": 127278,
    "page": 1,
    "per_page": 50
  }
}
```

---

## Cloudflare Attacks (Raw)

Stores an array of objects in `top_0`.

```json
{
  "success": true,
  "errors": [],
  "result": {
    "top_0": [
      {
        "originCountryAlpha2": "US",
        "originCountryName": "United States",
        "targetCountryName": "China",
        "targetCountryAlpha2": "CN",
        "value": "11.59086"
      },
      {
        "...": "..."
      }
    ]
  }
}
```

---

## AbuseIPDB Blacklist

Stores an array of objects in `data`.

```json
{
  "meta": {
    "generatedAt": "2026-04-25T17:25:26+00:00"
  },
  "data": [
    {
      "ipAddress": "198.199.104.186",
      "countryCode": "US",
      "abuseConfidenceScore": 100,
      "lastReportedAt": "2026-04-25T17:17:02+00:00"
    },
    {
      "...": "..."
    }
  ]
}
```