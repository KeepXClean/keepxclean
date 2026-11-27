import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLOUD_KEYWORD_LANG_GROUPS,
  MAX_RULE_PACK_REGEX_LENGTH,
} from '@keepxclean/shared';
import {
  buildSyncSql,
  DATABASE_NAME,
  DEFAULT_MANIFEST_PATH,
  DEFAULT_WRANGLER_CONFIG,
  formatRulesTable,
  MAX_CLOUD_RULES,
  MAX_MANIFEST_BYTES,
  parseCliArgs,
  parseManifest,
  parseWranglerD1Json,
  readManifestFile,
  refreshRemoteSnapshot,
  resolveWranglerBin,
  runCli,
  SERVER_DIR,
  sqlStringLiteral,
  validateApiUrl,
  validateManifest,
  type CloudRulesManifest,
  type WranglerRunner,
} from '../scripts/cloud-rules';

const REPO_ROOT = path.resolve(SERVER_DIR, '..', '..');
const CLI_SCRIPT_PATH = path.join(SERVER_DIR, 'scripts', 'cloud-rules.ts');
const TSX_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

function makeValidRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hotfix-sample-1',
    pattern: 'scam-domain\\.xyz',
    isRegex: true,
    scopes: ['text', 'url'],
    onlyInReplies: false,
    maxFollowersExempt: 5000,
    langGroup: 'en',
    note: 'sample hotfix',
    enabled: true,
    ...overrides,
  };
}

