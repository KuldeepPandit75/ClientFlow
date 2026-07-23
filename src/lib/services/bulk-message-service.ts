import { Db, ObjectId } from "mongodb";
import type { SessionUser } from "@/lib/backend/types";
import { getDb } from "@/lib/db/mongodb";
import { canSendBulk } from "@/lib/permissions";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { previewMessageTemplate } from "@/lib/services/message-template-service";
import { sendMessage } from "@/lib/services/conversation-service";
import { enqueueJob } from "@/lib/services/job-service";
import { extractTemplateVariables } from "@/lib/templates/template-placeholders.mjs";

function requireAdmin(user: SessionUser): asserts user is SessionUser & { businessId: string } {
  if (!canSendBulk(user) || !user.businessId) throw new Error("Forbidden");
}

async function renderForRecipient(input: {
  db: Db;
  businessId: ObjectId;
  businessName: string;
  recipient: string;
  body: string;
  values: Record<string, string>;
}) {
  const customer = await input.db.collection("customers").findOne({
    businessId: input.businessId,
    customerId: input.recipient,
  });
  const agent = customer?.assignedAgentId
    ? await input.db.collection("users").findOne({ _id: customer.assignedAgentId }, { projection: { name: 1 } })
    : null;
  return previewMessageTemplate({
    body: input.body,
    useExamples: false,
    values: {
      ...input.values,
      "customer.name": String(customer?.customerName || customer?.phone || input.recipient.split("@")[0]),
      "customer.phone": String(customer?.phone || input.recipient.split("@")[0]),
      "business.name": input.businessName,
      "agent.name": String(agent?.name || "our support team"),
      "lastMessage.text": String(customer?.lastMessage || ""),
    },
  });
}

