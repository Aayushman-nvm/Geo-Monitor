// components/globe/Globe3D.tsx

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useThreatStore } from '@/store/useThreatStore';
import { RedisThreat, AttackFlow } from '@/types/redis';
import ThreatModal from '@/components/threat/ThreatModal';
import ThreatListModal from '@/components/threat/ThreatListModal';
import FlowDetailsModal from '@/components/threat/FlowDetailsModal';
import GeoJSON from '@/data/custom.geo.json';

interface GlobeComponentProps {
  width?: number;
  height?: number;
}

const Globe = dynamic(() => import('react-globe.gl'), {
  ssr: false,
  loading: () => <div className="text-white">Loading globe...</div>,
});

export default function Globe3D({ width = 1200, height = 800 }: GlobeComponentProps) {
  const globeRef = useRef<any>(null);
  const { threats, hotspots, attackFlow, stats } = useThreatStore();
  
  // Modal state
  const [selectedThreat, setSelectedThreat] = useState<RedisThreat | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<AttackFlow | null>(null);
  
  // GeoJSON data
  const countries = GeoJSON;
  const flows = attackFlow || [];

  // Auto-rotate globe
  useEffect(() => {
    if (globeRef.current) {
      globeRef.current.controls().autoRotate = true;
      globeRef.current.controls().autoRotateSpeed = 0.5;
    }
  }, []);

  // ============================================
  // Color Utilities
  // ============================================
  
  const getThreatColor = (threat: RedisThreat): string => {
    const score = threat.threatScore;
    if (score >= 85) return '#ff0000'; // Critical - Red
    if (score >= 70) return '#ff6b00'; // High - Orange
    if (score >= 50) return '#ffa500'; // Medium - Light Orange
    return '#ffff00'; // Low - Yellow
  };

  const getThreatSize = (threat: RedisThreat): number => {
    const score = threat.threatScore;
    if (score >= 85) return 1.5;
    if (score >= 70) return 1.2;
    if (score >= 50) return 1.0;
    return 0.8;
  };

  const getCountryColor = (countryCode: string): string => {
    const hotspot = hotspots.find(h => h.countryCode === countryCode);
    if (!hotspot) return 'rgba(100, 100, 100, 0.3)';
    
    const density = hotspot.threatDensity;
    if (density >= 80) return 'rgba(255, 0, 0, 0.5)';
    if (density >= 60) return 'rgba(255, 107, 0, 0.4)';
    if (density >= 40) return 'rgba(255, 165, 0, 0.3)';
    return 'rgba(255, 255, 0, 0.2)';
  };

  const getFlowColor = (flow: AttackFlow): string => {
    const magnitude = flow.magnitude;
    if (magnitude >= 10) return 'rgba(255, 0, 0, 0.8)';
    if (magnitude >= 5) return 'rgba(255, 107, 0, 0.7)';
    return 'rgba(255, 165, 0, 0.6)';
  };

  // ============================================
  // Click Handlers
  // ============================================

  const handleThreatClick = useCallback((threat: RedisThreat) => {
    setSelectedThreat(threat);
    setSelectedCountry(null);
    setSelectedFlow(null);
  }, []);

  const handleCountryClick = useCallback((polygon: any) => {
    const countryCode = polygon.properties?.iso_a2;
    if (countryCode) {
      setSelectedCountry(countryCode);
      setSelectedThreat(null);
      setSelectedFlow(null);
    }
  }, []);

  const handleFlowClick = useCallback((flow: AttackFlow) => {
    setSelectedFlow(flow);
    setSelectedThreat(null);
    setSelectedCountry(null);
  }, []);

  // ============================================
  // Data Preparation
  // ============================================

  // Prepare point data for threats (beacons)
  const threatPoints = threats.map(threat => ({
    lat: threat.lat,
    lng: threat.lon,
    size: getThreatSize(threat),
    color: getThreatColor(threat),
    threat, // Store full threat object for click handling
  }));

  // Prepare arc data for attack flows (trails)
  const arcData = flows.map(flow => ({
    startLat: flow.originCoords?.lat,
    startLng: flow.originCoords?.lon,
    endLat: flow.targetCoords?.lat,
    endLng: flow.targetCoords?.lon,
    color: getFlowColor(flow),
    flow, // Store full flow object
  }));

  // Get threats for selected country
  const countryThreats = selectedCountry
    ? threats.filter(t => t.countryCode === selectedCountry)
    : [];

  return (
    <div className="relative">
      <Globe
        ref={globeRef}
        width={width}
        height={height}
        backgroundColor="#000011"
        
        // ============================================
        // Globe Appearance
        // ============================================
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        
        // ============================================
        // Countries (Polygons)
        // ============================================
        polygonsData={countries?.features || []}
        polygonCapColor={d => getCountryColor((d as any).properties?.iso_a2)}
        polygonSideColor={() => 'rgba(0, 0, 0, 0.1)'}
        polygonStrokeColor={() => 'rgba(255, 255, 255, 0.2)'}
        polygonAltitude={0.01}
        polygonsTransitionDuration={300}
        onPolygonClick={handleCountryClick}
        polygonLabel={(d) => {
          const props = (d as any).properties;
          const countryCode = props?.iso_a2;
          const hotspot = hotspots.find(h => h.countryCode === countryCode);
          
          if (hotspot) {
            return `
              <div style="background: rgba(0,0,0,0.9); padding: 12px; border-radius: 8px; color: white;">
                <strong style="font-size: 16px;">${hotspot.countryName}</strong><br/>
                <span style="color: #ff6b00;">Threats: ${hotspot.threatCount}</span><br/>
                <span style="color: #ffa500;">Avg Score: ${hotspot.avgThreatScore}/100</span><br/>
                <span style="color: #888; font-size: 12px;">Click for details</span>
              </div>
            `;
          }
          return `<div style="padding: 8px; background: rgba(0,0,0,0.8); color: white;">${props?.name || 'Unknown'}</div>`;
        }}
        
        // ============================================
        // Threat Beacons (Points)
        // ============================================
        pointsData={threatPoints}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointAltitude={0.05}
        pointRadius="size"
        pointsMerge={false}
        onPointClick={(point: any) => handleThreatClick(point.threat)}
        pointLabel={(point: any) => {
          const threat = point.threat;
          return `
            <div style="background: rgba(0,0,0,0.95); padding: 12px; border-radius: 8px; color: white; max-width: 280px;">
              <strong style="color: ${getThreatColor(threat)}; font-size: 14px;">
                Threat Score: ${threat.threatScore}/100
              </strong><br/>
              <div style="margin-top: 8px; font-size: 13px;">
                <strong>IP:</strong> ${threat.ip}<br/>
                <strong>Location:</strong> ${threat.city}, ${threat.country}<br/>
                <strong>ASN:</strong> AS${threat.asn} - ${threat.asnName}<br/>
                ${threat.bgpHijack ? '<span style="color: #ff0000;">⚠️ BGP Hijack Detected</span><br/>' : ''}
                <span style="color: #888; font-size: 11px; margin-top: 4px; display: block;">Click for full details</span>
              </div>
            </div>
          `;
        }}
        
        // ============================================
        // Attack Flow Trails (Arcs)
        // ============================================
        arcsData={arcData}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor="color"
        arcAltitude={0.3}
        arcStroke={0.5}
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={2000}
        arcsTransitionDuration={1000}
        onArcClick={(arc: any) => handleFlowClick(arc.flow)}
        arcLabel={(arc: any) => {
          const flow = arc.flow;
          return `
            <div style="background: rgba(0,0,0,0.95); padding: 12px; border-radius: 8px; color: white;">
              <strong style="font-size: 14px;">Attack Flow</strong><br/>
              <div style="margin-top: 8px; font-size: 13px;">
                <span style="color: #ff6b00;">From:</span> ${flow.originCountry}<br/>
                <span style="color: #ffa500;">To:</span> ${flow.targetCountry}<br/>
                <span style="color: #fff;">Volume:</span> ${flow.magnitude.toFixed(2)}%<br/>
                <span style="color: #888; font-size: 11px; margin-top: 4px; display: block;">Click for details</span>
              </div>
            </div>
          `;
        }}
        
        // ============================================
        // Pulsing Rings (High Severity)
        // ============================================
        ringsData={threats
          .filter(t => t.threatScore >= 85) // Only critical threats
          .map(t => ({
            lat: t.lat,
            lng: t.lon,
          }))
        }
        ringColor={() => 'rgba(255, 0, 0, 0.5)'}
        ringMaxRadius={5}
        ringPropagationSpeed={2}
        ringRepeatPeriod={1500}
      />

      {/* Modals */}
      {selectedThreat && (
        <ThreatModal
          threat={selectedThreat}
          onClose={() => setSelectedThreat(null)}
        />
      )}

      {selectedCountry && (
        <ThreatListModal
          countryCode={selectedCountry}
          threats={countryThreats}
          onThreatClick={handleThreatClick}
          onClose={() => setSelectedCountry(null)}
        />
      )}

      {selectedFlow && (
        <FlowDetailsModal
          flow={selectedFlow}
          onClose={() => setSelectedFlow(null)}
        />
      )}

      {/* Stats Overlay */}
      {stats && (
        <div className="absolute top-4 left-4 bg-black/80 text-white p-4 rounded-lg backdrop-blur-sm">
          <h3 className="text-lg font-bold mb-2">Global Threat Overview</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Total Threats:</span>
              <span className="font-semibold">{stats.totalThreats}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">High Severity:</span>
              <span className="font-semibold text-red-500">{stats.highSeverityCount}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">BGP Hijacks:</span>
              <span className="font-semibold text-orange-500">{stats.bgpHijackCount}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Active Countries:</span>
              <span className="font-semibold">{stats.activeCountries}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Network Outages:</span>
              <span className="font-semibold text-yellow-500">{stats.outageCount}</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
            Last updated: {new Date(stats.lastUpdated).toLocaleTimeString()}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-black/80 text-white p-4 rounded-lg backdrop-blur-sm">
        <h4 className="text-sm font-bold mb-2">Threat Levels</h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Critical (85+)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <span>High (70-84)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ffa500' }}></div>
            <span>Medium (50-69)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span>Low (&lt;50)</span>
          </div>
        </div>
      </div>
    </div>
  );
}