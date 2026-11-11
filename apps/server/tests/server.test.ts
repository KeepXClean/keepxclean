import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import { app, type Env } from '../src/index';
let mf: Miniflare, env: Env;
beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("test"); } }',
    compatibilityDate: '2025-02-01',
    d1Databases: ['DB'],
    r2Buckets: ['SNAPSHOT_BUCKET'],
  });
  env = {
    DB: (await mf.getD1Database('DB')) as unknown as D1Database,
    SNAPSHOT_BUCKET: (await mf.getR2Bucket(
      'SNAPSHOT_BUCKET'
    )) as unknown as R2Bucket,
    MIN_SNAPSHOT_BLOCK_COUNT: '2',
  };
}, 30000);
afterAll(async () => {
  await mf?.dispose();
});
async function post(path: string, body: unknown) {
  const response = await app.request(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env
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
    const response = await app.request('/v1/snapshot.json?fresh=1', {}, env);
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
    const row = await env.DB.prepare(
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
      await env.DB.prepare(
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
    const row = await env.DB.prepare(
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
      const res = await app.request(
        '/v1/blocks/batch-import',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            targetUids: ['990001'],
            reporterUidHash: 'ratelimited_batch_actor',
            reporterAccountAgeDays: 120,
          }),
        },
        env
      );
      expect(res.status).toBe(200);
    }
    const blocked = await app.request(
      '/v1/blocks/batch-import',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targetUids: ['990002'],
          reporterUidHash: 'ratelimited_batch_actor',
          reporterAccountAgeDays: 120,
        }),
      },
      env
    );
    expect(blocked.status).toBe(429);

    // Ensure R2 has an initial snapshot, then exhaust fresh rebuild quota for an IP
    const seed = await app.request(
      '/v1/snapshot.json?fresh=1',
      { headers: { 'CF-Connecting-IP': '203.0.113.88' } },
      env
    );
    expect(seed.status).toBe(200);
    for (let i = 0; i < 15; i++) {
      const snap = await app.request(
        '/v1/snapshot.json?fresh=1',
        { headers: { 'CF-Connecting-IP': '203.0.113.88' } },
        env
      );
      expect(snap.status).toBe(200);
    }
  });
  it('compiles and serves cached snapshots from D1 snapshot_cache when R2 is not bound', async () => {
    const d1OnlyEnv: Env = {
      DB: env.DB,
      MIN_SNAPSHOT_BLOCK_COUNT: '2',
    };
    const built = await app.request(
      '/v1/snapshot.json?fresh=1',
      { headers: { 'CF-Connecting-IP': '203.0.113.99' } },
      d1OnlyEnv
    );
    expect(built.status).toBe(200);
    const cached = await app.request('/v1/snapshot.json', {}, d1OnlyEnv);
    expect(cached.status).toBe(200);
    const body = (await cached.json()) as { version: number; domain: string };
    expect(body.version).toBe(1);
    expect(body.domain).toBe('keepxclean.com');
  });
});
