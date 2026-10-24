import crypto from 'node:crypto';
import { apiRequest, BotmailCliError } from './api.mjs';
import { outputResult, printTable } from './format.mjs';
import { handleSecurityCommands } from './commands-security.mjs';

function norm(m) {
  return {
    id: m.id,
    direction: m.direction,
    from: m.headerFrom || m.header_from || m.envelopeFrom || m.envelope_from || '',
    to: m.headerTo || m.header_to || m.envelopeTo || m.envelope_to || '',
    subject: m.subject || '(no subject)',
    status: m.status,
    folder: m.folder || 'inbox',
    createdAt: m.createdAt || m.created_at || '',
  };
}

export async function handleMessagesAndSecurity(settings, resource, action, rest, flags) {
  if (resource === 'messages' || resource === 'message' || resource === 'mail') {
    const inboxId = flags.inbox || flags['inbox-id'];
    if (!action || action === 'list' || action === 'ls') {
      const qs = new URLSearchParams();
      if (inboxId) qs.set('inboxId', String(inboxId));
      if (flags.direction) qs.set('direction', String(flags.direction));
      if (flags.folder) qs.set('folder', String(flags.folder));
      if (flags.limit) qs.set('limit', String(flags.limit));
      const d = await apiRequest(settings, `/messages?${qs}`);
      const rows = (d.messages || []).map(norm);
      return outputResult(settings, { data_untrusted: true, messages: rows, hasMore: Boolean(d.hasMore) }, (r) => {
        printTable(r.messages, [
          { key: 'id', label: 'ID' },
          { key: 'direction', label: 'DIR' },
          { key: 'from', label: 'FROM', maxWidth: 28 },
          { key: 'subject', label: 'SUBJECT', maxWidth: 40 },
          { key: 'status', label: 'STATUS' },
        ]);
      });
    }
    if (action === 'search') {
      const q = String(flags.query || rest[0] || '').toLowerCase();
      if (!q) throw new BotmailCliError('Missing --query <substring>', { code: 'invalid_args', exitCode: 2 });
      const qs = new URLSearchParams();
      if (inboxId) qs.set('inboxId', String(inboxId));
      const d = await apiRequest(settings, `/messages?${qs}`);
      const hits = (d.messages || []).map(norm).filter((m) =>
        m.subject.toLowerCase().includes(q) || m.from.toLowerCase().includes(q) || m.to.toLowerCase().includes(q),
      );
      return outputResult(settings, { data_untrusted: true, messages: hits, total: hits.length }, (r) => {
        printTable(r.messages, [
          { key: 'id', label: 'ID' },
          { key: 'direction', label: 'DIR' },
          { key: 'subject', label: 'SUBJECT', maxWidth: 44 },
          { key: 'status', label: 'STATUS' },
        ]);
      });
    }
    if (action === 'get' || action === 'read') {
      const id = rest[0] || flags.id;
      if (!id) throw new BotmailCliError('Missing <messageId>', { code: 'invalid_args', exitCode: 2 });
      const d = await apiRequest(settings, `/messages/${encodeURIComponent(id)}`);
      const m = d.message || {};
      return outputResult(settings, { data_untrusted: true, message: m }, () => {
        process.stdout.write(`ID: ${m.id} | ${m.direction} (${m.status})\nFrom: ${m.headerFrom || m.header_from || m.envelopeFrom || m.envelope_from}\nTo: ${m.headerTo || m.header_to || m.envelopeTo || m.envelope_to}\nSubject: ${m.subject}\n--- UNTRUSTED BODY ---\n${m.bodyText || m.body_text || ''}\n`);
      });
    }
    if (action === 'send') {
      const to = flags.to, subject = flags.subject, bodyText = flags.text || flags.body;
      if (!inboxId || !to || !subject || !bodyText) {
        throw new BotmailCliError('Missing flags: --inbox <id> --to <email> --subject <text> --text <body>', { code: 'invalid_args', exitCode: 2 });
      }
      const opId = String(flags['operation-id'] || crypto.randomUUID());
      const d = await apiRequest(settings, '/messages', {
        method: 'POST',
        headers: { 'Idempotency-Key': opId, 'X-Operation-Id': opId },
        body: { inboxId: String(inboxId), to: String(to), subject: String(subject), bodyText: String(bodyText) },
      });
      const route = d._internal ? 'internal' : 'external';
      const credits = d._internal ? 0 : (d.message?.status === 'sent' ? 1 : 0);
      return outputResult(settings, { route, provider_credits_consumed: credits, ...d }, (r) => {
        process.stdout.write(`✓ Message ${r.message?.id} ${r.message?.status} (route: ${r.route}, credits: ${r.provider_credits_consumed})\n`);
      });
    }
    if (action === 'reply') {
      const id = rest[0] || flags.id || flags.message, bodyText = flags.text || flags.body;
      if (!id || !bodyText) throw new BotmailCliError('Usage: botmail messages reply <messageId> --text <body>', { code: 'invalid_args', exitCode: 2 });
      const opId = String(flags['operation-id'] || crypto.randomUUID());
      const d = await apiRequest(settings, `/messages/${encodeURIComponent(id)}/reply`, {
        method: 'POST',
        headers: { 'Idempotency-Key': opId, 'X-Operation-Id': opId },
        body: { bodyText: String(bodyText) },
      });
      const route = d._internal ? 'internal' : 'external';
      const credits = d._internal ? 0 : (d.message?.status === 'sent' ? 1 : 0);
      return outputResult(settings, { route, provider_credits_consumed: credits, ...d }, (r) => {
        process.stdout.write(`✓ Reply ${r.message?.id} ${r.message?.status} (route: ${r.route})\n`);
      });
    }
    if (action === 'escalate' || action === 'forward') {
      const id = rest[0] || flags.id || flags.message;
      const to = flags.to;
      const note = flags.note || flags.text || flags.summary || 'Escalated via Botmail CLI over the Free Internal Escalation Bus.';
      if (!id || !to) {
        throw new BotmailCliError('Usage: botmail messages escalate <messageId> --to <target@botmail.work> [--note <summary>] [--severity low|normal|high|critical] [--category <tag>]', { code: 'invalid_args', exitCode: 2 });
      }
      const opId = String(flags['operation-id'] || crypto.randomUUID());
      const d = await apiRequest(settings, `/messages/${encodeURIComponent(id)}/escalate`, {
        method: 'POST',
        headers: { 'Idempotency-Key': opId, 'X-Operation-Id': opId },
        body: {
          to: String(to),
          note: String(note),
          severity: flags.severity ? String(flags.severity) : 'normal',
          category: flags.category ? String(flags.category) : undefined,
        },
      });
      return outputResult(settings, { route: 'internal_escalation_bus', provider_credits_consumed: 0, ...d }, (r) => {
        process.stdout.write(`✓ Escalated message ${id} -> ${r.escalation?.to || to} (severity: ${r.escalation?.severity || 'normal'}, route: internal_escalation_bus, credits: 0)\n`);
      });
    }
    if (action === 'archive' || action === 'delete' || action === 'trash' || action === 'rm') {
      const id = rest[0] || flags.id;
      if (!id) throw new BotmailCliError('Missing <messageId>', { code: 'invalid_args', exitCode: 2 });
      const opId = String(flags['operation-id'] || crypto.randomUUID());
      const ep = action === 'archive' ? 'archive' : 'trash';
      const d = await apiRequest(settings, `/messages/${encodeURIComponent(id)}/${ep}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': opId, 'X-Operation-Id': opId },
      });
      return outputResult(settings, d, (r) => process.stdout.write(`✓ ${action === 'archive' ? 'Archived' : 'Deleted'} message ${r.id}\n`));
    }
    throw new BotmailCliError(`Unknown messages action: ${action}`, { code: 'invalid_args', exitCode: 2 });
  }

  if (resource === 'escalation' || resource === 'escalation-bus' || resource === 'bus') {
    if (!action || action === 'status' || action === 'targets' || action === 'list') {
      const d = await apiRequest(settings, '/escalation-bus');
      return outputResult(settings, d, (r) => {
        process.stdout.write(`⚡ Free Internal Escalation Bus: ${r.bus?.enabled ? 'ACTIVE' : 'PAUSED'} (0 Credits · Daily Limit: ${r.bus?.dailyLimit ?? 5000})\n`);
        process.stdout.write(`  Today: ${r.stats?.internalSentToday ?? 0} internal deliveries (${r.stats?.escalationsToday ?? 0} escalations) · Total Credits Saved: ${r.stats?.creditsSaved ?? 0}\n`);
        printTable(r.recommendedTargets || [], [
          { key: 'address', label: 'ESCALATION TARGET' },
          { key: 'category', label: 'CATEGORY' },
          { key: 'provisioned', label: 'PROVISIONED' },
          { key: 'label', label: 'DESCRIPTION', maxWidth: 36 },
        ]);
      });
    }
    if (action === 'provision') {
      const prefix = flags.prefix || rest[0];
      if (!prefix) throw new BotmailCliError('Usage: botmail escalation provision --prefix <tier2-eng|billing-review> [--display-name <label>] [--project <id>]', { code: 'invalid_args', exitCode: 2 });
      const d = await apiRequest(settings, '/escalation-bus/provision', {
        method: 'POST',
        body: {
          prefix: String(prefix),
          displayName: flags['display-name'] ? String(flags['display-name']) : undefined,
          projectId: flags.project || flags['project-id'] ? String(flags.project || flags['project-id']) : undefined,
        },
      });
      return outputResult(settings, d, (r) => {
        process.stdout.write(`✓ Provisioned escalation target ${r.inbox?.address} (${r.inbox?.id})\n`);
      });
    }
    throw new BotmailCliError(`Unknown escalation action: ${action}`, { code: 'invalid_args', exitCode: 2 });
  }

  return handleSecurityCommands(settings, resource, action, rest, flags);
}
