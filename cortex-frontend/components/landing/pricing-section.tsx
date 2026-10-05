"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

type PricingPlan = {
  name: string;
  max_projects: number | null;
  daily_token_limit: number | null;
  daily_request_limit: number | null;
  max_members: number | null;
  max_storage_mb: number | null;
  max_teams: number | null;
  max_documents: number | null;
};

function isPricingPlan(value: unknown): value is PricingPlan {
  if (typeof value !== "object" || value === null) return false;

  const isNullableNonnegativeInteger = (field: unknown) =>
    field === null ||
    (typeof field === "number" && Number.isSafeInteger(field) && field >= 0);

  return (
    "name" in value &&
    typeof value.name === "string" &&
    "max_projects" in value &&
    isNullableNonnegativeInteger(value.max_projects) &&
    "daily_token_limit" in value &&
    isNullableNonnegativeInteger(value.daily_token_limit) &&
    "daily_request_limit" in value &&
    isNullableNonnegativeInteger(value.daily_request_limit) &&
    "max_members" in value &&
    isNullableNonnegativeInteger(value.max_members) &&
    "max_storage_mb" in value &&
    isNullableNonnegativeInteger(value.max_storage_mb) &&
    "max_teams" in value &&
    isNullableNonnegativeInteger(value.max_teams) &&
    "max_documents" in value &&
    isNullableNonnegativeInteger(value.max_documents)
  );
}

function isPricingResponse(value: unknown): value is { plans: PricingPlan[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "plans" in value &&
    Array.isArray(value.plans) &&
    value.plans.every(isPricingPlan)
  );
}

const formatCount = (value: number | null) =>
  value === null ? "—" : value.toLocaleString();

const formatTokens = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("en", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);

const formatStorage = (value: number | null) => {
  if (value === null) return "—";
  if (value >= 1024) {
    return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value / 1024)} GB`;
  }
  return `${value.toLocaleString()} MB`;
};

function getPlanFeatures(plan: PricingPlan) {
  return [
    plan.max_projects !== null && `Projects: ${formatCount(plan.max_projects)}`,
    plan.daily_token_limit !== null && `Daily AI tokens: ${formatTokens(plan.daily_token_limit)}`,
    plan.daily_request_limit !== null && `AI requests/day: ${formatCount(plan.daily_request_limit)}`,
    plan.max_storage_mb !== null && `Project storage: ${formatStorage(plan.max_storage_mb)}`,
    plan.max_teams !== null && `Teams/project: ${formatCount(plan.max_teams)}`,
    plan.max_members !== null && `Members/project: ${formatCount(plan.max_members)}`,
    plan.max_documents !== null && `Documents/project: ${formatCount(plan.max_documents)}`,
  ].filter((feature): feature is string => feature !== null && feature !== false);
}

export function PricingSection() {
  const [plans, setPlans] = useState<PricingPlan[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    const controller = new AbortController();

    const loadPlans = async () => {
      try {
        const response = await fetch(`${apiUrl}/public/pricing`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Pricing request failed.");

        const data: unknown = await response.json();
        if (!isPricingResponse(data)) throw new Error("Pricing response was invalid.");

        setPlans(data.plans);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setHasError(true);
      }
    };

    void loadPlans();
    return () => controller.abort();
  }, [apiUrl]);

  return (
    <section id="pricing" className="relative py-32 lg:py-40 border-t border-foreground/10">
      <div className="max-w-5xl mx-auto px-6 lg:px-12">
        <div className="max-w-3xl mb-20">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-6">
            Pricing
          </span>
          <h2 className="font-display text-5xl md:text-6xl lg:text-7xl tracking-tight text-foreground mb-6">
            Simple, transparent
            <br />
            <span className="text-stroke">pricing</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl">
            Start free with Cortex. Pro features are coming soon.
          </p>
        </div>

        {hasError ? (
          <p role="alert" className="text-sm text-muted-foreground">
            Pricing plans are unavailable right now.
          </p>
        ) : plans === null ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading pricing plans…
          </p>
        ) : plans.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            No pricing plans are currently available.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 gap-px bg-foreground/10">
            {plans.map((plan, index) => {
              const isPro = plan.name.toLowerCase() === "pro";
              const features = getPlanFeatures(plan);

              return (
                <div
                  key={plan.name}
                  className={`relative p-8 lg:p-12 bg-background ${
                    isPro ? "md:-my-4 md:py-12 lg:py-16 border-2 border-foreground" : ""
                  }`}
                >
                  {isPro && (
                    <span className="absolute -top-3 left-8 px-3 py-1 bg-foreground text-primary-foreground text-xs font-mono uppercase tracking-widest">
                      Coming Soon
                    </span>
                  )}

                  <div className="mb-8">
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-display text-3xl text-foreground mt-2">{plan.name.toUpperCase()}</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      {!isPro && "Start free with Cortex."}
                    </p>
                  </div>

                  <ul className="space-y-4 mb-10">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="w-4 h-4 text-foreground mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {!isPro && (
                    <Link
                      href="/login"
                      className="w-full py-4 flex items-center justify-center gap-2 text-sm font-medium transition-all group bg-foreground text-primary-foreground hover:bg-foreground/90"
                    >
                      Start for free
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
