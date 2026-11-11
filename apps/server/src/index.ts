import { aggregateAccount } from './aggregation';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import {
  DEFAULT_CLOUD_KEYWORDS,
  HIGH_FOLLOWER_PROTECT_THRESHOLD,
  MIN_REPORTER_ACCOUNT_AGE_DAYS,
  SITE_DOMAIN,
  type BatchBlockImportPayload,
  type BlockReasonTag,
  type BlockReportPayload,
  type CrowdAccountEntry,
  type CrowdBlockSnapshot,
  type KeywordMatchScope,
  type KeywordRuleItem,
} from '@keepxclean/shared';

export interface Env {
  DB: D1Database;
  SNAPSHOT_BUCKET: R2Bucket;
  SITE_DOMAIN?: string;
  MIN_SNAPSHOT_BLOCK_COUNT?: string;
}

const VALID_TAGS: BlockReasonTag[] = [
  'spam',
  'nsfw',
  'scam',
  'ad',
  'bot',
  'other',
];

const SNAPSHOT_R2_KEY = 'v1/snapshot.json';

const initializedDatabases = new WeakSet<D1Database>();

async function ensureSchema(db: D1Database): Promise<void> {
  if (initializedDatabases.has(db)) return;
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS block_reports (
        target_uid TEXT NOT NULL,
        reporter_hash TEXT NOT NULL,
        tag TEXT NOT NULL DEFAULT 'other',
        weight INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (target_uid, reporter_hash)
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_block_reports_reporter
      ON block_reports(reporter_hash, created_at)
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS account_reputation (
        target_uid TEXT PRIMARY KEY,
        screen_name TEXT,
        display_name TEXT,
        followers_count INTEGER NOT NULL DEFAULT 0,
        block_count INTEGER NOT NULL DEFAULT 0,
        spam_count INTEGER NOT NULL DEFAULT 0,
        nsfw_count INTEGER NOT NULL DEFAULT 0,
        scam_count INTEGER NOT NULL DEFAULT 0,
        ad_count INTEGER NOT NULL DEFAULT 0,
        bot_count INTEGER NOT NULL DEFAULT 0,
        dominant_tag TEXT NOT NULL DEFAULT 'other',
        updated_at INTEGER NOT NULL
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_account_reputation_block_count
      ON account_reputation(block_count DESC)
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        actor_key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 0
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS cloud_keywords (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL,
        is_regex INTEGER NOT NULL DEFAULT 1,
        scopes TEXT NOT NULL,
        max_followers_exempt INTEGER DEFAULT 50000,
        note TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      )
    `),
  ]);
  initializedDatabases.add(db);
}

async function checkRateLimit(
  db: D1Database,
  actorKey: string,
  maxPerHour: number
): Promise<boolean> {
  const now = Date.now();
  const windowMs = 3600_000;
  const existing = await db
    .prepare(
      'SELECT window_start, request_count FROM rate_limits WHERE actor_key = ?'
    )
    .bind(actorKey)
    .first<{ window_start: number; request_count: number }>();

  if (!existing || now - existing.window_start > windowMs) {
    await db
      .prepare(
        'INSERT OR REPLACE INTO rate_limits (actor_key, window_start, request_count) VALUES (?, ?, 1)'
      )
      .bind(actorKey, now)
      .run();
    return true;
  }

  if (existing.request_count >= maxPerHour) {
    return false;
  }

  await db
    .prepare(
      'UPDATE rate_limits SET request_count = request_count + 1 WHERE actor_key = ?'
    )
    .bind(actorKey)
    .run();
  return true;
}

/**
 * Compiles the crowd-sourced blocklist from D1 into a compact CrowdBlockSnapshot
 * and stores it in Cloudflare R2 (`v1/snapshot.json`).
 */
export async function buildAndSaveSnapshot(
  env: Env,
  minBlockCountOverride?: number
): Promise<CrowdBlockSnapshot> {
  await ensureSchema(env.DB);
  const minCount =
    minBlockCountOverride ??
    Math.max(1, Number(env.MIN_SNAPSHOT_BLOCK_COUNT ?? 2));

  const rows = await env.DB.prepare(
    `SELECT target_uid, followers_count, block_count, dominant_tag
     FROM account_reputation
     WHERE block_count >= ?
     ORDER BY block_count DESC
     LIMIT 100000`
  )
    .bind(minCount)
    .all<{
      target_uid: string;
      followers_count: number;
      block_count: number;
      dominant_tag: string;
    }>();

  const statsRow = await env.DB.prepare(
    'SELECT COUNT(*) as total_accounts, COALESCE(SUM(block_count), 0) as total_reports FROM account_reputation WHERE block_count >= 1'
  ).first<{ total_accounts: number; total_reports: number }>();

  const counts: Record<string, CrowdAccountEntry> = {};
  for (const row of rows.results ?? []) {
    const entry: CrowdAccountEntry = {
      c: row.block_count,
    };
    if (
      row.dominant_tag &&
      row.dominant_tag !== 'other' &&
      VALID_TAGS.includes(row.dominant_tag as BlockReasonTag)
    ) {
      entry.t = row.dominant_tag as BlockReasonTag;
    }
    if (row.followers_count >= HIGH_FOLLOWER_PROTECT_THRESHOLD) {
      entry.p = true;
    }
    counts[row.target_uid] = entry;
  }

  // Load any custom cloud keywords from D1, or fallback to DEFAULT_CLOUD_KEYWORDS
  const kwRows = await env.DB.prepare(
    'SELECT id, pattern, is_regex, scopes, max_followers_exempt, note, enabled FROM cloud_keywords WHERE enabled = 1'
  ).all<{
    id: string;
    pattern: string;
    is_regex: number;
    scopes: string;
    max_followers_exempt: number | null;
    note: string | null;
    enabled: number;
  }>();

  let cloudKeywords: KeywordRuleItem[] = DEFAULT_CLOUD_KEYWORDS;
  if (kwRows.results && kwRows.results.length > 0) {
    cloudKeywords = kwRows.results.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      isRegex: Boolean(r.is_regex),
      scopes: (JSON.parse(r.scopes) as KeywordMatchScope[]) ?? ['text', 'bio'],
      maxFollowersExempt: r.max_followers_exempt ?? undefined,
      note: r.note ?? undefined,
      enabled: Boolean(r.enabled),
    }));
  }

  const snapshot: CrowdBlockSnapshot = {
    version: 1,
    updatedAt: new Date().toISOString(),
    domain: env.SITE_DOMAIN ?? SITE_DOMAIN,
    totalAccounts: Number(statsRow?.total_accounts ?? 0),
    totalReports: Number(statsRow?.total_reports ?? 0),
    counts,
    cloudKeywords,
  };

  if (env.SNAPSHOT_BUCKET) {
    await env.SNAPSHOT_BUCKET.put(SNAPSHOT_R2_KEY, JSON.stringify(snapshot), {
      httpMetadata: {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'public, max-age=300, s-maxage=600',
      },
    });
  }

  return snapshot;
}

export const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-KXC-Version'],
    maxAge: 86400,
  })
);

app.get('/', (c) => {
  return c.json({
    service: 'KeepXClean Cloud Service',
    domain: c.env.SITE_DOMAIN ?? SITE_DOMAIN,
    status: 'ok',
    endpoints: {
      snapshot: '/v1/snapshot.json',
      report: '/v1/blocks/report',
      unreport: '/v1/blocks/unreport',
      batchImport: '/v1/blocks/batch-import',
      stats: '/v1/stats',
    },
  });
});

app.get('/health', (c) => {
  return c.json({ ok: true, domain: c.env.SITE_DOMAIN ?? SITE_DOMAIN });
});

function getActorIp(c: Context<{ Bindings: Env }>): string {
  return (
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For') ??
    'local'
  );
}

async function handleGetSnapshot(c: Context<{ Bindings: Env }>) {
  const forceFresh = c.req.query('fresh') === '1';
  const cachedObj = c.env.SNAPSHOT_BUCKET
    ? await c.env.SNAPSHOT_BUCKET.get(SNAPSHOT_R2_KEY)
    : null;

  if (!forceFresh && cachedObj) {
    const data = await cachedObj.json<CrowdBlockSnapshot>();
    return c.json(data, 200, {
      'Cache-Control': 'public, max-age=300, s-maxage=600',
    });
  }

  if (forceFresh && cachedObj) {
    await ensureSchema(c.env.DB);
    const freshAllowed = await checkRateLimit(
      c.env.DB,
      `snapshot_fresh:${getActorIp(c)}`,
      12
    );
    if (!freshAllowed) {
      const data = await cachedObj.json<CrowdBlockSnapshot>();
      return c.json(data, 200, {
        'Cache-Control': 'public, max-age=300, s-maxage=600',
      });
    }
  }

  // In local dev or first boot before Cron fires, include accounts with >= 1 vote if min=1 requested, else default
  const minCount = c.req.query('min')
    ? Math.max(1, Number(c.req.query('min')))
    : undefined;
  const built = await buildAndSaveSnapshot(c.env, minCount);
  return c.json(built, 200, {
    'Cache-Control': 'public, max-age=60, s-maxage=300',
  });
}

app.get('/v1/snapshot', handleGetSnapshot);
app.get('/v1/snapshot.json', handleGetSnapshot);

/**
 * Report a single blocked X account to the crowd-sourced reputation database.
 */
app.post('/v1/blocks/report', async (c) => {
  await ensureSchema(c.env.DB);

  let body: BlockReportPayload;
  try {
    body = await c.req.json<BlockReportPayload>();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }

  const targetUid = String(body.targetUid ?? '').trim();
  const reporterHash = String(body.reporterUidHash ?? '').trim();
  if (!/^\d{1,25}$/.test(targetUid) || reporterHash.length < 8) {
    return c.json({ ok: false, error: 'invalid_uid_or_reporter' }, 400);
  }

  const tag: BlockReasonTag = VALID_TAGS.includes(body.tag as BlockReasonTag)
    ? (body.tag as BlockReasonTag)
    : 'other';

  const ip = getActorIp(c);
  const rateAllowed = await checkRateLimit(
    c.env.DB,
    `report:${ip}:${reporterHash.slice(0, 16)}`,
    150
  );
  if (!rateAllowed) {
    return c.json({ ok: false, error: 'rate_limit_exceeded' }, 429);
  }

  // Zero-Login Anti-Sybil Check: Only count public votes from X accounts >= 30 days old
  const reporterAgeDays = Number(body.reporterAccountAgeDays ?? 0);
  if (
    !Number.isFinite(reporterAgeDays) ||
    reporterAgeDays < MIN_REPORTER_ACCOUNT_AGE_DAYS
  ) {
    return c.json({
      ok: true,
      countedPublicly: false,
      reason: 'reporter_account_too_new',
    });
  }

  const now = Date.now();
  const targetFollowers = Number.isFinite(Number(body.targetFollowersCount))
    ? Math.max(0, Number(body.targetFollowersCount))
    : 0;
  const screenName = body.targetScreenName
    ? String(body.targetScreenName).slice(0, 40)
    : null;
  const displayName = body.targetName
    ? String(body.targetName).slice(0, 80)
    : null;
  const statements = [
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO block_reports (target_uid, reporter_hash, tag, weight, created_at) VALUES (?, ?, ?, 1, ?)`
    ).bind(targetUid, reporterHash, tag, now),
  ];
  if (body.tag && body.tag !== 'other')
    statements.push(
      c.env.DB.prepare(
        'UPDATE block_reports SET tag = ? WHERE target_uid = ? AND reporter_hash = ?'
      ).bind(tag, targetUid, reporterHash)
    );
  statements.push(
    aggregateAccount(
      c.env.DB,
      targetUid,
      now,
      screenName,
      displayName,
      targetFollowers
    )
  );
  const results = await c.env.DB.batch(statements);
  const isNewVote = (results[0].meta?.changes ?? 0) > 0;

  const updated = await c.env.DB.prepare(
    'SELECT block_count, dominant_tag, followers_count FROM account_reputation WHERE target_uid = ?'
  )
    .bind(targetUid)
    .first<{
      block_count: number;
      dominant_tag: string;
      followers_count: number;
    }>();

  return c.json({
    ok: true,
    countedPublicly: true,
    isNewVote,
    targetUid,
    blockCount: updated?.block_count ?? 1,
    dominantTag: (updated?.dominant_tag ?? tag) as BlockReasonTag,
    highFollowerProtected:
      (updated?.followers_count ?? targetFollowers) >=
      HIGH_FOLLOWER_PROTECT_THRESHOLD,
  });
});