describe('cloud-rules manifest validation', () => {
  it('validates the committed default apps/server/cloud-rules.json manifest', () => {
    const raw = fs.readFileSync(DEFAULT_MANIFEST_PATH, 'utf8');
    const manifest = parseManifest(raw);
    expect(manifest).toEqual({ version: 1, rules: [] });
  });

  it('accepts valid rules across all 10 langGroups, deduplicates scopes, and normalizes optional fields', () => {
    const rules = CLOUD_KEYWORD_LANG_GROUPS.map((langGroup, index) => ({
      id: `hotfix-${langGroup}-${index}`,
      pattern: index % 2 === 0 ? `spam\\s+${langGroup}` : `[literal ${langGroup}`,
      isRegex: index % 2 === 0,
      scopes: ['url', 'text', 'url'],
      langGroup,
      enabled: index % 3 !== 0,
      ...(index === 0 ? { onlyInReplies: true, maxFollowersExempt: 10000 } : {}),
      ...(index === 1 ? { maxFollowersExempt: null, note: '   ' } : {}),
      ...(index === 2 ? { note: '  trimmed note  ' } : {}),
    }));

    const manifest = validateManifest({ version: 1, rules });
    expect(manifest.rules).toHaveLength(10);
    expect(manifest.rules[0]).toMatchObject({
      id: 'hotfix-universal-0',
      scopes: ['url', 'text'],
      onlyInReplies: true,
      maxFollowersExempt: 10000,
      langGroup: 'universal',
      enabled: false,
    });
    expect(manifest.rules[1].maxFollowersExempt).toBeUndefined();
    expect(manifest.rules[1].note).toBeUndefined();
    expect(manifest.rules[2].note).toBe('trimmed note');
    // Defaults langGroup to 'universal' and onlyInReplies to false when omitted
    const omittedDefaults = validateManifest({
      version: 1,
      rules: [
        {
          id: 'minimal-1',
          pattern: 'bad-phrase',
          isRegex: false,
          scopes: ['text'],
          enabled: true,
        },
      ],
    });
    expect(omittedDefaults.rules[0]).toEqual({
      id: 'minimal-1',
      pattern: 'bad-phrase',
      isRegex: false,
      scopes: ['text'],
      onlyInReplies: false,
      langGroup: 'universal',
      enabled: true,
    });
  });

  it('rejects malformed JSON, oversized payloads, invalid versions, unknown keys, and prototype pollution', () => {
    expect(() => parseManifest('{not-json')).toThrow(/Invalid manifest JSON/i);
    expect(() => parseManifest('x'.repeat(MAX_MANIFEST_BYTES + 1))).toThrow(
      /exceeds maximum/i
    );

    expect(() => validateManifest(null)).toThrow(/plain JSON object/i);
    expect(() => validateManifest([])).toThrow(/plain JSON object/i);
    expect(() => validateManifest({ version: 2, rules: [] })).toThrow(
      /version/i
    );
    expect(() => validateManifest({ version: '1', rules: [] })).toThrow(
      /version/i
    );
    expect(() => validateManifest({ version: 1, rules: 'none' })).toThrow(
      /rules.*array/i
    );
    expect(() =>
      validateManifest({ version: 1, rules: [], extra: true })
    ).toThrow(/unknown top-level key/i);

    // Prototype pollution via JSON.parse own property
    expect(() =>
      parseManifest('{"version":1,"rules":[],"__proto__":{"polluted":true}}')
    ).toThrow(/forbidden property "__proto__"/i);
    expect(() =>
      parseManifest(
        '{"version":1,"rules":[{"id":"r1","pattern":"abc","isRegex":false,"scopes":["text"],"enabled":true,"constructor":{}}]}'
      )
    ).toThrow(/forbidden property "constructor"/i);
    expect(() =>
      parseManifest(
        '{"version":1,"rules":[{"id":"r1","pattern":"abc","isRegex":false,"scopes":["text"],"enabled":true,"prototype":{}}]}'
      )
    ).toThrow(/forbidden property "prototype"/i);

    // Sparse array
    const sparseRules = new Array(1);
    expect(() => validateManifest({ version: 1, rules: sparseRules })).toThrow(
      /sparse array/i
    );

    // Accessor property
    const getterRule = {};
    Object.defineProperty(getterRule, 'id', {
      enumerable: true,
      get: () => 'getter-id',
    });
    expect(() =>
      validateManifest({ version: 1, rules: [getterRule] })
    ).toThrow(/accessor properties/i);

    // Too many rules
    const tooMany = Array.from({ length: MAX_CLOUD_RULES + 1 }, (_, i) =>
      makeValidRule({ id: `rule-${i}` })
    );
    expect(() => validateManifest({ version: 1, rules: tooMany })).toThrow(
      /exceeds maximum/i
    );
  });

  it('rejects duplicate IDs, bad IDs, invalid regex/pattern, invalid scopes, invalid langGroup, and invalid numeric/note fields', () => {
    // Unknown rule key (typo guard)
    expect(() =>
      validateManifest({
        version: 1,
        rules: [makeValidRule({ lang_group: 'ja' })],
      })
    ).toThrow(/unknown key "lang_group"/i);

    // Duplicate IDs
    expect(() =>
      validateManifest({
        version: 1,
        rules: [makeValidRule({ id: 'dup-1' }), makeValidRule({ id: 'dup-1' })],
      })
    ).toThrow(/Duplicate rule id/i);

    // Invalid IDs
    for (const badId of ['', ' leading', '-bad', 'a b', 'id\n1', 'id\0', 'a'.repeat(129)]) {
      expect(() =>
        validateManifest({ version: 1, rules: [makeValidRule({ id: badId })] })
      ).toThrow(/\.id/i);
    }

    // Invalid pattern & regex
    for (const badPattern of [
      '',
      '   ',
      'a'.repeat(MAX_RULE_PACK_REGEX_LENGTH + 1),
      'line1\nline2',
      'nul\0char',
    ]) {
      expect(() =>
        validateManifest({
          version: 1,
          rules: [makeValidRule({ pattern: badPattern, isRegex: false })],
        })
      ).toThrow(/pattern/i);
    }
    expect(() =>
      validateManifest({
        version: 1,
        rules: [makeValidRule({ pattern: '[unclosed', isRegex: true })],
      })
    ).toThrow(/invalid regular expression/i);
    expect(() =>
      validateManifest({
        version: 1,
        rules: [makeValidRule({ isRegex: 'true' })],
      })
    ).toThrow(/isRegex/i);

    // Invalid scopes
    expect(() =>
      validateManifest({ version: 1, rules: [makeValidRule({ scopes: [] })] })
    ).toThrow(/scopes/i);
    expect(() =>
      validateManifest({
        version: 1,
        rules: [makeValidRule({ scopes: ['text', 'handle'] })],
      })
    ).toThrow(/invalid scope/i);

    // Invalid langGroup
    for (const badLang of [null, '', 'JA', 'zh-CN', 'xx', '__proto__', 42]) {
      expect(() =>
        validateManifest({
          version: 1,
          rules: [makeValidRule({ langGroup: badLang })],
        })
      ).toThrow(/langGroup/i);
    }

    // Invalid enabled / onlyInReplies
    expect(() =>
      validateManifest({ version: 1, rules: [makeValidRule({ enabled: 1 })] })
    ).toThrow(/enabled/i);
    expect(() =>
      validateManifest({
        version: 1,
        rules: [makeValidRule({ onlyInReplies: null })],
      })
    ).toThrow(/onlyInReplies/i);

    // Invalid maxFollowersExempt
    for (const badMax of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1_000_000_001, '5000', true]) {
      expect(() =>
        validateManifest({
          version: 1,
          rules: [makeValidRule({ maxFollowersExempt: badMax })],
        })
      ).toThrow(/maxFollowersExempt/i);
    }

    // Invalid note
    for (const badNote of ['a'.repeat(501), 'bad\nline', 'bad\0nul', 123]) {
      expect(() =>
        validateManifest({
          version: 1,
          rules: [makeValidRule({ note: badNote })],
        })
      ).toThrow(/note/i);
    }
  });
});

