"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiSend } from "@/lib/api/client";
import Link from "next/link";
import {
  ArrowLeft, Zap, Filter, Play, Plus, Trash2, ChevronUp, ChevronDown, Save, Loader2,
} from "lucide-react";

const TRIGGERS = [
  { type: "new_message_received", label: "New message received", desc: "When any new WhatsApp message arrives" },
  { type: "first_message_from_customer", label: "First message from customer", desc: "When a customer sends their first message" },
  { type: "new_customer_created", label: "New customer created", desc: "When a new customer record is created" },
  { type: "keyword_matched", label: "Keyword matched", desc: "When a message contains specific keywords" },
  { type: "customer_status_changed", label: "Customer status changed", desc: "When a customer's status is updated" },
  { type: "customer_assigned", label: "Customer assigned", desc: "When a customer is assigned to an agent" },
  { type: "no_reply_after_delay", label: "No reply after delay", desc: "When there's no reply for a configured time" },
];

const CONDITION_TYPES = [
  { type: "message_contains", label: "Message contains keyword" },
  { type: "message_equals", label: "Message equals exactly" },
  { type: "customer_is_new", label: "Customer is new" },
  { type: "customer_has_tag", label: "Customer has tag" },
  { type: "customer_status_is", label: "Customer status is" },
  { type: "customer_assigned_to", label: "Customer assigned to" },
  { type: "customer_unassigned", label: "Customer is unassigned" },
  { type: "message_type_is", label: "Message type is" },
  { type: "business_hours", label: "Within business hours" },
];

const ACTION_TYPES = [
  { type: "send_text_message", label: "Send text message", fields: ["message"] },
  { type: "send_ai_reply", label: "Send AI reply", fields: ["instruction", "fallbackMessage", "mode", "session"] },
  { type: "wait_delay", label: "Wait before next action", fields: ["delay"] },
  { type: "assign_agent", label: "Assign to agent", fields: ["agentId"] },
  { type: "assign_round_robin", label: "Assign round-robin", fields: [] },
  { type: "add_tag", label: "Add tag", fields: ["tag"] },
  { type: "remove_tag", label: "Remove tag", fields: ["tag"] },
  { type: "update_customer_status", label: "Update customer status", fields: ["status"] },
  { type: "create_internal_note", label: "Create internal note", fields: ["note"] },
  { type: "notify_admin", label: "Notify admin", fields: ["message"] },
  { type: "notify_agent", label: "Notify assigned agent", fields: ["message"] },
  { type: "stop_automation", label: "Stop automation", fields: [] },
];

interface Condition { id: string; type: string; operator: string; value: unknown; config: Record<string, unknown> }
interface Action { id: string; type: string; order: number; config: Record<string, unknown> }

interface Props { mode: "create" | "edit"; automationId?: string }
interface WhatsAppAccount { accountKey: string; instanceName: string; phoneNumber?: string; status: string }

