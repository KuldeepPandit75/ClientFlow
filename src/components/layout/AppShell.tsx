"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Menu } from "lucide-react";

interface DashboardShellContextValue {
  setTitle: (title: string) => void;
}

const DashboardShellContext = createContext<DashboardShellContextValue | null>(null);

const dashboardPaths = [
  "/dashboard",
  "/inbox",
  "/customers",
  "/team",
  "/settings",
  "/automation",
  "/analytics",
  "/billing",
  "/profile",
  "/super-admin",
];

function isDashboardPath(pathname: string) {
  return dashboardPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function titleFromPath(pathname: string) {
  if (pathname.startsWith("/super-admin/whatsapp-sessions")) return "WhatsApp Sessions";
  if (pathname.startsWith("/super-admin/businesses")) return "Businesses";
  if (pathname.startsWith("/super-admin/users")) return "Users";
  if (pathname.startsWith("/super-admin/logs")) return "Logs";
  if (pathname.startsWith("/super-admin")) return "Super Admin";
  const segment = pathname.split("/").filter(Boolean)[0] || "Dashboard";
  return segment.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function useDashboardShell(title?: string) {
  const context = useContext(DashboardShellContext);

  useEffect(() => {
    if (context && title) context.setTitle(title);
  }, [context, title]);

  return context;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [title, setTitle] = useState("");
  const contextValue = useMemo(() => ({ setTitle }), []);
  const showDashboardShell = isDashboardPath(pathname);
  const currentTitle = title || titleFromPath(pathname);

  if (!showDashboardShell) return <>{children}</>;

  return (
    <DashboardShellContext.Provider value={contextValue}>
      <div className="flex min-h-screen w-full bg-background grid-bg">
        <AppSidebar className="hidden md:flex" />

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-[240px] h-full animate-slide-in">
              <AppSidebar />
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center gap-4 px-5 md:px-8 border-b border-border bg-card/80 backdrop-blur-sm">
            <button
              className="md:hidden p-2 rounded-xl hover:bg-secondary transition-colors"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <BrandLogo showText={false} iconClassName="h-8 w-8 rounded-xl p-1" className="md:hidden" />
            {currentTitle && <h1 className="font-display text-xl font-bold tracking-tight uppercase">{currentTitle}</h1>}
          </header>

          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </DashboardShellContext.Provider>
  );
}