describe('SQL generation & injection safety', () => {
  it('emits DELETE-only SQL for empty rules and upsert-before-delete without transaction keywords', () => {
    expect(buildSyncSql({ version: 1, rules: [] }, 1_700_000_000_000)).toBe(
      'DELETE FROM cloud_keywords;\n'
    );

    const manifest: CloudRulesManifest = validateManifest({
      version: 1,
      rules: [
        makeValidRule({
          id: 'hotfix-sqli-1',
          pattern: "'); DROP TABLE cloud_keywords; -- BEGIN TRANSACTION",
          isRegex: false,
          scopes: ['text', 'bio'],
          onlyInReplies: true,
          maxFollowersExempt: 5000,
          langGroup: 'ja',
          note: "it's a ; -- note with begin transaction inside",
          enabled: true,
        }),
      ],
    });

    const sql = buildSyncSql(manifest, 1_700_000_000_000);
    // Upsert must appear BEFORE pruning DELETE
    const insertIdx = sql.indexOf('INSERT INTO cloud_keywords');
    const deleteIdx = sql.indexOf('DELETE FROM cloud_keywords WHERE id NOT IN');
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThan(insertIdx);

    // Never emit SQL transaction statements or unsplit BEGIN TRANSACTION substrings
    expect(sql).not.toMatch(/BEGIN\s+TRANSACTION/i);
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT|SAVEPOINT)\b/im);

    // Single quotes doubled & BEGIN TRANSACTION split via SQLite concatenation
    expect(sql).toContain("'''); DROP TABLE cloud_keywords; -- BEGIN' || ' TRANSACTION'");
    expect(sql).toContain("'it''s a ; -- note with begin' || ' transaction inside'");
    expect(() => sqlStringLiteral('abc\0def')).toThrow(/NUL/i);
  });
});

