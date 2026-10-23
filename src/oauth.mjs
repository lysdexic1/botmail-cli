import http from 'node:http';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { writeConfig } from './config.mjs';
import { BotmailCliError } from './api.mjs';

function openBrowser(url) {
  if (process.platform === 'win32') exec(`start "" "${url}"`);
  else if (process.platform === 'darwin') exec(`open "${url}"`);
  else exec(`xdg-open "${url}"`);
}

export async function runBrowserOAuthLogin(settings, { scope = 'read send manage', noBrowser = false } = {}) {
  const authBase = settings.mcpUrl || new URL(settings.apiUrl).origin;
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  return new Promise((resolve, reject) => {
    const server = http.createServer();
    let timeoutId;

    server.listen(0, '127.0.0.1', async () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      let clientId = 'botmail-cli';
      try {
        const regRes = await fetch(`${authBase}/oauth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            client_name: 'Botmail CLI',
            redirect_uris: [redirectUri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            scope,
          }),
        });
        if (regRes.ok) {
          const reg = await regRes.json();
          if (reg.client_id) clientId = reg.client_id;
        }
      } catch { /* fallback */ }

      const authUrl = new URL(`${authBase}/oauth/authorize`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('state', state);

      if (!settings.json && !settings.quiet) {
        process.stderr.write(`Opening browser to authorize Botmail CLI...\n${authUrl.toString()}\n`);
      }
      if (!noBrowser) openBrowser(authUrl.toString());

      timeoutId = setTimeout(() => {
        server.close();
        reject(new BotmailCliError('OAuth login timed out after 180 seconds.', { code: 'oauth_timeout', exitCode: 3 }));
      }, 180_000);

      server.on('request', async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '/', redirectUri);
          if (reqUrl.pathname !== '/callback') { res.writeHead(404); res.end('Not found'); return; }
          const errParam = reqUrl.searchParams.get('error');
          if (errParam) {
            res.writeHead(400); res.end('Authorization cancelled.');
            clearTimeout(timeoutId); server.close();
            reject(new BotmailCliError(`OAuth authorization denied: ${errParam}`, { code: errParam, exitCode: 3 }));
            return;
          }
          const code = reqUrl.searchParams.get('code');
          if (!code || reqUrl.searchParams.get('state') !== state) {
            res.writeHead(400); res.end('Invalid OAuth callback.');
            clearTimeout(timeoutId); server.close();
            reject(new BotmailCliError('Invalid OAuth callback (state mismatch).', { code: 'invalid_state', exitCode: 3 }));
            return;
          }
          const tokenRes = await fetch(`${authBase}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
            body: new URLSearchParams({
              grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirectUri, code_verifier: codeVerifier,
            }).toString(),
          });
          const tokenData = await tokenRes.json().catch(() => ({}));
          if (!tokenRes.ok || !tokenData.access_token) {
            res.writeHead(400); res.end('Token exchange failed.');
            clearTimeout(timeoutId); server.close();
            reject(new BotmailCliError(tokenData.error_description || tokenData.error || 'Token exchange failed', { code: 'token_exchange_failed', exitCode: 3 }));
            return;
          }
          writeConfig({
            apiUrl: settings.apiUrl, mcpUrl: settings.mcpUrl,
            token: tokenData.access_token, refreshToken: tokenData.refresh_token || '',
            clientId, scope: tokenData.scope || scope,
          });
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="background:#0B131E;color:#78E4BD;font-family:system-ui;text-align:center;padding-top:15vh"><h2>✓ Botmail CLI Authenticated</h2><p style="color:#F4F7F5">You can close this tab and return to your terminal.</p></body></html>');
          clearTimeout(timeoutId); server.close();
          resolve({ ok: true, method: 'oauth2_pkce_s256', clientId, scope: tokenData.scope || scope, configPath: settings.configPath });
        } catch (err) {
          clearTimeout(timeoutId); server.close(); reject(err);
        }
      });
    });
  });
}
