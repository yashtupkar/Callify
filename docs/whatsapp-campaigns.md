# WhatsApp Campaigns

Broadcast approved Meta templates (or plain text on QR-linked/Baileys accounts) to opted-in contacts.
It reuses the existing `CloudApiProvider` / `BaileysProvider`, auth, and webhook routing. No second messaging system.

## Verification status (read first)

**Live broadcast is NOT verified.** Verified only with automated tests against mocked providers and an in-memory
repository (`cd server && npm test`, `server/tests/campaigns.test.js`), plus a successful frontend `npm run build`.
Not verified:
- The Prisma repository (`server/src/campaigns/repo.js`), including the raw `FOR UPDATE SKIP LOCKED` claim query, and the migration were **never run against a real Postgres**.
- No real Meta Cloud API send, template fetch, or webhook, and no real Baileys send.
- The UI was built but not exercised end-to-end in a browser against a live backend.

Do a staging run with a test number and a handful of opted-in recipients before any real use.

## Deploy checklist

1. Apply the migration `server/prisma/migrations/20261012100000_whatsapp_campaigns` (`npx prisma migrate deploy`). It adds `User.workspaceId` (existing users are backfilled to the oldest workspace), campaign, recipient, status-event and opt-out tables. Review the backfill if you run several workspaces.
2. Run `npx prisma generate`.
3. **Run exactly one server instance with the worker enabled.** Rate limiting (token bucket) is in-process. Claims are DB-safe (`SKIP LOCKED`, leases), but multiple workers would each apply their own rate limit. To scale out, move the queue to Redis/BullMQ with a shared limiter; set `CAMPAIGN_WORKER_ENABLED=false` on all but one instance.
4. Meta webhooks: expose a public HTTPS URL, subscribe the app to the `messages` field of the WhatsApp Business Account, and configure the app secret. Without it, messages stay at "sent" and never show delivered/read.
5. `WHATSAPP_SECRETS_KEY` must be set as for the existing integration (connection credentials are decrypted by the existing provider code).

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `CAMPAIGN_WORKER_ENABLED` | `true` | Run the background worker in this process |
| `CAMPAIGN_MAX_RECIPIENTS_CLOUD` | 10000 | Max recipients per campaign (Meta) |
| `CAMPAIGN_MAX_RECIPIENTS_BAILEYS` | 500 | Max recipients per campaign (Baileys) |
| `CAMPAIGN_DAILY_CAP_CLOUD` | 250 | Default rolling-24h sends per connection (conservative; not your real Meta tier, raise per campaign) |
| `CAMPAIGN_DAILY_CAP_BAILEYS` | 200 | Same for Baileys |

Per-campaign settings: concurrency, messages/minute, max attempts (1-5), clamped to channel limits
(Meta: concurrency up to 10, 600/min; Baileys: concurrency 1, up to 20/min).

## API (`/api/campaigns`, admin + workspace scoped)

`GET /connections`, `GET /connections/:id/templates`, `POST /preview-recipients`, `POST /preview-message`,
`POST /` (create draft, supports `idempotencyKey`), `GET /`, `GET /:id`, `GET /:id/recipients`,
`POST /:id/launch` (requires `confirmRecipientCount`), `POST /:id/pause|resume|cancel`, `GET /:id/report[?format=csv]`.
Every query is scoped by workspace; connections are checked via their automation's workspace.

## Compliance behaviour

- Creating a campaign requires an explicit opt-in attestation plus a description of how consent was collected. Responsibility for consent stays with the account owner.
- Opted-out numbers are skipped at creation and re-checked before each send. Inbound keywords (e.g. STOP, UNSUBSCRIBE) record an opt-out through the existing inbound hook.
- Meta: only `APPROVED` templates are sent (re-checked at launch). Authentication templates and unsupported components are rejected. Non-template (free-form) sends are not offered, so the 24h customer-service window is not relied on.
- Meta has paused US (+1) marketing template delivery; such sends will fail with a policy error. Error 131049 (ecosystem/frequency limit) is treated as a permanent failure for that recipient.
- Auth/permission/quality/payment errors **pause** the campaign instead of burning through recipients.
- Baileys is unofficial: ban risk must be acknowledged, text only, no delivery/read tracking ("sent" only).

## Delivery semantics

- "Sent" = provider accepted. Delivered/read come only from webhooks. Status transitions are monotonic (sent < delivered < read); a late webhook never regresses a state, and a webhook arriving before the send is recorded is stashed and applied afterwards.
- Meta has no idempotency key. If a send times out or the connection resets, the outcome is unknown; the recipient is marked failed `UNKNOWN_OUTCOME` and is **not** retried to avoid duplicate messages. After a crash, a recipient whose send had started but not finished is likewise marked `UNKNOWN_OUTCOME`; unstarted ones are re-queued.
- Retryable errors (rate limit, transient) use exponential backoff up to max attempts.
- Cancel skips unsent recipients; in-flight sends complete.
