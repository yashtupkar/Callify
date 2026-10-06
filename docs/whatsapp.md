# Legacy WhatsApp Channel

This document is retained as a migration pointer for the previous WhatsApp
implementation. It is not the specification for new WhatsApp work.

The current target architecture is documented in
[WhatsApp Automation](./whatsapp-automation.md).

## Legacy behavior

The previous implementation used:

- `WhatsAppInstance` records
- `PhoneNumber` records linked to agents
- `BaileysInstanceManager`
- Agent-based WhatsApp routing
- Legacy provider-specific routes

These components are being replaced by standalone WhatsApp automations. New
features must not add agent assignment, Ultramsg support, or new dependencies
on the legacy routes.

## Migration warning

Do not delete existing Baileys authentication folders during migration:

```text
server/baileys_auth/<connection-id>/
```

Use the new automation migration process to preserve existing connections and
explicitly log out a connection before removing its credentials.

See [WhatsApp Automation](./whatsapp-automation.md) for:

- The provider-neutral architecture
- Baileys and Meta Cloud API configuration
- Multilingual prompt behavior
- Shared tool calling
- Session lifecycle
- Security and workspace isolation
- Troubleshooting
- Migration and validation checklists
