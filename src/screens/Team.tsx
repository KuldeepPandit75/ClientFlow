"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend } from "@/lib/api/client";
import type { MemberPermission, SessionUser } from "@/lib/backend/types";
import { GRANTABLE_MEMBER_PERMISSIONS } from "@/lib/permissions";
import type { CustomerListItem } from "@/lib/services/conversation-service";

interface InviteRecord {
  id: string;
  name: string;
  email: string;
  status: string;
  expiresAt: string;
  permissions: MemberPermission[];
}

export default function Team() {
  const [agents, setAgents] = useState<SessionUser[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [invitePermissions, setInvitePermissions] = useState<MemberPermission[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const team = await apiGet<{ agents: SessionUser[]; invites: InviteRecord[] }>("/api/team");
    const customerItems = await apiGet<CustomerListItem[]>("/api/customers");
    setAgents(team.agents);
    setInvites(team.invites);
    setCustomers(customerItems);
  };

  useEffect(() => {
    let mounted = true;
    async function loadInitial() {
      try {
        const team = await apiGet<{ agents: SessionUser[]; invites: InviteRecord[] }>("/api/team");
        const customerItems = await apiGet<CustomerListItem[]>("/api/customers");
        if (!mounted) return;
        setAgents(team.agents);
        setInvites(team.invites);
        setCustomers(customerItems);
      } catch (error) {
        if (mounted) setMessage(error instanceof Error ? error.message : "Could not load team");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadInitial();
    return () => {
      mounted = false;
    };
  }, []);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setInviteLink("");
    try {
      const result = await apiSend<{ inviteLink: string }>("/api/team/invites", "POST", {
        name,
        email,
        permissions: invitePermissions,
      });
      setInviteLink(result.inviteLink);
      setName("");
      setEmail("");
      setInvitePermissions([]);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invite failed");
    }
  };

  const updateAgent = async (agentUserId: string, status: "active" | "disabled") => {
    await apiSend(`/api/team/agents/${agentUserId}`, "PATCH", { status });
    await load();
  };

  const toggleAgentPermission = async (agent: SessionUser, permission: MemberPermission) => {
    const permissions = agent.permissions.includes(permission)
      ? agent.permissions.filter((item) => item !== permission)
      : [...agent.permissions, permission];
    await apiSend(`/api/team/agents/${agent.id}`, "PATCH", { permissions });
    await load();
  };

  const removeAgent = async (agent: SessionUser) => {
    const confirmed = window.confirm(`Permanently remove ${agent.name}? Their assigned customers will become unassigned.`);
    if (!confirmed) return;
    await apiSend(`/api/team/agents/${agent.id}`, "DELETE");
    await load();
  };

  const assignCustomer = async (customerId: string, agentUserId: string) => {
    await apiSend(`/api/customers/${encodeURIComponent(customerId)}/assign`, "POST", {
      agentUserId: agentUserId || null,
    });
    await load();
  };

  return (
    <DashboardLayout title="Team">
      <div className="space-y-6 p-5 md:p-8">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold uppercase">Invite Agent</h2>
          <form onSubmit={invite} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <Input placeholder="Agent name" value={name} onChange={(event) => setName(event.target.value)} required />
            <Input type="email" placeholder="Agent email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <Button type="submit" className="rounded-lg">Invite</Button>
          </form>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {GRANTABLE_MEMBER_PERMISSIONS.map((permission) => (
              <label key={permission.key} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={invitePermissions.includes(permission.key)}
                  onChange={() => setInvitePermissions((current) => current.includes(permission.key)
                    ? current.filter((item) => item !== permission.key)
                    : [...current, permission.key])}
                />
                <span><strong className="block">{permission.label}</strong><span className="text-xs text-muted-foreground">{permission.description}</span></span>
              </label>
            ))}
          </div>
          {inviteLink && (
            <div className="mt-4 rounded-lg border border-border bg-secondary p-3 text-sm">
              <p className="font-semibold">Copy invite link</p>
              <p className="mt-1 break-all font-mono text-xs">{inviteLink}</p>
            </div>
          )}
          {message && <p className="mt-3 text-sm text-destructive">{message}</p>}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-lg font-bold uppercase">Sub-agents</h2>
            <div className="mt-4 divide-y divide-border">
              {loading ? Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between gap-4 py-3">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-10 w-24" />
                </div>
              )) : agents.map((agent) => (
                <div key={agent.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">{agent.email} · {agent.status}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {GRANTABLE_MEMBER_PERMISSIONS.map((permission) => (
                        <button
                          key={permission.key}
                          type="button"
                          onClick={() => void toggleAgentPermission(agent, permission.key)}
                          className={`rounded-full border px-2 py-1 text-[11px] ${agent.permissions.includes(permission.key) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                          title={permission.description}
                        >
                          {permission.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void updateAgent(agent.id, agent.status === "disabled" ? "active" : "disabled")}
                    >
                      {agent.status === "disabled" ? "Activate" : "Disable"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void removeAgent(agent)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              {!loading && !agents.length && <p className="py-4 text-sm text-muted-foreground">No sub-agents yet.</p>}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-lg font-bold uppercase">Invites</h2>
            <div className="mt-4 divide-y divide-border">
              {loading ? Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="space-y-2 py-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-52" />
                </div>
              )) : invites.map((inviteItem) => (
                <div key={inviteItem.id} className="py-3">
                  <p className="font-semibold">{inviteItem.name}</p>
                  <p className="text-xs text-muted-foreground">{inviteItem.email} · {inviteItem.status}</p>
                </div>
              ))}
              {!loading && !invites.length && <p className="py-4 text-sm text-muted-foreground">No invites yet.</p>}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold uppercase">Assign Customers</h2>
          <div className="mt-4 divide-y divide-border">
            {loading ? Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="grid gap-3 py-3 md:grid-cols-[1fr_220px] md:items-center">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-10" />
              </div>
            )) : customers.map((customer) => (
              <div key={customer.id} className="grid gap-3 py-3 md:grid-cols-[1fr_220px] md:items-center">
                <div>
                  <p className="font-semibold">{customer.customerName}</p>
                  <p className="text-xs text-muted-foreground">{customer.phone}</p>
                </div>
                <select
                  value={customer.assignedAgentId || ""}
                  onChange={(event) => void assignCustomer(customer.id, event.target.value)}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {agents.filter((agent) => agent.status === "active").map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              </div>
            ))}
            {!loading && !customers.length && <p className="py-4 text-sm text-muted-foreground">No customers found yet.</p>}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
