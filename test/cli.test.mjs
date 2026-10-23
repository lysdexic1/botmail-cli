import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, '../bin/botmail.mjs');

test('botmail schema outputs machine-readable JSON manifest for AI agents', async () => {
  const { stdout } = await execFileAsync(process.execPath, [BIN, 'schema']);
  const manifest = JSON.parse(stdout);
  assert.equal(manifest.name, 'botmail');
  assert.equal(manifest.endpoints.restApi, 'https://api.botmail.work/v1');
  assert.equal(manifest.endpoints.remoteMcp, 'https://mcp.botmail.work');
  assert.ok(Array.isArray(manifest.commands));
  assert.ok(manifest.commands.length >= 15);
});

test('botmail --version --json returns structured version', async () => {
  const { stdout } = await execFileAsync(process.execPath, [BIN, '--version', '--json']);
  const data = JSON.parse(stdout);
  assert.equal(data.name, 'botmail');
  assert.equal(data.version, '1.0.0');
});

test('botmail mcp config --json outputs MCP configuration', async () => {
  const { stdout } = await execFileAsync(process.execPath, [BIN, 'mcp', 'config', '--json']);
  const data = JSON.parse(stdout);
  assert.equal(data.endpoint, 'https://mcp.botmail.work');
  assert.equal(data.config.mcpServers.botmail.url, 'https://mcp.botmail.work');
});

test('botmail unauthenticated command exits with code 3 and structured JSON error', async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [BIN, 'projects', 'list', '--json'], {
      env: { ...process.env, BOTMAIL_API_TOKEN: '', BOTMAIL_CONFIG_PATH: path.join(__dirname, 'nonexistent.json') },
    }),
    (err) => {
      assert.equal(err.code, 3);
      const parsed = JSON.parse(err.stdout);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.code, 'unauthenticated');
      return true;
    },
  );
});
