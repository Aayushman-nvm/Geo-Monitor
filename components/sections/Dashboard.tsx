// components/sections/Dashboard.tsx

'use client';

import { useState, useEffect, useMemo } from 'react';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { AlertTriangle, Activity, Globe2, Shield, TrendingUp, Loader2 } from 'lucide-react';
import Globe3D from '@/components/globe/Globe3D';
import { useThreatStore } from '@/store/useThreatStore';
import { cn } from '@/lib/utils';

interface DashboardProps {
  scrollProgress: number;
  isLoading?: boolean;
}

export default function Dashboard({ scrollProgress, isLoading = false }: DashboardProps) {
  const { threats, hotspots, stats, loading: storeLoading } = useThreatStore();
  const [selectedLevel, setSelectedLevel] = useState<'all' | 'critical' | 'high' | 'medium'>('all');
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiSummary, setAISummary] = useState<string | null>(null);

  const isDataLoading = isLoading || storeLoading;

const filteredThreats = useMemo(() => {
  if (!threats) return [];

  switch (selectedLevel) {
    case 'critical':
      return threats.filter((t) => t.threatScore >= 85);

    case 'high':
      return threats.filter((t) => t.threatScore >= 70);

    case 'medium':
      return threats.filter((t) => t.threatScore >= 50);

    default:
      return threats;
  }
}, [threats, selectedLevel]);

