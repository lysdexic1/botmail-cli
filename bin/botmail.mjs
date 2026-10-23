#!/usr/bin/env node
import { runCli } from '../src/cli.mjs';

runCli(process.argv.slice(2)).catch((err) => {
  const isJson = process.argv.includes('--json') || process.env.BOTMAIL_OUTPUT === 'json';
  if (isJson) {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: err?.message ?? String(err),
      code: err?.code ?? 'cli_error',
      status: err?.status ?? null,
    }, null, 2) + '\n');
  } else {
    process.stderr.write(`Error: ${err?.message ?? String(err)}\n`);
  }
  process.exit(err?.exitCode ?? 1);
});
