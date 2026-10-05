# WhatsApp Automation Channel — Implementation Plan

## Goal

Add a fully-automated WhatsApp business channel to Callify that reuses the existing
LLM/Tool/Conversation pipeline, supports multiple businesses on one server, and lets
each business choose between **Ultramsg** (fast, unofficial) and **Meta WhatsApp
Cloud API** (official, compliant) without code changes.

Scope: text + media-as-tool-call WhatsApp conversations, 24h rolling per-contact
sessions, backend-complete with one admin live-chat page for verification.

## High-level architecture

```
Inbound WhatsApp (Ultramsg webhook | Meta Cloud webhook)
        |
        v
  /api/whatsapp/webhook  (Express route, provider-agnostic)
        |   POST endpoints registered PER WhatsAppInstance
        v
  WhatsAppInboundRouter
   - look up instance/phone -> PhoneNumber -> Agent
   - find/create WhatsAppSession (24h rolling) for contact
        |
        v
  WhatsAppChannelAdapter  (extends ChannelAdapter)
   - sendText / sendImage / sendDocument / sendTemplate
   - events: 'user_message', 'user_media', 'disconnected', 'error'
        |
        v
  ConversationManager  (REUSED; same as voice)
        |
        v
  STT (audio->text) -> LLMService -> ToolExecutor -> outbound via adapter
```

**No Redis, no queue.** State per contact lives in an in-process `WhatsAppSessionStore`
(Map keyed by `${phoneNumberId}:${contactWaId}`) with a 24h TTL eviction timer.
Trade-off documented in Risks.

## Decisions (resolved)

| Question | Choice |
|---|---|
| Provider strategy | Pluggable adapter: `UltramsgProvider` + `CloudApiProvider`, chosen per `WhatsAppInstance` |
| Inbound media | Text-only with `transcribe_media` tool (STT/vision via existing services) |
| Session model | 24h rolling per contact, in-process Map + TTL eviction |
| Multi-tenant | Extend `PhoneNumber` with `channel='whatsapp'` + new `WhatsAppInstance` row holding credentials |
| Frontend | Backend-complete + one minimal admin live-chat page |

## Component map

### New files (server)

- `server/src/integrations/whatsapp/WhatsAppProvider.js`
  Abstract base. Methods: `parseInbound(req) -> NormalizedMessage[]`, `sendText(to,body)`, `sendImage(to,url,caption?)`, `sendDocument(to,url,filename?)`, `sendTemplate(to,template,lang,params)`, `downloadMedia(id) -> Buffer`, `verifyWebhook(req)`. Emits nothing — pure I/O.

- `server/src/integrations/whatsapp/UltramsgProvider.js`
  Implements against existing `WhatsAppService` outbound API. Inbound payload shape `{event:'webhook_received', instanceId, payload:{id,from,body,type,media:{url},timestamp}}`.

- `server/src/integrations/whatsapp/CloudApiProvider.js`
  Implements against `graph.facebook.com/v20.0/{phoneId}/messages`. Inbound payload from Meta (text, image, audio, document, button, list replies). Uses existing ULTRAMSG-style outbound surface only via this provider.

- `server/src/integrations/ProviderFactory.js` (EDIT)
  Add `createWhatsApp({provider, instanceId, token, phoneNumberId, verifyToken, businessId})` dispatching to the right provider class. Validates required env vars at construction; throws clear error if missing.

- `server/src/channels/WhatsAppChannelAdapter.js`
  Implements `ChannelAdapter` interface: `sendAudio` (no-op + warn), `sendControlMessage`, `endSession`, `getSessionMetadata() -> {provider:'whatsapp', sub: 'ultramsg'|'cloud_api', phoneNumber, contactWaId}`. Adds `sendText/sendImage/sendDocument/sendTemplate`. Emits `user_message` (text) and `user_media` ({type, url, mime, providerMediaId, caption?}).

- `server/src/services/WhatsAppSessionStore.js`
  LRU-ish Map keyed `phoneNumberId:contactWaId`. Each entry holds: `ConversationManager`, `CallStateManager`, `WhatsAppChannelAdapter`, `lastActivityAt`. Methods: `getOrCreate({phoneNumber, agent, providerConfig})`, `touch(key)`, `evictExpired()` (interval every 5 min, drop entries older than 24h).

