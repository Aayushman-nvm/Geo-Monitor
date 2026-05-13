// app/page.tsx

"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/layout/Navbar";
import HeroSection from "@/components/sections/HeroSection";
import Dashboard from "@/components/sections/Dashboard";
import { useThreatStore } from "@/store/useThreatStore";
import { useThreats } from '@/hooks/useThreats';

export default function Home() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const { setData, setLoading: setStoreLoading } = useThreatStore();
  // Use the polling hook for real-time data in production. Keep this switchable for debugging.
  // useThreats handles polling and updates the store; comment out and use manual fetch for debugging.
  useThreats();
  const [initialLoading, setInitialLoading] = useState(false);

  // Improved scroll handling with longer transition distance
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      // Increased scroll distance for smoother transition (from 30% to 80% of viewport)
      const scrollHeight = window.innerHeight * 0.8;
      const progress = Math.min(Math.max(scrollTop / scrollHeight, 0), 1);
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-black overflow-x-hidden">
      <Navbar />

      {/* Hero Section - Fixed, fades out on scroll */}
      <HeroSection scrollProgress={scrollProgress} />

      {/* Dashboard - Appears as hero fades, with smooth transition */}
      <div className="relative z-20">
        <Dashboard 
          scrollProgress={scrollProgress} 
          isLoading={initialLoading}
        />
      </div>
    </div>
  );
}