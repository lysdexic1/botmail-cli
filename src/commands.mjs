import crypto from 'node:crypto';
import { apiRequest, BotmailCliError } from './api.mjs';
import { outputResult, printTable } from './format.mjs';
import { handleMessagesAndSecurity } from './commands-messages.mjs';

export async function handleResourceCommands(settings, resource, action, rest, flags) {
  // ─── projects ──────────────────────────────────────────────────────────────
  if (resource === 'projects' || resource === 'project') {
    if (!action || action === 'list' || action === 'ls') {
      const data = await apiRequest(settings, '/projects');
      return outputResult(settings, data, (d) => {
        printTable(d.projects, [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'NAME' },
          { key: 'status', label: 'STATUS' },
        ]);
      });
    }
    if (action === 'create') {
      const name = flags.name || rest[0];
      if (!name) throw new BotmailCliError('Missing --name <projectName>', { code: 'invalid_args', exitCode: 2 });
      const data = await apiRequest(settings, '/projects', {
        method: 'POST',
        body: { name: String(name), description: flags.description ? String(flags.description) : undefined },
      });
      return outputResult(settings, data, (d) => {
        process.stdout.write(`✓ Created project ${d.project.name} (${d.project.id})\n`);
      });
    }
    throw new BotmailCliError(`Unknown projects action: ${action}`, { code: 'invalid_args', exitCode: 2 });
  }

  // ─── inboxes ───────────────────────────────────────────────────────────────
  if (resource === 'inboxes' || resource === 'inbox') {
    if (!action || action === 'list' || action === 'ls') {
      const data = await apiRequest(settings, '/inboxes');
      const projectFilter = flags.project || flags['project-id'];
      const rows = (data.inboxes || []).filter((ib) => !projectFilter || (ib.projectId || ib.project_id) === projectFilter);
      return outputResult(settings, { inboxes: rows }, (d) => {
        printTable(d.inboxes, [
          { key: 'id', label: 'ID' },
          { key: 'address', label: 'ADDRESS' },
          { key: 'type', label: 'TYPE' },
          { key: 'state', label: 'STATE' },
        ]);
      });
    }
    if (action === 'get') {
      const id = rest[0] || flags.id;
      if (!id) throw new BotmailCliError('Missing <inboxId>', { code: 'invalid_args', exitCode: 2 });
      const data = await apiRequest(settings, `/inboxes/${encodeURIComponent(id)}`);
      return outputResult(settings, data);
    }
    if (action === 'check') {
      const raw = rest[0] || flags.address;
      if (!raw) throw new BotmailCliError('Missing <addressOrPrefix>', { code: 'invalid_args', exitCode: 2 });
      const addr = String(raw).includes('@') ? String(raw) : `${raw}@botmail.work`;
      const data = await apiRequest(settings, `/inboxes/check?address=${encodeURIComponent(addr)}`);
      return outputResult(settings, data, (d) => {
        process.stdout.write(`${d.address}: ${d.available ? '✓ AVAILABLE' : '✗ TAKEN / RESERVED'}\n`);
      });
    }
    if (action === 'create') {
      const projectId = flags.project || flags['project-id'];
      if (!projectId) throw new BotmailCliError('Missing --project <projectId>', { code: 'invalid_args', exitCode: 2 });
      const opId = flags['operation-id'] || crypto.randomUUID();
      const data = await apiRequest(settings, '/inboxes', {
        method: 'POST',
        headers: { 'Idempotency-Key': String(opId), 'X-Operation-Id': String(opId) },
        body: {
          projectId: String(projectId),
          prefix: flags.prefix ? String(flags.prefix) : undefined,
          displayName: flags['display-name'] ? String(flags['display-name']) : undefined,
          type: flags.type ? String(flags.type) : 'persistent',
        },
      });
      return outputResult(settings, data, (d) => {
        process.stdout.write(`✓ Provisioned inbox ${d.inbox.address} (${d.inbox.id})\n`);
      });
    }
    if (action === 'close') {
      const id = rest[0] || flags.id;
      if (!id) throw new BotmailCliError('Missing <inboxId>', { code: 'invalid_args', exitCode: 2 });
      const data = await apiRequest(settings, `/inboxes/${encodeURIComponent(id)}/close`, { method: 'POST' });
      return outputResult(settings, data, (d) => {
        process.stdout.write(`✓ Closed inbox ${d.address} (permanently tombstoned)\n`);
      });
    }
    throw new BotmailCliError(`Unknown inboxes action: ${action}`, { code: 'invalid_args', exitCode: 2 });
  }

  return handleMessagesAndSecurity(settings, resource, action, rest, flags);
}
