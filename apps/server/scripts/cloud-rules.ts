import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_BASE_URL,
  CLOUD_KEYWORD_LANG_GROUPS,
  isCloudKeywordLangGroup,
  MAX_RULE_PACK_REGEX_LENGTH,
  type CloudKeywordLangGroup,
  type KeywordMatchScope,
  type KeywordRuleItem,
} from '@keepxclean/shared';

export const DATABASE_NAME = 'keepxclean-db';
export const SERVER_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
export const DEFAULT_WRANGLER_CONFIG = path.join(SERVER_DIR, 'wrangler.toml');
export const DEFAULT_MANIFEST_PATH = path.join(SERVER_DIR, 'cloud-rules.json');
export const MAX_CLOUD_RULES = 500;
export const MAX_MANIFEST_BYTES = 1024 * 1024;
export const MAX_NOTE_LENGTH = 500;
export const MAX_FOLLOWERS_EXEMPT = 1_000_000_000;

const RULE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const VALID_SCOPES = new Set<KeywordMatchScope>(['text', 'bio', 'name', 'url']);
const ALLOWED_TOP_LEVEL_KEYS = new Set<string>(['version', 'rules']);
const ALLOWED_RULE_KEYS = new Set<string>([
  'id',
  'pattern',
  'isRegex',
  'scopes',
  'onlyInReplies',
  'maxFollowersExempt',
  'langGroup',
  'note',
  'enabled',
]);
const FORBIDDEN_PROTO_KEYS = new Set<string>([
  '__proto__',
  'constructor',
  'prototype',
]);
const KNOWN_CLI_FLAGS = new Set<string>([
  '--dry-run',
  '--local',
  '--remote',
  '--file',
  '--no-refresh',
  '--persist-to',
  '--api-url',
  '--help',
  '-h',
]);
const LIST_D1_SQL =
  "SELECT id, COALESCE(lang_group, 'universal') AS lang_group, enabled, scopes, COALESCE(note, '') AS note FROM cloud_keywords ORDER BY id ASC;";

export interface ValidatedCloudRule extends KeywordRuleItem {
  langGroup: CloudKeywordLangGroup;
  onlyInReplies: boolean;
}

export interface CloudRulesManifest {
  version: 1;
  rules: ValidatedCloudRule[];
}

export interface CloudRuleSummaryRow {
  id: string;
  langGroup: string;
  enabled: boolean;
  scopes: string[];
  note: string;
}

export type ParsedCliArgs =
  | {
      help: true;
      command?: 'push' | 'list';
    }
  | {
      help: false;
      command: 'push';
      target: 'local' | 'remote';
      dryRun: boolean;
      noRefresh: boolean;
      filePath: string;
      persistTo?: string;
      apiUrl: string;
    }
  | {
      help: false;
      command: 'list';
      source: 'file' | 'local' | 'remote';
      filePath: string;
      persistTo?: string;
    };

export interface WranglerExecResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type WranglerRunner = (
  args: string[],
  options: { cwd: string; target: 'local' | 'remote' }
) => WranglerExecResult;

export interface RefreshSnapshotResult {
  refreshed: boolean;
  stale: boolean;
  updatedAt: string;
  keywordCount: number;
}

