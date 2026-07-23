# Operations Runbook

## Local startup

1. Copy `.env.example` to `.env.local` and `.env.example.evolution` to `.env.evolution`.
2. Run `npm install`.
3. Start MongoDB and Docker.
4. Run `npm run dev:whatsapp`.
5. Sign in as an admin, open Settings, create an account key, and scan the QR from WhatsApp Linked Devices.

Use test phone numbers. `BILLING_LEARNING_MODE=true` is for local demonstrations only; disable it when verifying Razorpay.

## Job worker

Call `GET /api/jobs/run` with `Authorization: Bearer <CRON_SECRET>` on a schedule. The included GitHub Actions workflow calls it every five minutes, which also works with Vercel Hobby deployments. The worker claims Mongo jobs for automation resumes, session nudges/closes, webhook retries, and campaigns. Failed jobs use bounded retry/backoff.

## Webhook checks

- Evolution webhook URL points to `/api/webhooks/evolution` on the reachable Next.js host.
- The received instance name exactly matches a `whatsapp_sessions.instanceName` record.
- Failed entries remain failed in `webhook_events`; retry jobs reprocess the stored payload.

## Verification

Run `npm test`, `npm run lint`, and `npm run build` before release. For a smoke test: connect WhatsApp, receive a message, assign it, reply as the agent, activate one rule automation for that account, and confirm the outgoing/incoming records persist after restart.

## Backup and recovery

Back up MongoDB before schema or deployment changes. Restore into an isolated database first, verify users/businesses/sessions/customers/messages/jobs counts, then test a read-only login before switching traffic. Evolution sessions may require QR relinking even when application data is restored.

## Incident response

If messages appear under the wrong account, disconnect the affected Evolution instances, stop the job worker, preserve `webhook_events` and audit logs, rotate webhook/Evolution secrets, repair session mappings, and only then replay failed events.
