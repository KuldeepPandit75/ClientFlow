# ClientFlow

ClientFlow is a multi-tenant WhatsApp Web automation learning project built with Next.js, MongoDB, and Evolution API. It deliberately does not use WABA, Meta Cloud API, or n8n

The product scope includes:

- login and signup
- protected app routes
- Evolution API WhatsApp connection with QR status
- live WhatsApp inbox backed by Evolution API conversations and messages
- sending text and media messages through Evolution API
- workspace team invitations and assigned-chat access
- internal rule and AI-agent automation services
- local reusable message templates, jobs, analytics, and plan limits
- curated real-business message and AI automation presets with editable placeholders and examples

MongoDB is the application source of truth. Evolution API is used only as the WhatsApp Web transport.

## Repository documentation

- [`docs/`](./docs/README.md) contains architecture and product documentation.
- [`tests/`](./tests/README.md) contains the executable verification strategy.
- [`plans/`](./plans/README.md) contains phased delivery plans and acceptance criteria.

## Routes

- `/landing` - public product entry page
- `/login` - login and signup
- `/inbox` - connected WhatsApp conversations
- `/settings` - Evolution API WhatsApp connection

Logged-in users are sent to `/inbox`.

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Lucide React
- Evolution API

## Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Default local URL:

```text
http://127.0.0.1:3000
```

## Local Evolution API

This app can run a local Evolution API container with Postgres and Redis.

1. Create the Evolution env file:

```bash
cp .env.example.evolution .env.evolution
```

2. Make sure the app env points to the local API:

```env
EVOLUTION_API_BASE_URL=http://localhost:8080
EVOLUTION_API_KEY=local-dev-evolution-key
EVOLUTION_INSTANCE_NAME=clientflow
EVOLUTION_INSTANCE_TOKEN=clientflow
EVOLUTION_AUTO_BOOTSTRAP=true
EVOLUTION_WEBHOOK_URL=http://host.docker.internal:3001/api/webhooks/evolution
```

3. Start Evolution API and the Next app:

```bash
npm run dev:whatsapp
```

Evolution API will be available at `http://localhost:8080`. Open `/settings`, click `Connect QR`, and scan the QR from WhatsApp > Linked devices.

Useful commands:

```bash
npm run evolution:up
npm run evolution:logs
npm run evolution:down
```

For GitHub-to-Vercel production deployment, health checks, the scheduled GitHub job worker, and the persistent Evolution hosting boundary, see [the deployment guide](./docs/vercel-evolution-deployment-guide.md).
