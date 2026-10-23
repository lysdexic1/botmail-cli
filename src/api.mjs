import { writeConfig } from './config.mjs';

export class BotmailCliError extends Error {
  constructor(message, { code = 'cli_error', status = null, exitCode = 1 } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.exitCode = exitCode;
  }
}

export async function apiRequest(settings, endpointPath, options = {}) {
  if (!settings.token && !options.publicEndpoint) {
    throw new BotmailCliError(
      'Not authenticated. Run `botmail auth login` or pass `--token <bm_...>` / set `BOTMAIL_API_TOKEN`.',
      { code: 'unauthenticated', exitCode: 3 },
    );
  }

  const url = endpointPath.startsWith('http')
    ? endpointPath
    : `${settings.apiUrl}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`;

  const doFetch = async (bearer) => {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    };
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
    return fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
    });
  };

  let res = await doFetch(settings.token);

  // Automatic OAuth 2.1 refresh if token expired and we have a refresh_token
  if (res.status === 401 && settings.refreshToken) {
    try {
      const origin = new URL(settings.apiUrl).origin;
      const refreshRes = await fetch(`${origin}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: settings.refreshToken,
          ...(settings.clientId ? { client_id: settings.clientId } : {}),
        }).toString(),
      });
      if (refreshRes.ok) {
        const tokens = await refreshRes.json();
        if (tokens.access_token) {
          settings.token = tokens.access_token;
          writeConfig({
            token: tokens.access_token,
            ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          });
          res = await doFetch(settings.token);
        }
      }
    } catch { /* ignore refresh failure and surface original 401 */ }
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const exitCode = res.status === 401 || res.status === 403 ? 3 : (res.status === 404 ? 4 : 1);
    throw new BotmailCliError(
      data.error || data.error_description || `HTTP ${res.status} ${res.statusText}`,
      { code: data.code || data.error || 'api_error', status: res.status, exitCode },
    );
  }

  return data;
}
