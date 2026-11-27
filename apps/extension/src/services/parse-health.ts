export const CORE_GRAPHQL_OPS = [
  'HomeTimeline',
  'HomeLatestTimeline',
  'TweetDetail',
  'SearchTimeline',
] as const;

export type CoreGraphqlOp = (typeof CORE_GRAPHQL_OPS)[number];

export const PARSE_HEALTH_MIN_STREAK = 5;
export const PARSE_HEALTH_MIN_SPAN_MS = 15_000;
export const PARSE_HEALTH_EMIT_THROTTLE_MS = 30_000;
export const PARSE_HEALTH_MAX_TOP_KEYS = 24;

export type ParseHealthStatus = 'ok' | 'degraded';

export interface ParseHealthReport {
  status: ParseHealthStatus;
  consecutiveZeroCount: number;
  firstFailureAt?: number;
  lastFailureAt?: number;
  endpoints: CoreGraphqlOp[];
  topKeys: string[];
}

export interface ParseHealthState extends ParseHealthReport {
  dismissedAt?: number;
}

export interface ParseHealthObserveInput {
  url: string;
  rawText?: string;
  parsed: unknown;
  extractedTweetCount: number;
  httpStatus?: number;
  now?: number;
}

export interface ParseHealthTrackerOptions {
  emitOnFirstHealthy?: boolean;
}

const CORE_OP_BY_LOWER = new Map<string, CoreGraphqlOp>(
  CORE_GRAPHQL_OPS.map((op) => [op.toLowerCase(), op])
);

const CORE_GRAPHQL_PATH_RE =
  /\/graphql\/[^/]+\/(HomeTimeline|HomeLatestTimeline|TweetDetail|SearchTimeline)\/?$/i;

const SAFE_KEY_SEGMENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,49}$/;
const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const LONG_DIGIT_RUN_RE = /\d{6,}/;
const LONG_HEX_RE = /[a-f0-9]{16,}/i;
const SAFE_VERSION_RE = /^[0-9a-zA-Z._-]{1,32}$/;
const MAX_DATE_MS = 8_640_000_000_000_000;

function sanitizeTimestamp(value: unknown): number | undefined {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_DATE_MS
  ) {
    return Math.floor(value);
  }
  return undefined;
}

function formatSafeIsoTimestamp(ts: number | undefined): string | null {
  if (
    typeof ts !== 'number' ||
    !Number.isFinite(ts) ||
    ts < 0 ||
    ts > MAX_DATE_MS
  ) {
    return null;
  }
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return false;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  return true;
}

function hasOnlyOwnDataProps(obj: object): boolean {
  if (Object.getOwnPropertySymbols(obj).length > 0) return false;
  for (const key of Object.getOwnPropertyNames(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc && (desc.get !== undefined || desc.set !== undefined)) {
      return false;
    }
  }
  return true;
}

function readOwnData(
  obj: Record<string, unknown>,
  key: string
): { ok: true; value: unknown } | { ok: false } {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (desc === undefined) return { ok: true, value: undefined };
  if (desc.get !== undefined || desc.set !== undefined) {
    return { ok: false };
  }
  return { ok: true, value: desc.value };
}

function readOwnArrayStrings(value: unknown, maxScan = 4096): string[] | null {
  if (!Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Array.prototype) return null;
  if (!hasOnlyOwnDataProps(value)) return null;
  const out: string[] = [];
  const limit = Math.min(value.length, maxScan);
  for (let i = 0; i < limit; i++) {
    const desc = Object.getOwnPropertyDescriptor(value, i);
    if (!desc) continue;
    if (typeof desc.value === 'string') {
      out.push(desc.value);
    }
  }
  return out;
}

export function defaultParseHealth(): ParseHealthState {
  return {
    status: 'ok',
    consecutiveZeroCount: 0,
    endpoints: [],
    topKeys: [],
  };
}

