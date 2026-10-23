# Botmail CLI (`botmail-cli`)

Official, zero-dependency, **AI-agent-native CLI** for [Botmail](https://botmail.work) — project-owned email identities, persistent & ephemeral inboxes, zero-credit internal routing, OAuth 2.1 PKCE authentication, and Model Context Protocol (MCP) configuration.

- **REST API**: `https://api.botmail.work/v1`
- **Remote MCP (Streamable HTTP)**: `https://mcp.botmail.work`
- **Dashboard**: `https://app.botmail.work`
- **Developer Wiki**: `https://dev.botmail.work/cli.html`

---

## Installation

Run directly via `npx` or install globally from GitHub:

```bash
# Run directly without installing
npx github:lysdexic1/botmail-cli --help

# Install globally
npm install -g github:lysdexic1/botmail-cli
botmail --version
```

---

## Built for AI Coding Agents & Humans

`botmail-cli` is designed from the ground up to be used natively by autonomous AI agents (Claude Code, Cline, Cursor, Codex, custom bash agents) as well as human developers:

1. **Self-Discoverable Schema (`botmail schema`)**: AI agents can run `botmail schema` (or `botmail --help --json`) to receive a complete machine-readable JSON manifest of all commands, flags, endpoints, and exit codes in one call.
2. **Deterministic JSON Output (`--json` / `BOTMAIL_OUTPUT=json`)**: Every command supports `--json` (or `-j`) and returns structured JSON on `stdout`, including structured JSON errors and deterministic exit codes (`0` success, `2` invalid arguments, `3` auth/permission denied, `4` not found).
3. **Non-Interactive & Idempotent**: Every write command (`inboxes create`, `messages send`, `messages reply`, `messages archive`, `messages delete`) accepts `--operation-id <key>` (`Idempotency-Key`) so agents can safely retry operations without duplicate sends.
4. **Untrusted Content Markers**: Message read/list/search outputs include `data_untrusted: true` in JSON mode and explicit boundary headers in text mode to help agents defend against prompt injection in inbound emails.

---

## Authentication

### 1. Interactive OAuth 2.1 PKCE Login (Browser)
```bash
botmail auth login
```
Opens your browser to `https://app.botmail.work`, lets you choose scopes (`read`, `send`, `manage`) and inbox boundaries, and stores your OAuth 2.1 token (with automatic refresh token rotation).

### 2. Scoped Agent Token Login (Headless / CI / AI Agents)
```bash
botmail auth login --token bm_...
# Or pass via environment variable without saving to disk:
export BOTMAIL_API_TOKEN="bm_..."
export BOTMAIL_OUTPUT="json"
```

Check your authentication status at any time:
```bash
botmail auth status
```

---

## Command Reference

### Projects & Inboxes
```bash
# List workspace projects
botmail projects list [--json]

# Create a new project
botmail projects create --name "Customer Support Bot" --description "Autonomous support triage"

# Check if a @botmail.work address is available
botmail inboxes check support-bot

# Provision a persistent or ephemeral inbox
botmail inboxes create --project <projectId> --prefix support-bot --display-name "Support Bot" --type persistent

# List active inboxes
botmail inboxes list [--project <projectId>] [--json]

# Close an inbox (permanently tombstones the address so it can never be reassigned)
botmail inboxes close <inboxId>
```

### Sending, Receiving & Managing Messages
```bash
# List messages in an inbox (active inbox storage or archive box)
botmail messages list --inbox <inboxId> [--direction inbound|outbound] [--folder inbox|archive] [--limit 20] [--json]

# Search messages across subject and sender/recipient headers
botmail messages search --query "invoice" [--inbox <inboxId>] [--json]

# Read full message content
botmail messages get <messageId> [--json]

# Send an email (0 provider credits consumed for internal @botmail.work recipients)
botmail messages send \
  --inbox <inboxId> \
  --to recipient@example.com \
  --subject "Status Update" \
  --text "Hello from Botmail CLI!" \
  --operation-id "op-unique-123" \
  [--json]

# Reply to an inbound message thread
botmail messages reply <messageId> --text "Thanks, we received your message." [--operation-id <key>] [--json]

# Archive a message to free active inbox storage
botmail messages archive <messageId>

# Permanently delete a message
botmail messages delete <messageId>
```

### Agents, Credentials, OAuth Connections & Quotas
```bash
# Inspect workspace quotas & storage usage
botmail usage [--json]

# Manage named agents & reveal-once credentials
botmail agents list
botmail agents create --name "Cline Agent"
botmail credentials create --agent <agentId> --name "Production Key" --scopes read,send,manage
botmail credentials revoke <credentialId>

# Inspect or revoke OAuth 2.1 connections
botmail connections list
botmail connections revoke <connectionId>

# Print ready-to-use MCP configuration for Cline, Claude Desktop, or Cursor
botmail mcp config
```

## License

MIT © Munro Entertainment
