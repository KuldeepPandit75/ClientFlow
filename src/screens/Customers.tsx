"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, UserPlus } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend } from "@/lib/api/client";
import type { ConversationRecord, SessionUser } from "@/lib/backend/types";
import type { CustomerListItem } from "@/lib/services/conversation-service";

export default function Customers() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [chats, setChats] = useState<ConversationRecord[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [createMode, setCreateMode] = useState<"chat" | "manual">("chat");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [chatCustomerName, setChatCustomerName] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [currentUser, customerItems, chatPage] = await Promise.all([
      apiGet<SessionUser | null>("/api/auth/me"),
      apiGet<CustomerListItem[]>("/api/customers"),
      apiGet<{ items: ConversationRecord[] }>("/api/conversations?limit=50").catch(() => ({ items: [] })),
    ]);
    setUser(currentUser);
    setCustomers(customerItems);
    setChats(chatPage.items);
  };

  useEffect(() => {
    let mounted = true;
    async function loadInitial() {
      try {
        const [currentUser, customerItems, chatPage] = await Promise.all([
          apiGet<SessionUser | null>("/api/auth/me"),
          apiGet<CustomerListItem[]>("/api/customers"),
          apiGet<{ items: ConversationRecord[] }>("/api/conversations?limit=50").catch(() => ({ items: [] })),
        ]);
        if (!mounted) return;
        setUser(currentUser);
        setCustomers(customerItems);
        setChats(chatPage.items);
      } catch (error) {
        if (mounted) setMessage(error instanceof Error ? error.message : "Could not load customers");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadInitial();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) =>
      [customer.customerName, customer.phone, customer.source]
        .some((value) => value.toLowerCase().includes(term)),
    );
  }, [customers, search]);

  const createCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    try {
      await apiSend<CustomerListItem>(
        "/api/customers",
        "POST",
        createMode === "chat"
          ? { chatId: selectedChatId, name: chatCustomerName }
          : { name, phone },
      );
      setName("");
      setPhone("");
      setSelectedChatId("");
      setChatCustomerName("");
      setMessage("Customer saved");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Customer could not be created");
    } finally {
      setCreating(false);
    }
  };

  const canCreate = user?.role === "admin";
  const selectedChat = chats.find((chat) => chat.id === selectedChatId);

  return (
    <DashboardLayout title="Customers">
      <div className="space-y-6 p-5 md:p-8">
        {loading ? (
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3 w-72" />
              </div>
              <Skeleton className="h-10 w-40" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1.3fr_1fr_auto]">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10 w-28" />
            </div>
          </section>
        ) : canCreate && (
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <UserPlus className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <h2 className="font-display text-lg font-bold uppercase">Create Customer</h2>
                <p className="text-xs text-muted-foreground">Create from an existing chat or add a new WhatsApp number manually.</p>
              </div>
              <div className="flex rounded-lg border border-border bg-background p-1">
                <button
                  type="button"
                  onClick={() => setCreateMode("chat")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${createMode === "chat" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  From chat
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode("manual")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${createMode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  Manual
                </button>
              </div>
            </div>

            {createMode === "chat" ? (
              <form onSubmit={createCustomer} className="mt-4 grid gap-3 md:grid-cols-[1.3fr_1fr_auto]">
                <select
                  value={selectedChatId}
                  onChange={(event) => {
                    const chat = chats.find((item) => item.id === event.target.value);
                    setSelectedChatId(event.target.value);
                    setChatCustomerName(chat?.customerName || "");
                  }}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  required
                >
                  <option value="">Select WhatsApp chat</option>
                  {chats.map((chat) => (
                    <option key={chat.id} value={chat.id}>
                      {chat.customerName} · {chat.phone}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Customer name"
                  value={chatCustomerName}
                  onChange={(event) => setChatCustomerName(event.target.value)}
                  required
                />
                <Button type="submit" className="rounded-lg" disabled={creating || !selectedChatId}>
                  <Plus className="h-4 w-4" />
                  {creating ? "Saving..." : "Create"}
                </Button>
                {selectedChat && (
                  <p className="text-xs text-muted-foreground md:col-span-3">
                    Phone: {selectedChat.phone || "-"} · Last message: {selectedChat.lastMessage || "-"}
                  </p>
                )}
                {!chats.length && (
                  <p className="text-xs text-muted-foreground md:col-span-3">
                    No WhatsApp chats found yet. Use Manual to create a new customer.
                  </p>
                )}
              </form>
            ) : (
              <form onSubmit={createCustomer} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <Input placeholder="Customer name" value={name} onChange={(event) => setName(event.target.value)} required />
                <Input placeholder="WhatsApp phone number" value={phone} onChange={(event) => setPhone(event.target.value)} required />
                <Button type="submit" className="rounded-lg" disabled={creating}>
                  <Plus className="h-4 w-4" />
                  {creating ? "Saving..." : "Create"}
                </Button>
              </form>
            )}
            {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
          </section>
        )}

        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold uppercase">All Customers</h2>
              <p className="text-xs text-muted-foreground">
                {user?.role === "sub_agent" ? "Showing customers assigned to you." : "Showing every customer in this business."}
              </p>
            </div>
            <div className="relative md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search customers"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border bg-secondary text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Assigned Agent</th>
                  <th className="px-4 py-3">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <TableSkeleton rows={6} columns={5} />
                ) : filteredCustomers.map((customer) => (
                  <tr key={customer.customerId}>
                    <td className="px-4 py-3 font-semibold">{customer.customerName}</td>
                    <td className="px-4 py-3">{customer.phone}</td>
                    <td className="px-4 py-3 capitalize">{customer.source}</td>
                    <td className="px-4 py-3">{customer.assignedAgentName || "Unassigned"}</td>
                    <td className="px-4 py-3">
                      {customer.lastMessageAt
                        ? new Date(customer.lastMessageAt).toLocaleString()
                        : new Date(customer.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {!loading && !filteredCustomers.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-muted-foreground">
                      No customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
