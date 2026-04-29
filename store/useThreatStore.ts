import { create } from "zustand";
import type { RedisThreat, RedisHotspot, RedisStats, AttackFlow } from "@/types/redis"; 

interface ThreatStore {
  threats: RedisThreat[];
  hotspots: RedisHotspot[];
  attackFlow: AttackFlow[];
  stats: RedisStats | null;
  loading: boolean;
  error: string | null;
  
  setData: (data: {
    threats: RedisThreat[];
    hotspots: RedisHotspot[];
    attackFlow: AttackFlow[];
    stats: RedisStats;
  }) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useThreatStore = create<ThreatStore>((set) => ({
  threats: [],
  hotspots: [],
  attackFlow: [],
  stats: null,
  loading: false,
  error: null,
  
  setData: (data) => set({ threats: data.threats, hotspots: data.hotspots, stats: data.stats, attackFlow:data.attackFlow }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error })
}));