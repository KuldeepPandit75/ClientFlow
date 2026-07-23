# Core Capabilities Gap Analysis

Audit date: 2026-05-08
Updated after implementation pass: 2026-05-08

Overall completion estimate: 67%

This score weights shipped tenant-safe backend behavior, usable UI, plan enforcement, automation runtime behavior, and production readiness. The project has strong foundations in MongoDB-backed tenancy, RBAC, Evolution API connection, automations, webhooks, and billing limits. The largest remaining gap is that several completed backend services do not yet have full admin UI, scheduler/worker wiring, or strict production-grade policy enforcement.

## Summary

| # | Capability | Completion | Status |
|---|---|---:|---|
| 1 | Client Onboarding and WhatsApp Connection | 75% | Mostly built |
| 2 | Team and Sub-Agent Management | 80% | Mostly built |
| 3 | Unified WhatsApp Inbox | 55% | Partial |
| 4 | AI Chatbot Engine | 55% | Partial |
| 5 | Automation Flow Builder | 65% | Partial to mostly built |
| 6 | Follow-Up and Inactivity Automation | 75% | Mostly built |
| 7 | Knowledge Base Management | 65% | Partial to mostly built |
| 8 | WhatsApp Message Templates | 70% | Mostly built |
| 9 | Bulk Messaging | 65% | Partial to mostly built |
| 10 | Contact and Lead Management | 55% | Partial |
| 11 | Webhooks and Event Processing | 65% | Partial to mostly built |
| 12 | Security and Data Protection | 70% | Mostly built |
| 13 | Dashboard and Analytics | 60% | Partial |
| 14 | Subscription and Plan Limits | 70% | Mostly built |
| 15 | Compliance and Messaging Rules | 55% | Partial |

## Detailed Capability Review

### 1. Client Onboarding and WhatsApp Connection - 75%

Implemented:
- Evolution API connect, disconnect, refresh, and test routes exist.
- WhatsApp sessions are stored per business and account key in `whatsapp_sessions`.
- Plan-based max WhatsApp account enforcement exists.
- Sensitive session fields are encrypted alongside current plain fields.
- Admin-only permission checks protect WhatsApp connection actions.

Evidence:
- `src/lib/services/settings-service.ts`
- `src/app/api/settings/whatsapp/evolution/connect/route.ts`
- `src/app/api/settings/whatsapp/evolution/disconnect/route.ts`
- `src/app/api/settings/whatsapp/accounts/route.ts`

Gaps:
- Settings UI only manages the primary account and does not expose a multi-account manager for Pro users.
- Per-account Evolution credentials are not fully configurable from UI; the implementation depends mostly on environment-derived config.
- Reconnect/disconnect exists, but account selection is not exposed in the UI.
- README still describes an older MVP scope and should be updated.

Next work:
- Build a WhatsApp Accounts settings page with add, reconnect, disconnect, status, and account key support.
- Add per-account credential fields or a secure admin credential setup flow if the product requires separate Evolution credentials per tenant.

### 2. Team and Sub-Agent Management - 80%

Implemented:
- Admin can invite sub-agents.
- Secure random invite token is hashed before storage.
- Invite accept flow creates a sub-agent with hashed password.
- Admin can activate, disable, remove agents.
- Admin can assign customers/chats to agents.
- Sub-agents are restricted to assigned customers/chats by backend permission checks.

Evidence:
- `src/lib/services/team-service.ts`
- `src/lib/services/auth-service.ts`
- `src/lib/permissions.ts`
- `src/screens/Team.tsx`
- `src/app/invite/accept/page.tsx`

Gaps:
- Invite link is generated but email delivery is not implemented.
- RBAC is role-level, not granular permission-level.
- Agent assignment UX uses customer assignment, but inbox assignment controls are limited.

Next work:
- Add transactional invite email delivery.
- Add a compact assignment control directly in the inbox conversation profile.

### 3. Unified WhatsApp Inbox - 55%

Implemented:
- Inbox lists WhatsApp chats and messages from Evolution.
- Text and media sending are supported.
- Search, pagination, unread display, profile side panel, and optimistic sending exist.
- Admin sees all tenant customers; sub-agent visibility is restricted to assigned customers.

Evidence:
- `src/screens/Inbox.tsx`
- `src/lib/services/conversation-service.ts`
- `src/app/api/conversations/route.ts`
- `src/app/api/messages/send/route.ts`

