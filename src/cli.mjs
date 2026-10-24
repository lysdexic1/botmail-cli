import { resolveSettings, writeConfig, clearConfig } from './config.mjs';
import { apiRequest, BotmailCliError } from './api.mjs';
import { runBrowserOAuthLogin } from './oauth.mjs';
import { CLI_MANIFEST } from './manifest.mjs';
import { parseArgs, outputResult } from './format.mjs';
import { handleResourceCommands } from './commands.mjs';

function printHelp() {
  process.stdout.write(`Botmail CLI v${CLI_MANIFEST.version} — Official AI-Agent-Native CLI for Botmail
REST API: ${CLI_MANIFEST.endpoints.restApi} | MCP: ${CLI_MANIFEST.endpoints.remoteMcp}

Usage:
  botmail <resource> <action> [arguments] [flags]

Commands:
  botmail auth login [--token <bm_...>] [--no-browser]
  botmail auth status | logout
  botmail projects list | create --name <name> [--description <text>]
  botmail inboxes list [--project <id>] | get <id> | check <addr> | create --project <id> [--prefix <p>] | close <id>
  botmail messages list [--inbox <id>] [--direction inbound|outbound] [--folder inbox|archive]
  botmail messages search --query <text> [--inbox <id>]
  botmail messages get <messageId>
  botmail messages send --inbox <id> --to <email> --subject <subj> --text <body> [--operation-id <id>]
  botmail messages escalate <messageId> --to <target@botmail.work> [--note <summary>] [--severity low|normal|high|critical]
  botmail messages reply <messageId> --text <body> [--operation-id <id>]
  botmail messages archive <messageId> | delete <messageId>
  botmail escalation status | provision --prefix <tier2-eng|billing-review> [--project <id>]
  botmail agents list | create --name <name> [--description <text>]
  botmail credentials list | create --agent <id> --name <label> [--scopes read,send,manage] | revoke <id>
  botmail connections list | revoke <id>
  botmail usage
  botmail mcp config [--client cline|claude|cursor]
  botmail schema

Global Flags:
  --json, -j        Output machine-readable JSON (or set BOTMAIL_OUTPUT=json)
  --token <token>   Bearer token (overrides BOTMAIL_API_TOKEN & saved config)
  --api-url <url>   Override REST API base URL (default: https://api.botmail.work/v1)
  --quiet, -q       Suppress non-essential output
  --help, -h        Show help
  --version, -v     Print version
`);
}

export async function runCli(argv) {
  const { positionals, flags } = parseArgs(argv);
  const settings = resolveSettings(flags);

  if (flags.version || positionals[0] === 'version') {
    return outputResult(settings, { name: CLI_MANIFEST.name, version: CLI_MANIFEST.version }, () => {
      process.stdout.write(`${CLI_MANIFEST.version}\n`);
    });
  }
  if (positionals[0] === 'schema' || positionals[0] === 'agent-manifest') {
    process.stdout.write(JSON.stringify(CLI_MANIFEST, null, 2) + '\n');
    return;
  }
  if (flags.help || positionals.length === 0 || positionals[0] === 'help') {
    if (settings.json) process.stdout.write(JSON.stringify(CLI_MANIFEST, null, 2) + '\n');
    else printHelp();
    return;
  }

  const [resource, action, ...rest] = positionals;

  if (resource === 'auth') {
    if (action === 'login') {
      const provided = typeof flags.token === 'string' ? flags.token : rest[0];
      if (provided) {
        const testCfg = { ...settings, token: provided };
        const me = await apiRequest(testCfg, '/auth/me').catch(async () => {
          await apiRequest(testCfg, '/inboxes');
          return { user: { role: 'agent' } };
        });
        writeConfig({ apiUrl: settings.apiUrl, mcpUrl: settings.mcpUrl, token: provided });
        return outputResult(settings, { ok: true, method: 'token', user: me.user, configPath: settings.configPath }, (r) => {
          process.stdout.write(`✓ Saved Botmail token to ${r.configPath}\n`);
        });
      }
      const res = await runBrowserOAuthLogin(settings, {
        scope: typeof flags.scope === 'string' ? flags.scope : 'read send manage',
        noBrowser: Boolean(flags['no-browser']),
      });
      return outputResult(settings, res, (r) => {
        process.stdout.write(`✓ Authenticated via OAuth 2.1 PKCE (${r.clientId}). Saved to ${r.configPath}\n`);
      });
    }
    if (action === 'status' || action === 'whoami') {
      const data = await apiRequest(settings, '/auth/me').catch(async () => {
        const ib = await apiRequest(settings, '/inboxes');
        return { user: { role: 'agent', activeInboxes: ib.inboxes?.length ?? 0 } };
      });
      return outputResult(settings, { authenticated: true, apiUrl: settings.apiUrl, ...data }, (d) => {
        process.stdout.write(`✓ Authenticated against ${d.apiUrl} (${d.user?.email || d.user?.role || 'agent'})\n`);
      });
    }
    if (action === 'logout') {
      clearConfig();
      return outputResult(settings, { ok: true }, () => process.stdout.write('✓ Logged out.\n'));
    }
    throw new BotmailCliError(`Unknown auth action: ${action}`, { code: 'invalid_args', exitCode: 2 });
  }

  if (resource === 'usage') {
    const d = await apiRequest(settings, '/usage');
    return outputResult(settings, d, () => {
      const u = d.usage || {};
      process.stdout.write(`Inboxes: ${u.inboxes?.used ?? 0}/${u.inboxes?.limit ?? 0} | Inbox Storage: ${u.messages?.used ?? 0}/${u.messages?.limit ?? 0} | Archive: ${u.archive?.used ?? 0}/${u.archive?.limit ?? 2500} | Inbound: ${u.inbound?.used ?? 0}/${u.inbound?.limit ?? 0} | Outbound (Ext): ${u.outbound?.used ?? 0}/${u.outbound?.limit ?? 0} | Internal Escalation Bus: ${u.internalBus?.used ?? 0}/${u.internalBus?.limit ?? 5000} (0 credits, ${u.internalBus?.totalSavedCredits ?? 0} saved)\n`);
    });
  }

  if (resource === 'mcp') {
    const client = String(flags.client || action || 'cline').toLowerCase();
    const config = {
      mcpServers: {
        botmail: settings.token
          ? { url: settings.mcpUrl, headers: { Authorization: `Bearer ${settings.token}` } }
          : { type: 'streamableHttp', url: settings.mcpUrl },
      },
    };
    return outputResult(settings, { client, endpoint: settings.mcpUrl, config }, (d) => {
      process.stdout.write(JSON.stringify(d.config, null, 2) + '\n');
    });
  }

  return handleResourceCommands(settings, resource, action, rest, flags);
}
