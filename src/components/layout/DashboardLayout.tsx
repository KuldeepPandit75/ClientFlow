"use client";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { BrandLogo } from "@/components/BrandLogo";
import { Menu } from "lucide-react";
import { useState } from "react";
import { useDashboardShell } from "@/components/layout/AppShell";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function DashboardLayout({ children, title }: DashboardLayoutProps) {
  const shell = useDashboardShell(title);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (shell) return <>{children}</>;

  return (
    <div className="flex min-h-screen w-full bg-background grid-bg">
      <AppSidebar className="hidden md:flex" />
      
      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-[240px] h-full animate-slide-in">
            <AppSidebar />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center gap-4 px-5 md:px-8 border-b border-border bg-card/80 backdrop-blur-sm">
          <button
            className="md:hidden p-2 rounded-xl hover:bg-secondary transition-colors"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <BrandLogo showText={false} iconClassName="h-8 w-8 rounded-xl p-1" className="md:hidden" />
          {title && <h1 className="font-display text-xl font-bold tracking-tight uppercase">{title}</h1>}
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
