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
  attackOriginRank: number | null;            // 1-5 (from topOrigins)
  attackOriginPercent: number | null;         // 22.7% (from topOrigins)
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

export interface AttackFlow {
  id: string;
  originCountry: string;
  originCountryCode: string;
  targetCountry: string;
  targetCountryCode: string;
  magnitude: number; // 0-100 (percentage)
  originCoords: { lat: number; lon: number } | null;
  targetCoords: { lat: number; lon: number } | null;
}

export interface RawAttack {
  originCountryName: string;
  originCountryAlpha2: string;
  targetCountryName: string;
  targetCountryAlpha2: string;
  value: string; // "8.6%" etc.
}

export interface BlacklistItem  {
  ipAddress: string;
  countryCode: string;
  abuseConfidenceScore: number;
  lastReportedAt: string;
};
