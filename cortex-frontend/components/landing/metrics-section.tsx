"use client";

import { useEffect, useState, useRef } from "react";

type GlobalMetrics = {
  total_ai_requests: number;
  total_projects_created: number;
  total_teams_created: number;
  total_documents_uploaded: number;
  total_decisions_made: number;
  total_tokens: number;
};

function isGlobalMetrics(value: unknown): value is GlobalMetrics {
  return (
    typeof value === "object" &&
    value !== null &&
    "total_ai_requests" in value &&
    typeof value.total_ai_requests === "number" &&
    Number.isSafeInteger(value.total_ai_requests) &&
    value.total_ai_requests >= 0 &&
    "total_projects_created" in value &&
    typeof value.total_projects_created === "number" &&
    Number.isSafeInteger(value.total_projects_created) &&
    value.total_projects_created >= 0 &&
    "total_teams_created" in value &&
    typeof value.total_teams_created === "number" &&
    Number.isSafeInteger(value.total_teams_created) &&
    value.total_teams_created >= 0 &&
    "total_documents_uploaded" in value &&
    typeof value.total_documents_uploaded === "number" &&
    Number.isSafeInteger(value.total_documents_uploaded) &&
    value.total_documents_uploaded >= 0 &&
    "total_decisions_made" in value &&
    typeof value.total_decisions_made === "number" &&
    Number.isSafeInteger(value.total_decisions_made) &&
    value.total_decisions_made >= 0 &&
    "total_tokens" in value &&
    typeof value.total_tokens === "number" &&
    Number.isSafeInteger(value.total_tokens) &&
    value.total_tokens >= 0
  );
}

function AnimatedCounter({ end, suffix = "", prefix = "" }: { end: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          let start = 0;
          const duration = 2000;
          const startTime = performance.now();

          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));

            if (progress < 1) {
              requestAnimationFrame(animate);
            }
          };

          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, hasAnimated]);

  return (
    <div ref={ref} className="text-5xl lg:text-6xl font-display tracking-tight">
      {prefix}{count.toLocaleString()}{suffix}
    </div>
  );
}

export function MetricsSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [metrics, setMetrics] = useState<{ value: number; label: string }[] | null>(null);
  const [metricsError, setMetricsError] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL!;

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

  useEffect(() => {
    const controller = new AbortController();

    const loadMetrics = async () => {
      try {
        const response = await fetch(`${apiUrl}/public/metrics`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error("Metrics request failed.");
        }
        const data: unknown = await response.json();
        if (!isGlobalMetrics(data)) {
          throw new Error("Metrics response was invalid.");
        }
        setMetrics([
          { value: data.total_ai_requests, label: "AI requests handled" },
          { value: data.total_projects_created, label: "Projects created" },
          { value: data.total_teams_created, label: "Teams created" },
          { value: data.total_documents_uploaded, label: "Documents uploaded" },
          { value: data.total_decisions_made, label: "Decisions made" },
          { value: data.total_tokens, label: "AI tokens used" },
        ]);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setMetricsError(true);
      }
    };

    void loadMetrics();
    return () => controller.abort();
  }, [apiUrl]);

  return (
    <section id="studio" ref={sectionRef} className="relative py-24 lg:py-32 border-y border-foreground/10">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-16 lg:mb-24">
          <div>
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-foreground/30" />
              Cortex-wide totals
            </span>
            <h2
              className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              Performance you
              <br />
              can measure.
            </h2>
          </div>
          <div className="font-mono text-sm text-muted-foreground">
            All-time totals
          </div>
        </div>
        
        {/* Metrics Grid */}
        {metricsError ? (
          <p role="alert" className="text-sm text-muted-foreground">
            Cortex-wide metrics are unavailable right now.
          </p>
        ) : metrics ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-foreground/10">
            {metrics.map((metric, index) => (
              <div
                key={metric.label}
                className={`bg-background p-6 lg:p-8 transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <AnimatedCounter end={metric.value} />
                <div className="mt-4 text-lg text-muted-foreground">{metric.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading Cortex-wide metrics…
          </p>
        )}
      </div>
    </section>
  );
}
