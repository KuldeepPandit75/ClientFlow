"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Power, QrCode, RefreshCw, Wifi } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api/client";
import type { WhatsAppSettings } from "@/lib/backend/types";

const Settings = () => {
  const [whatsapp, setWhatsapp] = useState<WhatsAppSettings | null>(null);
  const [followUp, setFollowUp] = useState({
    nudgeAfterSeconds: 120,
    closeAfterSeconds: 30,
    nudgeMessage: "",
    closeMessage: "",
  });
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [whatsappError, setWhatsappError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");

  useEffect(() => {
    async function loadSettings() {
      const [whatsappData, followUpData] = await Promise.all([
        apiGet<WhatsAppSettings>("/api/settings/whatsapp"),
        apiGet<typeof followUp & { updatedAt?: string | null }>("/api/settings/automation/followup"),
      ]);
      setWhatsapp(whatsappData);
      setFollowUp({
        nudgeAfterSeconds: followUpData.nudgeAfterSeconds,
        closeAfterSeconds: followUpData.closeAfterSeconds,
        nudgeMessage: followUpData.nudgeMessage,
        closeMessage: followUpData.closeMessage,
      });
    }

    void loadSettings();
  }, []);

  useEffect(() => {
    if (whatsapp?.provider !== "evolution" || whatsapp.connected) return;

    const interval = window.setInterval(async () => {
      try {
        const data = await apiGet<WhatsAppSettings>("/api/settings/whatsapp/evolution/status");
        setWhatsapp(data);
      } catch {
        // Keep the latest visible status while Evolution starts or refreshes.
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [whatsapp?.connected, whatsapp?.provider]);

  const reconnectProvider = async () => {
    setWhatsappBusy(true);
    setWhatsappError("");
    try {
      const data = await apiSend<WhatsAppSettings>(
        "/api/settings/whatsapp/evolution/connect",
        "POST",
      );
      setWhatsapp(data);
    } catch (error) {
      setWhatsappError(error instanceof Error ? error.message : "WhatsApp connection failed");
    } finally {
      setWhatsappBusy(false);
    }
  };

  const disconnectProvider = async () => {
    setWhatsappBusy(true);
    setWhatsappError("");
    try {
      const data = await apiSend<WhatsAppSettings>(
        "/api/settings/whatsapp/evolution/disconnect",
        "POST",
      );
      setWhatsapp(data);
    } catch (error) {
      setWhatsappError(error instanceof Error ? error.message : "WhatsApp disconnect failed");
    } finally {
      setWhatsappBusy(false);
    }
  };

  const refreshEvolutionStatus = async () => {
    setWhatsappBusy(true);
    setWhatsappError("");
    try {
      const data = await apiGet<WhatsAppSettings>("/api/settings/whatsapp/evolution/status");
      setWhatsapp(data);
    } catch (error) {
      setWhatsappError(error instanceof Error ? error.message : "Evolution status refresh failed");
    } finally {
      setWhatsappBusy(false);
    }
  };

  const saveFollowUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setFollowUpBusy(true);
    setSettingsMessage("");
    try {
      const data = await apiSend<typeof followUp>(
        "/api/settings/automation/followup",
        "PATCH",
        followUp,
      );
      setFollowUp(data);
      setSettingsMessage("Follow-up automation settings saved");
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "Follow-up settings could not be saved");
    } finally {
      setFollowUpBusy(false);
    }
  };

  return (
    <DashboardLayout title="Settings">
      <div className="p-5 md:p-8 animate-fade-in max-w-3xl space-y-6">
        <section className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
              <Wifi className="w-4 h-4 text-foreground" />
            </div>
            <h3 className="font-display font-bold uppercase tracking-wide">WhatsApp Connection</h3>
          </div>

          <div className="flex flex-col gap-4 rounded-xl bg-accent p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">
                Status:{" "}
                <span className="text-accent-foreground">
                  {whatsapp?.connected ? "Connected" : "Disconnected"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Business Number: {whatsapp?.businessNumber || "-"}
              </p>
              {whatsapp?.evolution && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Evolution: {whatsapp.evolution.instanceName} / {whatsapp.evolution.state}
                </p>
              )}
            </div>

            {whatsapp?.connected ? (
              <button
                onClick={disconnectProvider}
                disabled={whatsappBusy}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
              >
                <Power className="w-4 h-4" />
                {whatsappBusy ? "Disconnecting..." : "Disconnect"}
              </button>
            ) : (
              <button
                onClick={reconnectProvider}
                disabled={whatsappBusy}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
              >
                <QrCode className="w-4 h-4" />
                {whatsappBusy ? "Preparing..." : "Connect QR"}
              </button>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Evolution API</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {whatsapp?.evolution?.message ||
                    "Start Evolution API locally, then generate a QR code."}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {whatsapp?.evolution?.baseUrl || "http://localhost:8080"}
                </p>
              </div>
              <button
                onClick={refreshEvolutionStatus}
                disabled={whatsappBusy}
                className="p-2 rounded-xl border border-border hover:bg-secondary disabled:opacity-60"
                title="Refresh Evolution status"
              >
                <RefreshCw className={`w-4 h-4 ${whatsappBusy ? "animate-spin" : ""}`} />
              </button>
            </div>

            {whatsappError && (
              <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {whatsappError}
              </div>
            )}

            {!whatsapp?.evolution?.configured && (
              <div className="mt-4 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
                Configure <span className="font-mono">EVOLUTION_API_BASE_URL</span> and{" "}
                <span className="font-mono">EVOLUTION_API_KEY</span> before connecting.
              </div>
            )}

            {whatsapp?.evolution?.qrCode && !whatsapp.connected && (
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="w-44 h-44 rounded-xl border border-border bg-white p-2">
                  <img
                    src={whatsapp.evolution.qrCode}
                    alt="WhatsApp connection QR code"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Scan with WhatsApp linked devices</p>
                  {whatsapp.evolution.pairingCode && (
                    <p className="text-xs text-muted-foreground">
                      Pairing code:{" "}
                      <span className="font-mono text-foreground">
                        {whatsapp.evolution.pairingCode}
                      </span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Last checked:{" "}
                    {whatsapp.evolution.lastCheckedAt
                      ? new Date(whatsapp.evolution.lastCheckedAt).toLocaleTimeString()
                      : "-"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="bg-card rounded-2xl border border-border p-6">
          <div className="mb-5">
            <h3 className="font-display font-bold uppercase tracking-wide">Follow-Up Automation</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Configure inactivity reminders and auto-close behavior for AI-managed sessions.
            </p>
          </div>

          <form onSubmit={saveFollowUp} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-muted-foreground">
                Reminder after seconds
                <input
                  type="number"
                  min={30}
                  value={followUp.nudgeAfterSeconds}
                  onChange={(event) => setFollowUp((prev) => ({ ...prev, nudgeAfterSeconds: Number(event.target.value) }))}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Close after reminder seconds
                <input
                  type="number"
                  min={30}
                  value={followUp.closeAfterSeconds}
                  onChange={(event) => setFollowUp((prev) => ({ ...prev, closeAfterSeconds: Number(event.target.value) }))}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
            </div>
            <label className="block text-xs font-medium text-muted-foreground">
              Reminder message
              <textarea
                value={followUp.nudgeMessage}
                onChange={(event) => setFollowUp((prev) => ({ ...prev, nudgeMessage: event.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Final close message
              <textarea
                value={followUp.closeMessage}
                onChange={(event) => setFollowUp((prev) => ({ ...prev, closeMessage: event.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <button
              type="submit"
              disabled={followUpBusy}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {followUpBusy ? "Saving..." : "Save Follow-Up Settings"}
            </button>
            {settingsMessage && <p className="text-sm text-muted-foreground">{settingsMessage}</p>}
          </form>
        </section>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
