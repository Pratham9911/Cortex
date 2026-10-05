"use client";

import { useEffect, useState, useRef } from "react";

const capabilities = [
  { name: "Documents", category: "Project knowledge" },
  { name: "Team Knowledge", category: "Shared organizational context" },
  { name: "Discussions", category: "Team conversations" },
  { name: "Cortex Agent", category: "AI-powered assistance" },
  { name: "Web Search", category: "External research" },
  { name: "Decisions", category: "Organizational memory" },
  { name: "Teams", category: "Team-based access" },
  { name: "Tasks", category: "Team work tracking" },
  { name: "Sources", category: "Explainable answers" },
  { name: "RAG Search", category: "Context-aware retrieval" },
  { name: "GitHub", category: "Code and repository context" },
  { name: "Gmail", category: "Email assistance" },
];

export function IntegrationsSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="integrations" ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div
          className={`text-center max-w-3xl mx-auto mb-16 lg:mb-24 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Cortex capabilities
            <span className="w-8 h-px bg-foreground/30" />
          </span>
          <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-6">
            Knowledge that works
            <br />
            with your team.
          </h2>
          <p className="text-xl text-muted-foreground">
            From documents to discussions to decisions — Cortex keeps your team&apos;s context connected and accessible.
          </p>
        </div>

      </div>
      
      {/* Full-width marquees outside container */}
      <div className="w-full mb-6">
        <div className="flex gap-6 marquee-reverse">
          {[...Array(2)].map((_, setIndex) => (
            <div key={setIndex} className="flex gap-6 shrink-0">
              {capabilities.map((capability) => (
                <div
                  key={`${capability.name}-${setIndex}`}
                  className="shrink-0 px-8 py-6 border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/[0.02] transition-all duration-300 group"
                >
                  <div className="text-lg font-medium group-hover:translate-x-1 transition-transform">
                    {capability.name}
                  </div>
                  <div className="text-sm text-muted-foreground">{capability.category}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      
      {/* Reverse marquee */}
      <div className="w-full">
        <div className="flex gap-6 marquee">
          {[...Array(2)].map((_, setIndex) => (
            <div key={setIndex} className="flex gap-6 shrink-0">
              {[...capabilities].reverse().map((capability) => (
                <div
                  key={`${capability.name}-reverse-${setIndex}`}
                  className="shrink-0 px-8 py-6 border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/[0.02] transition-all duration-300 group"
                >
                  <div className="text-lg font-medium group-hover:translate-x-1 transition-transform">
                    {capability.name}
                  </div>
                  <div className="text-sm text-muted-foreground">{capability.category}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