export interface CliDependencies {
  cwd?: string;
  serverDir?: string;
  wranglerConfigPath?: string;
  now?: () => number;
  fetchImpl?: typeof fetch;
  runWrangler?: WranglerRunner;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export interface CliRunResult {
  exitCode: number;
  output?: string;
  sql?: string;
  refresh?: RefreshSnapshotResult;
}

let cpuPinned = false;

function pinSingleCpuForLocalWorkerd(): void {
  if (cpuPinned || process.platform !== 'linux') return;
  if (os.cpus().length <= 1) return;
  try {
    execFileSync('taskset', ['-apc', '0', String(process.pid)], {
      stdio: 'ignore',
    });
    cpuPinned = true;
  } catch {
    // Best-effort only: ignore if taskset is unavailable or affinity is restricted
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasAsciiControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function assertSafeManifestGraph(
  node: unknown,
  pathLabel = 'manifest',
  active = new Set<object>(),
  depth = 0
): void {
  if (depth > 16) {
    throw new Error(`${pathLabel}: exceeds maximum nesting depth.`);
  }
  if (node === null || node === undefined) return;
  const nodeType = typeof node;
  if (
    nodeType === 'string' ||
    nodeType === 'number' ||
    nodeType === 'boolean'
  ) {
    return;
  }
  if (nodeType !== 'object') {
    throw new Error(`${pathLabel}: unsupported value type "${nodeType}".`);
  }

  const obj = node as object;
  if (active.has(obj)) {
    throw new Error(`${pathLabel}: circular reference detected.`);
  }

  if (Array.isArray(node)) {
    active.add(obj);
    try {
      for (let i = 0; i < node.length; i++) {
        if (!(i in node)) {
          throw new Error(`${pathLabel}[${i}]: sparse arrays are not allowed.`);
        }
        const desc = Object.getOwnPropertyDescriptor(node, i);
        if (desc && (desc.get !== undefined || desc.set !== undefined)) {
          throw new Error(
            `${pathLabel}[${i}]: accessor properties are not allowed.`
          );
        }
        assertSafeManifestGraph(
          node[i],
          `${pathLabel}[${i}]`,
          active,
          depth + 1
        );
      }
      for (const key of Object.getOwnPropertyNames(node)) {
        if (FORBIDDEN_PROTO_KEYS.has(key)) {
          throw new Error(`${pathLabel}: forbidden property "${key}".`);
        }
      }
      if (Object.getOwnPropertySymbols(node).length > 0) {
        throw new Error(`${pathLabel}: symbol properties are not allowed.`);
      }
    } finally {
      active.delete(obj);
    }
    return;
  }

  if (!isPlainObject(node)) {
    throw new Error(`${pathLabel}: expected a plain object.`);
  }

  if (Object.getOwnPropertySymbols(node).length > 0) {
    throw new Error(`${pathLabel}: symbol properties are not allowed.`);
  }

  active.add(obj);
  try {
    for (const key of Object.getOwnPropertyNames(node)) {
      if (FORBIDDEN_PROTO_KEYS.has(key)) {
        throw new Error(`${pathLabel}: forbidden property "${key}".`);
      }
      const desc = Object.getOwnPropertyDescriptor(node, key);
      if (!desc) continue;
      if (desc.get !== undefined || desc.set !== undefined) {
        throw new Error(
          `${pathLabel}.${key}: accessor properties are not allowed.`
        );
      }
      assertSafeManifestGraph(
        desc.value,
        `${pathLabel}.${key}`,
        active,
        depth + 1
      );
    }
  } finally {
    active.delete(obj);
  }
}

export function validateManifest(input: unknown): CloudRulesManifest {
  assertSafeManifestGraph(input);

  if (!isPlainObject(input)) {
    throw new Error('Manifest root must be a plain JSON object.');
  }

  for (const key of Object.getOwnPropertyNames(input)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      throw new Error(`Manifest contains unknown top-level key "${key}".`);
    }
  }

  if (input.version !== 1) {
    throw new Error(
      `Manifest "version" must be strictly 1 (received ${String(input.version)}).`
    );
  }

  if (!Array.isArray(input.rules)) {
    throw new Error('Manifest "rules" must be an array.');
  }

  if (input.rules.length > MAX_CLOUD_RULES) {
    throw new Error(
      `Manifest "rules" exceeds maximum of ${MAX_CLOUD_RULES} entries (received ${input.rules.length}).`
    );
  }

  const seenIds = new Set<string>();
  const validatedRules: ValidatedCloudRule[] = [];

  for (let index = 0; index < input.rules.length; index++) {
    const rawRule = input.rules[index];
    const label = `rules[${index}]`;
    if (!isPlainObject(rawRule)) {
      throw new Error(`${label} must be a plain object.`);
    }

    for (const key of Object.getOwnPropertyNames(rawRule)) {
      if (!ALLOWED_RULE_KEYS.has(key)) {
        throw new Error(`${label} contains unknown key "${key}".`);
      }
    }

    const rawId = rawRule.id;
    if (typeof rawId !== 'string') {
      throw new Error(`${label}.id must be a string.`);
    }
    if (hasAsciiControlChar(rawId) || !RULE_ID_PATTERN.test(rawId)) {
      throw new Error(
        `${label}.id ("${rawId}") must match /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/ with no control characters.`
      );
    }
    if (seenIds.has(rawId)) {
      throw new Error(`Duplicate rule id "${rawId}" at ${label}.`);
    }
    seenIds.add(rawId);

    const ruleLabel = `rule "${rawId}"`;

    const rawPattern = rawRule.pattern;
    if (typeof rawPattern !== 'string') {
      throw new Error(`${ruleLabel}: "pattern" must be a string.`);
    }
    if (hasAsciiControlChar(rawPattern)) {
      throw new Error(
        `${ruleLabel}: "pattern" must not contain NUL or ASCII control characters.`
      );
    }
    if (rawPattern.trim().length === 0) {
      throw new Error(`${ruleLabel}: "pattern" must be non-empty.`);
    }
    if (rawPattern.length > MAX_RULE_PACK_REGEX_LENGTH) {
      throw new Error(
        `${ruleLabel}: "pattern" length ${rawPattern.length} exceeds maximum of ${MAX_RULE_PACK_REGEX_LENGTH} characters.`
      );
    }

    const rawIsRegex = rawRule.isRegex;
    if (typeof rawIsRegex !== 'boolean') {
      throw new Error(`${ruleLabel}: "isRegex" must be a boolean.`);
    }
    if (rawIsRegex) {
      try {
        new RegExp(rawPattern, 'i');
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`${ruleLabel}: invalid regular expression: ${reason}`, {
          cause: error,
        });
      }
    }

    const rawScopes = rawRule.scopes;
    if (!Array.isArray(rawScopes) || rawScopes.length === 0) {
      throw new Error(
        `${ruleLabel}: "scopes" must be a non-empty array of ['text', 'bio', 'name', 'url'].`
      );
    }
    const dedupedScopes: KeywordMatchScope[] = [];
    const seenScopes = new Set<KeywordMatchScope>();
    for (let sIndex = 0; sIndex < rawScopes.length; sIndex++) {
      const scope = rawScopes[sIndex];
      if (
        typeof scope !== 'string' ||
        !VALID_SCOPES.has(scope as KeywordMatchScope)
      ) {
        throw new Error(
          `${ruleLabel}: invalid scope at scopes[${sIndex}] (${String(scope)}); allowed: text, bio, name, url.`
        );
      }
      const typedScope = scope as KeywordMatchScope;
      if (!seenScopes.has(typedScope)) {
        seenScopes.add(typedScope);
        dedupedScopes.push(typedScope);
      }
    }

    let langGroup: CloudKeywordLangGroup = 'universal';
    if (rawRule.langGroup !== undefined) {
      if (!isCloudKeywordLangGroup(rawRule.langGroup)) {
        throw new Error(
          `${ruleLabel}: invalid "langGroup" (${String(rawRule.langGroup)}); allowed: ${CLOUD_KEYWORD_LANG_GROUPS.join(', ')}.`
        );
      }
      langGroup = rawRule.langGroup;
    }

    const rawEnabled = rawRule.enabled;
    if (typeof rawEnabled !== 'boolean') {
      throw new Error(`${ruleLabel}: "enabled" must be a boolean.`);
    }

    let onlyInReplies = false;
    if (rawRule.onlyInReplies !== undefined) {
      if (typeof rawRule.onlyInReplies !== 'boolean') {
        throw new Error(`${ruleLabel}: "onlyInReplies" must be a boolean.`);
      }
      onlyInReplies = rawRule.onlyInReplies;
    }

    let maxFollowersExempt: number | undefined;
    if (
      rawRule.maxFollowersExempt !== undefined &&
      rawRule.maxFollowersExempt !== null
    ) {
      const v = rawRule.maxFollowersExempt;
      if (
        typeof v !== 'number' ||
        !Number.isSafeInteger(v) ||
        v < 1 ||
        v > MAX_FOLLOWERS_EXEMPT
      ) {
        throw new Error(
          `${ruleLabel}: "maxFollowersExempt" must be a positive safe integer between 1 and ${MAX_FOLLOWERS_EXEMPT} (received ${String(v)}).`
        );
      }
      maxFollowersExempt = v;
    }

    let note: string | undefined;
    if (rawRule.note !== undefined && rawRule.note !== null) {
      if (typeof rawRule.note !== 'string') {
        throw new Error(`${ruleLabel}: "note" must be a string.`);
      }
      if (hasAsciiControlChar(rawRule.note)) {
        throw new Error(
          `${ruleLabel}: "note" must not contain NUL or ASCII control characters.`
        );
      }
      if (rawRule.note.length > MAX_NOTE_LENGTH) {
        throw new Error(
          `${ruleLabel}: "note" length ${rawRule.note.length} exceeds maximum of ${MAX_NOTE_LENGTH} characters.`
        );
      }
      const trimmed = rawRule.note.trim();
      note = trimmed.length > 0 ? trimmed : undefined;
    }

    validatedRules.push({
      id: rawId,
      pattern: rawPattern,
      isRegex: rawIsRegex,
      scopes: dedupedScopes,
      onlyInReplies,
      ...(maxFollowersExempt !== undefined ? { maxFollowersExempt } : {}),
      langGroup,
      ...(note !== undefined ? { note } : {}),
      enabled: rawEnabled,
    });
  }

  return {
    version: 1,
    rules: validatedRules,
  };
}

export function readManifestFile(filePath: string): string {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`Manifest path "${filePath}" is not a regular file.`);
  }
  if (stat.size > MAX_MANIFEST_BYTES) {
    throw new Error(
      `Manifest size (${stat.size} bytes) exceeds maximum allowed limit of ${MAX_MANIFEST_BYTES} bytes.`
    );
  }
  return fs.readFileSync(filePath, 'utf8');
}

