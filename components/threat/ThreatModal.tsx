// components/threat/ThreatModal.tsx

"use client";

import { useEffect, useState } from "react";
import { RedisThreat } from "@/types/redis";
import Popup from "@/components/ui/Popup";
import Button from "@/components/ui/Button";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { CloudflareAsnInfo } from '@/services/cloudflare';
import type { AbuseIpData } from '@/types/types';

interface ThreatModalProps {
  threat: RedisThreat | null;
  onClose: () => void;
}

export default function ThreatModal({ threat, onClose }: ThreatModalProps) {
  const [loadingASN, setLoadingASN] = useState(false);
  const [asnDetails, setASNDetails] = useState<CloudflareAsnInfo | null>(null);
  const [abuseDetails, setAbuseDetails] = useState<AbuseIpData | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [aiSummary, setAISummary] = useState<string | null>(null);

  // Fetch ASN details (accepts ip so it is safe to call for different threats)
  const fetchIPDetails = async (ip: string) => {
    if (!ip) return;
    setLoadingASN(true);
    try {
      const res = await fetch("/api/ips-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      const data = await res.json();
      // api returns { success, data: { ip, geo, asn, abuse }, ... }
      const asnObj = data?.data?.asn ?? data?.data?.geo?.asnDetails ?? null;
      setASNDetails(asnObj ?? null);
      setAbuseDetails((data?.data?.abuse ?? null) as AbuseIpData | null);
    } catch (error) {
      console.error("Failed to fetch ASN details:", error);
    } finally {
      setLoadingASN(false);
    }
  };

  // Reset modal state whenever the threat changes (close or open). Auto-fetch IP details on open.
  useEffect(() => {
    // Clear previous modal state
    setASNDetails(null);
    setAbuseDetails(null);
    setAISummary(null);
    setLoadingASN(false);
    setLoadingSummary(false);

    // NOTE: Do NOT auto-fetch details here. Only clear state on threat change.
    // IP detail fetching must be explicitly triggered by the user via the button
    // to avoid unnecessary API calls and to ensure UX/consent.
    // no cleanup required
  }, [threat]);

  // Ensure modal internal state is reset when closing, then call parent onClose
  const handleClose = () => {
    setASNDetails(null);
    setAbuseDetails(null);
    setAISummary(null);
    setLoadingASN(false);
    setLoadingSummary(false);
    onClose();
  };

  // Generate AI summary on-demand
  const generateSummary = async () => {
    setLoadingSummary(true);
    setAISummary(null);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: threat?.ip, threat }),
      });
      const data = await res.json();
      const summaryText = typeof data.summary === 'string' ? data.summary : JSON.stringify(data.summary);
      setAISummary(summaryText);
    } catch (error) {
      console.error("Failed to generate summary:", error);
    } finally {
      setLoadingSummary(false);
    }
  };

  const getSeverityColor = () => {
    const score = threat?.threatScore;
    if (!score) return "text-green-400";
    if (score >= 85) return "text-red-400";
    if (score >= 70) return "text-orange-400";
    if (score >= 50) return "text-yellow-400";
    return "text-green-400";
  };

  const getSeverityLabel = () => {
    const score = threat?.threatScore;
    if (!score) return "LOW";
    if (score >= 85) return "CRITICAL";
    if (score >= 70) return "HIGH";
    if (score >= 50) return "MEDIUM";
    return "LOW";
  };

  if (!threat) return null;

  return (
    <Popup
      isOpen={!!threat}
      onClose={handleClose}
      title={`Threat: ${threat.ip}`}
      size="lg"
    >
      <div className="space-y-4">
        {/* Severity Badge */}
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-bold ${getSeverityColor()}`}>
            {threat.threatScore}
          </span>
          <span className="px-2 py-1 text-xs font-bold rounded border bg-opacity-20 uppercase">
            {getSeverityLabel()}
          </span>
        </div>

        {/* Threat Score Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase">Threat Assessment</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-xs">
            <ScoreItem label="Abuse Confidence" value={threat.abuseConfidence} />
            <ScoreItem label="Attack Magnitude" value={threat.attackMagnitude || 0} />
            <ScoreItem label="Country Hotness" value={threat.countryHotness} />
            <ScoreItem label="Occurrences" value={threat.occurrences} />
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase">Location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <InfoRow label="Country" value={`${threat.country} (${threat.countryCode})`} />
            <InfoRow label="City" value={threat.city} />
            <InfoRow label="Coordinates" value={`${threat.lat.toFixed(4)}, ${threat.lon.toFixed(4)}`} />
          </CardContent>
        </Card>

        {/* Network Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase">Network</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <InfoRow label="ASN" value={`AS${threat.asn}`} />
            <InfoRow label="Organization" value={threat.asnName} />
            <InfoRow label="ISP" value={threat.isp} />
            <InfoRow label="Source" value={threat.dataSource.replace("_", " ").toUpperCase()} />

            {!asnDetails && !loadingASN && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchIPDetails(threat.ip)}
                className="w-full mt-2"
              >
                Load detailed IP information
              </Button>
            )}

            {loadingASN && (
              <div className="flex items-center gap-2 text-gray-400 mt-2">
                <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full" />
                Loading...
              </div>
            )}

            {asnDetails && (
              <div className="mt-2 p-2 bg-gray-900/50 rounded border border-gray-800 space-y-1">
                <InfoRow label="Registry" value={asnDetails.source} />
                <InfoRow label="Est. Users" value={asnDetails.estimatedUsers?.toLocaleString()} />
                {asnDetails.website && (
                  <InfoRow
                    label="Website"
                    value={
                      <a
                        href={asnDetails.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        {asnDetails.website}
                      </a>
                    }
                  />
                )}
              </div>
            )}

            {abuseDetails && (
              <div className="mt-2 p-2 bg-gray-900/60 rounded border border-gray-800 space-y-1">
                <InfoRow label="Abuse Confidence" value={abuseDetails.data?.abuseConfidenceScore ?? null} />
                <InfoRow label="Last Reported" value={abuseDetails.data?.lastReportedAt ?? null} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* BGP Hijack */}
        {threat.bgpHijack && (
          <Card className="border-red-900/50 bg-red-900/10">
            <CardHeader>
              <CardTitle className="text-xs uppercase text-red-400">
                ⚠️ BGP Hijacking Event
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <InfoRow label="Event ID" value={threat.bgpHijack.eventId} />
              <InfoRow label="Hijacker ASN" value={`AS${threat.bgpHijack.hijackerASN}`} />
              <InfoRow label="Victim ASN" value={`AS${threat.bgpHijack.victimASN}`} />
              <InfoRow label="Confidence" value={`${threat.bgpHijack.confidenceScore}/12`} />
              <InfoRow
                label="Duration"
                value={`${Math.round(threat.bgpHijack.duration / 60)} minutes`}
              />
            </CardContent>
          </Card>
        )}

        {/* AI Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase">AI Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            {!aiSummary && !loadingSummary && (
              <Button
                variant="primary"
                size="sm"
                onClick={generateSummary}
                className="w-full"
              >
                Generate AI Summary
              </Button>
            )}

            {loadingSummary && (
              <div className="flex items-center justify-center gap-2 py-4">
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                <span className="text-xs text-gray-400">Analyzing...</span>
              </div>
            )}

            {aiSummary && (
              <p className="text-xs text-gray-300 leading-relaxed">{aiSummary}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </Popup>
  );
}

// Helper Components
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-gray-500">{label}:</span>
      <span className="text-white text-right">{value}</span>
    </div>
  );
}

function ScoreItem({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-white">{value}</div>
    </div>
  );
}