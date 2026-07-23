"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend } from "@/lib/api/client";
import { CheckCircle2, Eye, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  body: string;
  status: string;
  variables: string[];
  updatedAt: string;
}

interface TemplatePlaceholder { key: string; label: string; example: string; automatic: boolean }
interface MessagePreset {
  id: string;
  name: string;
  category: string;
  description: string;
  body: string;
  placeholders: TemplatePlaceholder[];
}

const categories = ["welcome", "sales", "offers", "appointments", "orders", "payments", "support", "feedback", "reminders", "follow-ups"];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("all");
  const [presets, setPresets] = useState<MessagePreset[]>([]);
  const [placeholders, setPlaceholders] = useState<TemplatePlaceholder[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});

  const filtered = useMemo(() => (
    filter === "all" ? templates : templates.filter((template) => template.category === filter)
  ), [templates, filter]);

  const load = async () => {
    setLoading(true);
    try {
      const [saved, library] = await Promise.all([
        apiGet<MessageTemplate[]>("/api/message-templates"),
        apiGet<{ presets: MessagePreset[]; placeholders: TemplatePlaceholder[] }>("/api/message-template-presets"),
      ]);
      setTemplates(saved);
      setPresets(library.presets);
      setPlaceholders(library.placeholders);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await apiSend("/api/message-templates", "POST", { name, category, body });
      setName("");
      setBody("");
      setPreview("");
      setSelectedPresetId("");
      setPreviewValues({});
      setMessage("Template created");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template could not be created");
    } finally {
      setSaving(false);
    }
  };

  const showPreview = async () => {
    try {
      const data = await apiSend<{ preview: string }>("/api/message-templates/preview", "POST", { body, values: previewValues });
      setPreview(data.preview);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview failed");
    }
  };

  const applyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    setName(preset.name);
    setCategory(preset.category);
    setBody(preset.body);
    setPreview("");
    setPreviewValues(Object.fromEntries(preset.placeholders.map((placeholder) => [placeholder.key, placeholder.example])));
  };

  const insertPlaceholder = (key: string) => {
    const token = `{{${key}}}`;
    setBody((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${token}`);
  };

  const markReady = async (id: string) => {
    await apiSend(`/api/message-templates/${id}`, "PATCH", { status: "ready" });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await apiSend(`/api/message-templates/${id}`, "DELETE");
    await load();
  };

  return (
    <DashboardLayout title="Message Templates">
      <div className="grid gap-6 p-5 md:grid-cols-[420px_1fr] md:p-8">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">Create Template</h2>
          <form onSubmit={create} className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Start from a real-business example</label>
              <select value={selectedPresetId} onChange={(event) => applyPreset(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Blank custom template</option>
                {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {preset.category}</option>)}
              </select>
              {selectedPresetId && <p className="mt-1.5 text-xs text-muted-foreground">{presets.find((preset) => preset.id === selectedPresetId)?.description}</p>}
            </div>
            <Input placeholder="Template name" value={name} onChange={(event) => setName(event.target.value)} required />
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
              rows={8}
              placeholder="Hi {{customer.name}}, your meeting is booked for {{date}} at {{time}}."
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div>
              <p className="text-xs font-medium">Insert a placeholder</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {placeholders.map((placeholder) => (
                  <button key={placeholder.key} type="button" onClick={() => insertPlaceholder(placeholder.key)} title={`${placeholder.label} · example: ${placeholder.example}`} className="rounded-md border border-border bg-secondary px-2 py-1 text-xs hover:border-primary/40">
                    {`{{${placeholder.key}}}`}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Customer, business, agent, and last-message values are filled automatically. Campaign-specific values are requested when creating a campaign. You can also type your own dotted placeholder such as {`{{invoice.number}}`}.</p>
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}><Plus className="h-4 w-4" /> {saving ? "Saving..." : "Create"}</Button>
              <button type="button" onClick={showPreview} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary">
                <Eye className="h-4 w-4" /> Preview
              </button>
            </div>
            {preview && <div className="rounded-lg bg-secondary p-3 text-sm">{preview}</div>}
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
          </form>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">Saved Templates</h2>
              <p className="text-xs text-muted-foreground">Mark local templates ready before using them in campaigns. This is not external WhatsApp approval.</p>
            </div>
            <select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">All categories</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading...</div>
            ) : filtered.map((template) => (
              <div key={template.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{template.name}</p>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{template.category}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${template.status === "ready" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{template.status}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{template.body}</p>
                    {template.variables.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Variables: {template.variables.join(", ")}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {template.status !== "ready" && (
                      <button onClick={() => void markReady(template.id)} className="rounded-lg border border-border p-2 hover:bg-secondary" title="Mark ready for workspace use">
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => void remove(template.id)} className="rounded-lg border border-destructive/30 p-2 text-destructive hover:bg-destructive/10" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!loading && !filtered.length && <div className="p-8 text-sm text-muted-foreground">No templates found.</div>}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
