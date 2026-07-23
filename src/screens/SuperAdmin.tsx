"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend } from "@/lib/api/client";

type Row = Record<string, unknown>;

function valueText(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function DataTable({ rows, columns, loading = false }: { rows: Row[]; columns: string[]; loading?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-border bg-secondary text-xs uppercase text-muted-foreground">
          <tr>{columns.map((column) => <th key={column} className="px-4 py-3">{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading ? (
            <TableSkeleton rows={6} columns={columns.length} />
          ) : rows.map((row, index) => (
            <tr key={String(row.id || row._id || index)}>
              {columns.map((column) => <td key={column} className="px-4 py-3">{valueText(row[column])}</td>)}
            </tr>
          ))}
          {!loading && !rows.length && (
            <tr><td className="px-4 py-6 text-muted-foreground" colSpan={columns.length}>No records found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function SuperAdminOverview() {
  const [overview, setOverview] = useState<Row | null>(null);
  useEffect(() => {
    void apiGet<Row>("/api/super-admin/overview").then(setOverview);
  }, []);
  return (
    <DashboardLayout title="Super Admin">
      <div className="grid gap-4 p-5 md:grid-cols-3 md:p-8">
        {!overview ? Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-border bg-card p-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-8 w-20" />
          </div>
        )) : Object.entries(overview || {}).map(([key, value]) => (
          <div key={key} className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs uppercase text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</p>
            <p className="mt-2 text-3xl font-bold">{valueText(value)}</p>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}

export function SuperAdminBusinesses() {
  const [businesses, setBusinesses] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => apiGet<Row[]>("/api/super-admin/businesses").then(setBusinesses);
  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, []);

  const updateStatus = async (businessId: string, status: "active" | "suspended") => {
    await apiSend(`/api/super-admin/businesses/${businessId}`, "PATCH", { status });
    await load();
  };

  return (
    <DashboardLayout title="Businesses">
      <div className="space-y-4 p-5 md:p-8">
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-border bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                {["Business name", "Owner/admin", "Email", "Plan", "Payment", "Status", "WhatsApp status", "Agents count", "Customers count", "Created date", "Actions"].map((column) => (
                  <th key={column} className="px-4 py-3">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <TableSkeleton rows={6} columns={11} />
              ) : businesses.map((business) => (
                <tr key={String(business.id)}>
                  <td className="px-4 py-3 font-semibold">{valueText(business.name)}</td>
                  <td className="px-4 py-3">{valueText(business.ownerName)}</td>
                  <td className="px-4 py-3">{valueText(business.ownerEmail)}</td>
                  <td className="px-4 py-3">{valueText(business.plan)}</td>
                  <td className="px-4 py-3">{valueText(business.paymentStatus)} · {valueText(business.lastPaymentAmount)}</td>
                  <td className="px-4 py-3">{valueText(business.status)}</td>
                  <td className="px-4 py-3">{valueText(business.whatsappStatus)}</td>
                  <td className="px-4 py-3">{valueText(business.agentsCount)}</td>
                  <td className="px-4 py-3">{valueText(business.customersCount)}</td>
                  <td className="px-4 py-3">{valueText(business.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm"><Link href={`/super-admin/businesses/${business.id}`}>View</Link></Button>
                      <Button variant="outline" size="sm" onClick={() => void updateStatus(String(business.id), business.status === "suspended" ? "active" : "suspended")}>
                        {business.status === "suspended" ? "Activate" : "Suspend"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}

export function SuperAdminResource({ title, endpoint, columns }: { title: string; endpoint: string; columns: string[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void apiGet<Row[]>(endpoint).then(setRows).finally(() => setLoading(false));
  }, [endpoint]);
  return (
    <DashboardLayout title={title}>
      <div className="p-5 md:p-8">
        <DataTable rows={rows} columns={columns} loading={loading} />
      </div>
    </DashboardLayout>
  );
}

export function SuperAdminBusinessDetail({ businessId }: { businessId: string }) {
  const [detail, setDetail] = useState<Row | null>(null);
  useEffect(() => {
    void apiGet<Row>(`/api/super-admin/businesses/${businessId}`).then(setDetail);
  }, [businessId]);
  return (
    <DashboardLayout title="Business Detail">
      <div className="space-y-6 p-5 md:p-8">
        <div className="rounded-lg border border-border bg-card p-5">
          {!detail ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-4 w-96" />
            </div>
          ) : (
            <>
              <h2 className="font-display text-xl font-bold">{valueText(detail?.name)}</h2>
              <p className="mt-2 text-sm text-muted-foreground">Plan: {valueText(detail?.plan)} · Status: {valueText(detail?.status)} · Customers: {valueText(detail?.customersCount)}</p>
            </>
          )}
        </div>
        <DataTable rows={(detail?.users as Row[]) || []} columns={["_id", "name", "email", "role", "status"]} loading={!detail} />
        <DataTable rows={(detail?.payments as Row[]) || []} columns={["_id", "provider", "plan", "previousPlan", "status", "amount", "couponCode", "paidAt", "createdAt"]} loading={!detail} />
        <DataTable rows={(detail?.whatsappSessions as Row[]) || []} columns={["_id", "instanceName", "phoneNumber", "status", "lastSyncAt"]} loading={!detail} />
      </div>
    </DashboardLayout>
  );
}

interface PaymentSettings {
  provider: "razorpay";
  source: string;
  keyId: string;
  keySecretMasked: string;
  hasKeySecret: boolean;
  updatedAt: string | null;
}

export function SuperAdminPaymentSettings() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const applySettings = (data: PaymentSettings) => {
    setSettings(data);
    setKeyId(data.keyId || "");
  };

  const load = async () => {
    const data = await apiGet<PaymentSettings>("/api/super-admin/payment-settings");
    applySettings(data);
  };

  useEffect(() => {
    let mounted = true;
    async function loadSettings() {
      try {
        const data = await apiGet<PaymentSettings>("/api/super-admin/payment-settings");
        if (!mounted) return;
        applySettings(data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Payment settings could not be loaded");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await apiSend<PaymentSettings>("/api/super-admin/payment-settings", "PATCH", {
        keyId,
        keySecret,
      });
      setSettings(data);
      setKeySecret("");
      setMessage("Razorpay account updated. New plan payments will use this account.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment settings could not be saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Payment Settings">
      <div className="space-y-6 p-5 md:p-8">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold uppercase">Razorpay Account</h2>
          {loading ? (
            <div className="mt-5 space-y-3">
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-10 w-full max-w-lg" />
              <Skeleton className="h-10 w-full max-w-lg" />
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Current source: <span className="font-semibold text-foreground">{settings?.source}</span>
                {settings?.keySecretMasked ? ` · Secret ${settings.keySecretMasked}` : " · Secret missing"}
              </p>
              <div className="mt-5 grid max-w-2xl gap-4">
                <label className="text-sm font-medium">
                  Razorpay Key ID
                  <input
                    value={keyId}
                    onChange={(event) => setKeyId(event.target.value)}
                    placeholder="rzp_test_..."
                    className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </label>
                <label className="text-sm font-medium">
                  Razorpay Key Secret
                  <input
                    value={keySecret}
                    onChange={(event) => setKeySecret(event.target.value)}
                    placeholder="Enter new secret"
                    type="password"
                    className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </label>
                <Button onClick={() => void save()} disabled={saving || !keyId || !keySecret} className="w-fit">
                  {saving ? "Saving..." : "Save Razorpay Account"}
                </Button>
              </div>
            </>
          )}
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          {message && <p className="mt-4 text-sm font-medium text-emerald-600">{message}</p>}
        </section>
      </div>
    </DashboardLayout>
  );
}
