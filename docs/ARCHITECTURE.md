# ClientFlow Architecture

## Scope

ClientFlow is a multi-tenant WhatsApp Web automation learning platform. Evolution API provides the Web WhatsApp transport. ClientFlow owns all application services. WABA, Meta Cloud API, and n8n are outside the product boundary.

## Required repository folders

- `docs/`: product, architecture, security, operations, and API documentation.
- `tests/`: automated unit, integration, contract, and end-to-end tests.
- `plans/`: active implementation phases and acceptance criteria.

## Runtime boundaries

1. **Next.js application** authenticates users and exposes tenant-safe APIs.
2. **MongoDB** is the source of truth for workspaces, memberships, accounts, conversations, messages, automations, jobs, usage, and audit logs.
3. **Evolution API** creates Web WhatsApp sessions and sends/receives WhatsApp data. It is a transport, not the authorization or inbox database.
4. **Internal job worker** claims durable MongoDB jobs for delays, retries, follow-ups, and campaigns.
5. **Internal automation engine** evaluates rules or the configured AI-agent policy.

## Tenant invariants

- Every tenant-owned record contains `businessId`.
- Every WhatsApp-originated record also contains `whatsappSessionId` or `accountKey`.
- A webhook is processed only after its exact instance name maps to one connected session.
- Unknown instances are logged and rejected; there is no default-business fallback.
- Customer external IDs are unique only inside a business/account boundary.
- Authorization is checked in services, never only in navigation or middleware.

## Roles and permissions

Roles provide defaults; explicit permissions provide overrides. Owners retain billing, security, and WhatsApp connection control. Agents default to assigned chats and replies only. Optional grants control templates, automations, assignment, analytics, and team operations.

## Automation invariant

At most one automation is active for each WhatsApp account. An automation uses either deterministic `rules` mode or controlled `ai_agent` mode. Durable waits are jobs, never in-memory sleeps.

## Template terminology

Templates are local reusable ClientFlow messages. `ready` means approved by the workspace admin for use inside this learning project; it does not imply Meta approval.
