# Application API

All tenant APIs require the signed ClientFlow session cookie. Service-layer authorization is authoritative; hiding a page or navigation item is not authorization.

## Main groups

- `/api/auth/*`: signup, login, refresh, logout, and current session.
- `/api/team/*`: expiring agent invitations, onboarding, status, and granular permission grants.
- `/api/settings/whatsapp/*`: list accounts; administrators connect, refresh, test, and disconnect Evolution sessions.
- `/api/conversations/*`: filtered Mongo-backed inbox, messages, read state, status, assignment, text, and media sends.
- `/api/automations/*`: account-bound rules or AI-agent flows and execution logs.
- `/api/message-templates/*`: local draft/ready/disabled templates.
- `/api/message-template-presets`: curated real-business examples and supported placeholders.
- `/api/bulk-messages/*`: opt-in checked campaigns and durable scheduled sends.
- `/api/jobs/run`: authenticated manual worker run or `Authorization: Bearer <CRON_SECRET>` for cron.
- `/api/webhooks/evolution`: Evolution events; an event is accepted only when its exact instance maps to a stored session.
- `/api/health`: deployment-safe MongoDB, Evolution, auth-secret, and worker-secret readiness.

## Tenant keys

Tenant-owned Mongo records use `businessId`. WhatsApp-originated records additionally use `accountKey` and, when available, `whatsappSessionId`. Do not accept a tenant identifier from a request body as authorization context.

## Error envelope

Routes use the shared response helpers and return a non-2xx response for authentication, permission, validation, provider, and persistence failures. Provider failures must never be returned as successful processing.