const topCountries = useMemo(() => {
  if (!threats || threats.length === 0) return [];

  const countryMap = new Map<
    string,
    {
      country: string;
      code: string;
      count: number;
      severity: 'critical' | 'high' | 'medium' | 'low';
    }
  >();

  threats.forEach((threat) => {
    const country = threat.country || 'Unknown';
    const code = threat.countryCode || 'XX';

    if (!countryMap.has(code)) {
      countryMap.set(code, {
        country,
        code,
        count: 0,
        severity: 'low',
      });
    }

    const item = countryMap.get(code)!;

    item.count++;

    if (threat.threatScore >= 85) {
      item.severity = 'critical';
    } else if (
      threat.threatScore >= 70 &&
      item.severity !== 'critical'
    ) {
      item.severity = 'high';
    } else if (
      threat.threatScore >= 50 &&
      item.severity === 'low'
    ) {
      item.severity = 'medium';
    }
  });

  return Array.from(countryMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}, [threats]);

const severityColors = {
  critical: 'border-red-500/30 bg-red-500/5',
  high: 'border-orange-500/30 bg-orange-500/5',
  medium: 'border-yellow-500/30 bg-yellow-500/5',
  low: 'border-green-500/30 bg-green-500/5',
};

const generateAISummary = async () => {
  try {
    setLoadingAI(true);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const total = threats?.length || 0;
    const critical =
      threats?.filter((t) => t.threatScore >= 85).length || 0;

    setAISummary(
      `Global monitoring detected ${total} active threats, including ${critical} critical incidents. Threat activity is concentrated across multiple regions with elevated network exploitation attempts and coordinated malicious traffic patterns observed in high-risk zones.`
    );
  } catch (error) {
    console.error(error);

    setAISummary(
      'Unable to generate AI summary at this time.'
    );
  } finally {
    setLoadingAI(false);
  }
};
  
  // Dashboard appears gradually after scroll progress > 0.2
  const dashboardOpacity = Math.min(1, Math.max(0, (scrollProgress - 0.2) * 1.8));
  // We'll keep the dashboard always rendered to avoid re-layouts.
  const dashboardVisible = scrollProgress > 0.15;

  // To prevent scroll jumps we always render the dashboard but make it non-interactive
  // and visually hidden when not active. This avoids the page height changing.
  return (
    <div
      className="min-h-screen pt-16 pb-6 px-3 md:px-4 lg:px-6"
      style={{
        opacity: dashboardOpacity,
        // Use margin to avoid creating a transformed stacking context that affects fixed/popover positioning
        marginTop: dashboardVisible ? `${(1 - dashboardOpacity) * 8}px` : '20px',
        transition: 'opacity 0.5s ease-out, margin-top 0.5s ease-out',
        pointerEvents: dashboardVisible ? 'auto' : 'none',
      }}
    >
      <div className="max-w-450 mx-auto">
        
        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 mb-3 lg:mb-4">
          
          {/* Left Column: Overview + Levels */}
          <div className="lg:col-span-3 space-y-3 lg:space-y-4 order-2 lg:order-1">
            
            {/* Overview Stats */}
            <Card className="p-3 lg:p-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500">
                  <Activity className="w-3.5 h-3.5" />
                  Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {isDataLoading ? (
                  <>
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-10 bg-gray-800/50 rounded animate-pulse" />
                    ))}
                  </>
                ) : (
                  <>
                    <StatItem
                      label="Total Threats"
                      value={stats?.totalThreats || 0}
                      icon={<Shield className="w-4 h-4" />}
                      color="blue"
                    />
                    <StatItem
                      label="Critical"
                      value={stats?.highSeverityCount || 0}
                      icon={<AlertTriangle className="w-4 h-4" />}
                      color="red"
                    />
                    <StatItem
                      label="BGP Hijacks"
                      value={stats?.bgpHijackCount || 0}
                      icon={<TrendingUp className="w-4 h-4" />}
                      color="orange"
                    />
                    <StatItem
                      label="Countries"
                      value={stats?.activeCountries || 0}
                      icon={<Globe2 className="w-4 h-4" />}
                      color="purple"
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Threat Levels Filter */}
            <Card className="p-3 lg:p-4">
              <CardHeader>
                <CardTitle className="text-xs uppercase tracking-wider text-gray-500">
                  Levels
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(['all', 'critical', 'high', 'medium'] as const).map((level) => {
                  const count = level === 'all' 
                    ? threats?.length || 0
                    : level === 'critical'
                    ? threats?.filter(t => t.threatScore >= 85).length || 0
                    : level === 'high'
                    ? threats?.filter(t => t.threatScore >= 70).length || 0
                    : threats?.filter(t => t.threatScore >= 50).length || 0;

                  return (
                    <button
                      key={level}
                      onClick={() => setSelectedLevel(level)}
                      disabled={isDataLoading}
                      className={cn(
                        'w-full px-3 py-2 text-xs font-medium rounded-lg border transition text-left flex items-center justify-between',
                        selectedLevel === level
                          ? 'bg-white/10 border-gray-600 text-white'
                          : 'bg-transparent border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300',
                        isDataLoading && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <span className="capitalize">{level}</span>
                      <span className="text-gray-500 text-[10px]">{count}</span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Center: Globe */}
          <div className="lg:col-span-6 order-1 lg:order-2">
            <Card 
              variant="elevated" 
              padding="none" 
              className="h-125 md:h-150 lg:h-175 overflow-hidden relative"
            >
              {isDataLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/50">
                  <Loader2 className="w-12 h-12 text-gray-600 animate-spin mb-4" />
                  <p className="text-sm text-gray-500">Loading globe visualization...</p>
                </div>
              ) : (
                <Globe3D 
                  filteredThreats={filteredThreats}
                  selectedLevel={selectedLevel}
                />
              )}
            </Card>
          </div>

          {/* Right: Top 5 Countries */}
          <div className="lg:col-span-3 space-y-3 lg:space-y-4 order-3">
            {isDataLoading ? (
              <>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-24 bg-gray-800/50 rounded-lg animate-pulse" />
                ))}
              </>
            ) : topCountries.length > 0 ? (
              topCountries.map((country, idx) => (
                <Card
                  key={country.code}
                  className={cn(
                    'p-3 cursor-pointer hover:bg-gray-800/70 transition',
                    severityColors[country.severity]
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-white">#{idx + 1}</span>
                        <span className="text-xs font-medium text-white truncate">
                          {country.country}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono">{country.code}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">{country.count}</div>
                      <div className="text-[10px] text-gray-500">threats</div>
                    </div>
                  </div>
                  <div className="h-1 bg-gray-900 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-all duration-500',
                        country.severity === 'critical' && 'bg-red-500',
                        country.severity === 'high' && 'bg-orange-500',
                        country.severity === 'medium' && 'bg-yellow-500',
                        country.severity === 'low' && 'bg-green-500'
                      )}
                      style={{ 
                        width: topCountries.length > 0 
                          ? `${(country.count / topCountries[0].count) * 100}%` 
                          : '0%' 
                      }}
                    />
                  </div>
                </Card>
              ))
            ) : (
              <Card className="p-4 text-center">
                <p className="text-xs text-gray-500">No data available</p>
              </Card>
            )}
          </div>
        </div>

        {/* Bottom Section: AI Analysis */}
        <Card className="p-3 lg:p-4">
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wider text-gray-500">
              General AI Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!aiSummary && !loadingAI && (
              <Button
                variant="primary"
                size="sm"
                onClick={generateAISummary}
                disabled={isDataLoading || !threats || threats.length === 0}
                className="w-full sm:w-auto"
              >
                Generate AI Summary
              </Button>
            )}

            {loadingAI && (
              <div className="flex items-center gap-3 py-4">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
                <span className="text-xs text-gray-400">Analyzing global threat landscape...</span>
              </div>
            )}

            {aiSummary && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 leading-relaxed">
                  {aiSummary}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAISummary(null)}
                  className="text-xs"
                >
                  Clear Summary
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-4 py-2 text-center border-t border-gray-900">
          <p className="text-[10px] text-gray-700">
            © 2024 PLACEHOLDER. All rights reserved. Data sourced from multiple threat intelligence feeds.
          </p>
        </div>
      </div>
    </div>
  );
}

// Helper Component
function StatItem({ 
  label, 
  value, 
  icon, 
  color 
}: { 
  label: string; 
  value: number; 
  icon: React.ReactNode; 
  color: 'blue' | 'red' | 'orange' | 'purple';
}) {
  const colors = {
    blue: 'text-blue-400',
    red: 'text-red-400',
    orange: 'text-orange-400',
    purple: 'text-purple-400',
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <div className="flex items-center gap-2">
        <div className={colors[color]}>
          {icon}
        </div>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <span className="text-sm font-semibold text-white tabular-nums">
        {value.toLocaleString()}
      </span>
    </div>
  );
}