"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet } from "@/lib/api/client";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, SkipForward, Clock, AlertCircle, Loader2 } from "lucide-react";

interface LogItem {
  id: string; automationId: string; automationName: string;
  customerId: string; customerName?: string; triggerType: string;
  status: string; actionCount: number; error?: string;
  startedAt: string; finishedAt?: string; createdAt: string;
  conditionResults?: Array<{ conditionId: string; type: string; passed: boolean; reason?: string }>;
  actionResults?: Array<{ actionId: string; type: string; status: string; error?: string }>;
}

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  success: CheckCircle2, failed: XCircle, skipped: SkipForward, running: Loader2,
};
const STATUS_COLOR: Record<string, string> = {
  success: "text-emerald-600", failed: "text-red-500", skipped: "text-amber-600", running: "text-blue-500",
};

function AutomationLogsContent() {
  const searchParams = useSearchParams();
  const automationId = searchParams?.get("automationId") || undefined;
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (automationId) params.set("automationId", automationId);
    params.set("limit", "50");

    apiGet<{ items: LogItem[]; total: number }>(`/api/automations/logs?${params.toString()}`)
      .then((data) => { setLogs(data.items); setTotal(data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [automationId]);

  return (
    <DashboardLayout title="Automation Logs">
      <div className="p-5 md:p-8 max-w-6xl mx-auto animate-fade-in">
        <Link href="/automation" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Automations
        </Link>
        <div className="mb-6">
          <h2 className="text-2xl font-display font-bold">Execution Logs</h2>
          <p className="text-sm text-muted-foreground mt-1">{total} total execution{total !== 1 ? "s" : ""}{automationId ? " for this automation" : ""}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">No automation logs yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const StatusIcon = STATUS_ICON[log.status] || AlertCircle;
              const color = STATUS_COLOR[log.status] || "text-gray-500";
              const isExpanded = expandedId === log.id;
              return (
                <div key={log.id} className="bg-card rounded-xl border border-border overflow-hidden">
                  <button onClick={() => setExpandedId(isExpanded ? null : log.id)} className="w-full text-left p-4 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <StatusIcon className={`w-5 h-5 shrink-0 ${color} ${log.status === "running" ? "animate-spin" : ""}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{log.automationName}</span>
                          <span className="text-xs text-muted-foreground">→</span>
                          <span className="text-sm text-muted-foreground truncate">{log.customerName || log.customerId}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{log.triggerType.replace(/_/g, " ")}</span>
                          <span>•</span>
                          <span>{log.actionCount} action{log.actionCount !== 1 ? "s" : ""}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(log.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-lg ${log.status === "success" ? "bg-emerald-500/10 text-emerald-600" : log.status === "failed" ? "bg-red-500/10 text-red-500" : log.status === "skipped" ? "bg-amber-500/10 text-amber-600" : "bg-blue-500/10 text-blue-500"}`}>
                        {log.status}
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border pt-3 space-y-3 animate-fade-in">
                      {log.error && <div className="text-sm text-destructive bg-destructive/5 rounded-lg p-3"><strong>Error:</strong> {log.error}</div>}
                      {log.conditionResults && log.conditionResults.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-2 text-muted-foreground">Conditions</p>
                          {log.conditionResults.map((c, i) => (
                            <div key={i} className="text-xs flex items-center gap-2 py-1">
                              {c.passed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                              <span>{c.type}</span><span className="text-muted-foreground">{c.reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {log.actionResults && log.actionResults.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-2 text-muted-foreground">Actions</p>
                          {log.actionResults.map((a, i) => (
                            <div key={i} className="text-xs flex items-center gap-2 py-1">
                              {a.status === "success" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                              <span>{a.type.replace(/_/g, " ")}</span>
                              {a.error && <span className="text-destructive">— {a.error}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Duration: {log.finishedAt ? `${((new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime()) / 1000).toFixed(2)}s` : "—"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function AutomationLogsPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout title="Automation Logs">
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        </DashboardLayout>
      }
    >
      <AutomationLogsContent />
    </Suspense>
  );
}
