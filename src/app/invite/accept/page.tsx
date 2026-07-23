"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend } from "@/lib/api/client";

function AcceptInviteForm() {
  const params = useSearchParams();
  const token = useMemo(() => params.get("token") || "", [params]);
  const router = useRouter();
  const [invite, setInvite] = useState<{ name: string; email: string; businessName: string } | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const visibleError = error || (!token ? "Invite token is missing" : "");

  useEffect(() => {
    if (!token) return;
    void apiGet<{ name: string; email: string; businessName: string }>(`/api/invite/accept?token=${encodeURIComponent(token)}`)
      .then(setInvite)
      .catch((err) => setError(err instanceof Error ? err.message : "Invite could not be loaded"));
  }, [token]);

  const accept = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await apiSend("/api/invite/accept", "POST", { token, password });
      router.push("/inbox");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite could not be accepted");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-5">
      <form onSubmit={accept} className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <BrandLogo iconClassName="mb-5 h-12 w-12" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ClientFlow Invite</p>
        <h1 className="mt-2 font-display text-2xl font-bold">Join {invite?.businessName || "workspace"}</h1>
        {invite && (
          <p className="mt-2 text-sm text-muted-foreground">
            Your account will be created for {invite.name} at {invite.email}.
          </p>
        )}
        <Input
          type="password"
          minLength={6}
          placeholder="Create password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-5 h-12 rounded-lg"
          required
        />
        <Button type="submit" className="mt-4 h-12 w-full rounded-lg" disabled={!invite}>
          Accept Invite
        </Button>
        {visibleError && <p className="mt-4 text-center text-sm text-destructive">{visibleError}</p>}
      </form>
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-background p-5 text-sm text-muted-foreground">Loading invite...</main>}>
      <AcceptInviteForm />
    </Suspense>
  );
}
