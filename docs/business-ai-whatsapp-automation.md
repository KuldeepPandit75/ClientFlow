# Business AI WhatsApp Automation

ClientFlow includes editable AI automation presets for sales qualification, FAQ/support triage, appointment enquiries, order enquiries, pricing questions, and returning-customer drafts.

## Prepare the business profile

Before enabling auto-send, add verified products, services, prices, locations, hours, FAQs, delivery/return policies, and escalation rules under Knowledge. The AI hands over when the required answer is not present in that workspace knowledge.

## Preset behavior

- Trigger: every new incoming WhatsApp text message.
- Action: generate and auto-send an AI reply using the configured provider.
- Tag: add a preset-specific lead, support, appointment, or order tag.
- Safety: if no AI provider key is configured or the provider fails, the automation sends a fixed fallback message.

## AI Environment Variables

Use OpenRouter:

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=meta-llama/llama-3.2-3b-instruct:free
```

Use Groq:

```env
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
```

Optional shared variables:

```env
AI_API_KEY=
AI_MODEL=
AI_APP_TITLE=ClientFlow WhatsApp Automation
```

## Create an automation

Open Automation, select **Use Template**, review the setup checklist and example conversation, then create a draft. Choose the WhatsApp account, edit the goal/instruction, test draft replies, and only then change the AI action to auto-send.

The optional seed script remains available for local development:

Start the app, then run:

```bash
npm run automation:create-business-ai
```

Optional overrides:

```bash
BACKEND_URL=https://your-app.example.com \
CLIENTFLOW_EMAIL=a9540183487@gmail.com \
CLIENTFLOW_PASSWORD='your-password' \
npm run automation:create-business-ai
```

## Repair Evolution Webhook

When Evolution API runs on a droplet, the webhook must point to a public HTTPS URL for the Next.js backend. Local-only URLs like `localhost`, `127.0.0.1`, and `host.docker.internal` will not work from the droplet.

```bash
PUBLIC_WEBHOOK_URL=https://your-public-app.example.com/api/webhooks/evolution \
npm run evolution:repair-webhook
```
