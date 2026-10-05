# WhatsApp Channel

End-to-end WhatsApp automation built on the existing Callify voice pipeline.
Reuses `ConversationManager`, `ToolRegistry`, `ToolExecutor`, and the LLM
service. Supports **Ultramsg** and **Meta WhatsApp Cloud API** side-by-side
through a pluggable provider.

## Architecture

```
Inbound webhook
   └─ /api/whatsapp/webhook[/:instanceId]
       └─ WhatsAppInboundRouter
           ├─ resolve instance from URL/body/WABA id
           ├─ parse payload via WhatsAppProvider
           └─ for each contact:
                ├─ WhatsAppSessionStore.getOrCreate (24h window)
                ├─ WhatsAppChannelAdapter (extends ChannelAdapter)
                └─ ConversationManager (reused)
                      ├─ STT (audio only)
                      ├─ LLMService (text + tool calls)
                      ├─ ToolExecutor (booking/CRM/transcribe_media/...)
                      └─ adapter.sendText / sendImage / sendDocument
```

### Key components (server)

| Path | Role |
|---|---|
| `src/integrations/whatsapp/WhatsAppProvider.js` | Abstract base |
| `src/integrations/whatsapp/UltramsgProvider.js` | Ultramsg HTTP impl |
| `src/integrations/whatsapp/CloudApiProvider.js` | Meta Cloud API impl (signed) |
| `src/channels/WhatsAppChannelAdapter.js` | ChannelAdapter for text/media |
| `src/services/WhatsAppSessionStore.js` | 24h rolling session cache |
| `src/services/WhatsAppInboundRouter.js` | Webhook entry + routing |
| `src/modules/whatsapp/transcribeMedia.js` | image (vision) + audio (Deepgram) |
| `src/routes/whatsapp.js` | CRUD + test-send + session debug |
| `src/socket/whatsappLiveSocket.js` | `/wa-live` WS for admin live page |

### Frontend

- `frontend/src/pages/WhatsAppLivePage.jsx` — list active sessions, watch
  transcripts, send a test message. Route: `/admin/whatsapp-live`.

## How inbound messages reach the right agent

1. Provider POSTs to your webhook URL (no path required — we look at body).
2. The router matches the instance by:
   - `req.params.instanceId` (preferred, allows many businesses on one server)
   - `body.instanceId` (Ultramsg)
   - `body.entry[].id` (Meta WABA id)
   - `body.entry[].changes[].value.metadata.phone_number_id`
3. The matching `WhatsAppInstance` row points to a `PhoneNumber` (channel='whatsapp')
   bound to an `Agent`.
4. A `WhatsAppChannelAdapter` + `ConversationManager` is created (or reused
   if the same contact messaged within 24h).

## Multi-tenant

Each `Workspace` owns its `WhatsAppInstance[]`. Admins can create instances
via the REST API (UI deferred). The system supports any number of WhatsApp
numbers across any number of businesses on one server.

## Configuring an instance

### Ultramsg

```bash
curl -X POST http://localhost:8083/api/whatsapp/instances \
  -H "Content-Type: application/json" \
  -H "Cookie: callify_token=..." \
  -d '{
    "provider": "ultramsg",
    "phoneNumber": "+14155552671",
    "instanceId": "instance12345",
    "apiToken": "ultramsg_token",
    "verifyToken": "my-verify-token"
  }'
```

Then in the Ultramsg dashboard, set the webhook URL to
`https://<your-public-host>/api/whatsapp/webhook`.

### Meta Cloud API

```bash
curl -X POST http://localhost:8083/api/whatsapp/instances \
  -H "Content-Type: application/json" \
  -H "Cookie: callify_token=..." \
  -d '{
    "provider": "cloud_api",
    "phoneNumber": "+14155552671",
    "phoneNumberId": "1234567890",
    "businessId": "9876543210",
    "apiToken": "EAAB...",
    "verifyToken": "my-verify-token",
    "appSecret": "..."
  }'
```

Then in the Meta developer dashboard, set the webhook URL to
`https://<your-public-host>/api/whatsapp/webhook` and the verify token to
the same value you supplied.

After creation, bind the `PhoneNumber` to an `Agent`:

```bash
curl -X PUT http://localhost:8083/api/whatsapp/instances/<instance-id> \
  -H "Content-Type: application/json" \
  -H "Cookie: callify_token=..." \
  -d '{ "agentId": "<agent-uuid>" }'
```

## Local testing with ngrok

```bash
# 1. Start the server
cd server && npm start

# 2. Expose it
ngrok http 8083

# 3. Use the ngrok URL (https) as the webhook URL in your provider
#    e.g. https://abc-123.ngrok-free.app/api/whatsapp/webhook
```

## Tool: `transcribe_media`

Automatically injected into the registry on WhatsApp sessions. Branches:

- `image/*` → OpenAI vision (model `WA_VISION_MODEL`, default `gpt-4o-mini`)
- `audio/*` → Deepgram STT (`DEEPGRAM_API_KEY`)
- `application/pdf`, `text/*` → stub
- other → stub

The `ConversationManager.handleUserUtterance` flow is bypassed for media;
the router directly synthesizes a `transcribe_media` tool call so the
LLM can answer the user's question about the attachment.

## Outbound from agent

The existing `send_whatsapp` tool now writes via the WhatsAppSessionStore
adapter (per contact). Voice callers still use the legacy
`WhatsAppService.sendMessage` path (kept untouched).

## Limitations

- State is in-process; server restarts drop in-flight conversations.
- Per-business rate limiting not implemented (provider-side limits apply).
- Meta template management UI is not in scope — use Meta Business Manager
  to create templates, then call `POST /api/whatsapp/instances/:id/test-send`
  with `{ "template": "name", "language": "en", "parameters": ["x"] }`.
- No interactive button/list reply parsing beyond surface text.