- `server/src/services/WhatsAppInboundRouter.js`
  `handle(req, res)` — verify webhook, parse via provider, group messages by contact within the same request, for each message:
  1. `resolveInstanceByHook(req)` -> WhatsAppInstance + PhoneNumber + Agent
  2. `sessionStore.getOrCreate(...)` — creates adapter + wires `ConversationManager` exactly like `telnyxConnectionHandler.js:38-58`
  3. For text: `conversationManager.handleUserUtterance(text)`
  4. For media: enqueue `transcribe_media` tool call (see ToolExecutor addition below), then continue
  6. `res.sendStatus(200)` — always 200 within 5s; processing continues async.

- `server/src/socket/whatsappLiveSocket.js`
  `ws` path `/wa-live` for the admin live-chat page. Server pushes transcript tokens + tool events; admin can send test messages. Authenticated via existing JWT cookie. Read-only into ConversationManager via a `debug` listener attached when the page opens.

- `server/src/routes/whatsapp.js`
  REST CRUD for `WhatsAppInstance` (POST/PUT/DELETE/GET under `/api/whatsapp/instances`). Also `POST /api/whatsapp/test-send` for the UI. Webhook mounts live in `server.js` (see).

- `server/src/routes/waLive.js`
  REST read endpoints for the live-chat page: `GET /api/whatsapp/sessions` (active), `GET /api/whatsapp/sessions/:key/messages`.

- `frontend/src/pages/WhatsAppLive.jsx`
  Minimal admin page: left column list of active WA conversations, right column chat transcript with streaming LLM tokens (subscribes via existing WS). Route `/admin/whatsapp-live`. No agent-builder UI in this plan.

### Edits to existing files

- `server/prisma/schema.prisma`
  - Add `WhatsAppInstance` model:
    ```
    id String @id
    workspaceId String
    workspace Workspace @relation(...)
    provider String         // 'ultramsg' | 'cloud_api'
    phoneNumber String      // E.164
    phoneNumberId String?   // for cloud_api (Meta phone number id)
    instanceId String?      // for ultramsg
    apiToken String
    verifyToken String
    businessId String?      // cloud_api WABA id
    enabled Boolean @default(true)
    createdAt DateTime @default(now())
    WhatsAppInstance_Workspaceid_unique unique(workspaceId, phoneNumber)
    ```
  - Extend `PhoneNumber`: add `channel String @default("voice")` and `whatsAppInstanceId String?` FK.

- `server/src/tools/ToolRegistry.js`
  Register `transcribe_media` built-in (schema: `{mediaUrl, mediaId, mime, provider} -> {text, mime}`). Excluded from voice channels (only injected by WhatsApp adapter).

- `server/src/tools/ToolExecutor.js`
  Handle `transcribe_media`: download via `WhatsAppChannelAdapter.provider.downloadMedia(mediaId)`, branch by mime — `image/*` → OpenAI vision (`chat.completions` with image_url part, reuse OPENAI_API_KEY), `audio/*` → reuse `STTService`, else return `{text:'[unsupported media type]', mime}`. Re-prompts LLM with the transcribed text as a user message.

- `server/src/services/ConversationManager.js`
  No structural change. Confirm `handleUserUtterance` and `endConversation` work for non-voice paths. Add `providerConfig` passthrough already exists.

- `server/server.js`
  Mount `POST /api/whatsapp/webhook/:instanceId` (dynamic per instance) before body parsers apply raw body parsing where required by Meta signature verification. Add `ws` path `/wa-live` and route to `whatsappLiveSocket`.

- `server/src/integrations/llm/llmService.js`
  No change — vision calls go via a dedicated helper in `WhatsAppChannelAdapter` (small wrapper) so this file stays single-purpose.

- `frontend/src/App.jsx` (or router file)
  Register route `/admin/whatsapp-live` guarded by `RequireAuth`.

## Webhook contracts

**Ultramsg** — provider's default webhook posts JSON to the instance's `webhook_url`:
```json
{ "event_type":"webhook_received", "instanceId":"...","data":{
  "id":"msgid","from":"9199xxxxxxx","body":"hi","type":"text",
  "media":{"url":"https://...","mime":"image/jpeg"},
  "timestamp":1700000000 }}
```
Verification: Ultramsg supports `mode`/`token`/`challenge` handshake GET; for POST verification we check `instanceId` matches a known instance. Set webhook URL in Ultramsg dashboard.

**Meta Cloud API** — POST with `object:'whatsapp_business_account'` and `entry[].changes[].value.messages[]`. GET verification echo `hub.challenge` when `hub.verify_token` matches `WhatsAppInstance.verifyToken`. Signature header `X-Hub-Signature-256` validated using app secret.

