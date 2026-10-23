import { apiRequest, BotmailCliError } from './api.mjs';
import { outputResult, printTable } from './format.mjs';

export async function handleSecurityCommands(settings, resource, action, rest, flags) {
  // ─── agents ────────────────────────────────────────────────────────────────
  if (resource === 'agents' || resource === 'agent') {
    if (!action || action === 'list' || action === 'ls') {
      const data = await apiRequest(settings, '/agents');
      return outputResult(settings, data, (d) => {
        printTable(d.agents, [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'NAME' },
          { key: 'description', label: 'DESCRIPTION', maxWidth: 40 },
        ]);
      });
    }
    if (action === 'create') {
      const name = flags.name || rest[0];
      if (!name) throw new BotmailCliError('Missing --name <agentName>', { code: 'invalid_args', exitCode: 2 });
      const data = await apiRequest(settings, '/agents', {
        method: 'POST',
        body: { name: String(name), description: flags.description ? String(flags.description) : undefined },
      });
      return outputResult(settings, data, (d) => {
        process.stdout.write(`✓ Created agent ${d.agent.name} (${d.agent.id})\n`);
      });
    }
    throw new BotmailCliError(`Unknown agents action: ${action}`, { code: 'invalid_args', exitCode: 2 });
  }

  // ─── credentials ───────────────────────────────────────────────────────────
  if (resource === 'credentials' || resource === 'credential' || resource === 'creds') {
    if (!action || action === 'list' || action === 'ls') {
      const data = await apiRequest(settings, '/credentials');
      const rows = (data.credentials || []).map((c) => ({
        id: c.id,
        name: c.name,
        prefix: c.tokenPrefix || c.token_prefix,
        scopes: c.scopes,
        status: (c.isRevoked || c.is_revoked) ? 'revoked' : 'active',
      }));
      return outputResult(settings, { credentials: rows }, (d) => {
        printTable(d.credentials, [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'NAME' },
          { key: 'prefix', label: 'PREFIX' },
          { key: 'scopes', label: 'SCOPES' },
          { key: 'status', label: 'STATUS' },
        ]);
      });
    }
    if (action === 'create') {
      const agentId = flags.agent || flags['agent-id'];
      const name = flags.name || rest[0];
      if (!agentId || !name) throw new BotmailCliError('Missing --agent <agentId> --name <label>', { code: 'invalid_args', exitCode: 2 });
      const data = await apiRequest(settings, '/credentials', {
        method: 'POST',
        body: {
          agentId: String(agentId),
          name: String(name),
          scopes: flags.scopes ? String(flags.scopes) : 'read,send,manage',
          expiresIn: flags['expires-in'] ? String(flags['expires-in']) : undefined,
        },
      });
      return outputResult(settings, data, (d) => {
        process.stdout.write(`✓ Created credential ${d.credential.name} (${d.credential.id})\n  Token (shown once): ${d.token}\n`);
      });
    }
    if (action === 'revoke') {
      const id = rest[0] || flags.id;
      if (!id) throw new BotmailCliError('Missing <credentialId>', { code: 'invalid_args', exitCode: 2 });
      const data = await apiRequest(settings, `/credentials/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
      return outputResult(settings, data, () => process.stdout.write(`✓ Revoked credential ${id}\n`));
    }
    throw new BotmailCliError(`Unknown credentials action: ${action}`, { code: 'invalid_args', exitCode: 2 });
  }

  // ─── connections (OAuth grants) ────────────────────────────────────────────
  if (resource === 'connections' || resource === 'connection') {
    if (!action || action === 'list' || action === 'ls') {
      const data = await apiRequest(settings, '/connections');
      return outputResult(settings, data, (d) => {
        printTable(d.connections, [
          { key: 'id', label: 'ID' },
          { key: 'clientId', label: 'CLIENT ID' },
          { key: 'scopes', label: 'SCOPES' },
          { key: 'status', label: 'STATUS' },
        ]);
      });
    }
    if (action === 'revoke') {
      const id = rest[0] || flags.id;
      if (!id) throw new BotmailCliError('Missing <connectionId>', { code: 'invalid_args', exitCode: 2 });
      const data = await apiRequest(settings, `/connections/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
      return outputResult(settings, data, () => process.stdout.write(`✓ Revoked OAuth connection ${id}\n`));
    }
    throw new BotmailCliError(`Unknown connections action: ${action}`, { code: 'invalid_args', exitCode: 2 });
  }

  throw new BotmailCliError(`Unknown resource: ${resource}. Run 'botmail --help' or 'botmail schema'.`, { code: 'invalid_args', exitCode: 2 });
}
