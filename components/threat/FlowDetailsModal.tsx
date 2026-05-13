// components/threat/FlowDetailsModal.tsx

'use client';

import { useState, useEffect } from 'react';
import { ArrowRight, TrendingUp, MapPin, Activity } from 'lucide-react';
import { useThreatStore } from '@/store/useThreatStore';
import { RedisThreat, AttackFlow } from '@/types/redis';
import Popup from '@/components/ui/Popup';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

interface FlowDetailsModalProps {
  flow: AttackFlow | null;
  onClose: () => void;
}

export default function FlowDetailsModal({ flow, onClose }: FlowDetailsModalProps) {
  const { threats, hotspots } = useThreatStore();
  const [relatedThreats, setRelatedThreats] = useState<RedisThreat[]>([]);

  if (!flow) return null;

  // Find threats related to this flow
  useEffect(() => {
    if (flow) {
      const related = threats.filter(
        t => t.countryCode === flow.originCountryCode || t.countryCode === flow.targetCountryCode
      );
      setRelatedThreats(related.slice(0, 10));
    }
  }, [threats, flow]);

  const originHotspot = hotspots.find(h => h.countryCode === flow.originCountryCode);
  const targetHotspot = hotspots.find(h => h.countryCode === flow.targetCountryCode);

  const getMagnitudeColor = (magnitude: number): string => {
    if (magnitude >= 10) return 'text-red-400';
    if (magnitude >= 5) return 'text-orange-400';
    return 'text-yellow-400';
  };

  return (
    <Popup
      isOpen={!!flow}
      onClose={onClose}
      title="Attack Flow Details"
      size="xl"
    >
      <div className="space-y-4">
        {/* Flow Direction */}
        <Card variant="elevated">
          <CardContent className="flex items-center justify-center gap-3 py-6">
            <div className="text-center">
              <div className="text-xs text-gray-500 mb-1">Origin</div>
              <div className={`text-lg font-bold ${getMagnitudeColor(flow.magnitude)}`}>
                {flow.originCountry}
              </div>
              <div className="text-xs text-gray-500 font-mono">{flow.originCountryCode}</div>
            </div>
            <ArrowRight className="w-8 h-8 text-gray-600" />
            <div className="text-center">
              <div className="text-xs text-gray-500 mb-1">Target</div>
              <div className={`text-lg font-bold ${getMagnitudeColor(flow.magnitude)}`}>
                {flow.targetCountry}
              </div>
              <div className="text-xs text-gray-500 font-mono">{flow.targetCountryCode}</div>
            </div>
          </CardContent>
        </Card>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <Card padding="sm" className="text-center">
            <div className="text-xs text-gray-500 mb-1">Volume</div>
            <div className={`text-xl font-bold ${getMagnitudeColor(flow.magnitude)}`}>
              {flow.magnitude.toFixed(2)}%
            </div>
          </Card>
          <Card padding="sm" className="text-center">
            <div className="text-xs text-gray-500 mb-1">Origin Threats</div>
            <div className="text-xl font-bold text-white">
              {relatedThreats.filter(t => t.countryCode === flow.originCountryCode).length}
            </div>
          </Card>
          <Card padding="sm" className="text-center">
            <div className="text-xs text-gray-500 mb-1">Target Threats</div>
            <div className="text-xl font-bold text-white">
              {relatedThreats.filter(t => t.countryCode === flow.targetCountryCode).length}
            </div>
          </Card>
        </div>

        {/* Origin Details */}
        {originHotspot && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xs uppercase flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" />
                Origin Country
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-xs">
              <InfoRow label="Attack Rank" value={`#${originHotspot.attackOriginRank}`} />
              <InfoRow label="Attack %" value={`${originHotspot.attackOriginPercent?.toFixed(2)}%`} />
              <InfoRow label="Threat Density" value={`${originHotspot.threatDensity}/100`} />
              <InfoRow label="Avg Score" value={`${originHotspot.avgThreatScore}/100`} />
            </CardContent>
          </Card>
        )}

        {/* Target Details */}
        {targetHotspot && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xs uppercase flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" />
                Target Country
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-xs">
              <InfoRow label="Target Rank" value={`#${targetHotspot.attackTargetRank}`} />
              <InfoRow label="Target %" value={`${targetHotspot.attackTargetPercent?.toFixed(2)}%`} />
              <InfoRow label="Threat Density" value={`${targetHotspot.threatDensity}/100`} />
              <InfoRow label="Avg Score" value={`${targetHotspot.avgThreatScore}/100`} />
            </CardContent>
          </Card>
        )}

        {/* Related Threats */}
        {relatedThreats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xs uppercase flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" />
                Related Threats ({relatedThreats.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-48 overflow-y-auto">
              {relatedThreats.map((threat) => (
                <div
                  key={threat.id}
                  className="flex items-center justify-between p-2 bg-gray-900/50 rounded text-xs"
                >
                  <div>
                    <div className="font-mono text-gray-300">{threat.ip}</div>
                    <div className="text-gray-500">{threat.city}, {threat.country}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${getMagnitudeColor(threat.threatScore)}`}>
                      {threat.threatScore}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </Popup>
  );
}

// Helper
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-gray-500 mb-0.5">{label}</div>
      <div className="text-white font-medium">{value}</div>
    </div>
  );
}