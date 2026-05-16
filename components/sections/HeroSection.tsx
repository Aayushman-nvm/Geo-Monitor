// components/sections/HeroSection.tsx

'use client';

import { useRef } from 'react';

interface HeroSectionProps {
  scrollProgress: number;
}

export default function HeroSection({ scrollProgress }: HeroSectionProps) {
  const heroRef = useRef<HTMLDivElement>(null);
  
  // Smooth opacity and scale transitions
  const opacity = Math.max(0, 1 - scrollProgress * 1.2);
  const scale = Math.max(0.6, 1 - scrollProgress * 0.4);
  const translateY = scrollProgress * -60; // less vertical shift so user doesn't end up at bottom

  // Keep rendering the hero even when nearly invisible to avoid layout shifts that cause scroll jumps.
  // We rely on opacity/transform to hide it instead of unmounting.

  return (
    <section
      ref={heroRef}
      className="relative w-full h-screen flex items-center justify-center bg-black/0 pointer-events-none z-10 overflow-visible"
      style={{
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
      }}
    >
      <div className="w-full max-w-7xl px-4 pt-8">
        {/* Title - 95% visible, 5% behind globe */}
        <div className="relative z-0 flex items-center justify-center">
          <h1
            className="text-[4.5rem] sm:text-[6rem] md:text-[8rem] lg:text-[10rem] xl:text-[12rem] font-bold text-transparent bg-clip-text bg-linear-to-b from-gray-200 via-gray-400 to-gray-600 select-none tracking-tighter leading-none text-center"
            style={{
              textShadow: '0 0 20px rgba(0,0,0,0.5)',
            }}
          >
            Geo Monitor
          </h1>
        </div>

        {/* Globe Container - 2/3 visible, bottom 1/3 cut off */}
        <div className="relative flex items-center justify-center z-10 overflow-visible">
          <div className="relative w-60 h-60 sm:w-[320px] sm:h-80 md:w-110 md:h-110 lg:w-130 lg:h-130 xl:w-150 xl:h-150 translate-y-0">
            {/* Decorative globe */}
            <div className="absolute inset-0 rounded-full bg-linear-to-br from-gray-800 via-gray-900 to-black border-2 border-gray-700/50 shadow-2xl shadow-black/50 overflow-hidden">
              {/* Globe grid lines */}
              <svg className="absolute inset-0 w-full h-full opacity-80" viewBox="0 0 100 100">
                {/* Horizontal lines */}
                {[15, 30, 45, 50, 55, 70, 85].map((y) => (
                  <ellipse
                    key={`h-${y}`}
                    cx="50"
                    cy={y}
                    rx="47"
                    ry={y === 50 ? "22" : "16"}
                    fill="none"
                    stroke="rgba(156,163,175,0.15)"
                    strokeWidth="0.4"
                  />
                ))}
                {/* Vertical lines */}
                {[15, 30, 45, 55, 70, 85].map((x) => (
                  <ellipse
                    key={`v-${x}`}
                    cx={x}
                    cy="50"
                    rx="22"
                    ry="47"
                    fill="none"
                    stroke="rgba(156,163,175,0.15)"
                    strokeWidth="0.4"
                  />
                ))}
              </svg>
              
              {/* Subtle glow effect */}
              <div 
                className="absolute inset-0 rounded-full bg-linear-to-tr from-blue-600/5 via-transparent to-purple-600/5"
                style={{
                  animation: 'pulse-slow 4s ease-in-out infinite',
                }}
              />

              {/* Continental shapes suggestion */}
              <div className="absolute inset-0">
                <div className="absolute top-[30%] left-[35%] w-16 h-12 bg-gray-700/20 rounded-full blur-sm" />
                <div className="absolute top-[45%] right-[25%] w-20 h-16 bg-gray-700/20 rounded-full blur-sm" />
                <div className="absolute bottom-[30%] left-[20%] w-12 h-10 bg-gray-700/20 rounded-full blur-sm" />
              </div>
            </div>

            {/* Floating particles */}
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1 h-1 bg-blue-400/40 rounded-full animate-float"
                  style={{
                    left: `${15 + (i * 7) % 70}%`,
                    top: `${10 + (i * 11) % 60}%`,
                    animationDelay: `${i * 0.4}s`,
                    animationDuration: `${4 + (i % 3)}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Scroll indicator - only show when hero is fully visible */}
        {opacity > 0.8 && (
          <div 
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-auto"
            style={{
              animation: 'bounce 2s ease-in-out infinite',
            }}
          >
            <span className="text-xs text-gray-600 font-medium tracking-widest">SCROLL</span>
            <svg 
              className="w-4 h-4 text-gray-700" 
              fill="none" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth="2" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        )}
      </div>
    </section>
  );
}