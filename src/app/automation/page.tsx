"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useEffect, useState, useCallback } from "react";
import { apiGet, apiSend } from "@/lib/api/client";
import {
  Plus,
  Zap,
  MoreHorizontal,
  Play,
  Pause,
  Copy,
  Trash2,
  Edit3,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
  SkipForward,
  Clock,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

interface AutomationItem {
  id: string;
  name: string;
  description: string;
  accountKey: string;
  mode: "rules" | "ai_agent";
  status: "active" | "inactive" | "draft";
  triggerType: string;
  conditionCount: number;
  actionCount: number;
  stats: {
    totalRuns: number;
    successRuns: number;
    failedRuns: number;
    skippedRuns: number;
    lastRunAt: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  new_message_received: "New message received",
  new_customer_created: "New customer created",
  first_message_from_customer: "First message from customer",
  keyword_matched: "Keyword matched",
  customer_status_changed: "Customer status changed",
  customer_assigned: "Customer assigned",
  no_reply_after_delay: "No reply after delay",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: "bg-emerald-500/10", text: "text-emerald-600", dot: "bg-emerald-500" },
  inactive: { bg: "bg-gray-500/10", text: "text-gray-500", dot: "bg-gray-400" },
  draft: { bg: "bg-amber-500/10", text: "text-amber-600", dot: "bg-amber-500" },
};

export default function AutomationPage() {
  const [automations, setAutomations] = useState<AutomationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<Array<{
    id: string; name: string; category: string; description: string;
    mode: "rules" | "ai_agent";
    setupSteps: string[];
    exampleConversation: { customer: string; assistant: string } | null;
  }>>([]);

  const loadAutomations = useCallback(async () => {
    try {
      const data = await apiGet<AutomationItem[]>("/api/automations");
      setAutomations(data);
    } catch (error) {
      console.error("Failed to load automations:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadAutomations());
  }, [loadAutomations]);

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    try {
      await apiSend(`/api/automations/${id}/status`, "PATCH", { status: newStatus });
      await loadAutomations();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update status");
    }
  };

  const duplicateAutomation = async (id: string) => {
    try {
      await apiSend(`/api/automations/${id}/duplicate`, "POST");
      setOpenMenuId(null);
      await loadAutomations();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to duplicate");
    }
  };

  const deleteAutomation = async (id: string) => {
    if (!confirm("Are you sure you want to delete this automation?")) return;
    try {
      await apiSend(`/api/automations/${id}`, "DELETE");
      setOpenMenuId(null);
      await loadAutomations();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to delete");
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await apiGet<typeof templates>("/api/automation-templates");
      setTemplates(data);
      setShowTemplates(true);
    } catch (error) {
      console.error("Failed to load templates:", error);
    }
  };

  const createFromTemplate = async (templateId: string) => {
    try {
      await apiSend("/api/automations/from-template", "POST", { templateId });
      setShowTemplates(false);
      await loadAutomations();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to create from template");
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <DashboardLayout title="Automation">
      <div className="p-5 md:p-8 max-w-7xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-display font-bold tracking-tight">Automations</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create automated workflows for your WhatsApp conversations
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadTemplates}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-secondary text-sm font-medium transition-all duration-200"
            >
              <Sparkles className="w-4 h-4" />
              Use Template
            </button>
            <Link
              href="/automation/new"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-sm hover:opacity-90 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              Create Automation
            </Link>
          </div>
        </div>

        {/* Stats overview */}
        {!loading && automations.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              {
                label: "Total",
                value: automations.length,
                icon: Zap,
                color: "text-blue-600",
                bg: "bg-blue-500/10",
              },
              {
                label: "Active",
                value: automations.filter((a) => a.status === "active").length,
                icon: Play,
                color: "text-emerald-600",
                bg: "bg-emerald-500/10",
              },
              {
                label: "Total Runs",
                value: automations.reduce((sum, a) => sum + a.stats.totalRuns, 0),
                icon: Activity,
                color: "text-violet-600",
                bg: "bg-violet-500/10",
              },
              {
                label: "Success Rate",
                value: (() => {
                  const total = automations.reduce((s, a) => s + a.stats.totalRuns, 0);
                  const success = automations.reduce((s, a) => s + a.stats.successRuns, 0);
                  return total > 0 ? `${Math.round((success / total) * 100)}%` : "—";
                })(),
                icon: CheckCircle2,
                color: "text-emerald-600",
                bg: "bg-emerald-500/10",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4"
              >
                <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                  <p className="text-xl font-display font-bold">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Automation List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : automations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-3xl bg-primary/5 flex items-center justify-center mb-6">
              <Zap className="w-10 h-10 text-primary/30" />
            </div>
            <h3 className="text-lg font-display font-bold mb-2">No automations yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Create your first automation to auto-respond to customers, assign agents, tag leads, and more.
            </p>
            <div className="flex gap-3">
              <button
                onClick={loadTemplates}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-secondary text-sm font-medium transition-all"
              >
                <Sparkles className="w-4 h-4" />
                Start from Template
              </button>
              <Link
                href="/automation/new"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-sm hover:opacity-90 transition-all"
              >
                <Plus className="w-4 h-4" />
                Create from Scratch
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {automations.map((automation) => {
              const statusStyle = STATUS_STYLES[automation.status] || STATUS_STYLES.draft;
              return (
                <div
                  key={automation.id}
                  className="bg-card rounded-2xl border border-border p-5 hover:shadow-md transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <Link
                          href={`/automation/${automation.id}`}
                          className="text-base font-display font-bold tracking-tight hover:text-primary transition-colors truncate"
                        >
                          {automation.name}
                        </Link>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                          {automation.status}
                        </span>
                        <span className="inline-flex px-2.5 py-0.5 rounded-full bg-secondary text-xs font-medium text-muted-foreground">
                          {automation.accountKey || "primary"}
                        </span>
                        <span className="inline-flex px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 text-xs font-medium">
                          {automation.mode === "ai_agent" ? "AI agent" : "Rules"}
                        </span>
                      </div>

                      {automation.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-1">
                          {automation.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5" />
                          {TRIGGER_LABELS[automation.triggerType] || automation.triggerType}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5" />
                          {automation.stats.totalRuns} runs
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          {automation.stats.successRuns}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                          {automation.stats.failedRuns}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <SkipForward className="w-3.5 h-3.5 text-amber-500" />
                          {automation.stats.skippedRuns}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          Last: {formatRelativeTime(automation.stats.lastRunAt)}
                        </span>
                        <span className="text-xs opacity-60">
                          Created {formatDate(automation.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Status toggle */}
                      <button
                        onClick={() => toggleStatus(automation.id, automation.status)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${
                          automation.status === "active" ? "bg-emerald-500" : "bg-gray-300"
                        }`}
                        title={automation.status === "active" ? "Deactivate" : "Activate"}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            automation.status === "active" ? "translate-x-6" : "translate-x-0"
                          }`}
                        />
                      </button>

                      {/* Menu */}
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === automation.id ? null : automation.id)}
                          className="p-2 rounded-xl hover:bg-secondary transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {openMenuId === automation.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                            <div className="absolute right-0 top-full mt-1 w-48 bg-card rounded-xl border border-border shadow-lg z-50 py-1 animate-fade-in">
                              <Link
                                href={`/automation/${automation.id}/edit`}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-secondary transition-colors"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <Edit3 className="w-4 h-4" />
                                Edit
                              </Link>
                              <button
                                onClick={() => duplicateAutomation(automation.id)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-secondary transition-colors w-full text-left"
                              >
                                <Copy className="w-4 h-4" />
                                Duplicate
                              </button>
                              <Link
                                href={`/automation/logs?automationId=${automation.id}`}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-secondary transition-colors"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <FileText className="w-4 h-4" />
                                View Logs
                              </Link>
                              <div className="border-t border-border my-1" />
                              <button
                                onClick={() => deleteAutomation(automation.id)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors w-full text-left"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Logs link */}
            <div className="flex justify-center pt-4">
              <Link
                href="/automation/logs"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <FileText className="w-4 h-4" />
                View All Automation Logs
              </Link>
            </div>
          </div>
        )}

        {/* Templates Modal */}
        {showTemplates && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={() => setShowTemplates(false)} />
            <div className="relative bg-card rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden animate-fade-in">
              <div className="p-6 border-b border-border">
                <h3 className="text-lg font-display font-bold">Automation Templates</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Start with a pre-built template and customize it for your business
                </p>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-3">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => createFromTemplate(template.id)}
                    className="w-full text-left p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Sparkles className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold">{template.name}</h4>
                          <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-600">{template.mode === "ai_agent" ? "AI agent" : "Rules"}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                        {template.setupSteps?.length > 0 && (
                          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                            {template.setupSteps.slice(0, 3).map((step) => <li key={step}>{step}</li>)}
                          </ul>
                        )}
                        {template.exampleConversation && (
                          <div className="mt-2 rounded-lg bg-secondary/70 p-2 text-xs">
                            <p><span className="font-semibold">Customer:</span> {template.exampleConversation.customer}</p>
                            <p className="mt-1"><span className="font-semibold">Assistant:</span> {template.exampleConversation.assistant}</p>
                          </div>
                        )}
                        <span className="inline-block mt-2 px-2 py-0.5 rounded-md bg-secondary text-xs font-medium text-muted-foreground">
                          {template.category}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="p-4 border-t border-border flex justify-end">
                <button
                  onClick={() => setShowTemplates(false)}
                  className="px-4 py-2 rounded-xl border border-border hover:bg-secondary text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