export function detectCoreGraphqlOp(url: string): CoreGraphqlOp | null {
  if (typeof url !== 'string' || !url) return null;
  const pathPart = url.split(/[?#]/, 1)[0] ?? '';
  const match = CORE_GRAPHQL_PATH_RE.exec(pathPart);
  if (!match?.[1]) return null;
  return CORE_OP_BY_LOWER.get(match[1].toLowerCase()) ?? null;
}

export function isSafeKeySegment(segment: string): boolean {
  if (typeof segment !== 'string') return false;
  return (
    SAFE_KEY_SEGMENT_RE.test(segment) &&
    !PROTO_KEYS.has(segment) &&
    !LONG_DIGIT_RUN_RE.test(segment) &&
    !LONG_HEX_RE.test(segment)
  );
}

export function isSafeKeyPath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0 || path.length > 160) {
    return false;
  }
  const parts = path.split('.');
  if (parts.length < 1 || parts.length > 4) return false;
  return parts.every((part) => isSafeKeySegment(part));
}

export function extractSanitizedTopKeys(
  payload: unknown,
  maxDepth = 3,
  maxKeys = PARSE_HEALTH_MAX_TOP_KEYS
): string[] {
  if (
    !isPlainObject(payload) ||
    !Number.isFinite(maxDepth) ||
    !Number.isFinite(maxKeys) ||
    maxDepth < 1 ||
    maxKeys < 1
  ) {
    return [];
  }
  const results = new Set<string>();
  const clampedDepth = Math.min(Math.max(Math.floor(maxDepth), 1), 4);
  const clampedMax = Math.min(Math.max(Math.floor(maxKeys), 1), 64);

  const walk = (
    node: Record<string, unknown>,
    prefix: string,
    depth: number
  ): boolean => {
    let emittedChild = false;
    for (const key of Object.keys(node)) {
      if (results.size >= clampedMax) return true;
      if (!isSafeKeySegment(key)) continue;
      const desc = Object.getOwnPropertyDescriptor(node, key);
      if (!desc || desc.get !== undefined || desc.set !== undefined) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      const child = desc.value;
      if (depth < clampedDepth && isPlainObject(child)) {
        const subEmitted = walk(child, path, depth + 1);
        if (!subEmitted && results.size < clampedMax) {
          results.add(path);
        }
        emittedChild = true;
      } else {
        results.add(path);
        emittedChild = true;
      }
    }
    return emittedChild;
  };

  walk(payload, '', 1);
  return [...results];
}

export function sanitizeParseHealthReport(
  input: unknown
): ParseHealthReport | null {
  if (!isPlainObject(input)) return null;
  for (const key of Object.getOwnPropertyNames(input)) {
    if (PROTO_KEYS.has(key)) return null;
    const desc = Object.getOwnPropertyDescriptor(input, key);
    if (desc && (desc.get !== undefined || desc.set !== undefined)) {
      return null;
    }
  }
  const statusProp = readOwnData(input, 'status');
  if (!statusProp.ok) return null;
  const status = statusProp.value;
  if (status !== 'ok' && status !== 'degraded') return null;

  if (status === 'ok') {
    return {
      status: 'ok',
      consecutiveZeroCount: 0,
      endpoints: [],
      topKeys: [],
    };
  }

  const countProp = readOwnData(input, 'consecutiveZeroCount');
  if (!countProp.ok) return null;
  const rawCount = countProp.value;
  if (
    typeof rawCount !== 'number' ||
    !Number.isFinite(rawCount) ||
    rawCount < PARSE_HEALTH_MIN_STREAK
  ) {
    return null;
  }
  const consecutiveZeroCount = Math.min(Math.floor(rawCount), 10_000);

  const endpointsProp = readOwnData(input, 'endpoints');
  if (!endpointsProp.ok) return null;
  const rawEndpoints = readOwnArrayStrings(endpointsProp.value);
  if (!rawEndpoints) return null;
  const endpoints: CoreGraphqlOp[] = [];
  const seenEndpoints = new Set<CoreGraphqlOp>();
  for (const ep of rawEndpoints) {
    const canonical = CORE_OP_BY_LOWER.get(ep.toLowerCase());
    if (canonical && !seenEndpoints.has(canonical)) {
      seenEndpoints.add(canonical);
      endpoints.push(canonical);
      if (endpoints.length >= CORE_GRAPHQL_OPS.length) break;
    }
  }
  if (endpoints.length === 0) return null;

  const topKeysProp = readOwnData(input, 'topKeys');
  if (!topKeysProp.ok) return null;
  let rawTopKeys: string[] = [];
  if (topKeysProp.value !== undefined) {
    const parsedTopKeys = readOwnArrayStrings(topKeysProp.value);
    if (!parsedTopKeys) return null;
    rawTopKeys = parsedTopKeys;
  }
  const topKeys: string[] = [];
  const seenKeys = new Set<string>();
  for (const item of rawTopKeys) {
    if (isSafeKeyPath(item) && !seenKeys.has(item)) {
      seenKeys.add(item);
      topKeys.push(item);
      if (topKeys.length >= PARSE_HEALTH_MAX_TOP_KEYS) break;
    }
  }

  const firstProp = readOwnData(input, 'firstFailureAt');
  const lastProp = readOwnData(input, 'lastFailureAt');
  if (!firstProp.ok || !lastProp.ok) return null;
  const firstFailureAt = sanitizeTimestamp(firstProp.value);
  const lastFailureAt = sanitizeTimestamp(lastProp.value);
  if ((firstFailureAt === undefined) !== (lastFailureAt === undefined)) {
    return null;
  }
  if (
    firstFailureAt !== undefined &&
    lastFailureAt !== undefined &&
    (lastFailureAt < firstFailureAt ||
      lastFailureAt - firstFailureAt < PARSE_HEALTH_MIN_SPAN_MS)
  ) {
    return null;
  }

  return {
    status: 'degraded',
    consecutiveZeroCount,
    ...(firstFailureAt !== undefined ? { firstFailureAt } : {}),
    ...(lastFailureAt !== undefined ? { lastFailureAt } : {}),
    endpoints,
    topKeys,
  };
}

