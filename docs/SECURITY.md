# Security Model

## Workspace isolation

- The authenticated user determines `businessId`; clients cannot select another workspace.
- Evolution webhooks require an exact `instanceName` match. Unknown instances are rejected without a fallback tenant.
- Incoming message IDs are deduplicated within their business and WhatsApp session.
- Every conversation, automation, template, campaign, job, audit event, and payment query is tenant-scoped.

## Team permissions

Owners/admins retain WhatsApp connection, billing, and security control. Sub-agents receive assigned chats by default. Optional grants cover unassigned/all chats, assignment, templates, automations, knowledge, bulk messaging, analytics, and team management. APIs repeat permission checks in the service layer.

## Secrets and data

- Keep `AUTH_SECRET`, `CRON_SECRET`, Evolution keys, AI keys, Razorpay secrets, and encryption keys server-only.
- Never commit real `.env.local` or `.env.evolution` values.
- Rotate `DATA_ENCRYPTION_KEY_VERSION` using the documented old-key transition variable.
- Backups must be encrypted and access-controlled.

## AI-agent controls

AI mode is explicit and separate from deterministic rules. Prompts limit replies to known business context, reject invented commitments, use constrained actions, and fall back or hand over when knowledge is insufficient. Treat retrieved content and customer messages as untrusted input.

## Learning-project warning

Web WhatsApp automation can violate WhatsApp terms or cause account restrictions. Use test numbers, explicit customer opt-in, quiet hours, conservative rate limits, and no unsolicited bulk messaging.
