import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import {
  CLOUD_KEYWORD_LANG_GROUPS,
  DEFAULT_CLOUD_KEYWORDS,
  isCloudKeywordLangGroup,
  type KeywordRuleItem,
} from '@keepxclean/shared';
import {
  isDuplicateColumnError,
  splitIntoSurrogateSafeChunks,
} from '../src/index';

interface TestEnvOverrides {
  dbBinding?: 'DB' | 'EMPTY_DB' | 'PRE0004_DB' | 'NULLABLE_LANG_DB';
  noR2?: boolean;
  MIN_SNAPSHOT_BLOCK_COUNT?: string;
  SITE_DOMAIN?: string;
  IP_REPORT_LIMIT_PER_HOUR?: string;
  IP_BATCH_LIMIT_PER_HOUR?: string;
  D1_SNAPSHOT_CHUNK_SIZE?: string;
}

interface EsbuildLike {
  build: (options: Record<string, unknown>) => Promise<{
    outputFiles: Array<{ text: string }>;
  }>;
}

const SERVER_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const TEST_WORKER_WRAPPER_SOURCE = `
import { app, pruneExpiredRateLimits } from './src/index.ts';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const rawOverrides = request.headers.get('x-test-env');
    const overrides = rawOverrides ? JSON.parse(rawOverrides) : {};
    const dbBinding = overrides.dbBinding || 'DB';
    const selectedDb = env[dbBinding] ?? env.DB;

    const effectiveEnv = {
      DB: selectedDb,
      ...(overrides.noR2 ? {} : { SNAPSHOT_BUCKET: env.SNAPSHOT_BUCKET }),
      MIN_SNAPSHOT_BLOCK_COUNT: overrides.MIN_SNAPSHOT_BLOCK_COUNT ?? '2',
      ...(overrides.SITE_DOMAIN ? { SITE_DOMAIN: overrides.SITE_DOMAIN } : {}),
      ...(overrides.IP_REPORT_LIMIT_PER_HOUR
        ? { IP_REPORT_LIMIT_PER_HOUR: overrides.IP_REPORT_LIMIT_PER_HOUR }
        : {}),
      ...(overrides.IP_BATCH_LIMIT_PER_HOUR
        ? { IP_BATCH_LIMIT_PER_HOUR: overrides.IP_BATCH_LIMIT_PER_HOUR }
        : {}),
      ...(overrides.D1_SNAPSHOT_CHUNK_SIZE
        ? { D1_SNAPSHOT_CHUNK_SIZE: overrides.D1_SNAPSHOT_CHUNK_SIZE }
        : {}),
    };

    if (url.pathname === '/__test/prune' && request.method === 'POST') {
      const payload = await request.json();
      const pruned = await pruneExpiredRateLimits(effectiveEnv.DB, payload.now);
      return Response.json({ pruned });
    }

    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.delete('x-test-env');
    const forwardedRequest = new Request(request.url, {
      method: request.method,
      headers: forwardHeaders,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : request.body,
    });

    return app.fetch(forwardedRequest, effectiveEnv);
  },
};
`;

