"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, MessageSquare, QrCode, Shield } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

const Landing = () => {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-background grid-bg">
      <nav className="border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <BrandLogo
            iconClassName="h-10 w-10"
            textClassName="font-display text-lg font-bold tracking-tight text-foreground"
          />
          <button
            onClick={() => router.push("/login")}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Login
          </button>
        </div>
      </nav>

      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1fr_420px] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground">
            <Shield className="h-3.5 w-3.5" />
            Production MVP
          </span>
          <h1 className="mt-6 max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Connect WhatsApp and manage live chats from one inbox.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            This release is focused on the working core: authentication, Evolution API QR
            connection, and the WhatsApp inbox.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="mt-10 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Open App <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-4">
            <div className="flex items-start gap-4 rounded-xl bg-secondary/50 p-4">
              <QrCode className="mt-1 h-5 w-5 text-foreground" />
              <div>
                <p className="text-sm font-semibold">Evolution API connection</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generate a QR code in settings and connect a WhatsApp device.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-xl bg-secondary/50 p-4">
              <MessageSquare className="mt-1 h-5 w-5 text-foreground" />
              <div>
                <p className="text-sm font-semibold">Live inbox</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Conversations and messages are loaded from Evolution API after connection.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-xl bg-secondary/50 p-4">
              <Shield className="mt-1 h-5 w-5 text-foreground" />
              <div>
                <p className="text-sm font-semibold">No demo dashboards</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Unconnected CRM, automation, and analytics areas are removed from this MVP.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Landing;