export function parseManifest(rawJson: string): CloudRulesManifest {
  if (typeof rawJson !== 'string') {
    throw new Error('Manifest content must be a UTF-8 string.');
  }
  const byteLength = Buffer.byteLength(rawJson, 'utf8');
  if (byteLength > MAX_MANIFEST_BYTES) {
    throw new Error(
      `Manifest size (${byteLength} bytes) exceeds maximum allowed limit of ${MAX_MANIFEST_BYTES} bytes.`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid manifest JSON: ${reason}`, { cause: error });
  }
  return validateManifest(parsed);
}

export function sqlStringLiteral(value: string): string {
  if (value.includes('\0')) {
    throw new Error('SQL string literals must not contain NUL bytes.');
  }
  const escaped = value.replace(/'/g, "''");
  // Wrangler 3.114.17 trimSqlQuery checks raw `sql.includes("BEGIN TRANSACTION")`
  // across the entire SQL file (including inside string literals). Splitting via
  // SQLite string concatenation preserves the exact runtime value while bypassing
  // Wrangler's naive transaction substring detector.
  const neutralized = escaped.replace(
    /begin\s+transaction/gi,
    (match) => `${match.slice(0, 5)}' || '${match.slice(5)}`
  );
  return `'${neutralized}'`;
}

export function buildSyncSql(
  manifest: CloudRulesManifest,
  nowMs = Date.now()
): string {
  if (typeof nowMs !== 'number' || !Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error(
      `Invalid timestamp for buildSyncSql: expected non-negative safe integer, received ${String(nowMs)}.`
    );
  }

  const validated = validateManifest(manifest);
  if (validated.rules.length === 0) {
    return 'DELETE FROM cloud_keywords;\n';
  }

  const statements: string[] = [];
  const escapedIds: string[] = [];

  for (const rule of validated.rules) {
    const idSql = sqlStringLiteral(rule.id);
    escapedIds.push(idSql);
    const patternSql = sqlStringLiteral(rule.pattern);
    const isRegexSql = rule.isRegex ? '1' : '0';
    const scopesSql = sqlStringLiteral(JSON.stringify(rule.scopes));
    const onlyInRepliesSql = rule.onlyInReplies ? '1' : '0';
    const maxFollowersSql =
      rule.maxFollowersExempt !== undefined
        ? String(rule.maxFollowersExempt)
        : 'NULL';
    const noteSql =
      rule.note !== undefined ? sqlStringLiteral(rule.note) : 'NULL';
    const enabledSql = rule.enabled ? '1' : '0';
    const updatedAtSql = String(nowMs);
    const langGroupSql = sqlStringLiteral(rule.langGroup);

    statements.push(
      `INSERT INTO cloud_keywords (id, pattern, is_regex, scopes, only_in_replies, max_followers_exempt, note, enabled, updated_at, lang_group)\n` +
        `VALUES (${idSql}, ${patternSql}, ${isRegexSql}, ${scopesSql}, ${onlyInRepliesSql}, ${maxFollowersSql}, ${noteSql}, ${enabledSql}, ${updatedAtSql}, ${langGroupSql})\n` +
        `ON CONFLICT(id) DO UPDATE SET\n` +
        `  pattern = excluded.pattern,\n` +
        `  is_regex = excluded.is_regex,\n` +
        `  scopes = excluded.scopes,\n` +
        `  only_in_replies = excluded.only_in_replies,\n` +
        `  max_followers_exempt = excluded.max_followers_exempt,\n` +
        `  note = excluded.note,\n` +
        `  enabled = excluded.enabled,\n` +
        `  updated_at = excluded.updated_at,\n` +
        `  lang_group = excluded.lang_group;`
    );
  }

  statements.push(
    `DELETE FROM cloud_keywords WHERE id NOT IN (${escapedIds.join(', ')});`
  );

  return `${statements.join('\n')}\n`;
}

export function validateApiUrl(rawUrl: string): string {
  if (hasAsciiControlChar(rawUrl)) {
    throw new Error(
      '--api-url must not contain NUL or ASCII control characters.'
    );
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('--api-url requires a non-empty http:// or https:// URL.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      trimmed.includes('@')
        ? 'Invalid --api-url value.'
        : `Invalid --api-url value: "${trimmed}".`
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `--api-url must use http:// or https:// protocol (received "${parsed.protocol}").`
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error('--api-url must not include embedded credentials.');
  }
  if (
    parsed.search ||
    parsed.hash ||
    trimmed.includes('?') ||
    trimmed.includes('#')
  ) {
    throw new Error(
      '--api-url must not include query parameters or hash fragments.'
    );
  }
  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${normalizedPath}`;
}

function readFlagValue(
  argv: readonly string[],
  index: number,
  flagName: string,
  inlineValue: string | undefined
): { value: string; nextIndex: number } {
  if (inlineValue !== undefined) {
    if (inlineValue.length === 0) {
      throw new Error(`Flag ${flagName} requires a non-empty value.`);
    }
    return { value: inlineValue, nextIndex: index };
  }

  const nextToken = argv[index + 1];
  if (
    nextToken === undefined ||
    nextToken.length === 0 ||
    nextToken === '--' ||
    KNOWN_CLI_FLAGS.has(nextToken.split('=')[0] ?? '')
  ) {
    throw new Error(`Flag ${flagName} requires a non-empty value.`);
  }
  return { value: nextToken, nextIndex: index + 1 };
}

export function parseCliArgs(
  argv: readonly string[],
  cwd = process.cwd()
): ParsedCliArgs {
  let command: 'push' | 'list' | undefined;
  let help = false;
  let dryRun = false;
  let local = false;
  let remote = false;
  let noRefresh = false;
  let rawFilePath: string | undefined;
  let rawPersistTo: string | undefined;
  let rawApiUrl: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') {
      continue;
    }

    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }

    if (!token.startsWith('-')) {
      if (command === undefined) {
        if (token === 'push' || token === 'list') {
          command = token;
          continue;
        }
        throw new Error(
          `Unknown command "${token}". Expected "push" or "list".`
        );
      }
      throw new Error(`Unexpected positional argument "${token}".`);
    }

    const eqIndex = token.indexOf('=');
    const flagName = eqIndex === -1 ? token : token.slice(0, eqIndex);
    const inlineValue = eqIndex === -1 ? undefined : token.slice(eqIndex + 1);

    switch (flagName) {
      case '--dry-run': {
        if (inlineValue !== undefined) {
          throw new Error('Flag --dry-run does not accept a value.');
        }
        dryRun = true;
        break;
      }
      case '--local': {
        if (inlineValue !== undefined) {
          throw new Error('Flag --local does not accept a value.');
        }
        local = true;
        break;
      }
      case '--remote': {
        if (inlineValue !== undefined) {
          throw new Error('Flag --remote does not accept a value.');
        }
        remote = true;
        break;
      }
      case '--no-refresh': {
        if (inlineValue !== undefined) {
          throw new Error('Flag --no-refresh does not accept a value.');
        }
        noRefresh = true;
        break;
      }
      case '--file': {
        const { value, nextIndex } = readFlagValue(
          argv,
          i,
          '--file',
          inlineValue
        );
        rawFilePath = value;
        i = nextIndex;
        break;
      }
      case '--persist-to': {
        const { value, nextIndex } = readFlagValue(
          argv,
          i,
          '--persist-to',
          inlineValue
        );
        rawPersistTo = value;
        i = nextIndex;
        break;
      }
      case '--api-url': {
        const { value, nextIndex } = readFlagValue(
          argv,
          i,
          '--api-url',
          inlineValue
        );
        rawApiUrl = value;
        i = nextIndex;
        break;
      }
      default:
        throw new Error(`Unknown flag "${token}".`);
    }
  }

  if (help) {
    return { help: true, ...(command ? { command } : {}) };
  }

  if (!command) {
    throw new Error('Missing command. Expected "push" or "list".');
  }

  if (local && remote) {
    throw new Error('Cannot specify both --local and --remote.');
  }

  if (rawPersistTo !== undefined && !local) {
    throw new Error('--persist-to requires --local.');
  }

  const filePath =
    rawFilePath !== undefined
      ? path.resolve(cwd, rawFilePath)
      : DEFAULT_MANIFEST_PATH;
  const persistTo =
    rawPersistTo !== undefined ? path.resolve(cwd, rawPersistTo) : undefined;

  if (command === 'list') {
    if (dryRun) {
      throw new Error('--dry-run is only supported for the "push" command.');
    }
    if (noRefresh) {
      throw new Error('--no-refresh is only supported for the "push" command.');
    }
    if (rawApiUrl !== undefined) {
      throw new Error('--api-url is only supported for the "push" command.');
    }
    if (rawFilePath !== undefined && (local || remote)) {
      throw new Error(
        'Cannot combine --file with --local or --remote for "list".'
      );
    }
    const source: 'file' | 'local' | 'remote' = local
      ? 'local'
      : remote
        ? 'remote'
        : 'file';
    return {
      help: false,
      command: 'list',
      source,
      filePath,
      ...(persistTo !== undefined ? { persistTo } : {}),
    };
  }

  const apiUrl =
    rawApiUrl !== undefined ? validateApiUrl(rawApiUrl) : API_BASE_URL;
  const target: 'local' | 'remote' = local ? 'local' : 'remote';

  return {
    help: false,
    command: 'push',
    target,
    dryRun,
    noRefresh,
    filePath,
    ...(persistTo !== undefined ? { persistTo } : {}),
    apiUrl,
  };
}

export function resolveWranglerBin(serverDir = SERVER_DIR): string {
  const req = createRequire(path.join(serverDir, 'package.json'));
  try {
    return req.resolve('wrangler/bin/wrangler.js');
  } catch {
    const fallback = path.join(
      serverDir,
      'node_modules',
      'wrangler',
      'bin',
      'wrangler.js'
    );
    if (fs.existsSync(fallback)) {
      return fallback;
    }
    throw new Error(`Unable to locate wrangler binary from ${serverDir}.`);
  }
}

function createDefaultWranglerRunner(
  serverDir: string,
  wranglerConfigPath: string
): WranglerRunner {
  return (args, options) => {
    if (options.target === 'local') {
      pinSingleCpuForLocalWorkerd();
    }
    const wranglerBin = resolveWranglerBin(serverDir);
    const result = spawnSync(
      process.execPath,
      [
        wranglerBin,
        'd1',
        'execute',
        DATABASE_NAME,
        '--config',
        wranglerConfigPath,
        ...args,
      ],
      {
        cwd: options.cwd,
        encoding: 'utf8',
        shell: false,
        maxBuffer: 20 * 1024 * 1024,
      }
    );
    return {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      ...(result.error ? { error: result.error } : {}),
    };
  };
}

function formatWranglerError(
  action: string,
  result: WranglerExecResult
): Error {
  if (result.error) {
    return new Error(
      `Failed to spawn wrangler during ${action}: ${result.error.message}`
    );
  }
  const combined = `${result.stderr}\n${result.stdout}`.trim();
  const needsMigrationHint =
    /no such column:\s*["'`]?lang_group\b/i.test(combined) ||
    /has no column named\s+["'`]?lang_group\b/i.test(combined) ||
    /no such table:\s*["'`]?cloud_keywords\b/i.test(combined);
  const hint = needsMigrationHint
    ? '\nHint: run "pnpm db:migrate:local" or "pnpm db:migrate:remote" first.'
    : '';
  return new Error(
    `Wrangler exited with code ${String(result.status)} during ${action}.${combined ? `\n${combined}` : ''}${hint}`
  );
}

export function parseWranglerD1Json(stdout: string): Record<string, unknown>[] {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('Wrangler returned empty output instead of D1 JSON.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse Wrangler D1 JSON output: ${reason}`, {
      cause: error,
    });
  }

  if (isPlainObject(parsed) && parsed.error !== undefined) {
    throw new Error(
      `Wrangler D1 query failed: ${JSON.stringify(parsed.error)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Unexpected Wrangler D1 JSON shape: expected an array.');
  }

  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (isPlainObject(entry) && entry.success === false) {
      throw new Error(
        `Wrangler D1 statement ${i} reported success=false: ${JSON.stringify(entry)}`
      );
    }
  }

  const first = parsed[0];
  if (!isPlainObject(first) || !Array.isArray(first.results)) {
    return [];
  }

  return first.results.filter((row): row is Record<string, unknown> =>
    isPlainObject(row)
  );
}

function parseScopesColumn(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item));
  }
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      return raw ? [raw] : [];
    }
  }
  return [];
}

function coerceEnabled(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const trimmed = raw.trim().toLowerCase();
    return trimmed === '1' || trimmed === 'true' || trimmed === 'yes';
  }
  return false;
}

export function formatRulesTable(rows: readonly CloudRuleSummaryRow[]): string {
  if (rows.length === 0) {
    return 'No cloud keyword rules found (0 rules).';
  }

  const headers = ['id', 'lang_group', 'enabled', 'scopes', 'note'] as const;
  const formattedRows = rows.map((row) => [
    row.id,
    row.langGroup || 'universal',
    row.enabled ? 'yes' : 'no',
    row.scopes.join(',') || '-',
    row.note.trim() ? row.note : '-',
  ]);

  const widths = headers.map((header, colIndex) =>
    Math.max(
      header.length,
      ...formattedRows.map((cells) => cells[colIndex]?.length ?? 0)
    )
  );

  const renderLine = (cells: readonly string[]): string =>
    cells
      .map((cell, colIndex) => cell.padEnd(widths[colIndex] ?? cell.length))
      .join(' | ')
      .trimEnd();

  const separator = widths.map((w) => '-'.repeat(w)).join('-+-');
  const enabledCount = rows.filter((r) => r.enabled).length;
  const disabledCount = rows.length - enabledCount;

  return [
    renderLine(headers),
    separator,
    ...formattedRows.map((cells) => renderLine(cells)),
    `Total: ${rows.length} rule(s) (${enabledCount} enabled, ${disabledCount} disabled).`,
  ].join('\n');
}

export async function refreshRemoteSnapshot(options: {
  apiUrl: string;
  pushStartedAtMs: number;
  fetchImpl?: typeof fetch;
  stderr?: (line: string) => void;
}): Promise<RefreshSnapshotResult> {
  const fetchFn = options.fetchImpl ?? fetch;
  const stderr = options.stderr ?? ((line: string) => console.error(line));
  const normalizedApiUrl = validateApiUrl(options.apiUrl);
  const url = `${normalizedApiUrl}/v1/snapshot.json?fresh=1`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to refresh snapshot at ${url}: ${reason}`, {
      cause: error,
    });
  }

  const bodyText = await response.text();
  if (response.status !== 200) {
    const snippet = bodyText.slice(0, 300).replace(/\s+/g, ' ').trim();
    throw new Error(
      `Snapshot refresh failed with HTTP ${response.status} from ${url}${snippet ? `: ${snippet}` : ''}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(bodyText);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Snapshot refresh returned invalid JSON: ${reason}`, {
      cause: error,
    });
  }

  if (
    !isPlainObject(data) ||
    typeof data.updatedAt !== 'string' ||
    !Array.isArray(data.cloudKeywords)
  ) {
    throw new Error(
      'Snapshot refresh returned malformed payload (missing "updatedAt" string or "cloudKeywords" array).'
    );
  }

  const returnedUpdatedAtMs = Date.parse(data.updatedAt);
  if (!Number.isFinite(returnedUpdatedAtMs)) {
    throw new Error(
      `Snapshot refresh returned invalid "updatedAt" timestamp: "${data.updatedAt}".`
    );
  }

  const keywordCount = data.cloudKeywords.length;
  if (returnedUpdatedAtMs < options.pushStartedAtMs) {
    stderr(
      `Warning: snapshot refresh returned HTTP 200 with stale updatedAt (${data.updatedAt}) older than push start (${new Date(options.pushStartedAtMs).toISOString()}). ` +
        `This typically means the per-IP ?fresh=1 rate limit (12/hour) served a cached snapshot; D1 rules were synced and the 10-minute cron trigger will rebuild the cache automatically.`
    );
    return {
      refreshed: false,
      stale: true,
      updatedAt: data.updatedAt,
      keywordCount,
    };
  }

  return {
    refreshed: true,
    stale: false,
    updatedAt: data.updatedAt,
    keywordCount,
  };
}

