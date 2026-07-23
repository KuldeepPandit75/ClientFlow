"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AutomationForm } from "@/components/automation/AutomationForm";
import { useParams } from "next/navigation";

export default function EditAutomationPage() {
  const params = useParams();
  const automationId = params?.automationId as string;

  return (
    <DashboardLayout title="Edit Automation">
      <AutomationForm mode="edit" automationId={automationId} />
    </DashboardLayout>
  );
}
