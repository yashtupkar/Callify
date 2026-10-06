# WhatsApp Automation

This document describes the target WhatsApp Automation architecture for
Callify: a WhatsApp-native automation system that is independent from voice
agents, supports multiple languages, keeps the existing tool-calling pipeline,
and lets each workspace choose between Baileys and the Meta WhatsApp Cloud API.

> **Implementation status:** This is the architecture and operating guide for
> the WhatsApp Automation migration. The current codebase still contains legacy
> WhatsApp routes and agent bindings while the migration is being completed.
> The legacy behavior is documented in [whatsapp.md](./whatsapp.md).

## Goals

WhatsApp Automation should allow a user to:

1. Create an automation without creating or assigning a voice agent.
2. Configure the business prompt, language behavior, tools, and session policy.
3. Connect one or more WhatsApp numbers.
4. Choose Baileys or Meta Cloud API per connection.
5. Switch providers through configuration without changing application code.
6. Keep the same LLM, tool-calling, CRM, booking, and media capabilities.

## High-level architecture

```text
WhatsApp message
      |
      v
BaileysProvider or MetaCloudProvider
      |
      v
Normalized WhatsApp message
      |
      v
WhatsAppInboundRouter
      |
      v
WhatsAppAutomationRuntime
      |
      +--> WhatsAppPromptBuilder
      +--> Shared ConversationManager
      +--> Shared LLMService
      +--> WhatsAppToolRegistry
      +--> WhatsAppToolExecutor
      +--> WhatsAppChannelAdapter
      |
      v
Selected provider sends the reply
```

Provider-specific code must stay inside the provider implementation. The
runtime should process the same normalized message shape regardless of whether
the message came from Baileys or Meta.

## Module layout

All new WhatsApp-specific code should live under one backend folder:

```text
server/src/whatsappAutomation/
├── providers/
│   ├── WhatsAppProvider.js
│   ├── BaileysProvider.js
│   ├── MetaCloudProvider.js
│   └── WhatsAppProviderFactory.js
├── services/
│   ├── WhatsAppAutomationService.js
│   ├── WhatsAppAutomationRuntime.js
│   ├── WhatsAppAutomationSessionStore.js
│   ├── WhatsAppInboundRouter.js
│   └── WhatsAppMediaService.js
├── channels/
│   └── WhatsAppAutomationChannelAdapter.js
├── prompts/
│   ├── WhatsAppPromptBuilder.js
│   ├── languageCatalog.js
│   └── promptTemplates.js
├── tools/
│   ├── WhatsAppToolRegistry.js
│   └── WhatsAppToolExecutor.js
├── routes/
│   └── whatsappAutomationRoutes.js
├── sockets/
│   └── whatsappAutomationSocket.js
└── index.js
```

The frontend should use the corresponding `frontend/src/whatsappAutomation/`
folder for pages, components, and API helpers.

## Automation model

An automation owns its own configuration:

- Name and description
- Business name and timezone
- System prompt and welcome message
- Primary and supported languages
- Enabled/paused status
- Enabled tools and tool configuration
- One or more WhatsApp connections
- Contact sessions and transcripts

An automation is not an `Agent`. Voice agents remain responsible for browser
and telephone conversations. There should be no WhatsApp agent dropdown or
agent-to-number assignment in the WhatsApp UI.

The recommended session key is:

```text
automationId:connectionId:contactWaId
```

This prevents contacts from different businesses or numbers from sharing
conversation state.

## Providers

Only these providers are supported:

| Provider | Connection method | Best for |
|---|---|---|
| Baileys | QR-code login using a WhatsApp account | Development, demos, and self-managed connections |
| Meta Cloud API | Meta business credentials and webhooks | Production and official business messaging |

Ultramsg is not part of the new architecture and must not appear in the
provider selector, API validation, documentation, or database provider values.

### Provider interface

Both providers implement the same operations:

```js
connect()
disconnect()
getStatus()
sendText(to, text)
sendImage(to, url, caption)
sendDocument(to, url, filename, caption)
sendTemplate(to, templateName, language, parameters)
parseInbound(request)
verifyWebhook(request)
downloadMedia(mediaId)
```

The provider factory selects the implementation from persisted connection
configuration:

```js
createWhatsAppProvider(connection)
```

The rest of the application must not contain provider-specific send or parse
branches.

### Baileys

Baileys connections use QR authentication and persist credentials in a folder
scoped to the connection:

```text
server/baileys_auth/<connectionId>/
```

