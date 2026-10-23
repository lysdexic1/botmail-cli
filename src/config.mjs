import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const DEFAULT_API_URL = 'https://api.botmail.work/v1';
export const DEFAULT_MCP_URL = 'https://mcp.botmail.work';

export function getConfigPath() {
  if (process.env.BOTMAIL_CONFIG_PATH) return process.env.BOTMAIL_CONFIG_PATH;
  const base = process.platform === 'win32'
    ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(base, 'botmail', 'config.json');
}

export function readConfig() {
  const cfgPath = getConfigPath();
  try {
    if (!fs.existsSync(cfgPath)) return {};
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return {};
  }
}

export function writeConfig(next) {
  const cfgPath = getConfigPath();
  const dir = path.dirname(cfgPath);
  fs.mkdirSync(dir, { recursive: true });
  const merged = { ...readConfig(), ...next, updatedAt: new Date().toISOString() };
  fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2), { mode: 0o600 });
  return merged;
}

export function clearConfig() {
  const cfgPath = getConfigPath();
  try {
    if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
  } catch { /* ignore */ }
}

export function resolveSettings(flags = {}) {
  const cfg = readConfig();
  const apiUrl = (flags['api-url'] || process.env.BOTMAIL_API_URL || cfg.apiUrl || DEFAULT_API_URL).replace(/\/+$/, '');
  const mcpUrl = (flags['mcp-url'] || process.env.BOTMAIL_MCP_URL || cfg.mcpUrl || DEFAULT_MCP_URL).replace(/\/+$/, '');
  const token = flags.token || process.env.BOTMAIL_API_TOKEN || cfg.token || '';
  const refreshToken = cfg.refreshToken || '';
  const clientId = cfg.clientId || '';
  const json = Boolean(flags.json || process.env.BOTMAIL_OUTPUT === 'json');
  const quiet = Boolean(flags.quiet);
  return { apiUrl, mcpUrl, token, refreshToken, clientId, json, quiet, configPath: getConfigPath() };
}
