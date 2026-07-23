"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend } from "@/lib/api/client";
import type { BusinessPlan } from "@/lib/backend/types";

interface PlanLimits {
  maxAgents: number;
  maxWhatsappAccounts: number;
  maxMonthlyMessages: number;
  maxAutomations: number;
}

interface BillingData {
  business: {
    id: string;
    name: string;
    status: string;
    plan: BusinessPlan;
  };
  owner: {
    name: string;
    email: string;
  } | null;
  limits: PlanLimits;
  usage: {
    agents: number;
    whatsappAccounts: number;
    customers: number;
    monthlyMessages: number;
    automations: number;
  };
  plans: Array<{
    name: BusinessPlan;
    limits: PlanLimits;
    current: boolean;
    price: {
      currency: "INR";
      monthlyAmount: number;
    };
  }>;
}

interface PlanOrderResponse {
  requiresPayment: boolean;
  message?: string;
  plan: BusinessPlan;
  amount: number;
  originalAmount: number;
  discountAmount: number;
  keyId?: string;
  orderId?: string;
  currency?: "INR";
}

interface RazorpayResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, callback: (response: { error?: { description?: string } }) => void) => void;
    };
  }
}

async function loadRazorpayCheckout() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Payment checkout failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Payment checkout failed to load"));
    document.body.appendChild(script);
  });
}

function usagePercent(value: number, limit: number) {
  if (!limit) return 0;
  return Math.min(100, Math.round((value / limit) * 100));
}

function formatMoney(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function planLabel(plan: BusinessPlan) {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function UsageRow({ label, value, limit }: { label: string; value: number; limit: number }) {
  const percent = usagePercent(value, limit);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value.toLocaleString()} / {limit.toLocaleString()}</span>
      </div>
      <div className="h-2 rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function Billing() {
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyPlan, setBusyPlan] = useState<BusinessPlan | null>(null);

  const loadBilling = useCallback(async () => {
    setError("");
    const data = await apiGet<BillingData>("/api/billing");
    setBilling(data);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await apiGet<BillingData>("/api/billing");
        if (mounted) setBilling(data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Billing could not be loaded");
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  async function handlePlanChange(plan: BusinessPlan) {
    setBusyPlan(plan);
    setError("");
    setMessage("");

    try {
      const order = await apiSend<PlanOrderResponse>("/api/billing/order", "POST", {
        plan,
      });
      if (order.requiresPayment) {
        if (!order.keyId || !order.orderId) throw new Error("Payment order details are missing");
        await loadRazorpayCheckout();
        if (!window.Razorpay) throw new Error("Payment checkout is unavailable");
        const RazorpayCheckout = window.Razorpay;
        const payment = await new Promise<RazorpayResult>((resolve, reject) => {
          let settled = false;
          const checkout = new RazorpayCheckout({
            key: order.keyId,
            order_id: order.orderId,
            amount: order.amount,
            currency: order.currency || "INR",
            name: billing?.business.name || "WhatsApp Automation",
            description: `${planLabel(plan)} monthly plan`,
            handler: (result: RazorpayResult) => {
              settled = true;
              resolve(result);
            },
            modal: {
              ondismiss: () => {
                if (!settled) reject(new Error("Payment was cancelled"));
              },
            },
          });
          checkout.on("payment.failed", (response) => {
            settled = true;
            reject(new Error(response.error?.description || "Payment failed"));
          });
          checkout.open();
        });
        await apiSend("/api/billing/verify", "POST", payment);
      }
      setMessage(order.message || `${planLabel(plan)} plan is now active.`);
      await loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan could not be changed");
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <DashboardLayout title="Billing">
      <div className="space-y-6 p-5 md:p-8">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold uppercase">Current Plan</h2>
              {billing ? (
                <p className="text-sm text-muted-foreground">
                  {billing.business.name} is on <span className="font-semibold uppercase text-foreground">{billing.business.plan}</span> · {billing.business.status}
                </p>
              ) : (
                <Skeleton className="mt-2 h-4 w-72" />
              )}
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          {message && <p className="mt-4 text-sm font-medium text-emerald-600">{message}</p>}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="font-display text-base font-bold uppercase">Usage</h3>
            <div className="mt-5 space-y-5">
              {billing ? (
                <>
                  <UsageRow label="Sub-agents" value={billing.usage.agents} limit={billing.limits.maxAgents} />
                  <UsageRow label="WhatsApp accounts" value={billing.usage.whatsappAccounts} limit={billing.limits.maxWhatsappAccounts} />
                  <UsageRow label="Monthly messages" value={billing.usage.monthlyMessages} limit={billing.limits.maxMonthlyMessages} />
                  <UsageRow label="Automations" value={billing.usage.automations} limit={billing.limits.maxAutomations} />
                  <div className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
                    Customers tracked: <span className="font-semibold text-foreground">{billing.usage.customers.toLocaleString()}</span>
                  </div>
                </>
              ) : (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="font-display text-base font-bold uppercase">Plans</h3>
                <p className="mt-1 text-sm text-muted-foreground">Choose a plan. Paid changes use Razorpay unless local learning mode is enabled.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {billing ? billing.plans.map((plan) => (
                <div key={plan.name} className={`rounded-lg border p-4 ${plan.current ? "border-primary bg-secondary" : "border-border"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display text-lg font-bold uppercase">{plan.name}</p>
                      <p className="mt-1 text-sm font-semibold">
                        {formatMoney(plan.price.monthlyAmount, plan.price.currency)}
                        <span className="font-normal text-muted-foreground"> / month</span>
                      </p>
                    </div>
                    {plan.current && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <p>{plan.limits.maxAgents} agents</p>
                    <p>{plan.limits.maxWhatsappAccounts} WhatsApp account{plan.limits.maxWhatsappAccounts > 1 ? "s" : ""}</p>
                    <p>{plan.limits.maxMonthlyMessages.toLocaleString()} monthly messages</p>
                    <p>{plan.limits.maxAutomations} automations</p>
                  </div>
                  <button
                    type="button"
                    disabled={plan.current || busyPlan !== null}
                    onClick={() => void handlePlanChange(plan.name)}
                    className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyPlan === plan.name ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing
                      </>
                    ) : plan.current ? (
                      "Current plan"
                    ) : (
                      "Switch plan"
                    )}
                  </button>
                </div>
              )) : Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-lg border border-border p-4">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="mt-4 h-3 w-32" />
                  <Skeleton className="mt-2 h-3 w-44" />
                  <Skeleton className="mt-2 h-3 w-36" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