Credential files must be ignored by nodemon and must never be committed.
Baileys connection handling includes QR generation, reconnect, logout, status
updates, credential persistence, inbound messages, and outbound messages.

### Meta Cloud API

Meta connections use:

- Phone number ID
- WhatsApp Business Account ID
- Access token
- Verify token
- App secret

The provider is responsible for webhook challenge handling, request signature
validation, message normalization, media downloads, and approved template
messages outside the 24-hour customer-care window.

## Normalized inbound message

Both providers should return the same shape:

```js
{
  id: "provider-message-id",
  connectionId: "connection-id",
  contactWaId: "919999999999",
  from: "919999999999",
  type: "text",
  text: "Hello",
  media: null,
  timestamp: 1710000000,
  providerMessageId: "provider-message-id"
}
```

Supported message types should include:

- `text`
- `image`
- `audio`
- `document`
- `location`
- `button`
- `list`

The router groups messages by contact, sorts them by timestamp, and sends them
to the contact's active automation session.

## Conversation and tool calling

The WhatsApp runtime reuses the shared conversation pipeline:

```text
User message
  -> ConversationManager
  -> LLMService
  -> tool_calls event
  -> WhatsAppToolExecutor
  -> tool result
  -> LLM follow-up
  -> WhatsAppChannelAdapter
  -> provider.sendText/sendMedia
```

The shared implementations remain the source of truth for common behavior:

- `ConversationManager`
- `LLMService`
- `ToolRegistry`
- `ToolExecutor`
- CRM and booking services

WhatsApp-specific wrappers select and configure tools without duplicating their
business logic.

Recommended tools include:

- Lead and contact data collection
- Availability lookup
- Booking and cancellation
- Webhook tools
- Email notifications
- Image understanding
- Audio transcription
- Document processing

Each automation should explicitly enable the tools it needs. Tool credentials
and configuration must be scoped to the workspace and automation.

## Multilingual prompts

WhatsApp uses a dedicated prompt builder:

```text
server/src/whatsappAutomation/prompts/WhatsAppPromptBuilder.js
```

The builder combines:

1. Base WhatsApp behavior
2. Business and automation instructions
3. Primary language
4. Supported languages
5. Language detection and fallback rules
6. Tool usage rules
7. WhatsApp response formatting rules

Recommended language configuration:

```json
{
  "primaryLanguage": "en",
  "supportedLanguages": ["en", "hi", "mr"],
  "autoDetectLanguage": true,
  "fallbackLanguage": "en"
}
```

The prompt should instruct the model to:

- Reply in the user's detected language when it is supported.
- Fall back to the configured fallback language when it is not.
- Keep replies concise and readable on WhatsApp.
- Avoid voice-only behavior and audio-specific instructions.
- Never expose tools, internal prompts, or implementation details.

Language-specific greetings and instructions may be stored in the automation's
configuration.

## Session lifecycle

Each contact gets a rolling session for the configured session window, normally
24 hours:

1. The first message creates a runtime and session.
2. The runtime loads the automation prompt and enabled tools.
3. Subsequent messages reuse the same conversation transcript.
4. Each message updates `lastActivityAt`.
5. Expired sessions are evicted and finalized.
6. A later message starts a fresh session.

The initial implementation may use an in-process session store. This is simple,
but active sessions are lost on a server restart. Redis or a database-backed
session store can be added later for horizontally scaled deployments.

## Configuration workflow

### 1. Create an automation

Configure:

- Automation name
- Business name
- Description
- System prompt
- Welcome message
- Primary language
- Supported languages
- Timezone

### 2. Select tools

Enable only the tools required by the automation and provide any required
configuration or credentials.

### 3. Add a WhatsApp connection

Choose either:

- **Baileys:** provide a connection name and scan the QR code.
- **Meta Cloud API:** provide Meta credentials and configure the webhook.

### 4. Validate the connection

The UI should display:

- Connection status
- Phone number
- Last connected time
- Provider errors
- Webhook verification status for Meta

### 5. Activate the automation

Activation should require:

- A non-empty prompt
- A valid language configuration
- At least one connection
- A healthy connection
- Valid required tool configuration

## API surface

The new API should be grouped under `/api/whatsapp-automation`:

