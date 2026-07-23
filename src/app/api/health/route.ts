import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/mongodb";
import { getEvolutionConfig, isEvolutionConfigured } from "@/lib/evolution/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const config = getEvolutionConfig();

  const [database, evolution] = await Promise.allSettled([
    getDb().then((db) => db.command({ ping: 1 })),
    isEvolutionConfigured(config)
      ? fetch(`${config.baseUrl}/instance/fetchInstances`, {
          cache: "no-store",
          headers: { apikey: config.apiKey },
          signal: AbortSignal.timeout(5_000),
        }).then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return true;
        })
      : Promise.reject(new Error("Evolution environment variables are missing")),
  ]);

  const checks = {
    database: database.status === "fulfilled" ? "ok" : "error",
    evolution: evolution.status === "fulfilled" ? "ok" : "error",
    authSecret: process.env.AUTH_SECRET ? "configured" : "missing",
    cronSecret: process.env.CRON_SECRET ? "configured" : "missing",
  };
  const healthy = Object.values(checks).every((value) => value === "ok" || value === "configured");

  return NextResponse.json({
    status: healthy ? "ok" : "degraded",
    checks,
    responseTimeMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  }, { status: healthy ? 200 : 503 });
}
