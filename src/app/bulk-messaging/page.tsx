"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend } from "@/lib/api/client";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";

interface MessageTemplate {
  id: string;
  name: string;
  body: string;
  status: string;
  variables: string[];
}

interface BulkCampaign {
  id: string;
  name: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  sendAt: string | null;
  createdAt: string;
}

export default function BulkMessagingPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<BulkCampaign[]>([]);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [recipients, setRecipients] = useState("");
  const [sendAt, setSendAt] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const automaticVariables = new Set(["customer.name", "customer.phone", "business.name", "agent.name", "lastMessage.text"]);
  const selectedTemplate = templates.find((template) => template.id === templateId);
  const customVariables = (selectedTemplate?.variables || []).filter((variable) => !automaticVariables.has(variable));

  const load = async () => {
    setLoading(true);
    try {
      const [templateItems, campaignItems] = await Promise.all([
        apiGet<MessageTemplate[]>("/api/message-templates"),
        apiGet<BulkCampaign[]>("/api/bulk-messages"),
      ]);
      setTemplates(templateItems.filter((template) => template.status === "ready"));
      setCampaigns(campaignItems);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load bulk messaging");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  const createCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setMessage("");
    try {
      await apiSend("/api/bulk-messages", "POST", {
        name,
        templateId,
        recipients: recipients.split(/\n|,/).map((item) => item.trim()).filter(Boolean),
        sendAt: sendAt || null,
        values,
      });
      setName("");
      setRecipients("");
      setSendAt("");
      setValues({});
      setMessage("Campaign saved");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Campaign could not be created");
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout title="Bulk Messaging">
      <div className="grid gap-6 p-5 md:grid-cols-[420px_1fr] md:p-8">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">Create Campaign</h2>
          <form onSubmit={createCampaign} className="mt-4 space-y-4">
            <Input placeholder="Campaign name" value={name} onChange={(event) => setName(event.target.value)} required />
            <select value={templateId} onChange={(event) => { setTemplateId(event.target.value); setValues({}); }} required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select workspace-ready template</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
            {customVariables.length > 0 && (
              <div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-3">
                <p className="text-xs font-semibold">Campaign placeholder values</p>
                {customVariables.map((variable) => (
                  <label key={variable} className="block text-xs font-medium text-muted-foreground">
                    {`{{${variable}}}`}
                    <Input className="mt-1 bg-background" value={values[variable] || ""} onChange={(event) => setValues((current) => ({ ...current, [variable]: event.target.value }))} required placeholder={`Value for ${variable}`} />
                  </label>
                ))}
              </div>
            )}
            <textarea
              value={recipients}
              onChange={(event) => setRecipients(event.target.value)}
              required
              rows={8}
              placeholder="Paste customer IDs or WhatsApp JIDs, one per line"
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            <label className="block text-xs font-medium text-muted-foreground">
              Schedule time
              <Input className="mt-1" type="datetime-local" value={sendAt} onChange={(event) => setSendAt(event.target.value)} />
            </label>
            <Button type="submit" disabled={sending || !templates.length}>
              <Send className="h-4 w-4" /> {sending ? "Saving..." : sendAt ? "Schedule Campaign" : "Send Campaign"}
            </Button>
            {!templates.length && <p className="text-sm text-muted-foreground">Create a message template and mark it ready first.</p>}
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
          </form>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="font-display text-lg font-bold">Campaigns</h2>
            <p className="text-xs text-muted-foreground">Track scheduled, sent, partial, and failed campaigns.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-secondary text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Recipients</th>
                  <th className="px-4 py-3">Sent</th>
                  <th className="px-4 py-3">Failed</th>
                  <th className="px-4 py-3">Schedule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-muted-foreground">Loading...</td></tr>
                ) : campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td className="px-4 py-3 font-semibold">{campaign.name}</td>
                    <td className="px-4 py-3 capitalize">{campaign.status}</td>
                    <td className="px-4 py-3">{campaign.totalRecipients}</td>
                    <td className="px-4 py-3">{campaign.sentCount}</td>
                    <td className="px-4 py-3">{campaign.failedCount}</td>
                    <td className="px-4 py-3">{campaign.sendAt ? new Date(campaign.sendAt).toLocaleString() : "Instant"}</td>
                  </tr>
                ))}
                {!loading && !campaigns.length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-muted-foreground">No campaigns yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
