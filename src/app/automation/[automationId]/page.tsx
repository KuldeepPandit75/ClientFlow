"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet } from "@/lib/api/client";
import Link from "next/link";
import {
  Zap, Edit3, ArrowLeft, CheckCircle2, XCircle, SkipForward, Activity, Clock,
  FileText, Filter, Play,
} from "lucide-react";

const TRIGGER_LABELS: Record<string, string> = {
  new_message_received: "New message received",
  new_customer_created: "New customer created",
  first_message_from_customer: "First message from customer",
  keyword_matched: "Keyword matched",
  customer_status_changed: "Customer status changed",
  customer_assigned: "Customer assigned",
  no_reply_after_delay: "No reply after delay",
};

interface AutomationDetail {
  id: string; name: string; description: string; status: string;
  trigger: { type: string; config: Record<string, unknown> };
  conditions: Array<{ id: string; type: string; operator: string; value: unknown }>;
  conditionLogic: string;
  actions: Array<{ id: string; type: string; order: number; config: Record<string, unknown> }>;
  stats: { totalRuns: number; successRuns: number; failedRuns: number; skippedRuns: number; lastRunAt: string | null };
  createdAt: string; updatedAt: string;
}

export default function AutomationDetailPage() {
  const params = useParams();
  const automationId = params?.automationId as string;
  const [automation, setAutomation] = useState<AutomationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!automationId) return;
    apiGet<AutomationDetail>(`/api/automations/${automationId}`)
      .then(setAutomation)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [automationId]);

  if (loading) return <DashboardLayout title="Automation"><div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" /></div></DashboardLayout>;
  if (!automation) return <DashboardLayout title="Automation"><div className="p-8 text-center text-muted-foreground">Automation not found</div></DashboardLayout>;

  const statusColor = automation.status === "active" ? "text-emerald-600 bg-emerald-500/10" : automation.status === "draft" ? "text-amber-600 bg-amber-500/10" : "text-gray-500 bg-gray-500/10";

  return (
    <DashboardLayout title="Automation Detail">
      <div className="p-5 md:p-8 max-w-4xl mx-auto animate-fade-in">
        <Link href="/automation" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Automations
        </Link>

        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-display font-bold">{automation.name}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>{automation.status}</span>
            </div>
            {automation.description && <p className="text-sm text-muted-foreground mt-2">{automation.description}</p>}
          </div>
          <Link href={`/automation/${automationId}/edit`} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all">
            <Edit3 className="w-4 h-4" /> Edit
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Runs", value: automation.stats.totalRuns, icon: Activity, color: "text-violet-600", bg: "bg-violet-500/10" },
            { label: "Success", value: automation.stats.successRuns, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/10" },
            { label: "Failed", value: automation.stats.failedRuns, icon: XCircle, color: "text-red-500", bg: "bg-red-500/10" },
            { label: "Skipped", value: automation.stats.skippedRuns, icon: SkipForward, color: "text-amber-600", bg: "bg-amber-500/10" },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
              <div><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-xl font-display font-bold">{s.value}</p></div>
            </div>
          ))}
        </div>

        {/* Trigger */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold"><Zap className="w-4 h-4 text-amber-500" /> Trigger</div>
          <p className="text-sm">{TRIGGER_LABELS[automation.trigger.type] || automation.trigger.type}</p>
        </div>

        {/* Conditions */}
        {automation.conditions.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-5 mb-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold"><Filter className="w-4 h-4 text-blue-500" /> Conditions ({automation.conditionLogic})</div>
            <div className="space-y-2">
              {automation.conditions.map((c) => (
                <div key={c.id} className="text-sm bg-secondary/50 rounded-xl px-4 py-2.5">
                  <span className="font-medium">{c.type}</span> {c.operator} <span className="text-muted-foreground">{JSON.stringify(c.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold"><Play className="w-4 h-4 text-emerald-500" /> Actions</div>
          <div className="space-y-2">
            {automation.actions.sort((a, b) => a.order - b.order).map((a) => (
              <div key={a.id} className="text-sm bg-secondary/50 rounded-xl px-4 py-2.5 flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">{a.order}</span>
                <span className="font-medium">{a.type.replace(/_/g, " ")}</span>
                {typeof a.config.message === "string" && a.config.message && <span className="text-muted-foreground truncate ml-2 text-xs">&quot;{a.config.message.slice(0, 60)}...&quot;</span>}
                {typeof a.config.tag === "string" && a.config.tag && <span className="text-xs bg-primary/10 px-2 py-0.5 rounded-md">{a.config.tag}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-4">
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Created: {new Date(automation.createdAt).toLocaleDateString()}</span>
          <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Last run: {automation.stats.lastRunAt ? new Date(automation.stats.lastRunAt).toLocaleString() : "Never"}</span>
        </div>

        <div className="mt-6">
          <Link href={`/automation/logs?automationId=${automationId}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <FileText className="w-4 h-4" /> View execution logs for this automation
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
