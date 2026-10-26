"use client";

import { useState, useCallback, useEffect } from "react";
import { Navigation } from "@/components/landing/navigation";
import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { InfrastructureSection } from "@/components/landing/infrastructure-section";
import { MetricsSection } from "@/components/landing/metrics-section";
import { IntegrationsSection } from "@/components/landing/integrations-section";
import { SecuritySection } from "@/components/landing/security-section";
import { DevelopersSection } from "@/components/landing/developers-section";
import { TestimonialsSection } from "@/components/landing/testimonials-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { CtaSection } from "@/components/landing/cta-section";
import { FooterSection } from "@/components/landing/footer-section";
import { IntroAnimation } from "@/components/intro-animation";
import { wakeBackend } from "@/lib/wake-ingestion-worker";

export default function Home() {
  const [heroReady, setHeroReady] = useState(false);
  const handleIntroDone = useCallback(() => {
    setHeroReady(true);
  }, []);

  // Wake the Render backend as soon as the landing page loads.
  // Fire-and-forget — polls / every 10 s up to 12 times (2 min max).
  useEffect(() => { wakeBackend() }, []);

  return (
    <main className="relative min-h-screen overflow-x-hidden noise-overlay">
      <IntroAnimation onDone={handleIntroDone} />
      <Navigation />
      <HeroSection isReady={heroReady} />
      <FeaturesSection />
      {/* <HowItWorksSection /> */}
      <InfrastructureSection />
      <MetricsSection />
      <IntegrationsSection />
      <SecuritySection />
      {/* <DevelopersSection /> */}
      {/* <TestimonialsSection /> */}
      <PricingSection />
      <CtaSection />
      <FooterSection />
    </main>
  );
}
