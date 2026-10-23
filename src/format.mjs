export function parseArgs(argv = []) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg === '-h') {
      flags.help = true;
    } else if (arg === '-v') {
      flags.version = true;
    } else if (arg === '-j') {
      flags.json = true;
    } else if (arg === '-q') {
      flags.quiet = true;
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

export function outputResult(settings, payload, humanFormatter) {
  if (settings.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return;
  }
  if (humanFormatter) {
    humanFormatter(payload);
  } else {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  }
}

export function printTable(rows, columns) {
  if (!rows || rows.length === 0) {
    process.stdout.write('(none)\n');
    return;
  }
  const widths = columns.map((col) => {
    const maxVal = Math.max(...rows.map((r) => String(r[col.key] ?? '').length));
    return Math.max(col.label.length, Math.min(maxVal, col.maxWidth || 48));
  });
  const header = columns.map((col, idx) => col.label.padEnd(widths[idx])).join('  ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  process.stdout.write(`${header}\n${sep}\n`);
  for (const row of rows) {
    const line = columns.map((col, idx) => {
      let val = String(row[col.key] ?? '');
      if (col.maxWidth && val.length > col.maxWidth) val = val.slice(0, col.maxWidth - 1) + '…';
      return val.padEnd(widths[idx]);
    }).join('  ');
    process.stdout.write(`${line}\n`);
  }
}
