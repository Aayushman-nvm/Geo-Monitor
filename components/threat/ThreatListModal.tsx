// components/threat/ThreatListModal.tsx

'use client';

import { useMemo, useState } from 'react';
import { RedisThreat } from '@/types/redis';
import { MapPin, AlertTriangle, Activity } from 'lucide-react';
import Popup from '@/components/ui/Popup';
import Card from '@/components/ui/Card';

interface ThreatListModalProps {
  countryCode: string | null;
  threats: RedisThreat[];
  onThreatClick: (threat: RedisThreat) => void;
  onClose: () => void;
}

export default function ThreatListModal({
  countryCode,
  threats,
  onThreatClick,
  onClose,
}: ThreatListModalProps) {
  const [sortBy, setSortBy] = useState<'score' | 'recent' | 'city'>('score');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'high'>('all');

  // Sort and filter threats
  const filteredThreats = useMemo(() => {
    let filtered = [...threats];

    if (filterSeverity === 'critical') {
      filtered = filtered.filter(t => t.threatScore >= 85);
    } else if (filterSeverity === 'high') {
      filtered = filtered.filter(t => t.threatScore >= 70);
    }

    if (sortBy === 'score') {
      filtered.sort((a, b) => b.threatScore - a.threatScore);
    } else if (sortBy === 'recent') {
      filtered.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
    } else if (sortBy === 'city') {
      filtered.sort((a, b) => a.city.localeCompare(b.city));
    }

    return filtered;
  }, [threats, sortBy, filterSeverity]);

  const countryName = threats[0]?.country || countryCode;

  const getSeverityColor = (score: number): string => {
    if (score >= 85) return 'text-red-400';
    if (score >= 70) return 'text-orange-400';
    if (score >= 50) return 'text-yellow-400';
    return 'text-green-400';
  };

  // Stats
  const criticalCount = threats.filter(t => t.threatScore >= 85).length;
  const highCount = threats.filter(t => t.threatScore >= 70 && t.threatScore < 85).length;

  if (!countryCode) return null;

  return (
    <Popup
      isOpen={!!countryCode}
      onClose={onClose}
      title={`${countryName} (${countryCode})`}
      size="xl"
    >
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card padding="sm" className="text-center">
            <div className="text-xs text-gray-500">Total</div>
            <div className="text-xl font-bold text-white">{threats.length}</div>
          </Card>
          <Card padding="sm" className="text-center border-red-900/50 bg-red-900/10">
            <div className="text-xs text-red-400">Critical</div>
            <div className="text-xl font-bold text-red-400">{criticalCount}</div>
          </Card>
          <Card padding="sm" className="text-center border-orange-900/50 bg-orange-900/10">
            <div className="text-xs text-orange-400">High</div>
            <div className="text-xl font-bold text-orange-400">{highCount}</div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 text-xs">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-gray-900 text-white px-3 py-1.5 rounded-lg border border-gray-800 focus:border-gray-700 focus:outline-none"
          >
            <option value="score">By Score</option>
            <option value="recent">By Recent</option>
            <option value="city">By City</option>
          </select>

          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as any)}
            className="bg-gray-900 text-white px-3 py-1.5 rounded-lg border border-gray-800 focus:border-gray-700 focus:outline-none"
          >
            <option value="all">All Threats</option>
            <option value="critical">Critical Only</option>
            <option value="high">High+ Only</option>
          </select>
        </div>

        {/* Threat List */}
        <div className="space-y-2 max-h-100 overflow-y-auto">
          {filteredThreats.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No threats match filters</p>
            </div>
          ) : (
            filteredThreats.map((threat) => (
              <Card
                key={threat.id}
                padding="sm"
                className="cursor-pointer hover:bg-gray-800/70 transition"
                onClick={() => onThreatClick(threat)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-mono text-xs font-semibold ${getSeverityColor(threat.threatScore)}`}>
                        {threat.ip}
                      </span>
                      {threat.bgpHijack && (
                        <span className="text-red-500 text-[10px] font-semibold">⚠️ BGP</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <MapPin className="w-3 h-3" />
                      <span>{threat.city}</span>
                      <span>•</span>
                      <span>AS{threat.asn}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${getSeverityColor(threat.threatScore)}`}>
                      {threat.threatScore}
                    </div>
                    <div className="text-[10px] text-gray-500">score</div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        <div className="text-xs text-gray-500 text-center">
          Showing {filteredThreats.length} of {threats.length} threats
        </div>
      </div>
    </Popup>
  );
}