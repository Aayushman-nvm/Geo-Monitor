import { useEffect } from "react";
import { useThreatStore } from "@/store/useThreatStore";

export function useThreats() {
  const { threats, hotspots, stats, attackFlow, setData, setLoading, setError } =
    useThreatStore();

  useEffect(() => {
    let interval: NodeJS.Timeout;

    async function fetchThreats() {
      try {
        setLoading(true);

        const response = await fetch("/api/threats");

        if (!response.ok) {
          throw new Error("Failed to fetch threats");
        }

        const json = await response.json();

        setData({
          threats: json.data.threats,
          hotspots: json.data.hotspots,
          attackFlow: json.data.attackFlow,
          stats: json.data.stats,
        });

        setError(null);
      } catch (error) {
        console.error("Error fetching threats:", error);
        setError(error instanceof Error ? error.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    // Initial fetch
    fetchThreats();

    interval = setInterval(fetchThreats, 3600000); // should be 60000 but the data isnt changing that frequently so... ive set it to 1 hour (subject to change later)

    return () => clearInterval(interval);
  }, [setData, setLoading, setError]);

  return { threats, hotspots, stats, attackFlow };
}
