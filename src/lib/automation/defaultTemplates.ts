import { getDb } from "@/lib/db/mongodb";
import type { AutomationTemplateDocument } from "@/lib/automation/types";

const DEFAULT_TEMPLATES: Omit<AutomationTemplateDocument, "_id">[] = [
  {
    name: "AI Sales Lead Qualifier",
    category: "sales",
    description: "Understand the enquiry, answer only from business knowledge, collect lead details, and hand over when uncertain.",
    mode: "ai_agent",
    setupSteps: [
      "Add products, services, prices, locations, working hours, and policies to Knowledge.",
      "Edit the AI instruction with the lead fields your team requires.",
      "Test in draft mode before enabling auto-send.",
    ],
    editablePlaceholders: [
      { key: "business.name", description: "Filled automatically from the workspace", example: "Acme Services" },
      { key: "customer.name", description: "Filled automatically from the conversation", example: "Priya" },
    ],
    exampleConversation: {
      customer: "I need a website for my clinic. What will it cost?",
      assistant: "I can help with that. To suggest the right scope, how many pages or booking features do you need, and what timeline and budget range are you considering?",
    },
    trigger: { type: "new_message_received", config: {} },
    conditions: [
      { id: "cond_1", type: "message_type_is", operator: "equals", value: "text", config: {} },
    ],
    conditionLogic: "AND",
    actions: [
      {
        id: "action_1",
        type: "send_ai_reply",
        order: 1,
        config: {
          mode: "auto_send",
          tone: "friendly, concise, and consultative",
          language: "auto",
          sessionMode: true,
          useChatHistory: true,
          maxHistoryMessages: 12,
          greetOnce: true,
          inactivityNudgeEnabled: true,
          nudgeAfterSeconds: 120,
          closeAfterSeconds: 30,
          nudgeMessage: "Are you still there? I can help you with the next step whenever you are ready.",
          closeMessage: "I will pause this chat for now. Message me anytime and we can continue from here.",
          instruction:
            "You are the sales assistant for {{business.name}}. Answer only from the business knowledge provided. Understand the requirement and collect the customer's desired product or service, location, timeline, and budget when relevant. Ask only one or two useful questions at a time. Never invent prices, stock, availability, guarantees, discounts, links, or delivery dates. If information is missing or the customer requests a human, hand over.",
          fallbackMessage:
            "Thanks for sharing this. I can help you plan and build the MVP. Please share the must-have features, target users, timeline, and budget so I can suggest the best next step.",
        },
      },
      { id: "action_2", type: "add_tag", order: 2, config: { tag: "ai-sales-session" } },
    ],
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "AI FAQ and Support Triage",
    category: "support",
    description: "Answer known FAQs, collect troubleshooting details, and hand unknown or sensitive issues to a person.",
    mode: "ai_agent",
    setupSteps: [
      "Add FAQs, policies, troubleshooting steps, and escalation contacts to Knowledge.",
      "Start in draft mode and review at least 20 realistic test questions.",
      "Enable auto-send only after the fallback and handover behavior are correct.",
    ],
    exampleConversation: {
      customer: "My payment completed but the order still says pending.",
      assistant: "Please share your order number and payment reference. I won’t ask for your PIN, OTP, or full card information. A team member can then verify the live status.",
    },
    trigger: { type: "new_message_received", config: {} },
    conditions: [{ id: "cond_1", type: "message_type_is", operator: "equals", value: "text", config: {} }],
    conditionLogic: "AND",
    actions: [
      {
        id: "action_1",
        type: "send_ai_reply",
        order: 1,
        config: {
          mode: "draft",
          tone: "calm, concise, and helpful",
          language: "auto",
          useChatHistory: true,
          maxHistoryMessages: 12,
          instruction: "You are the support assistant for {{business.name}}. Answer only with verified steps from business knowledge. Understand the issue and ask for safe identifiers such as an order or ticket number. Never request passwords, PINs, OTPs, CVVs, or full payment-card data. Do not claim an issue is fixed unless the customer confirms it. If the answer is missing, the issue is sensitive, or the customer is upset, hand over to a human.",
          fallbackMessage: "I want to make sure you get the correct support. I’m passing this conversation to a team member now.",
        },
      },
      { id: "action_2", type: "add_tag", order: 2, config: { tag: "ai-support" } },
    ],
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "AI Appointment Enquiry Assistant",
    category: "appointments",
    description: "Collect service, preferred date, time, and location without inventing calendar availability.",
    mode: "ai_agent",
    setupSteps: [
      "Add services, locations, working hours, preparation instructions, and cancellation rules to Knowledge.",
      "Keep draft mode until a team member has checked the responses.",
      "The assistant collects preferences; a person must confirm actual availability.",
    ],
    exampleConversation: {
      customer: "Can I book a haircut tomorrow evening?",
      assistant: "I can collect your preference for the team. Which branch and approximate time tomorrow evening would suit you? The team will confirm actual availability.",
    },
    trigger: { type: "new_message_received", config: {} },
    conditions: [{ id: "cond_1", type: "message_contains", operator: "contains", value: ["book", "appointment", "schedule", "available"], config: {} }],
    conditionLogic: "AND",
    actions: [
      {
        id: "action_1",
        type: "send_ai_reply",
        order: 1,
        config: {
          mode: "draft",
          tone: "friendly and efficient",
          language: "auto",
          useChatHistory: true,
          instruction: "You are the appointment enquiry assistant for {{business.name}}. Collect the requested service, preferred date, preferred time, location, and customer name. Use business knowledge for working hours and policies. Never claim a slot is available or booked because you do not control a calendar. Clearly say the team will confirm availability. Hand over when all required details are collected.",
          fallbackMessage: "Please share the service, preferred date and time, and location. Our team will confirm availability shortly.",
        },
      },
      { id: "action_2", type: "add_tag", order: 2, config: { tag: "appointment-enquiry" } },
      { id: "action_3", type: "assign_round_robin", order: 3, config: {} },
    ],
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "AI Order Enquiry Assistant",
    category: "orders",
    description: "Collect order details and answer only documented delivery, return, and payment questions.",
    mode: "ai_agent",
    setupSteps: [
      "Add shipping, returns, cancellations, refunds, and payment policies to Knowledge.",
      "The assistant cannot look up live order state unless an approved internal tool is added later.",
      "Use draft mode until replies consistently match your policies.",
    ],
    exampleConversation: {
      customer: "Where is order ORD-2048?",
      assistant: "Please share the phone number used for the order. I can collect the details, but a team member must check the live tracking status.",
    },
    trigger: { type: "new_message_received", config: {} },
    conditions: [{ id: "cond_1", type: "message_contains", operator: "contains", value: ["order", "delivery", "refund", "return", "tracking"], config: {} }],
    conditionLogic: "AND",
    actions: [
      {
        id: "action_1",
        type: "send_ai_reply",
        order: 1,
        config: {
          mode: "draft",
          tone: "clear and reassuring",
          language: "auto",
          useChatHistory: true,
          instruction: "You handle order enquiries for {{business.name}}. Ask for the order number and safe identifying information. Explain only policies found in business knowledge. Do not invent live order state, tracking, refund approval, or delivery dates. Never request OTPs, passwords, CVVs, or full card details. Hand over when a system lookup or decision is required.",
          fallbackMessage: "Please share your order number and the phone number used for the order. A team member will check the live status for you.",
        },
      },
      { id: "action_2", type: "add_tag", order: 2, config: { tag: "order-enquiry" } },
    ],
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "First-time Customer Welcome",
    category: "onboarding",
    description: "Send a welcome message and tag new WhatsApp customers automatically.",
    trigger: { type: "first_message_from_customer", config: {} },
    conditions: [
      { id: "cond_1", type: "customer_is_new", operator: "equals", value: true, config: {} },
    ],
    conditionLogic: "AND",
    actions: [
      {
        id: "action_1",
        type: "send_text_message",
        order: 1,
        config: {
          message: "Hi {{customer.name}}, thanks for contacting {{business.name}}. We help businesses manage WhatsApp chats, automation, and customer support. How can we help you today?",
        },
      },
      { id: "action_2", type: "add_tag", order: 2, config: { tag: "new-lead" } },
      { id: "action_3", type: "update_customer_status", order: 3, config: { status: "active" } },
    ],
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Pricing Keyword Auto Reply",
    category: "sales",
    description: "Auto-reply when a customer asks about pricing, cost, or plans.",
    trigger: { type: "new_message_received", config: {} },
    conditions: [
      { id: "cond_1", type: "message_contains", operator: "contains", value: ["price", "pricing", "cost", "plan"], config: {} },
    ],
    conditionLogic: "AND",
    actions: [
      {
        id: "action_1",
        type: "send_ai_reply",
        order: 1,
        config: {
          instruction: "Reply politely with pricing information if available. If pricing is not configured, ask the customer what service they are interested in and tell them our team will help shortly.",
          tone: "professional",
          language: "auto",
          mode: "auto_send",
          fallbackMessage: "Thanks for your interest in our pricing! Let me connect you with our sales team who can provide detailed pricing for your needs. What service are you most interested in?",
        },
      },
      { id: "action_2", type: "add_tag", order: 2, config: { tag: "pricing-inquiry" } },
    ],
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Assign New Lead to Agent",
    category: "assignment",
    description: "Automatically assign new unassigned customers to a sub-agent using round-robin.",
    trigger: { type: "new_customer_created", config: {} },
    conditions: [
      { id: "cond_1", type: "customer_unassigned", operator: "equals", value: true, config: {} },
    ],
    conditionLogic: "AND",
    actions: [
      { id: "action_1", type: "assign_round_robin", order: 1, config: {} },
    ],
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Follow-up After No Reply",
    category: "engagement",
    description: "Send a follow-up message when a customer hasn't replied for 24 hours.",
    trigger: { type: "no_reply_after_delay", config: { delayMinutes: 1440 } },
    conditions: [],
    conditionLogic: "AND",
    actions: [
      {
        id: "action_1",
        type: "send_text_message",
        order: 1,
        config: {
          message: "Hi {{customer.name}}, just checking in! Is there anything else we can help you with? Feel free to reach out anytime.",
        },
      },
      { id: "action_2", type: "notify_agent", order: 2, config: { message: "Customer {{customer.name}} has not replied in 24 hours." } },
    ],
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Support Request Tagging",
    category: "support",
    description: "Tag messages containing support-related keywords for prioritization.",
    trigger: { type: "new_message_received", config: {} },
    conditions: [
      { id: "cond_1", type: "message_contains", operator: "contains", value: ["help", "support", "issue", "problem", "bug", "error"], config: {} },
    ],
    conditionLogic: "AND",
    actions: [
      { id: "action_1", type: "add_tag", order: 1, config: { tag: "support-request" } },
      { id: "action_2", type: "notify_admin", order: 2, config: { message: "Support request from {{customer.name}}: {{lastMessage.text}}" } },
    ],
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "AI Reply for Existing Customer",
    category: "engagement",
    description: "Generate an AI-powered response for messages from returning customers.",
    trigger: { type: "new_message_received", config: {} },
    conditions: [
      { id: "cond_1", type: "customer_is_new", operator: "equals", value: false, config: {} },
    ],
    conditionLogic: "AND",
    actions: [
      {
        id: "action_1",
        type: "send_ai_reply",
        order: 1,
        config: {
          instruction: "Generate a helpful, contextual reply based on the customer's message and chat history.",
          tone: "friendly",
          language: "auto",
          mode: "draft",
          useChatHistory: true,
          maxHistoryMessages: 10,
          fallbackMessage: "Thank you for your message! Our team will review and respond shortly.",
        },
      },
    ],
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Business Hours Auto Reply",
    category: "support",
    description: "Auto-reply with a message when customers contact outside business hours.",
    trigger: { type: "new_message_received", config: {} },
    conditions: [
      {
        id: "cond_1",
        type: "business_hours",
        operator: "equals",
        value: false,
        config: { startHour: 9, endHour: 18, timezone: "Asia/Kolkata" },
      },
    ],
    conditionLogic: "AND",
    actions: [
      {
        id: "action_1",
        type: "send_text_message",
        order: 1,
        config: {
          message: "Hi {{customer.name}}, thank you for reaching out! Our business hours are 9 AM to 6 PM IST. We'll get back to you first thing when we're back. Thank you for your patience!",
        },
      },
    ],
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

export async function seedDefaultTemplates() {
  const db = await getDb();
  for (const template of DEFAULT_TEMPLATES) {
    const { createdAt, ...updates } = template;
    await db.collection("automation_templates").updateOne(
      { name: template.name, isSystemTemplate: true },
      { $set: updates, $setOnInsert: { createdAt } },
      { upsert: true },
    );
  }
}

export async function listTemplates() {
  await seedDefaultTemplates();
  const db = await getDb();
  const templates = await db
    .collection("automation_templates")
    .find({ isSystemTemplate: true })
    .sort({ category: 1, name: 1 })
    .toArray();

  return templates.map((t) => ({
    id: t._id.toString(),
    name: t.name,
    category: t.category,
    description: t.description,
    mode: t.mode || ((t.actions || []).some((action: { type?: string }) => action.type === "send_ai_reply") ? "ai_agent" : "rules"),
    setupSteps: t.setupSteps || [],
    editablePlaceholders: t.editablePlaceholders || [],
    exampleConversation: t.exampleConversation || null,
    trigger: t.trigger,
    conditions: t.conditions,
    conditionLogic: t.conditionLogic,
    actions: t.actions,
    isSystemTemplate: t.isSystemTemplate,
  }));
}