export function formatUsage(): string {
  return [
    'KeepXClean Maintainer Cloud Rules CLI',
    '',
    'Usage:',
    '  pnpm cloud-rules:push [--dry-run] [--local | --remote] [--file <path>] [--persist-to <dir>] [--no-refresh] [--api-url <url>]',
    '  pnpm cloud-rules:list [--file <path> | --local [--persist-to <dir>] | --remote]',
    '',
    'Commands:',
    '  push    Validate manifest and atomically sync cloud_keywords in D1 (defaults to --remote)',
    '  list    Print formatted summary table from manifest file (default) or D1 (--local / --remote)',
    '',
    'Options:',
    '  --dry-run             Validate manifest and print SQL without executing Wrangler (push only)',
    '  --local               Target local Wrangler D1 database',
    '  --remote              Target remote Cloudflare D1 database (default for push)',
    '  --file <path>         Manifest JSON path (default: apps/server/cloud-rules.json)',
    '  --persist-to <dir>    Local Wrangler D1 persistence directory (requires --local)',
    '  --no-refresh          Skip GET /v1/snapshot.json?fresh=1 after remote push (push only)',
    '  --api-url <url>       Override API base URL for snapshot refresh (default: https://api.keepxclean.com)',
    '  -h, --help            Show this usage guide',
  ].join('\n');
}

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export async function runCli(
  argv: readonly string[],
  deps: CliDependencies = {}
): Promise<CliRunResult> {
  const cwd = deps.cwd ?? process.cwd();
  const serverDir = deps.serverDir ?? SERVER_DIR;
  const wranglerConfigPath =
    deps.wranglerConfigPath ?? path.join(serverDir, 'wrangler.toml');
  const now = deps.now ?? (() => Date.now());
  const stdout = deps.stdout ?? ((line: string) => console.log(line));
  const stderr = deps.stderr ?? ((line: string) => console.error(line));
  const runWrangler =
    deps.runWrangler ??
    createDefaultWranglerRunner(serverDir, wranglerConfigPath);

  let parsedArgs: ParsedCliArgs;
  try {
    parsedArgs = parseCliArgs(argv, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    stderr('Run with --help for usage.');
    return { exitCode: 1 };
  }

  if (parsedArgs.help) {
    const usage = formatUsage();
    stdout(usage);
    return { exitCode: 0, output: usage };
  }

  if (parsedArgs.command === 'list') {
    try {
      let summaryRows: CloudRuleSummaryRow[];
      if (parsedArgs.source === 'file') {
        const rawJson = readManifestFile(parsedArgs.filePath);
        const manifest = parseManifest(rawJson);
        summaryRows = [...manifest.rules]
          .sort((a, b) => compareCodeUnits(a.id, b.id))
          .map((rule) => ({
            id: rule.id,
            langGroup: rule.langGroup,
            enabled: rule.enabled,
            scopes: rule.scopes,
            note: rule.note ?? '',
          }));
      } else {
        const wranglerArgs = [
          parsedArgs.source === 'local' ? '--local' : '--remote',
          ...(parsedArgs.persistTo
            ? ['--persist-to', parsedArgs.persistTo]
            : []),
          '--yes',
          '--json',
          '--command',
          LIST_D1_SQL,
        ];
        const execResult = runWrangler(wranglerArgs, {
          cwd: serverDir,
          target: parsedArgs.source,
        });
        if (execResult.error || execResult.status !== 0) {
          throw formatWranglerError(`list (${parsedArgs.source})`, execResult);
        }
        const d1Rows = parseWranglerD1Json(execResult.stdout);
        summaryRows = d1Rows.map((row) => ({
          id: String(row.id ?? ''),
          langGroup: String(row.lang_group ?? 'universal'),
          enabled: coerceEnabled(row.enabled),
          scopes: parseScopesColumn(row.scopes),
          note: typeof row.note === 'string' ? row.note : '',
        }));
      }

      const table = formatRulesTable(summaryRows);
      stdout(table);
      return { exitCode: 0, output: table };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stderr(`Error: ${message}`);
      return { exitCode: 1 };
    }
  }

  // command === 'push'
  try {
    const rawJson = readManifestFile(parsedArgs.filePath);
    const manifest = parseManifest(rawJson);
    const pushStartedAtMs = now();
    const sql = buildSyncSql(manifest, pushStartedAtMs);

    if (parsedArgs.dryRun) {
      stdout(
        `[dry-run] Validated ${manifest.rules.length} rule(s) from ${parsedArgs.filePath}. Generated SQL:\n${sql.trimEnd()}`
      );
      return { exitCode: 0, sql };
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kxc-cloud-rules-'));
    try {
      fs.chmodSync(tempDir, 0o700);
      const sqlFilePath = path.join(tempDir, 'sync.sql');
      fs.writeFileSync(sqlFilePath, sql, { encoding: 'utf8', mode: 0o600 });

      const wranglerArgs = [
        parsedArgs.target === 'local' ? '--local' : '--remote',
        ...(parsedArgs.persistTo
          ? ['--persist-to', parsedArgs.persistTo]
          : []),
        '--yes',
        '--json',
        '--file',
        sqlFilePath,
      ];

      const execResult = runWrangler(wranglerArgs, {
        cwd: serverDir,
        target: parsedArgs.target,
      });
      if (execResult.error || execResult.status !== 0) {
        throw formatWranglerError(`push (${parsedArgs.target})`, execResult);
      }
      parseWranglerD1Json(execResult.stdout);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    stdout(
      `Synced ${manifest.rules.length} cloud keyword rule(s) to ${DATABASE_NAME} (${parsedArgs.target}).`
    );

    let refresh: RefreshSnapshotResult | undefined;
    if (parsedArgs.target === 'remote' && !parsedArgs.noRefresh) {
      refresh = await refreshRemoteSnapshot({
        apiUrl: parsedArgs.apiUrl,
        pushStartedAtMs,
        fetchImpl: deps.fetchImpl,
        stderr,
      });
      if (refresh.refreshed) {
        stdout(
          `Snapshot refreshed (${refresh.updatedAt}, ${refresh.keywordCount} cloud keyword rules).`
        );
      }
    }

    return { exitCode: 0, sql, ...(refresh ? { refresh } : {}) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return { exitCode: 1 };
  }
}

function isDirectExecution(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return (
      fs.realpathSync(invoked) ===
      fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return path.resolve(invoked) === path.resolve(fileURLToPath(import.meta.url));
  }
}

if (isDirectExecution()) {
  runCli(process.argv.slice(2))
    .then((result) => {
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    });
}
