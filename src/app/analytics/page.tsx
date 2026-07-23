"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api/client";

export default function AnalyticsPage() {
  const [data, setData] = useState<null | {
    totalChats: number;
    openChats: number;
    closedChats: number;
    assignedChats: number;
    unassignedChats: number;
    messageVolume: number;
    aiHandled: number;
    humanHandled: number;
  }>(null);

  useEffect(() => {
    apiGet<typeof data>("/api/analytics/overview").then((d) => setData(d)).catch(() => {});
  }, []);

  return (
    <DashboardLayout title="Analytics">
      <div className="p-5 md:p-8">
        {!data ? (
          <div className="text-sm text-muted-foreground">Loading analytics...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {Object.entries(data).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="text-xl font-semibold mt-1">{v}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
