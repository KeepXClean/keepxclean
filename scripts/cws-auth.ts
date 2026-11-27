import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const DEFAULT_PUBLISHER_ID = '58be1080-a518-4def-972f-dda8f7db70a4';
const DEFAULT_EXTENSION_ID = 'plngcinmibjmkjjpfjemhfabjfjjkhhd';
const CWS_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

interface ParsedArgs {
  clientId?: string;
  clientSecret?: string;
  publisherId: string;
  extensionId: string;
  saveGhSecrets: boolean;
  openBrowser: boolean;
  port: number;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const res: ParsedArgs = {
    publisherId: DEFAULT_PUBLISHER_ID,
    extensionId: DEFAULT_EXTENSION_ID,
    saveGhSecrets: true,
    openBrowser: true,
    port: 0,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      res.help = true;
    } else if (arg === '--client-id' && argv[i + 1]) {
      res.clientId = argv[++i];
    } else if (arg === '--client-secret' && argv[i + 1]) {
      res.clientSecret = argv[++i];
    } else if (arg === '--publisher-id' && argv[i + 1]) {
      res.publisherId = argv[++i];
    } else if (arg === '--extension-id' && argv[i + 1]) {
      res.extensionId = argv[++i];
    } else if (arg === '--port' && argv[i + 1]) {
      res.port = Number(argv[++i]);
    } else if (arg === '--no-save-gh-secrets') {
      res.saveGhSecrets = false;
    } else if (arg === '--no-open') {
      res.openBrowser = false;
    }
  }
  return res;
}

function printHelp(): void {
  console.log(`Usage: pnpm cws:auth [options]

One-time helper to authorize Chrome Web Store API v2 via Google OAuth 2.0 loopback,
verify publisher access, and store CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN
in GitHub Actions Secrets via gh CLI.

Options:
  --client-id <id>          Google OAuth 2.0 Desktop Client ID
  --client-secret <secret>  Google OAuth 2.0 Desktop Client Secret
  --publisher-id <id>       CWS Publisher ID (default: ${DEFAULT_PUBLISHER_ID})
  --extension-id <id>       CWS Extension ID (default: ${DEFAULT_EXTENSION_ID})
  --port <port>             Local loopback port on 127.0.0.1 (default: random free port)
  --no-open                 Print the OAuth consent URL without auto-opening a browser
  --no-save-gh-secrets      Skip saving secrets to GitHub via 'gh secret set'
  -h, --help                Show this help message`);
}

function setGhSecret(name: string, value: string): void {
  const proc = spawnSync('gh', ['secret', 'set', name], {
    input: value,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (proc.status !== 0) {
    throw new Error(`Failed to set GitHub secret ${name} (exit code ${proc.status})`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  let clientId = args.clientId?.trim() || process.env.CWS_CLIENT_ID?.trim();
  let clientSecret = args.clientSecret?.trim() || process.env.CWS_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    const rl = createInterface({ input, output });
    try {
      if (!clientId) {
        clientId = (await rl.question('Enter Google OAuth Desktop Client ID: ')).trim();
      }
      if (!clientSecret) {
        clientSecret = (await rl.question('Enter Google OAuth Desktop Client Secret: ')).trim();
      }
    } finally {
      rl.close();
    }
  }

  if (!clientId || !clientSecret) {
    throw new Error('Both Client ID and Client Secret are required.');
  }

  let resolveCode!: (code: string) => void;
  let rejectCode!: (err: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    if (reqUrl.pathname !== '/callback') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const err = reqUrl.searchParams.get('error');
    const code = reqUrl.searchParams.get('code');
    if (err) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h2>Authorization failed: ${err}</h2><p>You can close this tab.</p>`);
      rejectCode(new Error(`OAuth authorization error: ${err}`));
      return;
    }
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>Missing authorization code</h2>');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<h2>KeepXClean Chrome Web Store API authorized!</h2><p>You can close this tab and return to the terminal.</p>'
    );
    resolveCode(code);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(args.port, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new Error('Unable to determine local loopback port.');
  }
  const redirectUri = `http://127.0.0.1:${addr.port}/callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', CWS_SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  console.log('\nAuthorize Chrome Web Store API access at:\n');
  console.log(authUrl.toString());
  console.log(`\nWaiting for callback on ${redirectUri} ...\n`);

  if (args.openBrowser && process.platform === 'darwin') {
    spawnSync('open', [authUrl.toString()], { stdio: 'ignore' });
  }

  let code: string;
  try {
    code = await codePromise;
  } finally {
    server.close();
  }

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = (await tokenResp.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenResp.ok || !tokenData.refresh_token || !tokenData.access_token) {
    throw new Error(
      `Failed to obtain refresh_token: ${tokenData.error || tokenResp.status} ${
        tokenData.error_description || ''
      }`.trim()
    );
  }

  const statusUrl = `https://chromewebstore.googleapis.com/v2/publishers/${args.publisherId}/items/${args.extensionId}:fetchStatus`;
  const statusResp = await fetch(statusUrl, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (statusResp.ok) {
    const statusJson = (await statusResp.json()) as Record<string, unknown>;
    console.log('Verified Chrome Web Store API v2 item status:', JSON.stringify(statusJson));
  } else {
    const errText = await statusResp.text();
    console.warn(
      `Warning: token issued, but fetchStatus returned HTTP ${statusResp.status}: ${errText}`
    );
  }

  if (args.saveGhSecrets) {
    console.log('\nSaving CWS_CLIENT_ID, CWS_CLIENT_SECRET, and CWS_REFRESH_TOKEN to GitHub Secrets...');
    setGhSecret('CWS_CLIENT_ID', clientId);
    setGhSecret('CWS_CLIENT_SECRET', clientSecret);
    setGhSecret('CWS_REFRESH_TOKEN', tokenData.refresh_token);
    console.log('All 3 GitHub Secrets saved! Future v* tags will auto-publish to Chrome Web Store.');
  } else {
    console.log('\nRefresh token obtained (--no-save-gh-secrets specified; not printed for safety).');
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