async function bundleWorkerForTest(): Promise<string> {
  const serverRequire = createRequire(path.join(SERVER_DIR, 'package.json'));
  const wranglerPkgPath = serverRequire.resolve('wrangler/package.json');
  const esbuild = createRequire(wranglerPkgPath)('esbuild') as EsbuildLike;

  const built = await esbuild.build({
    stdin: {
      contents: TEST_WORKER_WRAPPER_SOURCE,
      resolveDir: SERVER_DIR,
      sourcefile: '__test_worker_entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    mainFields: ['module', 'main'],
    conditions: ['workerd', 'worker', 'browser', 'import'],
    write: false,
  });

  const output = built.outputFiles[0]?.text;
  if (!output) {
    throw new Error('Failed to bundle server worker for Miniflare tests.');
  }
  return output;
}

let mf: Miniflare;
let db: D1Database;
let pre0004Db: D1Database;
let nullableLangDb: D1Database;

beforeAll(async () => {
  const bundledScript = await bundleWorkerForTest();
  mf = new Miniflare({
    modules: true,
    script: bundledScript,
    compatibilityDate: '2025-02-01',
    d1Databases: ['DB', 'EMPTY_DB', 'PRE0004_DB', 'NULLABLE_LANG_DB'],
    r2Buckets: ['SNAPSHOT_BUCKET'],
  });
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  pre0004Db = (await mf.getD1Database('PRE0004_DB')) as unknown as D1Database;
  nullableLangDb = (await mf.getD1Database(
    'NULLABLE_LANG_DB'
  )) as unknown as D1Database;
}, 30_000);

afterAll(async () => {
  await mf?.dispose();
});

async function requestWorker(
  pathname: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
  overrides?: TestEnvOverrides
) {
  const headers = new Headers(init.headers);
  if (overrides) {
    headers.set('x-test-env', JSON.stringify(overrides));
  }
  return mf.dispatchFetch(`http://localhost${pathname}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined ? { body: init.body } : {}),
  });
}

async function post(
  pathname: string,
  body: unknown,
  overrides?: TestEnvOverrides
) {
  const response = await requestWorker(
    pathname,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    overrides
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<Record<string, unknown>>;
}

describe('D1 transactional community reporting', () => {
  it('does not count young accounts and deduplicates reports', async () => {
    const young = await post('/v1/blocks/report', {
      targetUid: '888001',
      reporterUidHash: 'young_reporter',
      reporterAccountAgeDays: 5,
    });
    expect(young.countedPublicly).toBe(false);

    const body = {
      targetUid: '888001',
      reporterUidHash: 'reporter_1',
      reporterAccountAgeDays: 365,
      tag: 'nsfw',
    };
    expect((await post('/v1/blocks/report', body)).blockCount).toBe(1);
    expect((await post('/v1/blocks/report', body)).isNewVote).toBe(false);

    const second = await post('/v1/blocks/report', {
      ...body,
      reporterUidHash: 'reporter_2',
    });
    expect(second.blockCount).toBe(2);

    const response = await requestWorker('/v1/snapshot.json?fresh=1');
    expect(response.status).toBe(200);
    const snapshot = (await response.json()) as {
      counts: Record<string, { c: number; t: string }>;
    };
    expect(snapshot.counts['888001']).toEqual({ c: 2, t: 'nsfw' });
  });

  it('keeps aggregates correct under concurrent duplicates, reason changes and repeated retracts', async () => {
    const body = {
      targetUid: '888002',
      reporterUidHash: 'concurrent_reporter',
      reporterAccountAgeDays: 365,
      tag: 'spam',
    };
    await Promise.all(
      Array.from({ length: 8 }, () => post('/v1/blocks/report', body))
    );

    const changed = await post('/v1/blocks/report', { ...body, tag: 'scam' });
    expect(changed.blockCount).toBe(1);
    expect(changed.dominantTag).toBe('scam');

    const row = await db
      .prepare(
        'SELECT spam_count, scam_count FROM account_reputation WHERE target_uid = ?'
      )
      .bind('888002')
      .first();
    expect(row).toMatchObject({ spam_count: 0, scam_count: 1 });

    await Promise.all([
      post('/v1/blocks/unreport', body),
      post('/v1/blocks/unreport', body),
    ]);

    expect(
      await db
        .prepare(
          'SELECT block_count, scam_count FROM account_reputation WHERE target_uid = ?'
        )
        .bind('888002')
        .first()
    ).toMatchObject({ block_count: 0, scam_count: 0 });
  });

  it('makes batch retries idempotent in real D1 storage', async () => {
    const body = {
      targetUids: Array.from({ length: 70 }, (_, i) => String(900000 + i)),
      reporterUidHash: 'batch_reporter',
      reporterAccountAgeDays: 100,
    };
    expect((await post('/v1/blocks/batch-import', body)).importedCount).toBe(
      70
    );
    expect((await post('/v1/blocks/batch-import', body)).importedCount).toBe(0);

    const row = await db
      .prepare(
        'SELECT SUM(block_count) AS total FROM account_reputation WHERE target_uid >= ?'
      )
      .bind('900000')
      .first();
    expect(row).toMatchObject({ total: 70 });
  });

  it('enforces rate limits on batch-import and serves cached R2 snapshot when fresh rebuild quota is exceeded', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.77',
    };
    for (let i = 0; i < 30; i++) {
      const res = await requestWorker('/v1/blocks/batch-import', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targetUids: ['990001'],
          reporterUidHash: 'ratelimited_batch_actor',
          reporterAccountAgeDays: 120,
        }),
      });
      expect(res.status).toBe(200);
    }

    const blocked = await requestWorker('/v1/blocks/batch-import', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        targetUids: ['990002'],
        reporterUidHash: 'ratelimited_batch_actor',
        reporterAccountAgeDays: 120,
      }),
    });
    expect(blocked.status).toBe(429);

    // Ensure R2 has an initial snapshot, then exhaust fresh rebuild quota (12/hr) for an IP
    const seed = await requestWorker('/v1/snapshot.json?fresh=1', {
      headers: { 'CF-Connecting-IP': '203.0.113.88' },
    });
    expect(seed.status).toBe(200);
    const seedBody = (await seed.json()) as { updatedAt: string };
    expect(typeof seedBody.updatedAt).toBe('string');

    let lastFreshUpdatedAt = seedBody.updatedAt;
    let cachedResponsesAfterQuota = 0;
    for (let i = 0; i < 15; i++) {
      const snap = await requestWorker('/v1/snapshot.json?fresh=1', {
        headers: { 'CF-Connecting-IP': '203.0.113.88' },
      });
      expect(snap.status).toBe(200);
      const body = (await snap.json()) as { updatedAt: string };
      const cacheControl = snap.headers.get('cache-control');
      if (cacheControl === 'public, max-age=60, s-maxage=300') {
        expect(cachedResponsesAfterQuota).toBe(0);
        lastFreshUpdatedAt = body.updatedAt;
      } else {
        expect(cacheControl).toBe('public, max-age=300, s-maxage=600');
        expect(body.updatedAt).toBe(lastFreshUpdatedAt);
        cachedResponsesAfterQuota += 1;
      }
    }
    expect(cachedResponsesAfterQuota).toBeGreaterThanOrEqual(3);
  });

  it('compiles and serves cached snapshots from D1 snapshot_cache when R2 is not bound', async () => {
    const d1OnlyOverrides: TestEnvOverrides = {
      noR2: true,
      MIN_SNAPSHOT_BLOCK_COUNT: '2',
    };
    const built = await requestWorker(
      '/v1/snapshot.json?fresh=1',
      { headers: { 'CF-Connecting-IP': '203.0.113.99' } },
      d1OnlyOverrides
    );
    expect(built.status).toBe(200);

    const cached = await requestWorker('/v1/snapshot.json', {}, d1OnlyOverrides);
    expect(cached.status).toBe(200);
    const body = (await cached.json()) as { version: number; domain: string };
    expect(body.version).toBe(1);
    expect(body.domain).toBe('keepxclean.com');
  });

  it('merges D1 cloud_keywords emergency pauses and only_in_replies hotfixes with built-in packs', async () => {
    await db.batch([
      // 1. Emergency pause on a built-in rule -> preserved with enabled: false
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at)
           VALUES (?, ?, 1, ?, 0, 10000, 'paused builtin', 0, ?)`
        )
        .bind(
          'cloud-nsfw-bio-1',
          '(onlyfans\\.com)',
          JSON.stringify(['bio', 'url']),
          Date.now()
        ),
      // 2. Active server hotfix with only_in_replies = 1 -> appended with onlyInReplies: true
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at)
           VALUES (?, ?, 0, ?, 1, 5000, 'hotfix reply spam', 1, ?)`
        )
        .bind(
          'hotfix-reply-spam-1',
          'claim-scam-link.xyz',
          JSON.stringify(['text', 'url']),
          Date.now()
        ),
      // 3. Disabled non-built-in hotfix -> omitted from snapshot
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at)
           VALUES (?, ?, 0, ?, 0, NULL, 'retired hotfix', 0, ?)`
        )
        .bind(
          'hotfix-retired-2',
          'old-retired-spam',
          JSON.stringify(['text']),
          Date.now()
        ),
    ]);

    try {
      const res = await requestWorker('/v1/snapshot.json?fresh=1', {
        headers: { 'CF-Connecting-IP': '198.51.100.77' },
      });
      expect(res.status).toBe(200);
      const snap = (await res.json()) as {
        cloudKeywords: Array<{
          id: string;
          enabled: boolean;
          onlyInReplies?: boolean;
          maxFollowersExempt?: number;
        }>;
      };

      const pausedBuiltin = snap.cloudKeywords.find(
        (k) => k.id === 'cloud-nsfw-bio-1'
      );
      expect(pausedBuiltin).toBeDefined();
      expect(pausedBuiltin?.enabled).toBe(false);

      // Unmentioned built-in rules remain present and enabled
      const untouchedBuiltin = snap.cloudKeywords.find(
        (k) => k.id === 'cloud-cliche-trivia-1'
      );
      expect(untouchedBuiltin).toBeDefined();
      expect(untouchedBuiltin?.enabled).toBe(true);

      // Active hotfix preserves onlyInReplies: true
      const hotfix = snap.cloudKeywords.find(
        (k) => k.id === 'hotfix-reply-spam-1'
      );
      expect(hotfix).toBeDefined();
      expect(hotfix?.enabled).toBe(true);
      expect(hotfix?.onlyInReplies).toBe(true);
      expect(hotfix?.maxFollowersExempt).toBe(5000);

      // Disabled non-built-in hotfix is omitted
      expect(
        snap.cloudKeywords.some((k) => k.id === 'hotfix-retired-2')
      ).toBe(false);
    } finally {
      await db
        .prepare(
          "DELETE FROM cloud_keywords WHERE id IN ('cloud-nsfw-bio-1', 'hotfix-reply-spam-1', 'hotfix-retired-2')"
        )
        .run();
    }
  });

  it('blocks rotating reporterUidHash Sybil floods from a single IP via pure-IP rate limits', async () => {
    const strictOverrides: TestEnvOverrides = {
      IP_REPORT_LIMIT_PER_HOUR: '3',
      IP_BATCH_LIMIT_PER_HOUR: '2',
    };

    const reportIp = '198.51.100.201';
    for (let i = 0; i < 3; i++) {
      const res = await requestWorker(
        '/v1/blocks/report',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': reportIp,
          },
          body: JSON.stringify({
            targetUid: '770001',
            reporterUidHash: `rotating_hash_${i}_aaaa`,
            reporterAccountAgeDays: 100,
          }),
        },
        strictOverrides
      );
      expect(res.status).toBe(200);
    }

    const blockedReport = await requestWorker(
      '/v1/blocks/report',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': reportIp,
        },
        body: JSON.stringify({
          targetUid: '770001',
          reporterUidHash: 'rotating_hash_3_bbbb',
          reporterAccountAgeDays: 100,
        }),
      },
      strictOverrides
    );
    expect(blockedReport.status).toBe(429);

    const batchIp = '198.51.100.202';
    for (let i = 0; i < 2; i++) {
      const res = await requestWorker(
        '/v1/blocks/batch-import',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': batchIp,
          },
          body: JSON.stringify({
            targetUids: ['770002'],
            reporterUidHash: `rotating_batch_${i}_aaaa`,
            reporterAccountAgeDays: 100,
          }),
        },
        strictOverrides
      );
      expect(res.status).toBe(200);
    }

    const blockedBatch = await requestWorker(
      '/v1/blocks/batch-import',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': batchIp,
        },
        body: JSON.stringify({
          targetUids: ['770002'],
          reporterUidHash: 'rotating_batch_2_cccc',
          reporterAccountAgeDays: 100,
        }),
      },
      strictOverrides
    );
    expect(blockedBatch.status).toBe(429);
  });

  it('prevents ?fresh=1&min=1 query params from lowering threshold or poisoning shared snapshot cache', async () => {
    await post('/v1/blocks/report', {
      targetUid: '770099',
      reporterUidHash: 'single_vote_reporter',
      reporterAccountAgeDays: 200,
      tag: 'spam',
    });

    const poisonedAttempt = await requestWorker('/v1/snapshot.json?fresh=1&min=1', {
      headers: { 'CF-Connecting-IP': '198.51.100.205' },
    });
    expect(poisonedAttempt.status).toBe(200);
    const snap = (await poisonedAttempt.json()) as {
      counts: Record<string, { c: number }>;
    };
    expect(snap.counts['770099']).toBeUndefined();

    const cachedAfter = await requestWorker('/v1/snapshot.json');
    const cachedSnap = (await cachedAfter.json()) as {
      counts: Record<string, { c: number }>;
    };
    expect(cachedSnap.counts['770099']).toBeUndefined();
  });

  it('chunks large snapshots across D1 snapshot_cache rows and reassembles cleanly', async () => {
    const chunkedOverrides: TestEnvOverrides = {
      noR2: true,
      MIN_SNAPSHOT_BLOCK_COUNT: '2',
      D1_SNAPSHOT_CHUNK_SIZE: '500',
    };
    const builtRes = await requestWorker(
      '/v1/snapshot.json?fresh=1',
      { headers: { 'CF-Connecting-IP': '198.51.100.210' } },
      chunkedOverrides
    );
    expect(builtRes.status).toBe(200);
    const builtSnap = (await builtRes.json()) as {
      version: number;
      counts: Record<string, { c: number }>;
      cloudKeywords: unknown[];
    };

    const parts = await db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM snapshot_cache WHERE cache_key LIKE 'v1/snapshot.json:part:%'"
      )
      .first<{ cnt: number }>();
    expect(Number(parts?.cnt ?? 0)).toBeGreaterThan(2);

    const cachedRes = await requestWorker('/v1/snapshot.json', {}, chunkedOverrides);
    expect(cachedRes.status).toBe(200);
    const cachedSnap = (await cachedRes.json()) as typeof builtSnap;
    expect(cachedSnap.version).toBe(builtSnap.version);
    expect(cachedSnap.counts).toEqual(builtSnap.counts);
    expect(cachedSnap.cloudKeywords).toEqual(builtSnap.cloudKeywords);
  });

  it('excludes retracted zero-vote accounts from /v1/stats and prunes expired rate_limits rows', async () => {
    // 888002 was reported and fully retracted in an earlier test (block_count = 0)
    const zeroRows = await db
      .prepare(
        'SELECT COUNT(*) AS cnt FROM account_reputation WHERE block_count = 0'
      )
      .first<{ cnt: number }>();
    expect(Number(zeroRows?.cnt ?? 0)).toBeGreaterThanOrEqual(1);

    const activeRows = await db
      .prepare(
        'SELECT COUNT(*) AS cnt FROM account_reputation WHERE block_count >= 1'
      )
      .first<{ cnt: number }>();

    const statsRes = await requestWorker('/v1/stats');
    expect(statsRes.status).toBe(200);
    const stats = (await statsRes.json()) as { totalFlaggedAccounts: number };
    expect(stats.totalFlaggedAccounts).toBe(Number(activeRows?.cnt ?? 0));

    const now = Date.now();
    await db.batch([
      db
        .prepare(
          'INSERT OR REPLACE INTO rate_limits (actor_key, window_start, request_count) VALUES (?, ?, 5)'
        )
        .bind('expired_actor_key', now - 3 * 3600_000),
      db
        .prepare(
          'INSERT OR REPLACE INTO rate_limits (actor_key, window_start, request_count) VALUES (?, ?, 2)'
        )
        .bind('fresh_actor_key', now - 10_000),
    ]);

    const pruneRes = await requestWorker('/__test/prune', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ now }),
    });
    expect(pruneRes.status).toBe(200);
    const { pruned } = (await pruneRes.json()) as { pruned: number };
    expect(pruned).toBeGreaterThanOrEqual(1);

    const expiredRow = await db
      .prepare('SELECT actor_key FROM rate_limits WHERE actor_key = ?')
      .bind('expired_actor_key')
      .first();
    const freshRow = await db
      .prepare('SELECT actor_key FROM rate_limits WHERE actor_key = ?')
      .bind('fresh_actor_key')
      .first();
    expect(expiredRow).toBeNull();
    expect(freshRow).toEqual({ actor_key: 'fresh_actor_key' });
  });
});