export function normalizeParseHealth(raw: unknown): ParseHealthState {
  const report = sanitizeParseHealthReport(raw);
  if (!report) return defaultParseHealth();
  const dismissedProp = readOwnData(
    raw as Record<string, unknown>,
    'dismissedAt'
  );
  const dismissedAt =
    report.status === 'degraded' &&
    dismissedProp.ok &&
    typeof dismissedProp.value === 'number' &&
    Number.isFinite(dismissedProp.value) &&
    dismissedProp.value > 0 &&
    dismissedProp.value <= MAX_DATE_MS
      ? Math.floor(dismissedProp.value)
      : undefined;
  return {
    ...report,
    ...(dismissedAt !== undefined ? { dismissedAt } : {}),
  };
}

export class ParseHealthTracker {
  private status: ParseHealthStatus = 'ok';
  private consecutiveZeroCount = 0;
  private firstFailureAt?: number;
  private lastFailureAt?: number;
  private endpoints = new Set<CoreGraphqlOp>();
  private topKeys = new Set<string>();
  private lastEmittedAt = 0;
  private emittedEndpoints = new Set<CoreGraphqlOp>();
  private emittedInitialOk = false;
  private readonly emitOnFirstHealthy: boolean;

  constructor(options?: ParseHealthTrackerOptions) {
    this.emitOnFirstHealthy = Boolean(options?.emitOnFirstHealthy);
  }

  getState(): ParseHealthReport {
    return {
      status: this.status,
      consecutiveZeroCount: this.consecutiveZeroCount,
      ...(this.firstFailureAt !== undefined
        ? { firstFailureAt: this.firstFailureAt }
        : {}),
      ...(this.lastFailureAt !== undefined
        ? { lastFailureAt: this.lastFailureAt }
        : {}),
      endpoints: [...this.endpoints],
      topKeys: [...this.topKeys],
    };
  }

  reset(): void {
    this.status = 'ok';
    this.consecutiveZeroCount = 0;
    this.firstFailureAt = undefined;
    this.lastFailureAt = undefined;
    this.endpoints.clear();
    this.topKeys.clear();
    this.lastEmittedAt = 0;
    this.emittedEndpoints.clear();
  }

