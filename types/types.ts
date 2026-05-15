// @/types/cloudflare.ts

import type { RedisThreat, AttackFlow, BlacklistItem } from './redis';

// ============================================
// Cloudflare Traffic Data Types
// ============================================

export interface CloudflareTopOrigin {
  originCountryAlpha2: string;
  originCountryName: string;
  value: string;
  rank: number;
}

export interface CloudflareTopTarget {
  targetCountryAlpha2: string;
  targetCountryName: string;
  value: string;
  rank?: number;
}

export interface CloudflareTopAttack {
  originCountryAlpha2: string;
  originCountryName: string;
  targetCountryName: string;
  targetCountryAlpha2: string;
  value: string;
}

export interface CloudflareTrafficData {
  topOrigins: {
    result: {
      top_0: CloudflareTopOrigin[];
    };
  };
  topTargets: {
    result: {
      top_0: CloudflareTopTarget[];
    };
  };
  topAttacks: {
    result: {
      top_0: CloudflareTopAttack[];
    };
  };
}

// ============================================
// Cloudflare BGP Hijack Types
// ============================================

export interface CloudflareBGPEvent {
  id: number;
  confidence_score: number;
  prefixes: string[];
  duration: number;
  hijacker_asn: number;
  victim_asns: number[];
  event_type: number;
  hijack_msgs_count: number;
  hijacker_country: string;
  is_stale: boolean;
  max_hijack_ts: string;
  max_msg_ts: string;
  min_hijack_ts: string;
  on_going_count: number;
  peer_asns: number[];
  peer_ip_count: number;
  tags: Array<{ name: string; score: number }>;
  victim_countries: string[];
}

export interface CloudflareASNInfo {
  asn: number;
  org_name: string;
  country_code: string;
}

export interface CloudflareBGPHijacks {
  success: boolean;
  errors: unknown[];
  result: {
    events: CloudflareBGPEvent[];
    asn_info: CloudflareASNInfo[];
    total_monitors: number;
  };
  result_info: {
    count: number;
    total_count: number;
    page: number;
    per_page: number;
  };
}

// ============================================
// Cloudflare Outage Types
// ============================================

export interface CloudflareOutageAnnotation {
  id: string;
  dataSource: string;
  description: string;
  scope: string | null;
  startDate: string;
  endDate: string;
  locations: string[];
  asns: number[];
  origins: string[];
  eventType: string;
  linkedUrl: string;
  asnsDetails: Array<{
    asn: string;
    name: string;
    location: {
      code: string;
      name: string;
    };
  }>;
  locationsDetails: Array<{
    name: string;
    code: string;
  }>;
  originsDetails: string[];
  outage: {
    outageCause: string;
    outageType: string;
  };
}

export interface CloudflareOutages {
  success: boolean;
  errors: unknown[];
  result: {
    annotations: CloudflareOutageAnnotation[];
  };
}

// ============================================
// AbuseIPDB Types
// ============================================

export interface AbuseIPDBBlacklist {
  meta: {
    generatedAt: string;
  };
  data: BlacklistItem[];
}

// ============================================
// Enrichment Helper Types
// ============================================

export interface HijackIPEntry {
  ip: string;
  hijack: CloudflareBGPEvent;
}

// ============================================
// Geographic & GeoJSON Types
// ============================================

export interface CountryCentroid {
  alpha2: string;
  alpha3: string;
  latitude: number;
  longitude: number;
  name: string;
}

export interface GeoJSONFeature {
  type: string;
  properties: {
    iso_a2: string;
    name: string;
    [key: string]: unknown;
  };
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

// ============================================
// Globe Visualization Types
// ============================================

export interface ThreatPoint {
  lat: number;
  lng: number;
  size: number;
  color: string;
  threat: RedisThreat;
}

export interface ArcData {
  startLat: number | undefined;
  startLng: number | undefined;
  endLat: number | undefined;
  endLng: number | undefined;
  color: string;
  flow: AttackFlow;
}

export interface WorldGlobeProps {
  data: ArcData[];
  globeConfig: {
    pointSize?: number;
    atmosphereColor?: string;
    showAtmosphere?: boolean;
    atmosphereAltitude?: number;
    polygonColor?: string;
    emissive?: string;
    emissiveIntensity?: number;
    shininess?: number;
    arcTime?: number;
    arcLength?: number;
    rings?: number;
    maxRings?: number;
  };
}

// ============================================
// API Response Types
// ============================================

export interface FetchTrafficResponse {
  success: boolean;
  data: {
    traffic: CloudflareTrafficData | null;
    anomalies: {
      bgpHijacks: CloudflareBGPHijacks | null;
      outages: CloudflareOutages | null;
    };
  };
  cached: {
    traffic: boolean;
    hijacks: boolean;
    outages: boolean;
  };
  timestamp: string;
}

export interface GeoEntry {
  ip: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionCode?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  asn?: string;
  asnDetails?: Record<string, unknown> | null;
  status: 'success' | 'fail' | 'error';
  error?: string;
  raw?: unknown;
}

export interface EnrichIPsResponse {
  success: boolean;
  data: {
    hijackIPs: HijackIPEntry[];
    blacklist: BlacklistItem[];
    geoData: GeoEntry[];
    uniqueIPs: string[];
  };
  stats: {
    hijackIPsExtracted: number;
    blacklistIPsCount: number;
    uniqueIPsCount: number;
    geolocatedCount: number;
    geoCachedCount: number;
    geoFreshCount: number;
  };
  timestamp: string;
}

// ============================================
// Scoring Helper Types
// ============================================

export interface BGPHijackScore {
  confidenceScore: number;
  duration: number;
}

export interface BlacklistScore {
  totalReports: number;
  lastReportedAt: string;
}