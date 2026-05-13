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

interface Globe3DProps {
  filteredThreats?: RedisThreat[];
  selectedLevel?: 'all' | 'critical' | 'high' | 'medium';
}

const Globe = dynamic(() => import('react-globe.gl'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-gray-500 text-sm">Loading globe...</div>
    </div>
  ),
});

export default function Globe3D({ 
  filteredThreats,
  selectedLevel = 'all' 
}: Globe3DProps) {
  const globeRef = useRef<any>(null);
  const { threats, hotspots, attackFlow } = useThreatStore();
  
  // Use filtered threats if provided, otherwise use all threats from store
  const displayThreats = filteredThreats || threats || [];
  
  // Modal state
  const [selectedThreat, setSelectedThreat] = useState<RedisThreat | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<AttackFlow | null>(null);
  
  const countries = GeoJSON;
  const flows = attackFlow || [];

  // Measure container to pass explicit size to the Globe so it always centers and fits.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateSize = () => {
      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setContainerSize({ width: Math.max(100, Math.floor(rect.width)), height: Math.max(100, Math.floor(rect.height)) });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Auto-rotate globe
  useEffect(() => {
    if (globeRef.current && globeRef.current.controls) {
      try {
        const controls = globeRef.current.controls();
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.3;
        controls.enableZoom = true;
        controls.minDistance = 120;
        controls.maxDistance = 800;
      } catch (err) {
        // fallback: ignore
      }
    }
  }, []);

  // Point to camera on initial load and when displayThreats update
  useEffect(() => {
    if (!globeRef.current) return;

    // Determine a centered view. Use average of threats if available, otherwise fallback to 0,0.
    const lat = displayThreats.length > 0
      ? displayThreats.reduce((s, t) => s + (t.lat || 0), 0) / displayThreats.length
      : 0;
    const lng = displayThreats.length > 0
      ? displayThreats.reduce((s, t) => s + (t.lon || 0), 0) / displayThreats.length
      : 0;

    // Choose altitude based on container size to ensure full globe visibility on different screens.
    const smallestSide = Math.min(containerSize.width, containerSize.height);
    // Larger altitude for smaller viewport to fit globe fully
    const altitude = smallestSide < 420 ? 2.8 : smallestSide < 600 ? 2.4 : 2.0;

    try {
      globeRef.current.pointOfView({ lat: lat || 0, lng: lng || 0, altitude }, 1000);
    } catch (err) {
      // ignore if globe not ready yet
    }
  }, [displayThreats.length, containerSize.width, containerSize.height]);

  // Color utilities
  const getThreatColor = (threat: RedisThreat): string => {
    const score = threat.threatScore;
    if (score >= 85) return '#ef4444';
    if (score >= 70) return '#f97316';
    if (score >= 50) return '#f59e0b';
    return '#eab308';
  };

  const getThreatSize = (threat: RedisThreat): number => {
    const score = threat.threatScore;
    if (score >= 85) return 0.8;
    if (score >= 70) return 0.6;
    if (score >= 50) return 0.5;
    return 0.4;
  };

  const getCountryColor = (countryCode: string): string => {
    const hotspot = hotspots?.find(h => h.countryCode === countryCode);
    if (!hotspot) return 'rgba(60, 60, 60, 0.2)';
    
    const density = hotspot.threatDensity;
    if (density >= 80) return 'rgba(239, 68, 68, 0.3)';
    if (density >= 60) return 'rgba(249, 115, 22, 0.25)';
    if (density >= 40) return 'rgba(245, 158, 11, 0.2)';
    return 'rgba(234, 179, 8, 0.15)';
  };

  const getFlowColor = (flow: AttackFlow): string => {
    const magnitude = flow.magnitude;
    if (magnitude >= 10) return 'rgba(239, 68, 68, 0.7)';
    if (magnitude >= 5) return 'rgba(249, 115, 22, 0.6)';
    return 'rgba(245, 158, 11, 0.5)';
  };

  // Click handlers
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

  // Data preparation
  const threatPoints = displayThreats.map(threat => ({
    lat: threat.lat,
    lng: threat.lon,
    size: getThreatSize(threat),
    color: getThreatColor(threat),
    threat,
  }));

  const arcData = flows.map(flow => ({
    startLat: flow.originCoords?.lat,
    startLng: flow.originCoords?.lon,
    endLat: flow.targetCoords?.lat,
    endLng: flow.targetCoords?.lon,
    color: getFlowColor(flow),
    flow,
  }));

  const countryThreats = selectedCountry
    ? threats?.filter(t => t.countryCode === selectedCountry) || []
    : [];

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center">
      <Globe
        ref={globeRef}
        width={containerSize.width}
        height={containerSize.height}
        backgroundColor="rgba(0, 0, 0, 0)"
        
        // Globe appearance
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        
        // Countries
        polygonsData={countries?.features || []}
        polygonCapColor={d => getCountryColor((d as any).properties?.iso_a2)}
        polygonSideColor={() => 'rgba(0, 0, 0, 0.05)'}
        polygonStrokeColor={() => 'rgba(100, 100, 100, 0.15)'}
        polygonAltitude={0.006}
        polygonsTransitionDuration={300}
        onPolygonClick={handleCountryClick}
        polygonLabel={(d) => {
          const props = (d as any).properties;
          const countryCode = props?.iso_a2;
          const hotspot = hotspots?.find(h => h.countryCode === countryCode);
          
          if (hotspot) {
            return `
              <div style="background: rgba(0,0,0,0.95); padding: 10px 12px; border-radius: 6px; color: white; font-size: 12px; line-height: 1.5;">
                <strong style="font-size: 13px; display: block; margin-bottom: 4px;">${hotspot.countryName}</strong>
                <div style="color: #f97316;">Threats: ${hotspot.threatCount}</div>
                <div style="color: #f59e0b;">Avg Score: ${hotspot.avgThreatScore}/100</div>
                <div style="color: #888; font-size: 10px; margin-top: 4px;">Click for details</div>
              </div>
            `;
          }
          return `<div style="padding: 6px 10px; background: rgba(0,0,0,0.85); color: white; font-size: 11px; border-radius: 4px;">${props?.name || 'Unknown'}</div>`;
        }}
        
        // Threat beacons
        pointsData={threatPoints}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointAltitude={0.02}
        pointRadius="size"
        pointsMerge={false}
        onPointClick={(point: any) => handleThreatClick(point.threat)}
        pointLabel={(point: any) => {
          const threat = point.threat;
          return `
            <div style="background: rgba(0,0,0,0.95); padding: 10px 12px; border-radius: 6px; color: white; max-width: 260px; font-size: 11px; line-height: 1.5;">
              <strong style="color: ${getThreatColor(threat)}; font-size: 12px; display: block; margin-bottom: 6px;">
                Threat Score: ${threat.threatScore}/100
              </strong>
              <div style="font-size: 11px;">
                <div><strong>IP:</strong> ${threat.ip}</div>
                <div><strong>Location:</strong> ${threat.city}, ${threat.country}</div>
                <div><strong>ASN:</strong> AS${threat.asn}</div>
                ${threat.bgpHijack ? '<div style="color: #ef4444; margin-top: 4px;">⚠️ BGP Hijack</div>' : ''}
                <div style="color: #888; font-size: 10px; margin-top: 6px;">Click for full details</div>
              </div>
            </div>
          `;
        }}
        
        // Attack flows
        arcsData={arcData}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor="color"
        arcAltitude={0.25}
        arcStroke={0.4}
        arcDashLength={0.6}
        arcDashGap={0.3}
        arcDashAnimateTime={1500}
        arcsTransitionDuration={1000}
        onArcClick={(arc: any) => handleFlowClick(arc.flow)}
        arcLabel={(arc: any) => {
          const flow = arc.flow;
          return `
            <div style="background: rgba(0,0,0,0.95); padding: 10px 12px; border-radius: 6px; color: white; font-size: 11px; line-height: 1.5;">
              <strong style="font-size: 12px; display: block; margin-bottom: 6px;">Attack Flow</strong>
              <div>
                <div style="color: #f97316;"><strong>From:</strong> ${flow.originCountry}</div>
                <div style="color: #f59e0b;"><strong>To:</strong> ${flow.targetCountry}</div>
                <div><strong>Volume:</strong> ${flow.magnitude.toFixed(2)}%</div>
                <div style="color: #888; font-size: 10px; margin-top: 6px;">Click for details</div>
              </div>
            </div>
          `;
        }}
        
        // Pulsing rings for critical threats
        ringsData={displayThreats
          .filter(t => t.threatScore >= 85)
          .map(t => ({ lat: t.lat, lng: t.lon }))
        }
        ringColor={() => 'rgba(239, 68, 68, 0.4)'}
        ringMaxRadius={3}
        ringPropagationSpeed={1.5}
        ringRepeatPeriod={2000}
      />

      {/* Popups instead of modals */}
      <ThreatModal
        threat={selectedThreat}
        onClose={() => setSelectedThreat(null)}
      />

      <ThreatListModal
        countryCode={selectedCountry}
        threats={countryThreats}
        onThreatClick={handleThreatClick}
        onClose={() => setSelectedCountry(null)}
      />

      <FlowDetailsModal
        flow={selectedFlow}
        onClose={() => setSelectedFlow(null)}
      />
    </div>
  );
}