describe('CLI argument parsing & formatting', () => {
  it('handles pnpm -- forwarding, space-separated and equals flags, and relative path resolution', () => {
    const baseCwd = '/tmp/caller-dir';

    expect(
      parseCliArgs(['push', '--', '--dry-run', '--file', 'rel/rules.json'], baseCwd)
    ).toEqual({
      help: false,
      command: 'push',
      target: 'remote',
      dryRun: true,
      noRefresh: false,
      filePath: path.resolve(baseCwd, 'rel/rules.json'),
      apiUrl: 'https://api.keepxclean.com',
    });

    expect(
      parseCliArgs(
        [
          'push',
          '--local',
          '--persist-to=local-d1',
          '--file=custom.json',
          '--no-refresh',
          '--api-url',
          'http://127.0.0.1:8787/',
        ],
        baseCwd
      )
    ).toEqual({
      help: false,
      command: 'push',
      target: 'local',
      dryRun: false,
      noRefresh: true,
      filePath: path.resolve(baseCwd, 'custom.json'),
      persistTo: path.resolve(baseCwd, 'local-d1'),
      apiUrl: 'http://127.0.0.1:8787',
    });

    expect(parseCliArgs(['list', '--', '--local', '--persist-to', 'd1'], baseCwd)).toEqual({
      help: false,
      command: 'list',
      source: 'local',
      filePath: DEFAULT_MANIFEST_PATH,
      persistTo: path.resolve(baseCwd, 'd1'),
    });

    expect(parseCliArgs(['list', '--help'])).toEqual({
      help: true,
      command: 'list',
    });
  });

  it('rejects conflicting flags, missing values, invalid URLs, and unknown arguments', () => {
    expect(() => parseCliArgs([])).toThrow(/Missing command/i);
    expect(() => parseCliArgs(['delete'])).toThrow(/Unknown command/i);
    expect(() => parseCliArgs(['push', '--local', '--remote'])).toThrow(
      /both --local and --remote/i
    );
    expect(() =>
      parseCliArgs(['push', '--remote', '--persist-to', '/tmp/d1'])
    ).toThrow(/--persist-to requires --local/i);
    expect(() => parseCliArgs(['list', '--dry-run'])).toThrow(/push/i);
    expect(() => parseCliArgs(['list', '--no-refresh'])).toThrow(/push/i);
    expect(() =>
      parseCliArgs(['list', '--api-url', 'https://api.keepxclean.com'])
    ).toThrow(/push/i);
    expect(() =>
      parseCliArgs(['list', '--local', '--file', 'a.json'])
    ).toThrow(/Cannot combine --file/i);
    expect(() => parseCliArgs(['push', '--file'])).toThrow(/non-empty value/i);
    expect(() => parseCliArgs(['push', '--file='])).toThrow(/non-empty value/i);
    expect(() => parseCliArgs(['push', '--file', '--dry-run'])).toThrow(
      /non-empty value/i
    );
    expect(() =>
      parseCliArgs(['push', '--api-url', 'ftp://example.com'])
    ).toThrow(/http:\/\/ or https:\/\//i);
    expect(() =>
      parseCliArgs(['push', '--api-url', 'https://api.keepxclean.com/?x=1'])
    ).toThrow(/query parameters or hash/i);
    expect(() => parseCliArgs(['push', '--unknown'])).toThrow(/Unknown flag/i);
    expect(() => parseCliArgs(['push', 'extra'])).toThrow(/Unexpected positional/i);
  });

  it('rejects bare ?/#, embedded credentials, and control chars in --api-url and normalizes valid URLs', async () => {
    // Clean normalization of valid URLs
    expect(validateApiUrl('https://api.keepxclean.com/')).toBe(
      'https://api.keepxclean.com'
    );
    expect(validateApiUrl('https://api.keepxclean.com/prefix/')).toBe(
      'https://api.keepxclean.com/prefix'
    );
    expect(validateApiUrl('https://API.KeepXClean.com:443/prefix///')).toBe(
      'https://api.keepxclean.com/prefix'
    );
    expect(validateApiUrl('http://127.0.0.1:8787/')).toBe(
      'http://127.0.0.1:8787'
    );
    expect(
      parseCliArgs(['push', '--api-url', 'https://api.keepxclean.com/prefix/'])
    ).toMatchObject({
      apiUrl: 'https://api.keepxclean.com/prefix',
    });

    // Bare ? and # bypasses
    for (const badQueryOrHash of [
      'https://api.keepxclean.com?',
      'https://api.keepxclean.com#',
      'https://api.keepxclean.com/prefix?',
      'https://api.keepxclean.com/prefix#',
    ]) {
      expect(() => validateApiUrl(badQueryOrHash)).toThrow(
        /query parameters or hash/i
      );
      expect(() =>
        parseCliArgs(['push', '--api-url', badQueryOrHash])
      ).toThrow(/query parameters or hash/i);
    }

    // Embedded credentials (must reject without leaking secrets)
    for (const credUrl of [
      'https://user:supersecret@api.keepxclean.com',
      'https://user@api.keepxclean.com',
      'https://:supersecret@api.keepxclean.com',
    ]) {
      let caughtMessage = '';
      try {
        parseCliArgs(['push', '--api-url', credUrl]);
      } catch (err) {
        caughtMessage = err instanceof Error ? err.message : String(err);
      }
      expect(caughtMessage).toMatch(/embedded credentials/i);
      expect(caughtMessage).not.toContain('supersecret');
    }

    // ASCII control characters (internal and leading/trailing)
    for (const ctrlUrl of [
      'https://api.keepxclean.com/foo\nbar',
      'https://api.keepxclean.com/foo\r\nbar',
      'https://api.keepxclean.com/foo\tbar',
      'https://api.keepxclean.com\n',
      'https://api.keepxclean.com\0',
    ]) {
      expect(() => validateApiUrl(ctrlUrl)).toThrow(/control characters/i);
      expect(() => parseCliArgs(['push', '--api-url', ctrlUrl])).toThrow(
        /control characters/i
      );
    }

    // Direct refreshRemoteSnapshot defense-in-depth validation
    await expect(
      refreshRemoteSnapshot({
        apiUrl: 'https://api.keepxclean.com?',
        pushStartedAtMs: Date.now(),
        fetchImpl: async () => new Response('{}', { status: 200 }),
      })
    ).rejects.toThrow(/query parameters or hash/i);
    await expect(
      refreshRemoteSnapshot({
        apiUrl: 'https://user:pass@api.keepxclean.com',
        pushStartedAtMs: Date.now(),
        fetchImpl: async () => new Response('{}', { status: 200 }),
      })
    ).rejects.toThrow(/embedded credentials/i);
  });

  it('formats summary tables cleanly and parses Wrangler D1 JSON', () => {
    expect(formatRulesTable([])).toBe('No cloud keyword rules found (0 rules).');

    const table = formatRulesTable([
      {
        id: 'rule-a',
        langGroup: 'ja',
        enabled: true,
        scopes: ['text', 'url'],
        note: 'ja hotfix',
      },
      {
        id: 'rule-b',
        langGroup: 'universal',
        enabled: false,
        scopes: ['bio'],
        note: '',
      },
    ]);
    expect(table).toContain('id');
    expect(table).toContain('lang_group');
    expect(table).toContain('rule-a');
    expect(table).toContain('yes');
    expect(table).toContain('no');
    expect(table).toContain('Total: 2 rule(s) (1 enabled, 1 disabled).');

    const rows = parseWranglerD1Json(
      JSON.stringify([{ success: true, results: [{ id: 'r1' }] }])
    );
    expect(rows).toEqual([{ id: 'r1' }]);
    expect(() =>
      parseWranglerD1Json(JSON.stringify([{ success: false }]))
    ).toThrow(/success=false/i);
  });
});

describe('dry-run CLI execution & remote snapshot refresh', () => {
  it('supports --dry-run with both --file=<path> and --file <path> and rejects invalid manifests before Wrangler', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kxc-dryrun-test-'));
    try {
      const validFile = path.join(tmpDir, 'valid.json');
      const invalidFile = path.join(tmpDir, 'invalid.json');
      fs.writeFileSync(
        validFile,
        JSON.stringify({
          version: 1,
          rules: [makeValidRule({ id: 'dryrun-ja-1', langGroup: 'ja' })],
        }),
        'utf8'
      );
      fs.writeFileSync(
        invalidFile,
        JSON.stringify({
          version: 1,
          rules: [makeValidRule({ id: 'bad-regex', pattern: '[broken', isRegex: true })],
        }),
        'utf8'
      );

      let wranglerCalled = false;
      const mockWrangler: WranglerRunner = () => {
        wranglerCalled = true;
        return { status: 0, stdout: '[{"success":true,"results":[]}]', stderr: '' };
      };

      const stdoutLines: string[] = [];
      const stderrLines: string[] = [];
      const resSpace = await runCli(
        ['push', '--dry-run', '--file', validFile],
        {
          runWrangler: mockWrangler,
          stdout: (line) => stdoutLines.push(line),
          stderr: (line) => stderrLines.push(line),
        }
      );
      expect(resSpace.exitCode).toBe(0);
      expect(wranglerCalled).toBe(false);
      expect(resSpace.sql).toContain("'dryrun-ja-1'");
      expect(stdoutLines.join('\n')).toContain('[dry-run] Validated 1 rule(s)');

      // Real subprocess check via tsx for both space-separated and -- separator
      const proc = spawnSync(
        TSX_BIN,
        [CLI_SCRIPT_PATH, 'push', '--', '--dry-run', '--file', validFile],
        { cwd: REPO_ROOT, encoding: 'utf8', shell: false }
      );
      expect(proc.status).toBe(0);
      expect(proc.stdout).toContain("'dryrun-ja-1'");

      const procEquals = spawnSync(
        TSX_BIN,
        [CLI_SCRIPT_PATH, 'push', '--dry-run', `--file=${validFile}`],
        { cwd: REPO_ROOT, encoding: 'utf8', shell: false }
      );
      expect(procEquals.status).toBe(0);
      expect(procEquals.stdout).toContain("'dryrun-ja-1'");

      const invalidProc = spawnSync(
        TSX_BIN,
        [CLI_SCRIPT_PATH, 'push', '--dry-run', '--file', invalidFile],
        { cwd: REPO_ROOT, encoding: 'utf8', shell: false }
      );
      expect(invalidProc.status).toBe(1);
      expect(invalidProc.stderr).toMatch(/invalid regular expression/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects fresh vs stale (rate-limited) remote snapshots and fails loudly on HTTP/JSON errors', async () => {
    const pushStartedAtMs = Date.parse('2026-11-25T10:00:00.000Z');
    const warnings: string[] = [];

    // 1. Fresh rebuild
    const fresh = await refreshRemoteSnapshot({
      apiUrl: 'https://api.keepxclean.com',
      pushStartedAtMs,
      stderr: (line) => warnings.push(line),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            updatedAt: '2026-11-25T10:00:01.000Z',
            cloudKeywords: [{ id: 'a' }, { id: 'b' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    });
    expect(fresh).toEqual({
      refreshed: true,
      stale: false,
      updatedAt: '2026-11-25T10:00:01.000Z',
      keywordCount: 2,
    });
    expect(warnings).toHaveLength(0);

    // 2. Rate-limited stale HTTP 200 cached snapshot
    const stale = await refreshRemoteSnapshot({
      apiUrl: 'https://api.keepxclean.com',
      pushStartedAtMs,
      stderr: (line) => warnings.push(line),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            updatedAt: '2026-11-25T09:50:00.000Z',
            cloudKeywords: [{ id: 'a' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    });
    expect(stale).toEqual({
      refreshed: false,
      stale: true,
      updatedAt: '2026-11-25T09:50:00.000Z',
      keywordCount: 1,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/stale updatedAt/i);
    expect(warnings[0]).toMatch(/12\/hour/i);

    // 3. Non-200 failure
    await expect(
      refreshRemoteSnapshot({
        apiUrl: 'https://api.keepxclean.com',
        pushStartedAtMs,
        fetchImpl: async () => new Response('Bad Gateway', { status: 502 }),
      })
    ).rejects.toThrow(/HTTP 502/i);

    // 4. Malformed JSON / missing fields failure
    await expect(
      refreshRemoteSnapshot({
        apiUrl: 'https://api.keepxclean.com',
        pushStartedAtMs,
        fetchImpl: async () => new Response('not-json', { status: 200 }),
      })
    ).rejects.toThrow(/invalid JSON/i);

    await expect(
      refreshRemoteSnapshot({
        apiUrl: 'https://api.keepxclean.com',
        pushStartedAtMs,
        fetchImpl: async () =>
          new Response(JSON.stringify({ updatedAt: '2026-11-25T10:00:02.000Z' }), {
            status: 200,
          }),
      })
    ).rejects.toThrow(/malformed payload/i);

    // 5. Full push --remote flow honors --no-refresh vs default refresh
    let fetchCount = 0;
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const fakeWrangler: WranglerRunner = () => ({
      status: 0,
      stdout: JSON.stringify([{ success: true, results: [] }]),
      stderr: '',
    });

    const noRefreshRes = await runCli(['push', '--remote', '--no-refresh'], {
      runWrangler: fakeWrangler,
      now: () => pushStartedAtMs,
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response('{}', { status: 200 });
      },
      stdout: (line) => stdoutLines.push(line),
      stderr: (line) => stderrLines.push(line),
    });
    expect(noRefreshRes.exitCode).toBe(0);
    expect(fetchCount).toBe(0);

    const withRefreshRes = await runCli(['push', '--remote'], {
      runWrangler: fakeWrangler,
      now: () => pushStartedAtMs,
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response(
          JSON.stringify({
            updatedAt: '2026-11-25T09:45:00.000Z',
            cloudKeywords: [],
          }),
          { status: 200 }
        );
      },
      stdout: (line) => stdoutLines.push(line),
      stderr: (line) => stderrLines.push(line),
    });
    expect(withRefreshRes.exitCode).toBe(0);
    expect(fetchCount).toBe(1);
    expect(withRefreshRes.refresh?.stale).toBe(true);
    expect(stderrLines.join('\n')).toMatch(/stale updatedAt/i);

    // 6. Actionable migration hint when D1 is missing lang_group (SELECT & INSERT) or cloud_keywords
    const hintErrSelect: string[] = [];
    const missingColSelectRes = await runCli(['list', '--local'], {
      runWrangler: () => ({
        status: 1,
        stdout: '',
        stderr: 'SQLITE_ERROR: no such column: lang_group',
      }),
      stderr: (line) => hintErrSelect.push(line),
    });
    expect(missingColSelectRes.exitCode).toBe(1);
    expect(hintErrSelect.join('\n')).toContain('pnpm db:migrate:local');
    expect(hintErrSelect.join('\n')).toContain('pnpm db:migrate:remote');

    const hintErrInsert: string[] = [];
    const missingColInsertRes = await runCli(['push', '--local'], {
      runWrangler: () => ({
        status: 1,
        stdout: JSON.stringify({
          error: {
            text: 'table cloud_keywords has no column named lang_group: SQLITE_ERROR',
          },
        }),
        stderr: '',
      }),
      stderr: (line) => hintErrInsert.push(line),
    });
    expect(missingColInsertRes.exitCode).toBe(1);
    expect(hintErrInsert.join('\n')).toContain('pnpm db:migrate:local');
    expect(hintErrInsert.join('\n')).toContain('pnpm db:migrate:remote');

    const hintErrTable: string[] = [];
    const missingTableRes = await runCli(['push', '--local'], {
      runWrangler: () => ({
        status: 1,
        stdout: '',
        stderr: 'SQLITE_ERROR: no such table: cloud_keywords',
      }),
      stderr: (line) => hintErrTable.push(line),
    });
    expect(missingTableRes.exitCode).toBe(1);
    expect(hintErrTable.join('\n')).toContain('pnpm db:migrate:local');

    const unrelatedErr: string[] = [];
    const busyRes = await runCli(['push', '--local'], {
      runWrangler: () => ({
        status: 1,
        stdout: '',
        stderr: 'SQLITE_BUSY: database is locked',
      }),
      stderr: (line) => unrelatedErr.push(line),
    });
    expect(busyRes.exitCode).toBe(1);
    expect(unrelatedErr.join('\n')).not.toContain('pnpm db:migrate:local');
  });

  it('rejects directories and oversized manifest files before reading into memory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kxc-stat-guard-'));
    try {
      const oversizedFile = path.join(tmpDir, 'oversized.json');
      fs.writeFileSync(oversizedFile, '');
      fs.truncateSync(oversizedFile, MAX_MANIFEST_BYTES + 1);

      expect(() => readManifestFile(tmpDir)).toThrow(/not a regular file/i);
      expect(() => readManifestFile(oversizedFile)).toThrow(
        /exceeds maximum allowed limit/i
      );

      let wranglerCalled = false;
      const mockWrangler: WranglerRunner = () => {
        wranglerCalled = true;
        return { status: 0, stdout: '[{"success":true,"results":[]}]', stderr: '' };
      };

      for (const argv of [
        ['list', '--file', tmpDir],
        ['push', '--dry-run', '--file', tmpDir],
      ]) {
        const stderrLines: string[] = [];
        const res = await runCli(argv, {
          runWrangler: mockWrangler,
          stderr: (line) => stderrLines.push(line),
        });
        expect(res.exitCode).toBe(1);
        expect(stderrLines.join('\n')).toMatch(/not a regular file/i);
      }

      for (const argv of [
        ['list', '--file', oversizedFile],
        ['push', '--dry-run', '--file', oversizedFile],
      ]) {
        const stderrLines: string[] = [];
        const res = await runCli(argv, {
          runWrangler: mockWrangler,
          stderr: (line) => stderrLines.push(line),
        });
        expect(res.exitCode).toBe(1);
        expect(stderrLines.join('\n')).toMatch(/exceeds maximum allowed limit/i);
      }

      expect(wranglerCalled).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('real local Wrangler D1 migration 0004 + push + list round-trip', () => {
  it(
    'applies migrations 0001-0004, syncs special-char/NULL rules, prunes stale rows, and leaves zero .wrangler pollution',
    async () => {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kxc-d1-e2e-'));
      const persistDir = path.join(tmpRoot, 'd1-state');
      const manifest1Path = path.join(tmpRoot, 'rules-v1.json');
      const manifest2Path = path.join(tmpRoot, 'rules-v2.json');
      const manifestEmptyPath = path.join(tmpRoot, 'rules-empty.json');
      const repoWranglerDir = path.join(SERVER_DIR, '.wrangler');
      const hadWranglerDirBefore = fs.existsSync(repoWranglerDir);

      try {
        const wranglerBin = resolveWranglerBin(SERVER_DIR);

        // Step 1: Apply all D1 migrations (0001..0004) in isolated temp dir
        const migrate = spawnSync(
          process.execPath,
          [
            wranglerBin,
            'd1',
            'migrations',
            'apply',
            DATABASE_NAME,
            '--local',
            '--config',
            DEFAULT_WRANGLER_CONFIG,
            '--persist-to',
            persistDir,
          ],
          {
            cwd: SERVER_DIR,
            encoding: 'utf8',
            shell: false,
            env: { ...process.env, CI: '1' },
          }
        );
        expect(migrate.status, migrate.stderr || migrate.stdout).toBe(0);

        // Verify 0004 added lang_group TEXT NOT NULL DEFAULT 'universal'
        const pragma = spawnSync(
          process.execPath,
          [
            wranglerBin,
            'd1',
            'execute',
            DATABASE_NAME,
            '--local',
            '--config',
            DEFAULT_WRANGLER_CONFIG,
            '--persist-to',
            persistDir,
            '--yes',
            '--json',
            '--command',
            'PRAGMA table_info(cloud_keywords);',
          ],
          { cwd: SERVER_DIR, encoding: 'utf8', shell: false }
        );
        expect(pragma.status, pragma.stderr).toBe(0);
        const cols = parseWranglerD1Json(pragma.stdout);
        const langCol = cols.find((c) => c.name === 'lang_group');
        expect(langCol).toBeDefined();
        expect(Number(langCol?.notnull)).toBe(1);
        expect(langCol?.dflt_value).toBe("'universal'");

        // Step 2: Push initial 3-rule manifest (NULL note, SQL injection chars, BEGIN TRANSACTION, regex)
        const trickyPattern = "it's; -- DROP TABLE cloud_keywords; BEGIN TRANSACTION";
        const trickyNote = "note's; BEGIN TRANSACTION check";
        fs.writeFileSync(
          manifest1Path,
          JSON.stringify(
            {
              version: 1,
              rules: [
                {
                  id: 'cloud-nsfw-bio-1',
                  pattern: '(onlyfans\\.com)',
                  isRegex: true,
                  scopes: ['bio', 'url'],
                  langGroup: 'universal',
                  note: null,
                  enabled: false,
                },
                {
                  id: 'hotfix-ja-tricky',
                  pattern: trickyPattern,
                  isRegex: false,
                  scopes: ['text', 'url'],
                  onlyInReplies: true,
                  maxFollowersExempt: 5000,
                  langGroup: 'ja',
                  note: trickyNote,
                  enabled: true,
                },
                {
                  id: 'hotfix-es-regex',
                  pattern: '(sorteo\\s+cripto)',
                  isRegex: true,
                  scopes: ['text'],
                  langGroup: 'es',
                  note: 'es spam',
                  enabled: true,
                },
              ],
            },
            null,
            2
          ),
          'utf8'
        );

        const push1Out: string[] = [];
        const push1Err: string[] = [];
        const push1 = await runCli(
          [
            'push',
            '--local',
            '--persist-to',
            persistDir,
            '--file',
            manifest1Path,
          ],
          {
            stdout: (l) => push1Out.push(l),
            stderr: (l) => push1Err.push(l),
          }
        );
        expect(push1.exitCode, push1Err.join('\n')).toBe(0);
        expect(push1Out.join('\n')).toContain('Synced 3 cloud keyword rule(s)');

        // Step 3: List from local D1 and verify zero "null" bug & exact values
        const list1Out: string[] = [];
        const list1Err: string[] = [];
        const list1 = await runCli(
          ['list', '--local', '--persist-to', persistDir],
          {
            stdout: (l) => list1Out.push(l),
            stderr: (l) => list1Err.push(l),
          }
        );
        expect(list1.exitCode, list1Err.join('\n')).toBe(0);
        const table1 = list1Out.join('\n');
        expect(table1).toContain('cloud-nsfw-bio-1');
        expect(table1).toContain('hotfix-ja-tricky');
        expect(table1).toContain('hotfix-es-regex');
        expect(table1).toContain(trickyNote);
        expect(table1).toContain('Total: 3 rule(s) (2 enabled, 1 disabled).');
        // Verify paused rule's SQL NULL note rendered as '-' and NOT Wrangler's buggy "null" string
        const pausedLine = table1
          .split('\n')
          .find((line) => line.startsWith('cloud-nsfw-bio-1'));
        expect(pausedLine).toBeDefined();
        expect(pausedLine).not.toMatch(/\bnull\b/i);
        expect(pausedLine?.trimEnd().endsWith('| -')).toBe(true);

        // Verify exact byte-for-byte pattern round-trip in SQLite
        const rawSelect = spawnSync(
          process.execPath,
          [
            wranglerBin,
            'd1',
            'execute',
            DATABASE_NAME,
            '--local',
            '--config',
            DEFAULT_WRANGLER_CONFIG,
            '--persist-to',
            persistDir,
            '--yes',
            '--json',
            '--command',
            "SELECT id, pattern, note, lang_group, only_in_replies, max_followers_exempt FROM cloud_keywords WHERE id = 'hotfix-ja-tricky';",
          ],
          { cwd: SERVER_DIR, encoding: 'utf8', shell: false }
        );
        expect(rawSelect.status, rawSelect.stderr).toBe(0);
        const [trickyRow] = parseWranglerD1Json(rawSelect.stdout);
        expect(trickyRow).toMatchObject({
          id: 'hotfix-ja-tricky',
          pattern: trickyPattern,
          note: trickyNote,
          lang_group: 'ja',
          only_in_replies: 1,
          max_followers_exempt: 5000,
        });

        // Step 4: Push updated manifest (update hotfix-ja-tricky, prune hotfix-es-regex & cloud-nsfw-bio-1)
        fs.writeFileSync(
          manifest2Path,
          JSON.stringify({
            version: 1,
            rules: [
              {
                id: 'hotfix-ja-tricky',
                pattern: 'updated-ja-pattern',
                isRegex: false,
                scopes: ['bio'],
                langGroup: 'ja',
                note: 'updated note',
                enabled: true,
              },
            ],
          }),
          'utf8'
        );

        const push2Out: string[] = [];
        const push2Err: string[] = [];
        const push2 = await runCli(
          [
            'push',
            '--local',
            `--persist-to=${persistDir}`,
            `--file=${manifest2Path}`,
          ],
          {
            stdout: (l) => push2Out.push(l),
            stderr: (l) => push2Err.push(l),
          }
        );
        expect(push2.exitCode, push2Err.join('\n')).toBe(0);
        expect(push2Out.join('\n')).toContain('Synced 1 cloud keyword rule(s)');

        const list2Out: string[] = [];
        const list2 = await runCli(
          ['list', '--local', `--persist-to=${persistDir}`],
          { stdout: (l) => list2Out.push(l) }
        );
        expect(list2.exitCode).toBe(0);
        const table2 = list2Out.join('\n');
        expect(table2).toContain('hotfix-ja-tricky');
        expect(table2).toContain('updated note');
        expect(table2).not.toContain('hotfix-es-regex');
        expect(table2).not.toContain('cloud-nsfw-bio-1');
        expect(table2).toContain('Total: 1 rule(s) (1 enabled, 0 disabled).');

        // Step 5: Push empty manifest -> prunes all rows
        fs.writeFileSync(
          manifestEmptyPath,
          JSON.stringify({ version: 1, rules: [] }),
          'utf8'
        );
        const pushEmptyOut: string[] = [];
        const pushEmptyErr: string[] = [];
        const pushEmpty = await runCli(
          [
            'push',
            '--local',
            '--persist-to',
            persistDir,
            '--file',
            manifestEmptyPath,
          ],
          {
            stdout: (l) => pushEmptyOut.push(l),
            stderr: (l) => pushEmptyErr.push(l),
          }
        );
        expect(pushEmpty.exitCode, pushEmptyErr.join('\n')).toBe(0);
        expect(pushEmptyOut.join('\n')).toContain(
          'Synced 0 cloud keyword rule(s)'
        );

        const listEmptyOut: string[] = [];
        const listEmpty = await runCli(
          ['list', '--local', '--persist-to', persistDir],
          { stdout: (l) => listEmptyOut.push(l) }
        );
        expect(listEmpty.exitCode).toBe(0);
        expect(listEmptyOut.join('\n')).toBe(
          'No cloud keyword rules found (0 rules).'
        );

        // Step 6: Verify no apps/server/.wrangler directory was created
        if (!hadWranglerDirBefore) {
          expect(fs.existsSync(repoWranglerDir)).toBe(false);
        }
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    },
    60_000
  );
});