Both routes return 200 within 5s.

## Multi-tenant setup flow

1. Admin in workspace opens WhatsApp config (UI deferred; for now `POST /api/whatsapp/instances`).
2. Choose provider, paste credentials. Server validates by calling provider's `/me` or sending a test message to admin's own number.
3. On success, server creates `PhoneNumber(channel='whatsapp', whatsappInstanceId=...)` bound to an `Agent`.
4. Admin sets webhook URL in provider dashboard (Ultramsg auto, Cloud API requires manual paste + verify token).
5. Inbound messages for that number now route to that agent.

## Conversation lifecycle

- First inbound from a contact on a number -> create `ConversationManager` with `agentRuntime.loadAgentRuntime(agent.id)` exactly as `telnyxConnectionHandler.js:38`. Persist `CallSession` row at end via `dbService.saveSession` with `provider='whatsapp_<sub>'`.
- Each subsequent inbound within 24h reuses the same `ConversationManager`. `touch()` updates `lastActivityAt`.
- Outbound LLM token -> `adapter.sendText(...)` immediately on first token (typing UX), then final text replaces typing indicator.
- Tool `end_call` -> `sessionStore.evict(key)` + `adapter.endSession()` (no-op for WA, but ensures transcript saved).
- Interval evicts entries older than 24h after last activity.

## Validation plan

1. **Unit**: provider parsing tests for both Ultramsg and Cloud API sample payloads; `WhatsAppSessionStore` TTL test; webhook signature verification test (Meta).
2. **Integration**:
   - Tunnel local server with `ngrok http 3000` to expose webhook.
   - Ultramsg: point instance webhook at tunnel, send a WhatsApp message, assert `CallSession` row + transcript appears in live page.
   - Cloud API: register phone number, send verify token, send a message, assert same.
   - Tool execution: trigger `create_booking` via WhatsApp, assert row in `Booking` table.
3. **Manual smoke**:
   - Send image -> LLM receives transcribed caption + vision description.
   - Send audio note -> STT transcript -> LLM reply.
   - Restart server mid-conversation -> next inbound creates a new ConversationManager (documented limitation).
   - Two businesses, two different numbers, two different agents -> routed correctly.

## Risks & trade-offs

- **In-process session store**: server restart loses in-flight WA conversations. Acceptable for v1; if needed later, add Redis.
- **No native multimodal**: image understanding is one tool call round-trip; slight latency. Future: extend `LLMService` to accept image parts.
- **Webhook ordering**: providers may reorder or batch. We group by `timestamp` and process oldest-first per contact to keep transcript order sane.
- **Rate limits**: Ultramsg has per-instance limits; outbound sends are unbounded in `ConversationManager` today. Add a per-instance token-bucket later if needed.
- **Meta template rules**: 24h window means free-form replies only inside window; outside window we must use approved templates. Plan: `sendTemplate` wired but UI for template management deferred.
- **Multi-tenant data isolation**: `WhatsAppSessionStore` keys include `phoneNumberId` so businesses cannot collide.

## Out of scope

- WhatsApp template management UI
- Interactive button/list reply tool calling
- Per-business webhook signing secrets
- Conversation transfer between agents
- Analytics/cost dashboard for WA (could reuse `CallSession` cost fields)
- Bulk broadcast / outbound campaigns

## Implementation order

1. Schema migration: `WhatsAppInstance` + `PhoneNumber.channel` (Prisma generate, migrate dev).
2. `WhatsAppProvider` base + `UltramsgProvider` (reuse `WhatsAppService`).
3. `CloudApiProvider` + Meta signature verification.
4. `ProviderFactory.createWhatsApp`.
5. `WhatsAppSessionStore` + eviction interval.
6. `WhatsAppInboundRouter` + dynamic webhook mount in `server.js`.
7. `WhatsAppChannelAdapter` + integration into `ConversationManager`.
8. `transcribe_media` tool in `ToolRegistry` + `ToolExecutor` branches.
9. `routes/whatsapp.js` CRUD + `/api/whatsapp/test-send`.
10. `/wa-live` socket + `WhatsAppLive.jsx` page + router registration.
12. Validation script + ngrok runbook in `docs/whatsapp.md`.

## Open question (non-blocking)

How should template messages be handled for businesses on Ultramsg (no official template API)?
Proposed: use Ultramsg's plain messages; document limitation in instance config.