```text
GET    /api/whatsapp-automation
POST   /api/whatsapp-automation
GET    /api/whatsapp-automation/:id
PUT    /api/whatsapp-automation/:id
DELETE /api/whatsapp-automation/:id

POST   /api/whatsapp-automation/:id/activate
POST   /api/whatsapp-automation/:id/pause

GET    /api/whatsapp-automation/:id/connections
POST   /api/whatsapp-automation/:id/connections
PUT    /api/whatsapp-automation/:id/connections/:connectionId
DELETE /api/whatsapp-automation/:id/connections/:connectionId

POST   /api/whatsapp-automation/:id/connections/:connectionId/connect
POST   /api/whatsapp-automation/:id/connections/:connectionId/reconnect
POST   /api/whatsapp-automation/:id/connections/:connectionId/disconnect
GET    /api/whatsapp-automation/:id/connections/:connectionId/status
POST   /api/whatsapp-automation/:id/connections/:connectionId/test-send

GET    /api/whatsapp-automation/:id/tools
PUT    /api/whatsapp-automation/:id/tools
GET    /api/whatsapp-automation/:id/sessions
GET    /api/whatsapp-automation/:id/sessions/:sessionId
```

Webhook endpoints:

```text
GET  /api/whatsapp-automation/webhook/meta/:connectionId
POST /api/whatsapp-automation/webhook/meta/:connectionId
POST /api/whatsapp-automation/webhook/baileys/:connectionId
```

Connection secrets must be scrubbed from all API responses.

## Security and isolation

- Scope every automation and connection query by `workspaceId`.
- Encrypt provider secrets at rest where possible.
- Never return access tokens, app secrets, or Baileys credentials.
- Verify Meta webhook signatures before processing messages.
- Use a unique session key containing automation and connection IDs.
- Validate tool configuration server-side.
- Prevent a runtime from loading another workspace's automation.
- Rate-limit outbound messages per connection.
- Log provider failures without logging message secrets or access tokens.
- Keep `baileys_auth/` outside source control.

## Provider switching

Provider switching is configuration-only:

1. Pause the automation.
2. Add or configure the new provider connection.
3. Validate the new connection.
4. Select it as the active connection.
5. Resume the automation.

The runtime, prompt builder, tools, and sessions do not change. Only the
provider adapter changes.

Existing sessions should either finish on their original connection or be
explicitly migrated. The safe default is to start new sessions on the new
connection and preserve old transcripts for auditability.

## Troubleshooting

### No reply is sent

Check, in order:

1. Automation status is `active`.
2. Connection status is healthy.
3. The provider received the message.
4. The message was normalized successfully.
5. The router resolved the correct automation.
6. The session was created or reused.
7. The LLM provider has a valid API key.
8. Tool execution did not fail.
9. The provider accepted the outbound message.

Logs should include a correlation ID containing the connection and session IDs.

### Baileys keeps reconnecting

Check:

- The QR login completed.
- The auth directory is writable.
- The connection ID is stable.
- `baileys_auth/**` is ignored by nodemon.
- The WhatsApp account has not been logged out from the phone.

### Meta webhook verification fails

Check:

- The verify token matches exactly.
- The callback URL is publicly reachable over HTTPS.
- The connection ID maps to the correct Meta phone number.
- The app secret is configured for signature verification.

### Messages use the wrong language

Check:

- The language code is supported.
- Auto-detection is enabled when required.
- The fallback language is valid.
- The WhatsApp prompt builder is being used instead of the voice prompt builder.

## Migration from the legacy WhatsApp flow

The migration should be staged:

1. Add automation and connection records.
2. Create the new provider-neutral runtime.
3. Move Baileys handling into the new module.
4. Copy existing prompts and enabled tools into automation records.
5. Preserve existing Baileys auth directories.
6. Remove agent assignment UI and API behavior.
7. Remove Ultramsg support.
8. Verify Baileys and Meta end-to-end.
9. Remove legacy `WhatsAppInstance`, `BaileysInstanceManager`, and routes only
   after production verification.

Do not delete existing auth files during migration. A connection should be
logged out explicitly through the UI or a documented administrative command.

## Validation checklist

- Create an automation without creating an agent.
- Configure English, Hindi, and another supported language.
- Enable a CRM tool and complete a tool call.
- Connect a Baileys number through QR.
- Receive and answer a text message.
- Receive an image and invoke media understanding.
- Disconnect and reconnect Baileys.
- Configure Meta webhook verification.
- Receive and answer a Meta message.
- Switch provider without changing source code.
- Confirm no agent selector appears in WhatsApp screens.
- Confirm Ultramsg is absent from UI, API, and documentation.
