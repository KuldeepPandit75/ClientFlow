export function validateFeatureParams(input) {
  const errors = [];

  if (typeof input.accountKey !== "string" || !input.accountKey.trim()) errors.push("accountKey");
  if (!Number.isFinite(input.nudgeAfterSeconds) || input.nudgeAfterSeconds < 30) errors.push("nudgeAfterSeconds");
  if (!Number.isFinite(input.closeAfterSeconds) || input.closeAfterSeconds < 30) errors.push("closeAfterSeconds");
  if (typeof input.nudgeMessage !== "string" || !input.nudgeMessage.trim()) errors.push("nudgeMessage");
  if (typeof input.closeMessage !== "string" || !input.closeMessage.trim()) errors.push("closeMessage");

  if (typeof input.templateName !== "string" || !input.templateName.trim()) errors.push("templateName");
  if (typeof input.templateCategory !== "string" || !input.templateCategory.trim()) errors.push("templateCategory");
  if (typeof input.templateBody !== "string" || !input.templateBody.trim()) errors.push("templateBody");
  if (!["draft", "ready", "disabled"].includes(input.templateStatus)) errors.push("templateStatus");

  if (typeof input.bulkName !== "string" || !input.bulkName.trim()) errors.push("bulkName");
  if (typeof input.templateId !== "string" || !input.templateId.trim()) errors.push("templateId");
  if (!Array.isArray(input.recipients) || input.recipients.length === 0) errors.push("recipients");
  if (typeof input.sendAt !== "string" || Number.isNaN(Date.parse(input.sendAt))) errors.push("sendAt");

  if (typeof input.quietHoursEnabled !== "boolean") errors.push("quietHoursEnabled");
  if (!Number.isInteger(input.quietHoursStart) || input.quietHoursStart < 0 || input.quietHoursStart > 23) errors.push("quietHoursStart");
  if (!Number.isInteger(input.quietHoursEnd) || input.quietHoursEnd < 0 || input.quietHoursEnd > 23) errors.push("quietHoursEnd");

  if (typeof input.dataEncryptionKey !== "string" || input.dataEncryptionKey.length < 16) errors.push("dataEncryptionKey");
  if (typeof input.dataEncryptionKeyVersion !== "string" || !/^v\d+$/.test(input.dataEncryptionKeyVersion)) errors.push("dataEncryptionKeyVersion");
  if (typeof input.dataEncryptionKeyOld !== "string") errors.push("dataEncryptionKeyOld");

  if (!["session_nudge", "session_close", "webhook_retry", "bulk_campaign_send", "automation_resume"].includes(input.jobType)) errors.push("jobType");
  if (typeof input.runAt !== "string" || Number.isNaN(Date.parse(input.runAt))) errors.push("runAt");
  if (typeof input.webhookEventId !== "string" || !input.webhookEventId.trim()) errors.push("webhookEventId");
  if (typeof input.optIn !== "boolean") errors.push("optIn");

  return { valid: errors.length === 0, errors };
}

export function validFeatureParamsFixture() {
  return {
    accountKey: "primary",
    nudgeAfterSeconds: 120,
    closeAfterSeconds: 60,
    nudgeMessage: "Ping",
    closeMessage: "Closing",
    templateName: "Offer Template",
    templateCategory: "offers",
    templateBody: "Hello {{customer.name}}",
    templateStatus: "ready",
    bulkName: "Festive Blast",
    templateId: "tpl_123",
    recipients: ["919999999999@s.whatsapp.net"],
    sendAt: "2026-12-01T10:00:00.000Z",
    quietHoursEnabled: false,
    quietHoursStart: 22,
    quietHoursEnd: 8,
    dataEncryptionKey: "1234567890abcdef1234567890abcdef",
    dataEncryptionKeyVersion: "v1",
    dataEncryptionKeyOld: "",
    jobType: "session_nudge",
    runAt: "2026-12-01T10:01:00.000Z",
    webhookEventId: "evt_123",
    optIn: true,
  };
}
