"use client";

import { useEffect, useState } from "react";
import { Building2, Mail, Shield, User } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api/client";
import type { SessionUser } from "@/lib/backend/types";

interface ProfileData {
  user: SessionUser;
  business: {
    id: string;
    name: string;
    plan: string;
    status: string;
    ownerName: string | null;
    ownerEmail: string | null;
    createdAt: string;
  } | null;
  stats: {
    assignedCustomers: number;
    totalAgents: number;
  };
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value || "-"}</p>
    </div>
  );
}

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadProfile() {
      try {
        const data = await apiGet<ProfileData>("/api/profile");
        if (mounted) setProfile(data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Profile could not be loaded");
      }
    }
    void loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <DashboardLayout title="Profile">
      <div className="space-y-6 p-5 md:p-8">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-secondary text-lg font-bold">
              {profile?.user.name.split(" ").map((part) => part[0]).join("").slice(0, 2) || <User className="h-5 w-5" />}
            </div>
            <div>
              {profile ? (
                <>
                  <h2 className="font-display text-xl font-bold">{profile.user.name}</h2>
                  <p className="text-sm text-muted-foreground">{profile.user.role.replace("_", " ")} · {profile.user.status}</p>
                </>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-44" />
                  <Skeleton className="h-4 w-32" />
                </div>
              )}
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <h3 className="font-display text-base font-bold uppercase">Account Details</h3>
            </div>
            {profile ? (
              <div className="grid gap-3">
                <InfoRow label="Name" value={profile.user.name} />
                <InfoRow label="Email" value={profile.user.email} />
                <InfoRow label="Role" value={profile.user.role.replace("_", " ")} />
                <InfoRow label="Account status" value={profile.user.status} />
              </div>
            ) : (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20" />)}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <h3 className="font-display text-base font-bold uppercase">Workspace</h3>
            </div>
            {profile ? (
              <div className="grid gap-3">
                <InfoRow label="Business name" value={profile.business?.name} />
                <InfoRow label="Business status" value={profile.business?.status} />
                <InfoRow label="Current plan" value={profile.business?.plan} />
                <InfoRow label="Owner" value={profile.business?.ownerName || profile.business?.ownerEmail} />
              </div>
            ) : (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20" />)}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-5">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <p className="mt-3 text-xs uppercase text-muted-foreground">Business ID</p>
            <p className="mt-1 break-all font-mono text-sm">{profile?.user.businessId || "-"}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs uppercase text-muted-foreground">Assigned customers</p>
            <p className="mt-2 text-3xl font-bold">{profile?.stats.assignedCustomers ?? "-"}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs uppercase text-muted-foreground">Team agents</p>
            <p className="mt-2 text-3xl font-bold">{profile?.stats.totalAgents ?? "-"}</p>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
