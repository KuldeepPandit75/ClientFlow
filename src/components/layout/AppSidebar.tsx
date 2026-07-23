"use client";

import { NavLink } from "@/components/NavLink";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  Files,
  MessageSquare,
  Send,
  Users,
  Settings,
  LogOut,
  User,
  Zap,
} from "lucide-react";
import { apiGet, apiSend } from "@/lib/api/client";
import { BrandLogo } from "@/components/BrandLogo";
import type { MemberPermission } from "@/lib/backend/types";

const roleNavItems = {
  super_admin: [
    { title: "Overview", url: "/super-admin", icon: BarChart3 },
    { title: "Businesses", url: "/super-admin/businesses", icon: Building2 },
    { title: "Admins", url: "/super-admin/admins", icon: Users },
    { title: "WhatsApp Sessions", url: "/super-admin/whatsapp-sessions", icon: MessageSquare },
    { title: "Payments", url: "/super-admin/payment-settings", icon: CreditCard },
    { title: "Logs", url: "/super-admin/logs", icon: FileText },
  ],
  admin: [
    { title: "Inbox", url: "/inbox", icon: MessageSquare },
    { title: "Customers", url: "/customers", icon: Users },
    { title: "Automation", url: "/automation", icon: Zap },
    { title: "Knowledge", url: "/knowledge", icon: Files },
    { title: "Templates", url: "/templates", icon: FileText },
    { title: "Bulk Messaging", url: "/bulk-messaging", icon: Send },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Team", url: "/team", icon: User },
    { title: "Settings", url: "/settings", icon: Settings },
    { title: "Billing", url: "/billing", icon: CreditCard },
    { title: "Profile", url: "/profile", icon: User },
  ],
  sub_agent: [
    { title: "Inbox", url: "/inbox", icon: MessageSquare },
    { title: "Assigned Customers", url: "/customers", icon: Users },
    { title: "Automation", url: "/automation", icon: Zap, permission: "automation.manage" as MemberPermission },
    { title: "Knowledge", url: "/knowledge", icon: Files, permission: "knowledge.manage" as MemberPermission },
    { title: "Templates", url: "/templates", icon: FileText, permission: "template.manage" as MemberPermission },
    { title: "Bulk Messaging", url: "/bulk-messaging", icon: Send, permission: "bulk.send" as MemberPermission },
    { title: "Analytics", url: "/analytics", icon: BarChart3, permission: "analytics.view" as MemberPermission },
    { title: "Team", url: "/team", icon: User, permission: "team.manage" as MemberPermission },
    { title: "Profile", url: "/profile", icon: User },
  ],
};

interface AppSidebarProps {
  className?: string;
}

export function AppSidebar({ className = "" }: AppSidebarProps) {
  const pathname = usePathname() ?? "";
  const [user, setUser] = useState<{ name: string; role: keyof typeof roleNavItems; permissions: MemberPermission[] } | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const data = await apiGet<{ name: string; role: keyof typeof roleNavItems; permissions: MemberPermission[] } | null>("/api/auth/me");
        if (!data) {
          window.location.href = "/login";
          return;
        }
        setUser(data);
      } catch {
        window.location.href = "/login";
      }
    }

    void loadUser();
  }, []);

  const handleLogout = async () => {
    try {
      await apiSend("/api/auth/logout", "POST");
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <aside className={`flex flex-col w-[240px] min-h-screen bg-sidebar border-r border-sidebar-border ${className}`}>
      <div className="flex items-center gap-3 px-6 py-6">
        <BrandLogo
          iconClassName="h-10 w-10"
          textClassName="font-display text-lg font-bold tracking-tight text-sidebar-accent-foreground"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-2 space-y-1">
        {(user ? roleNavItems[user.role] || roleNavItems.admin : [])
          .filter((item) => !("permission" in item) || user?.role === "admin" || user?.permissions.includes(item.permission as MemberPermission))
          .map((item) => {
          const isActive = pathname === item.url ||
          item.url !== "/" && pathname.startsWith(item.url);
          return (
            <NavLink
              key={item.title}
              href={item.url}
              end={item.url === "/"}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
              isActive ?
              "" :
              "text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"}`
              }
              activeClassName="bg-primary text-primary-foreground shadow-sm">
              
              <item.icon className="w-[18px] h-[18px]" />
              <span className="font-medium">{item.title}</span>
            </NavLink>);

        })}
      </nav>

      {/* User */}
      <div className="px-4 py-5 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2">
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-foreground text-xs font-bold">
            {user?.name?.split(" ").map((part) => part[0]).join("").slice(0, 2) || "NA"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-accent-foreground truncate">{user?.name || "Guest"}</p>
            <p className="text-xs text-sidebar-foreground truncate">{user?.role || "User"}</p>
          </div>
          <button onClick={handleLogout} className="text-sidebar-foreground hover:text-destructive transition-colors p-1 rounded-lg hover:bg-secondary">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>);

}