describe('D1 0004 lang_group snapshot passthrough, upgrade safety & security invariants', () => {
  it('serves all 45 built-in cloud keywords across all 10 langGroups when cloud_keywords is empty', async () => {
    const res = await requestWorker(
      '/v1/snapshot.json?fresh=1',
      { headers: { 'CF-Connecting-IP': '198.51.100.220' } },
      { dbBinding: 'EMPTY_DB', noR2: true }
    );
    expect(res.status).toBe(200);
    const snap = (await res.json()) as { cloudKeywords: KeywordRuleItem[] };
    expect(snap.cloudKeywords).toHaveLength(DEFAULT_CLOUD_KEYWORDS.length);
    expect(snap.cloudKeywords).toHaveLength(45);

    const presentGroups = new Set<string>();
    for (const item of snap.cloudKeywords) {
      expect(isCloudKeywordLangGroup(item.langGroup)).toBe(true);
      if (item.langGroup) {
        presentGroups.add(item.langGroup);
      }
    }
    for (const group of CLOUD_KEYWORD_LANG_GROUPS) {
      expect(presentGroups.has(group)).toBe(true);
    }
  });

  it('preserves built-in langGroup/packCategory, passes through remote langGroups, and falls back invalid values to universal', async () => {
    const now = Date.now();
    const testIds = [
      'cloud-cliche-trivia-1',
      'cloud-cliche-aislop-en-1',
      'cloud-nsfw-bio-2',
      'hotfix-ja-1',
      'hotfix-ru-1',
      'hotfix-es-1',
      'hotfix-universal-1',
      'hotfix-bad-lang-xx',
      'hotfix-bad-lang-empty',
      'hotfix-bad-lang-case',
      'hotfix-bad-lang-proto',
      'hotfix-disabled-de-1',
    ];

    await db.batch([
      // Built-in 'zh' active row with D1 default 'universal' -> must retain 'zh' & packCategory
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, 1, ?, 0, NULL, 'db override active zh', 1, ?, 'universal')`
        )
        .bind('cloud-cliche-trivia-1', 'dummy', JSON.stringify(['text']), now),
      // Built-in 'en' active row with D1 default 'universal' -> must retain 'en' & packCategory
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, 1, ?, 0, NULL, 'db override active en', 1, ?, 'universal')`
        )
        .bind(
          'cloud-cliche-aislop-en-1',
          'dummy',
          JSON.stringify(['text']),
          now
        ),
      // Built-in 'zh' paused row with D1 default 'universal' -> enabled=false AND retain 'zh' & packCategory
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, 1, ?, 0, NULL, 'paused builtin zh', 0, ?, 'universal')`
        )
        .bind('cloud-nsfw-bio-2', 'dummy', JSON.stringify(['bio']), now),
      // Remote-only valid langGroups
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, 0, ?, 1, 5000, 'ja spam', 1, ?, 'ja')`
        )
        .bind('hotfix-ja-1', '副業アカウント誘導', JSON.stringify(['text']), now),
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, 0, ?, 0, NULL, 'ru spam', 1, ?, 'ru')`
        )
        .bind('hotfix-ru-1', 'крипто раздача', JSON.stringify(['text', 'bio']), now),
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, 1, ?, 0, 1000, 'es spam', 1, ?, 'es')`
        )
        .bind('hotfix-es-1', '(sorteo\\s+cripto)', JSON.stringify(['text', 'url']), now),
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, 0, ?, 0, NULL, 'universal spam', 1, ?, 'universal')`
        )
        .bind(
          'hotfix-universal-1',
          'airdrop-phish.example',
          JSON.stringify(['invalid_scope', 'url', 'url']),
          now
        ),
      // Remote-only invalid langGroups -> must fallback to 'universal'
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, 0, ?, 0, NULL, 'unknown lang', 1, ?, 'xx')`
        )
        .bind('hotfix-bad-lang-xx', 'bad-lang-xx', JSON.stringify(['text']), now),
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, 0, ?, 0, NULL, 'empty lang', 1, ?, '')`
        )
        .bind(
          'hotfix-bad-lang-empty',
          'bad-lang-empty',
          JSON.stringify(['text']),
          now
        ),
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, 0, ?, 0, NULL, 'uppercase lang', 1, ?, 'JA')`
        )
        .bind(
          'hotfix-bad-lang-case',
          'bad-lang-case',
          JSON.stringify(['text']),
          now
        ),
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, 0, ?, 0, NULL, 'proto lang', 1, ?, '__proto__')`
        )
        .bind(
          'hotfix-bad-lang-proto',
          'bad-lang-proto',
          JSON.stringify(['not_valid']),
          now
        ),
      // Disabled remote-only hotfix -> omitted
      db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, 0, ?, 0, NULL, 'disabled de', 0, ?, 'de')`
        )
        .bind(
          'hotfix-disabled-de-1',
          'disabled-de-pattern',
          JSON.stringify(['text']),
          now
        ),
    ]);

    try {
      const res = await requestWorker('/v1/snapshot.json?fresh=1', {
        headers: { 'CF-Connecting-IP': '198.51.100.221' },
      });
      expect(res.status).toBe(200);
      const snap = (await res.json()) as { cloudKeywords: KeywordRuleItem[] };
      const byId = new Map(snap.cloudKeywords.map((item) => [item.id, item]));

      // Built-in preservation (active & paused)
      expect(byId.get('cloud-cliche-trivia-1')).toMatchObject({
        enabled: true,
        langGroup: 'zh',
        packCategory: 'cliche',
      });
      expect(byId.get('cloud-cliche-aislop-en-1')).toMatchObject({
        enabled: true,
        langGroup: 'en',
        packCategory: 'cliche',
      });
      expect(byId.get('cloud-nsfw-bio-2')).toMatchObject({
        enabled: false,
        langGroup: 'zh',
        packCategory: 'nsfw',
      });

      // Remote-only valid langGroups + scope filtering/dedup
      expect(byId.get('hotfix-ja-1')).toMatchObject({
        enabled: true,
        langGroup: 'ja',
        onlyInReplies: true,
        maxFollowersExempt: 5000,
      });
      expect(byId.get('hotfix-ru-1')).toMatchObject({
        enabled: true,
        langGroup: 'ru',
        scopes: ['text', 'bio'],
      });
      expect(byId.get('hotfix-es-1')).toMatchObject({
        enabled: true,
        langGroup: 'es',
        isRegex: true,
        maxFollowersExempt: 1000,
      });
      expect(byId.get('hotfix-universal-1')).toMatchObject({
        enabled: true,
        langGroup: 'universal',
        scopes: ['url'],
      });

      // Invalid lang_group fallback to 'universal' + invalid scopes fallback to ['text', 'bio']
      expect(byId.get('hotfix-bad-lang-xx')?.langGroup).toBe('universal');
      expect(byId.get('hotfix-bad-lang-empty')?.langGroup).toBe('universal');
      expect(byId.get('hotfix-bad-lang-case')?.langGroup).toBe('universal');
      expect(byId.get('hotfix-bad-lang-proto')).toMatchObject({
        langGroup: 'universal',
        scopes: ['text', 'bio'],
      });

      // Disabled remote-only hotfix omitted
      expect(byId.has('hotfix-disabled-de-1')).toBe(false);
    } finally {
      const placeholders = testIds.map(() => '?').join(', ');
      await db
        .prepare(`DELETE FROM cloud_keywords WHERE id IN (${placeholders})`)
        .bind(...testIds)
        .run();
    }
  });

  it('falls back to universal when a legacy nullable lang_group column contains SQL NULL', async () => {
    await nullableLangDb
      .prepare(
        `CREATE TABLE cloud_keywords (
          id TEXT PRIMARY KEY,
          pattern TEXT NOT NULL,
          is_regex INTEGER NOT NULL DEFAULT 1,
          scopes TEXT NOT NULL,
          only_in_replies INTEGER NOT NULL DEFAULT 0,
          max_followers_exempt INTEGER DEFAULT NULL,
          note TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL,
          lang_group TEXT
        )`
      )
      .run();

    await nullableLangDb
      .prepare(
        `INSERT INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
         VALUES ('hotfix-null-lang-1', 'null-lang-pattern', 0, '["text"]', 0, NULL, 'null lang', 1, ?, NULL)`
      )
      .bind(Date.now())
      .run();

    const res = await requestWorker(
      '/v1/snapshot.json?fresh=1',
      { headers: { 'CF-Connecting-IP': '198.51.100.222' } },
      { dbBinding: 'NULLABLE_LANG_DB', noR2: true }
    );
    expect(res.status).toBe(200);
    const snap = (await res.json()) as { cloudKeywords: KeywordRuleItem[] };
    const nullLangRow = snap.cloudKeywords.find(
      (item) => item.id === 'hotfix-null-lang-1'
    );
    expect(nullLangRow).toBeDefined();
    expect(nullLangRow?.langGroup).toBe('universal');
  });

  it('upgrades a pre-0004 database cleanly under concurrent cold-start requests', async () => {
    // Seed PRE0004_DB with exact pre-0004 schema (9 columns, NO lang_group column)
    await pre0004Db
      .prepare(
        `CREATE TABLE cloud_keywords (
          id TEXT PRIMARY KEY,
          pattern TEXT NOT NULL,
          is_regex INTEGER NOT NULL DEFAULT 1,
          scopes TEXT NOT NULL,
          only_in_replies INTEGER NOT NULL DEFAULT 0,
          max_followers_exempt INTEGER DEFAULT NULL,
          note TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL
        )`
      )
      .run();

    const now = Date.now();
    await pre0004Db.batch([
      pre0004Db
        .prepare(
          `INSERT INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at)
           VALUES ('cloud-cliche-hottake-1', 'dummy', 1, '["text"]', 0, NULL, 'paused pre-0004', 0, ?)`
        )
        .bind(now),
      pre0004Db
        .prepare(
          `INSERT INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at)
           VALUES ('cloud-cliche-aislop-en-1', 'dummy', 1, '["text"]', 0, NULL, 'active pre-0004 en', 1, ?)`
        )
        .bind(now),
      pre0004Db
        .prepare(
          `INSERT INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at)
           VALUES ('hotfix-pre0004-1', 'legacy-scam.example', 0, '["text","url"]', 1, NULL, 'pre-0004 hotfix', 1, ?)`
        )
        .bind(now),
    ]);

    const pre0004Overrides: TestEnvOverrides = {
      dbBinding: 'PRE0004_DB',
      noR2: true,
    };

    // Fire concurrent cold-start requests so ensureSchema() Promise coalescing is exercised live
    const responses = await Promise.all([
      requestWorker(
        '/v1/snapshot.json?fresh=1',
        { headers: { 'CF-Connecting-IP': '198.51.100.223' } },
        pre0004Overrides
      ),
      requestWorker(
        '/v1/snapshot.json?fresh=1',
        { headers: { 'CF-Connecting-IP': '198.51.100.224' } },
        pre0004Overrides
      ),
      requestWorker(
        '/v1/snapshot.json?fresh=1',
        { headers: { 'CF-Connecting-IP': '198.51.100.225' } },
        pre0004Overrides
      ),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const tableInfo = await pre0004Db
      .prepare('PRAGMA table_info(cloud_keywords)')
      .all<{ name: string; notnull: number; dflt_value: string | null }>();
    const langCol = (tableInfo.results ?? []).find(
      (col) => col.name === 'lang_group'
    );
    expect(langCol).toBeDefined();
    expect(langCol?.notnull).toBe(1);
    expect(langCol?.dflt_value).toBe("'universal'");

    const snap = (await responses[0].json()) as {
      cloudKeywords: KeywordRuleItem[];
    };
    const byId = new Map(snap.cloudKeywords.map((item) => [item.id, item]));

    expect(byId.get('cloud-cliche-hottake-1')).toMatchObject({
      enabled: false,
      langGroup: 'zh',
      packCategory: 'cliche',
    });
    expect(byId.get('cloud-cliche-aislop-en-1')).toMatchObject({
      enabled: true,
      langGroup: 'en',
      packCategory: 'cliche',
    });
    expect(byId.get('hotfix-pre0004-1')).toMatchObject({
      enabled: true,
      langGroup: 'universal',
      onlyInReplies: true,
    });
  });

  it('exposes zero public HTTP admin endpoints and preserves root endpoint inventory', async () => {
    const adminChecks = await Promise.all([
      requestWorker('/admin/cloud-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      requestWorker('/v1/cloud-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      requestWorker('/v1/cloud-keywords', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      requestWorker('/v1/cloud-keywords', {
        method: 'DELETE',
      }),
    ]);

    for (const res of adminChecks) {
      expect(res.status).toBe(404);
    }

    const rootRes = await requestWorker('/');
    expect(rootRes.status).toBe(200);
    const rootBody = (await rootRes.json()) as {
      endpoints: Record<string, string>;
    };
    expect(Object.keys(rootBody.endpoints)).toEqual([
      'snapshot',
      'report',
      'unreport',
      'batchImport',
      'stats',
    ]);
  });

  it('preserves UTF-16 surrogate pairs when chunking snapshots in D1 across exact emoji boundaries', async () => {
    const emojiHotfixId = 'hotfix-emoji-surrogate-1';
    const emojiHotfixPattern = '(?:🔥|🚀|💰|🔞)\\s*(?:airdrop|giveaway)\\s*🚨';
    await db
      .prepare(
        `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
         VALUES (?, ?, 1, '["text","bio"]', 0, NULL, 'emoji surrogate test', 1, ?, 'universal')`
      )
      .bind(emojiHotfixId, emojiHotfixPattern, Date.now())
      .run();

    try {
      // Discover exact UTF-16 indices of 🚨 in built-in cloud-cliche-breaking-1 and 🔥 in remote hotfix
      const baselineRes = await requestWorker(
        '/v1/snapshot.json?fresh=1',
        { headers: { 'CF-Connecting-IP': '198.51.100.230' } },
        { noR2: true, D1_SNAPSHOT_CHUNK_SIZE: '512000' }
      );
      expect(baselineRes.status).toBe(200);
      const baselineSnap = (await baselineRes.json()) as {
        updatedAt: string;
        cloudKeywords: KeywordRuleItem[];
      };
      const baselineSerialized = JSON.stringify(baselineSnap);
      const breakingEmojiIdx = baselineSerialized.indexOf('\uD83D\uDEA8');
      const hotfixEmojiIdx = baselineSerialized.indexOf('\uD83D\uDD25');
      expect(breakingEmojiIdx).toBeGreaterThan(0);
      expect(hotfixEmojiIdx).toBeGreaterThan(breakingEmojiIdx);

      const assertLosslessCutAt = async (
        cutBoundary: number,
        ip: string,
        expectedSurrogateStart: number,
        targetEmoji: string
      ) => {
        const overrides: TestEnvOverrides = {
          noR2: true,
          D1_SNAPSHOT_CHUNK_SIZE: String(cutBoundary),
        };
        const builtRes = await requestWorker(
          '/v1/snapshot.json?fresh=1',
          { headers: { 'CF-Connecting-IP': ip } },
          overrides
        );
        expect(builtRes.status).toBe(200);
        const builtSnap = (await builtRes.json()) as {
          updatedAt: string;
          cloudKeywords: KeywordRuleItem[];
        };
        expect(JSON.stringify(builtSnap).indexOf(targetEmoji)).toBe(
          expectedSurrogateStart
        );

        // Inspect raw stored D1 chunks to ensure zero replacement chars and zero split surrogates
        const rawParts = await db
          .prepare(
            "SELECT cache_key, payload FROM snapshot_cache WHERE cache_key LIKE 'v1/snapshot.json:part:%' ORDER BY cache_key ASC"
          )
          .all<{ cache_key: string; payload: string }>();
        const chunks = rawParts.results ?? [];
        expect(chunks.length).toBeGreaterThan(1);
        for (const chunk of chunks) {
          expect(chunk.payload).not.toContain('\uFFFD');
          const lastCode = chunk.payload.charCodeAt(chunk.payload.length - 1);
          const firstCode = chunk.payload.charCodeAt(0);
          expect(lastCode >= 0xd800 && lastCode <= 0xdbff).toBe(false);
          expect(firstCode >= 0xdc00 && firstCode <= 0xdfff).toBe(false);
        }

        // Read back via cached D1 snapshot path
        const cachedRes = await requestWorker('/v1/snapshot.json', {}, overrides);
        expect(cachedRes.status).toBe(200);
        expect(cachedRes.headers.get('cache-control')).toBe(
          'public, max-age=300, s-maxage=600'
        );
        const cachedSnap = (await cachedRes.json()) as typeof builtSnap;
        expect(cachedSnap.updatedAt).toBe(builtSnap.updatedAt);
        expect(cachedSnap.cloudKeywords).toEqual(builtSnap.cloudKeywords);
        expect(JSON.stringify(cachedSnap)).not.toContain('\uFFFD');

        const breakingRule = cachedSnap.cloudKeywords.find(
          (k) => k.id === 'cloud-cliche-breaking-1'
        );
        const builtBreaking = builtSnap.cloudKeywords.find(
          (k) => k.id === 'cloud-cliche-breaking-1'
        );
        expect(breakingRule?.pattern).toBe(builtBreaking?.pattern);
        expect(breakingRule?.pattern).toContain('🚨');

        const emojiHotfix = cachedSnap.cloudKeywords.find(
          (k) => k.id === emojiHotfixId
        );
        expect(emojiHotfix?.pattern).toBe(emojiHotfixPattern);
      };

      // Cut #1: exact surrogate boundary inside 🚨 of built-in cloud-cliche-breaking-1
      await assertLosslessCutAt(
        breakingEmojiIdx + 1,
        '198.51.100.231',
        breakingEmojiIdx,
        '\uD83D\uDEA8'
      );

      // Cut #2: exact surrogate boundary inside 🔥 of remote emoji hotfix
      await assertLosslessCutAt(
        hotfixEmojiIdx + 1,
        '198.51.100.232',
        hotfixEmojiIdx,
        '\uD83D\uDD25'
      );
    } finally {
      await db
        .prepare('DELETE FROM cloud_keywords WHERE id = ?')
        .bind(emojiHotfixId)
        .run();
    }
  });

  it('handles surrogate-safe chunking edge cases and cross-realm duplicate column errors', () => {
    expect(splitIntoSurrogateSafeChunks('', 4)).toEqual([]);
    expect(splitIntoSurrogateSafeChunks('a🚨b', 10)).toEqual(['a🚨b']);
    expect(splitIntoSurrogateSafeChunks('a🚨b', 2)).toEqual(['a', '🚨', 'b']);
    expect(splitIntoSurrogateSafeChunks('a🚨🔥b', 1)).toEqual([
      'a',
      '🚨',
      '🔥',
      'b',
    ]);
    expect(splitIntoSurrogateSafeChunks('🚨🔥🚀', 3)).toEqual([
      '🚨',
      '🔥',
      '🚀',
    ]);
    expect(splitIntoSurrogateSafeChunks('\uD83Dx', 1)).toEqual([
      '\uD83D',
      'x',
    ]);

    expect(
      isDuplicateColumnError(
        new Error('D1_ERROR: duplicate column name: lang_group: SQLITE_ERROR')
      )
    ).toBe(true);
    expect(
      isDuplicateColumnError(
        new Error('outer', {
          cause: new Error('duplicate column name: lang_group'),
        })
      )
    ).toBe(true);
    // Cross-realm plain objects
    expect(
      isDuplicateColumnError({
        name: 'Error',
        message: 'duplicate column name: lang_group',
      })
    ).toBe(true);
    expect(
      isDuplicateColumnError({
        message: 'D1_ERROR',
        cause: { message: 'duplicate column name: lang_group' },
      })
    ).toBe(true);
    const nullProtoNested = Object.assign(Object.create(null) as object, {
      cause: { message: 'duplicate column name: lang_group' },
    });
    expect(isDuplicateColumnError(nullProtoNested)).toBe(true);
    const nullProtoNoMatch = Object.create(null) as object;
    expect(isDuplicateColumnError(nullProtoNoMatch)).toBe(false);

    // Circular cause guard & unrelated errors
    const circular: { message: string; cause?: unknown } = {
      message: 'SQLITE_BUSY',
    };
    circular.cause = circular;
    expect(isDuplicateColumnError(circular)).toBe(false);
    expect(isDuplicateColumnError(new Error('SQLITE_BUSY'))).toBe(false);
  });

  it('BUG-C1-6 regression: isolates broken-regex and malformed D1 cloud_keywords rows without poisoning /v1/snapshot.json', async () => {
    const ids = [
      'hotfix-bad-regex',
      'hotfix-empty-pattern',
      'hotfix-empty-id',
      'hotfix-float-exempt',
      'hotfix-good-ja-t5',
    ];
    try {
      await db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          'hotfix-bad-regex',
          '[unclosed_broken_regex',
          1,
          '["text"]',
          0,
          null,
          'bad regex',
          1,
          1700000000000,
          'en'
        )
        .run();
      await db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          'hotfix-empty-pattern',
          '   ',
          0,
          '["text"]',
          0,
          null,
          null,
          1,
          1700000000000,
          'universal'
        )
        .run();
      await db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          '   ',
          'valid_pattern',
          0,
          '["text"]',
          0,
          null,
          null,
          1,
          1700000000000,
          'universal'
        )
        .run();
      await db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          'hotfix-float-exempt',
          'fractional_spam_token',
          0,
          '{broken-json',
          0,
          12.5,
          '   ',
          1,
          1700000000000,
          'zz'
        )
        .run();
      await db
        .prepare(
          `INSERT OR REPLACE INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          'hotfix-good-ja-t5',
          '詐欺ギフト配布',
          0,
          '["text","bio"]',
          1,
          5000,
          'JA hotfix',
          1,
          1700000000000,
          'ja'
        )
        .run();

      const res = await requestWorker('/v1/snapshot.json?fresh=1');
      expect(res.status).toBe(200);
      const snap = (await res.json()) as {
        cloudKeywords: KeywordRuleItem[];
      };

      expect(snap.cloudKeywords.find((k) => k.id === 'hotfix-bad-regex')).toBeUndefined();
      expect(
        snap.cloudKeywords.find((k) => k.id === 'hotfix-empty-pattern')
      ).toBeUndefined();
      expect(snap.cloudKeywords.find((k) => k.id.trim() === '')).toBeUndefined();

      const floatRow = snap.cloudKeywords.find(
        (k) => k.id === 'hotfix-float-exempt'
      );
      expect(floatRow).toBeDefined();
      expect(floatRow?.maxFollowersExempt).toBe(12);
      expect(floatRow?.langGroup).toBe('universal');
      expect(floatRow?.scopes).toEqual(['text', 'bio']);
      expect(floatRow?.note).toBeUndefined();

      const goodJa = snap.cloudKeywords.find((k) => k.id === 'hotfix-good-ja-t5');
      expect(goodJa).toBeDefined();
      expect(goodJa?.langGroup).toBe('ja');
      expect(goodJa?.onlyInReplies).toBe(true);
      expect(goodJa?.maxFollowersExempt).toBe(5000);
    } finally {
      for (const id of [...ids, '   ']) {
        await db.prepare('DELETE FROM cloud_keywords WHERE id = ?').bind(id).run();
      }
      await requestWorker('/v1/snapshot.json?fresh=1');
    }
  });
});