Gaps:
- Required filters for assigned, unassigned, open, closed, unread, and WhatsApp account are supported partly by API but not surfaced in the UI.
- `updateConversationStatus` and `markConversationRead` return modified objects but do not persist status/read changes to MongoDB.
- Internal notes exist as automation action storage, but there is no inbox notes UI.
- Multiple inbox/account filtering is not operational in the inbox UI.

Next work:
- Add inbox filter bar and wire query params to existing API filters.
- Persist conversation status and unread/read updates.
- Add internal notes panel in contact profile.

### 4. AI Chatbot Engine - 55%

Implemented:
- Automation action can generate AI replies through OpenRouter or Groq-style chat completion APIs.
- AI response includes business instruction, recent chat history, and knowledge context.
- If knowledge is missing or reply is uncertain, system marks customer as needing human handover.
- AI monthly usage limits are enforced by plan.
- Draft-only mode exists for AI replies.

Evidence:
- `src/lib/automation/actionExecutor.ts`
- `src/lib/services/knowledge-service.ts`
- `src/lib/automation/sessionManager.ts`
- `src/components/automation/AutomationForm.tsx`

Gaps:
- No dedicated "AI chatbot per workspace" setup page.
- Admin business details setup is not formalized as a chatbot profile.
- Bot test-before-activate UI is missing.
- Strict "answer only from business data" is prompted but not technically guaranteed. Current knowledge retrieval is simple recent-document concatenation, not retrieval with citations/confidence checks.
- Customer-specific memory is mostly recent message history/session data, not structured long-term memory.

Next work:
- Add AI Bot Settings page for business profile, tone, fallback, handover behavior, and test chat.
- Add stricter grounded-answer logic that refuses when retrieved knowledge is empty or low-confidence.

### 5. Automation Flow Builder - 65%

Implemented:
- Multi-step UI for trigger, conditions, actions, and review.
- Automation CRUD, activate, deactivate, duplicate, logs, templates, and n8n workflow creation exist.
- One active main automation mode is enforced by default.
- Supported actions include AI reply, text message, assignment, round robin, tags, customer status, notes, and notifications.

Evidence:
- `src/components/automation/AutomationForm.tsx`
- `src/lib/services/automation-service.ts`
- `src/lib/automation/automationEngine.ts`
- `src/lib/n8n/workflow-builder.ts`

Gaps:
- UI is form-based, not a visual flow builder.
- n8n is exposed as a first-class nav item, which does not fully hide technical workflow complexity from users.
- Delay/no-reply trigger appears in UI labels, but delay behavior is mainly implemented through session follow-up, not a generic delay node.
- Agent selection uses raw agent ID input instead of a dropdown.

Next work:
- Replace raw agent ID fields with tenant agent dropdowns.
- Hide n8n page for normal tenant admins or move it behind advanced/developer settings.
- Add first-class delay and handover nodes in the builder.

### 6. Follow-Up and Inactivity Automation - 75%

Implemented:
- Session follow-up schedules nudge and close jobs.
- Configurable nudge and close timings/messages exist in action config and API settings.
- Customer reply reactivates the session and bumps session version.
- Durable job queue exists, with best-effort in-memory timer.
- Settings UI now exposes reminder timing, close timing, reminder message, and final close message.
- Production cron configuration now calls `/api/jobs/run` every 5 minutes.

Evidence:
- `src/lib/automation/sessionManager.ts`
- `src/lib/services/job-service.ts`
- `src/app/api/jobs/run/route.ts`
- `src/app/api/settings/automation/followup/route.ts`

Gaps:
- `CRON_SECRET` must be configured in production for the cron endpoint.
- A 5-minute cron cadence means reminders are durable but not exact to the second on Vercel.
- Status naming is inconsistent (`closed` customer status vs inbox conversation status).
- Final reminder/close behavior depends on the job runner being called.

Next work:
- Normalize customer/conversation status values.

### 7. Knowledge Base Management - 65%

Implemented:
- Tenant-isolated knowledge document CRUD API exists.
- Manual text and uploaded text-file import are supported.
- AI reply action uses knowledge context.
- Admin Knowledge Base page now supports list, search, create, edit, and delete.
- Admin navigation includes Knowledge.

Evidence:
- `src/lib/services/knowledge-service.ts`
- `src/app/api/knowledge/route.ts`
- `src/app/api/knowledge/import/route.ts`
- `src/app/api/knowledge/[documentId]/route.ts`

Gaps:
- Upload support is text-content based, not full document parsing for PDF/DOCX.
- No embeddings, semantic search, chunking, versioning, or citation-based answer checks.