export async function createBulkCampaign(user: SessionUser, input: {
  name: string;
  templateBody?: string;
  templateId?: string;
  recipients: string[];
  values?: Record<string, string>;
  sendAt?: string | null;
}) {
  requireAdmin(user);
  const businessId = user.businessId;
  if (!businessId) throw new Error("Business workspace is missing");
  const name = String(input.name || "").trim();
  if (!name) throw new Error("name is required");
  let templateBody = String(input.templateBody || "").trim();

  const uniqueRecipients = Array.from(new Set((input.recipients || []).map((r) => String(r).trim()).filter(Boolean)));
  if (!uniqueRecipients.length) throw new Error("At least one recipient is required");

  const db = await getDb();
  const businessObjectId = new ObjectId(businessId);
  const business = await db.collection("businesses").findOne({ _id: businessObjectId });
  if (!business) throw new Error("Business not found");

  if (input.templateId) {
    if (!ObjectId.isValid(input.templateId)) throw new Error("Invalid templateId");
    const template = await db.collection("message_templates").findOne({
      _id: new ObjectId(input.templateId),
      businessId: businessObjectId,
    });
    if (!template) throw new Error("Template not found");
    const status = String((template as Record<string, unknown>).status || "draft");
    if (status !== "ready" && status !== "approved") {
      throw new Error("Only workspace-ready templates can be used for bulk messaging");
    }
    templateBody = String((template as Record<string, unknown>).body || "").trim();
  }
  if (!templateBody) throw new Error("templateBody is required");
  const automaticVariables = new Set(["customer.name", "customer.phone", "business.name", "agent.name", "lastMessage.text"]);
  const variables = extractTemplateVariables(templateBody);
  const missingValues = variables.filter((variable) => !automaticVariables.has(variable) && !String(input.values?.[variable] || "").trim());
  if (missingValues.length) {
    throw new Error(`Provide values for: ${missingValues.map((variable) => `{{${variable}}}`).join(", ")}`);
  }

  const plan = String(business.plan || "free") as keyof typeof PLAN_LIMITS;
  const monthlyLimit = PLAN_LIMITS[plan]?.maxMonthlyMessages || 500;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const sentThisMonth = await db.collection("messages").countDocuments({
    businessId: businessObjectId,
    createdAt: { $gte: monthStart },
  });

  if (sentThisMonth + uniqueRecipients.length > monthlyLimit) {
    throw new Error(`Campaign exceeds monthly message limit (${monthlyLimit}).`);
  }

  const sendAt = input.sendAt ? new Date(input.sendAt) : null;
  const scheduled = Boolean(sendAt && !Number.isNaN(sendAt.getTime()) && sendAt.getTime() > Date.now());

  const campaign = {
    businessId: businessObjectId,
    createdByUserId: new ObjectId(user.id),
    name,
    templateBody,
    templateId: input.templateId || null,
    values: input.values || {},
    recipients: uniqueRecipients,
    sendAt: scheduled ? sendAt : null,
    status: scheduled ? "scheduled" : "sending",
    totalRecipients: uniqueRecipients.length,
    sentCount: 0,
    failedCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection("bulk_campaigns").insertOne(campaign);

  if (scheduled && sendAt) {
    await enqueueJob({
      type: "bulk_campaign_send",
      businessId,
      runAt: sendAt,
      payload: { campaignId: result.insertedId.toString() },
      dedupeKey: `bulk_campaign_send:${result.insertedId.toString()}`,
    });
    return { id: result.insertedId.toString(), ...campaign };
  }

  let sentCount = 0;
  let failedCount = 0;
  for (const recipient of uniqueRecipients) {
    const content = await renderForRecipient({
      db,
      businessId: businessObjectId,
      businessName: String(business.name || "Our Business"),
      recipient,
      body: templateBody,
      values: input.values || {},
    });
    try {
      await sendMessage({ userEmail: user.email, conversationId: recipient, content });
      sentCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  const finalStatus = failedCount === 0 ? "sent" : sentCount > 0 ? "partial" : "failed";
  await db.collection("bulk_campaigns").updateOne(
    { _id: result.insertedId },
    {
      $set: {
        status: finalStatus,
        sentCount,
        failedCount,
        updatedAt: new Date(),
      },
    },
  );

  return {
    id: result.insertedId.toString(),
    ...campaign,
    status: finalStatus,
    sentCount,
    failedCount,
  };
}

export async function listBulkCampaigns(user: SessionUser) {
  requireAdmin(user);
  const businessId = user.businessId;
  if (!businessId) throw new Error("Business workspace is missing");
  const db = await getDb();
  const campaigns = await db.collection("bulk_campaigns")
    .find({ businessId: new ObjectId(businessId) })
    .sort({ createdAt: -1 })
    .toArray();

  return campaigns.map((campaign) => ({
    id: campaign._id.toString(),
    name: String((campaign as Record<string, unknown>).name || ""),
    status: String((campaign as Record<string, unknown>).status || "scheduled"),
    totalRecipients: Number((campaign as Record<string, unknown>).totalRecipients || 0),
    sentCount: Number((campaign as Record<string, unknown>).sentCount || 0),
    failedCount: Number((campaign as Record<string, unknown>).failedCount || 0),
    sendAt: (campaign as Record<string, unknown>).sendAt || null,
    createdAt: (campaign as Record<string, unknown>).createdAt,
    updatedAt: (campaign as Record<string, unknown>).updatedAt,
  }));
}

export async function processBulkCampaign(campaignId: string) {
  if (!ObjectId.isValid(campaignId)) throw new Error("Invalid campaignId");
  const db = await getDb();
  const campaign = await db.collection("bulk_campaigns").findOne({ _id: new ObjectId(campaignId) });
  if (!campaign) throw new Error("Campaign not found");
  const currentStatus = String((campaign as Record<string, unknown>).status || "");
  if (!["scheduled", "sending"].includes(currentStatus)) {
    return { skipped: true, reason: `Campaign is ${currentStatus}` };
  }

  const businessObjectId = (campaign as Record<string, unknown>).businessId as ObjectId | undefined;
  if (!businessObjectId) throw new Error("Campaign business is missing");
  const business = await db.collection("businesses").findOne({ _id: businessObjectId });
  if (!business?.ownerUserId) throw new Error("Business owner not found");
  const owner = await db.collection<{ email: string }>("users").findOne({ _id: business.ownerUserId });
  if (!owner?.email) throw new Error("Business owner email not found");

  await db.collection("bulk_campaigns").updateOne(
    { _id: new ObjectId(campaignId) },
    { $set: { status: "sending", updatedAt: new Date() } },
  );

  const recipients = Array.isArray((campaign as Record<string, unknown>).recipients)
    ? ((campaign as Record<string, unknown>).recipients as unknown[]).map(String)
    : [];
  const templateBody = String((campaign as Record<string, unknown>).templateBody || "");
  const values = ((campaign as Record<string, unknown>).values || {}) as Record<string, string>;

  let sentCount = 0;
  let failedCount = 0;
  for (const recipient of recipients) {
    const content = await renderForRecipient({
      db,
      businessId: businessObjectId,
      businessName: String(business.name || "Our Business"),
      recipient,
      body: templateBody,
      values,
    });
    try {
      await sendMessage({ userEmail: owner.email, conversationId: recipient, content });
      sentCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  const finalStatus = failedCount === 0 ? "sent" : sentCount > 0 ? "partial" : "failed";
  await db.collection("bulk_campaigns").updateOne(
    { _id: new ObjectId(campaignId) },
    {
      $set: {
        status: finalStatus,
        sentCount,
        failedCount,
        updatedAt: new Date(),
      },
    },
  );

  return { sentCount, failedCount, status: finalStatus };
}
