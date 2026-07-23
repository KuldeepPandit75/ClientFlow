# Web WhatsApp Product Plan

## Product boundary

ClientFlow is a learning project that connects WhatsApp Web through Evolution API. It does not use WABA, Meta Cloud API, or n8n. All tenancy, inbox, permissions, automation, jobs, AI policy, audit, and billing behavior is owned by this repository.

## Phase 0 - Safety and one source of truth

- Resolve every webhook to an exact stored WhatsApp session.
- Reject unknown instances; never fall back to another business.
- Store webhook events idempotently and retain failed status.
- Remove n8n UI, API routes, callbacks, and forwarding.
- Make MongoDB the inbox source of truth; Evolution is only the transport.

Exit criteria: two businesses can receive the same customer JID without data crossing tenants.

## Phase 1 - Workspace and team access

- Owner/admin invites agents with an expiring link.
- Invite contains workspace, role, supervisor, and permission grants.
- Agent sees assigned chats only by default.
- Admin can grant individual access to templates, automations, analytics, assignment, and team invites.
- Every protected service checks permissions on the server.

Exit criteria: permission matrix integration tests cover allow and deny behavior.

## Phase 2 - Durable inbox

- Store conversations and messages locally by `businessId`, `whatsappAccountId`, and external IDs.
- Persist assigned agent, open/pending/closed, unread count, tags, notes, and last activity.
- Store incoming, manual outgoing, rule-generated, and AI-generated messages uniformly.
- Poll Evolution only for reconciliation; webhook processing drives normal updates.
- Support filters before pagination.

Exit criteria: restart-safe inbox with correct assigned-chat pagination and message counters.

## Phase 3 - One automation per account

- Each WhatsApp account has at most one active automation.
- Modes: `rules` or `ai_agent`.
- Rule mode supports trigger, conditions, send, assign, tags, notes, delay, and handover.
- Durable jobs implement waits and no-reply behavior.
- Activation is enforced by a database unique constraint, not only an application count.

Exit criteria: deterministic automation and delayed-job integration tests pass after process restart.

## Phase 4 - Controlled AI agent

- Per-workspace business profile, tone, languages, forbidden topics, fallback, and handover policy.
- Chunked knowledge retrieval with source IDs.
- Low-cost classifier before reply generation.
- Strict token budgets per action and monthly workspace limits.
- Structured allowed tools only: tag, assign, lead stage, internal note, handover, and approved business tasks.
- Tool permission validation and audit logs.

Exit criteria: prompt-injection, unsupported-answer, cost-limit, and tool-authorization tests pass.

## Phase 5 - Local templates and campaigns

- Templates remain ClientFlow templates, not Meta-approved templates.
- Template status means internal draft/ready/disabled.
- Variables are validated and rendered per recipient.
- Campaigns require explicit opt-in and durable queued delivery.
- Delivery results and errors are stored per recipient.

Exit criteria: no campaign can bypass opt-in, account ownership, rate limits, or monthly limits.

## Phase 6 - Operations

- Real payment orders or a clearly labeled learning-mode billing switch.
- Health checks, structured logs, metrics, backup/restore guide, retention rules, and secret rotation.
- End-to-end tests using a mocked Evolution server.
- Deployment and incident runbooks.
