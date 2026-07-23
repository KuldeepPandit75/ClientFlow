import type { BusinessPlan } from "@/lib/backend/types";

export const PLAN_LIMITS: Record<BusinessPlan, {
  maxAgents: number;
  maxWhatsappAccounts: number;
  maxMonthlyMessages: number;
  maxAutomations: number;
  maxTemplates: number;
  maxAiResponsesPerMonth: number;
}> = {
  free: {
    maxAgents: 1,
    maxWhatsappAccounts: 1,
    maxMonthlyMessages: 500,
    maxAutomations: 1,
    maxTemplates: 10,
    maxAiResponsesPerMonth: 200,
  },
  starter: {
    maxAgents: 3,
    maxWhatsappAccounts: 1,
    maxMonthlyMessages: 5000,
    maxAutomations: 5,
    maxTemplates: 50,
    maxAiResponsesPerMonth: 2000,
  },
  pro: {
    maxAgents: 10,
    maxWhatsappAccounts: 2,
    maxMonthlyMessages: 25000,
    maxAutomations: 25,
    maxTemplates: 200,
    maxAiResponsesPerMonth: 10000,
  },
  enterprise: {
    maxAgents: 100,
    maxWhatsappAccounts: 10,
    maxMonthlyMessages: 250000,
    maxAutomations: 250,
    maxTemplates: 2000,
    maxAiResponsesPerMonth: 100000,
  },
};

export const PLAN_PRICES: Record<BusinessPlan, {
  currency: "INR";
  monthlyAmount: number;
}> = {
  free: {
    currency: "INR",
    monthlyAmount: 0,
  },
  starter: {
    currency: "INR",
    monthlyAmount: 99900,
  },
  pro: {
    currency: "INR",
    monthlyAmount: 299900,
  },
  enterprise: {
    currency: "INR",
    monthlyAmount: 999900,
  },
};