export function AutomationForm({ mode, automationId }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(mode === "edit");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accountKey, setAccountKey] = useState("primary");
  const [automationMode, setAutomationMode] = useState<"rules" | "ai_agent">("rules");
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [status, setStatus] = useState<"active" | "inactive" | "draft">("draft");
  const [triggerType, setTriggerType] = useState("");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>({});
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [conditionLogic, setConditionLogic] = useState<"AND" | "OR">("AND");
  const [actions, setActions] = useState<Action[]>([]);

  useEffect(() => {
    apiGet<{ accounts: WhatsAppAccount[] }>("/api/settings/whatsapp/accounts")
      .then((data) => {
        setAccounts(data.accounts || []);
        if (mode === "create" && data.accounts?.length) {
          setAccountKey((current) => data.accounts.some((account) => account.accountKey === current) ? current : data.accounts[0].accountKey);
        }
      })
      .catch(console.error);
  }, [mode]);

  useEffect(() => {
    if (mode !== "edit" || !automationId) return;
    apiGet<{
      name: string; description: string; accountKey: string; mode: "rules" | "ai_agent";
      status: "active" | "inactive" | "draft";
      trigger: { type: string; config: Record<string, unknown> };
      conditions: Condition[]; conditionLogic: "AND" | "OR"; actions: Action[];
    }>(`/api/automations/${automationId}`)
      .then((data) => {
        setName(data.name); setDescription(data.description); setStatus(data.status);
        setAccountKey(data.accountKey || "primary"); setAutomationMode(data.mode || "rules");
        setTriggerType(data.trigger.type); setTriggerConfig(data.trigger.config || {});
        setConditions(data.conditions); setConditionLogic(data.conditionLogic);
        setActions(data.actions);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [mode, automationId]);

  const addCondition = () => {
    setConditions([...conditions, {
      id: `cond_${Date.now()}`, type: "message_contains", operator: "contains", value: "", config: {},
    }]);
  };

  const updateCondition = (index: number, updates: Partial<Condition>) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], ...updates };
    setConditions(updated);
  };

  const removeCondition = (index: number) => setConditions(conditions.filter((_, i) => i !== index));

  const addAction = () => {
    setActions([...actions, {
      id: `action_${Date.now()}`, type: "send_text_message", order: actions.length + 1, config: {},
    }]);
  };

  const updateAction = (index: number, updates: Partial<Action>) => {
    const updated = [...actions];
    updated[index] = { ...updated[index], ...updates };
    setActions(updated);
  };

  const updateActionConfig = (index: number, key: string, value: unknown) => {
    const updated = [...actions];
    updated[index] = { ...updated[index], config: { ...updated[index].config, [key]: value } };
    setActions(updated);
  };

  const removeAction = (index: number) => {
    const updated = actions.filter((_, i) => i !== index).map((a, i) => ({ ...a, order: i + 1 }));
    setActions(updated);
  };

  const moveAction = (index: number, dir: -1 | 1) => {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= actions.length) return;
    const updated = [...actions];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setActions(updated.map((a, i) => ({ ...a, order: i + 1 })));
  };

  const [savePhase, setSavePhase] = useState<"idle" | "saving" | "success">("idle");

  const handleSave = async () => {
    if (!name.trim()) return alert("Name is required");
    if (!triggerType) return alert("Select a trigger");
    if (!actions.length) return alert("Add at least one action");
    if (automationMode === "rules" && actions.some((action) => action.type === "send_ai_reply")) {
      return alert("AI reply actions are only available in AI agent mode");
    }

    setSaving(true);
    setSavePhase("saving");
    try {
      const payload = {
        name, description, accountKey, mode: automationMode, status,
        trigger: { type: triggerType, config: triggerConfig },
        conditions, conditionLogic,
        actions: actions.map((a, i) => ({ ...a, order: i + 1 })),
      };

      if (mode === "edit" && automationId) {
        await apiSend(`/api/automations/${automationId}`, "PATCH", payload);
      } else {
        await apiSend("/api/automations", "POST", payload);
      }

      setSavePhase("success");
      // Brief delay to show success state
      await new Promise((resolve) => setTimeout(resolve, 1500));
      router.push("/automation");
    } catch (error) {
      setSavePhase("idle");
      alert(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto animate-fade-in">
      <Link href="/automation" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Automations
      </Link>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {["Basic Info", "Trigger", "Conditions", "Actions", "Review"].map((label, i) => (
          <button key={label} onClick={() => setStep(i + 1)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${step === i + 1 ? "bg-primary text-primary-foreground" : step > i + 1 ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"}`}>
            <span className="w-5 h-5 rounded-full bg-current/10 flex items-center justify-center text-[10px]">{i + 1}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
          <h3 className="font-display font-bold text-lg">Basic Info</h3>
          <div>
            <label className="block text-sm font-medium mb-1.5">Automation Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Welcome new customers" className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this automation do?" rows={3} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1.5">WhatsApp account *</label>
              <select value={accountKey} onChange={(e) => setAccountKey(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm">
                {accounts.length === 0 && <option value="primary">Primary account</option>}
                {accounts.map((account) => (
                  <option key={account.accountKey} value={account.accountKey}>
                    {account.accountKey} · {account.phoneNumber || account.instanceName} ({account.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Automation mode *</label>
              <select
                value={automationMode}
                onChange={(e) => {
                  const nextMode = e.target.value as "rules" | "ai_agent";
                  setAutomationMode(nextMode);
                  if (nextMode === "rules") setActions((current) => current.filter((action) => action.type !== "send_ai_reply").map((action, index) => ({ ...action, order: index + 1 })));
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm"
              >
                <option value="rules">Step-by-step rules (no AI)</option>
                <option value="ai_agent">Goal-based AI agent</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Status:</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex justify-end"><button onClick={() => setStep(2)} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all">Next →</button></div>
        </div>
      )}

      {/* Step 2: Trigger */}
      {step === 2 && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2"><Zap className="w-5 h-5 text-amber-500" /> Choose Trigger</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {TRIGGERS.map((t) => (
              <button key={t.type} onClick={() => setTriggerType(t.type)} className={`text-left p-4 rounded-xl border transition-all ${triggerType === t.type ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/30 hover:bg-secondary/50"}`}>
                <p className="text-sm font-semibold">{t.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-6">
            <button onClick={() => setStep(1)} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-all">← Back</button>
            <button onClick={() => setStep(3)} disabled={!triggerType} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50">Next →</button>
          </div>
        </div>
      )}

      {/* Step 3: Conditions */}
      {step === 3 && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-lg flex items-center gap-2"><Filter className="w-5 h-5 text-blue-500" /> Conditions <span className="text-xs text-muted-foreground font-normal">(optional)</span></h3>
            <div className="flex items-center gap-2 text-sm">
              <span>Match:</span>
              {(["AND", "OR"] as const).map((logic) => (
                <button key={logic} onClick={() => setConditionLogic(logic)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${conditionLogic === logic ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{logic === "AND" ? "ALL" : "ANY"}</button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {conditions.map((condition, index) => (
              <div key={condition.id} className="flex items-start gap-3 p-4 rounded-xl bg-secondary/50 border border-border">
                <div className="flex-1 grid gap-3 sm:grid-cols-3">
                  <select value={condition.type} onChange={(e) => updateCondition(index, { type: e.target.value })} className="px-3 py-2 rounded-lg border border-border bg-background text-sm">
                    {CONDITION_TYPES.map((ct) => <option key={ct.type} value={ct.type}>{ct.label}</option>)}
                  </select>
                  <select value={condition.operator} onChange={(e) => updateCondition(index, { operator: e.target.value })} className="px-3 py-2 rounded-lg border border-border bg-background text-sm">
                    {["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "in"].map((op) => <option key={op} value={op}>{op.replace(/_/g, " ")}</option>)}
                  </select>
                  {!["customer_is_new", "customer_unassigned", "business_hours"].includes(condition.type) && (
                    <input value={String(condition.value || "")} onChange={(e) => {
                      const val = condition.type === "message_contains" && e.target.value.includes(",") ? e.target.value.split(",").map(s => s.trim()) : e.target.value;
                      updateCondition(index, { value: val });
                    }} placeholder={condition.type === "message_contains" ? "keyword1, keyword2" : "Value"} className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                  )}
                </div>
                <button onClick={() => removeCondition(index)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <button onClick={addCondition} className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"><Plus className="w-4 h-4" /> Add Condition</button>
          <div className="flex justify-between mt-6">
            <button onClick={() => setStep(2)} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-all">← Back</button>
            <button onClick={() => setStep(4)} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all">Next →</button>
          </div>
        </div>
      )}

      {/* Step 4: Actions */}
      {step === 4 && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2"><Play className="w-5 h-5 text-emerald-500" /> Actions</h3>
          <div className="space-y-3">
            {actions.map((action, index) => {
              const actionDef = ACTION_TYPES.find((at) => at.type === action.type);
              return (
                <div key={action.id} className="p-4 rounded-xl bg-secondary/50 border border-border">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">{index + 1}</span>
                    <select value={action.type} onChange={(e) => updateAction(index, { type: e.target.value, config: {} })} className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm">
                      {ACTION_TYPES.filter((at) => automationMode === "ai_agent" || at.type !== "send_ai_reply").map((at) => <option key={at.type} value={at.type}>{at.label}</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveAction(index, -1)} disabled={index === 0} className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveAction(index, 1)} disabled={index === actions.length - 1} className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => removeAction(index)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {/* Config fields */}
                  {actionDef?.fields.includes("message") && (
                    <textarea value={String(action.config.message || "")} onChange={(e) => updateActionConfig(index, "message", e.target.value)} placeholder="Message text. Use {{customer.name}}, {{business.name}}, etc." rows={3} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none mt-1" />
                  )}
                  {actionDef?.fields.includes("instruction") && (
                    <div className="space-y-2 mt-1">
                      <textarea value={String(action.config.instruction || "")} onChange={(e) => updateActionConfig(index, "instruction", e.target.value)} placeholder="AI instruction..." rows={2} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none" />
                      <textarea value={String(action.config.fallbackMessage || "")} onChange={(e) => updateActionConfig(index, "fallbackMessage", e.target.value)} placeholder="Fallback message if AI unavailable..." rows={2} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none" />
                      <select value={String(action.config.mode || "auto_send")} onChange={(e) => updateActionConfig(index, "mode", e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-sm">
                        <option value="auto_send">Auto-send</option>
                        <option value="draft">Draft only</option>
                      </select>
                    </div>
                  )}
                  {actionDef?.fields.includes("session") && (
                    <div className="mt-3 space-y-3 rounded-xl border border-border bg-background p-3">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={Boolean(action.config.sessionMode)}
                          onChange={(e) => {
                            updateActionConfig(index, "sessionMode", e.target.checked);
                            updateActionConfig(index, "useChatHistory", e.target.checked);
                            updateActionConfig(index, "inactivityNudgeEnabled", e.target.checked);
                          }}
                          className="h-4 w-4 rounded border-border"
                        />
                        Continue as one chat session
                      </label>
                      {Boolean(action.config.sessionMode) && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-medium text-muted-foreground">
                            Nudge after seconds
                            <input value={String(action.config.nudgeAfterSeconds || 120)} onChange={(e) => updateActionConfig(index, "nudgeAfterSeconds", Number(e.target.value))} type="number" min={10} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                          </label>
                          <label className="text-xs font-medium text-muted-foreground">
                            Close after seconds
                            <input value={String(action.config.closeAfterSeconds || 30)} onChange={(e) => updateActionConfig(index, "closeAfterSeconds", Number(e.target.value))} type="number" min={10} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                          </label>
                          <label className="sm:col-span-2 text-xs font-medium text-muted-foreground">
                            Nudge message
                            <textarea value={String(action.config.nudgeMessage || "Are you still there? I can help you with the next step whenever you are ready.")} onChange={(e) => updateActionConfig(index, "nudgeMessage", e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none" />
                          </label>
                          <label className="sm:col-span-2 text-xs font-medium text-muted-foreground">
                            Close message
                            <textarea value={String(action.config.closeMessage || "I will pause this chat for now. Message me anytime and we can continue from here.")} onChange={(e) => updateActionConfig(index, "closeMessage", e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none" />
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                  {actionDef?.fields.includes("tag") && (
                    <input value={String(action.config.tag || "")} onChange={(e) => updateActionConfig(index, "tag", e.target.value)} placeholder="Tag name" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm mt-1" />
                  )}
                  {actionDef?.fields.includes("status") && (
                    <input value={String(action.config.status || "")} onChange={(e) => updateActionConfig(index, "status", e.target.value)} placeholder="Status (e.g., active, hot_lead)" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm mt-1" />
                  )}
                  {actionDef?.fields.includes("note") && (
                    <textarea value={String(action.config.note || "")} onChange={(e) => updateActionConfig(index, "note", e.target.value)} placeholder="Internal note text..." rows={2} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none mt-1" />
                  )}
                  {actionDef?.fields.includes("agentId") && (
                    <input value={String(action.config.agentId || "")} onChange={(e) => updateActionConfig(index, "agentId", e.target.value)} placeholder="Agent ID" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm mt-1" />
                  )}
                  {actionDef?.fields.includes("delay") && (
                    <label className="block text-xs font-medium text-muted-foreground mt-1">
                      Delay in seconds
                      <input value={String(action.config.delaySeconds || 60)} onChange={(e) => updateActionConfig(index, "delaySeconds", Number(e.target.value))} type="number" min={1} max={86400} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={addAction} className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"><Plus className="w-4 h-4" /> Add Action</button>
          <div className="flex justify-between mt-6">
            <button onClick={() => setStep(3)} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-all">← Back</button>
            <button onClick={() => setStep(5)} disabled={!actions.length} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50">Next →</button>
          </div>
        </div>
      )}

      {/* Step 5: Review */}
      {step === 5 && (
        <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
          <h3 className="font-display font-bold text-lg">Review & Save</h3>
          <div className="bg-secondary/50 rounded-xl p-4 text-sm space-y-3">
            <div><span className="font-medium">Name:</span> {name}</div>
            {description && <div><span className="font-medium">Description:</span> {description}</div>}
            <div><span className="font-medium">Status:</span> <span className={status === "active" ? "text-emerald-600" : "text-muted-foreground"}>{status}</span></div>
            <div><span className="font-medium">Account:</span> {accountKey}</div>
            <div><span className="font-medium">Mode:</span> {automationMode === "ai_agent" ? "Goal-based AI agent" : "Step-by-step rules"}</div>
            <div className="pt-2 border-t border-border">
              <span className="font-medium flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-amber-500" /> Trigger:</span>
              <span className="ml-2">{TRIGGERS.find((t) => t.type === triggerType)?.label || triggerType}</span>
            </div>
            {conditions.length > 0 && (
              <div className="pt-2 border-t border-border">
                <span className="font-medium flex items-center gap-1"><Filter className="w-3.5 h-3.5 text-blue-500" /> Conditions ({conditionLogic}):</span>
                {conditions.map((c, i) => <div key={i} className="ml-4 text-muted-foreground">{c.type} {c.operator} {JSON.stringify(c.value)}</div>)}
              </div>
            )}
            <div className="pt-2 border-t border-border">
              <span className="font-medium flex items-center gap-1"><Play className="w-3.5 h-3.5 text-emerald-500" /> Actions:</span>
              {actions.sort((a, b) => a.order - b.order).map((a, i) => (
                <div key={i} className="ml-4 text-muted-foreground">{i + 1}. {ACTION_TYPES.find((at) => at.type === a.type)?.label || a.type}</div>
              ))}
            </div>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-700">
            <strong>Summary:</strong> When <em>{TRIGGERS.find((t) => t.type === triggerType)?.label}</em>
            {conditions.length > 0 && <>, if {conditionLogic === "AND" ? "all" : "any"} conditions match</>}
            , then execute {actions.length} action{actions.length > 1 ? "s" : ""}.
          </div>

          {/* Save progress indicator */}
          {saving && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${savePhase === "saving" ? "bg-primary text-primary-foreground animate-pulse" : "bg-emerald-500 text-white"}`}>
                  {savePhase === "saving" ? <Loader2 className="w-3 h-3 animate-spin" /> : "✓"}
                </div>
                <span className="text-sm font-medium">Saving automation to database...</span>
              </div>
              {savePhase === "success" && (
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs">✓</div>
                  <span className="text-sm font-medium text-emerald-600">Automation created successfully! Redirecting...</span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(4)} disabled={saving} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-all disabled:opacity-50">← Back</button>
            <button onClick={handleSave} disabled={saving} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 ${savePhase === "success" ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savePhase === "success"
                ? "✓ Created!"
                : savePhase === "saving"
                    ? "Saving..."
                    : mode === "edit"
                      ? "Update Automation"
                      : "Create Automation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
