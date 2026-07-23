"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AutomationForm } from "@/components/automation/AutomationForm";

export default function NewAutomationPage() {
  return (
    <DashboardLayout title="Create Automation">
      <AutomationForm mode="create" />
    </DashboardLayout>
  );
}