Next work:
- Add document parsing and chunked retrieval.
- Add retrieval confidence and source references for AI replies.

### 8. WhatsApp Message Templates - 70%

Implemented:
- Template CRUD/list API exists.
- Template variables are extracted from `{{variable}}` syntax.
- Preview API exists.
- Status values support draft, approved, and rejected.
- Plan template limits are enforced.
- Admin Templates page now supports create, category filter, preview, approve, and delete.
- Admin navigation includes Templates.

Evidence:
- `src/lib/services/message-template-service.ts`
- `src/app/api/message-templates/route.ts`
- `src/app/api/message-templates/preview/route.ts`
- `src/app/api/message-templates/[templateId]/route.ts`

Gaps:
- Ready-made user-facing message templates are not seeded for offers, reminders, meetings, launches, follow-ups, and support.
- Official WhatsApp template approval flow is only represented by local status, not integrated with Meta/WhatsApp APIs.

Next work:
- Seed default template library per tenant on onboarding.

### 9. Bulk Messaging - 65%

Implemented:
- Bulk campaign API can create instant or scheduled campaigns.
- Recipient duplicates are removed.
- Approved template enforcement exists when using `templateId`.
- Monthly message limit is checked.
- Send counts and failures are stored.
- Admin Bulk Messaging page now supports approved-template selection, pasted recipients, instant sends, scheduled campaigns, and campaign status table.
- Scheduled bulk campaigns now enqueue durable jobs and are processed by `/api/jobs/run`.
- Admin navigation includes Bulk Messaging.

Evidence:
- `src/lib/services/bulk-message-service.ts`
- `src/app/api/bulk-messages/route.ts`

Gaps:
- Delivery/read status tracking is not connected.
- Plan gating for "bulk messaging only for Pro" is not explicit; only message volume limits are enforced.
- Spam prevention is basic duplicate and rate-limit checking.

Next work:
- Add Pro/Enterprise feature gate for bulk messaging.

### 10. Contact and Lead Management - 55%

Implemented:
- Tenant customers are stored from incoming webhooks and manual creation.
- Name, phone, source, assigned agent, last activity, tags, status, and notes exist in backend data paths.
- Lead status and opt-in update routes exist.
- Agents only see assigned customers.

Evidence:
- `src/lib/services/conversation-service.ts`
- `src/screens/Customers.tsx`
- `src/app/api/customers/[customerId]/lead/route.ts`
- `src/app/api/customers/[customerId]/opt-in/route.ts`

Gaps:
- Customers UI only shows basic customer fields.
- No visible UI to edit lead status, tags, notes, opt-in, or AI memory.
- AI memory is not a structured customer profile.

Next work:
- Add customer detail drawer/page for tags, notes, lead stage, opt-in, assignment, and activity.
- Add structured AI memory fields with admin visibility and controls.

### 11. Webhooks and Event Processing - 65%

Implemented:
- Evolution webhook endpoint receives, logs, and processes incoming message events.
- Incoming messages are routed into customers, messages, automation engine, session follow-up, and n8n forwarding.
- Failed webhook events are logged.
- Retry queue endpoint exists.
- Webhook bearer secret check exists.

Evidence:
- `src/lib/evolution/webhook.ts`
- `src/app/api/webhooks/evolution/route.ts`
- `src/app/api/webhooks/evolution/retry/route.ts`
- `src/lib/services/job-service.ts`

Gaps:
- Retry job currently marks events retried instead of actually reprocessing the saved payload.
- Business resolution falls back to the first active business if no connected session matches, which is risky for multi-tenant isolation.
- Delivery/read status events are not fully handled.
- No webhook event dashboard for tenant admins; only super-admin logs exist.

Next work:
- Reprocess original webhook payload in `webhook_retry` jobs.
- Remove first-active-business fallback or make it super-admin/dev-only.
- Add delivery/read event handling.

### 12. Security and Data Protection - 70%

Implemented:
- MongoDB tenant filters are used throughout services.
- Passwords are hashed with PBKDF2, salt, and timing-safe comparison.
- Invite tokens are hashed.
- Role-based permissions exist for platform, team, WhatsApp, customer view, assignment, and sending.
- Sensitive WhatsApp session data is encrypted.
- Audit logs exist for important actions.
- Webhook bearer secret is supported.

