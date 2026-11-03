"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Menu, X, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";

const navLinks = [
  { name: "Features", href: "#features" },
  { name: "Capabilities", href: "#integrations" },
  { name: "Security", href: "#security" },
  { name: "Pricing", href: "#pricing" },
];

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileMenuOpen]);

  return (
    <header
      className={`fixed z-50 transition-all duration-500 ${
        isMobileMenuOpen
          ? "top-0 left-0 right-0 bottom-0"
          : isScrolled
          ? "top-4 left-4 right-4"
          : "top-0 left-0 right-0"
      }`}
    >
      <nav
        className={`mx-auto transition-all duration-500 ${
          isScrolled && !isMobileMenuOpen
            ? "bg-background/80 backdrop-blur-xl border border-foreground/10 rounded-2xl shadow-lg max-w-[1200px]"
            : "bg-transparent max-w-[1400px]"
        }`}
      >
        <div
          className={`flex items-center justify-between transition-all duration-500 px-6 lg:px-8 ${
            isScrolled && !isMobileMenuOpen ? "h-14" : "h-20"
          }`}
        >
          {/* Logo */}
          <a href="#" className="flex items-center gap-2.5 group">
            {/* Dark mode icon */}
            <Image
              src="/cortex_icon.png"
              alt="Cortex Logo"
              width={26}
              height={26}
              className="rounded-md object-contain hidden dark:block"
            />
            {/* Light mode icon */}
            <Image
              src="/cortex-iconb.png"
              alt="Cortex Logo"
              width={26}
              height={26}
              className="rounded-md object-contain block dark:hidden"
            />
            <span
              className={`font-display tracking-tight transition-all duration-500 ${
                isScrolled ? "text-xl" : "text-2xl"
              }`}
            >
              Cortex
            </span>
            <span
              className={`text-muted-foreground font-mono transition-all duration-500 ${
                isScrolled ? "text-[10px] mt-0.5" : "text-xs mt-1"
              }`}
            >
              TM
            </span>
          </a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-10">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-sm text-foreground/70 hover:text-foreground transition-colors duration-300 relative group"
              >
                {link.name}
                <span className="absolute -bottom-1 left-0 w-0 h-px bg-foreground transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 text-foreground/70 hover:text-foreground transition-colors rounded-full hover:bg-foreground/5"
              aria-label="Toggle theme"
            >
              {mounted && theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <a
              href="/login"
              className={`text-foreground/70 hover:text-foreground transition-all duration-500 ${
                isScrolled ? "text-xs" : "text-sm"
              }`}
            >
              Sign in
            </a>
            <a href="/register">
              <Button
                size="sm"
                className={`bg-foreground hover:bg-foreground/90 text-background rounded-full transition-all duration-500 ${
                  isScrolled ? "px-4 h-8 text-xs" : "px-6"
                }`}
              >
                Get started
              </Button>
            </a>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 text-foreground/70 hover:text-foreground transition-colors rounded-full hover:bg-foreground/5"
              aria-label="Toggle theme"
            >
              {mounted && theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-foreground hover:bg-foreground/5 rounded-lg"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu - Full Screen Overlay */}
      <div
        className={`md:hidden fixed inset-0 bg-background/95 backdrop-blur-2xl z-50 transition-all duration-300 flex flex-col justify-between ${
          isMobileMenuOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Mobile Header Bar with prominent Close Cross */}
        <div className="flex items-center justify-between px-6 h-20 border-b border-foreground/10 shrink-0">
          <a
            href="#"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-2.5"
          >
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
            <span className="font-display tracking-tight text-2xl">Cortex</span>
            <span className="text-muted-foreground font-mono text-xs mt-1">TM</span>
          </a>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2.5 text-foreground/70 hover:text-foreground transition-colors rounded-full hover:bg-foreground/5"
              aria-label="Toggle theme"
            >
              {mounted && theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2.5 text-foreground hover:text-foreground hover:bg-foreground/10 rounded-full transition-colors border border-foreground/10"
              aria-label="Close menu"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 flex flex-col justify-center px-8 gap-6 overflow-y-auto">
          {navLinks.map((link, i) => (
            <a
              key={link.name}
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`text-4xl font-display text-foreground hover:text-muted-foreground transition-all duration-300 ${
                isMobileMenuOpen
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }`}
              style={{ transitionDelay: isMobileMenuOpen ? `${i * 60}ms` : "0ms" }}
            >
              {link.name}
            </a>
          ))}
        </div>

        {/* Bottom CTAs */}
        <div className="p-8 border-t border-foreground/10 shrink-0">
          <div className="flex gap-4">
            <a href="/login" className="flex-1">
              <Button
                variant="outline"
                className="w-full rounded-full h-12 text-base"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Sign in
              </Button>
            </a>
            <a href="/register" className="flex-1">
              <Button
                className="w-full bg-foreground text-background rounded-full h-12 text-base"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Get started
              </Button>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
