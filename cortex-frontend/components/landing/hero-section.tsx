"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { AnimatedSphere } from "./animated-sphere";

export function HeroSection({ isReady = true }: { isReady?: boolean }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isReady) {
      setIsVisible(true);
    }
  }, [isReady]);

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
      {/* Background layer with zoom effect */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: isVisible ? "scale(1)" : "scale(0.85)",
          transition: "transform 2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Animated sphere background */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] lg:w-[800px] lg:h-[800px] opacity-40">
          <AnimatedSphere />
        </div>
        
        {/* Subtle grid lines */}
        <div className="absolute inset-0 overflow-hidden opacity-30">
          {[...Array(8)].map((_, i) => (
            <div
              key={`h-${i}`}
              className="absolute h-px bg-foreground/10"
              style={{
                top: `${12.5 * (i + 1)}%`,
                left: 0,
                right: 0,
              }}
            />
          ))}
          {[...Array(12)].map((_, i) => (
            <div
              key={`v-${i}`}
              className="absolute w-px bg-foreground/10"
              style={{
                left: `${8.33 * (i + 1)}%`,
                top: 0,
                bottom: 0,
              }}
            />
          ))}
        </div>
      </div>
      
      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12 py-32 lg:py-40">
        {/* Eyebrow */}
        <div 
          className={`mb-8 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
            <span className="w-8 h-px bg-foreground/30" />
            The AI Workspace for Intelligent Teams
          </span>
        </div>
        
        {/* Main headline */}
        <div className="mb-12">
          <h1 
            className={`text-[clamp(2.2rem,8vw,6rem)] font-display leading-[0.95] tracking-tight transition-all duration-1000 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <span className="block">Unified knowledge,</span>
            <span className="block">intelligent team</span>
          </h1>
        </div>
        
        {/* Description */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-end">
          <p 
            className={`text-xl lg:text-2xl text-muted-foreground leading-relaxed max-w-xl transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Build, search, connect, and scale AI-powered workflows across your
            team&apos;s documents, tools, and knowledge.
          </p>
          
          {/* CTAs */}
          <div 
            className={`flex flex-col sm:flex-row items-start gap-4 transition-all duration-700 delay-300 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <Button 
              size="lg" 
              className="bg-foreground hover:bg-foreground/90 text-background px-8 h-14 text-base rounded-full group"
            >
              Start free trial
              <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="h-14 px-8 text-base rounded-full border-foreground/20 hover:bg-foreground/5"
            >
              Watch demo
            </Button>
          </div>
        </div>
        
      </div>
      
      {/* Stats marquee - full width outside container */}
      <div 
        className={`absolute bottom-10 left-0 right-0 transition-all duration-700 delay-500 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
      >
  <div className="flex gap-16 marquee whitespace-nowrap">
    {[...Array(2)].map((_, i) => (
      <div key={i} className="flex gap-16">
        {[
          { value: "95%", label: "faster knowledge retrieval", company: "CORTEX" },

          { value: "10x", label: "quicker document search", company: "AI SEARCH" },

          { value: "80%", label: "less manual context switching", company: "WORKSPACES" },

          { value: "24/7", label: "AI-powered assistance", company: "INTELLIGENCE" },
        ].map((stat) => (
          <div
            key={`${stat.company}-${i}`}
            className="flex items-baseline gap-4"
          >
            <span className="text-4xl lg:text-5xl font-display">
              {stat.value}
            </span>

            <span className="text-sm text-muted-foreground">
              {stat.label}

              <span className="block font-mono text-xs mt-1">
                {stat.company}
              </span>
            </span>
          </div>
        ))}
      </div>
    ))}
  </div>
</div>
      
      {/* Scroll indicator */}
      
    </section>
  );
}