  observe(input: ParseHealthObserveInput): ParseHealthReport | null {
    const op = detectCoreGraphqlOp(input.url);
    if (!op) return null;

    if (
      input.httpStatus !== undefined &&
      (input.httpStatus < 200 || input.httpStatus >= 300)
    ) {
      return null;
    }

    if (input.rawText !== undefined && input.rawText.trim().length <= 2) {
      return null;
    }

    if (!isPlainObject(input.parsed)) {
      return null;
    }

    if (
      typeof input.extractedTweetCount === 'number' &&
      input.extractedTweetCount > 0
    ) {
      const wasDegraded = this.status === 'degraded';
      this.reset();
      if (wasDegraded) {
        this.emittedInitialOk = true;
        return this.getState();
      }
      if (this.emitOnFirstHealthy && !this.emittedInitialOk) {
        this.emittedInitialOk = true;
        return this.getState();
      }
      return null;
    }

    const dataProp = readOwnData(input.parsed, 'data');
    if (
      !dataProp.ok ||
      !isPlainObject(dataProp.value) ||
      Object.keys(dataProp.value).length === 0
    ) {
      return null;
    }
    const errorsProp = readOwnData(input.parsed, 'errors');
    if (
      !errorsProp.ok ||
      (Array.isArray(errorsProp.value) && errorsProp.value.length > 0)
    ) {
      return null;
    }

    const rawNow = sanitizeTimestamp(input.now) ?? Date.now();
    const now =
      this.lastFailureAt !== undefined
        ? Math.max(this.lastFailureAt, rawNow)
        : this.firstFailureAt !== undefined
          ? Math.max(this.firstFailureAt, rawNow)
          : rawNow;

    this.consecutiveZeroCount += 1;
    if (this.firstFailureAt === undefined) {
      this.firstFailureAt = now;
    }
    this.lastFailureAt = now;
    this.endpoints.add(op);
    for (const keyPath of extractSanitizedTopKeys(input.parsed)) {
      if (this.topKeys.size >= PARSE_HEALTH_MAX_TOP_KEYS) break;
      this.topKeys.add(keyPath);
    }

    const spanMs = now - this.firstFailureAt;
    if (
      this.consecutiveZeroCount < PARSE_HEALTH_MIN_STREAK ||
      spanMs < PARSE_HEALTH_MIN_SPAN_MS
    ) {
      return null;
    }

    const enteringDegraded = this.status !== 'degraded';
    const hasNewEndpoint = !this.emittedEndpoints.has(op);
    this.status = 'degraded';

    if (
      enteringDegraded ||
      hasNewEndpoint ||
      now - this.lastEmittedAt >= PARSE_HEALTH_EMIT_THROTTLE_MS
    ) {
      this.lastEmittedAt = now;
      for (const ep of this.endpoints) {
        this.emittedEndpoints.add(ep);
      }
      return this.getState();
    }

    return null;
  }
}

export function formatRedactedHealthDiagnostic(
  health: ParseHealthState | ParseHealthReport,
  extensionVersion: string
): string {
  const safeVersion = SAFE_VERSION_RE.test(extensionVersion.trim())
    ? extensionVersion.trim()
    : 'unknown';
  const sanitized = sanitizeParseHealthReport(health) ?? defaultParseHealth();
  const lines = [
    'KeepXClean Parse Health Diagnostic (Redacted)',
    `Version: ${safeVersion}`,
    `Status: ${sanitized.status}`,
    `Consecutive empty parses: ${sanitized.consecutiveZeroCount}`,
    `Affected operations: ${sanitized.endpoints.length ? sanitized.endpoints.join(', ') : 'none'}`,
    `Top-level keys: ${sanitized.topKeys.length ? sanitized.topKeys.join(', ') : 'none'}`,
  ];
  const firstSeen = formatSafeIsoTimestamp(sanitized.firstFailureAt);
  if (firstSeen !== null) {
    lines.push(`First seen (UTC): ${firstSeen}`);
  }
  const lastSeen = formatSafeIsoTimestamp(sanitized.lastFailureAt);
  if (lastSeen !== null) {
    lines.push(`Last seen (UTC): ${lastSeen}`);
  }
  return lines.join('\n');
}
