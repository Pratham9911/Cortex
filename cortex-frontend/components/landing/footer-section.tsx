"use client";

import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { AnimatedWave } from "./animated-wave";

const footerLinks = {
  Product: [
    { name: "Features", href: "#features" },
    { name: "Capabilities", href: "#integrations" },
    { name: "Live Audit Trail", href: "#audit" },
    { name: "Security & RBAC", href: "#security" },
    { name: "Pricing", href: "#pricing" },
  ],
  "System Architecture": [
    { name: "Hybrid Retrieval (RRF)", href: "#features" },
    { name: "Semantic Vector Search", href: "#features" },
    { name: "Source-Aware Citations", href: "#security" },
    { name: "Multi-Agent Workflows", href: "#integrations" },
  ],
  Workspace: [
    { name: "Sign In", href: "/login" },
    { name: "Get Started", href: "/register" },
    {
      name: "GitHub Repository",
      href: "https://github.com/Pratham9911/Cortex",
      external: true,
    },
  ],
};

const socialLinks = [
  { name: "GitHub", href: "https://github.com/Pratham9911/Cortex" },
];

export function FooterSection() {
  return (
    <footer className="relative border-t border-foreground/10 bg-background/50">
      {/* Animated wave background */}
      <div className="absolute inset-0 h-64 opacity-15 pointer-events-none overflow-hidden">
        <AnimatedWave />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Main Footer */}
        <div className="py-16 lg:py-20">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-12 lg:gap-12">
            {/* Brand Column */}
            <div className="md:col-span-2">
              <a href="#" className="inline-flex items-center gap-2.5 mb-6 group">
                {/* Dark mode icon */}
                <Image
                  src="/cortex_icon.png"
                  alt="Cortex Logo"
                  width={28}
                  height={28}
                  className="rounded-md object-contain hidden dark:block"
                />
                {/* Light mode icon */}
                <Image
                  src="/cortex-iconb.png"
                  alt="Cortex Logo"
                  width={28}
                  height={28}
                  className="rounded-md object-contain block dark:hidden"
                />
                <span className="text-2xl font-display">Cortex</span>
                <span className="text-xs text-muted-foreground font-mono">TM</span>
              </a>

              <p className="text-muted-foreground leading-relaxed mb-8 max-w-sm text-sm">
                Internal AI system for organizing team knowledge, retrieving relevant context, generating grounded answers, and preserving decisions with source-aware AI.
              </p>

              {/* Social / Repo Links */}
              <div className="flex gap-6">
                {socialLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group"
                  >
                    {link.name}
                    <ArrowUpRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </a>
                ))}
              </div>
            </div>

            {/* Link Columns */}
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="text-sm font-semibold tracking-wide mb-6">{title}</h3>
                <ul className="space-y-3.5">
                  {links.map((link) => (
                    <li key={link.name}>
                      <a
                        href={link.href}
                        {...("external" in link && link.external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 group"
                      >
                        {link.name}
                        {"external" in link && link.external && (
                          <ArrowUpRight className="w-3 h-3 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-8 border-t border-foreground/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Cortex. Internal AI Knowledge & Decision System.
          </p>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
