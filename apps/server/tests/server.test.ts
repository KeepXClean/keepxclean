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
});