Evidence:
- `src/lib/services/auth-service.ts`
- `src/lib/permissions.ts`
- `src/lib/security/encryption.ts`
- `src/lib/services/security-service.ts`
- `src/lib/audit.ts`

Gaps:
- Encrypted fields are stored, but plain `instanceName` and `phoneNumber` are also still stored for queries/display.
- No explicit CSRF strategy is visible for mutation routes.
- HTTPS/TLS is deployment-level and not represented in repo configuration.
- Some routes depend on role checks but not all include detailed audit logging.

Next work:
- Minimize plaintext sensitive fields or formally classify which fields are acceptable to store in plain text.
- Add CSRF or same-site mutation protection review.
- Add route-level security test coverage.

### 13. Dashboard and Analytics - 60%

Implemented:
- Analytics overview API counts total chats, open/closed, assigned/unassigned, message volume, AI handled, human handled, active agents, connected WhatsApp accounts, and bulk campaigns.
- Analytics UI renders overview cards.
- Super-admin platform overview exists.
- Analytics page includes `"use client";` and builds successfully.

Evidence:
- `src/lib/services/analytics-service.ts`
- `src/app/analytics/page.tsx`
- `src/lib/services/platform-service.ts`

Gaps:
- Agent performance is only a top assigned-customer count, not response time, handled chats, close rate, or message volume per agent.
- Bulk performance is campaign count only.
- WhatsApp health is connected count only.

Next work:
- Expand analytics to include per-agent and per-campaign tables.

### 14. Subscription and Plan Limits - 70%

Implemented:
- Free, starter, pro, and enterprise limits are defined.
- Limits cover agents, WhatsApp accounts, monthly messages, automations, templates, and AI responses.
- Billing page and Razorpay order/verify flows exist.
- Limits are enforced in team invites, WhatsApp accounts, automation activation, templates, bulk monthly messages, and AI responses.
- Billing usage now counts real automation usage instead of always reporting `0`.

Evidence:
- `src/lib/plan-limits.ts`
- `src/lib/services/billing-service.ts`
- `src/screens/Billing.tsx`

Gaps:
- Requested plan names are Basic and Pro, while implementation uses free/starter/pro/enterprise.
- Bulk messaging and advanced automation are not explicitly feature-gated by plan.
- Message limits count stored messages but may miss Evolution sends that are not persisted uniformly.

Next work:
- Align product plan labels with Basic/Pro or map aliases clearly in UI.
- Add feature gates for bulk and advanced automation.

### 15. Compliance and Messaging Rules - 55%

Implemented:
- Customer opt-in flag is checked before outbound sends.
- Duplicate outbound message blocking exists.
- Outbound rate limit exists.
- Bulk messaging can require approved templates.
- Message and webhook logs are stored.

Evidence:
- `src/lib/services/compliance-service.ts`
- `src/lib/services/bulk-message-service.ts`
- `src/lib/services/conversation-service.ts`

Gaps:
- Opt-in defaults are permissive unless explicitly false.
- WhatsApp 24-hour session window and official template requirements are not enforced.
- Rate limits are simple app-level limits, not provider-aware.
- No consent capture UI or compliance settings page.

Next work:
- Add explicit opt-in capture and visible opt-in status.
- Enforce outbound session window rules and template-only messaging outside the window.
- Add provider-aware rate-limit configuration.

## Highest Priority Gap List

1. Build missing richer Customer Details and inbox-side assignment/notes/status controls.
2. Harden scheduled workers further, especially true webhook retry reprocessing and delivery/read event handling.
3. Fix persistence gaps in conversation status/read handling.
4. Harden multi-tenant webhook routing by removing first-active-business fallback.
5. Add stricter AI grounding and a test-before-activate chatbot page.
6. Align plan naming and feature gates with Basic vs Pro requirements.
7. Update README to reflect the expanded implementation instead of the older focused MVP statement.

## Suggested GitHub Feature Issues

- Feature: WhatsApp Accounts Manager UI
- Feature: Inbox Filters, Status Persistence, and Internal Notes
- Feature: AI Bot Settings and Test Console
- Feature: Knowledge Base UI and Document Retrieval
- Feature: Message Templates UI and Default Template Library
- Feature: Bulk Campaign UI and Scheduled Send Worker
- Feature: Cron Job Worker for Follow-Ups and Retries
- Feature: Webhook Retry Reprocessing and Tenant Routing Hardening
- Feature: Analytics Expansion for Agents, Bulk Campaigns, and WhatsApp Health
- Feature: Subscription Feature Gates and Usage Accuracy