/**
 * Explicitly retract a report. The new UI cancels pending reports before submission.
 */
app.post('/v1/blocks/unreport', async (c) => {
  await ensureSchema(c.env.DB);
  let body: { targetUid: string; reporterUidHash: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }

  const targetUid = String(body.targetUid ?? '').trim();
  const reporterHash = String(body.reporterUidHash ?? '').trim();
  if (!/^\d{1,25}$/.test(targetUid) || reporterHash.length < 8) {
    return c.json({ ok: false, error: 'missing_params' }, 400);
  }

  const rateAllowed = await checkRateLimit(
    c.env.DB,
    `unreport:${getActorIp(c)}:${reporterHash.slice(0, 16)}`,
    150
  );
  if (!rateAllowed) {
    return c.json({ ok: false, error: 'rate_limit_exceeded' }, 429);
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      'DELETE FROM block_reports WHERE target_uid = ? AND reporter_hash = ?'
    ).bind(targetUid, reporterHash),
    aggregateAccount(c.env.DB, targetUid, Date.now()),
  ]);

  return c.json({ ok: true });
});

/**
 * Batch import a user's existing X blocklist (cold-start community boost).
 */
app.post('/v1/blocks/batch-import', async (c) => {
  await ensureSchema(c.env.DB);
  let body: BatchBlockImportPayload;
  try {
    body = await c.req.json<BatchBlockImportPayload>();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }

  const reporterHash = String(body.reporterUidHash ?? '').trim();
  const reporterAgeDays = Number(body.reporterAccountAgeDays ?? 0);
  if (reporterHash.length < 8 || !Array.isArray(body.targetUids)) {
    return c.json({ ok: false, error: 'invalid_payload' }, 400);
  }

  const rateAllowed = await checkRateLimit(
    c.env.DB,
    `batch:${getActorIp(c)}:${reporterHash.slice(0, 16)}`,
    30
  );
  if (!rateAllowed) {
    return c.json({ ok: false, error: 'rate_limit_exceeded' }, 429);
  }

  if (
    !Number.isFinite(reporterAgeDays) ||
    reporterAgeDays < MIN_REPORTER_ACCOUNT_AGE_DAYS
  ) {
    return c.json({
      ok: true,
      countedPublicly: false,
      importedCount: 0,
      reason: 'reporter_account_too_new',
    });
  }

  const validUids = Array.from(
    new Set(
      body.targetUids
        .map((id) => String(id).trim())
        .filter((id) => /^\d{1,25}$/.test(id))
    )
  ).slice(0, 500);

  if (validUids.length === 0) {
    return c.json({ ok: true, countedPublicly: true, importedCount: 0 });
  }

  const now = Date.now();
  let newlyCounted = 0;

  // Each target's report and aggregate are committed in the same transaction.
  for (let i = 0; i < validUids.length; i += 25) {
    const chunk = validUids.slice(i, i + 25);
    const statements = chunk.flatMap((uid) => [
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO block_reports (target_uid, reporter_hash, tag, weight, created_at)
        VALUES (?, ?, 'other', 1, ?)`
      ).bind(uid, reporterHash, now),
      aggregateAccount(c.env.DB, uid, now),
    ]);
    const results = await c.env.DB.batch(statements);
    for (let index = 0; index < results.length; index += 2)
      if ((results[index].meta?.changes ?? 0) > 0) newlyCounted++;
  }

  // Snapshot compilation is handled asynchronously by the 10-minute Cron Trigger
  // (or lazy first-boot fetch) to avoid full-table scans on every 500-UID batch.
  return c.json({
    ok: true,
    countedPublicly: true,
    importedCount: newlyCounted,
    totalSubmitted: validUids.length,
  });
});

app.get('/v1/stats', async (c) => {
  await ensureSchema(c.env.DB);
  const stats = await c.env.DB.prepare(
    `SELECT
      COUNT(*) as total_flagged_accounts,
      SUM(CASE WHEN block_count >= 2 THEN 1 ELSE 0 END) as active_crowd_blocked,
      COALESCE(SUM(block_count), 0) as total_votes
     FROM account_reputation`
  ).first<{
    total_flagged_accounts: number;
    active_crowd_blocked: number;
    total_votes: number;
  }>();

  return c.json({
    ok: true,
    domain: c.env.SITE_DOMAIN ?? SITE_DOMAIN,
    totalFlaggedAccounts: Number(stats?.total_flagged_accounts ?? 0),
    activeCrowdBlocked: Number(stats?.active_crowd_blocked ?? 0),
    totalVotes: Number(stats?.total_votes ?? 0),
  });
});

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(buildAndSaveSnapshot(env));
  },
};
