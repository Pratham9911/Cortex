"use client";

import React, { useEffect, useState, useRef } from "react";
import { Shield } from "lucide-react";
import { RevealText } from "@/components/reveal-text";

// ─── Intersection Observer hook ──────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// ─── Bento card ──────────────────────────────────────────────────────────────
function BentoCard({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, inView } = useInView(0.1);

  const handleMouse = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouse}
      className={`group relative rounded-2xl border border-border bg-card overflow-hidden transition-all duration-700 hover:border-border/80 hover:bg-card/80 ${className}`}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms, border-color 0.3s ease, background-color 0.3s ease`,
      }}
    >
      {/* Hover glow spot */}
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: "radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.03), transparent 60%)" }}
      />
      {children}
    </div>
  );
}

// ─── Pill tag ─────────────────────────────────────────────────────────────────
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-widest font-sans text-muted-foreground bg-foreground/[0.04]">
      {children}
    </span>
  );
}

export function InfrastructureSection() {
  return (
    <section id="security" className="py-32 px-6 md:px-12 lg:px-20 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="mb-16">
          <div className="w-10 h-10 flex items-center justify-center border border-border/40 rounded-xl mb-4 bg-background">
             <Shield className="w-5 h-5 text-foreground" />
          </div>
          <div className="mt-4"><Tag>SECURITY</Tag></div>
          <RevealText className="mt-5 text-4xl md:text-5xl font-light tracking-tight leading-[1.05]">
            {"Enterprise-grade\nfrom day one."}
          </RevealText>
        </div>

        {/* Asymmetric grid: left text + title, right interactive audit log */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left side — descriptions */}
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every action is logged, every decision is traceable. Built for teams that need compliance without compromise.
            </p>

            <div className="space-y-4">
              {[
                { label: "SOC 2 Type II", desc: "Independently audited security controls" },
                { label: "Full Audit Trail", desc: "Every decision logged with full traceability" },
                { label: "Real-time Observability", desc: "Monitor, debug, and replay any execution" },
              ].map((item) => (
                <div key={item.label} className="flex gap-4">
                  <div className="w-1 bg-foreground/10 rounded-full shrink-0" />
                  <div>
                    <h3 className="text-sm font-light mb-1">{item.label}</h3>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Compliance badges — vertical stack */}
            <div className="pt-4 flex flex-col gap-2">
              {["SOC 2", "GDPR", "HIPAA Ready", "ISO 27001"].map((badge) => (
                <div key={badge} className="flex items-center gap-2 text-xs text-muted-foreground/60">
                  <span className="w-1 h-1 rounded-full bg-foreground/25" />
                  {badge}
                </div>
              ))}
            </div>
          </div>

          {/* Right side — live audit log visualization */}
          <BentoCard className="p-6 lg:row-span-1" delay={0}>
            <div className="text-xs text-muted-foreground tracking-widest uppercase mb-4">Live Audit Trail</div>
            <div className="space-y-2">
              {[
                { time: "12:34:21", action: "agent_executed", status: "success" },
                { time: "12:34:18", action: "decision_logged", status: "success" },
                { time: "12:34:15", action: "tool_called", status: "success" },
                { time: "12:34:12", action: "memory_updated", status: "success" },
                { time: "12:34:09", action: "output_generated", status: "success" },
              ].map((log, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-foreground/[0.02] hover:bg-foreground/[0.04] transition-colors border border-border/50 group cursor-pointer"
                  style={{
                    animation: `fadeInUp 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 80 + 200}ms both`,
                  }}
                >
                  <span className="text-[10px] text-muted-foreground font-mono min-w-[60px]">{log.time}</span>
                  <span className="text-[11px] text-muted-foreground/80 font-light flex-1">{log.action}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500/60 group-hover:bg-green-500 transition-colors" />
                </div>
              ))}
            </div>
            <style>{`
              @keyframes fadeInUp {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
