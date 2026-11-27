import {
  MAX_RULE_PACK_BLOCKED_UIDS,
  MAX_RULE_PACK_BYTES,
  MAX_RULE_PACK_DOMAINS,
  MAX_RULE_PACK_KEYWORDS,
  MAX_RULE_PACK_REGEX_LENGTH,
} from './constants';
import { isValidDomainRule, normalizeDomainRule } from './engine';
import { isSupportedLocale } from './i18n';
import { isCloudKeywordLangGroup } from './presets';
import {
  RULE_PACK_FORMAT,
  type AccountListEntry,
  type BlockReasonTag,
  type DomainRuleItem,
  type KeywordMatchScope,
  type KeywordRuleItem,
  type RulePackPayload,
} from './types';

const textEncoder = new TextEncoder();

const PROTO_POLLUTION_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const FORBIDDEN_PACK_KEYS = new Set([
  'whitelistUids',
  'localBlocklistUids',
  'customApiBaseUrl',
  'syncNativeXBlock',
  'enableCrowdReport',
  'enableSync',
  'enableCloudKeywords',
  'disabledCloudKeywordIds',
  'enabledCloudLangGroups',
  'rules',
  'preset',
  'interceptionMode',
  'sceneModes',
  'installedPacks',
  'onboardingDismissed',
  'exemptFollowing',
  'profileSceneBadgeOnly',
  'theme',
  'enabled',
  '__proto__',
  'constructor',
  'prototype',
]);

const PACK_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const NUMERIC_UID_RE = /^\d{1,25}$/;
const ISO_DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|([+-])(\d{2}):?(\d{2}))?)?$/;
const MAX_GRAPH_DEPTH = 20;
const MAX_GRAPH_NODES = 50_000;
const MAX_GRAPH_EST_CHARS = MAX_RULE_PACK_BYTES * 2;

const VALID_SCOPES = new Set<KeywordMatchScope>(['text', 'bio', 'name', 'url']);
const VALID_TAGS = new Set<BlockReasonTag>([
  'spam',
  'nsfw',
  'scam',
  'ad',
  'bot',
  'other',
]);

/**
 * Result returned by static regex safety analysis (`checkRegexSafety`).
 */
export interface RegexSafetyResult {
  safe: boolean;
  reason?: string;
}

const MAX_REGEX_NESTING_DEPTH = 24;
const MAX_FINITE_QUANTIFIER_BOUND = 1000;
const MAX_NON_ASCII_RANGES = 32;
const MAX_RULE_PACK_REGEX_COST_BUDGET = 250;
const NON_ASCII_MIN = 0x80;
const NON_ASCII_MAX = 0xffff;

const MAX_NFA_STATES = 512;
const MAX_NFA_EDGES = 2048;
const MAX_CYCLE_SCC_STATES = 24;
const MAX_CYCLIC_SCCS = 28;
const MAX_MULTI_STATE_CYCLIC_SCCS = 4;
const MAX_PATH_MULT = 4096;
const MAX_DAG_PATH_MULT = 64;
const MAX_DAG_TOTAL_WORK = 4096;
const MAX_DAG_PRODUCT_PAIRS = 4096;
const MAX_DAG_PRODUCT_STEPS = 16384;
const MAX_DAG_PREFIX_STEPS = 4096;
const MAX_LEADING_WORK = 256;
const MAX_IDA_TOTAL_STEPS = 4096;
const MAX_CAPTURES_IN_REPEATING = 2;
const MAX_CAPTURES_IN_CYCLIC = 8;
const MAX_LOOKAROUNDS_PER_REGEX = 2;
const MAX_LOOKBEHINDS_PER_REGEX = 1;
const MAX_TOTAL_LOOKAROUND_STATES = 28;
const MAX_LOOKAHEAD_BODY_STATES = 32;
const MAX_LOOKAHEAD_STATES = 24;
const MAX_LOOKBEHIND_STATES = 16;
const MAX_REPEATING_LOOKAHEAD_STATES = 10;
const MAX_REPEATING_LOOKAHEAD_DEPTH = 4;
const MAX_REPEATING_LOOKAHEAD_BOUND = 16;

type NonAsciiMode = 'none' | 'include' | 'exclude' | 'unknown';
type CharRange = readonly [number, number];

interface CharSet {
  ascii0: number;
  ascii1: number;
  ascii2: number;
  ascii3: number;
  asciiUnknown: boolean;
  nonAsciiMode: NonAsciiMode;
  nonAsciiRanges: CharRange[];
}

function makeCharSet(
  ascii0: number,
  ascii1: number,
  ascii2: number,
  ascii3: number,
  asciiUnknown: boolean,
  nonAsciiMode: NonAsciiMode,
  nonAsciiRanges: CharRange[]
): CharSet {
  return {
    ascii0,
    ascii1,
    ascii2,
    ascii3,
    asciiUnknown,
    nonAsciiMode,
    nonAsciiRanges,
  };
}

function makeEmptyCharSet(): CharSet {
  return makeCharSet(0, 0, 0, 0, false, 'none', []);
}

function addAsciiBit(cs: CharSet, code: number): void {
  if (code < 32) {
    cs.ascii0 = (cs.ascii0 | (1 << code)) >>> 0;
  } else if (code < 64) {
    cs.ascii1 = (cs.ascii1 | (1 << (code - 32))) >>> 0;
  } else if (code < 96) {
    cs.ascii2 = (cs.ascii2 | (1 << (code - 64))) >>> 0;
  } else if (code < 128) {
    cs.ascii3 = (cs.ascii3 | (1 << (code - 96))) >>> 0;
  }
}

function mergeRanges(
  a: readonly CharRange[],
  b: readonly CharRange[]
): CharRange[] | null {
  const out: CharRange[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    let next: CharRange;
    if (j >= b.length || (i < a.length && a[i]![0] <= b[j]![0])) {
      next = a[i]!;
      i++;
    } else {
      next = b[j]!;
      j++;
    }
    if (out.length === 0) {
      out.push([next[0], next[1]]);
    } else {
      const prev = out[out.length - 1]!;
      if (next[0] <= prev[1] + 1) {
        if (next[1] > prev[1]) {
          out[out.length - 1] = [prev[0], next[1]];
        }
      } else {
        out.push([next[0], next[1]]);
        if (out.length > MAX_NON_ASCII_RANGES) {
          return null;
        }
      }
    }
  }
  return out;
}

function intersectRanges(
  a: readonly CharRange[],
  b: readonly CharRange[]
): CharRange[] {
  const out: CharRange[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ra = a[i]!;
    const rb = b[j]!;
    const lo = Math.max(ra[0], rb[0]);
    const hi = Math.min(ra[1], rb[1]);
    if (lo <= hi) {
      out.push([lo, hi]);
    }
    if (ra[1] < rb[1]) {
      i++;
    } else {
      j++;
    }
  }
  return out;
}

function subtractRanges(
  a: readonly CharRange[],
  b: readonly CharRange[]
): CharRange[] {
  const out: CharRange[] = [];
  let j = 0;
  for (let i = 0; i < a.length; i++) {
    let curLo = a[i]![0];
    const curHi = a[i]![1];
    while (j < b.length && b[j]![1] < curLo) {
      j++;
    }
    let k = j;
    while (k < b.length && b[k]![0] <= curHi) {
      const bLo = b[k]![0];
      const bHi = b[k]![1];
      if (bLo > curLo) {
        out.push([curLo, bLo - 1]);
      }
      if (bHi >= curHi) {
        curLo = curHi + 1;
        break;
      }
      curLo = bHi + 1;
      k++;
    }
    if (curLo <= curHi) {
      out.push([curLo, curHi]);
    }
  }
  return out;
}

function rangesOverlap(
  a: readonly CharRange[],
  b: readonly CharRange[]
): boolean {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ra = a[i]!;
    const rb = b[j]!;
    if (ra[0] <= rb[1] && rb[0] <= ra[1]) return true;
    if (ra[1] < rb[1]) {
      i++;
    } else {
      j++;
    }
  }
  return false;
}

function isRangeSubset(
  sub: readonly CharRange[],
  sup: readonly CharRange[]
): boolean {
  let j = 0;
  for (let i = 0; i < sub.length; i++) {
    const [lo, hi] = sub[i]!;
    while (j < sup.length && sup[j]![1] < lo) {
      j++;
    }
    if (j >= sup.length || sup[j]![0] > lo || sup[j]![1] < hi) {
      return false;
    }
  }
  return true;
}

function isFullNonAscii(ranges: readonly CharRange[]): boolean {
  return (
    ranges.length === 1 &&
    ranges[0]![0] === NON_ASCII_MIN &&
    ranges[0]![1] === NON_ASCII_MAX
  );
}

function addNonAsciiRange(cs: CharSet, rawLo: number, rawHi: number): void {
  const lo = Math.max(rawLo, NON_ASCII_MIN);
  const hi = Math.min(rawHi, NON_ASCII_MAX);
  if (lo > hi || cs.nonAsciiMode === 'unknown') return;

  if (cs.nonAsciiMode === 'none') {
    if (lo === NON_ASCII_MIN && hi === NON_ASCII_MAX) {
      cs.nonAsciiMode = 'exclude';
      cs.nonAsciiRanges = [];
    } else {
      cs.nonAsciiMode = 'include';
      cs.nonAsciiRanges = [[lo, hi]];
    }
    return;
  }

  if (cs.nonAsciiMode === 'include') {
    const merged = mergeRanges(cs.nonAsciiRanges, [[lo, hi]]);
    if (merged === null) {
      cs.nonAsciiMode = 'unknown';
      cs.nonAsciiRanges = [];
    } else if (isFullNonAscii(merged)) {
      cs.nonAsciiMode = 'exclude';
      cs.nonAsciiRanges = [];
    } else {
      cs.nonAsciiRanges = merged;
    }
    return;
  }

  // nonAsciiMode === 'exclude'
  if (cs.nonAsciiRanges.length === 0) return;
  const diff = subtractRanges(cs.nonAsciiRanges, [[lo, hi]]);
  if (diff.length > MAX_NON_ASCII_RANGES) {
    cs.nonAsciiMode = 'unknown';
    cs.nonAsciiRanges = [];
  } else {
    cs.nonAsciiRanges = diff;
  }
}

interface NonAsciiFoldTable {
  readonly codes: Uint16Array;
  readonly partnerOff: Uint16Array;
  readonly partnerFlat: Uint16Array;
  readonly shortSrcLo: Uint16Array;
  readonly shortSrcHi: Uint16Array;
  readonly shortMaxHi: Uint16Array;
  readonly shortDelta: Int32Array;
  readonly longSrcLo: Uint16Array;
  readonly longSrcHi: Uint16Array;
  readonly longMaxHi: Uint16Array;
  readonly longDelta: Int32Array;
  readonly longChunkMinP: Uint16Array;
  readonly longChunkMaxP: Uint16Array;
  readonly longChunkMaxHi: Uint16Array;
}

let cachedNonAsciiFoldTable: NonAsciiFoldTable | null = null;
let foldRunScratch = new Uint32Array(512);
let rawClassRangeScratch = new Uint32Array(512);
const complexFoldScratch = new Uint32Array(8);

function sortUint32Sub(arr: Uint32Array, len: number): void {
  if (len <= 128) {
    let gap = len > 24 ? 13 : 1;
    for (;;) {
      for (let i = gap; i < len; i++) {
        const v = arr[i]!;
        let j = i - gap;
        while (j >= 0 && arr[j]! > v) {
          arr[j + gap] = arr[j]!;
          j -= gap;
        }
        arr[j + gap] = v;
      }
      if (gap === 1) break;
      gap = gap === 13 ? 4 : 1;
    }
  } else {
    arr.subarray(0, len).sort();
  }
}

/**
 * Lazily builds the exact ECMA-262 non-`/u` `/i` BMP non-ASCII case-folding equivalence table
 * (`0x80..0xFFFF`). Uses `Canonicalize(ch)` semantics: `toUpperCase()` single code unit `>= 0x80`
 * groups all code units sharing a canonical value (including multi-way folds like Greek sigma).
 * CJK, Hiragana, Katakana, and Hangul have 0 entries, keeping wide CJK ranges `O(log N)` exact.
 */
function getNonAsciiFoldTable(): NonAsciiFoldTable {
  if (cachedNonAsciiFoldTable !== null) {
    return cachedNonAsciiFoldTable;
  }
  const groups = new Map<number, number[]>();
  const blockCodes = new Array<number>(256);

  for (let block = NON_ASCII_MIN; block <= NON_ASCII_MAX; block += 256) {
    const end = Math.min(block + 255, NON_ASCII_MAX);
    if (block >= 0xd800 && end <= 0xdfff) continue;
    let len = 0;
    for (let c = block; c <= end; c++) {
      blockCodes[len++] = c >= 0xd800 && c <= 0xdfff ? 0x20 : c;
    }
    const str = String.fromCharCode(
      ...(len === 256 ? blockCodes : blockCodes.slice(0, len))
    );
    const upperStr = str.toUpperCase();
    if (upperStr === str) continue;

    if (upperStr.length === len) {
      for (let i = 0; i < len; i++) {
        const c = block + i;
        if (c >= 0xd800 && c <= 0xdfff) continue;
        const uc = upperStr.charCodeAt(i);
        if (uc >= NON_ASCII_MIN && uc !== c) {
          let g = groups.get(uc);
          if (!g) {
            g = [uc, c];
            groups.set(uc, g);
          } else {
            g.push(c);
          }
        }
      }
    } else {
      for (let c = block; c <= end; c++) {
        if (c >= 0xd800 && c <= 0xdfff) continue;
        const ch = String.fromCharCode(c);
        const u = ch.toUpperCase();
        if (u !== ch && u.length === 1) {
          const uc = u.charCodeAt(0);
          if (uc >= NON_ASCII_MIN && uc !== c) {
            let g = groups.get(uc);
            if (!g) {
              g = [uc, c];
              groups.set(uc, g);
            } else {
              g.push(c);
            }
          }
        }
      }
    }
  }

  const entries: Array<readonly [number, readonly number[]]> = [];
  for (const g of groups.values()) {
    for (let i = 0; i < g.length; i++) {
      const code = g[i]!;
      const partners: number[] = [];
      for (let j = 0; j < g.length; j++) {
        if (j !== i) partners.push(g[j]!);
      }
      entries.push([code, partners]);
    }
  }
  entries.sort((a, b) => a[0] - b[0]);

  const codes = new Uint16Array(entries.length);
  const partnerOff = new Uint16Array(entries.length + 1);
  let totalPartners = 0;
  for (let i = 0; i < entries.length; i++) {
    totalPartners += entries[i]![1].length;
  }
  const partnerFlat = new Uint16Array(totalPartners);
  let pWrite = 0;
  for (let i = 0; i < entries.length; i++) {
    codes[i] = entries[i]![0];
    partnerOff[i] = pWrite;
    const ps = entries[i]![1];
    for (let j = 0; j < ps.length; j++) {
      partnerFlat[pWrite++] = ps[j]!;
    }
  }
  partnerOff[entries.length] = pWrite;

  // Compress all |partner - code| > 1 pairs into exact contiguous linear runs [srcLo, srcHi, delta],
  // partitioned into shortRuns (|delta| <= 256, permitting boundary-only scanning on wide ranges)
  // and longRuns (|delta| > 256, permitting clean 16-run chunk skips without short-run interference).
  // Pairs with |partner - code| === 1 can only leave a query range [rLo, rHi] at the exact endpoints rLo / rHi.
  const shortDistRuns: Array<[number, number, number]> = [];
  const longDistRuns: Array<[number, number, number]> = [];
  for (let i = 0; i < entries.length; i++) {
    const c = entries[i]![0];
    const ps = entries[i]![1];
    for (let j = 0; j < ps.length; j++) {
      const p = ps[j]!;
      const delta = p - c;
      if (delta === 1 || delta === -1) continue;
      const targetRuns = delta >= -256 && delta <= 256 ? shortDistRuns : longDistRuns;
      const last = targetRuns.length > 0 ? targetRuns[targetRuns.length - 1] : undefined;
      if (last !== undefined && c === last[1] + 1 && delta === last[2]) {
        last[1] = c;
      } else {
        targetRuns.push([c, c, delta]);
      }
    }
  }
  const numShort = shortDistRuns.length;
  const shortSrcLo = new Uint16Array(numShort);
  const shortSrcHi = new Uint16Array(numShort);
  const shortMaxHi = new Uint16Array(numShort);
  const shortDelta = new Int32Array(numShort);
  let shortMaxHiSoFar = 0;
  for (let i = 0; i < numShort; i++) {
    const r = shortDistRuns[i]!;
    shortSrcLo[i] = r[0];
    shortSrcHi[i] = r[1];
    if (r[1] > shortMaxHiSoFar) shortMaxHiSoFar = r[1];
    shortMaxHi[i] = shortMaxHiSoFar;
    shortDelta[i] = r[2];
  }

  const numLong = longDistRuns.length;
  const longSrcLo = new Uint16Array(numLong);
  const longSrcHi = new Uint16Array(numLong);
  const longMaxHi = new Uint16Array(numLong);
  const longDelta = new Int32Array(numLong);
  let longMaxHiSoFar = 0;
  for (let i = 0; i < numLong; i++) {
    const r = longDistRuns[i]!;
    longSrcLo[i] = r[0];
    longSrcHi[i] = r[1];
    if (r[1] > longMaxHiSoFar) longMaxHiSoFar = r[1];
    longMaxHi[i] = longMaxHiSoFar;
    longDelta[i] = r[2];
  }

  const numLongChunks = (numLong + 15) >>> 4;
  const longChunkMinP = new Uint16Array(numLongChunks);
  const longChunkMaxP = new Uint16Array(numLongChunks);
  const longChunkMaxHi = new Uint16Array(numLongChunks);
  for (let c = 0; c < numLongChunks; c++) {
    const start = c << 4;
    const end = start + 16 < numLong ? start + 16 : numLong;
    let mnP = 0xffff, mxP = 0, mxHi = 0;
    for (let i = start; i < end; i++) {
      const sLo = longSrcLo[i]!, sHi = longSrcHi[i]!, d = longDelta[i]!;
      const pLo = sLo + d, pHi = sHi + d;
      if (pLo < mnP) mnP = pLo;
      if (pHi > mxP) mxP = pHi;
      if (sHi > mxHi) mxHi = sHi;
    }
    longChunkMinP[c] = mnP;
    longChunkMaxP[c] = mxP;
    longChunkMaxHi[c] = mxHi;
  }

  cachedNonAsciiFoldTable = {
    codes, partnerOff, partnerFlat,
    shortSrcLo, shortSrcHi, shortMaxHi, shortDelta,
    longSrcLo, longSrcHi, longMaxHi, longDelta,
    longChunkMinP, longChunkMaxP, longChunkMaxHi,
  };
  return cachedNonAsciiFoldTable;
}

function lowerBoundUint16(arr: Uint16Array, target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]! < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function setAsciiRangeBits(cs: CharSet, lo: number, hi: number): void {
  const w0Lo = lo > 0 ? lo : 0;
  const w0Hi = hi < 31 ? hi : 31;
  if (w0Lo <= w0Hi) {
    cs.ascii0 = (cs.ascii0 | ((0xffffffff >>> (31 - (w0Hi - w0Lo))) << w0Lo)) >>> 0;
  }
  const w1Lo = lo > 32 ? lo : 32;
  const w1Hi = hi < 63 ? hi : 63;
  if (w1Lo <= w1Hi) {
    cs.ascii1 = (cs.ascii1 | ((0xffffffff >>> (31 - (w1Hi - w1Lo))) << (w1Lo - 32))) >>> 0;
  }
  const w2Lo = lo > 64 ? lo : 64;
  const w2Hi = hi < 95 ? hi : 95;
  if (w2Lo <= w2Hi) {
    cs.ascii2 = (cs.ascii2 | ((0xffffffff >>> (31 - (w2Hi - w2Lo))) << (w2Lo - 64))) >>> 0;
  }
  const w3Lo = lo > 96 ? lo : 96;
  const w3Hi = hi < 127 ? hi : 127;
  if (w3Lo <= w3Hi) {
    cs.ascii3 = (cs.ascii3 | ((0xffffffff >>> (31 - (w3Hi - w3Lo))) << (w3Lo - 96))) >>> 0;
  }
}

function foldAsciiBitsCI(cs: CharSet): void {
  const alphaBits = (cs.ascii2 | cs.ascii3) & 0x07fffffe;
  cs.ascii2 = (cs.ascii2 | alphaBits) >>> 0;
  cs.ascii3 = (cs.ascii3 | alphaBits) >>> 0;
}

function addCodeUnitCS(cs: CharSet, code: number): void {
  if (code < 0 || code > NON_ASCII_MAX) return;
  if (code <= 0x7f) {
    addAsciiBit(cs, code);
    return;
  }
  addNonAsciiRange(cs, code, code);
}

function addCodeUnitCI(cs: CharSet, code: number): void {
  if (code < 0 || code > NON_ASCII_MAX) return;
  if (code <= 0x7f) {
    addAsciiBit(cs, code);
    if (code >= 0x41 && code <= 0x5a) {
      addAsciiBit(cs, code + 32);
    } else if (code >= 0x61 && code <= 0x7a) {
      addAsciiBit(cs, code - 32);
    }
    return;
  }

  addNonAsciiRange(cs, code, code);
  if (isNonAsciiUnknown(cs)) return;
  if (code < 0xd800 || code > 0xdfff) {
    const { codes, partnerOff, partnerFlat } = getNonAsciiFoldTable();
    const idx = lowerBoundUint16(codes, code);
    if (idx < codes.length && codes[idx] === code) {
      const pEnd = partnerOff[idx + 1]!;
      for (let pi = partnerOff[idx]!; pi < pEnd; pi++) {
        const p = partnerFlat[pi]!;
        addNonAsciiRange(cs, p, p);
        if (isNonAsciiUnknown(cs)) return;
      }
    }
  }
}

function addCodeUnit(cs: CharSet, code: number, ignoreCase: boolean): void {
  if (ignoreCase) {
    addCodeUnitCI(cs, code);
  } else {
    addCodeUnitCS(cs, code);
  }
}

function isNonAsciiUnknown(cs: CharSet): boolean {
  return cs.nonAsciiMode === 'unknown';
}

function pushFoldRunScratch(len: number, pLo: number, pHi: number): number {
  if (len >= foldRunScratch.length) {
    const next = new Uint32Array(foldRunScratch.length * 2);
    next.set(foldRunScratch);
    foldRunScratch = next;
  }
  foldRunScratch[len] = ((pLo << 16) | pHi) >>> 0;
  return len + 1;
}

function addEndpointPartnersToScratch(
  table: NonAsciiFoldTable,
  prLen: number,
  code: number,
  rLo: number,
  rHi: number
): number {
  if (code >= 0xd800 && code <= 0xdfff) return prLen;
  const { codes, partnerOff, partnerFlat } = table;
  const idx = lowerBoundUint16(codes, code);
  if (idx < codes.length && codes[idx] === code) {
    const pEnd = partnerOff[idx + 1]!;
    for (let pi = partnerOff[idx]!; pi < pEnd; pi++) {
      const p = partnerFlat[pi]!;
      if (p < rLo || p > rHi) prLen = pushFoldRunScratch(prLen, p, p);
    }
  }
  return prLen;
}

function buildFoldedNonAsciiCharSet(rawPacked: Uint32Array, rawLen: number): CharSet {
  const out = makeEmptyCharSet();
  if (rawLen === 0) return out;
  if (rawLen > 1) {
    sortUint32Sub(rawPacked, rawLen);
  }
  let mergedLen = 0;
  let first = rawPacked[0]!;
  let curLo = first >>> 16;
  let curHi = first & 0xffff;
  for (let i = 1; i < rawLen; i++) {
    const pk = rawPacked[i]!;
    const rLo = pk >>> 16;
    const rHi = pk & 0xffff;
    if (rLo <= curHi + 1) {
      if (rHi > curHi) curHi = rHi;
    } else {
      rawPacked[mergedLen++] = ((curLo << 16) | curHi) >>> 0;
      curLo = rLo;
      curHi = rHi;
    }
  }
  rawPacked[mergedLen++] = ((curLo << 16) | curHi) >>> 0;

  if (mergedLen === 1 && curLo === NON_ASCII_MIN && curHi === NON_ASCII_MAX) {
    out.nonAsciiMode = 'exclude';
    return out;
  }

  const table = getNonAsciiFoldTable();
  const {
    shortSrcLo, shortSrcHi, shortMaxHi, shortDelta,
    longSrcLo, longSrcHi, longMaxHi, longDelta,
    longChunkMinP, longChunkMaxP, longChunkMaxHi,
  } = table;
  const numShort = shortSrcLo.length;
  const numLong = longSrcLo.length;
  let prLen = 0;
  for (let ri = 0; ri < mergedLen; ri++) {
    const pk = rawPacked[ri]!;
    const rLo = pk >>> 16;
    const rHi = pk & 0xffff;
    prLen = pushFoldRunScratch(prLen, rLo, rHi);
    if (rLo === rHi) {
      prLen = addEndpointPartnersToScratch(table, prLen, rLo, rLo, rHi);
      continue;
    }
    // Check exact endpoints for +-1 adjacent fold partners (interior +-1 partners lie within [rLo, rHi])
    prLen = addEndpointPartnersToScratch(table, prLen, rLo, rLo, rHi);
    prLen = addEndpointPartnersToScratch(table, prLen, rHi, rLo, rHi);
    // Scan short-delta runs (|delta| <= 256): for wide ranges (rHi - rLo > 512), interior runs
    // strictly inside [rLo + 256, rHi - 256] map entirely inside [rLo, rHi] and can be skipped exactly.
    if (rHi - rLo <= 512) {
      for (let i = lowerBoundUint16(shortMaxHi, rLo); i < numShort && shortSrcLo[i]! <= rHi; i++) {
        const sHi = shortSrcHi[i]!;
        if (sHi < rLo) continue;
        const sLo = shortSrcLo[i]!;
        const a = rLo > sLo ? rLo : sLo;
        const b = rHi < sHi ? rHi : sHi;
        const d = shortDelta[i]!;
        const pLo = a + d;
        const pHi = b + d;
        if (pLo < rLo || pHi > rHi) {
          prLen = pushFoldRunScratch(prLen, pLo, pHi);
        }
      }
    } else {
      const leftLim = rLo + 255;
      let i = lowerBoundUint16(shortMaxHi, rLo);
      for (; i < numShort && shortSrcLo[i]! <= leftLim; i++) {
        const sHi = shortSrcHi[i]!;
        if (sHi < rLo) continue;
        const sLo = shortSrcLo[i]!;
        const a = rLo > sLo ? rLo : sLo;
        const b = rHi < sHi ? rHi : sHi;
        const d = shortDelta[i]!;
        const pLo = a + d;
        const pHi = b + d;
        if (pLo < rLo || pHi > rHi) {
          prLen = pushFoldRunScratch(prLen, pLo, pHi);
        }
      }
      const rightStart = lowerBoundUint16(shortMaxHi, rHi - 255);
      if (rightStart > i) i = rightStart;
      for (; i < numShort && shortSrcLo[i]! <= rHi; i++) {
        const sHi = shortSrcHi[i]!;
        if (sHi < rLo) continue;
        const sLo = shortSrcLo[i]!;
        const a = rLo > sLo ? rLo : sLo;
        const b = rHi < sHi ? rHi : sHi;
        const d = shortDelta[i]!;
        const pLo = a + d;
        const pHi = b + d;
        if (pLo < rLo || pHi > rHi) {
          prLen = pushFoldRunScratch(prLen, pLo, pHi);
        }
      }
    }
    // Scan long-delta runs (|delta| > 256) with 16-run chunk skips
    for (let i = lowerBoundUint16(longMaxHi, rLo); i < numLong && longSrcLo[i]! <= rHi; i++) {
      if ((i & 15) === 0) {
        const c = i >>> 4;
        const chunkEnd = i + 16 < numLong ? i + 16 : numLong;
        if (longSrcLo[i]! >= rLo && longChunkMaxHi[c]! <= rHi && longChunkMinP[c]! >= rLo && longChunkMaxP[c]! <= rHi) {
          i = chunkEnd - 1;
          continue;
        }
      }
      const sHi = longSrcHi[i]!;
      if (sHi < rLo) continue;
      const sLo = longSrcLo[i]!;
      const a = rLo > sLo ? rLo : sLo;
      const b = rHi < sHi ? rHi : sHi;
      const d = longDelta[i]!;
      const pLo = a + d;
      const pHi = b + d;
      if (pLo < rLo || pHi > rHi) {
        prLen = pushFoldRunScratch(prLen, pLo, pHi);
      }
    }
  }

  if (prLen > 1) {
    sortUint32Sub(foldRunScratch, prLen);
  }
  const finalRanges: CharRange[] = [];
  first = foldRunScratch[0]!;
  let runLo = first >>> 16;
  let runHi = first & 0xffff;
  for (let i = 1; i < prLen; i++) {
    const pk = foldRunScratch[i]!;
    const pLo = pk >>> 16;
    const pHi = pk & 0xffff;
    if (pLo <= runHi + 1) {
      if (pHi > runHi) runHi = pHi;
    } else {
      finalRanges.push([runLo, runHi]);
      if (finalRanges.length >= MAX_NON_ASCII_RANGES) {
        out.nonAsciiMode = 'unknown';
        return out;
      }
      runLo = pLo;
      runHi = pHi;
    }
  }
  finalRanges.push([runLo, runHi]);

  if (isFullNonAscii(finalRanges)) {
    out.nonAsciiMode = 'exclude';
  } else {
    out.nonAsciiMode = 'include';
    out.nonAsciiRanges = finalRanges;
  }
  return out;
}

function addRangeCI(cs: CharSet, lo: number, hi: number): void {
  if (lo > hi) return;
  if (lo <= 0x7f) {
    setAsciiRangeBits(cs, lo, hi < 0x7f ? hi : 0x7f);
    foldAsciiBitsCI(cs);
  }
  if (hi >= NON_ASCII_MIN) {
    const nonLo = lo > NON_ASCII_MIN ? lo : NON_ASCII_MIN;
    const nonHi = hi < NON_ASCII_MAX ? hi : NON_ASCII_MAX;
    if (nonLo === nonHi) {
      addCodeUnitCI(cs, nonLo);
      return;
    }
    rawClassRangeScratch[0] = ((nonLo << 16) | nonHi) >>> 0;
    const folded = buildFoldedNonAsciiCharSet(rawClassRangeScratch, 1);
    const combined = unionCharSet(cs, folded);
    cs.nonAsciiMode = combined.nonAsciiMode;
    cs.nonAsciiRanges = combined.nonAsciiRanges;
  }
}

const ASCII_CHARSETS: readonly CharSet[] = Array.from({ length: 128 }, (_, code) => {
  const cs = makeEmptyCharSet();
  addCodeUnitCI(cs, code);
  return cs;
});

const ASCII_CHARSETS_CS: readonly CharSet[] = Array.from(
  { length: 128 },
  (_, code) => {
    const cs = makeEmptyCharSet();
    addCodeUnitCS(cs, code);
    return cs;
  }
);

function charSetFromCodeUnit(code: number, ignoreCase: boolean): CharSet {
  if (code >= 0 && code <= 0x7f) {
    return ignoreCase ? ASCII_CHARSETS[code]! : ASCII_CHARSETS_CS[code]!;
  }
  const cs = makeEmptyCharSet();
  addCodeUnit(cs, code, ignoreCase);
  return cs;
}

function negateCharSet(cs: CharSet): CharSet {
  const ascii0 = cs.asciiUnknown ? 0xffffffff : ~cs.ascii0 >>> 0;
  const ascii1 = cs.asciiUnknown ? 0xffffffff : ~cs.ascii1 >>> 0;
  const ascii2 = cs.asciiUnknown ? 0xffffffff : ~cs.ascii2 >>> 0;
  const ascii3 = cs.asciiUnknown ? 0xffffffff : ~cs.ascii3 >>> 0;

  let nonAsciiMode: NonAsciiMode;
  let nonAsciiRanges: CharRange[];

  if (cs.nonAsciiMode === 'none') {
    nonAsciiMode = 'exclude';
    nonAsciiRanges = [];
  } else if (cs.nonAsciiMode === 'include') {
    nonAsciiMode = 'exclude';
    nonAsciiRanges = cs.nonAsciiRanges;
  } else if (cs.nonAsciiMode === 'exclude') {
    if (cs.nonAsciiRanges.length === 0) {
      nonAsciiMode = 'none';
      nonAsciiRanges = [];
    } else {
      nonAsciiMode = 'include';
      nonAsciiRanges = cs.nonAsciiRanges;
    }
  } else {
    nonAsciiMode = 'unknown';
    nonAsciiRanges = [];
  }

  return makeCharSet(ascii0, ascii1, ascii2, ascii3, cs.asciiUnknown, nonAsciiMode, nonAsciiRanges);
}

function isEmptyCharSet(cs: CharSet): boolean {
  return (
    !cs.asciiUnknown &&
    (cs.ascii0 | cs.ascii1 | cs.ascii2 | cs.ascii3) === 0 &&
    cs.nonAsciiMode === 'none'
  );
}

function intersectCharSet(a: CharSet, b: CharSet): CharSet {
  const ascii0 = (a.ascii0 & b.ascii0) >>> 0;
  const ascii1 = (a.ascii1 & b.ascii1) >>> 0;
  const ascii2 = (a.ascii2 & b.ascii2) >>> 0;
  const ascii3 = (a.ascii3 & b.ascii3) >>> 0;
  const asciiUnknown = a.asciiUnknown && b.asciiUnknown;
  let nonAsciiMode: NonAsciiMode = 'none';
  let nonAsciiRanges: CharRange[] = [];

  if (a.nonAsciiMode !== 'none' && b.nonAsciiMode !== 'none') {
    if (a.nonAsciiMode === 'unknown') {
      nonAsciiMode = b.nonAsciiMode;
      nonAsciiRanges = b.nonAsciiRanges;
    } else if (b.nonAsciiMode === 'unknown') {
      nonAsciiMode = a.nonAsciiMode;
      nonAsciiRanges = a.nonAsciiRanges;
    } else if (a.nonAsciiMode === 'include' && b.nonAsciiMode === 'include') {
      const inter = intersectRanges(a.nonAsciiRanges, b.nonAsciiRanges);
      if (inter.length > 0) { nonAsciiMode = 'include'; nonAsciiRanges = inter; }
    } else if (a.nonAsciiMode === 'include' && b.nonAsciiMode === 'exclude') {
      const diff = subtractRanges(a.nonAsciiRanges, b.nonAsciiRanges);
      if (diff.length > 0) { nonAsciiMode = 'include'; nonAsciiRanges = diff; }
    } else if (a.nonAsciiMode === 'exclude' && b.nonAsciiMode === 'include') {
      const diff = subtractRanges(b.nonAsciiRanges, a.nonAsciiRanges);
      if (diff.length > 0) { nonAsciiMode = 'include'; nonAsciiRanges = diff; }
    } else {
      const merged = mergeRanges(a.nonAsciiRanges, b.nonAsciiRanges);
      if (merged === null) { nonAsciiMode = 'unknown'; }
      else if (!isFullNonAscii(merged)) { nonAsciiMode = 'exclude'; nonAsciiRanges = merged; }
    }
  }
  return makeCharSet(ascii0, ascii1, ascii2, ascii3, asciiUnknown, nonAsciiMode, nonAsciiRanges);
}

function unionCharSet(a: CharSet, b: CharSet): CharSet {
  if (a === b) return a;
  if (
    b.nonAsciiMode === 'none' &&
    !b.asciiUnknown &&
    (a.ascii0 & b.ascii0) === b.ascii0 &&
    (a.ascii1 & b.ascii1) === b.ascii1 &&
    (a.ascii2 & b.ascii2) === b.ascii2 &&
    (a.ascii3 & b.ascii3) === b.ascii3
  ) {
    return a;
  }
  const ascii0 = (a.ascii0 | b.ascii0) >>> 0;
  const ascii1 = (a.ascii1 | b.ascii1) >>> 0;
  const ascii2 = (a.ascii2 | b.ascii2) >>> 0;
  const ascii3 = (a.ascii3 | b.ascii3) >>> 0;
  const asciiUnknown = a.asciiUnknown || b.asciiUnknown;

  if (a.nonAsciiMode === 'none') {
    return makeCharSet(ascii0, ascii1, ascii2, ascii3, asciiUnknown, b.nonAsciiMode, b.nonAsciiRanges);
  }
  if (b.nonAsciiMode === 'none') {
    return makeCharSet(ascii0, ascii1, ascii2, ascii3, asciiUnknown, a.nonAsciiMode, a.nonAsciiRanges);
  }
  if (
    (a.nonAsciiMode === 'exclude' && a.nonAsciiRanges.length === 0) ||
    (b.nonAsciiMode === 'exclude' && b.nonAsciiRanges.length === 0)
  ) {
    return makeCharSet(ascii0, ascii1, ascii2, ascii3, asciiUnknown, 'exclude', []);
  }
  if (a.nonAsciiMode === 'unknown' || b.nonAsciiMode === 'unknown') {
    return makeCharSet(ascii0, ascii1, ascii2, ascii3, asciiUnknown, 'unknown', []);
  }

  if (a.nonAsciiMode === 'include' && b.nonAsciiMode === 'include') {
    const merged = mergeRanges(a.nonAsciiRanges, b.nonAsciiRanges);
    if (merged === null) {
      return makeCharSet(ascii0, ascii1, ascii2, ascii3, asciiUnknown, 'unknown', []);
    }
    if (isFullNonAscii(merged)) {
      return makeCharSet(ascii0, ascii1, ascii2, ascii3, asciiUnknown, 'exclude', []);
    }
    return makeCharSet(ascii0, ascii1, ascii2, ascii3, asciiUnknown, 'include', merged);
  }

  if (a.nonAsciiMode === 'exclude' && b.nonAsciiMode === 'exclude') {
    const inter = intersectRanges(a.nonAsciiRanges, b.nonAsciiRanges);
    if (inter.length > MAX_NON_ASCII_RANGES) {
      return makeCharSet(ascii0, ascii1, ascii2, ascii3, asciiUnknown, 'unknown', []);
    }
    return makeCharSet(ascii0, ascii1, ascii2, ascii3, asciiUnknown, 'exclude', inter);
  }

  const excl = a.nonAsciiMode === 'exclude' ? a.nonAsciiRanges : b.nonAsciiRanges;
  const incl = a.nonAsciiMode === 'include' ? a.nonAsciiRanges : b.nonAsciiRanges;
  const diff = subtractRanges(excl, incl);
  if (diff.length > MAX_NON_ASCII_RANGES) {
    return makeCharSet(ascii0, ascii1, ascii2, ascii3, asciiUnknown, 'unknown', []);
  }
  return makeCharSet(ascii0, ascii1, ascii2, ascii3, asciiUnknown, 'exclude', diff);
}

function charSetsOverlap(a: CharSet, b: CharSet): boolean {
  if (
    ((a.ascii0 & b.ascii0) |
      (a.ascii1 & b.ascii1) |
      (a.ascii2 & b.ascii2) |
      (a.ascii3 & b.ascii3)) !== 0
  ) {
    return true;
  }
  if (a.nonAsciiMode === 'none' || b.nonAsciiMode === 'none') {
    return false;
  }
  if (a.nonAsciiMode === 'unknown' || b.nonAsciiMode === 'unknown') {
    return true;
  }
  if (a.nonAsciiMode === 'include' && b.nonAsciiMode === 'include') {
    const ra = a.nonAsciiRanges, rb = b.nonAsciiRanges;
    if (ra.length === 1 && rb.length === 1) {
      return ra[0]![0] <= rb[0]![1] && rb[0]![0] <= ra[0]![1];
    }
    return rangesOverlap(ra, rb);
  }
  if (a.nonAsciiMode === 'exclude' && b.nonAsciiMode === 'include') {
    return !isRangeSubset(b.nonAsciiRanges, a.nonAsciiRanges);
  }
  if (a.nonAsciiMode === 'include' && b.nonAsciiMode === 'exclude') {
    return !isRangeSubset(a.nonAsciiRanges, b.nonAsciiRanges);
  }
  // exclude vs exclude: disjoint iff A union B covers all [0x80, 0xffff]
  const merged = mergeRanges(a.nonAsciiRanges, b.nonAsciiRanges);
  if (merged === null) return true;
  return !isFullNonAscii(merged);
}

function popcount32(n: number): number {
  let x = n >>> 0;
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function isBroadWildcardCharSet(cs: CharSet): boolean {
  if (cs.nonAsciiMode !== 'exclude' && cs.nonAsciiMode !== 'unknown') return false;
  const asciiCount =
    popcount32(cs.ascii0) +
    popcount32(cs.ascii1) +
    popcount32(cs.ascii2) +
    popcount32(cs.ascii3);
  return asciiCount >= 96;
}

function countAsciiRuns(a0: number, a1: number, a2: number, a3: number): number {
  const w0 = a0 >>> 0;
  const w1 = a1 >>> 0;
  const w2 = a2 >>> 0;
  const w3 = a3 >>> 0;
  return (
    popcount32(w0 & ~(w0 << 1)) +
    popcount32(w1 & ~((w1 << 1) | (w0 >>> 31))) +
    popcount32(w2 & ~((w2 << 1) | (w1 >>> 31))) +
    popcount32(w3 & ~((w3 << 1) | (w2 >>> 31)))
  );
}

function isComplexCharSet(cs: CharSet, allowSmallBroadExclude = false): boolean {
  if (cs.asciiUnknown || cs.nonAsciiMode === 'unknown') return true;
  const rawAsciiRuns = countAsciiRuns(cs.ascii0, cs.ascii1, cs.ascii2, cs.ascii3);
  const alphaBits = (cs.ascii2 | cs.ascii3) & 0x07fffffe;
  const foldedAsciiRuns = countAsciiRuns(
    cs.ascii0,
    cs.ascii1,
    (cs.ascii2 | alphaBits) >>> 0,
    (cs.ascii3 | alphaBits) >>> 0
  );
  const asciiRuns = rawAsciiRuns > foldedAsciiRuns ? rawAsciiRuns : foldedAsciiRuns;
  if (cs.nonAsciiMode === 'exclude') {
    if (asciiRuns > 8) return true;
    if (!allowSmallBroadExclude) return cs.nonAsciiRanges.length > 0;
    const len = cs.nonAsciiRanges.length;
    if (len > 8) return true;
    if (len > 0) {
      for (let i = 0; i < len; i++) {
        const r = cs.nonAsciiRanges[i]!;
        complexFoldScratch[i] = ((r[0] << 16) | r[1]) >>> 0;
      }
      const folded = buildFoldedNonAsciiCharSet(complexFoldScratch, len);
      if (folded.nonAsciiMode === 'unknown') return true;
      if (folded.nonAsciiMode === 'include' && folded.nonAsciiRanges.length > 8) return true;
    }
    return false;
  }
  if (asciiRuns > 8) return true;
  if (cs.nonAsciiMode === 'include') {
    const len = cs.nonAsciiRanges.length;
    if (len > 8) return true;
    if (len > 0) {
      for (let i = 0; i < len; i++) {
        const r = cs.nonAsciiRanges[i]!;
        complexFoldScratch[i] = ((r[0] << 16) | r[1]) >>> 0;
      }
      const folded = buildFoldedNonAsciiCharSet(complexFoldScratch, len);
      if (folded.nonAsciiMode === 'unknown') return true;
      if (folded.nonAsciiMode === 'exclude') return folded.nonAsciiRanges.length > 0;
      const foldedNonAsciiRuns = folded.nonAsciiMode === 'include' ? folded.nonAsciiRanges.length : 0;
      const nonAsciiRuns = len > foldedNonAsciiRuns ? len : foldedNonAsciiRuns;
      return nonAsciiRuns > 8 || asciiRuns + nonAsciiRuns > 10;
    }
  }
  return false;
}

const CHARSET_DIGIT: CharSet = (() => {
  const cs = makeEmptyCharSet();
  addRangeCI(cs, 0x30, 0x39);
  return cs;
})();
const CHARSET_NON_DIGIT: CharSet = negateCharSet(CHARSET_DIGIT);

const CHARSET_WORD: CharSet = (() => {
  const cs = makeEmptyCharSet();
  addRangeCI(cs, 0x30, 0x39);
  addRangeCI(cs, 0x41, 0x5a);
  addRangeCI(cs, 0x61, 0x7a);
  addAsciiBit(cs, 0x5f);
  return cs;
})();
const CHARSET_NON_WORD: CharSet = negateCharSet(CHARSET_WORD);

const CHARSET_SPACE: CharSet = makeCharSet(
  ((1 << 9) | (1 << 10) | (1 << 11) | (1 << 12) | (1 << 13)) >>> 0,
  (1 << 0) >>> 0, // 32 (' ')
  0,
  0,
  false,
  'include',
  [
    [0x00a0, 0x00a0],
    [0x1680, 0x1680],
    [0x2000, 0x200a],
    [0x2028, 0x2029],
    [0x202f, 0x202f],
    [0x205f, 0x205f],
    [0x3000, 0x3000],
    [0xfeff, 0xfeff],
  ]
);
const CHARSET_NON_SPACE: CharSet = negateCharSet(CHARSET_SPACE);

const CHARSET_DOT: CharSet = makeCharSet(
  (~((1 << 10) | (1 << 13))) >>> 0,
  0xffffffff,
  0xffffffff,
  0xffffffff,
  false,
  'exclude',
  [[0x2028, 0x2029]]
);

const CHARSET_ANY: CharSet = makeCharSet(
  0xffffffff,
  0xffffffff,
  0xffffffff,
  0xffffffff,
  false,
  'exclude',
  []
);

type RegexAstNode =
  | { type: 'empty' }
  | { type: 'assertion'; body: RegexAstNode | null; isLookbehind: boolean }
  | { type: 'charClass'; cs: CharSet }
  | { type: 'backref'; refIndex: number | null; refName: string | null }
  | {
      type: 'group';
      captureIndex: number | null;
      captureName: string | null;
      body: RegexAstNode;
    }
  | { type: 'quantifier'; body: RegexAstNode; min: number; max: number }
  | { type: 'seq'; items: RegexAstNode[] }
  | { type: 'alt'; branches: RegexAstNode[] };

type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const SYNTAX_ERROR_REASON = 'invalid regular expression syntax';
const VALID_REGEXP_GROUP_NAME_RE =
  /^[\p{ID_Start}_$][\p{ID_Continue}$\u200c\u200d]*$/u;

function isAsciiDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

function isAsciiAlpha(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

function isRegExpGroupNameStart(code: number): boolean {
  return (
    isAsciiAlpha(code) ||
    code === 0x5f || // _
    code === 0x24 || // $
    code >= 0x80
  );
}

function isRegExpGroupNamePart(code: number): boolean {
  return isRegExpGroupNameStart(code) || isAsciiDigit(code);
}

function parseGroupNameAt(
  pattern: string,
  nameStart: number
): { name: string; nextPos: number } | null {
  const len = pattern.length;
  if (nameStart >= len) {
    return null;
  }
  const firstCode = pattern.charCodeAt(nameStart);
  if (!isRegExpGroupNameStart(firstCode)) {
    return null;
  }
  let hasNonAscii = firstCode >= 0x80;
  let p = nameStart + 1;
  while (p < len && pattern[p] !== '>') {
    const code = pattern.charCodeAt(p);
    if (!isRegExpGroupNamePart(code)) {
      return null;
    }
    if (code >= 0x80) hasNonAscii = true;
    p++;
  }
  if (p >= len || pattern[p] !== '>') {
    return null;
  }
  const name = pattern.slice(nameStart, p);
  if (hasNonAscii && !VALID_REGEXP_GROUP_NAME_RE.test(name)) {
    return null;
  }
  return { name, nextPos: p + 1 };
}

function hexDigitValue(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10;
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10;
  return -1;
}

function parseHexDigits(
  pattern: string,
  start: number,
  count: number
): number {
  if (start + count > pattern.length) return -1;
  let value = 0;
  for (let i = 0; i < count; i++) {
    const d = hexDigitValue(pattern.charCodeAt(start + i));
    if (d < 0) return -1;
    value = value * 16 + d;
  }
  return value;
}

function parseOctalEscape(
  pattern: string,
  start: number
): { value: number; nextPos: number } {
  let value = 0;
  let p = start;
  while (p < pattern.length && p - start < 3) {
    const d = pattern.charCodeAt(p) - 0x30;
    if (d < 0 || d > 7) break;
    if (value * 8 + d > 255) break;
    value = value * 8 + d;
    p++;
  }
  return { value, nextPos: p };
}

function compareDigitStrings(a: string, b: string): number {
  const ta = a.replace(/^0+/, '') || '0';
  const tb = b.replace(/^0+/, '') || '0';
  if (ta.length !== tb.length) return ta.length - tb.length;
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return 0;
}

function parseBoundedQuantifierInt(digits: string): number | null {
  const trimmed = digits.replace(/^0+/, '') || '0';
  if (trimmed.length > 6) return null;
  const val = Number(trimmed);
  if (!Number.isSafeInteger(val) || val > MAX_FINITE_QUANTIFIER_BOUND) {
    return null;
  }
  return val;
}

function countCaptures(pattern: string): {
  totalCaptures: number;
  hasNamedGroups: boolean;
  declaredGroupNames: Set<string>;
} {
  let totalCaptures = 0;
  let hasNamedGroups = false;
  const declaredGroupNames = new Set<string>();
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (ch === ']') {
        inClass = false;
      }
      continue;
    }
    if (ch === '[') {
      inClass = true;
      continue;
    }
    if (ch === '(') {
      if (pattern[i + 1] !== '?') {
        totalCaptures++;
      } else if (
        pattern[i + 2] === '<' &&
        pattern[i + 3] !== '=' &&
        pattern[i + 3] !== '!'
      ) {
        totalCaptures++;
        hasNamedGroups = true;
        const parsedName = parseGroupNameAt(pattern, i + 3);
        if (parsedName !== null) {
          declaredGroupNames.add(parsedName.name);
        }
      }
    }
  }
  return { totalCaptures, hasNamedGroups, declaredGroupNames };
}

function parseRegex(pattern: string): ParseResult<RegexAstNode> {
  const len = pattern.length;
  const { totalCaptures, hasNamedGroups, declaredGroupNames } =
    countCaptures(pattern);
  let pos = 0;
  let depth = 0;
  let dotAll = false;
  let ignoreCase = true;
  let captureCounter = 0;
  let activeGroupNames = new Set<string>();
  let lastFailedBracePos = -1;
  let noClosingBraceFrom = len;

  type ClassAtom =
    | { kind: 'char'; code: number }
    | { kind: 'set'; cs: CharSet };

  function parseClassAtom(): ParseResult<ClassAtom> {
    if (pos >= len) {
      return { ok: false, reason: SYNTAX_ERROR_REASON };
    }
    const ch = pattern[pos]!;
    if (ch !== '\\') {
      const code = pattern.charCodeAt(pos);
      pos++;
      return { ok: true, value: { kind: 'char', code } };
    }
    if (pos + 1 >= len) {
      return { ok: false, reason: SYNTAX_ERROR_REASON };
    }
    const esc = pattern[pos + 1]!;
    switch (esc) {
      case 'd':
        pos += 2;
        return { ok: true, value: { kind: 'set', cs: CHARSET_DIGIT } };
      case 'D':
        pos += 2;
        return { ok: true, value: { kind: 'set', cs: CHARSET_NON_DIGIT } };
      case 'w':
        pos += 2;
        return { ok: true, value: { kind: 'set', cs: CHARSET_WORD } };
      case 'W':
        pos += 2;
        return { ok: true, value: { kind: 'set', cs: CHARSET_NON_WORD } };
      case 's':
        pos += 2;
        return { ok: true, value: { kind: 'set', cs: CHARSET_SPACE } };
      case 'S':
        pos += 2;
        return { ok: true, value: { kind: 'set', cs: CHARSET_NON_SPACE } };
      case 'b':
        pos += 2;
        return { ok: true, value: { kind: 'char', code: 0x08 } };
      case 't':
        pos += 2;
        return { ok: true, value: { kind: 'char', code: 0x09 } };
      case 'n':
        pos += 2;
        return { ok: true, value: { kind: 'char', code: 0x0a } };
      case 'v':
        pos += 2;
        return { ok: true, value: { kind: 'char', code: 0x0b } };
      case 'f':
        pos += 2;
        return { ok: true, value: { kind: 'char', code: 0x0c } };
      case 'r':
        pos += 2;
        return { ok: true, value: { kind: 'char', code: 0x0d } };
      case 'c': {
        if (pos + 2 < len) {
          const cc = pattern.charCodeAt(pos + 2);
          if (isAsciiAlpha(cc) || isAsciiDigit(cc) || cc === 0x5f) {
            pos += 3;
            return { ok: true, value: { kind: 'char', code: cc % 32 } };
          }
        }
        // ECMA-262 Annex B: inside [...], \c without [A-Za-z0-9_] parses '\' as literal 0x5c
        // and leaves 'c' for the next class atom (preserving [\c-z] ranges as well).
        pos += 1;
        return { ok: true, value: { kind: 'char', code: 0x5c } };
      }
      case 'x': {
        const hex = parseHexDigits(pattern, pos + 2, 2);
        if (hex >= 0) {
          pos += 4;
          return { ok: true, value: { kind: 'char', code: hex } };
        }
        pos += 2;
        return { ok: true, value: { kind: 'char', code: 0x78 } };
      }
      case 'u': {
        const hex = parseHexDigits(pattern, pos + 2, 4);
        if (hex >= 0) {
          pos += 6;
          return { ok: true, value: { kind: 'char', code: hex } };
        }
        pos += 2;
        return { ok: true, value: { kind: 'char', code: 0x75 } };
      }
      default: {
        // Note: in non-/u mode, \p and \P are IdentityEscapes matching 'p' / 'P'.
        const escCode = pattern.charCodeAt(pos + 1);
        if (escCode >= 0x30 && escCode <= 0x37) {
          const oct = parseOctalEscape(pattern, pos + 1);
          pos = oct.nextPos;
          return { ok: true, value: { kind: 'char', code: oct.value } };
        }
        pos += 2;
        return { ok: true, value: { kind: 'char', code: escCode } };
      }
    }
  }

  function parseCharClass(): ParseResult<RegexAstNode> {
    pos++; // consume '['
    if (pos >= len) {
      return { ok: false, reason: SYNTAX_ERROR_REASON };
    }
    let negated = false;
    if (pattern[pos] === '^') {
      negated = true;
      pos++;
    }
    let cs = makeEmptyCharSet();
    let rawNonAsciiLen = 0;
    while (pos < len && pattern[pos] !== ']') {
      const atom1Res = parseClassAtom();
      if (!atom1Res.ok) return atom1Res;
      const atom1 = atom1Res.value;

      if (pos < len && pattern[pos] === '-' && pos + 1 < len && pattern[pos + 1] !== ']') {
        pos++; // consume '-'
        const atom2Res = parseClassAtom();
        if (!atom2Res.ok) return atom2Res;
        const atom2 = atom2Res.value;
        if (atom1.kind === 'char' && atom2.kind === 'char') {
          const lo = atom1.code, hi = atom2.code;
          if (lo > hi) {
            return { ok: false, reason: SYNTAX_ERROR_REASON };
          }
          if (lo <= 0x7f) {
            setAsciiRangeBits(cs, lo, hi < 0x7f ? hi : 0x7f);
          }
          if (hi >= NON_ASCII_MIN) {
            const nonLo = lo > NON_ASCII_MIN ? lo : NON_ASCII_MIN;
            const nonHi = hi < NON_ASCII_MAX ? hi : NON_ASCII_MAX;
            if (ignoreCase) {
              if (rawNonAsciiLen >= rawClassRangeScratch.length) {
                const next = new Uint32Array(rawClassRangeScratch.length * 2);
                next.set(rawClassRangeScratch);
                rawClassRangeScratch = next;
              }
              rawClassRangeScratch[rawNonAsciiLen++] = ((nonLo << 16) | nonHi) >>> 0;
            } else {
              addNonAsciiRange(cs, nonLo, nonHi);
            }
          }
        } else {
          // Annex B: range involving shorthand class treats '-' as literal
          if (atom1.kind === 'char') {
            const c = atom1.code;
            if (c >= 0 && c <= 0x7f) addAsciiBit(cs, c);
            else if (c >= NON_ASCII_MIN && c <= NON_ASCII_MAX) {
              if (ignoreCase) {
                if (rawNonAsciiLen >= rawClassRangeScratch.length) {
                  const next = new Uint32Array(rawClassRangeScratch.length * 2);
                  next.set(rawClassRangeScratch);
                  rawClassRangeScratch = next;
                }
                rawClassRangeScratch[rawNonAsciiLen++] = ((c << 16) | c) >>> 0;
              } else addNonAsciiRange(cs, c, c);
            }
          } else {
            cs = unionCharSet(cs, atom1.cs);
          }
          addAsciiBit(cs, 0x2d);
          if (atom2.kind === 'char') {
            const c = atom2.code;
            if (c >= 0 && c <= 0x7f) addAsciiBit(cs, c);
            else if (c >= NON_ASCII_MIN && c <= NON_ASCII_MAX) {
              if (ignoreCase) {
                if (rawNonAsciiLen >= rawClassRangeScratch.length) {
                  const next = new Uint32Array(rawClassRangeScratch.length * 2);
                  next.set(rawClassRangeScratch);
                  rawClassRangeScratch = next;
                }
                rawClassRangeScratch[rawNonAsciiLen++] = ((c << 16) | c) >>> 0;
              } else addNonAsciiRange(cs, c, c);
            }
          } else {
            cs = unionCharSet(cs, atom2.cs);
          }
        }
      } else if (atom1.kind === 'char') {
        const c = atom1.code;
        if (c >= 0 && c <= 0x7f) addAsciiBit(cs, c);
        else if (c >= NON_ASCII_MIN && c <= NON_ASCII_MAX) {
          if (ignoreCase) {
            if (rawNonAsciiLen >= rawClassRangeScratch.length) {
              const next = new Uint32Array(rawClassRangeScratch.length * 2);
              next.set(rawClassRangeScratch);
              rawClassRangeScratch = next;
            }
            rawClassRangeScratch[rawNonAsciiLen++] = ((c << 16) | c) >>> 0;
          } else addNonAsciiRange(cs, c, c);
        }
      } else {
        cs = unionCharSet(cs, atom1.cs);
      }
    }
    if (pos >= len || pattern[pos] !== ']') {
      return { ok: false, reason: SYNTAX_ERROR_REASON };
    }
    pos++; // consume ']'
    if (ignoreCase) {
      foldAsciiBitsCI(cs);
      if (rawNonAsciiLen > 0) {
        const folded = buildFoldedNonAsciiCharSet(rawClassRangeScratch, rawNonAsciiLen);
        if (cs.nonAsciiMode === 'none') {
          cs.nonAsciiMode = folded.nonAsciiMode;
          cs.nonAsciiRanges = folded.nonAsciiRanges;
        } else {
          cs = unionCharSet(cs, folded);
        }
      }
    }
    if (negated) {
      cs = negateCharSet(cs);
    }
    return { ok: true, value: { type: 'charClass', cs } };
  }

  function tryParseBraceQuantifier():
    | { matched: false }
    | { matched: true; ok: true; min: number; max: number }
    | { matched: true; ok: false; reason: string } {
    const start = pos;
    if (start === lastFailedBracePos || start >= noClosingBraceFrom) {
      return { matched: false };
    }
    let p = start + 1; // after '{'
    const minStart = p;
    while (p < len && isAsciiDigit(pattern.charCodeAt(p))) {
      p++;
    }
    if (p >= len) {
      if (start < noClosingBraceFrom) noClosingBraceFrom = start;
      lastFailedBracePos = start;
      return { matched: false };
    }
    if (p === minStart) {
      lastFailedBracePos = start;
      return { matched: false };
    }
    const minStr = pattern.slice(minStart, p);
    if (pattern[p] === '}') {
      pos = p + 1;
      const min = parseBoundedQuantifierInt(minStr);
      if (min === null) {
        return { matched: true, ok: false, reason: 'excessive quantifier bound' };
      }
      return { matched: true, ok: true, min, max: min };
    }
    if (pattern[p] !== ',') {
      lastFailedBracePos = start;
      return { matched: false };
    }
    p++; // after ','
    if (p >= len) {
      if (start < noClosingBraceFrom) noClosingBraceFrom = start;
      lastFailedBracePos = start;
      return { matched: false };
    }
    if (pattern[p] === '}') {
      pos = p + 1;
      const min = parseBoundedQuantifierInt(minStr);
      if (min === null) {
        return { matched: true, ok: false, reason: 'excessive quantifier bound' };
      }
      return { matched: true, ok: true, min, max: Infinity };
    }
    const maxStart = p;
    while (p < len && isAsciiDigit(pattern.charCodeAt(p))) {
      p++;
    }
    if (p >= len) {
      if (start < noClosingBraceFrom) noClosingBraceFrom = start;
      lastFailedBracePos = start;
      return { matched: false };
    }
    if (p === maxStart || pattern[p] !== '}') {
      lastFailedBracePos = start;
      return { matched: false };
    }
    const maxStr = pattern.slice(maxStart, p);
    pos = p + 1;
    if (compareDigitStrings(minStr, maxStr) > 0) {
      return { matched: true, ok: false, reason: SYNTAX_ERROR_REASON };
    }
    const min = parseBoundedQuantifierInt(minStr);
    const max = parseBoundedQuantifierInt(maxStr);
    if (min === null || max === null) {
      return { matched: true, ok: false, reason: 'excessive quantifier bound' };
    }
    return { matched: true, ok: true, min, max };
  }

  function parseOptionalQuantifier():
    | { present: false }
    | { present: true; ok: true; min: number; max: number }
    | { present: true; ok: false; reason: string } {
    if (pos >= len) return { present: false };
    const ch = pattern[pos]!;
    let min: number;
    let max: number;
    if (ch === '*') {
      pos++;
      min = 0;
      max = Infinity;
    } else if (ch === '+') {
      pos++;
      min = 1;
      max = Infinity;
    } else if (ch === '?') {
      pos++;
      min = 0;
      max = 1;
    } else if (ch === '{') {
      const brace = tryParseBraceQuantifier();
      if (!brace.matched) return { present: false };
      if (!brace.ok) {
        return { present: true, ok: false, reason: brace.reason };
      }
      min = brace.min;
      max = brace.max;
    } else {
      return { present: false };
    }
    // Optional lazy modifier '?'
    if (pos < len && pattern[pos] === '?') {
      pos++;
    }
    return { present: true, ok: true, min, max };
  }

  function parseModifierHeader(start: number): {
    nextPos: number;
    addDotAll: boolean;
    removeDotAll: boolean;
    addIgnoreCase: boolean;
    removeIgnoreCase: boolean;
  } | null {
    let p = start;
    let seen = 0;
    let flagCount = 0;
    let sawDash = false;
    let addDotAll = false;
    let removeDotAll = false;
    let addIgnoreCase = false;
    let removeIgnoreCase = false;
    while (p < len && pattern[p] !== ':') {
      const ch = pattern[p]!;
      if (ch === '-') {
        if (sawDash) return null;
        sawDash = true;
        p++;
        continue;
      }
      let bit: number;
      if (ch === 'i') bit = 1;
      else if (ch === 'm') bit = 2;
      else if (ch === 's') bit = 4;
      else return null;
      if ((seen & bit) !== 0) return null;
      seen |= bit;
      if (ch === 's') {
        if (sawDash) removeDotAll = true;
        else addDotAll = true;
      } else if (ch === 'i') {
        if (sawDash) removeIgnoreCase = true;
        else addIgnoreCase = true;
      }
      flagCount++;
      p++;
    }
    if (flagCount === 0 || p >= len || pattern[p] !== ':') {
      return null;
    }
    return {
      nextPos: p + 1,
      addDotAll,
      removeDotAll,
      addIgnoreCase,
      removeIgnoreCase,
    };
  }

  function parseGroup(): ParseResult<{ node: RegexAstNode; quantifiable: boolean }> {
    depth++;
    if (depth > MAX_REGEX_NESTING_DEPTH) {
      return { ok: false, reason: 'excessive nesting depth' };
    }
    pos++; // consume '('
    if (pos >= len) {
      return { ok: false, reason: SYNTAX_ERROR_REASON };
    }

    let isAssertion = false;
    let isLookbehind = false;
    let quantifiable = true;
    let captureIndex: number | null = null;
    let captureName: string | null = null;
    const prevDotAll = dotAll;
    const prevIgnoreCase = ignoreCase;

    if (pattern[pos] === '?') {
      if (pos + 1 >= len) {
        return { ok: false, reason: SYNTAX_ERROR_REASON };
      }
      const next = pattern[pos + 1]!;
      if (next === ':') {
        pos += 2;
      } else if (next === '=' || next === '!') {
        isAssertion = true;
        quantifiable = true; // Annex B allows lookahead quantifiers
        pos += 2;
      } else if (next === '<') {
        if (pos + 2 >= len) {
          return { ok: false, reason: SYNTAX_ERROR_REASON };
        }
        const afterLt = pattern[pos + 2]!;
        if (afterLt === '=' || afterLt === '!') {
          isAssertion = true;
          isLookbehind = true;
          quantifiable = false;
          pos += 3;
        } else {
          // Named capturing group (?<name>...)
          const parsedName = parseGroupNameAt(pattern, pos + 2);
          if (parsedName === null) {
            return { ok: false, reason: SYNTAX_ERROR_REASON };
          }
          if (activeGroupNames.has(parsedName.name)) {
            return { ok: false, reason: SYNTAX_ERROR_REASON };
          }
          activeGroupNames.add(parsedName.name);
          captureCounter++;
          captureIndex = captureCounter;
          captureName = parsedName.name;
          pos = parsedName.nextPos;
        }
      } else {
        const mod = parseModifierHeader(pos + 1);
        if (mod === null) {
          return { ok: false, reason: SYNTAX_ERROR_REASON };
        }
        if (mod.addDotAll) dotAll = true;
        else if (mod.removeDotAll) dotAll = false;
        if (mod.addIgnoreCase) ignoreCase = true;
        else if (mod.removeIgnoreCase) ignoreCase = false;
        pos = mod.nextPos;
      }
    } else {
      captureCounter++;
      captureIndex = captureCounter;
    }

    const bodyRes = parseAlternation();
    dotAll = prevDotAll;
    ignoreCase = prevIgnoreCase;
    if (!bodyRes.ok) return bodyRes;
    if (pos >= len || pattern[pos] !== ')') {
      return { ok: false, reason: SYNTAX_ERROR_REASON };
    }
    pos++; // consume ')'
    depth--;

    const node: RegexAstNode = isAssertion
      ? { type: 'assertion', body: bodyRes.value, isLookbehind }
      : {
          type: 'group',
          captureIndex,
          captureName,
          body: bodyRes.value,
        };
    return { ok: true, value: { node, quantifiable } };
  }

  function parseEscapeOutsideClass(): ParseResult<{
    node: RegexAstNode;
    quantifiable: boolean;
  }> {
    if (pos + 1 >= len) {
      return { ok: false, reason: SYNTAX_ERROR_REASON };
    }
    const esc = pattern[pos + 1]!;
    switch (esc) {
      case 'b':
      case 'B':
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'assertion', body: null, isLookbehind: false },
            quantifiable: false,
          },
        };
      case 'd':
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: CHARSET_DIGIT },
            quantifiable: true,
          },
        };
      case 'D':
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: CHARSET_NON_DIGIT },
            quantifiable: true,
          },
        };
      case 'w':
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: CHARSET_WORD },
            quantifiable: true,
          },
        };
      case 'W':
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: CHARSET_NON_WORD },
            quantifiable: true,
          },
        };
      case 's':
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: CHARSET_SPACE },
            quantifiable: true,
          },
        };
      case 'S':
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: CHARSET_NON_SPACE },
            quantifiable: true,
          },
        };
      case 't':
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: charSetFromCodeUnit(0x09, ignoreCase) },
            quantifiable: true,
          },
        };
      case 'n':
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: charSetFromCodeUnit(0x0a, ignoreCase) },
            quantifiable: true,
          },
        };
      case 'v':
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: charSetFromCodeUnit(0x0b, ignoreCase) },
            quantifiable: true,
          },
        };
      case 'f':
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: charSetFromCodeUnit(0x0c, ignoreCase) },
            quantifiable: true,
          },
        };
      case 'r':
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: charSetFromCodeUnit(0x0d, ignoreCase) },
            quantifiable: true,
          },
        };
      case 'c': {
        if (pos + 2 < len && isAsciiAlpha(pattern.charCodeAt(pos + 2))) {
          const code = pattern.charCodeAt(pos + 2) % 32;
          pos += 3;
          return {
            ok: true,
            value: {
              node: { type: 'charClass', cs: charSetFromCodeUnit(code, ignoreCase) },
              quantifiable: true,
            },
          };
        }
        // ECMA-262 Annex B: outside [...], \c without [A-Za-z] parses '\' as literal 0x5c
        // and leaves 'c' for the next sequence atom (matching /\c+/.test('\\ccc') === true).
        pos += 1;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: charSetFromCodeUnit(0x5c, ignoreCase) },
            quantifiable: true,
          },
        };
      }
      case 'x': {
        const hex = parseHexDigits(pattern, pos + 2, 2);
        if (hex >= 0) {
          pos += 4;
          return {
            ok: true,
            value: {
              node: { type: 'charClass', cs: charSetFromCodeUnit(hex, ignoreCase) },
              quantifiable: true,
            },
          };
        }
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: charSetFromCodeUnit(0x78, ignoreCase) },
            quantifiable: true,
          },
        };
      }
      case 'u': {
        const hex = parseHexDigits(pattern, pos + 2, 4);
        if (hex >= 0) {
          pos += 6;
          return {
            ok: true,
            value: {
              node: { type: 'charClass', cs: charSetFromCodeUnit(hex, ignoreCase) },
              quantifiable: true,
            },
          };
        }
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: charSetFromCodeUnit(0x75, ignoreCase) },
            quantifiable: true,
          },
        };
      }
      case 'k': {
        if (hasNamedGroups) {
          if (pattern[pos + 2] !== '<') {
            return { ok: false, reason: SYNTAX_ERROR_REASON };
          }
          const parsedName = parseGroupNameAt(pattern, pos + 3);
          if (parsedName === null || !declaredGroupNames.has(parsedName.name)) {
            return { ok: false, reason: SYNTAX_ERROR_REASON };
          }
          pos = parsedName.nextPos;
          return {
            ok: true,
            value: {
              node: { type: 'backref', refIndex: null, refName: parsedName.name },
              quantifiable: true,
            },
          };
        }
        pos += 2;
        return {
          ok: true,
          value: {
            node: { type: 'charClass', cs: charSetFromCodeUnit(0x6b, ignoreCase) },
            quantifiable: true,
          },
        };
      }
      default: {
        // Note: in non-/u mode, \p and \P are IdentityEscapes matching 'p' / 'P'.
        const escCode = pattern.charCodeAt(pos + 1);
        if (escCode >= 0x31 && escCode <= 0x39) {
          let p = pos + 1;
          while (p < len && isAsciiDigit(pattern.charCodeAt(p))) {
            p++;
          }
          const numStr = pattern.slice(pos + 1, p);
          const numVal = Number(numStr);
          if (numVal >= 1 && numVal <= totalCaptures) {
            pos = p;
            return {
              ok: true,
              value: {
                node: { type: 'backref', refIndex: numVal, refName: null },
                quantifiable: true,
              },
            };
          }
          if (escCode <= 0x37) {
            const oct = parseOctalEscape(pattern, pos + 1);
            pos = oct.nextPos;
            return {
              ok: true,
              value: {
                node: {
                  type: 'charClass',
                  cs: charSetFromCodeUnit(oct.value, ignoreCase),
                },
                quantifiable: true,
              },
            };
          }
          pos += 2;
          return {
            ok: true,
            value: {
              node: {
                type: 'charClass',
                cs: charSetFromCodeUnit(escCode, ignoreCase),
              },
              quantifiable: true,
            },
          };
        }
        if (escCode === 0x30) {
          const oct = parseOctalEscape(pattern, pos + 1);
          pos = oct.nextPos;
          return {
            ok: true,
            value: {
              node: {
                type: 'charClass',
                cs: charSetFromCodeUnit(oct.value, ignoreCase),
              },
              quantifiable: true,
            },
          };
        }
        pos += 2;
        return {
          ok: true,
          value: {
            node: {
              type: 'charClass',
              cs: charSetFromCodeUnit(escCode, ignoreCase),
            },
            quantifiable: true,
          },
        };
      }
    }
  }

  function parseSequence(): ParseResult<RegexAstNode> {
    const items: RegexAstNode[] = [];
    while (pos < len) {
      const ch = pattern[pos]!;
      if (ch === '|' || ch === ')') {
        break;
      }
      if (ch === '*' || ch === '+' || ch === '?') {
        return { ok: false, reason: SYNTAX_ERROR_REASON };
      }

      let atom: RegexAstNode;
      let quantifiable: boolean;

      if (ch === '^' || ch === '$') {
        pos++;
        atom = { type: 'assertion', body: null, isLookbehind: false };
        quantifiable = false;
      } else if (ch === '.') {
        pos++;
        atom = { type: 'charClass', cs: dotAll ? CHARSET_ANY : CHARSET_DOT };
        quantifiable = true;
      } else if (ch === '[') {
        const clsRes = parseCharClass();
        if (!clsRes.ok) return clsRes;
        atom = clsRes.value;
        quantifiable = true;
      } else if (ch === '(') {
        const grpRes = parseGroup();
        if (!grpRes.ok) return grpRes;
        atom = grpRes.value.node;
        quantifiable = grpRes.value.quantifiable;
      } else if (ch === '\\') {
        const escRes = parseEscapeOutsideClass();
        if (!escRes.ok) return escRes;
        atom = escRes.value.node;
        quantifiable = escRes.value.quantifiable;
      } else if (ch === '{') {
        const saved = pos;
        const brace = tryParseBraceQuantifier();
        if (brace.matched) {
          return { ok: false, reason: SYNTAX_ERROR_REASON };
        }
        pos = saved + 1;
        atom = { type: 'charClass', cs: charSetFromCodeUnit(0x7b, ignoreCase) };
        quantifiable = true;
      } else {
        const code = pattern.charCodeAt(pos);
        pos++;
        atom = { type: 'charClass', cs: charSetFromCodeUnit(code, ignoreCase) };
        quantifiable = true;
      }

      if (quantifiable) {
        const quant = parseOptionalQuantifier();
        if (quant.present) {
          if (!quant.ok) {
            return { ok: false, reason: quant.reason };
          }
          atom = {
            type: 'quantifier',
            body: atom,
            min: quant.min,
            max: quant.max,
          };
        }
      }

      items.push(atom);
    }

    if (items.length === 0) {
      return { ok: true, value: { type: 'empty' } };
    }
    if (items.length === 1) {
      return { ok: true, value: items[0]! };
    }
    return { ok: true, value: { type: 'seq', items } };
  }

  function parseAlternation(): ParseResult<RegexAstNode> {
    const namesBefore = activeGroupNames.size > 0 ? new Set(activeGroupNames) : null;
    const first = parseSequence();
    if (!first.ok) return first;
    if (pos >= len || pattern[pos] !== '|') {
      return first;
    }
    let mergedNames = activeGroupNames.size > 0 ? new Set(activeGroupNames) : null;
    const branches: RegexAstNode[] = [first.value];
    while (pos < len && pattern[pos] === '|') {
      pos++; // consume '|'
      if (namesBefore !== null) {
        activeGroupNames = new Set(namesBefore);
      } else if (activeGroupNames.size > 0) {
        activeGroupNames = new Set();
      }
      const next = parseSequence();
      if (!next.ok) return next;
      if (activeGroupNames.size > 0) {
        if (mergedNames === null) {
          mergedNames = new Set(activeGroupNames);
        } else {
          for (const n of activeGroupNames) {
            mergedNames.add(n);
          }
        }
      }
      branches.push(next.value);
    }
    if (mergedNames !== null) {
      activeGroupNames = mergedNames;
    } else if (activeGroupNames.size > 0) {
      activeGroupNames = new Set();
    }
    return { ok: true, value: { type: 'alt', branches } };
  }

  const ast = parseAlternation();
  if (!ast.ok) return ast;
  if (pos !== len) {
    return { ok: false, reason: SYNTAX_ERROR_REASON };
  }
  return ast;
}

function cappedAdd(a: number, b: number, cap = MAX_PATH_MULT): number {
  const s = a + b;
  return s >= cap ? cap : s;
}

function cappedMul(a: number, b: number, cap = MAX_PATH_MULT): number {
  if (a === 0 || b === 0) return 0;
  const p = a * b;
  return p >= cap ? cap : p;
}

function canonicalizeNonAscii(cp: number): number {
  if (cp >= 0xd800 && cp <= 0xdfff) return cp;
  const upper = String.fromCharCode(cp).toUpperCase();
  if (upper.length === 1) {
    const uc = upper.charCodeAt(0);
    if (uc >= NON_ASCII_MIN) return uc;
  }
  return cp;
}

function isSingleLiteralCharSet(cs: CharSet): boolean {
  if (cs.asciiUnknown) return false;
  if (cs.nonAsciiMode === 'none') {
    const cnt = popcount32(cs.ascii0) + popcount32(cs.ascii1) + popcount32(cs.ascii2) + popcount32(cs.ascii3);
    if (cnt === 1) return true;
    // Exactly one ASCII letter folded under /i: identical single bit in [A-Z] and [a-z]
    return cnt === 2 && cs.ascii0 === 0 && cs.ascii1 === 0 && cs.ascii2 === cs.ascii3 &&
      popcount32(cs.ascii2) === 1 && (cs.ascii2 & ~0x07fffffe) === 0;
  }
  if (cs.nonAsciiMode === 'include' && (cs.ascii0 | cs.ascii1 | cs.ascii2 | cs.ascii3) === 0) {
    let total = 0;
    for (let i = 0; i < cs.nonAsciiRanges.length; i++) {
      const r = cs.nonAsciiRanges[i]!;
      total += r[1] - r[0] + 1;
      if (total > 3) return false;
    }
    if (total === 1) return true;
    if (total === 0) return false;
    let canon = -1;
    for (let i = 0; i < cs.nonAsciiRanges.length; i++) {
      const r = cs.nonAsciiRanges[i]!;
      for (let cp = r[0]; cp <= r[1]; cp++) {
        const c = canonicalizeNonAscii(cp);
        if (canon < 0) canon = c;
        else if (c !== canon) return false;
      }
    }
    return canon >= 0;
  }
  return false;
}

function isDirectLookaroundWrapper(node: RegexAstNode): boolean {
  let cur: RegexAstNode = node;
  for (;;) {
    if (cur.type === 'assertion') return cur.body !== null;
    if (cur.type === 'group') cur = cur.body;
    else if (cur.type === 'seq' && cur.items.length === 1) cur = cur.items[0]!;
    else return false;
  }
}

function astHasAnyQuantifier(node: RegexAstNode): boolean {
  if (node.type === 'quantifier') return true;
  if (node.type === 'group') return astHasAnyQuantifier(node.body);
  if (node.type === 'assertion') return node.body !== null && astHasAnyQuantifier(node.body);
  if (node.type === 'seq') return node.items.some(astHasAnyQuantifier);
  if (node.type === 'alt') return node.branches.some(astHasAnyQuantifier);
  return false;
}

function isAstEmpty(node: RegexAstNode): boolean {
  switch (node.type) {
    case 'empty':
    case 'assertion':
      return true;
    case 'group':
      return isAstEmpty(node.body);
    case 'seq':
      return node.items.every(isAstEmpty);
    case 'alt':
      return node.branches.some(isAstEmpty);
    case 'quantifier':
      return node.max === 0 || isAstEmpty(node.body);
    default:
      return false;
  }
}

function bfsReach(seeds: readonly number[], adj: number[][], n: number, allowed?: Uint8Array): Uint8Array {
  const vis = new Uint8Array(n + 1);
  const q: number[] = [];
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i]!;
    if (vis[s] === 0) { vis[s] = 1; q.push(s); }
  }
  for (let qh = 0; qh < q.length; qh++) {
    const tos = adj[q[qh]!]!;
    for (let i = 0; i < tos.length; i++) {
      const v = tos[i]!;
      if (vis[v] === 0 && (!allowed || allowed[v] === 1)) { vis[v] = 1; q.push(v); }
    }
  }
  return vis;
}

interface LookaroundInfo {
  isLookbehind: boolean;
  inRepeating: boolean;
  states: number;
  hasCycle: boolean;
  bodyAst: RegexAstNode;
}

interface PrepassResult {
  lookaroundMap: Map<RegexAstNode, LookaroundInfo>;
  totalLookarounds: number;
  totalLookbehindStates: number;
  maxRepeatingLookaheadDepth: number;
  maxRepeatingLookaheadWork: number;
  capturesInRepeating: number;
  totalCaptures: number;
}

interface NfaMetrics {
  numStates: number; nonLitStates: number; hasCycle: boolean; hasBroadLoop: boolean;
  unanchoredIda: number; anchoredIda: number; leadingCycleCount: number;
  maxPostLeadingCluster: number; maxLeadingCyclePreMult: number;
  maxLeadingCycleStates: number; maxLeadingCycleNonLitStates: number;
  maxLeadingCycleExitFanout: number; maxLeadingCycleNonLitExitFanout: number;
  maxLeadingCycleComplexExits: number; totalStartPumpableNonLitExits: number;
  hasLeadingComplexCycle: boolean;
  hasLeadingCycleBacktrack: boolean; maxCycleEntryPreds: number;
  safePunctPairCount: number; safePunctDirectPreds: number; maxSafePunctExitFanout: number;
  maxCycleOverlapWork: number; maxCycleOverlapCost: number; maxCycleEpsExit: number;
  nonLeadingCycleCost: number;
  maxPathMult: number; maxRawStatePaths: number; totalDagWork: number; branchedDagWork: number;
  maxUnaryDeepWork: number; maxUnaryRunDepth: number; maxPeriod2RunDepth: number;
  leadingNonLitWork: number; maxSharedPrefixWork: number;
  maxClassDagLen: number; maxDagDepth: number; maxStartOverlap: number;
  capturesInRepeating: number;
  totalLookbehindStates: number; maxRepeatingLookaheadDepth: number; maxRepeatingLookaheadWork: number;
}

interface GlushkovFrag {
  emptyPaths: number;
  firstPos: number[]; firstMult: number[];
  lastPos: number[]; lastMult: number[];
  entryLookbehinds: LookaroundInfo[] | null;
  entryZeroWidthAssert: boolean;
}

interface CompiledGlushkovNfa {
  numStates: number; hasBackEdge: boolean;
  posCharSet: CharSet[]; posIsBroad: Uint8Array; posIsSingleLit: Uint8Array;
  posHasRepeatingLa: Uint8Array; posHasTrailingAssert: Uint8Array;
  edgeTo: number[][]; edgeMult: number[][]; loopExit: Uint8Array;
  emptyPaths: number; acceptPos: number[]; acceptMult: number[];
  stateLookbehinds: (LookaroundInfo[] | null)[];
}

interface MintermTable {
  numMinterms: number; mintermWords: number; stateCsId: Int32Array;
  csMatchesMinterm: Uint32Array; csMinterms: number[][];
}

interface CyclicAnalysisResult {
  hasBroadLoop: boolean; unanchoredIda: number; anchoredIda: number;
  leadingCycleCount: number; maxPostLeadingCluster: number; maxLeadingCyclePreMult: number;
  maxLeadingCycleStates: number; maxLeadingCycleNonLitStates: number;
  maxLeadingCycleExitFanout: number; maxLeadingCycleNonLitExitFanout: number;
  maxLeadingCycleComplexExits: number; totalStartPumpableNonLitExits: number;
  hasLeadingComplexCycle: boolean;
  hasLeadingCycleBacktrack: boolean; maxCycleEntryPreds: number; safePunctPairCount: number; safePunctDirectPreds: number;
  maxSafePunctExitFanout: number; maxCycleOverlapWork: number; maxCycleOverlapCost: number;
  maxCycleEpsExit: number; nonLeadingCycleCost: number;
}

function validateAstPrepass(root: RegexAstNode, isLookaroundBody: boolean): ParseResult<PrepassResult> {
  const lookaroundMap = new Map<RegexAstNode, LookaroundInfo>();
  let totalLookarounds = 0, totalLookbehinds = 0, totalLookaroundStates = 0, totalLookbehindStates = 0;
  let quantifiedLookaheads = 0, repeatingLookaheads = 0;
  let maxRepeatingLookaheadDepth = 0, maxRepeatingLookaheadWork = 0;
  let capturesInRepeating = 0, totalCaptures = 0;

  function walk(node: RegexAstNode, inRepeating: boolean, finiteRepeatProd: number): ParseResult<null> {
    switch (node.type) {
      case 'empty':
      case 'charClass':
        return { ok: true, value: null };
      case 'backref':
        return { ok: false, reason: 'backreferences are not allowed in rule packs' };
      case 'group':
        if (node.captureIndex !== null) {
          totalCaptures++;
          if (isAstEmpty(node.body)) {
            return { ok: false, reason: 'empty capturing group in regular expression' };
          }
          if (inRepeating && ++capturesInRepeating > MAX_CAPTURES_IN_REPEATING) {
            return { ok: false, reason: 'excessive capturing groups inside repeating quantifier' };
          }
        }
        return walk(node.body, inRepeating, finiteRepeatProd);
      case 'seq':
        for (let i = 0; i < node.items.length; i++) { const r = walk(node.items[i]!, inRepeating, finiteRepeatProd); if (!r.ok) return r; }
        return { ok: true, value: null };
      case 'alt':
        for (let i = 0; i < node.branches.length; i++) { const r = walk(node.branches[i]!, inRepeating, finiteRepeatProd); if (!r.ok) return r; }
        return { ok: true, value: null };
      case 'quantifier': {
        if (inRepeating && node.min !== node.max) return { ok: false, reason: 'nested variable quantifier inside repeating group' };
        if ((node.min === 0 || node.max >= 2) && isDirectLookaroundWrapper(node.body)) {
          return { ok: false, reason: 'quantified lookaround assertion' };
        }
        const nextFinite = Number.isFinite(node.max) && node.max >= 2
          ? cappedMul(finiteRepeatProd, node.max, MAX_FINITE_QUANTIFIER_BOUND + 1)
          : finiteRepeatProd;
        return walk(node.body, inRepeating || node.max >= 2, nextFinite);
      }
      case 'assertion': {
        if (node.body === null) return { ok: true, value: null };
        if (isLookaroundBody) return { ok: false, reason: 'nested lookaround assertion' };
        if (++totalLookarounds > MAX_LOOKAROUNDS_PER_REGEX) return { ok: false, reason: 'excessive lookaround assertions' };
        if (node.isLookbehind) {
          if (++totalLookbehinds > MAX_LOOKBEHINDS_PER_REGEX) return { ok: false, reason: 'excessive lookbehind assertions' };
          if (inRepeating) return { ok: false, reason: 'lookbehind assertion inside repeating group' };
          if (astHasAnyQuantifier(node.body)) return { ok: false, reason: 'quantified lookbehind assertion' };
        } else if (inRepeating) {
          if (++repeatingLookaheads > 1) return { ok: false, reason: 'multiple lookaheads inside repeating group' };
          if (finiteRepeatProd > MAX_REPEATING_LOOKAHEAD_BOUND) {
            return { ok: false, reason: 'lookahead inside large bounded repetition' };
          }
          if (astHasAnyQuantifier(node.body)) return { ok: false, reason: 'quantified lookahead inside repeating group' };
        }
        const bodyRes = analyzeAstNfa(node.body, true, MAX_LOOKAHEAD_BODY_STATES);
        if (!bodyRes.ok) return bodyRes;
        const bm = bodyRes.value;
        if (bm.anchoredIda > 1) return { ok: false, reason: 'ambiguous lookaround assertion' };
        if (bm.hasBroadLoop) return { ok: false, reason: 'broad wildcard loop inside lookaround assertion' };
        if (node.isLookbehind) {
          if (bm.hasCycle || bm.maxPathMult > 1 || bm.numStates > MAX_LOOKBEHIND_STATES) {
            return { ok: false, reason: 'unsafe lookbehind assertion' };
          }
          totalLookbehindStates += bm.numStates;
        } else if (inRepeating) {
          if (bm.nonLitStates > 0 || bm.hasCycle || bm.maxPathMult > 1 || bm.numStates > MAX_REPEATING_LOOKAHEAD_STATES ||
              bm.maxDagDepth > MAX_REPEATING_LOOKAHEAD_DEPTH || bm.maxStartOverlap > 1) {
            return { ok: false, reason: 'unsafe lookahead inside repeating group' };
          }
          if (bm.maxDagDepth > maxRepeatingLookaheadDepth) maxRepeatingLookaheadDepth = bm.maxDagDepth;
          if (finiteRepeatProd > 1) {
            const w = bm.numStates * finiteRepeatProd;
            if (w > maxRepeatingLookaheadWork) maxRepeatingLookaheadWork = w;
          }
        } else {
          if (bm.numStates > MAX_LOOKAHEAD_STATES || bm.maxPathMult > 2) return { ok: false, reason: 'unsafe lookahead assertion' };
          if (bm.hasCycle) {
            if (++quantifiedLookaheads > 1) return { ok: false, reason: 'multiple quantified lookahead assertions' };
            if (bm.numStates > 16 || bm.maxCycleOverlapWork > 2) return { ok: false, reason: 'unsafe quantified lookahead assertion' };
          }
        }
        if ((totalLookaroundStates += bm.numStates) > MAX_TOTAL_LOOKAROUND_STATES) {
          return { ok: false, reason: 'lookaround assertions exceed safe state budget' };
        }
        lookaroundMap.set(node, {
          isLookbehind: node.isLookbehind, inRepeating, states: bm.numStates, hasCycle: bm.hasCycle, bodyAst: node.body,
        });
        return { ok: true, value: null };
      }
    }
  }
  const res = walk(root, false, 1);
  return res.ok
    ? {
        ok: true,
        value: {
          lookaroundMap, totalLookarounds, totalLookbehindStates,
          maxRepeatingLookaheadDepth, maxRepeatingLookaheadWork, capturesInRepeating, totalCaptures,
        },
      }
    : res;
}

function compileGlushkovNfa(
  root: RegexAstNode,
  maxStates: number,
  lookaroundMap: Map<RegexAstNode, LookaroundInfo>
): ParseResult<CompiledGlushkovNfa> {
  let numStates = 0, totalEdges = 0, hasBackEdge = false, repLaMarkCount = 0;
  let failReason: string | null = null;
  const posCharSet: CharSet[] = [CHARSET_ANY];
  const posIsBroadArr = new Uint8Array(maxStates + 1);
  const posIsSingleLitArr = new Uint8Array(maxStates + 1);
  const posHasRepeatingLaArr = new Uint8Array(maxStates + 1);
  const posHasTrailingAssertArr = new Uint8Array(maxStates + 1);
  const loopExitArr = new Uint8Array(maxStates + 1);
  const edgeTo: number[][] = [[]], edgeMult: number[][] = [[]];
  const stateLookbehinds: (LookaroundInfo[] | null)[] = [null];

  const attachLb = (s: number, list: LookaroundInfo[] | null): void => {
    if (!list || list.length === 0) return;
    let dst = stateLookbehinds[s];
    if (!dst) { dst = []; stateLookbehinds[s] = dst; }
    for (let i = 0; i < list.length; i++) dst.push(list[i]!);
  };
  const mergeLb = (a: LookaroundInfo[] | null, b: LookaroundInfo[] | null): LookaroundInfo[] | null => {
    if (a === null) return b;
    if (b === null) return a;
    for (let i = 0; i < b.length; i++) a.push(b[i]!);
    return a;
  };
  const allocState = (cs: CharSet): number => {
    if (++numStates > maxStates) { failReason = 'pattern automaton exceeds safe state limit'; return -1; }
    posCharSet.push(cs);
    if (isBroadWildcardCharSet(cs)) posIsBroadArr[numStates] = 1;
    if (isSingleLiteralCharSet(cs)) posIsSingleLitArr[numStates] = 1;
    edgeTo.push([]); edgeMult.push([]); stateLookbehinds.push(null);
    return numStates;
  };
  const addNewEdge = (u: number, v: number, m: number): boolean => {
    if (++totalEdges > MAX_NFA_EDGES) { failReason = 'pattern automaton exceeds safe transition limit'; return false; }
    edgeTo[u]!.push(v); edgeMult[u]!.push(m);
    return true;
  };
  const addEdgeDedup = (u: number, v: number, m: number): boolean => {
    const tos = edgeTo[u]!, mults = edgeMult[u]!;
    for (let i = 0; i < tos.length; i++) {
      if (tos[i] === v) { mults[i] = cappedAdd(mults[i]!, m); return true; }
    }
    return addNewEdge(u, v, m);
  };
  const makeEmpty = (): GlushkovFrag => ({
    emptyPaths: 1, firstPos: [], firstMult: [], lastPos: [], lastMult: [],
    entryLookbehinds: null, entryZeroWidthAssert: false,
  });

  function concatFrags(a: GlushkovFrag, b: GlushkovFrag): GlushkovFrag | null {
    if (totalEdges + a.lastPos.length * b.firstPos.length > MAX_NFA_EDGES) {
      failReason = 'pattern automaton exceeds safe transition limit';
      return null;
    }
    for (let i = 0; i < a.lastPos.length; i++) {
      const u = a.lastPos[i]!, mu = a.lastMult[i]!;
      if (b.entryLookbehinds !== null) attachLb(u, b.entryLookbehinds);
      if (b.entryZeroWidthAssert) posHasTrailingAssertArr[u] = 1;
      for (let j = 0; j < b.firstPos.length; j++) {
        if (!addNewEdge(u, b.firstPos[j]!, cappedMul(mu, b.firstMult[j]!))) return null;
      }
    }
    if (a.emptyPaths > 0) {
      for (let j = 0; j < b.firstPos.length; j++) {
        a.firstPos.push(b.firstPos[j]!); a.firstMult.push(cappedMul(a.emptyPaths, b.firstMult[j]!));
      }
    }
    if (b.emptyPaths > 0) {
      for (let i = 0; i < a.lastPos.length; i++) {
        b.lastPos.push(a.lastPos[i]!); b.lastMult.push(cappedMul(a.lastMult[i]!, b.emptyPaths));
      }
    }
    return {
      emptyPaths: cappedMul(a.emptyPaths, b.emptyPaths),
      firstPos: a.firstPos, firstMult: a.firstMult, lastPos: b.lastPos, lastMult: b.lastMult,
      entryLookbehinds: a.emptyPaths > 0 ? mergeLb(a.entryLookbehinds, b.entryLookbehinds) : a.entryLookbehinds,
      entryZeroWidthAssert: a.entryZeroWidthAssert || (a.emptyPaths > 0 && b.entryZeroWidthAssert),
    };
  }

  function foldConcat(frags: GlushkovFrag[], count: number): GlushkovFrag | null {
    let acc = frags[0]!;
    for (let k = 1; k < count; k++) {
      const m = concatFrags(acc, frags[k]!);
      if (m === null) return null;
      acc = m;
    }
    return acc;
  }

  function compile(node: RegexAstNode): GlushkovFrag | null {
    if (failReason !== null) return null;
    switch (node.type) {
      case 'empty': return makeEmpty();
      case 'backref': failReason = 'backreferences are not allowed in rule packs'; return null;
      case 'charClass': {
        const p = allocState(node.cs);
        return p < 0
          ? null
          : { emptyPaths: 0, firstPos: [p], firstMult: [1], lastPos: [p], lastMult: [1], entryLookbehinds: null, entryZeroWidthAssert: false };
      }
      case 'assertion': {
        if (node.body === null) {
          return { emptyPaths: 1, firstPos: [], firstMult: [], lastPos: [], lastMult: [], entryLookbehinds: null, entryZeroWidthAssert: true };
        }
        const info = lookaroundMap.get(node);
        if (!info) return makeEmpty();
        if (info.inRepeating) { repLaMarkCount++; return makeEmpty(); }
        if (info.isLookbehind) {
          return { emptyPaths: 1, firstPos: [], firstMult: [], lastPos: [], lastMult: [], entryLookbehinds: [info], entryZeroWidthAssert: false };
        }
        const bf = compile(info.bodyAst);
        return bf === null
          ? null
          : {
              emptyPaths: 1, firstPos: bf.firstPos, firstMult: bf.firstMult, lastPos: [], lastMult: [],
              entryLookbehinds: null, entryZeroWidthAssert: bf.firstPos.length === 0,
            };
      }
      case 'group': return compile(node.body);
      case 'seq': {
        if (node.items.length === 0) return makeEmpty();
        let acc = compile(node.items[0]!);
        if (acc === null) return null;
        for (let i = 1; i < node.items.length; i++) {
          const it = node.items[i]!;
          if (it.type === 'charClass') {
            const p = allocState(it.cs);
            if (p < 0) return null;
            for (let j = 0; j < acc.lastPos.length; j++) if (!addNewEdge(acc.lastPos[j]!, p, acc.lastMult[j]!)) return null;
            if (acc.emptyPaths > 0) { acc.firstPos.push(p); acc.firstMult.push(acc.emptyPaths); }
            acc.emptyPaths = 0;
            acc.lastPos.length = 1; acc.lastPos[0] = p;
            acc.lastMult.length = 1; acc.lastMult[0] = 1;
          } else {
            const next = compile(it);
            if (next === null || (acc = concatFrags(acc, next)) === null) return null;
          }
        }
        return acc;
      }
      case 'alt': {
        if (node.branches.length === 0) return makeEmpty();
        const acc = compile(node.branches[0]!);
        if (acc === null) return null;
        for (let i = 1; i < node.branches.length; i++) {
          const br = compile(node.branches[i]!);
          if (br === null) return null;
          acc.emptyPaths = cappedAdd(acc.emptyPaths, br.emptyPaths);
          for (let j = 0; j < br.firstPos.length; j++) { acc.firstPos.push(br.firstPos[j]!); acc.firstMult.push(br.firstMult[j]!); }
          for (let j = 0; j < br.lastPos.length; j++) { acc.lastPos.push(br.lastPos[j]!); acc.lastMult.push(br.lastMult[j]!); }
          acc.entryLookbehinds = mergeLb(acc.entryLookbehinds, br.entryLookbehinds);
          acc.entryZeroWidthAssert = acc.entryZeroWidthAssert || br.entryZeroWidthAssert;
        }
        return acc;
      }
      case 'quantifier': {
        const { min, max, body } = node;
        if (max === 0) return makeEmpty();
        if (min === 1 && max === 1) return compile(body);
        if (min === 0 && max === 1) {
          const f = compile(body);
          if (f === null) return null;
          f.emptyPaths = cappedAdd(f.emptyPaths, 1);
          return f;
        }
        if (Number.isFinite(max)) {
          if (max > maxStates) { failReason = 'pattern automaton exceeds safe state limit'; return null; }
          const copies: GlushkovFrag[] = [];
          for (let k = 0; k < max; k++) {
            const ck = compile(body);
            if (ck === null) return null;
            if (k === 0 && ck.emptyPaths >= 1) { failReason = 'nullable body inside repeating quantifier'; return null; }
            copies.push(ck);
          }
          if (min === max) return foldConcat(copies, max);
          // Right-nested linear-chain unrolling: E^min * (E(E(...)?)?)?
          let tail = copies[max - 1]!;
          tail.emptyPaths = 1;
          for (let k = max - 2; k >= min; k--) {
            const m = concatFrags(copies[k]!, tail);
            if (m === null) return null;
            tail = m; tail.emptyPaths = 1;
          }
          if (min === 0) return tail;
          const prefix = foldConcat(copies, min);
          return prefix === null ? null : concatFrags(prefix, tail);
        }
        if (min > maxStates) { failReason = 'pattern automaton exceeds safe state limit'; return null; }
        let prefix: GlushkovFrag | null = null;
        if (min >= 2) {
          const pCopies: GlushkovFrag[] = [];
          for (let k = 0; k < min - 1; k++) {
            const pk = compile(body);
            if (pk === null) return null;
            if (k === 0 && pk.emptyPaths >= 1) { failReason = 'nullable body inside repeating quantifier'; return null; }
            pCopies.push(pk);
          }
          prefix = foldConcat(pCopies, min - 1);
          if (prefix === null) return null;
        }
        const beforeRepLa = repLaMarkCount, beforeStates = numStates;
        const lf = compile(body);
        if (lf === null) return null;
        if (lf.emptyPaths >= 1) { failReason = 'nullable body inside repeating quantifier'; return null; }
        if (repLaMarkCount > beforeRepLa) {
          for (let s = beforeStates + 1; s <= numStates; s++) posHasRepeatingLaArr[s] = 1;
        }
        if (lf.lastPos.length * lf.firstPos.length > MAX_NFA_EDGES) {
          failReason = 'pattern automaton exceeds safe transition limit';
          return null;
        }
        hasBackEdge = true;
        for (let i = 0; i < lf.lastPos.length; i++) {
          const u = lf.lastPos[i]!, mu = lf.lastMult[i]!;
          loopExitArr[u] = 1;
          if (lf.entryLookbehinds !== null) attachLb(u, lf.entryLookbehinds);
          if (lf.entryZeroWidthAssert) posHasTrailingAssertArr[u] = 1;
          for (let j = 0; j < lf.firstPos.length; j++) {
            if (!addEdgeDedup(u, lf.firstPos[j]!, cappedMul(mu, lf.firstMult[j]!))) return null;
          }
        }
        if (min === 0) { lf.emptyPaths = 1; return lf; }
        return prefix === null ? lf : concatFrags(prefix, lf);
      }
    }
  }

  const top = compile(root);
  if (top === null || failReason !== null) {
    return { ok: false, reason: failReason ?? 'pattern automaton exceeds safe complexity limit' };
  }
  attachLb(0, top.entryLookbehinds);
  for (let i = 0; i < top.firstPos.length; i++) {
    if (!addNewEdge(0, top.firstPos[i]!, top.firstMult[i]!)) {
      return { ok: false, reason: failReason ?? 'pattern automaton exceeds safe transition limit' };
    }
  }
  return {
    ok: true,
    value: {
      numStates, hasBackEdge, posCharSet,
      posIsBroad: posIsBroadArr.subarray(0, numStates + 1),
      posIsSingleLit: posIsSingleLitArr.subarray(0, numStates + 1),
      posHasRepeatingLa: posHasRepeatingLaArr.subarray(0, numStates + 1),
      posHasTrailingAssert: posHasTrailingAssertArr.subarray(0, numStates + 1),
      edgeTo, edgeMult, loopExit: loopExitArr.subarray(0, numStates + 1),
      emptyPaths: top.emptyPaths, acceptPos: top.lastPos, acceptMult: top.lastMult, stateLookbehinds,
    },
  };
}

function computeMinterms(nfa: CompiledGlushkovNfa): MintermTable {
  const n = nfa.numStates;
  const stateCsId = new Int32Array(n + 1);
  const uniqueCs: CharSet[] = [];
  const refMap = new Map<CharSet, number>();
  const singleNonAsciiMap = new Map<number, number>();
  const hashHead = new Map<number, number>();
  const hashNext = new Int32Array(n).fill(-1);

  for (let s = 1; s <= n; s++) {
    const cs = nfa.posCharSet[s]!;
    const byRef = refMap.get(cs);
    if (byRef !== undefined) { stateCsId[s] = byRef; continue; }
    const ranges = cs.nonAsciiRanges;
    if (
      !cs.asciiUnknown &&
      (cs.ascii0 | cs.ascii1 | cs.ascii2 | cs.ascii3) === 0 &&
      cs.nonAsciiMode === 'include' &&
      ranges.length === 1 &&
      ranges[0]![0] === ranges[0]![1]
    ) {
      const code = ranges[0]![0];
      const byCode = singleNonAsciiMap.get(code);
      if (byCode !== undefined) { refMap.set(cs, byCode); stateCsId[s] = byCode; continue; }
      const id = uniqueCs.length;
      uniqueCs.push(cs); refMap.set(cs, id); singleNonAsciiMap.set(code, id); stateCsId[s] = id;
      continue;
    }
    const modeCode = cs.nonAsciiMode === 'none' ? 0 : cs.nonAsciiMode === 'include' ? 1 : cs.nonAsciiMode === 'exclude' ? 2 : 3;
    let h = Math.imul(cs.ascii0 ^ 0x811c9dc5, 0x01000193);
    h = Math.imul(h ^ cs.ascii1, 0x01000193);
    h = Math.imul(h ^ cs.ascii2, 0x01000193);
    h = Math.imul(h ^ cs.ascii3, 0x01000193);
    h = Math.imul(h ^ (modeCode | (cs.asciiUnknown ? 4 : 0) | (ranges.length << 4)), 0x01000193);
    for (let i = 0; i < ranges.length; i++) {
      h = Math.imul(h ^ ((ranges[i]![0] << 16) | ranges[i]![1]), 0x01000193);
    }
    let found = -1;
    const head = hashHead.get(h);
    if (head !== undefined) {
      for (let candId = head; candId !== -1; candId = hashNext[candId]!) {
        const c = uniqueCs[candId]!;
        if (
          c.ascii0 === cs.ascii0 && c.ascii1 === cs.ascii1 && c.ascii2 === cs.ascii2 && c.ascii3 === cs.ascii3 &&
          c.asciiUnknown === cs.asciiUnknown && c.nonAsciiMode === cs.nonAsciiMode &&
          c.nonAsciiRanges.length === ranges.length
        ) {
          let same = true;
          for (let i = 0; i < ranges.length; i++) {
            if (c.nonAsciiRanges[i]![0] !== ranges[i]![0] || c.nonAsciiRanges[i]![1] !== ranges[i]![1]) {
              same = false; break;
            }
          }
          if (same) { found = candId; break; }
        }
      }
    }
    if (found !== -1) { refMap.set(cs, found); stateCsId[s] = found; continue; }
    const id = uniqueCs.length;
    uniqueCs.push(cs); refMap.set(cs, id); stateCsId[s] = id;
    hashNext[id] = head !== undefined ? head : -1;
    hashHead.set(h, id);
  }

  const k = uniqueCs.length;
  if (k === 0) return { numMinterms: 0, mintermWords: 0, stateCsId, csMatchesMinterm: new Uint32Array(0), csMinterms: [] };

  let u0 = 0, u1 = 0, u2 = 0, u3 = 0, hasNonAscii = false, hasUnknownNonAscii = false;
  const asciiMaskSeen = new Set<string>();
  const asciiMasks: [number, number, number, number][] = [];
  for (let i = 0; i < k; i++) {
    const cs = uniqueCs[i]!;
    if (cs.nonAsciiMode !== 'none') hasNonAscii = true;
    if (cs.nonAsciiMode === 'unknown') hasUnknownNonAscii = true;
    const a0 = cs.ascii0 >>> 0, a1 = cs.ascii1 >>> 0, a2 = cs.ascii2 >>> 0, a3 = cs.ascii3 >>> 0;
    if ((a0 | a1 | a2 | a3) === 0) continue;
    u0 = (u0 | a0) >>> 0; u1 = (u1 | a1) >>> 0; u2 = (u2 | a2) >>> 0; u3 = (u3 | a3) >>> 0;
    const mk = `${a0},${a1},${a2},${a3}`;
    if (!asciiMaskSeen.has(mk)) { asciiMaskSeen.add(mk); asciiMasks.push([a0, a1, a2, a3]); }
  }

  let asciiBlocks: [number, number, number, number][] = (u0 | u1 | u2 | u3) !== 0 ? [[u0, u1, u2, u3]] : [];
  for (let i = 0; i < asciiMasks.length; i++) {
    const [c0, c1, c2, c3] = asciiMasks[i]!;
    const next: [number, number, number, number][] = [];
    for (let j = 0; j < asciiBlocks.length; j++) {
      const [b0, b1, b2, b3] = asciiBlocks[j]!;
      const in0 = (b0 & c0) >>> 0, in1 = (b1 & c1) >>> 0, in2 = (b2 & c2) >>> 0, in3 = (b3 & c3) >>> 0;
      const out0 = (b0 & ~c0) >>> 0, out1 = (b1 & ~c1) >>> 0, out2 = (b2 & ~c2) >>> 0, out3 = (b3 & ~c3) >>> 0;
      if ((in0 | in1 | in2 | in3) !== 0 && (out0 | out1 | out2 | out3) !== 0) {
        next.push([in0, in1, in2, in3], [out0, out1, out2, out3]);
      } else {
        next.push(asciiBlocks[j]!);
      }
    }
    asciiBlocks = next;
  }

  // O(E log E + E) sweep-line over non-ASCII BMP [0x80..0xFFFF] with sparse active-set hashing
  const alwaysActive: number[] = [];
  const unknownList: number[] = [];
  const fullExcludeList: number[] = [];
  const nonAsciiDynFlat: number[] = [];
  const nonAsciiDynOff: number[] = [];
  const nonAsciiDynLen: number[] = [];
  let extraUnknownOnly = false;
  if (hasNonAscii) {
    let evCount = 0;
    for (let i = 0; i < k; i++) {
      const cs = uniqueCs[i]!;
      if (cs.nonAsciiMode === 'unknown') {
        unknownList.push(i);
        alwaysActive.push(i);
      } else if (cs.nonAsciiMode === 'exclude') {
        if (cs.nonAsciiRanges.length === 0) {
          fullExcludeList.push(i);
          alwaysActive.push(i);
        } else {
          evCount += cs.nonAsciiRanges.length * 2;
        }
      } else if (cs.nonAsciiMode === 'include') {
        evCount += cs.nonAsciiRanges.length * 2;
      }
    }

    const events = new Uint32Array(evCount);
    const h1 = new Int32Array(k);
    const h2 = new Int32Array(k);
    for (let i = 0; i < k; i++) {
      let x = Math.imul(i + 1, 0x9e3779b1);
      x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
      h1[i] = x ^ (x >>> 13);
      let y = Math.imul(i + 1, 0xc2b2ae35);
      y = Math.imul(y ^ (y >>> 15), 0x27d4eb2d);
      h2[i] = y ^ (y >>> 16);
    }

    const activeList = new Int32Array(k);
    const activePos = new Int32Array(k).fill(-1);
    let activeLen = 0, curH1 = 0, curH2 = 0, evWrite = 0;
    for (let i = 0; i < k; i++) {
      const cs = uniqueCs[i]!;
      if (cs.nonAsciiMode === 'include') {
        const ranges = cs.nonAsciiRanges;
        for (let j = 0; j < ranges.length; j++) {
          const r = ranges[j]!;
          events[evWrite++] = ((r[0] << 11) | (i << 1) | 1) >>> 0;
          events[evWrite++] = (((r[1] + 1) << 11) | (i << 1)) >>> 0;
        }
      } else if (cs.nonAsciiMode === 'exclude' && cs.nonAsciiRanges.length > 0) {
        activePos[i] = activeLen;
        activeList[activeLen++] = i;
        curH1 ^= h1[i]!;
        curH2 ^= h2[i]!;
        const ranges = cs.nonAsciiRanges;
        for (let j = 0; j < ranges.length; j++) {
          const r = ranges[j]!;
          events[evWrite++] = ((r[0] << 11) | (i << 1)) >>> 0;
          events[evWrite++] = (((r[1] + 1) << 11) | (i << 1) | 1) >>> 0;
        }
      }
    }
    if (evCount < 128) {
      events.sort();
    } else {
      // 2-pass LSD radix sort on 17-bit coordinate pos = ev >>> 11 (pos ∈ [0x80..0x10000]).
      // Sweep-line processes all events sharing evPos before recordActive(), so intra-pos order is immaterial.
      const tmp = new Uint32Array(evCount);
      const cnt0 = new Int32Array(256);
      for (let i = 0; i < evCount; i++) {
        const b = (events[i]! >>> 11) & 0xff;
        cnt0[b] = cnt0[b]! + 1;
      }
      let acc = 0;
      for (let b = 0; b < 256; b++) {
        const c = cnt0[b]!;
        cnt0[b] = acc;
        acc += c;
      }
      for (let i = 0; i < evCount; i++) {
        const ev = events[i]!;
        const b = (ev >>> 11) & 0xff;
        const dst = cnt0[b]!;
        cnt0[b] = dst + 1;
        tmp[dst] = ev;
      }
      const cnt1 = new Int32Array(257);
      for (let i = 0; i < evCount; i++) {
        const b = tmp[i]! >>> 19;
        cnt1[b] = cnt1[b]! + 1;
      }
      acc = 0;
      for (let b = 0; b < 257; b++) {
        const c = cnt1[b]!;
        cnt1[b] = acc;
        acc += c;
      }
      for (let i = 0; i < evCount; i++) {
        const ev = tmp[i]!;
        const b = ev >>> 19;
        const dst = cnt1[b]!;
        cnt1[b] = dst + 1;
        events[dst] = ev;
      }
    }

    let seenEmptyDyn = false;
    const seenSingle = new Uint8Array(k);
    const setH2: number[] = [];
    const bucketHead = new Map<number, number>();
    const bucketNext: number[] = [];
    const recordActive = (): void => {
      if (activeLen === 0) {
        if (alwaysActive.length > 0 && !seenEmptyDyn) {
          seenEmptyDyn = true;
          nonAsciiDynOff.push(nonAsciiDynFlat.length);
          nonAsciiDynLen.push(0);
          setH2.push(0);
          bucketNext.push(-1);
        }
        return;
      }
      if (activeLen === 1) {
        const only = activeList[0]!;
        if (seenSingle[only] === 1) return;
        seenSingle[only] = 1;
        nonAsciiDynOff.push(nonAsciiDynFlat.length);
        nonAsciiDynLen.push(1);
        nonAsciiDynFlat.push(only);
        setH2.push(0);
        bucketNext.push(-1);
        return;
      }
      const head = bucketHead.get(curH1);
      if (head !== undefined) {
        for (let idx = head; idx !== -1; idx = bucketNext[idx]!) {
          if (setH2[idx] !== curH2 || nonAsciiDynLen[idx] !== activeLen) continue;
          const off = nonAsciiDynOff[idx]!;
          let same = true;
          for (let ei = 0; ei < activeLen; ei++) {
            if (activePos[nonAsciiDynFlat[off + ei]!] === -1) { same = false; break; }
          }
          if (same) return;
        }
      }
      const newIdx = nonAsciiDynOff.length;
      nonAsciiDynOff.push(nonAsciiDynFlat.length);
      nonAsciiDynLen.push(activeLen);
      for (let i = 0; i < activeLen; i++) nonAsciiDynFlat.push(activeList[i]!);
      setH2.push(curH2);
      bucketNext.push(head !== undefined ? head : -1);
      bucketHead.set(curH1, newIdx);
    };

    let prevPos = NON_ASCII_MIN;
    let e = 0;
    while (e < evCount) {
      const evPos = events[e]! >>> 11;
      if (evPos > prevPos) {
        if (prevPos <= NON_ASCII_MAX) recordActive();
        prevPos = evPos;
      }
      if (evPos > NON_ASCII_MAX) break;
      while (e < evCount && (events[e]! >>> 11) === evPos) {
        const ev = events[e++]!;
        const csIdx = (ev >>> 1) & 1023;
        if ((ev & 1) === 1) {
          if (activePos[csIdx] === -1) {
            activePos[csIdx] = activeLen;
            activeList[activeLen++] = csIdx;
            curH1 ^= h1[csIdx]!;
            curH2 ^= h2[csIdx]!;
          }
        } else {
          const p = activePos[csIdx]!;
          if (p !== -1) {
            const last = activeList[--activeLen]!;
            activeList[p] = last;
            activePos[last] = p;
            activePos[csIdx] = -1;
            curH1 ^= h1[csIdx]!;
            curH2 ^= h2[csIdx]!;
          }
        }
      }
    }
    if (prevPos <= NON_ASCII_MAX) recordActive();
    extraUnknownOnly = hasUnknownNonAscii && (fullExcludeList.length > 0 || !seenEmptyDyn);
  }

  const nonAsciiDynCount = nonAsciiDynOff.length;
  const numMinterms = asciiBlocks.length + nonAsciiDynCount + (extraUnknownOnly ? 1 : 0);
  const mintermWords = (numMinterms + 31) >>> 5;
  const csMatchesMinterm = new Uint32Array(k * mintermWords);
  const csMinterms: number[][] = new Array<number[]>(k);
  for (let i = 0; i < k; i++) csMinterms[i] = [];
  for (let m = 0; m < asciiBlocks.length; m++) {
    const [b0, b1, b2, b3] = asciiBlocks[m]!;
    const mw = m >>> 5, mb = 1 << (m & 31);
    for (let i = 0; i < k; i++) {
      const cs = uniqueCs[i]!;
      if (((cs.ascii0 & b0) | (cs.ascii1 & b1) | (cs.ascii2 & b2) | (cs.ascii3 & b3)) !== 0) {
        csMatchesMinterm[i * mintermWords + mw] |= mb; csMinterms[i]!.push(m);
      }
    }
  }
  const alwaysLen = alwaysActive.length;
  for (let nm = 0; nm < nonAsciiDynCount; nm++) {
    const m = asciiBlocks.length + nm, mw = m >>> 5, mb = 1 << (m & 31);
    for (let i = 0; i < alwaysLen; i++) {
      const csIdx = alwaysActive[i]!;
      csMatchesMinterm[csIdx * mintermWords + mw] |= mb; csMinterms[csIdx]!.push(m);
    }
    const off = nonAsciiDynOff[nm]!;
    const end = off + nonAsciiDynLen[nm]!;
    for (let i = off; i < end; i++) {
      const csIdx = nonAsciiDynFlat[i]!;
      csMatchesMinterm[csIdx * mintermWords + mw] |= mb; csMinterms[csIdx]!.push(m);
    }
  }
  if (extraUnknownOnly) {
    const m = asciiBlocks.length + nonAsciiDynCount, mw = m >>> 5, mb = 1 << (m & 31);
    for (let i = 0; i < unknownList.length; i++) {
      const csIdx = unknownList[i]!;
      csMatchesMinterm[csIdx * mintermWords + mw] |= mb; csMinterms[csIdx]!.push(m);
    }
  }
  return { numMinterms, mintermWords, stateCsId, csMatchesMinterm, csMinterms };
}

function runTarjanScc(startNode: number, endNode: number, adj: number[][], allowed: Uint8Array): number[][] {
  const size = endNode + 1;
  const disc = new Int32Array(size).fill(-1), low = new Int32Array(size), onStack = new Uint8Array(size);
  const stack: number[] = [], sccs: number[][] = [];
  let timer = 0;
  function dfs(u: number): void {
    disc[u] = low[u] = timer++;
    stack.push(u); onStack[u] = 1;
    const outs = adj[u]!;
    for (let i = 0; i < outs.length; i++) {
      const v = outs[i]!;
      if (allowed[v] === 0) continue;
      if (disc[v] === -1) { dfs(v); if (low[v]! < low[u]!) low[u] = low[v]!; }
      else if (onStack[v] === 1 && disc[v]! < low[u]!) low[u] = disc[v]!;
    }
    if (low[u] === disc[u]) {
      const comp: number[] = [];
      for (;;) { const w = stack.pop()!; onStack[w] = 0; comp.push(w); if (w === u) break; }
      sccs.push(comp);
    }
  }
  for (let u = startNode; u <= endNode; u++) if (allowed[u] === 1 && disc[u] === -1) dfs(u);
  sccs.reverse();
  return sccs;
}

function computeProductDagDp(
  n: number, topoOrder: number[], rawSccs: number[][], sccOf: Int32Array, isCyclicScc: Uint8Array,
  dagTo: number[][], dagPreds: number[][], dagPredMults: number[][], acceptMultOf: Int32Array,
  nfa: CompiledGlushkovNfa, reachable: Uint8Array, mt: MintermTable
): {
  sameWordDp: Int32Array; rawPathDp: Int32Array; maxPathMult: number; maxRawStatePaths: number;
  totalDagWork: number; branchedDagWork: number;
  prefixSumStates: (states: number[]) => number;
  areStatesCompat: (a: number, b: number) => boolean;
} {
  const stride = n + 1;
  const stateCsId = mt.stateCsId, csMatchesMinterm = mt.csMatchesMinterm, mintermWords = mt.mintermWords;
  const statesOverlap = mintermWords === 1
    ? (a: number, b: number): boolean =>
        (csMatchesMinterm[stateCsId[a]!]! & csMatchesMinterm[stateCsId[b]!]!) !== 0
    : (a: number, b: number): boolean => {
        const aCid = stateCsId[a]!, bCid = stateCsId[b]!;
        const msA = mt.csMinterms[aCid]!;
        if (aCid === bCid) return msA.length > 0;
        if (msA.length === 1) {
          const m = msA[0]!;
          return (csMatchesMinterm[bCid * mintermWords + (m >>> 5)]! & (1 << (m & 31))) !== 0;
        }
        const msB = mt.csMinterms[bCid]!;
        if (msB.length === 1) {
          const m = msB[0]!;
          return (csMatchesMinterm[aCid * mintermWords + (m >>> 5)]! & (1 << (m & 31))) !== 0;
        }
        const aBase = aCid * mintermWords, bBase = bCid * mintermWords;
        for (let w = 0; w < mintermWords; w++) {
          if ((csMatchesMinterm[aBase + w]! & csMatchesMinterm[bBase + w]!) !== 0) return true;
        }
        return false;
      };
  const compat = new Uint32Array(((stride * stride) + 31) >>> 5);
  let overflow = false, offDiag = 0, steps = 0;
  const pqA = [0], pqB = [0];
  compat[0] = 1;
  const sccSeeded = rawSccs.length > 0 ? new Uint8Array(rawSccs.length) : null;

  // Group reachable acyclic states with identical outgoing dagTo[] arrays for exact O(1) BFS & prefix dedup
  const dagToGroupId = new Int32Array(stride).fill(-1);
  let numDagToGroups = 0;
  {
    const groupHead = new Map<number, number>();
    const groupNext = new Int32Array(stride).fill(-1);
    const groupRep = new Int32Array(stride);
    for (let u = 1; u <= n; u++) {
      if (reachable[u] === 0) continue;
      if (rawSccs.length > 0 && isCyclicScc[sccOf[u]!] === 1) continue;
      const outs = dagTo[u]!;
      const oLen = outs.length;
      if (oLen === 0) continue;
      let h = (2166136261 ^ oLen) >>> 0;
      for (let i = 0; i < oLen; i++) {
        h = Math.imul(h ^ outs[i]!, 16777619) >>> 0;
      }
      let matchedGid = -1;
      const gid = groupHead.get(h);
      if (gid !== undefined) {
        for (let cur = gid; cur !== -1; cur = groupNext[cur]!) {
          const repOuts = dagTo[groupRep[cur]!]!;
          if (repOuts.length !== oLen) continue;
          let same = true;
          for (let k = 0; k < oLen; k++) {
            if (repOuts[k] !== outs[k]) { same = false; break; }
          }
          if (same) { matchedGid = cur; break; }
        }
      }
      if (matchedGid === -1) {
        matchedGid = numDagToGroups++;
        groupRep[matchedGid] = u;
        groupNext[matchedGid] = gid !== undefined ? gid : -1;
        groupHead.set(h, matchedGid);
      }
      dagToGroupId[u] = matchedGid;
    }
  }

  const seedCyclicScc = (s: number): void => {
    if (s <= 0 || sccSeeded === null) return;
    const cid = sccOf[s]!;
    if (cid >= 0 && isCyclicScc[cid] === 1 && sccSeeded[cid] === 0) {
      sccSeeded[cid] = 1;
      const comp = rawSccs[cid]!;
      for (let k = 0; k < comp.length; k++) {
        const w = comp[k]!;
        const key = w * stride + w, kw = key >>> 5, kb = 1 << (key & 31);
        if ((compat[kw]! & kb) === 0) { compat[kw] |= kb; pqA.push(w); pqB.push(w); }
      }
    }
  };

  const seenSameSideGroup = new Uint8Array(numDagToGroups);
  const mVisStamp = new Int32Array(mt.numMinterms);
  const mFirstState = new Int32Array(mt.numMinterms);
  let curMVisStamp = 0;

  for (let qh = 0; qh < pqA.length && !overflow; qh++) {
    const a = pqA[qh]!, b = pqB[qh]!;
    const aCyc = a > 0 && rawSccs.length > 0 && isCyclicScc[sccOf[a]!] === 1;
    const bCyc = b > 0 && rawSccs.length > 0 && isCyclicScc[sccOf[b]!] === 1;
    const tosA = aCyc ? nfa.edgeTo[a]! : dagTo[a]!;
    const tosB = bCyc ? nfa.edgeTo[b]! : dagTo[b]!;
    const sameSide = a === b;
    if (sameSide && !aCyc && a > 0) {
      const g = dagToGroupId[a]!;
      if (g >= 0) {
        if (seenSameSideGroup[g] === 1) continue;
        seenSameSideGroup[g] = 1;
      }
    }
    let usedMintermBucket = false;
    if (sameSide && tosA.length > 16) {
      const pairWork = (tosA.length * (tosA.length - 1)) >>> 1;
      let totalPostings = 0;
      for (let i = 0; i < tosA.length; i++) {
        const na = tosA[i]!;
        if (reachable[na] === 0) continue;
        totalPostings += mt.csMinterms[stateCsId[na]!]!.length;
        if (totalPostings >= pairWork) break;
      }
      if (totalPostings < pairWork) {
        usedMintermBucket = true;
        const mSt = ++curMVisStamp;
        let sharedM: Map<number, number[]> | null = null;
        for (let i = 0; i < tosA.length && !overflow; i++) {
          const na = tosA[i]!;
          if (reachable[na] === 0) continue;
          if (++steps > MAX_DAG_PRODUCT_STEPS) { overflow = true; break; }
          const dKey = na * stride + na, dKw = dKey >>> 5, dKb = 1 << (dKey & 31);
          if ((compat[dKw]! & dKb) === 0) {
            compat[dKw] |= dKb;
            pqA.push(na); pqB.push(na);
            seedCyclicScc(na);
          }
          const ms = mt.csMinterms[stateCsId[na]!]!;
          for (let mi = 0; mi < ms.length; mi++) {
            if (++steps > MAX_DAG_PRODUCT_STEPS) { overflow = true; break; }
            const m = ms[mi]!;
            if (mVisStamp[m] !== mSt) {
              mVisStamp[m] = mSt;
              mFirstState[m] = na;
            } else {
              if (sharedM === null) sharedM = new Map<number, number[]>();
              let list = sharedM.get(m);
              if (!list) {
                list = [mFirstState[m]!, na];
                sharedM.set(m, list);
              } else {
                list.push(na);
              }
            }
          }
        }
        if (!overflow && sharedM !== null) {
          for (const list of sharedM.values()) {
            for (let i = 0; i < list.length && !overflow; i++) {
              const p = list[i]!;
              for (let j = i + 1; j < list.length; j++) {
                if (++steps > MAX_DAG_PRODUCT_STEPS) { overflow = true; break; }
                const q = list[j]!;
                if (p === q) continue;
                const lo = p < q ? p : q, hi = p < q ? q : p, key = lo * stride + hi;
                const kw = key >>> 5, kb = 1 << (key & 31);
                if ((compat[kw]! & kb) === 0) {
                  compat[kw] |= kb;
                  if (++offDiag > MAX_DAG_PRODUCT_PAIRS) { overflow = true; break; }
                  pqA.push(lo); pqB.push(hi);
                  seedCyclicScc(p);
                  seedCyclicScc(q);
                }
              }
            }
            if (overflow) break;
          }
        }
      }
    }
    if (!usedMintermBucket) {
      for (let i = 0; i < tosA.length && !overflow; i++) {
        const na = tosA[i]!;
        if (reachable[na] === 0) continue;
        for (let j = sameSide ? i : 0; j < tosB.length; j++) {
          if (++steps > MAX_DAG_PRODUCT_STEPS) { overflow = true; break; }
          const nb = tosB[j]!;
          if (reachable[nb] === 0) continue;
          if (na === nb) {
            const key = na * stride + na, kw = key >>> 5, kb = 1 << (key & 31);
            if ((compat[kw]! & kb) === 0) { compat[kw] |= kb; pqA.push(na); pqB.push(na); seedCyclicScc(na); }
          } else {
            const lo = na < nb ? na : nb, hi = na < nb ? nb : na, key = lo * stride + hi;
            const kw = key >>> 5, kb = 1 << (key & 31);
            if ((compat[kw]! & kb) === 0 && statesOverlap(na, nb)) {
              compat[kw] |= kb;
              if (++offDiag > MAX_DAG_PRODUCT_PAIRS) { overflow = true; break; }
              pqA.push(lo); pqB.push(hi);
              seedCyclicScc(na);
              seedCyclicScc(nb);
            }
          }
        }
      }
    }
  }

  // Exact prefix-compatibility bitsets: uj ∈ prefReachBits[ui] iff ∃ z: compat[ui, z] && z ->* uj
  const words = (stride + 31) >>> 5;
  let reachBits: Uint32Array | null = null;
  let prefReachBits: Uint32Array | null = null;
  let compatPeers: number[][] | null = null;
  const hasOffDiagCompat = new Uint8Array(stride);
  if (!overflow) {
    reachBits = new Uint32Array(stride * words);
    if (rawSccs.length > 0) {
      for (let cid = rawSccs.length - 1; cid >= 0; cid--) {
        const comp = rawSccs[cid]!;
        const rBase = comp[0]! * words;
        for (let k = 0; k < comp.length; k++) {
          const w = comp[k]!;
          reachBits[rBase + (w >>> 5)] |= 1 << (w & 31);
        }
        for (let k = 0; k < comp.length; k++) {
          const outs = dagTo[comp[k]!]!;
          for (let j = 0; j < outs.length; j++) {
            const vBase = outs[j]! * words;
            for (let wi = 0; wi < words; wi++) reachBits[rBase + wi] |= reachBits[vBase + wi]!;
          }
        }
        for (let k = 1; k < comp.length; k++) {
          const wBase = comp[k]! * words;
          for (let wi = 0; wi < words; wi++) reachBits[wBase + wi] = reachBits[rBase + wi]!;
        }
      }
    } else {
      for (let i = topoOrder.length - 1; i >= 0; i--) {
        const u = topoOrder[i]!;
        const uBase = u * words;
        reachBits[uBase + (u >>> 5)] |= 1 << (u & 31);
        const outs = dagTo[u]!;
        for (let j = 0; j < outs.length; j++) {
          const v = outs[j]!;
          if (dagTo[v]!.length === 0) {
            reachBits[uBase + (v >>> 5)] |= 1 << (v & 31);
          } else {
            const vBase = v * words;
            for (let wi = 0; wi < words; wi++) reachBits[uBase + wi] |= reachBits[vBase + wi]!;
          }
        }
      }
    }
    // State 0 reaches all reachable states (plus itself)
    reachBits[0] |= 1;
    for (let s = 1; s <= n; s++) if (reachable[s] === 1) reachBits[s >>> 5] |= 1 << (s & 31);

    compatPeers = new Array<number[]>(stride);
    for (let i = 0; i < stride; i++) compatPeers[i] = [];
    if (offDiag === 0) {
      prefReachBits = reachBits;
      for (let k = 0; k < pqA.length; k++) {
        const a = pqA[k]!;
        compatPeers[a]!.push(a);
      }
    } else {
      prefReachBits = new Uint32Array(reachBits);
      for (let k = 0; k < pqA.length; k++) {
        const a = pqA[k]!, b = pqB[k]!;
        compatPeers[a]!.push(b);
        if (a !== b) {
          compatPeers[b]!.push(a);
          hasOffDiagCompat[a] = 1;
          hasOffDiagCompat[b] = 1;
          const aBase = a * words, bBase = b * words;
          for (let wi = 0; wi < words; wi++) {
            prefReachBits[aBase + wi] |= reachBits[bBase + wi]!;
            prefReachBits[bBase + wi] |= reachBits[aBase + wi]!;
          }
        }
      }
    }
  }

  const sameWordDp = new Int32Array(stride);
  const sameStartDp = new Int32Array(stride);
  const rawPathDp = new Int32Array(stride);
  sameWordDp[0] = 1;
  sameStartDp[0] = 1;
  rawPathDp[0] = 1;

  const nzUScratch = new Int32Array(stride);
  const predContrib = new Int32Array(stride);
  const predStamp = new Int32Array(stride);
  let curCsStamp = 0;
  let compatSumSteps = 0;
  const MAX_COMPAT_SUM_STEPS = 16_384;
  const compatSum = (preds: number[], mults: number[], extraInit: number): number => {
    const pLen = preds.length;
    if (pLen === 0) return extraInit;
    if (pLen === 1) {
      const u = preds[0]!, m = mults[0]!;
      return cappedAdd(extraInit, u === 0 ? m : cappedMul(sameWordDp[u]!, m));
    }
    if (overflow) {
      let total = extraInit;
      for (let i = 0; i < pLen; i++) {
        const u = preds[i]!;
        total = cappedAdd(total, u === 0 ? mults[i]! : cappedMul(sameWordDp[u]!, mults[i]!));
      }
      return total;
    }
    if (offDiag === 0) {
      let initContrib = extraInit, bestNonInit = 0;
      for (let i = 0; i < pLen; i++) {
        const u = preds[i]!;
        if (u === 0) initContrib = cappedAdd(initContrib, mults[i]!);
        else {
          const c = cappedMul(sameWordDp[u]!, mults[i]!);
          if (c > bestNonInit) bestNonInit = c;
        }
      }
      return cappedAdd(initContrib, bestNonInit);
    }
    let initContrib = extraInit, bestNonInit = 0, nzLen = 0;
    const csSt = ++curCsStamp;
    for (let i = 0; i < pLen; i++) {
      const u = preds[i]!;
      if (u === 0) initContrib = cappedAdd(initContrib, mults[i]!);
      else {
        const c = cappedMul(sameWordDp[u]!, mults[i]!);
        if (predStamp[u] === csSt) {
          predContrib[u] = cappedAdd(predContrib[u]!, c);
        } else {
          predStamp[u] = csSt;
          predContrib[u] = c;
          nzUScratch[nzLen++] = u;
        }
      }
    }
    for (let i = 0; i < nzLen; i++) {
      const ui = nzUScratch[i]!;
      let sum = predContrib[ui]!;
      if (hasOffDiagCompat[ui] === 1 && compatPeers !== null) {
        const peers = compatPeers[ui]!;
        if (peers.length < nzLen) {
          for (let pi = 0; pi < peers.length; pi++) {
            if (++compatSumSteps > MAX_COMPAT_SUM_STEPS) { overflow = true; break; }
            const p = peers[pi]!;
            if (p !== ui && predStamp[p] === csSt) {
              sum = cappedAdd(sum, predContrib[p]!);
            }
          }
        } else {
          for (let j = 0; j < nzLen; j++) {
            if (j === i) continue;
            if (++compatSumSteps > MAX_COMPAT_SUM_STEPS) { overflow = true; break; }
            const uj = nzUScratch[j]!;
            const cKey = (ui < uj ? ui : uj) * stride + (ui < uj ? uj : ui);
            if ((compat[cKey >>> 5]! & (1 << (cKey & 31))) !== 0) {
              sum = cappedAdd(sum, predContrib[uj]!);
            }
          }
        }
        if (overflow) break;
      }
      if (sum > bestNonInit) bestNonInit = sum;
    }
    if (overflow) {
      let total = initContrib;
      for (let i = 0; i < nzLen; i++) {
        total = cappedAdd(total, predContrib[nzUScratch[i]!]!);
      }
      return total;
    }
    return cappedAdd(initContrib, bestNonInit);
  };

  let prefSteps = 0;
  let totalPrefMetricSteps = 0;
  const MAX_TOTAL_PREF_METRIC_STEPS = 32_768;
  const vContScratch = new Uint32Array(words);
  const validZpMask = new Uint32Array(words);
  const predsMask = new Uint32Array(words);
  const predMultOf = new Int32Array(stride);
  const pmPredStamp = new Int32Array(stride);
  let curPmStamp = 0;
  const grpStamp = new Int32Array(numDagToGroups);
  const grpExtraFan = new Int32Array(numDagToGroups);
  const grpExtraSs = new Int32Array(numDagToGroups);
  let curGrpStamp = 0;
  let lastNoContPreds: number[] | null = null;
  let lastNoContMults: number[] | null = null;
  let lastNoContRes: { sameStart: number; fanIn: number; maxUp: number } | null = null;
  let lastContCsId = -1;
  let lastContPreds: number[] | null = null;
  let lastContMults: number[] | null = null;
  let lastContRes: { sameStart: number; fanIn: number; maxUp: number } | null = null;

  const samePredArgs = (
    aP: number[] | null, aM: number[] | null, bP: number[], bM: number[] | null
  ): boolean => {
    if (aP === null || aP.length !== bP.length) return false;
    if ((aM === null) !== (bM === null)) return false;
    for (let i = 0; i < bP.length; i++) {
      if (aP[i] !== bP[i]) return false;
      if (bM !== null && aM![i] !== bM[i]) return false;
    }
    return true;
  };

  const computePrefixMetrics = (
    preds: number[], mults: number[] | null, targetState: number
  ): { sameStart: number; fanIn: number; maxUp: number } => {
    if (preds.length === 0) return { sameStart: 0, fanIn: 0, maxUp: 0 };
    let maxUp = 0;
    for (let i = 0; i < preds.length; i++) {
      const u = preds[i]!;
      if (rawPathDp[u]! > maxUp) maxUp = rawPathDp[u]!;
    }
    if (preds.length === 1) {
      const u = preds[0]!, m = mults !== null ? mults[0]! : 1;
      const ss = cappedMul(sameStartDp[u]!, m);
      return { sameStart: ss, fanIn: m, maxUp: Math.max(maxUp, ss, m) };
    }
    if (prefReachBits === null || reachBits === null || compatPeers === null) {
      let ss = 0, fi = 0;
      for (let i = 0; i < preds.length; i++) {
        const u = preds[i]!, m = mults !== null ? mults[i]! : 1;
        ss = cappedAdd(ss, cappedMul(sameStartDp[u]!, m));
        fi = cappedAdd(fi, m);
      }
      return { sameStart: ss, fanIn: fi, maxUp: Math.max(maxUp, ss, fi) };
    }
    if (totalPrefMetricSteps > MAX_TOTAL_PREF_METRIC_STEPS) {
      return { sameStart: MAX_DAG_PATH_MULT + 1, fanIn: MAX_DAG_PATH_MULT + 1, maxUp: MAX_DAG_PATH_MULT + 1 };
    }
    if (
      targetState > 0 &&
      lastContRes !== null &&
      stateCsId[targetState] === lastContCsId &&
      samePredArgs(lastContPreds, lastContMults, preds, mults)
    ) {
      return lastContRes;
    }
    predsMask.fill(0);
    const pSt = ++curPmStamp;
    let allPredMultOne = true;
    let allPredSsOne = true;
    for (let i = 0; i < preds.length; i++) {
      const u = preds[i]!;
      const m = mults !== null ? mults[i]! : 1;
      predsMask[u >>> 5] |= 1 << (u & 31);
      predMultOf[u] = m;
      pmPredStamp[u] = pSt;
      if (m !== 1) allPredMultOne = false;
      if (sameStartDp[u]! !== 1) allPredSsOne = false;
    }
    let useValidZpFilter = false;
    let hasAnyValidZp = true;
    if (targetState > 0 && preds.length >= 16) {
      useValidZpFilter = true;
      hasAnyValidZp = false;
      validZpMask.fill(0);
      for (let s = 1; s <= n; s++) {
        if (reachable[s] === 0 || !statesOverlap(s, targetState)) continue;
        const sBase = s * words;
        for (let wi = 0; wi < words; wi++) {
          if (++totalPrefMetricSteps > MAX_TOTAL_PREF_METRIC_STEPS) {
            return { sameStart: MAX_DAG_PATH_MULT + 1, fanIn: MAX_DAG_PATH_MULT + 1, maxUp: MAX_DAG_PATH_MULT + 1 };
          }
          if ((reachBits[sBase + wi]! & predsMask[wi]!) !== 0) {
            validZpMask[s >>> 5] |= 1 << (s & 31);
            hasAnyValidZp = true;
            break;
          }
        }
      }
      if (
        !hasAnyValidZp &&
        lastNoContRes !== null &&
        samePredArgs(lastNoContPreds, lastNoContMults, preds, mults)
      ) {
        return lastNoContRes;
      }
    }
    const gSt = ++curGrpStamp;
    let bestSameStart = 0, bestFanIn = 0;
    for (let i = 0; i < preds.length; i++) {
      if (++totalPrefMetricSteps > MAX_TOTAL_PREF_METRIC_STEPS) {
        return { sameStart: MAX_DAG_PATH_MULT + 1, fanIn: MAX_DAG_PATH_MULT + 1, maxUp: MAX_DAG_PATH_MULT + 1 };
      }
      const ui = preds[i]!, mi = mults !== null ? mults[i]! : 1;
      const ownSs = cappedMul(sameStartDp[ui]!, mi);
      const gid = ui > 0 && hasOffDiagCompat[ui] === 0 ? dagToGroupId[ui]! : -1;
      if (gid >= 0 && grpStamp[gid] === gSt) {
        const fanSum = cappedAdd(mi, grpExtraFan[gid]!);
        const ssSum = cappedAdd(ownSs, grpExtraSs[gid]!);
        if (fanSum > bestFanIn) bestFanIn = fanSum;
        if (ssSum > bestSameStart) bestSameStart = ssSum;
        if (bestFanIn > MAX_DAG_PATH_MULT || bestSameStart > MAX_DAG_PATH_MULT) break;
        continue;
      }
      const pBase = ui * words;
      const uiW = ui >>> 5, uiB = 1 << (ui & 31);
      if (targetState > 0 && !hasAnyValidZp && allPredMultOne && allPredSsOne) {
        let extraFan = 0, extraSs = 0;
        for (let wi = 0; wi < words; wi++) {
          let mWord = predsMask[wi]!;
          if (wi === uiW) mWord &= ~uiB;
          const rWord = prefReachBits[pBase + wi]! & mWord;
          if (rWord !== 0) extraFan += popcount32(rWord);
        }
        if (hasOffDiagCompat[ui] === 1) {
          const peers = compatPeers[ui]!;
          for (let pi = 0; pi < peers.length; pi++) {
            const p = peers[pi]!;
            if (p !== ui && pmPredStamp[p] === pSt) extraSs++;
          }
        }
        if (extraFan > MAX_PATH_MULT) extraFan = MAX_PATH_MULT;
        if (extraSs > MAX_PATH_MULT) extraSs = MAX_PATH_MULT;
        if (gid >= 0) {
          grpStamp[gid] = gSt;
          grpExtraFan[gid] = extraFan;
          grpExtraSs[gid] = extraSs;
        }
        const fanSum = cappedAdd(mi, extraFan);
        const ssSum = cappedAdd(ownSs, extraSs);
        if (fanSum > bestFanIn) bestFanIn = fanSum;
        if (ssSum > bestSameStart) bestSameStart = ssSum;
        if (bestFanIn > MAX_DAG_PATH_MULT || bestSameStart > MAX_DAG_PATH_MULT) break;
        continue;
      }
      let hasPrefPred = false;
      for (let wi = 0; wi < words; wi++) {
        let mWord = predsMask[wi]!;
        if (wi === uiW) mWord &= ~uiB;
        if ((prefReachBits[pBase + wi]! & mWord) !== 0) { hasPrefPred = true; break; }
      }
      if (!hasPrefPred) {
        if (gid >= 0) {
          grpStamp[gid] = gSt;
          grpExtraFan[gid] = 0;
          grpExtraSs[gid] = 0;
        }
        if (mi > bestFanIn) bestFanIn = mi;
        if (ownSs > bestSameStart) bestSameStart = ownSs;
        if (bestFanIn > MAX_DAG_PATH_MULT || bestSameStart > MAX_DAG_PATH_MULT) break;
        continue;
      }
      let useContFilter = false;
      let hasVContInPreds = false;
      if (targetState > 0) {
        if (!hasAnyValidZp) {
          useContFilter = true;
        } else if (prefSteps <= MAX_DAG_PREFIX_STEPS) {
          vContScratch.fill(0);
          const peers = compatPeers[ui]!;
          let budgetOk = true;
          for (let pi = 0; pi < peers.length && budgetOk; pi++) {
            const z = peers[pi]!;
            const zIsCyclic = z > 0 && rawSccs.length > 0 && isCyclicScc[sccOf[z]!] === 1;
            const zOuts = zIsCyclic ? nfa.edgeTo[z]! : dagTo[z]!;
            for (let ei = 0; ei < zOuts.length; ei++) {
              if (++totalPrefMetricSteps > MAX_TOTAL_PREF_METRIC_STEPS) {
                return { sameStart: MAX_DAG_PATH_MULT + 1, fanIn: MAX_DAG_PATH_MULT + 1, maxUp: MAX_DAG_PATH_MULT + 1 };
              }
              if (++prefSteps > MAX_DAG_PREFIX_STEPS) { budgetOk = false; break; }
              const zp = zOuts[ei]!;
              if (reachable[zp] === 0) continue;
              if (useValidZpFilter && (validZpMask[zp >>> 5]! & (1 << (zp & 31))) === 0) continue;
              if (!zIsCyclic && z !== ui && (reachBits[zp * words + uiW]! & uiB) !== 0) continue;
              if (useValidZpFilter || statesOverlap(zp, targetState)) {
                const zpBase = zp * words;
                for (let wi = 0; wi < words; wi++) {
                  const bits = reachBits[zpBase + wi]! & predsMask[wi]!;
                  if (bits !== 0) {
                    vContScratch[wi] |= bits;
                    hasVContInPreds = true;
                  }
                }
              }
            }
          }
          useContFilter = budgetOk;
        }
      }
      let extraFan = 0, extraSs = 0;
      const uiHasOffDiag = hasOffDiagCompat[ui] === 1;
      if (allPredMultOne && allPredSsOne) {
        for (let wi = 0; wi < words; wi++) {
          let mWord = predsMask[wi]!;
          if (wi === uiW) mWord &= ~uiB;
          const rWord = prefReachBits[pBase + wi]! & mWord;
          if (rWord === 0) continue;
          const cnt = popcount32(rWord);
          extraFan += cnt;
          if (!useContFilter) {
            extraSs += cnt;
          } else if (hasVContInPreds) {
            extraSs += popcount32(rWord & vContScratch[wi]!);
          }
        }
        if (useContFilter && uiHasOffDiag) {
          const peers = compatPeers[ui]!;
          for (let pi = 0; pi < peers.length; pi++) {
            const p = peers[pi]!;
            if (p !== ui && pmPredStamp[p] === pSt) {
              if (!hasVContInPreds || (vContScratch[p >>> 5]! & (1 << (p & 31))) === 0) {
                extraSs++;
              }
            }
          }
        }
        if (extraFan > MAX_PATH_MULT) extraFan = MAX_PATH_MULT;
        if (extraSs > MAX_PATH_MULT) extraSs = MAX_PATH_MULT;
      } else if (useContFilter && !hasVContInPreds) {
        if (allPredMultOne) {
          for (let wi = 0; wi < words; wi++) {
            let mWord = predsMask[wi]!;
            if (wi === uiW) mWord &= ~uiB;
            const rWord = prefReachBits[pBase + wi]! & mWord;
            if (rWord !== 0) extraFan += popcount32(rWord);
          }
          if (extraFan > MAX_PATH_MULT) extraFan = MAX_PATH_MULT;
        } else {
          for (let wi = 0; wi < words; wi++) {
            let mWord = predsMask[wi]!;
            if (wi === uiW) mWord &= ~uiB;
            let w = (prefReachBits[pBase + wi]! & mWord) | 0;
            while (w !== 0) {
              if (++totalPrefMetricSteps > MAX_TOTAL_PREF_METRIC_STEPS) {
                return { sameStart: MAX_DAG_PATH_MULT + 1, fanIn: MAX_DAG_PATH_MULT + 1, maxUp: MAX_DAG_PATH_MULT + 1 };
              }
              const low = w & -w;
              const uj = (wi << 5) | (31 - Math.clz32(low));
              w ^= low;
              extraFan = cappedAdd(extraFan, predMultOf[uj]!);
            }
          }
        }
        if (uiHasOffDiag) {
          const peers = compatPeers[ui]!;
          for (let pi = 0; pi < peers.length; pi++) {
            const p = peers[pi]!;
            if (p !== ui && pmPredStamp[p] === pSt) {
              extraSs = cappedAdd(extraSs, cappedMul(sameStartDp[p]!, predMultOf[p]!));
            }
          }
        }
      } else {
        for (let wi = 0; wi < words; wi++) {
          let mWord = predsMask[wi]!;
          if (wi === uiW) mWord &= ~uiB;
          let w = (prefReachBits[pBase + wi]! & mWord) | 0;
          while (w !== 0) {
            if (++totalPrefMetricSteps > MAX_TOTAL_PREF_METRIC_STEPS) {
              return { sameStart: MAX_DAG_PATH_MULT + 1, fanIn: MAX_DAG_PATH_MULT + 1, maxUp: MAX_DAG_PATH_MULT + 1 };
            }
            const low = w & -w;
            const uj = (wi << 5) | (31 - Math.clz32(low));
            w ^= low;
            const mj = predMultOf[uj]!;
            extraFan = cappedAdd(extraFan, mj);
            let sameLen = false;
            if (uiHasOffDiag) {
              const cKey = (ui < uj ? ui : uj) * stride + (ui < uj ? uj : ui);
              sameLen = (compat[cKey >>> 5]! & (1 << (cKey & 31))) !== 0;
            }
            if (sameLen || !useContFilter || (vContScratch[wi]! & low) !== 0) {
              extraSs = cappedAdd(extraSs, cappedMul(sameStartDp[uj]!, mj));
            }
          }
        }
      }
      if (gid >= 0) {
        grpStamp[gid] = gSt;
        grpExtraFan[gid] = extraFan;
        grpExtraSs[gid] = extraSs;
      }
      const fanSum = cappedAdd(mi, extraFan);
      const ssSum = cappedAdd(ownSs, extraSs);
      if (fanSum > bestFanIn) bestFanIn = fanSum;
      if (ssSum > bestSameStart) bestSameStart = ssSum;
      if (bestFanIn > MAX_DAG_PATH_MULT || bestSameStart > MAX_DAG_PATH_MULT) break;
    }
    const res = { sameStart: bestSameStart, fanIn: bestFanIn, maxUp: Math.max(maxUp, bestSameStart, bestFanIn) };
    if (targetState > 0 && preds.length >= 16) {
      if (!hasAnyValidZp) {
        lastNoContPreds = preds;
        lastNoContMults = mults;
        lastNoContRes = res;
      } else {
        lastContCsId = stateCsId[targetState]!;
        lastContPreds = preds;
        lastContMults = mults;
        lastContRes = res;
      }
    }
    return res;
  };

  const accChainDp = new Int32Array(stride);
  let maxPathMult = Math.max(1, nfa.emptyPaths), maxRawStatePaths = 1, totalDagWork = 0, branchedDagWork = 0;
  if (rawSccs.length > 0) {
    for (let cid = 0; cid < rawSccs.length; cid++) {
      const comp = rawSccs[cid]!;
      if (isCyclicScc[cid] === 0) {
        const v = comp[0]!;
        const vPreds = dagPreds[v]!, vMults = dagPredMults[v]!;
        let dp: number, ss: number, mu: number, bestAcc: number;
        if (vPreds.length === 1) {
          const u = vPreds[0]!, m = vMults[0]!;
          dp = u === 0 ? m : (m === 1 ? sameWordDp[u]! : cappedMul(sameWordDp[u]!, m));
          ss = m === 1 ? sameStartDp[u]! : cappedMul(sameStartDp[u]!, m);
          const ru = rawPathDp[u]!;
          mu = ru >= ss ? (ru >= m ? ru : m) : (ss >= m ? ss : m);
          bestAcc = accChainDp[u]!;
        } else {
          dp = compatSum(vPreds, vMults, 0);
          const pm = computePrefixMetrics(vPreds, vMults, v);
          ss = pm.sameStart; mu = pm.maxUp;
          bestAcc = 0;
          for (let j = 0; j < vPreds.length; j++) {
            const ap = accChainDp[vPreds[j]!]!;
            if (ap > bestAcc) bestAcc = ap;
          }
        }
        sameWordDp[v] = dp; sameStartDp[v] = ss; rawPathDp[v] = mu;
        const ac = bestAcc + (acceptMultOf[v]! > 0 ? 1 : 0);
        accChainDp[v] = ac;
        if (dp > maxPathMult) maxPathMult = dp;
        if (mu > maxRawStatePaths) maxRawStatePaths = mu;
        if (ac > maxRawStatePaths) maxRawStatePaths = ac;
        totalDagWork = cappedAdd(totalDagWork, dp, MAX_DAG_TOTAL_WORK + 1);
        if (dp > 1) branchedDagWork = cappedAdd(branchedDagWork, dp - 1, MAX_DAG_TOTAL_WORK + 1);
        if (maxPathMult > MAX_DAG_PATH_MULT || maxRawStatePaths > MAX_DAG_PATH_MULT) break;
      } else {
        let sccInDp = 1, sccInSS = 1, sccInRaw = 1, bestAcc = 0, hasAcc = 0, maxPureBase = 1;
        for (let k = 0; k < comp.length; k++) {
          const v = comp[k]!;
          const vPreds = dagPreds[v]!, vMults = dagPredMults[v]!;
          const vDp = compatSum(vPreds, vMults, 0);
          if (vDp > sccInDp) sccInDp = vDp;
          if (!overflow) {
            let vInit = 0;
            for (let j = 0; j < vPreds.length; j++) if (vPreds[j] === 0) vInit = cappedAdd(vInit, vMults[j]!);
            const vNonInit = vDp > vInit ? vDp - vInit : 0;
            const vPure = vInit > vNonInit ? vInit : vNonInit;
            if (vPure > maxPureBase) maxPureBase = vPure;
          }
          const pm = computePrefixMetrics(vPreds, vMults, v);
          if (pm.sameStart > sccInSS) sccInSS = pm.sameStart;
          if (pm.maxUp > sccInRaw) sccInRaw = pm.maxUp;
          if (acceptMultOf[v]! > 0) hasAcc = 1;
          for (let j = 0; j < vPreds.length; j++) {
            const ap = accChainDp[vPreds[j]!]!;
            if (ap > bestAcc) bestAcc = ap;
          }
        }
        // Same-word cyclic re-entry & multi-state intra-SCC convergence:
        // counts paths converging at v ∈ comp via intra-SCC edge w -> v alongside compatible
        // external predecessors u > 0 -> v (compat[u, w] === 1) or distinct intra-SCC w2 -> v (compat[w, w2] === 1).
        const baseW = overflow ? sccInDp : maxPureBase;
        if (comp.length === 1) {
          const v = comp[0]!;
          const vPreds = dagPreds[v]!, vMults = dagPredMults[v]!;
          let extAdd = 0;
          for (let j = 0; j < vPreds.length; j++) {
            const u = vPreds[j]!;
            if (u === 0) continue;
            const cKey = (u < v ? u : v) * stride + (u < v ? v : u);
            const isCompat = overflow
              ? statesOverlap(u, v)
              : (compat[cKey >>> 5]! & (1 << (cKey & 31))) !== 0;
            if (isCompat) extAdd = cappedAdd(extAdd, cappedMul(sameWordDp[u]!, vMults[j]!));
          }
          if (extAdd > 0) {
            const convSum = cappedAdd(baseW, extAdd);
            if (convSum > sccInDp) sccInDp = convSum;
          }
        } else {
          for (let k = 0; k < comp.length; k++) {
            const v = comp[k]!;
            const intraW: number[] = [];
            for (let wi = 0; wi < comp.length; wi++) {
              const w = comp[wi]!;
              if (nfa.edgeTo[w]!.includes(v)) intraW.push(w);
            }
            if (intraW.length === 0) continue;
            const vPreds = dagPreds[v]!, vMults = dagPredMults[v]!;
            for (let wi = 0; wi < intraW.length; wi++) {
              const w = intraW[wi]!;
              let convSum = baseW;
              for (let j = 0; j < vPreds.length; j++) {
                const u = vPreds[j]!;
                if (u === 0) continue;
                const cKey = (u < w ? u : w) * stride + (u < w ? w : u);
                const isCompat = overflow
                  ? statesOverlap(u, w)
                  : (compat[cKey >>> 5]! & (1 << (cKey & 31))) !== 0;
                if (isCompat) convSum = cappedAdd(convSum, cappedMul(sameWordDp[u]!, vMults[j]!));
              }
              for (let wj = 0; wj < intraW.length; wj++) {
                if (wj === wi) continue;
                const w2 = intraW[wj]!;
                const cKey = (w < w2 ? w : w2) * stride + (w < w2 ? w2 : w);
                const isCompat = overflow
                  ? statesOverlap(w, w2)
                  : (compat[cKey >>> 5]! & (1 << (cKey & 31))) !== 0;
                if (isCompat) convSum = cappedAdd(convSum, baseW);
              }
              if (convSum > sccInDp) sccInDp = convSum;
            }
          }
        }
        if (sccInDp > sccInSS) sccInSS = sccInDp;
        if (sccInDp > sccInRaw) sccInRaw = sccInDp;
        const ac = bestAcc + hasAcc;
        for (let k = 0; k < comp.length; k++) {
          const v = comp[k]!;
          sameWordDp[v] = sccInDp; sameStartDp[v] = sccInSS; rawPathDp[v] = sccInRaw; accChainDp[v] = ac;
          totalDagWork = cappedAdd(totalDagWork, sccInDp, MAX_DAG_TOTAL_WORK + 1);
          if (sccInDp > 1) branchedDagWork = cappedAdd(branchedDagWork, sccInDp - 1, MAX_DAG_TOTAL_WORK + 1);
        }
        if (sccInDp > maxPathMult) maxPathMult = sccInDp;
        if (sccInRaw > maxRawStatePaths) maxRawStatePaths = sccInRaw;
        if (ac > maxRawStatePaths) maxRawStatePaths = ac;
        if (maxPathMult > MAX_DAG_PATH_MULT || maxRawStatePaths > MAX_DAG_PATH_MULT) break;
      }
    }
  } else {
    for (let i = 0; i < topoOrder.length; i++) {
      const v = topoOrder[i]!;
      const vPreds = dagPreds[v]!, vMults = dagPredMults[v]!;
      let dp: number, ss: number, mu: number, bestAcc: number;
      if (vPreds.length === 1) {
        const u = vPreds[0]!, m = vMults[0]!;
        dp = u === 0 ? m : (m === 1 ? sameWordDp[u]! : cappedMul(sameWordDp[u]!, m));
        ss = m === 1 ? sameStartDp[u]! : cappedMul(sameStartDp[u]!, m);
        const ru = rawPathDp[u]!;
        mu = ru >= ss ? (ru >= m ? ru : m) : (ss >= m ? ss : m);
        bestAcc = accChainDp[u]!;
      } else {
        dp = compatSum(vPreds, vMults, 0);
        const pm = computePrefixMetrics(vPreds, vMults, v);
        ss = pm.sameStart; mu = pm.maxUp;
        bestAcc = 0;
        for (let j = 0; j < vPreds.length; j++) {
          const ap = accChainDp[vPreds[j]!]!;
          if (ap > bestAcc) bestAcc = ap;
        }
      }
      sameWordDp[v] = dp; sameStartDp[v] = ss; rawPathDp[v] = mu;
      const ac = bestAcc + (acceptMultOf[v]! > 0 ? 1 : 0);
      accChainDp[v] = ac;
      if (dp > maxPathMult) maxPathMult = dp;
      if (mu > maxRawStatePaths) maxRawStatePaths = mu;
      if (ac > maxRawStatePaths) maxRawStatePaths = ac;
      totalDagWork = cappedAdd(totalDagWork, dp, MAX_DAG_TOTAL_WORK + 1);
      if (dp > 1) branchedDagWork = cappedAdd(branchedDagWork, dp - 1, MAX_DAG_TOTAL_WORK + 1);
      if (maxPathMult > MAX_DAG_PATH_MULT || maxRawStatePaths > MAX_DAG_PATH_MULT) break;
    }
  }
  const accP: number[] = [], accM: number[] = [];
  for (let i = 0; i < nfa.acceptPos.length; i++) {
    const u = nfa.acceptPos[i]!;
    if (reachable[u] === 1) { accP.push(u); accM.push(nfa.acceptMult[i]!); }
  }
  const acceptDp = compatSum(accP, accM, nfa.emptyPaths);
  if (acceptDp > maxPathMult) maxPathMult = acceptDp;
  return {
    sameWordDp, rawPathDp, maxPathMult, maxRawStatePaths, totalDagWork, branchedDagWork,
    prefixSumStates: (states: number[]) => {
      const pm = computePrefixMetrics(states, null, 0);
      return Math.max(pm.sameStart, pm.fanIn, pm.maxUp);
    },
    areStatesCompat: (a: number, b: number): boolean => {
      if (overflow) return statesOverlap(a, b);
      const lo = a < b ? a : b, hi = a < b ? b : a, key = lo * stride + hi;
      return (compat[key >>> 5]! & (1 << (key & 31))) !== 0;
    },
  };
}

function checkCyclicSccEda(
  comp: number[], cid: number, nfa: CompiledGlushkovNfa, sccOf: Int32Array, cycLocalIdx: Int32Array
): ParseResult<number[][]> {
  const k = comp.length;
  const fwd: number[][] = Array.from({ length: k }, () => []);
  const rev: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < k; i++) {
    const u = comp[i]!, tos = nfa.edgeTo[u]!, mults = nfa.edgeMult[u]!;
    for (let j = 0; j < tos.length; j++) {
      if (sccOf[tos[j]!] === cid) {
        if (mults[j]! >= 2) return { ok: false, reason: 'exponential ambiguity inside cyclic component' };
        const lv = cycLocalIdx[tos[j]!]!;
        fwd[i]!.push(lv); rev[lv]!.push(i);
      }
    }
  }
  if (k < 2) return { ok: true, value: fwd };

  const ov = new Uint8Array(k * k);
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      const o = charSetsOverlap(nfa.posCharSet[comp[i]!]!, nfa.posCharSet[comp[j]!]!) ? 1 : 0;
      ov[i * k + j] = ov[j * k + i] = o;
    }
  }
  const canReachDiag = new Uint8Array(k * k);
  const rqa: number[] = [], rqb: number[] = [];
  for (let r = 0; r < k; r++) if (ov[r * k + r] === 1) { canReachDiag[r * k + r] = 1; rqa.push(r); rqb.push(r); }
  for (let qh = 0; qh < rqa.length; qh++) {
    const ra = rev[rqa[qh]!]!, rb = rev[rqb[qh]!]!;
    for (let i = 0; i < ra.length; i++) {
      for (let j = 0; j < rb.length; j++) {
        const pa = ra[i]!, pb = rb[j]!;
        if (ov[pa * k + pb] === 0) continue;
        const lo = pa < pb ? pa : pb, hi = pa < pb ? pb : pa;
        if (canReachDiag[lo * k + hi] === 0) { canReachDiag[lo * k + hi] = 1; rqa.push(lo); rqb.push(hi); }
      }
    }
  }
  for (let p = 0; p < k; p++) {
    const outs = fwd[p]!;
    for (let i = 0; i < outs.length; i++) {
      for (let j = i + 1; j < outs.length; j++) {
        const q1 = outs[i]!, q2 = outs[j]!;
        if (ov[q1 * k + q2] === 0) continue;
        const lo = q1 < q2 ? q1 : q2, hi = q1 < q2 ? q2 : q1;
        if (canReachDiag[lo * k + hi] === 1) return { ok: false, reason: 'exponential ambiguity (EDA) inside repeating group' };
        // Non-prefix-free loop exit check (catches (ab|aba)+ while preserving (?:http://|https://)+)
        const fVis = new Uint8Array(k * k);
        fVis[lo * k + hi] = 1;
        const fa = [lo], fb = [hi];
        for (let qh = 0; qh < fa.length; qh++) {
          const x = fa[qh]!, y = fb[qh]!;
          if (nfa.loopExit[comp[x]!] !== nfa.loopExit[comp[y]!]) {
            return { ok: false, reason: 'ambiguous prefix-overlapping alternation inside repeating group' };
          }
          const fx = fwd[x]!, fy = fwd[y]!;
          for (let a = 0; a < fx.length; a++) {
            for (let b = 0; b < fy.length; b++) {
              const nx = fx[a]!, ny = fy[b]!;
              if (ov[nx * k + ny] === 0) continue;
              const nlo = nx < ny ? nx : ny, nhi = nx < ny ? ny : nx;
              if (fVis[nlo * k + nhi] === 0) { fVis[nlo * k + nhi] = 1; fa.push(nlo); fb.push(nhi); }
            }
          }
        }
      }
    }
  }
  return { ok: true, value: fwd };
}

function checkStartPumpable(
  comp: number[], fwd: number[][], uChars: CharSet, cid: number, sccOf: Int32Array,
  n: number, nfa: CompiledGlushkovNfa, bReach: Uint8Array, idaState: IdaSharedState
): boolean {
  if (comp.length === 1) {
    const p = comp[0]!, pCs = nfa.posCharSet[p]!;
    const pSt = ++idaState.prefStamp;
    const prefVis = idaState.prefVis;
    prefVis[0] = pSt;
    const q = [0];
    for (let qh = 0; qh < q.length; qh++) {
      const tos = nfa.edgeTo[q[qh]!]!;
      for (let i = 0; i < tos.length; i++) {
        const v = tos[i]!;
        if (bReach[v] === 0 || prefVis[v] === pSt || !charSetsOverlap(nfa.posCharSet[v]!, pCs)) continue;
        if (v === p) return true;
        prefVis[v] = pSt; q.push(v);
      }
    }
    return false;
  }

  // O(n) shared-alphabet reachability prefilter: necessary condition for start-pumpable multi-state SCC
  {
    const pSt = ++idaState.prefStamp;
    const prefVis = idaState.prefVis;
    prefVis[0] = pSt;
    const pBfs = [0];
    let canReach = false;
    for (let qh = 0; qh < pBfs.length && !canReach; qh++) {
      const tos = nfa.edgeTo[pBfs[qh]!]!;
      for (let i = 0; i < tos.length; i++) {
        const v = tos[i]!;
        if (bReach[v] === 0 || prefVis[v] === pSt) continue;
        if (sccOf[v] === cid) { canReach = true; break; }
        if (charSetsOverlap(nfa.posCharSet[v]!, uChars)) {
          prefVis[v] = pSt;
          pBfs.push(v);
        }
      }
    }
    if (!canReach) return false;
  }

  const k = comp.length;
  const needVis = (n + 1) * k;
  if (idaState.vis.length < needVis) {
    idaState.vis = new Int32Array(needVis);
    idaState.stamp = 0;
  }
  const vis = idaState.vis;
  for (let pi = 0; pi < k; pi++) {
    const targetU = comp[pi]!;
    const myStamp = ++idaState.stamp;
    vis[pi] = myStamp;
    const qu = [0], qv = [pi];
    for (let qh = 0; qh < qu.length; qh++) {
      const uTos = nfa.edgeTo[qu[qh]!]!, vTos = fwd[qv[qh]!]!;
      for (let i = 0; i < uTos.length; i++) {
        const nu = uTos[i]!;
        if (bReach[nu] === 0) continue;
        for (let j = 0; j < vTos.length; j++) {
          if (++idaState.steps > MAX_IDA_TOTAL_STEPS) { idaState.exceeded = true; return true; }
          const nv = vTos[j]!;
          if (!charSetsOverlap(nfa.posCharSet[nu]!, nfa.posCharSet[comp[nv]!]!)) continue;
          if (nu === targetU && nv === pi) return true;
          const idx = nu * k + nv;
          if (vis[idx] !== myStamp) { vis[idx] = myStamp; qu.push(nu); qv.push(nv); }
        }
      }
    }
  }
  return false;
}

interface IdaSharedState {
  steps: number;
  vis: Int32Array;
  stamp: number;
  prefVis: Int32Array;
  prefStamp: number;
  exceeded: boolean;
}

function checkPairwiseIda(
  compI: number[], compJ: number[], fwdI: number[][], fwdJ: number[][],
  uI: CharSet, uJ: CharSet, cidJ: number, sccOf: Int32Array,
  fReachI: Uint8Array, bReachJ: Uint8Array, n: number, nfa: CompiledGlushkovNfa,
  statesShareMinterm3: (a: number, b: number, c: number) => boolean,
  idaState: IdaSharedState
): boolean {
  const kI = compI.length, kJ = compJ.length;
  if (kI === 1 && kJ === 1) {
    const p = compI[0]!, q = compJ[0]!;
    if (!charSetsOverlap(nfa.posCharSet[p]!, nfa.posCharSet[q]!)) return false;
    const pSt = ++idaState.prefStamp;
    const prefVis = idaState.prefVis;
    const bfs = [p];
    for (let qh = 0; qh < bfs.length; qh++) {
      const tos = nfa.edgeTo[bfs[qh]!]!;
      for (let i = 0; i < tos.length; i++) {
        if (++idaState.steps > MAX_IDA_TOTAL_STEPS) { idaState.exceeded = true; return true; }
        const nr = tos[i]!;
        if (fReachI[nr] === 0 || bReachJ[nr] === 0 || !statesShareMinterm3(p, q, nr)) continue;
        if (nr === q) return true;
        if (prefVis[nr] !== pSt) { prefVis[nr] = pSt; bfs.push(nr); }
      }
    }
    return false;
  }

  // O(n) shared-alphabet reachability prefilter: necessary condition for same-word Weideman IDA
  if (!charSetsOverlap(uI, uJ)) return false;
  {
    const pSt = ++idaState.prefStamp;
    const prefVis = idaState.prefVis;
    const pBfs: number[] = [];
    for (let i = 0; i < kI; i++) {
      const s = compI[i]!;
      prefVis[s] = pSt;
      pBfs.push(s);
    }
    let canBridge = false;
    for (let qh = 0; qh < pBfs.length && !canBridge; qh++) {
      const tos = nfa.edgeTo[pBfs[qh]!]!;
      for (let i = 0; i < tos.length; i++) {
        const nr = tos[i]!;
        if (fReachI[nr] === 0 || bReachJ[nr] === 0) continue;
        if (sccOf[nr] === cidJ) {
          if (charSetsOverlap(nfa.posCharSet[nr]!, uI)) { canBridge = true; break; }
          continue;
        }
        if (prefVis[nr] !== pSt &&
            charSetsOverlap(nfa.posCharSet[nr]!, uI) &&
            charSetsOverlap(nfa.posCharSet[nr]!, uJ)) {
          prefVis[nr] = pSt;
          pBfs.push(nr);
        }
      }
    }
    if (!canBridge) return false;
  }

  const prodN = kI * kJ, validPair = new Uint8Array(prodN);
  idaState.steps += prodN;
  if (idaState.steps > MAX_IDA_TOTAL_STEPS) { idaState.exceeded = true; return true; }
  let anyValid = false;
  for (let a = 0; a < kI; a++) {
    for (let b = 0; b < kJ; b++) {
      if (charSetsOverlap(nfa.posCharSet[compI[a]!]!, nfa.posCharSet[compJ[b]!]!)) { validPair[a * kJ + b] = 1; anyValid = true; }
    }
  }
  if (!anyValid) return false;

  const pFwd: number[][] = Array.from({ length: prodN }, () => []);
  for (let a = 0; a < kI; a++) {
    for (let b = 0; b < kJ; b++) {
      const pid = a * kJ + b;
      if (validPair[pid] === 0) continue;
      const fa = fwdI[a]!, fb = fwdJ[b]!;
      for (let x = 0; x < fa.length; x++) {
        for (let y = 0; y < fb.length; y++) {
          if (++idaState.steps > MAX_IDA_TOTAL_STEPS) { idaState.exceeded = true; return true; }
          const npid = fa[x]! * kJ + fb[y]!;
          if (validPair[npid] === 1) pFwd[pid]!.push(npid);
        }
      }
    }
  }

  const syncCycComps = runTarjanScc(0, prodN - 1, pFwd, validPair).filter(
    (c) => c.length >= 2 || pFwd[c[0]!]!.includes(c[0]!)
  );
  if (syncCycComps.length === 0) return false;

  const interIdx = new Int32Array(n + 1).fill(-1);
  let interN = 0;
  for (let s = 1; s <= n; s++) if (fReachI[s] === 1 && bReachJ[s] === 1) interIdx[s] = interN++;

  const needVis = prodN * interN;
  if (idaState.vis.length < needVis) {
    idaState.vis = new Int32Array(needVis);
    idaState.stamp = 0;
  }
  const vis = idaState.vis;
  const inS = new Uint8Array(prodN);
  for (let sc = 0; sc < syncCycComps.length; sc++) {
    const sComp = syncCycComps[sc]!;
    inS.fill(0);
    const myStamp = ++idaState.stamp;
    const qp: number[] = [], qr: number[] = [];
    for (let i = 0; i < sComp.length; i++) {
      const pid = sComp[i]!; inS[pid] = 1;
      const rState = compI[Math.floor(pid / kJ)]!, ri = interIdx[rState]!;
      if (ri >= 0 && vis[pid * interN + ri] !== myStamp) { vis[pid * interN + ri] = myStamp; qp.push(pid); qr.push(rState); }
    }
    for (let qh = 0; qh < qp.length; qh++) {
      const nextPids = pFwd[qp[qh]!]!, nextRs = nfa.edgeTo[qr[qh]!]!;
      for (let x = 0; x < nextPids.length; x++) {
        const npid = nextPids[x]!;
        if (inS[npid] === 0) continue;
        const na = Math.floor(npid / kJ), stateA = compI[na]!, stateB = compJ[npid - na * kJ]!;
        for (let y = 0; y < nextRs.length; y++) {
          if (++idaState.steps > MAX_IDA_TOTAL_STEPS) { idaState.exceeded = true; return true; }
          const nr = nextRs[y]!, nri = interIdx[nr]!;
          if (nri < 0 || !statesShareMinterm3(stateA, stateB, nr)) continue;
          if (nr === stateB) return true;
          const key = npid * interN + nri;
          if (vis[key] !== myStamp) {
            vis[key] = myStamp;
            qp.push(npid); qr.push(nr);
          }
        }
      }
    }
  }
  return false;
}

function validateSafePunctPair(
  compI: number[], compJ: number[], dpUnancI: number, fReachI: Uint8Array, bReachJ: Uint8Array,
  n: number, nfa: CompiledGlushkovNfa, sccOf: Int32Array, isCyclicScc: Uint8Array,
  dagTo: number[][], dagPreds: number[][], sameWordDp: Int32Array, rawPathDp: Int32Array, totalPathsDp: Int32Array,
  isStateComplex: (s: number) => boolean
): ParseResult<number> {
  if (compI.length !== 1 || compJ.length !== 1) return { ok: false, reason: 'overlapping cyclic quantifiers with shared pump word' };
  const u = compI[0]!, v = compJ[0]!;
  if (isStateComplex(u) || isStateComplex(v)) {
    return { ok: false, reason: 'overlapping multi-range cyclic quantifiers' };
  }
  if (
    nfa.posIsBroad[u] === 1 || nfa.posIsBroad[v] === 1 ||
    nfa.posHasRepeatingLa[u] === 1 || nfa.posHasRepeatingLa[v] === 1 ||
    dpUnancI > 0 || sameWordDp[u]! !== 1 || rawPathDp[u]! > 2
  ) {
    return { ok: false, reason: 'overlapping cyclic quantifiers with shared pump word' };
  }
  const uPrePaths = totalPathsDp[u]!;
  let startBranchesReachingU = 0;
  let singleStartState = -1;
  let startOverlapsInternalPrefix = false;
  {
    const vis = new Uint8Array(n + 1);
    const q: number[] = [u];
    vis[u] = 1;
    for (let qh = 0; qh < q.length; qh++) {
      const cur = q[qh]!;
      const ps = dagPreds[cur]!;
      let hasStart = false;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]!;
        if (p === 0) {
          hasStart = true;
        } else if (vis[p] === 0) {
          vis[p] = 1;
          q.push(p);
        }
      }
      if (hasStart) {
        startBranchesReachingU++;
        singleStartState = cur;
      }
    }
    if (startBranchesReachingU === 1 && singleStartState > 0 && singleStartState !== u) {
      const startCs = nfa.posCharSet[singleStartState]!;
      for (let i = 1; i < q.length; i++) {
        const w = q[i]!;
        if (w !== singleStartState && charSetsOverlap(startCs, nfa.posCharSet[w]!)) {
          startOverlapsInternalPrefix = true;
          break;
        }
      }
    }
  }
  if (uPrePaths > 4 || ((startBranchesReachingU > 1 || startOverlapsInternalPrefix) && uPrePaths > 2)) {
    return { ok: false, reason: 'excessive variable prefix paths preceding optional-separator quantifier pair' };
  }
  const uPreds = dagPreds[u]!;
  for (let i = 0; i < uPreds.length; i++) {
    const p1 = uPreds[i]!;
    if (p1 > 0 && charSetsOverlap(nfa.posCharSet[p1]!, nfa.posCharSet[u]!)) {
      return { ok: false, reason: 'overlapping prefix preceding optional-separator quantifier pair' };
    }
    for (let j = i + 1; j < uPreds.length; j++) {
      const p2 = uPreds[j]!;
      if (p1 > 0 && p2 > 0 && charSetsOverlap(nfa.posCharSet[p1]!, nfa.posCharSet[p2]!)) {
        return { ok: false, reason: 'ambiguous variable prefix preceding optional-separator quantifier pair' };
      }
    }
  }
  const uTos = nfa.edgeTo[u]!, uMults = nfa.edgeMult[u]!;
  const uvIdx = uTos.indexOf(v);
  if (uvIdx < 0) return { ok: false, reason: 'overlapping cyclic quantifiers with shared pump word' };
  if (uMults[uvIdx]! !== 1) return { ok: false, reason: 'overlapping cyclic quantifiers with parallel bypass' };

  let midCount = 0;
  for (let w = 1; w <= n; w++) {
    if (w === u || w === v || fReachI[w] === 0 || bReachJ[w] === 0) continue;
    midCount++;
    if (isCyclicScc[sccOf[w]!] === 1) return { ok: false, reason: 'cyclic separator between overlapping quantifiers' };
    if (charSetsOverlap(nfa.posCharSet[w]!, nfa.posCharSet[u]!) || charSetsOverlap(nfa.posCharSet[w]!, nfa.posCharSet[v]!)) {
      return { ok: false, reason: 'overlapping separator between cyclic quantifiers' };
    }
    if (!uTos.includes(w)) return { ok: false, reason: 'multi-character optional separator between cyclic quantifiers' };
    let toV = false;
    const wTos = nfa.edgeTo[w]!;
    for (let i = 0; i < wTos.length; i++) {
      const nw = wTos[i]!;
      if (nw === v) toV = true;
      else if (nw !== u && fReachI[nw] === 1 && bReachJ[nw] === 1) {
        return { ok: false, reason: 'multi-character optional separator between cyclic quantifiers' };
      }
    }
    if (!toV) return { ok: false, reason: 'multi-character optional separator between cyclic quantifiers' };
  }
  let hasComplexExit = false;
  const vExits = dagTo[v]!;
  for (let i = 0; i < vExits.length; i++) {
    if (isStateComplex(vExits[i]!)) {
      hasComplexExit = true;
      break;
    }
  }
  if (hasComplexExit) {
    return { ok: false, reason: 'overlapping cyclic quantifiers with complex exit' };
  }
  const effectivePreEntry = Math.max(
    uPreds.length,
    startBranchesReachingU === 1 && !startOverlapsInternalPrefix && uPrePaths <= 2 ? 1 : uPrePaths
  );
  return midCount > 0 ? { ok: true, value: effectivePreEntry } : { ok: false, reason: 'adjacent overlapping cyclic quantifiers' };
}

function analyzeCyclicSccs(
  n: number, nfa: CompiledGlushkovNfa, reachable: Uint8Array, rawSccs: number[][],
  sccOf: Int32Array, isCyclicScc: Uint8Array, cyclicSccs: number[], topoOrder: number[],
  dagTo: number[][], dagPreds: number[][], dagPredMults: number[][], acceptMultOf: Int32Array,
  sameWordDp: Int32Array, rawPathDp: Int32Array, maxPathMult: number, maxRawStatePaths: number,
  isLookaroundBody: boolean, statesShareMinterm3: (a: number, b: number, c: number) => boolean,
  capturesInRepeating: number, areStatesCompat: (a: number, b: number) => boolean, mt: MintermTable
): ParseResult<CyclicAnalysisResult> {
  const numCyc = cyclicSccs.length;
  const csComplexCache = new Int8Array(mt.csMinterms.length).fill(-1);
  const csComplexBodyCache = new Int8Array(mt.csMinterms.length).fill(-1);
  const isStateComplex = (s: number): boolean => {
    const cid = mt.stateCsId[s]!;
    let cached = csComplexCache[cid]!;
    if (cached === -1) {
      cached = isComplexCharSet(nfa.posCharSet[s]!, false) ? 1 : 0;
      csComplexCache[cid] = cached;
    }
    return cached === 1;
  };
  const isStateComplexBody = (s: number, allowSmallBroadExclude: boolean): boolean => {
    if (!allowSmallBroadExclude) return isStateComplex(s);
    const cid = mt.stateCsId[s]!;
    let cached = csComplexBodyCache[cid]!;
    if (cached === -1) {
      cached = isComplexCharSet(nfa.posCharSet[s]!, true) ? 1 : 0;
      csComplexBodyCache[cid] = cached;
    }
    return cached === 1;
  };
  if (numCyc > MAX_CYCLIC_SCCS) {
    return { ok: false, reason: 'excessive cyclic quantifiers in pattern' };
  }
  let multiStateCycCount = 0;
  for (let ci = 0; ci < numCyc; ci++) {
    if (rawSccs[cyclicSccs[ci]!]!.length >= 2 && ++multiStateCycCount > MAX_MULTI_STATE_CYCLIC_SCCS) {
      return { ok: false, reason: 'excessive multi-state cyclic quantifiers in pattern' };
    }
  }

  const revAllTo: number[][] = Array.from({ length: n + 1 }, () => []);
  for (let u = 0; u <= n; u++) {
    if (reachable[u] === 0) continue;
    for (let i = 0; i < nfa.edgeTo[u]!.length; i++) {
      const v = nfa.edgeTo[u]![i]!;
      if (reachable[v] === 1) revAllTo[v]!.push(u);
    }
  }

  let hasBroadLoop = false;
  const sccUnionChars: CharSet[] = [], cycFwdLocal: number[][][] = [];
  const sccIsSingleBroad = new Uint8Array(numCyc), cycLocalIdx = new Int32Array(n + 1).fill(-1);
  for (let ci = 0; ci < numCyc; ci++) {
    const cid = cyclicSccs[ci]!, comp = rawSccs[cid]!;
    let uChars = nfa.posCharSet[comp[0]!]!;
    for (let i = 0; i < comp.length; i++) {
      cycLocalIdx[comp[i]!] = i;
      if (i > 0) uChars = unionCharSet(uChars, nfa.posCharSet[comp[i]!]!);
    }
    sccUnionChars.push(uChars);
    if (comp.length === 1 && nfa.posIsBroad[comp[0]!] === 1) { sccIsSingleBroad[ci] = 1; hasBroadLoop = true; }
    const edaRes = checkCyclicSccEda(comp, cid, nfa, sccOf, cycLocalIdx);
    if (!edaRes.ok) return edaRes;
    cycFwdLocal.push(edaRes.value);
  }

  const reachFromCyc = cyclicSccs.map((cid) => bfsReach(rawSccs[cid]!, nfa.edgeTo, n, reachable));
  const canReachCyc = cyclicSccs.map((cid) => bfsReach(rawSccs[cid]!, revAllTo, n));
  const reachCyc = new Uint8Array(numCyc * numCyc), isStartPumpable = new Uint8Array(numCyc), idaEdge = new Uint8Array(numCyc * numCyc);
  const idaState: IdaSharedState = {
    steps: 0, vis: new Int32Array(0), stamp: 0, prefVis: new Int32Array(n + 1), prefStamp: 0, exceeded: false,
  };

  for (let ci = 0; ci < numCyc; ci++) {
    if (!isLookaroundBody && checkStartPumpable(
      rawSccs[cyclicSccs[ci]!]!, cycFwdLocal[ci]!, sccUnionChars[ci]!, cyclicSccs[ci]!, sccOf,
      n, nfa, canReachCyc[ci]!, idaState
    )) {
      if (idaState.exceeded) {
        return { ok: false, reason: 'cyclic quantifier analysis exceeds safe step budget' };
      }
      isStartPumpable[ci] = 1;
    }
    for (let cj = ci + 1; cj < numCyc; cj++) {
      const cidJ = cyclicSccs[cj]!;
      if (reachFromCyc[ci]![rawSccs[cidJ]![0]!] === 1) {
        reachCyc[ci * numCyc + cj] = 1;
        const compI = rawSccs[cyclicSccs[ci]!]!, compJ = rawSccs[cidJ]!;
        if (checkPairwiseIda(
          compI, compJ, cycFwdLocal[ci]!, cycFwdLocal[cj]!,
          sccUnionChars[ci]!, sccUnionChars[cj]!, cidJ, sccOf,
          reachFromCyc[ci]!, canReachCyc[cj]!, n, nfa, statesShareMinterm3, idaState
        )) {
          if (idaState.exceeded) {
            return { ok: false, reason: 'cyclic quantifier analysis exceeds safe step budget' };
          }
          if (isLookaroundBody) {
            return { ok: false, reason: 'ambiguous lookaround assertion' };
          }
          if (compI.length >= 2 || compJ.length >= 2) {
            return { ok: false, reason: 'overlapping cyclic quantifiers with shared pump word' };
          }
          idaEdge[ci * numCyc + cj] = 1;
        }
        if (idaState.exceeded) {
          return { ok: false, reason: 'cyclic quantifier analysis exceeds safe step budget' };
        }
      }
    }
  }

  const dpUnanc = new Int32Array(numCyc), dpAnc = new Int32Array(numCyc);
  let unanchoredIda = 1, anchoredIda = 1, leadingCycleCount = 0, idaEdgeCount = 0;
  for (let ci = 0; ci < numCyc; ci++) {
    if (isStartPumpable[ci] === 1) { leadingCycleCount++; idaEdgeCount++; }
    let bestU = isStartPumpable[ci] === 1 ? 1 : 0, bestA = 0;
    for (let prev = 0; prev < ci; prev++) {
      if (reachCyc[prev * numCyc + ci] === 0) continue;
      const w = idaEdge[prev * numCyc + ci]!;
      if (dpUnanc[prev]! + w > bestU) bestU = dpUnanc[prev]! + w;
      if (dpAnc[prev]! + w > bestA) bestA = dpAnc[prev]! + w;
    }
    dpUnanc[ci] = bestU; dpAnc[ci] = bestA;
    if (1 + bestU > unanchoredIda) unanchoredIda = 1 + bestU;
    if (1 + bestA > anchoredIda) anchoredIda = 1 + bestA;
  }
  if (!isLookaroundBody && unanchoredIda >= 3) {
    return { ok: false, reason: 'cubic or higher polynomial backtracking ambiguity (IDA >= 3)' };
  }

  const totalPathsDp = new Int32Array(n + 1);
  totalPathsDp[0] = 1;
  for (let cid = 0; cid < rawSccs.length; cid++) {
    const comp = rawSccs[cid]!;
    if (isCyclicScc[cid] === 0) {
      const v = comp[0]!;
      let tp = 0;
      for (let j = 0; j < dagPreds[v]!.length; j++) {
        tp = cappedAdd(tp, cappedMul(totalPathsDp[dagPreds[v]![j]!]!, dagPredMults[v]![j]!));
      }
      totalPathsDp[v] = tp > 0 ? tp : 1;
    } else {
      let sccInTotal = 1;
      for (let k = 0; k < comp.length; k++) {
        const v = comp[k]!;
        let vTp = 0;
        for (let j = 0; j < dagPreds[v]!.length; j++) {
          vTp = cappedAdd(vTp, cappedMul(totalPathsDp[dagPreds[v]![j]!]!, dagPredMults[v]![j]!));
        }
        if (vTp > sccInTotal) sccInTotal = vTp;
      }
      for (let k = 0; k < comp.length; k++) totalPathsDp[comp[k]!] = sccInTotal;
    }
  }

  let safePunctPairCount = 0, safePunctDirectPreds = 1;
  const isSafePunctSecond = new Uint8Array(numCyc);
  for (let ci = 0; ci < numCyc; ci++) {
    for (let cj = ci + 1; cj < numCyc; cj++) {
      if (idaEdge[ci * numCyc + cj] === 0) continue;
      idaEdgeCount++;
      if (isLookaroundBody) return { ok: false, reason: 'ambiguous lookaround assertion' };
      const pr = validateSafePunctPair(rawSccs[cyclicSccs[ci]!]!, rawSccs[cyclicSccs[cj]!]!, dpUnanc[ci]!,
        reachFromCyc[ci]!, canReachCyc[cj]!, n, nfa, sccOf, isCyclicScc, dagTo, dagPreds, sameWordDp, rawPathDp, totalPathsDp, isStateComplex);
      if (!pr.ok) return pr;
      if (pr.value > safePunctDirectPreds) safePunctDirectPreds = pr.value;
      isSafePunctSecond[cj] = 1;
      if (++safePunctPairCount > 1) return { ok: false, reason: 'multiple overlapping optional-separator quantifier pairs' };
    }
  }
  if (!isLookaroundBody && idaEdgeCount > 2) return { ok: false, reason: 'excessive quadratic backtracking cycles in pattern' };

  // Per-cycle pre/post overlapping work (symmetric revCDp & SCC-order forward cDp), exit fan-out, & lookbehind coupling
  let maxCycleOverlapWork = 0, maxCycleOverlapCost = 1, maxCycleEpsExit = 1, nonLeadingCycleCost = 0;
  let totalNonLeadHeavyWork = 0, nonLeadHeavyCount = 0;
  let maxLeadingCycleStates = 0, maxLeadingCycleNonLitStates = 0;
  let maxPostLeadingCluster = 1, maxLeadingCyclePreMult = 1;
  let maxLeadingCycleExitFanout = 1, maxLeadingCycleNonLitExitFanout = 0;
  let maxLeadingCycleComplexExits = 0, totalStartPumpableNonLitExits = 0;
  let hasLeadingComplexCycle = false;
  let hasLeadingCycleBacktrack = false;
  let maxCycleEntryPreds = 0, maxSafePunctExitFanout = 1;
  const isLeadingOrPostLeading = new Uint8Array(numCyc);
  for (let ci = 0; ci < numCyc; ci++) {
    if (isStartPumpable[ci] === 1) {
      isLeadingOrPostLeading[ci] = 1;
    } else {
      for (let prev = 0; prev < ci; prev++) {
        if (isStartPumpable[prev] === 1 && reachCyc[prev * numCyc + ci] === 1) {
          isLeadingOrPostLeading[ci] = 1;
          break;
        }
      }
    }
  }
  const sccEntryPredUnion: (CharSet | null)[] = new Array(numCyc).fill(null);
  for (let ci = 0; ci < numCyc; ci++) {
    if (isStartPumpable[ci] === 1) continue;
    const compI = rawSccs[cyclicSccs[ci]!]!;
    let entryUnion: CharSet | null = null;
    for (let k = 0; k < compI.length; k++) {
      const ps = dagPreds[compI[k]!]!;
      for (let j = 0; j < ps.length; j++) {
        const u = ps[j]!;
        if (u > 0 && !(isSafePunctSecond[ci] === 1 && isCyclicScc[sccOf[u]!] === 1)) {
          const uCs = nfa.posCharSet[u]!;
          entryUnion = entryUnion === null ? uCs : unionCharSet(entryUnion, uCs);
        }
      }
    }
    sccEntryPredUnion[ci] = entryUnion;
  }
  const compatCluster = new Int32Array(numCyc).fill(1);
  for (let ci = 0; ci < numCyc; ci++) {
    if (isStartPumpable[ci] === 1) continue;
    const isPostLeadI = isLeadingOrPostLeading[ci] === 1;
    const compI = rawSccs[cyclicSccs[ci]!]!;
    const charsI = sccUnionChars[ci]!;
    const entryI = sccEntryPredUnion[ci]!;
    let cnt = 1;
    for (let cj = 0; cj < numCyc; cj++) {
      if (cj === ci || isStartPumpable[cj] === 1) continue;
      if ((isLeadingOrPostLeading[cj] === 1) !== isPostLeadI) continue;
      if (reachCyc[ci * numCyc + cj] === 1 || reachCyc[cj * numCyc + ci] === 1) continue;
      const compJ = rawSccs[cyclicSccs[cj]!]!;
      let isComp = false;
      if (compI.length === 1 && compJ.length === 1) {
        isComp = areStatesCompat(compI[0]!, compJ[0]!);
      } else {
        for (let a = 0; a < compI.length && !isComp; a++) {
          for (let b = 0; b < compJ.length; b++) {
            if (areStatesCompat(compI[a]!, compJ[b]!)) { isComp = true; break; }
          }
        }
      }
      if (!isComp) {
        const entryJ = sccEntryPredUnion[cj]!;
        if (
          (entryJ !== null && charSetsOverlap(charsI, entryJ)) ||
          (entryI !== null && charSetsOverlap(sccUnionChars[cj]!, entryI))
        ) {
          isComp = true;
        }
      }
      if (isComp) cnt++;
    }
    compatCluster[ci] = cnt;
  }
  for (let ci = 0; ci < numCyc; ci++) {
    const cid = cyclicSccs[ci]!, comp = rawSccs[cid]!, cChars = sccUnionChars[ci]!, isBroad = sccIsSingleBroad[ci] === 1;
    if (isLeadingOrPostLeading[ci] === 1) {
      if (comp.length > maxLeadingCycleStates) maxLeadingCycleStates = comp.length;
      let nonLitInComp = 0;
      for (let i = 0; i < comp.length; i++) if (nfa.posIsSingleLit[comp[i]!] === 0) nonLitInComp++;
      if (nonLitInComp > maxLeadingCycleNonLitStates) maxLeadingCycleNonLitStates = nonLitInComp;
    }
    const revCDp = new Int32Array(n + 1);
    let preCycleMult = 1, preCycleRaw = 1, maxEntryPreds = 0, preCycleOverlapIn = 0, preOverlapFromStart = 0, directStartMaxMult = 0;
    for (let i = 0; i < comp.length; i++) {
      const v = comp[i]!;
      if (sameWordDp[v]! > preCycleMult) preCycleMult = sameWordDp[v]!;
      if (rawPathDp[v]! > preCycleRaw) preCycleRaw = rawPathDp[v]!;
      if (dagPreds[v]!.length > maxEntryPreds) maxEntryPreds = dagPreds[v]!.length;
      for (let j = 0; j < dagPreds[v]!.length; j++) {
        const u = dagPreds[v]![j]!, m = dagPredMults[v]![j]!;
        if (u === 0) {
          if (m > directStartMaxMult) directStartMaxMult = m;
        } else if (charSetsOverlap(nfa.posCharSet[u]!, cChars)) {
          revCDp[u] = cappedAdd(revCDp[u]!, m);
          preCycleOverlapIn = cappedAdd(preCycleOverlapIn, m);
        }
      }
    }
    if (maxEntryPreds > maxCycleEntryPreds) maxCycleEntryPreds = maxEntryPreds;
    let maxRevCDp = 0;
    for (let t = topoOrder.length - 1; t >= 0; t--) {
      const y = topoOrder[t]!, dy = revCDp[y]!;
      if (dy === 0) continue;
      if (dy > maxRevCDp) maxRevCDp = dy;
      for (let j = 0; j < dagPreds[y]!.length; j++) {
        const x = dagPreds[y]![j]!, flow = cappedMul(dy, dagPredMults[y]![j]!);
        if (x === 0) preOverlapFromStart = cappedAdd(preOverlapFromStart, flow);
        else if (charSetsOverlap(nfa.posCharSet[x]!, cChars)) revCDp[x] = cappedAdd(revCDp[x]!, flow);
      }
    }
    if (preCycleMult > 8) return { ok: false, reason: 'excessive finite ambiguity preceding cyclic quantifier' };
    if (maxEntryPreds > 12 || (comp.length >= 2 && preCycleRaw > 8)) {
      return { ok: false, reason: 'excessive variable-length prefix preceding cyclic quantifier' };
    }
    if (preCycleOverlapIn > 2 || maxRevCDp > 2 || preOverlapFromStart + directStartMaxMult > 2) {
      return { ok: false, reason: 'excessive overlapping variable prefix preceding cyclic quantifier' };
    }

    const cDp = new Int32Array(n + 1), boundaryIn = new Int32Array(n + 1);
    const directOverlapExits: number[] = [];
    let overlapExits = 0, outExitSum = 0, directNonLitExitSum = 0, directComplexExits = 0, cycleMaxEps = 1;
    let hasRepLaInComp = false, hasNonAcceptExit = false;
    for (let i = 0; i < comp.length; i++) {
      const u = comp[i]!, accM = acceptMultOf[u]!;
      if (nfa.posHasRepeatingLa[u] === 1) hasRepLaInComp = true;
      if (nfa.posHasTrailingAssert[u] === 1) hasNonAcceptExit = true;
      if (accM > 0) { outExitSum = cappedAdd(outExitSum, accM); if (accM > cycleMaxEps) cycleMaxEps = accM; }
      for (let j = 0; j < nfa.edgeTo[u]!.length; j++) {
        const v = nfa.edgeTo[u]![j]!;
        if (sccOf[v] === cid) continue;
        hasNonAcceptExit = true;
        const m = nfa.edgeMult[u]![j]!;
        outExitSum = cappedAdd(outExitSum, m);
        if (nfa.posIsSingleLit[v] === 0) directNonLitExitSum = cappedAdd(directNonLitExitSum, m);
        if (isStateComplex(v)) directComplexExits = cappedAdd(directComplexExits, m);
        if (m > cycleMaxEps) cycleMaxEps = m;
        if (charSetsOverlap(nfa.posCharSet[v]!, cChars)) {
          if (cDp[v] === 0) directOverlapExits.push(v);
          cDp[v] = cappedAdd(cDp[v]!, m);
          overlapExits = cappedAdd(overlapExits, m);
        }
      }
    }
    if (cycleMaxEps > maxCycleEpsExit) maxCycleEpsExit = cycleMaxEps;
    if (cycleMaxEps > (numCyc >= 2 ? 2 : 4)) return { ok: false, reason: 'excessive empty-path branching exiting cyclic quantifier' };
    if (outExitSum > 12) return { ok: false, reason: 'excessive exit fan-out from cyclic quantifier' };

    let overlapWork = 0, nonLitOverlapWork = 0, acyclicNonLitOverlapWork = 0, maxCDp = 0, acceptBoundaryIn = 0;
    let crossedNonIdaCyc = false;
    const overlapStates: number[] = [];
    const emitDagOut = (x: number, dx: number): void => {
      const fullTos = nfa.edgeTo[x]!, fullMults = nfa.edgeMult[x]!;
      for (let i = 0; i < dagTo[x]!.length; i++) {
        const y = dagTo[x]![i]!, fIdx = fullTos.indexOf(y);
        const flow = cappedMul(dx, fIdx >= 0 ? fullMults[fIdx]! : 1);
        if (charSetsOverlap(nfa.posCharSet[y]!, cChars)) cDp[y] = cappedAdd(cDp[y]!, flow);
        else boundaryIn[y] = cappedAdd(boundaryIn[y]!, flow);
      }
    };
    for (let cid2 = cid + 1; cid2 < rawSccs.length; cid2++) {
      const comp2 = rawSccs[cid2]!;
      if (isCyclicScc[cid2] === 0) {
        const x = comp2[0]!, dx = cDp[x]!;
        if (dx === 0) continue;
        overlapStates.push(x);
        overlapWork = cappedAdd(overlapWork, dx);
        if (nfa.posIsSingleLit[x] === 0) {
          nonLitOverlapWork = cappedAdd(nonLitOverlapWork, dx);
          acyclicNonLitOverlapWork = cappedAdd(acyclicNonLitOverlapWork, dx);
        }
        if (dx > maxCDp) maxCDp = dx;
        if (acceptMultOf[x]! > 0) acceptBoundaryIn = cappedAdd(acceptBoundaryIn, cappedMul(dx, acceptMultOf[x]!));
        emitDagOut(x, dx);
      } else {
        let maxInCDp = 0;
        for (let k = 0; k < comp2.length; k++) {
          const dv = cDp[comp2[k]!]!;
          if (dv > maxInCDp) maxInCDp = dv;
        }
        if (maxInCDp === 0) continue;
        crossedNonIdaCyc = true;
        if (comp2.length >= 2) {
          const seenInScc = new Uint8Array(comp2.length);
          const bfs: number[] = [];
          for (let k = 0; k < comp2.length; k++) {
            const w = comp2[k]!;
            if (cDp[w]! > 0) {
              seenInScc[k] = 1;
              cDp[w] = maxInCDp;
              bfs.push(w);
            }
          }
          for (let qh = 0; qh < bfs.length; qh++) {
            const u = bfs[qh]!, tos = nfa.edgeTo[u]!;
            for (let j = 0; j < tos.length; j++) {
              const v = tos[j]!;
              if (sccOf[v] !== cid2) continue;
              const lv = cycLocalIdx[v]!;
              if (charSetsOverlap(nfa.posCharSet[v]!, cChars)) {
                if (seenInScc[lv] === 0) { seenInScc[lv] = 1; cDp[v] = maxInCDp; bfs.push(v); }
              } else {
                boundaryIn[v] = cappedAdd(boundaryIn[v]!, maxInCDp);
              }
            }
          }
        }
        for (let k = 0; k < comp2.length; k++) {
          const w = comp2[k]!, dw = cDp[w]!;
          if (dw === 0) continue;
          overlapStates.push(w);
          overlapWork = cappedAdd(overlapWork, dw);
          if (nfa.posIsSingleLit[w] === 0) nonLitOverlapWork = cappedAdd(nonLitOverlapWork, dw);
          if (dw > maxCDp) maxCDp = dw;
          if (acceptMultOf[w]! > 0) acceptBoundaryIn = cappedAdd(acceptBoundaryIn, cappedMul(dw, acceptMultOf[w]!));
          emitDagOut(w, dw);
        }
      }
    }
    let boundaryConverge = acceptBoundaryIn >= 2 ? acceptBoundaryIn : 0;
    let totalBoundaryExits = acceptBoundaryIn;
    let boundaryNonLitExits = 0;
    let boundaryComplexExits = 0;
    for (let s = 1; s <= n; s++) {
      const bi = boundaryIn[s]!;
      if (bi > 0) {
        totalBoundaryExits = cappedAdd(totalBoundaryExits, bi);
        if (nfa.posIsSingleLit[s] === 0) boundaryNonLitExits = cappedAdd(boundaryNonLitExits, bi);
        if (isStateComplex(s)) boundaryComplexExits = cappedAdd(boundaryComplexExits, bi);
        if (bi >= 2) boundaryConverge = cappedAdd(boundaryConverge, bi);
      }
    }
    const combinedExitFanout = cappedAdd(outExitSum, totalBoundaryExits);
    const combinedNonLitExitFanout = cappedAdd(directNonLitExitSum, boundaryNonLitExits);
    const complexExits = cappedAdd(directComplexExits, boundaryComplexExits);
    if (combinedExitFanout > 12) return { ok: false, reason: 'excessive exit fan-out from cyclic quantifier' };
    let cycleIsComplex = false;
    if (comp.length === 1) {
      cycleIsComplex = isStateComplexBody(comp[0]!, isBroad);
    } else {
      for (let k = 0; k < comp.length; k++) {
        const st = comp[k]!;
        if (isStateComplexBody(st, nfa.posIsBroad[st] === 1)) {
          cycleIsComplex = true;
          break;
        }
      }
      if (!cycleIsComplex && isComplexCharSet(cChars, isBroad || isBroadWildcardCharSet(cChars))) {
        cycleIsComplex = true;
      }
    }
    if (isLeadingOrPostLeading[ci] === 1) {
      if (hasNonAcceptExit) {
        hasLeadingCycleBacktrack = true;
        if (isStartPumpable[ci] === 0) {
          if (compatCluster[ci]! > maxPostLeadingCluster) {
            maxPostLeadingCluster = compatCluster[ci]!;
          }
          if (preCycleMult > maxLeadingCyclePreMult) {
            maxLeadingCyclePreMult = preCycleMult;
          }
        } else if (preCycleMult > 2 && preCycleMult > maxLeadingCyclePreMult) {
          maxLeadingCyclePreMult = preCycleMult;
        }
        if (complexExits > maxLeadingCycleComplexExits) {
          maxLeadingCycleComplexExits = complexExits;
        }
        if (cycleIsComplex) {
          hasLeadingComplexCycle = true;
        }
        if (isStartPumpable[ci] === 1) {
          totalStartPumpableNonLitExits = cappedAdd(totalStartPumpableNonLitExits, combinedNonLitExitFanout);
        }
      }
      if (combinedExitFanout > maxLeadingCycleExitFanout) maxLeadingCycleExitFanout = combinedExitFanout;
      if (combinedNonLitExitFanout > maxLeadingCycleNonLitExitFanout) {
        maxLeadingCycleNonLitExitFanout = combinedNonLitExitFanout;
      }
    } else if (hasNonAcceptExit) {
      let preTp = 1;
      for (let i = 0; i < comp.length; i++) {
        if (totalPathsDp[comp[i]!]! > preTp) preTp = totalPathsDp[comp[i]!]!;
      }
      const preMult = preCycleMult;
      const cl = compatCluster[ci]!;
      const exitFactor = Math.max(
        1,
        Math.ceil(combinedNonLitExitFanout / 2),
        Math.ceil(combinedExitFanout / 4),
        complexExits * 3
      );
      const cycleFactor = cycleIsComplex ? 3 : 1;
      const capFactor = 1 + capturesInRepeating;
      const stateFactor = Math.max(1, Math.ceil(comp.length / 2));
      const hasHeavyExitOrBody =
        combinedNonLitExitFanout >= 3 ||
        combinedExitFanout >= 6 ||
        complexExits >= 1 ||
        cycleIsComplex ||
        capturesInRepeating >= 1;
      const nlWork = preTp * preMult * exitFactor * cycleFactor * capFactor * stateFactor;
      if (
        (preTp * preMult >= 4 &&
          (hasHeavyExitOrBody ||
            comp.length >= 4 ||
            preMult >= 3 ||
            (preTp >= 12 &&
              (preMult >= 2 ||
                combinedNonLitExitFanout >= 2 ||
                combinedExitFanout >= 5 ||
                comp.length >= 2)))) ||
        (hasHeavyExitOrBody && nlWork >= 48)
      ) {
        const nlCost = Math.ceil(nlWork / 4);
        if (nlCost > nonLeadingCycleCost) nonLeadingCycleCost = nlCost;
      }
      if (cl >= 2 && (preTp * preMult * cl >= 8 || (cl >= 3 && hasHeavyExitOrBody))) {
        const nlCost = Math.ceil((preTp * preMult * cl * exitFactor * cycleFactor * capFactor) / 4);
        if (nlCost > nonLeadingCycleCost) nonLeadingCycleCost = nlCost;
      }
      if (hasHeavyExitOrBody || comp.length >= 2) {
        totalNonLeadHeavyWork += nlWork;
        nonLeadHeavyCount++;
      }
    }
    if (isSafePunctSecond[ci] === 1) {
      if (combinedExitFanout > 4) return { ok: false, reason: 'excessive exit fan-out from optional-separator quantifier pair' };
      if (combinedExitFanout > maxSafePunctExitFanout) maxSafePunctExitFanout = combinedExitFanout;
    }
    if (overlapWork > maxCycleOverlapWork) maxCycleOverlapWork = overlapWork;

    if ((isSafePunctSecond[ci] === 1 && overlapWork > 0) || (hasRepLaInComp && (overlapWork > 0 || hasNonAcceptExit))) {
      return { ok: false, reason: 'excessive overlapping suffix after cyclic quantifier' };
    }
    if (isStartPumpable[ci] === 1) {
      for (let oi = 0; oi < overlapStates.length; oi++) {
        const os = overlapStates[oi]!;
        if (sameWordDp[os]! > 2 || rawPathDp[os]! > 8) {
          return { ok: false, reason: 'excessive ambiguous suffix after cyclic quantifier' };
        }
      }
    }
    const pureSinglePathChain =
      crossedNonIdaCyc && maxCDp === 1 && boundaryConverge === 0 && maxPathMult === 1 && maxRawStatePaths === 1;
    if (isBroad) {
      let maxExitSelfOverlap = 0, hasDirectNonLitExit = false;
      if (isStartPumpable[ci] === 1) {
        for (let di = 0; di < directOverlapExits.length; di++) {
          const dv = directOverlapExits[di]!;
          if (nfa.posIsSingleLit[dv] === 0) hasDirectNonLitExit = true;
          const dvCs = nfa.posCharSet[dv]!;
          let selfCnt = 0;
          for (let oi = 0; oi < overlapStates.length; oi++) {
            if (charSetsOverlap(dvCs, nfa.posCharSet[overlapStates[oi]!]!)) selfCnt++;
          }
          if (selfCnt > maxExitSelfOverlap) maxExitSelfOverlap = selfCnt;
        }
      }
      if (nonLitOverlapWork > 2 || overlapWork > 20 || overlapExits > 2 || maxCDp > 2 || boundaryConverge > 2 || maxPathMult > 4 ||
          maxExitSelfOverlap > 2 || (hasDirectNonLitExit && nonLitOverlapWork > 1) ||
          (acyclicNonLitOverlapWork >= 1 && overlapWork > 8) || (nonLitOverlapWork >= 1 && overlapStates.length > 10) ||
          (isLeadingOrPostLeading[ci] === 1 && complexExits >= 1)) {
        return { ok: false, reason: 'excessive backtracking tail after broad wildcard loop' };
      }
    } else if (
      overlapExits > 2 || maxCDp > 2 || boundaryConverge >= 2 ||
      (preCycleOverlapIn > 0 && overlapWork > 0) ||
      (isStartPumpable[ci] === 1 && comp.length >= 2 && overlapWork >= 1) ||
      (pureSinglePathChain
        ? (nonLitOverlapWork > 4 || overlapWork > 6)
        : (nonLitOverlapWork > (isStartPumpable[ci] === 1 ? 1 : 2) || overlapWork > 3))
    ) {
      return { ok: false, reason: 'excessive overlapping suffix after cyclic quantifier' };
    }
    const cycleOverlapCost = isBroad
      ? Math.max(1, Math.ceil(overlapWork / 4))
      : (pureSinglePathChain ? Math.max(1, Math.ceil(overlapWork / 2)) : Math.max(1, overlapWork));
    if (cycleOverlapCost > maxCycleOverlapCost) maxCycleOverlapCost = cycleOverlapCost;

    const fReach = reachFromCyc[ci]!;
    for (let s = 1; s <= n; s++) {
      const lbs = nfa.stateLookbehinds[s];
      if (!lbs || fReach[s] === 0) continue;
      const barrierFree = sccOf[s] === cid || cDp[s]! > 0;
      for (let k = 0; k < lbs.length; k++) {
        if (barrierFree || lbs[k]!.states > 8) return { ok: false, reason: 'unsafe lookbehind coupled with cyclic quantifier' };
      }
    }
  }
  if (nonLeadHeavyCount >= 2) {
    const aggNlCost = Math.ceil(totalNonLeadHeavyWork / 4);
    if (aggNlCost > nonLeadingCycleCost) nonLeadingCycleCost = aggNlCost;
  }
  return {
    ok: true,
    value: {
      hasBroadLoop, unanchoredIda, anchoredIda, leadingCycleCount, maxPostLeadingCluster, maxLeadingCyclePreMult,
      maxLeadingCycleStates, maxLeadingCycleNonLitStates,
      maxLeadingCycleExitFanout, maxLeadingCycleNonLitExitFanout,
      maxLeadingCycleComplexExits, totalStartPumpableNonLitExits, hasLeadingComplexCycle,
      hasLeadingCycleBacktrack,
      maxCycleEntryPreds, safePunctPairCount, safePunctDirectPreds, maxSafePunctExitFanout,
      maxCycleOverlapWork, maxCycleOverlapCost, maxCycleEpsExit, nonLeadingCycleCost,
    },
  };
}

function computeSharedPrefixWork(n: number, dagTo: number[][], mt: MintermTable): number {
  if (mt.numMinterms === 0) return 0;
  let maxWork = 0, totalSteps = 0, curStamp = 0, partOps = 0;
  const MAX_PART_OPS = 32_768;
  const stamp = new Int32Array(n + 1);
  let partStamp = 0;
  const mStamp = new Int32Array(mt.numMinterms);
  const mFirst = new Int32Array(mt.numMinterms);
  const numCs = mt.csMinterms.length;
  const cidStamp = new Int32Array(numCs);
  const cidIdxMap = new Int32Array(numCs);
  const uCids = new Int32Array(30);
  const uCounts = new Int32Array(30);
  const mMask = new Int32Array(mt.numMinterms);
  const touchedM = new Int32Array(mt.numMinterms);
  let cidCur = 0;

  const csMatchesMinterm = mt.csMatchesMinterm;
  const mintermWords = mt.mintermWords;
  const partition = (states: number[]): number[][] => {
    const sLen = states.length;
    if (mintermWords === 1 && sLen <= 16) {
      let seen = 0, dup = 0;
      for (let i = 0; i < sLen; i++) {
        const mb = csMatchesMinterm[mt.stateCsId[states[i]!]!]!;
        dup |= seen & mb;
        seen |= mb;
      }
      if (dup === 0) {
        partOps += sLen;
        return [];
      }
    } else if (sLen <= 16) {
      const pSt = ++partStamp;
      let allSingleDisjoint = true;
      for (let i = 0; i < sLen; i++) {
        const ms = mt.csMinterms[mt.stateCsId[states[i]!]!]!;
        if (ms.length !== 1) { allSingleDisjoint = false; break; }
        const m = ms[0]!;
        if (mStamp[m] === pSt) { allSingleDisjoint = false; break; }
        mStamp[m] = pSt;
      }
      if (allSingleDisjoint) {
        partOps += sLen;
        return [];
      }
    }
    const cSt = ++cidCur;
    let d = 0;
    for (let i = 0; i < sLen; i++) {
      const cid = mt.stateCsId[states[i]!]!;
      if (cidStamp[cid] !== cSt) {
        if (d === 30) { d = 31; break; }
        cidStamp[cid] = cSt;
        cidIdxMap[cid] = d;
        uCids[d] = cid;
        uCounts[d] = 1;
        d++;
      } else {
        const idx = cidIdxMap[cid]!;
        uCounts[idx] = uCounts[idx]! + 1;
      }
    }
    if (d === 1) {
      partOps += sLen;
      return mt.csMinterms[uCids[0]!]!.length > 0 ? [states] : [];
    }
    if (d <= 30) {
      let touchedLen = 0;
      for (let ci = 0; ci < d; ci++) {
        const ms = mt.csMinterms[uCids[ci]!]!;
        const bit = 1 << ci;
        for (let j = 0; j < ms.length; j++) {
          if (++partOps > MAX_PART_OPS) break;
          const m = ms[j]!;
          const prev = mMask[m]!;
          if (prev === 0) touchedM[touchedLen++] = m;
          mMask[m] = prev | bit;
        }
        if (partOps > MAX_PART_OPS) break;
      }
      let seenMasks: Set<number> | null = null;
      const out: number[][] = [];
      for (let ti = 0; ti < touchedLen; ti++) {
        const m = touchedM[ti]!;
        const mask = mMask[m]!;
        mMask[m] = 0;
        if (seenMasks !== null && seenMasks.has(mask)) continue;
        let tmp = mask;
        let cnt = 0;
        while (tmp !== 0) {
          const low = tmp & -tmp;
          cnt += uCounts[31 - Math.clz32(low)]!;
          tmp ^= low;
        }
        if (cnt < 2) continue;
        if (seenMasks === null) seenMasks = new Set<number>();
        seenMasks.add(mask);
        const grp: number[] = [];
        for (let i = 0; i < sLen; i++) {
          const s = states[i]!;
          if ((mask & (1 << cidIdxMap[mt.stateCsId[s]!]!)) !== 0) grp.push(s);
        }
        out.push(grp);
      }
      return out;
    }
    const pSt = ++partStamp;
    let byM: Map<number, number[]> | null = null;
    for (let i = 0; i < sLen; i++) {
      const s = states[i]!, ms = mt.csMinterms[mt.stateCsId[s]!]!;
      for (let j = 0; j < ms.length; j++) {
        if (++partOps > MAX_PART_OPS) break;
        const m = ms[j]!;
        if (mStamp[m] !== pSt) {
          mStamp[m] = pSt;
          mFirst[m] = s;
        } else {
          if (byM === null) byM = new Map<number, number[]>();
          let list = byM.get(m);
          if (!list) { list = [mFirst[m]!, s]; byM.set(m, list); }
          else list.push(s);
        }
      }
      if (partOps > MAX_PART_OPS) break;
    }
    if (byM === null) return [];
    const dedup = new Set<string>(), out: number[][] = [];
    for (const list of byM.values()) {
      const key = list.join(',');
      if (!dedup.has(key)) { dedup.add(key); out.push(list); }
    }
    return out;
  };

  const seedSeen = new Set<string>();
  const queue: Array<{ states: number[]; depth: number; work: number }> = [];
  for (let u = 0; u <= n && queue.length < 256 && partOps <= MAX_PART_OPS; u++) {
    const outs = dagTo[u]!;
    if (outs.length < 2) continue;
    const groups = partition(outs);
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!, key = g.join(',');
      if (!seedSeen.has(key)) {
        seedSeen.add(key);
        queue.push({ states: g, depth: 1, work: 0 });
        if (queue.length >= 256) break;
      }
    }
  }
  for (let qh = 0; qh < queue.length && totalSteps < 512 && partOps <= MAX_PART_OPS; qh++) {
    const cur = queue[qh]!;
    if (cur.depth >= 64) continue;
    curStamp++;
    const nextStates: number[] = [];
    for (let i = 0; i < cur.states.length; i++) {
      const outs = dagTo[cur.states[i]!]!;
      for (let j = 0; j < outs.length; j++) {
        const v = outs[j]!;
        if (stamp[v] !== curStamp) { stamp[v] = curStamp; nextStates.push(v); }
      }
    }
    if (nextStates.length < 2) continue;
    const kids = partition(nextStates);
    for (let i = 0; i < kids.length; i++) {
      const b = kids[i]!, nextWork = cappedAdd(cur.work, b.length === 2 ? 1 : b.length);
      if (nextWork > maxWork) maxWork = nextWork;
      if (++totalSteps >= 512) break;
      queue.push({ states: b, depth: cur.depth + 1, work: nextWork });
    }
  }
  return maxWork;
}

function computeLeadingWork(
  n: number, topoOrder: number[], dagTo: number[][], dagPreds: number[][],
  dagPredMults: number[][], nfa: CompiledGlushkovNfa, mt: MintermTable,
  isLookaroundBody: boolean
): {
  maxUnaryDeepWork: number; maxUnaryRunDepth: number; maxPeriod2RunDepth: number;
  leadingNonLitWork: number; maxSharedPrefixWork: number;
  maxClassDagLen: number; maxDagDepth: number; maxStartOverlap: number;
} {
  const dagDepth = new Int32Array(n + 1), classLen = new Int32Array(n + 1), nlDp = new Int32Array(n + 1);
  const topoRank = new Int32Array(n + 1);
  let maxDagDepth = 0, maxClassDagLen = 0, leadingNonLitWork = 0;
  for (let i = 0; i < topoOrder.length; i++) {
    const v = topoOrder[i]!, preds = dagPreds[v]!, pMults = dagPredMults[v]!, isLit = nfa.posIsSingleLit[v] === 1;
    topoRank[v] = i;
    let d = 1, cPrev = 0, nlSum = 0;
    for (let j = 0; j < preds.length; j++) {
      const u = preds[j]!;
      if (u === 0) { if (!isLit) nlSum = cappedAdd(nlSum, pMults[j]!); }
      else {
        if (dagDepth[u]! + 1 > d) d = dagDepth[u]! + 1;
        if (classLen[u]! > cPrev) cPrev = classLen[u]!;
        if (!isLit && nlDp[u]! > 0) nlSum = cappedAdd(nlSum, cappedMul(nlDp[u]!, pMults[j]!));
      }
    }
    dagDepth[v] = d; if (d > maxDagDepth) maxDagDepth = d;
    classLen[v] = isLit ? 0 : cPrev + 1; if (classLen[v]! > maxClassDagLen) maxClassDagLen = classLen[v]!;
    nlDp[v] = nlSum; if (nlSum > 0) leadingNonLitWork = cappedAdd(leadingNonLitWork, nlSum);
  }
  if (!isLookaroundBody && leadingNonLitWork > MAX_LEADING_WORK) {
    return {
      maxUnaryDeepWork: 0, maxUnaryRunDepth: 0, maxPeriod2RunDepth: 0, leadingNonLitWork,
      maxSharedPrefixWork: 0, maxClassDagLen, maxDagDepth, maxStartOverlap: 0,
    };
  }

  const numMinterms = mt.numMinterms, mintermWords = mt.mintermWords;
  const stateCsId = mt.stateCsId, csMatchesMinterm = mt.csMatchesMinterm;
  const startTos = dagTo[0]!;
  const startMIdx = new Int32Array(numMinterms).fill(-1);
  const startMinterms: number[] = [];
  const startByMinterm: number[][] = [];
  let maxStartOverlap = 0;
  const csMark = new Int32Array(mt.csMinterms.length);
  const startUniqueCids: number[] = [];
  for (let i = 0; i < startTos.length; i++) {
    const s = startTos[i]!;
    const cid = stateCsId[s]!;
    if (csMark[cid] === 0) {
      csMark[cid] = 1;
      startUniqueCids.push(cid);
    }
    const ms = mt.csMinterms[cid]!;
    for (let j = 0; j < ms.length; j++) {
      const m = ms[j]!;
      let idx = startMIdx[m]!;
      if (idx === -1) {
        idx = startMinterms.length;
        startMIdx[m] = idx;
        startMinterms.push(m);
        startByMinterm.push([s]);
        if (1 > maxStartOverlap) maxStartOverlap = 1;
      } else {
        const list = startByMinterm[idx]!;
        list.push(s);
        if (list.length > maxStartOverlap) maxStartOverlap = list.length;
      }
    }
  }

  let maxUnaryDeepWork = 0;
  let maxUnaryRunDepth = startMinterms.length > 0 ? 1 : 0;
  const uDp = new Int32Array(n + 1), uDepth = new Int32Array(n + 1), uFlag = new Uint8Array(n + 1);
  const uSeen = new Int32Array(n + 1), uSub = new Int32Array(n + 1);
  let uStamp = 0;
  uDp[0] = 1;

  // Exact (P, F) minterm-equivalence bitset skipping: any remaining minterm m' matching every passed
  // CharSet and failing every failed CharSet produces the exact same seed set & BFS subgraph uSub.
  const MAX_UNARY_STEPS = 32_768;
  const mDone = new Uint32Array(mintermWords);
  const equiv = new Uint32Array(mintermWords);
  const remBits = numMinterms & 31;
  const lastWordMask = remBits === 0 ? -1 : ((0xffffffff >>> (32 - remBits)) | 0);
  let unarySteps = 0;
  let curCsMark = 1;
  let anyOther = 0;
  let curMw = 0;
  let curMb = 0;

  // Exact single-path linear prefix collapse: if startTos = [s_1] and s_1 -> s_2 -> ... -> s_L
  // is a unique-predecessor unit-multiplicity chain, intersect state minterm bitsets along the chain
  // so every minterm stopping inside s_1..s_L (or failing all exits of s_L) is resolved in O(L * words).
  if (startTos.length === 1 && mintermWords > 0) {
    const s1 = startTos[0]!;
    if (dagPreds[s1]!.length === 1 && dagPredMults[s1]![0] === 1) {
      const curMatch = new Uint32Array(mintermWords);
      const s1Base = stateCsId[s1]! * mintermWords;
      let anyAlive = 0;
      for (let w = 0; w < mintermWords; w++) {
        const v = csMatchesMinterm[s1Base + w]!;
        curMatch[w] = v;
        anyAlive |= v;
      }
      if (anyAlive !== 0) {
        let cur = s1;
        let depth = 1;
        let firstNonLit = nfa.posIsSingleLit[s1] === 0 ? 1 : 0;
        while (dagTo[cur]!.length === 1) {
          const nxt = dagTo[cur]![0]!;
          if (dagPreds[nxt]!.length !== 1 || dagPredMults[nxt]![0] !== 1) break;
          const nBase = stateCsId[nxt]! * mintermWords;
          let stoppedAny = 0;
          anyAlive = 0;
          for (let w = 0; w < mintermWords; w++) {
            const prev = curMatch[w]!;
            const keep = (prev & csMatchesMinterm[nBase + w]!) >>> 0;
            const stopped = (prev & ~keep) >>> 0;
            if (stopped !== 0) {
              mDone[w] |= stopped;
              stoppedAny |= stopped;
            }
            curMatch[w] = keep;
            anyAlive |= keep;
          }
          if (stoppedAny !== 0) {
            if (depth > maxUnaryRunDepth) maxUnaryRunDepth = depth;
            if (depth >= 2 && firstNonLit > 0) {
              const work = depth - firstNonLit + 1;
              if (work > maxUnaryDeepWork) maxUnaryDeepWork = work;
            }
          }
          if (anyAlive === 0) break;
          cur = nxt;
          depth++;
          if (firstNonLit === 0 && nfa.posIsSingleLit[cur] === 0) firstNonLit = depth;
        }
        if (anyAlive !== 0) {
          const exitUnion = new Uint32Array(mintermWords);
          const exits = dagTo[cur]!;
          for (let ei = 0; ei < exits.length; ei++) {
            const eBase = stateCsId[exits[ei]!]! * mintermWords;
            for (let w = 0; w < mintermWords; w++) exitUnion[w] |= csMatchesMinterm[eBase + w]!;
          }
          let stoppedAny = 0;
          for (let w = 0; w < mintermWords; w++) {
            const stopped = (curMatch[w]! & ~exitUnion[w]!) >>> 0;
            if (stopped !== 0) {
              mDone[w] |= stopped;
              stoppedAny |= stopped;
            }
          }
          if (stoppedAny !== 0) {
            if (depth > maxUnaryRunDepth) maxUnaryRunDepth = depth;
            if (depth >= 2 && firstNonLit > 0) {
              const work = depth - firstNonLit + 1;
              if (work > maxUnaryDeepWork) maxUnaryDeepWork = work;
            }
          }
        }
      }
    }
  }

  const initEquiv = (): void => {
    anyOther = 0;
    for (let w = 0; w < mintermWords; w++) {
      const mask = w === mintermWords - 1 ? lastWordMask : -1;
      const v = (~mDone[w]! & mask) | 0;
      equiv[w] = v;
      anyOther |= w === curMw ? (v & ~curMb) : v;
    }
  };
  const markPass = (c: number): void => {
    if (anyOther === 0 || csMark[c] === curCsMark) return;
    csMark[c] = curCsMark;
    const base = c * mintermWords;
    anyOther = 0;
    for (let w = 0; w < mintermWords; w++) {
      const v = (equiv[w]! & csMatchesMinterm[base + w]!) >>> 0;
      equiv[w] = v;
      anyOther |= w === curMw ? (v & ~curMb) : v;
    }
  };
  const markFail = (c: number): void => {
    if (anyOther === 0 || csMark[c] === curCsMark) return;
    csMark[c] = curCsMark;
    const base = c * mintermWords;
    anyOther = 0;
    for (let w = 0; w < mintermWords; w++) {
      const v = (equiv[w]! & ~csMatchesMinterm[base + w]!) >>> 0;
      equiv[w] = v;
      anyOther |= w === curMw ? (v & ~curMb) : v;
    }
  };

  for (let mi = 0; mi < startMinterms.length; mi++) {
    const m = startMinterms[mi]!, mw = m >>> 5, mb = 1 << (m & 31), seeds = startByMinterm[mi]!;
    if ((mDone[mw]! & mb) !== 0) continue;
    mDone[mw] |= mb;

    // Fast skip when no start transition for minterm m can step to a matching successor (depth === 1)
    let hasStep2 = false;
    let step2Checks = 0;
    for (let i = 0; i < seeds.length && !hasStep2; i++) {
      const tos = dagTo[seeds[i]!]!;
      for (let j = 0; j < tos.length; j++) {
        step2Checks++;
        if ((csMatchesMinterm[stateCsId[tos[j]!]! * mintermWords + mw]! & mb) !== 0) { hasStep2 = true; break; }
      }
    }
    unarySteps += step2Checks;
    if (unarySteps > MAX_UNARY_STEPS) {
      if (!isLookaroundBody) maxUnaryDeepWork = MAX_LEADING_WORK + 1;
      break;
    }
    let canHaveEquiv = startMinterms.length - mi > 1;
    for (let i = 0; i < seeds.length && canHaveEquiv; i++) {
      if (mt.csMinterms[stateCsId[seeds[i]!]!]!.length <= 1) canHaveEquiv = false;
    }
    if (!hasStep2) {
      if (canHaveEquiv && step2Checks > 4 && startMinterms.length - mi > 4) {
        curMw = mw; curMb = mb;
        initEquiv();
        ++curCsMark;
        for (let i = 0; i < seeds.length && anyOther !== 0; i++) markPass(stateCsId[seeds[i]!]!);
        for (let i = 0; i < startUniqueCids.length && anyOther !== 0; i++) {
          const c = startUniqueCids[i]!;
          if (csMark[c] !== curCsMark) markFail(c);
        }
        for (let i = 0; i < seeds.length && anyOther !== 0; i++) {
          const tos = dagTo[seeds[i]!]!;
          for (let j = 0; j < tos.length && anyOther !== 0; j++) markFail(stateCsId[tos[j]!]!);
        }
        if (anyOther !== 0) {
          for (let w = 0; w < mintermWords; w++) mDone[w] |= equiv[w]!;
        }
      }
      continue;
    }

    // Sparse BFS visiting only states reachable from seeds along m-matching edges
    if (canHaveEquiv) {
      curMw = mw; curMb = mb;
      initEquiv();
      ++curCsMark;
    } else {
      anyOther = 0;
    }
    const st = ++uStamp;
    let subLen = 0;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i]!;
      if (uSeen[s] !== st) {
        uSeen[s] = st;
        uSub[subLen++] = s;
        if (anyOther !== 0) markPass(stateCsId[s]!);
      }
    }
    if (anyOther !== 0) {
      for (let i = 0; i < startUniqueCids.length && anyOther !== 0; i++) {
        const c = startUniqueCids[i]!;
        if (csMark[c] !== curCsMark) markFail(c);
      }
    }
    let unaryOverflow = false;
    for (let qh = 0; qh < subLen; qh++) {
      const tos = dagTo[uSub[qh]!]!;
      for (let j = 0; j < tos.length; j++) {
        if (++unarySteps > MAX_UNARY_STEPS) { unaryOverflow = true; break; }
        const v = tos[j]!;
        if (uSeen[v] !== st) {
          const vCid = stateCsId[v]!;
          if ((csMatchesMinterm[vCid * mintermWords + mw]! & mb) !== 0) {
            uSeen[v] = st;
            uSub[subLen++] = v;
            if (anyOther !== 0) markPass(vCid);
          } else if (anyOther !== 0) {
            markFail(vCid);
          }
        }
      }
      if (unaryOverflow) break;
    }
    if (unaryOverflow) {
      if (!isLookaroundBody) maxUnaryDeepWork = MAX_LEADING_WORK + 1;
      break;
    }
    if (anyOther !== 0) {
      for (let w = 0; w < mintermWords; w++) mDone[w] |= equiv[w]!;
    }
    const useSub = subLen <= 64;
    if (useSub) {
      for (let i = 1; i < subLen; i++) {
        const v = uSub[i]!, rv = topoRank[v]!;
        let j = i - 1;
        while (j >= 0 && topoRank[uSub[j]!]! > rv) {
          uSub[j + 1] = uSub[j]!;
          j--;
        }
        uSub[j + 1] = v;
      }
    }

    let uMaxDepth = 0, rawWork = 0, nonLitOrBranched = 0;
    const iterLen = useSub ? subLen : topoOrder.length;
    for (let i = 0; i < iterLen; i++) {
      const v = useSub ? uSub[i]! : topoOrder[i]!;
      if (uSeen[v] !== st) {
        if (++unarySteps > MAX_UNARY_STEPS) { unaryOverflow = true; break; }
        continue;
      }
      const preds = dagPreds[v]!, pMults = dagPredMults[v]!;
      unarySteps += preds.length + 1;
      if (unarySteps > MAX_UNARY_STEPS) { unaryOverflow = true; break; }
      let sum = 0, md = 0, flg = nfa.posIsSingleLit[v] === 0 ? 1 : 0;
      for (let j = 0; j < preds.length; j++) {
        const u = preds[j]!;
        if (u !== 0 && uSeen[u] !== st) continue;
        sum = cappedAdd(sum, cappedMul(uDp[u]!, pMults[j]!));
        if (uDepth[u]! + 1 > md) md = uDepth[u]! + 1;
        if (uFlag[u] === 1) flg = 1;
      }
      if (sum === 0) continue;
      if (sum > 1) flg = 1;
      uDp[v] = sum; uDepth[v] = md; uFlag[v] = flg;
      if (md > uMaxDepth) uMaxDepth = md;
      rawWork = cappedAdd(rawWork, sum);
      if (flg === 1) nonLitOrBranched = cappedAdd(nonLitOrBranched, sum);
    }
    if (unaryOverflow) {
      if (!isLookaroundBody) maxUnaryDeepWork = MAX_LEADING_WORK + 1;
      break;
    }
    if (uMaxDepth > maxUnaryRunDepth) maxUnaryRunDepth = uMaxDepth;
    if (uMaxDepth >= 2) {
      const excessLit = rawWork > uMaxDepth ? rawWork - uMaxDepth : 0;
      const work = nonLitOrBranched > excessLit ? nonLitOrBranched : excessLit;
      if (work > maxUnaryDeepWork) maxUnaryDeepWork = work;
      if (!isLookaroundBody && maxUnaryDeepWork > MAX_LEADING_WORK) break;
    }
  }

  // Compute longest leading period-2 alternating run (e.g. (?:ab){125}(?:x|y))
  let maxPeriod2RunDepth = 0;
  if (maxDagDepth > 16 && Math.max(maxUnaryDeepWork, leadingNonLitWork) <= MAX_LEADING_WORK) {
    const MAX_PERIOD2_CANDIDATES = 16;
    const MAX_PERIOD2_STEPS = 16_384;
    const numCs = mt.csMinterms.length;
    const remDepth = new Int32Array(n + 1).fill(1);
    for (let i = topoOrder.length - 1; i >= 0; i--) {
      const u = topoOrder[i]!;
      let best = 1;
      const tos = dagTo[u]!;
      for (let j = 0; j < tos.length; j++) {
        const d = remDepth[tos[j]!]! + 1;
        if (d > best) best = d;
      }
      remDepth[u] = best;
    }
    const csIdsOverlap = (a: number, b: number): boolean => {
      const msA = mt.csMinterms[a]!;
      if (a === b) return msA.length > 0;
      if (msA.length === 1) {
        const m = msA[0]!;
        return (csMatchesMinterm[b * mintermWords + (m >>> 5)]! & (1 << (m & 31))) !== 0;
      }
      const msB = mt.csMinterms[b]!;
      if (msB.length === 1) {
        const m = msB[0]!;
        return (csMatchesMinterm[a * mintermWords + (m >>> 5)]! & (1 << (m & 31))) !== 0;
      }
      const aBase = a * mintermWords, bBase = b * mintermWords;
      for (let w = 0; w < mintermWords; w++) {
        if ((csMatchesMinterm[aBase + w]! & csMatchesMinterm[bBase + w]!) !== 0) return true;
      }
      return false;
    };
    const seenPair = new Set<number>();
    const candCid1: number[] = [], candCid2: number[] = [];
    let period2Overflow = false;
    let p2Steps = 0;
    for (let i = 0; i < startTos.length && !period2Overflow; i++) {
      const s1 = startTos[i]!;
      if (remDepth[s1]! <= 16) continue;
      const cid1 = stateCsId[s1]!;
      const tos1 = dagTo[s1]!;
      for (let j = 0; j < tos1.length && !period2Overflow; j++) {
        const s2 = tos1[j]!;
        if (remDepth[s2]! <= 15) continue;
        const cid2 = stateCsId[s2]!;
        const pk = cid1 * numCs + cid2;
        if (seenPair.has(pk)) continue;
        const tos2 = dagTo[s2]!;
        let has4 = false;
        for (let a = 0; a < tos2.length && !has4 && !period2Overflow; a++) {
          if (++p2Steps > MAX_PERIOD2_STEPS) { period2Overflow = true; maxPeriod2RunDepth = maxDagDepth; break; }
          const s3 = tos2[a]!;
          if (remDepth[s3]! <= 14 || !csIdsOverlap(stateCsId[s3]!, cid1)) continue;
          const tos3 = dagTo[s3]!;
          for (let b = 0; b < tos3.length; b++) {
            if (++p2Steps > MAX_PERIOD2_STEPS) { period2Overflow = true; maxPeriod2RunDepth = maxDagDepth; break; }
            const s4 = tos3[b]!;
            if (remDepth[s4]! > 13 && csIdsOverlap(stateCsId[s4]!, cid2)) { has4 = true; break; }
          }
        }
        if (has4 && !period2Overflow) {
          seenPair.add(pk);
          if (candCid1.length >= MAX_PERIOD2_CANDIDATES) {
            period2Overflow = true;
            maxPeriod2RunDepth = maxDagDepth;
            break;
          }
          candCid1.push(cid1); candCid2.push(cid2);
        }
      }
    }
    if (!period2Overflow && candCid1.length > 0) {
      const ovCache = new Map<number, Uint8Array>();
      const getOverlapRow = (cid: number): Uint8Array => {
        let row = ovCache.get(cid);
        if (row !== undefined) return row;
        row = new Uint8Array(numCs);
        const base = cid * mintermWords;
        for (let other = 0; other < numCs; other++) {
          const oBase = other * mintermWords;
          for (let w = 0; w < mintermWords; w++) {
            if ((csMatchesMinterm[base + w]! & csMatchesMinterm[oBase + w]!) !== 0) {
              row[other] = 1;
              break;
            }
          }
        }
        ovCache.set(cid, row);
        return row;
      };
      const pOdd = new Int32Array(n + 1);
      const pEven = new Int32Array(n + 1);
      for (let ci = 0; ci < candCid1.length && !period2Overflow; ci++) {
        const ov1 = getOverlapRow(candCid1[ci]!), ov2 = getOverlapRow(candCid2[ci]!);
        pOdd.fill(0); pEven.fill(0);
        for (let i = 0; i < startTos.length; i++) {
          const s = startTos[i]!;
          if (ov1[stateCsId[s]!] === 1) pOdd[s] = 1;
        }
        for (let i = 0; i < topoOrder.length && !period2Overflow; i++) {
          const u = topoOrder[i]!;
          const od = pOdd[u]!, ev = pEven[u]!;
          if (od === 0 && ev === 0) continue;
          if (od > maxPeriod2RunDepth) maxPeriod2RunDepth = od;
          if (ev > maxPeriod2RunDepth) maxPeriod2RunDepth = ev;
          const tos = dagTo[u]!;
          for (let j = 0; j < tos.length; j++) {
            if (++p2Steps > MAX_PERIOD2_STEPS) { period2Overflow = true; maxPeriod2RunDepth = maxDagDepth; break; }
            const v = tos[j]!;
            const vCid = stateCsId[v]!;
            if (od > 0 && od + 1 > pEven[v]! && ov2[vCid] === 1) pEven[v] = od + 1;
            if (ev > 0 && ev + 1 > pOdd[v]! && ov1[vCid] === 1) pOdd[v] = ev + 1;
          }
        }
      }
    }
  }

  return {
    maxUnaryDeepWork, maxUnaryRunDepth, maxPeriod2RunDepth, leadingNonLitWork,
    maxSharedPrefixWork: Math.max(maxUnaryDeepWork, leadingNonLitWork) > MAX_LEADING_WORK
      ? 0
      : computeSharedPrefixWork(n, dagTo, mt),
    maxClassDagLen, maxDagDepth, maxStartOverlap,
  };
}

function analyzeAstNfa(ast: RegexAstNode, isLookaroundBody: boolean, maxStates: number): ParseResult<NfaMetrics> {
  const preRes = validateAstPrepass(ast, isLookaroundBody);
  if (!preRes.ok) return preRes;
  const pre = preRes.value;
  const compiled = compileGlushkovNfa(ast, maxStates, pre.lookaroundMap);
  if (!compiled.ok) return compiled;
  const nfa = compiled.value, n = nfa.numStates;

  if (n === 0) {
    return {
      ok: true,
      value: {
        numStates: 0, nonLitStates: 0, hasCycle: false, hasBroadLoop: false, unanchoredIda: 1, anchoredIda: 1,
        leadingCycleCount: 0, maxPostLeadingCluster: 1, maxLeadingCyclePreMult: 1,
        maxLeadingCycleStates: 0, maxLeadingCycleNonLitStates: 0,
        maxLeadingCycleExitFanout: 1, maxLeadingCycleNonLitExitFanout: 0,
        maxLeadingCycleComplexExits: 0, totalStartPumpableNonLitExits: 0, hasLeadingComplexCycle: false,
        hasLeadingCycleBacktrack: false, maxCycleEntryPreds: 0,
        safePunctPairCount: 0, safePunctDirectPreds: 1, maxSafePunctExitFanout: 1,
        maxCycleOverlapWork: 0, maxCycleOverlapCost: 1, maxCycleEpsExit: 1, nonLeadingCycleCost: 0,
        maxPathMult: Math.max(1, nfa.emptyPaths), maxRawStatePaths: 1, totalDagWork: 0, branchedDagWork: 0,
        maxUnaryDeepWork: 0, maxUnaryRunDepth: 0, maxPeriod2RunDepth: 0, leadingNonLitWork: 0, maxSharedPrefixWork: 0,
        maxClassDagLen: 0, maxDagDepth: 0, maxStartOverlap: 0,
        capturesInRepeating: pre.capturesInRepeating,
        totalLookbehindStates: pre.totalLookbehindStates, maxRepeatingLookaheadDepth: pre.maxRepeatingLookaheadDepth,
        maxRepeatingLookaheadWork: pre.maxRepeatingLookaheadWork,
      },
    };
  }

  let nonLitStates = 0;
  for (let s = 1; s <= n; s++) if (nfa.posIsSingleLit[s] === 0) nonLitStates++;

  // Acyclic linear chain fast path (strictly out-degree <= 1 everywhere, <= 1 accept state, zero lookarounds)
  if (!nfa.hasBackEdge && pre.totalLookarounds === 0 && nfa.emptyPaths <= 1 && nfa.acceptPos.length <= 1) {
    let isLinearChain = nfa.edgeTo[0]!.length <= 1;
    for (let s = 1; s <= n && isLinearChain; s++) {
      if (nfa.edgeTo[s]!.length > 1) isLinearChain = false;
    }
    if (isLinearChain) {
      const seen = new Uint8Array(n + 1);
      let cur = 0, depth = 0, curClassLen = 0, maxClassDagLen = 0, leadingNonLitWork = 0, leadingNlActive = true;
      let unaryRun = 0, unaryFirstNl = 0, unaryActive = true;
      let unaryCs: CharSet = CHARSET_ANY;
      let period2Run = 0, period2Active = true;
      let oddCs: CharSet = CHARSET_ANY, evenCs: CharSet = CHARSET_ANY;
      let startOverlap = 0;
      while (nfa.edgeTo[cur]!.length === 1) {
        if (nfa.edgeMult[cur]![0]! > 1) { isLinearChain = false; break; }
        const nxt = nfa.edgeTo[cur]![0]!;
        if (seen[nxt] === 1) { isLinearChain = false; break; }
        seen[nxt] = 1; cur = nxt; depth++;
        const isLit = nfa.posIsSingleLit[nxt] === 1;
        if (!isLit) {
          curClassLen++;
          if (curClassLen > maxClassDagLen) maxClassDagLen = curClassLen;
          if (leadingNlActive) leadingNonLitWork++;
        } else {
          curClassLen = 0;
          leadingNlActive = false;
        }
        const cs = nfa.posCharSet[nxt]!;
        if (depth === 1) {
          if (isEmptyCharSet(cs)) {
            unaryActive = false; period2Active = false;
          } else {
            startOverlap = 1;
            unaryCs = cs; unaryRun = 1;
            if (!isLit) unaryFirstNl = 1;
            oddCs = cs; period2Run = 1;
          }
        } else {
          if (unaryActive) {
            unaryCs = intersectCharSet(unaryCs, cs);
            if (!isEmptyCharSet(unaryCs)) {
              unaryRun++;
              if (!isLit && unaryFirstNl === 0) unaryFirstNl = depth;
            } else {
              unaryActive = false;
            }
          }
          if (period2Active) {
            if (depth === 2) {
              if (isEmptyCharSet(cs)) { period2Active = false; }
              else { evenCs = cs; period2Run = 2; }
            } else if ((depth & 1) === 1) {
              oddCs = intersectCharSet(oddCs, cs);
              if (!isEmptyCharSet(oddCs)) period2Run++;
              else period2Active = false;
            } else {
              evenCs = intersectCharSet(evenCs, cs);
              if (!isEmptyCharSet(evenCs)) period2Run++;
              else period2Active = false;
            }
          }
        }
      }
      if (isLinearChain && depth === n) {
        const maxUnaryDeepWork = unaryRun >= 2 && unaryFirstNl > 0 ? unaryRun - unaryFirstNl + 1 : 0;
        if (!isLookaroundBody && Math.max(maxUnaryDeepWork, leadingNonLitWork) > MAX_LEADING_WORK) {
          return { ok: false, reason: 'excessive unanchored leading backtracking work' };
        }
        return {
          ok: true,
          value: {
            numStates: n, nonLitStates, hasCycle: false, hasBroadLoop: false, unanchoredIda: 1, anchoredIda: 1,
            leadingCycleCount: 0, maxPostLeadingCluster: 1, maxLeadingCyclePreMult: 1,
            maxLeadingCycleStates: 0, maxLeadingCycleNonLitStates: 0,
            maxLeadingCycleExitFanout: 1, maxLeadingCycleNonLitExitFanout: 0,
            maxLeadingCycleComplexExits: 0, totalStartPumpableNonLitExits: 0, hasLeadingComplexCycle: false,
            hasLeadingCycleBacktrack: false, maxCycleEntryPreds: 0,
            safePunctPairCount: 0, safePunctDirectPreds: 1, maxSafePunctExitFanout: 1,
            maxCycleOverlapWork: 0, maxCycleOverlapCost: 1, maxCycleEpsExit: 1, nonLeadingCycleCost: 0,
            maxPathMult: 1, maxRawStatePaths: 1, totalDagWork: n, branchedDagWork: 0,
            maxUnaryDeepWork, maxUnaryRunDepth: unaryRun, maxPeriod2RunDepth: period2Run,
            leadingNonLitWork, maxSharedPrefixWork: 0,
            maxClassDagLen, maxDagDepth: depth, maxStartOverlap: startOverlap,
            capturesInRepeating: pre.capturesInRepeating,
            totalLookbehindStates: 0, maxRepeatingLookaheadDepth: 0, maxRepeatingLookaheadWork: 0,
          },
        };
      }
    }
  }

  let reachable: Uint8Array, rawSccs: number[][], sccOf: Int32Array, isCyclicScc: Uint8Array, cyclicSccs: number[], topoOrder: number[];
  if (!nfa.hasBackEdge) {
    reachable = new Uint8Array(n + 1).fill(1);
    rawSccs = []; sccOf = new Int32Array(n + 1); isCyclicScc = new Uint8Array(n); cyclicSccs = [];
    topoOrder = new Array<number>(n);
    for (let s = 1; s <= n; s++) { sccOf[s] = s - 1; topoOrder[s - 1] = s; }
  } else {
    reachable = bfsReach([0], nfa.edgeTo, n);
    rawSccs = runTarjanScc(1, n, nfa.edgeTo, reachable);
    sccOf = new Int32Array(n + 1).fill(-1);
    isCyclicScc = new Uint8Array(rawSccs.length);
    cyclicSccs = []; topoOrder = [];
    let multiStateCycCount = 0;
    for (let cid = 0; cid < rawSccs.length; cid++) {
      const comp = rawSccs[cid]!;
      for (let i = 0; i < comp.length; i++) { sccOf[comp[i]!] = cid; topoOrder.push(comp[i]!); }
      if (comp.length >= 2 || (comp.length === 1 && nfa.edgeTo[comp[0]!]!.includes(comp[0]!))) {
        if (comp.length > MAX_CYCLE_SCC_STATES) return { ok: false, reason: 'cyclic automaton component exceeds safe state limit' };
        isCyclicScc[cid] = 1; cyclicSccs.push(cid);
        if (cyclicSccs.length > MAX_CYCLIC_SCCS) return { ok: false, reason: 'excessive cyclic quantifiers in pattern' };
        if (comp.length >= 2 && ++multiStateCycCount > MAX_MULTI_STATE_CYCLIC_SCCS) {
          return { ok: false, reason: 'excessive multi-state cyclic quantifiers in pattern' };
        }
      }
    }
    if (cyclicSccs.length > 0 && pre.totalCaptures > MAX_CAPTURES_IN_CYCLIC) {
      return { ok: false, reason: 'excessive capturing groups in cyclic regular expression' };
    }
  }

  const acceptMultOf = new Int32Array(n + 1);
  for (let i = 0; i < nfa.acceptPos.length; i++) {
    const u = nfa.acceptPos[i]!;
    if (reachable[u] === 1) acceptMultOf[u] = cappedAdd(acceptMultOf[u]!, nfa.acceptMult[i]!);
  }

  let dagTo: number[][];
  if (nfa.hasBackEdge) {
    dagTo = new Array<number[]>(n + 1);
    for (let i = 0; i <= n; i++) dagTo[i] = [];
  } else {
    dagTo = nfa.edgeTo;
  }
  const dagPreds: number[][] = new Array<number[]>(n + 1);
  const dagPredMults: number[][] = new Array<number[]>(n + 1);
  for (let i = 0; i <= n; i++) {
    dagPreds[i] = [];
    dagPredMults[i] = [];
  }
  let isPureTree = nfa.emptyPaths <= 1;
  for (let u = 0; u <= n; u++) {
    if (reachable[u] === 0) continue;
    const uScc = u === 0 ? -1 : sccOf[u]!, tos = nfa.edgeTo[u]!, mults = nfa.edgeMult[u]!;
    for (let i = 0; i < tos.length; i++) {
      const v = tos[i]!;
      if (reachable[v] === 0) continue;
      if (!nfa.hasBackEdge || u === 0 || sccOf[v]! > uScc) {
        if (nfa.hasBackEdge) dagTo[u]!.push(v);
        const m = mults[i]!;
        dagPreds[v]!.push(u); dagPredMults[v]!.push(m);
        if (dagPreds[v]!.length > 1 || m > 1) isPureTree = false;
      }
    }
  }

  const mt = computeMinterms(nfa);
  let sameWordDp: Int32Array, rawPathDp: Int32Array, maxPathMult: number, maxRawStatePaths: number, totalDagWork: number, branchedDagWork: number;
  let areStatesCompat: (a: number, b: number) => boolean = () => false;
  if (isPureTree && cyclicSccs.length === 0 && pre.totalLookbehindStates === 0) {
    sameWordDp = new Int32Array(n + 1).fill(1);
    rawPathDp = new Int32Array(n + 1).fill(1);
    maxPathMult = 1; totalDagWork = topoOrder.length; branchedDagWork = 0;
    const accChainDp = new Int32Array(n + 1);
    maxRawStatePaths = 1;
    for (let i = 0; i < topoOrder.length; i++) {
      const v = topoOrder[i]!;
      const p = dagPreds[v]!.length === 1 ? accChainDp[dagPreds[v]![0]!]! : 0;
      const ac = p + (acceptMultOf[v]! > 0 ? 1 : 0);
      accChainDp[v] = ac;
      if (ac > maxRawStatePaths) maxRawStatePaths = ac;
    }
    if (maxRawStatePaths > MAX_DAG_PATH_MULT) return { ok: false, reason: 'excessive finite variable-length backtracking paths' };
  } else {
    const dagRes = computeProductDagDp(n, topoOrder, rawSccs, sccOf, isCyclicScc, dagTo, dagPreds, dagPredMults, acceptMultOf, nfa, reachable, mt);
    ({ sameWordDp, rawPathDp, maxPathMult, maxRawStatePaths, totalDagWork, branchedDagWork, areStatesCompat } = dagRes);
    if (maxPathMult > MAX_DAG_PATH_MULT) return { ok: false, reason: 'excessive finite backtracking ambiguity' };
    if (maxRawStatePaths > MAX_DAG_PATH_MULT) return { ok: false, reason: 'excessive finite variable-length backtracking paths' };
    if (totalDagWork > MAX_DAG_TOTAL_WORK) return { ok: false, reason: 'excessive finite backtracking work' };
    if (pre.totalLookbehindStates > 0) {
      for (const lb of pre.lookaroundMap.values()) {
        if (!lb.isLookbehind) continue;
        const holders: number[] = [];
        for (let s = 0; s <= n; s++) {
          if (s > 0 && reachable[s] === 0) continue;
          const lbs = nfa.stateLookbehinds[s];
          if (lbs && lbs.includes(lb)) holders.push(s);
        }
        const entryPaths = dagRes.prefixSumStates(holders);
        if (cappedMul(entryPaths, lb.states) > MAX_DAG_PATH_MULT) {
          return { ok: false, reason: 'excessive backtracking paths entering lookbehind assertion' };
        }
      }
    }
  }

  let cycRes: CyclicAnalysisResult = {
    hasBroadLoop: false, unanchoredIda: 1, anchoredIda: 1, leadingCycleCount: 0,
    maxPostLeadingCluster: 1, maxLeadingCyclePreMult: 1, maxLeadingCycleStates: 0,
    maxLeadingCycleNonLitStates: 0, maxLeadingCycleExitFanout: 1, maxLeadingCycleNonLitExitFanout: 0,
    maxLeadingCycleComplexExits: 0, totalStartPumpableNonLitExits: 0, hasLeadingComplexCycle: false,
    hasLeadingCycleBacktrack: false, maxCycleEntryPreds: 0, safePunctPairCount: 0, safePunctDirectPreds: 1,
    maxSafePunctExitFanout: 1, maxCycleOverlapWork: 0, maxCycleOverlapCost: 1, maxCycleEpsExit: 1,
    nonLeadingCycleCost: 0,
  };
  if (cyclicSccs.length > 0) {
    const statesShareMinterm3 = (a: number, b: number, c: number): boolean => {
      const aList = mt.csMinterms[mt.stateCsId[a]!]!, mwCount = mt.mintermWords;
      const bBase = mt.stateCsId[b]! * mwCount, cBase = mt.stateCsId[c]! * mwCount;
      for (let i = 0; i < aList.length; i++) {
        const m = aList[i]!, mw = m >>> 5, mb = 1 << (m & 31);
        if ((mt.csMatchesMinterm[bBase + mw]! & mb) !== 0 && (mt.csMatchesMinterm[cBase + mw]! & mb) !== 0) return true;
      }
      return false;
    };
    const r = analyzeCyclicSccs(n, nfa, reachable, rawSccs, sccOf, isCyclicScc, cyclicSccs,
      topoOrder, dagTo, dagPreds, dagPredMults, acceptMultOf, sameWordDp, rawPathDp, maxPathMult, maxRawStatePaths,
      isLookaroundBody, statesShareMinterm3, pre.capturesInRepeating, areStatesCompat, mt);
    if (!r.ok) return r;
    cycRes = r.value;
  }

  const lead = computeLeadingWork(n, topoOrder, dagTo, dagPreds, dagPredMults, nfa, mt, isLookaroundBody);
  if (!isLookaroundBody && Math.max(lead.maxUnaryDeepWork, lead.leadingNonLitWork, lead.maxSharedPrefixWork) > MAX_LEADING_WORK) {
    return { ok: false, reason: 'excessive unanchored leading backtracking work' };
  }
  return {
    ok: true,
    value: {
      numStates: n, nonLitStates, hasCycle: cyclicSccs.length > 0, ...cycRes,
      maxPathMult, maxRawStatePaths, totalDagWork, branchedDagWork, ...lead,
      capturesInRepeating: pre.capturesInRepeating,
      totalLookbehindStates: pre.totalLookbehindStates,
      maxRepeatingLookaheadDepth: pre.maxRepeatingLookaheadDepth,
      maxRepeatingLookaheadWork: pre.maxRepeatingLookaheadWork,
    },
  };
}

interface RegexSafetyAnalysis extends RegexSafetyResult {
  costWeight: number;
}

function analyzeRegexSafetyWithCost(pattern: string): RegexSafetyAnalysis {
  if (typeof pattern !== 'string') return { safe: false, reason: SYNTAX_ERROR_REASON, costWeight: 0 };
  const parsed = parseRegex(pattern);
  if (!parsed.ok) return { safe: false, reason: parsed.reason, costWeight: 0 };
  const analyzed = analyzeAstNfa(parsed.value, false, MAX_NFA_STATES);
  if (!analyzed.ok) return { safe: false, reason: analyzed.reason, costWeight: 0 };
  const m = analyzed.value;

  // Smooth, cliff-free NFA-driven per-pack complexity cost weight
  let costWeight = 1;
  if (m.leadingCycleCount >= 1) {
    const totalLeadCycles = m.leadingCycleCount * Math.max(1, m.maxPostLeadingCluster);
    const preMultScale = Math.max(1, m.maxLeadingCyclePreMult);
    const stateScale = Math.max(
      1,
      Math.ceil(m.maxLeadingCycleStates / 4),
      m.maxLeadingCycleStates >= 2 && m.maxLeadingCycleNonLitStates >= 1
        ? Math.ceil((m.maxLeadingCycleStates * m.maxLeadingCycleNonLitStates) / 2)
        : 1
    );
    const exitScale = Math.max(
      1,
      Math.ceil(m.maxLeadingCycleExitFanout / 8),
      m.maxLeadingCycleNonLitExitFanout,
      m.totalStartPumpableNonLitExits - 1,
      m.maxLeadingCycleComplexExits * 5
    );
    const bodyComplexScale = m.hasLeadingComplexCycle ? 5 : 1;
    const capScale = m.hasLeadingCycleBacktrack ? 1 + m.capturesInRepeating : 1;
    costWeight = Math.max(
      costWeight,
      totalLeadCycles *
        60 *
        preMultScale *
        stateScale *
        exitScale *
        bodyComplexScale *
        capScale *
        Math.max(1, m.maxCycleOverlapCost) *
        Math.max(1, m.maxCycleEpsExit) *
        Math.max(1, m.maxRepeatingLookaheadDepth)
    );
  }
  if (m.safePunctPairCount >= 1) {
    costWeight = Math.max(
      costWeight,
      m.safePunctPairCount *
        51 *
        Math.max(1, m.safePunctDirectPreds) *
        Math.max(1, m.maxSafePunctExitFanout) *
        (1 + m.capturesInRepeating) *
        Math.max(1, m.maxCycleOverlapWork) *
        Math.max(1, m.maxCycleEpsExit)
    );
  }
  if (m.nonLeadingCycleCost > 1) costWeight = Math.max(costWeight, m.nonLeadingCycleCost);
  if (m.hasBroadLoop) costWeight = Math.max(costWeight, 32);
  if (m.maxCycleEntryPreds > 4) costWeight = Math.max(costWeight, Math.ceil(m.maxCycleEntryPreds / 3));
  if (m.maxRepeatingLookaheadWork > 4) costWeight = Math.max(costWeight, Math.ceil(m.maxRepeatingLookaheadWork / 4));
  if (m.totalLookbehindStates > 4) costWeight = Math.max(costWeight, Math.ceil(m.totalLookbehindStates / 2));
  const effectiveLeadingWork = Math.max(m.maxUnaryDeepWork, m.leadingNonLitWork);
  if (effectiveLeadingWork > 8) costWeight = Math.max(costWeight, Math.ceil((effectiveLeadingWork - 4) / 4));
  if (m.maxSharedPrefixWork > 12) costWeight = Math.max(costWeight, Math.ceil((m.maxSharedPrefixWork - 8) / 4));
  if (m.maxRawStatePaths > 16) costWeight = Math.max(costWeight, Math.ceil((m.maxRawStatePaths - 8) / 4));
  if (m.maxClassDagLen > 12) costWeight = Math.max(costWeight, Math.ceil(m.maxClassDagLen / 6));
  if (m.maxUnaryRunDepth > 8) costWeight = Math.max(costWeight, Math.ceil(m.maxUnaryRunDepth / 4));
  if (m.maxPeriod2RunDepth > 16) costWeight = Math.max(costWeight, Math.ceil(m.maxPeriod2RunDepth / 8));
  if (m.nonLitStates > 0 && m.maxDagDepth > 36) costWeight = Math.max(costWeight, Math.ceil((m.maxDagDepth - 28) / 6));
  if (m.maxDagDepth > 160) costWeight = Math.max(costWeight, Math.ceil((m.maxDagDepth - 140) / 10));
  if (m.maxPathMult > 16) costWeight = Math.max(costWeight, Math.ceil(m.maxPathMult / 8));
  if (m.branchedDagWork > 16) costWeight = Math.max(costWeight, Math.ceil(m.branchedDagWork / 8));
  if (m.totalDagWork > 256) costWeight = Math.max(costWeight, Math.ceil(m.totalDagWork / 64));
  if (costWeight > MAX_RULE_PACK_REGEX_COST_BUDGET) {
    return { safe: false, reason: 'regular expression exceeds safe complexity budget', costWeight };
  }
  return { safe: true, costWeight };
}

/**
 * Performs fail-closed static automata analysis of an ECMAScript regular expression
 * (evaluated case-insensitively with `/i`) using a weighted epsilon-free Glushkov NFA,
 * exact 65,536-BMP `/i` + ES2025 disjoint minterms, product-automaton EDA (`EDA === 0`),
 * exact Weideman same-word IDA (`U_IDA <= 2`), product-DAG `sameWordDp` ambiguity bounds,
 * strict fail-closed backreference & bounded lookaround policies, and smooth NFA cost budgets.
 */
export function checkRegexSafety(pattern: string): RegexSafetyResult {
  const res = analyzeRegexSafetyWithCost(pattern);
  return res.safe ? { safe: true } : { safe: false, reason: res.reason };
}

/**
 * Boolean convenience wrapper around `checkRegexSafety(pattern)`.
 */
export function isSafeRegexPattern(pattern: string): boolean {
  return checkRegexSafety(pattern).safe;
}

function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).byteLength;
}

function hasAsciiControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

interface VerifiedSubtreeInfo {
  size: number;
  maxSubDepth: number;
  estChars: number;
}

interface GraphTraversalState {
  visited: number;
  estChars: number;
}

function assertSafeGraph(
  node: unknown,
  active = new WeakSet<object>(),
  verified = new WeakMap<object, VerifiedSubtreeInfo>(),
  state: GraphTraversalState = { visited: 0, estChars: 0 },
  depth = 0
): number {
  if (
    typeof node === 'function' ||
    typeof node === 'symbol' ||
    typeof node === 'bigint'
  ) {
    throw new Error('Rule pack must contain only JSON-compatible values');
  }
  if (node === null || typeof node !== 'object') {
    state.visited += 1;
    if (typeof node === 'string') {
      state.estChars += node.length;
      if (state.estChars > MAX_GRAPH_EST_CHARS) {
        throw new Error(
          `Rule pack exceeds maximum size of ${MAX_RULE_PACK_BYTES} bytes`
        );
      }
    }
    if (state.visited > MAX_GRAPH_NODES) {
      throw new Error('Rule pack exceeds maximum allowed complexity');
    }
    return 0;
  }
  if (depth > MAX_GRAPH_DEPTH) {
    throw new Error('Rule pack nesting depth exceeds maximum allowed limit');
  }
  if (active.has(node)) {
    throw new Error('Rule pack contains circular references');
  }
  const cached = verified.get(node);
  if (cached) {
    if (depth + cached.maxSubDepth > MAX_GRAPH_DEPTH) {
      throw new Error('Rule pack nesting depth exceeds maximum allowed limit');
    }
    state.visited += cached.size;
    state.estChars += cached.estChars;
    if (state.estChars > MAX_GRAPH_EST_CHARS) {
      throw new Error(
        `Rule pack exceeds maximum size of ${MAX_RULE_PACK_BYTES} bytes`
      );
    }
    if (state.visited > MAX_GRAPH_NODES) {
      throw new Error('Rule pack exceeds maximum allowed complexity');
    }
    return cached.maxSubDepth;
  }

  const startVisited = state.visited;
  const startEstChars = state.estChars;
  state.visited += 1;
  if (state.visited > MAX_GRAPH_NODES) {
    throw new Error('Rule pack exceeds maximum allowed complexity');
  }

  active.add(node);
  let maxSubDepth = 0;
  try {
    if (Array.isArray(node)) {
      if (Object.getPrototypeOf(node) !== Array.prototype) {
        throw new Error('Rule pack must contain only plain JSON arrays');
      }
      if (Object.getOwnPropertySymbols(node).length > 0) {
        throw new Error('Rule pack must contain only JSON-compatible values');
      }
      for (let i = 0; i < node.length; i++) {
        const desc = Object.getOwnPropertyDescriptor(node, i);
        if (!desc) {
          throw new Error('Rule pack must not contain sparse arrays');
        }
        if (typeof desc.get === 'function' || typeof desc.set === 'function') {
          throw new Error('Rule pack must contain only JSON-compatible values');
        }
        const childDepth = assertSafeGraph(
          desc.value,
          active,
          verified,
          state,
          depth + 1
        );
        if (childDepth + 1 > maxSubDepth) {
          maxSubDepth = childDepth + 1;
        }
      }
      const ownNames = Object.getOwnPropertyNames(node);
      if (ownNames.length !== node.length + 1) {
        for (let i = 0; i < ownNames.length; i++) {
          const name = ownNames[i]!;
          if (PROTO_POLLUTION_KEYS.has(name)) {
            throw new Error(`Rule pack contains forbidden property "${name}"`);
          }
        }
        throw new Error('Rule pack must contain only JSON-compatible values');
      }
    } else {
      if (!isPlainObject(node)) {
        throw new Error('Rule pack must contain only plain JSON objects');
      }
      if (Object.getOwnPropertySymbols(node).length > 0) {
        throw new Error('Rule pack must contain only JSON-compatible values');
      }
      for (const key of Object.getOwnPropertyNames(node)) {
        if (PROTO_POLLUTION_KEYS.has(key)) {
          throw new Error(`Rule pack contains forbidden property "${key}"`);
        }
        const desc = Object.getOwnPropertyDescriptor(node, key);
        if (
          !desc ||
          typeof desc.get === 'function' ||
          typeof desc.set === 'function'
        ) {
          throw new Error('Rule pack must contain only JSON-compatible values');
        }
        state.estChars += key.length;
        if (state.estChars > MAX_GRAPH_EST_CHARS) {
          throw new Error(
            `Rule pack exceeds maximum size of ${MAX_RULE_PACK_BYTES} bytes`
          );
        }
        const childDepth = assertSafeGraph(
          desc.value,
          active,
          verified,
          state,
          depth + 1
        );
        if (childDepth + 1 > maxSubDepth) {
          maxSubDepth = childDepth + 1;
        }
      }
    }
  } finally {
    active.delete(node);
  }

  verified.set(node, {
    size: state.visited - startVisited,
    maxSubDepth,
    estChars: state.estChars - startEstChars,
  });
  return maxSubDepth;
}

function validateKeywordItem(
  raw: unknown,
  idx: number
): { item: KeywordRuleItem; regexCostWeight: number } {
  if (!isPlainObject(raw)) {
    throw new Error(`keywords[${idx}] must be an object`);
  }
  if (typeof raw.id !== 'string' || !raw.id.trim() || raw.id.trim().length > 200) {
    throw new Error(`keywords[${idx}].id must be a non-empty string (<= 200 chars)`);
  }
  const id = raw.id.trim();

  if (typeof raw.pattern !== 'string') {
    throw new Error(`keywords[${idx}].pattern must be a string`);
  }
  const pattern = raw.pattern.trim();
  if (!pattern || pattern.length > MAX_RULE_PACK_REGEX_LENGTH) {
    throw new Error(
      `keywords[${idx}].pattern must be 1..${MAX_RULE_PACK_REGEX_LENGTH} chars`
    );
  }

  if (typeof raw.isRegex !== 'boolean') {
    throw new Error(`keywords[${idx}].isRegex must be a boolean`);
  }
  let regexCostWeight = 0;
  if (raw.isRegex) {
    try {
      new RegExp(pattern, 'i');
    } catch {
      throw new Error(`keywords[${idx}].pattern is not a valid regular expression`);
    }
    const safety = analyzeRegexSafetyWithCost(pattern);
    if (!safety.safe) {
      throw new Error(
        `keywords[${idx}].pattern is an unsafe regular expression (${safety.reason ?? 'catastrophic backtracking risk'})`
      );
    }
    regexCostWeight = safety.costWeight;
  }

  if (!Array.isArray(raw.scopes) || raw.scopes.length === 0) {
    throw new Error(`keywords[${idx}].scopes must be a non-empty array`);
  }
  const scopesSet = new Set<KeywordMatchScope>();
  for (let i = 0; i < raw.scopes.length; i++) {
    if (!(i in raw.scopes)) {
      throw new Error(`keywords[${idx}].scopes must not contain sparse holes`);
    }
    const scope = raw.scopes[i];
    if (typeof scope !== 'string' || !VALID_SCOPES.has(scope as KeywordMatchScope)) {
      throw new Error(`keywords[${idx}].scopes contains invalid scope`);
    }
    scopesSet.add(scope as KeywordMatchScope);
  }

  if (typeof raw.enabled !== 'boolean') {
    throw new Error(`keywords[${idx}].enabled must be a boolean`);
  }

  const clean: KeywordRuleItem = {
    id,
    pattern,
    isRegex: raw.isRegex,
    scopes: [...scopesSet],
    enabled: raw.enabled,
  };

  if (raw.onlyInReplies !== undefined) {
    if (typeof raw.onlyInReplies !== 'boolean') {
      throw new Error(`keywords[${idx}].onlyInReplies must be a boolean`);
    }
    clean.onlyInReplies = raw.onlyInReplies;
  }

  if (raw.maxFollowersExempt !== undefined) {
    if (
      typeof raw.maxFollowersExempt !== 'number' ||
      !Number.isInteger(raw.maxFollowersExempt) ||
      raw.maxFollowersExempt < 0
    ) {
      throw new Error(
        `keywords[${idx}].maxFollowersExempt must be a non-negative integer`
      );
    }
    clean.maxFollowersExempt = raw.maxFollowersExempt;
  }

  if (raw.note !== undefined) {
    if (typeof raw.note !== 'string' || raw.note.trim().length > 500) {
      throw new Error(`keywords[${idx}].note must be a string (<= 500 chars)`);
    }
    const note = raw.note.trim();
    if (note) clean.note = note;
  }

  if (raw.langGroup !== undefined) {
    if (!isCloudKeywordLangGroup(raw.langGroup)) {
      throw new Error(`keywords[${idx}].langGroup is not a supported language group`);
    }
    clean.langGroup = raw.langGroup;
  }

  if (raw.packCategory !== undefined) {
    if (
      typeof raw.packCategory !== 'string' ||
      raw.packCategory.trim().length > 64
    ) {
      throw new Error(
        `keywords[${idx}].packCategory must be a string (<= 64 chars)`
      );
    }
    const cat = raw.packCategory.trim();
    if (cat) clean.packCategory = cat;
  }

  return { item: clean, regexCostWeight };
}

function validateDomainItem(raw: unknown, idx: number): DomainRuleItem {
  if (!isPlainObject(raw)) {
    throw new Error(`domains[${idx}] must be an object`);
  }
  if (typeof raw.id !== 'string' || !raw.id.trim() || raw.id.trim().length > 200) {
    throw new Error(`domains[${idx}].id must be a non-empty string (<= 200 chars)`);
  }
  const id = raw.id.trim();

  if (typeof raw.domain !== 'string') {
    throw new Error(`domains[${idx}].domain must be a string`);
  }
  const normalizedDomain = normalizeDomainRule(raw.domain);
  if (!isValidDomainRule(normalizedDomain)) {
    throw new Error(`domains[${idx}].domain "${raw.domain}" is not a valid domain`);
  }

  if (typeof raw.enabled !== 'boolean') {
    throw new Error(`domains[${idx}].enabled must be a boolean`);
  }

  const clean: DomainRuleItem = {
    id,
    domain: normalizedDomain,
    enabled: raw.enabled,
  };

  if (raw.onlyInReplies !== undefined) {
    if (typeof raw.onlyInReplies !== 'boolean') {
      throw new Error(`domains[${idx}].onlyInReplies must be a boolean`);
    }
    clean.onlyInReplies = raw.onlyInReplies;
  }

  if (raw.maxFollowersExempt !== undefined) {
    if (
      typeof raw.maxFollowersExempt !== 'number' ||
      !Number.isInteger(raw.maxFollowersExempt) ||
      raw.maxFollowersExempt < 0
    ) {
      throw new Error(
        `domains[${idx}].maxFollowersExempt must be a non-negative integer`
      );
    }
    clean.maxFollowersExempt = raw.maxFollowersExempt;
  }

  if (raw.note !== undefined) {
    if (typeof raw.note !== 'string' || raw.note.trim().length > 500) {
      throw new Error(`domains[${idx}].note must be a string (<= 500 chars)`);
    }
    const note = raw.note.trim();
    if (note) clean.note = note;
  }

  return clean;
}

function validateBlockedUidItem(raw: unknown, idx: number): AccountListEntry {
  if (!isPlainObject(raw)) {
    throw new Error(`blockedUids[${idx}] must be an object`);
  }
  if (typeof raw.uid !== 'string' || !NUMERIC_UID_RE.test(raw.uid.trim())) {
    throw new Error(`blockedUids[${idx}].uid must be a numeric X rest_id`);
  }
  const uid = raw.uid.trim();

  if (typeof raw.screenName !== 'string' || raw.screenName.trim().length > 100) {
    throw new Error(
      `blockedUids[${idx}].screenName must be a string (<= 100 chars)`
    );
  }
  const screenName = raw.screenName.trim();

  if (
    typeof raw.addedAt !== 'number' ||
    !Number.isFinite(raw.addedAt) ||
    raw.addedAt < 0
  ) {
    throw new Error(`blockedUids[${idx}].addedAt must be a non-negative number`);
  }

  const clean: AccountListEntry = {
    uid,
    screenName,
    addedAt: raw.addedAt,
  };

  if (raw.name !== undefined) {
    if (typeof raw.name !== 'string' || raw.name.trim().length > 200) {
      throw new Error(`blockedUids[${idx}].name must be a string (<= 200 chars)`);
    }
    const name = raw.name.trim();
    if (name) clean.name = name;
  }

  if (raw.reason !== undefined) {
    if (typeof raw.reason !== 'string' || raw.reason.trim().length > 500) {
      throw new Error(
        `blockedUids[${idx}].reason must be a string (<= 500 chars)`
      );
    }
    const reason = raw.reason.trim();
    if (reason) clean.reason = reason;
  }

  if (raw.tag !== undefined) {
    if (typeof raw.tag !== 'string' || !VALID_TAGS.has(raw.tag as BlockReasonTag)) {
      throw new Error(`blockedUids[${idx}].tag is not a valid BlockReasonTag`);
    }
    clean.tag = raw.tag as BlockReasonTag;
  }

  if (raw.avatarUrl !== undefined) {
    if (typeof raw.avatarUrl !== 'string' || raw.avatarUrl.trim().length > 2048) {
      throw new Error(
        `blockedUids[${idx}].avatarUrl must be a string (<= 2048 chars)`
      );
    }
    if (hasAsciiControlChars(raw.avatarUrl)) {
      throw new Error(
        `blockedUids[${idx}].avatarUrl must not contain control characters`
      );
    }
    const avatarUrl = raw.avatarUrl.trim();
    if (avatarUrl) {
      if (!avatarUrl.startsWith('https://')) {
        throw new Error(`blockedUids[${idx}].avatarUrl must use https://`);
      }
      try {
        const parsed = new URL(avatarUrl);
        if (parsed.protocol !== 'https:') {
          throw new Error('non-https');
        }
      } catch {
        throw new Error(`blockedUids[${idx}].avatarUrl must be a valid https:// URL`);
      }
      clean.avatarUrl = avatarUrl;
    }
  }

  return clean;
}

/**
 * Strictly validates an offline shareable rule pack (`kxc-pack-v1`) from either a JSON string or plain object.
 * Rejects prototype-pollution keys, sensitive config keys, invalid or ReDoS-unsafe regexes, invalid domains/UIDs, and size/count caps.
 */
export function validateRulePack(input: unknown): RulePackPayload {
  let parsed: unknown = input;

  if (typeof input === 'string') {
    if (utf8ByteLength(input) > MAX_RULE_PACK_BYTES) {
      throw new Error(
        `Rule pack exceeds maximum size of ${MAX_RULE_PACK_BYTES} bytes`
      );
    }
    try {
      parsed = JSON.parse(input);
    } catch {
      throw new Error('Rule pack is not valid JSON');
    }
  }

  if (!isPlainObject(parsed)) {
    throw new Error('Rule pack must be a plain JSON object');
  }

  assertSafeGraph(parsed);

  for (const key of Object.getOwnPropertyNames(parsed)) {
    if (FORBIDDEN_PACK_KEYS.has(key)) {
      throw new Error(`Rule pack contains forbidden config field "${key}"`);
    }
  }

  if (parsed.keywords !== undefined) {
    if (!Array.isArray(parsed.keywords)) {
      throw new Error('Rule pack keywords must be an array');
    }
    if (parsed.keywords.length > MAX_RULE_PACK_KEYWORDS) {
      throw new Error(
        `Rule pack keywords exceed maximum count of ${MAX_RULE_PACK_KEYWORDS}`
      );
    }
  }

  if (parsed.domains !== undefined) {
    if (!Array.isArray(parsed.domains)) {
      throw new Error('Rule pack domains must be an array');
    }
    if (parsed.domains.length > MAX_RULE_PACK_DOMAINS) {
      throw new Error(
        `Rule pack domains exceed maximum count of ${MAX_RULE_PACK_DOMAINS}`
      );
    }
  }

  if (parsed.blockedUids !== undefined) {
    if (!Array.isArray(parsed.blockedUids)) {
      throw new Error('Rule pack blockedUids must be an array');
    }
    if (parsed.blockedUids.length > MAX_RULE_PACK_BLOCKED_UIDS) {
      throw new Error(
        `Rule pack blockedUids exceed maximum count of ${MAX_RULE_PACK_BLOCKED_UIDS}`
      );
    }
  }

  if (typeof input !== 'string') {
    const serialized = JSON.stringify(parsed);
    if (utf8ByteLength(serialized) > MAX_RULE_PACK_BYTES) {
      throw new Error(
        `Rule pack exceeds maximum size of ${MAX_RULE_PACK_BYTES} bytes`
      );
    }
  }

  if (parsed.format !== RULE_PACK_FORMAT) {
    throw new Error(`Unsupported rule pack format: expected "${RULE_PACK_FORMAT}"`);
  }

  if (typeof parsed.id !== 'string') {
    throw new Error(
      'Rule pack id must be 1..100 ASCII alphanumeric/._- characters'
    );
  }
  const id = parsed.id.trim();
  if (
    !PACK_ID_RE.test(id) ||
    PROTO_POLLUTION_KEYS.has(id) ||
    id in Object.prototype
  ) {
    throw new Error(
      'Rule pack id must be 1..100 ASCII alphanumeric/._- characters'
    );
  }

  if (
    typeof parsed.name !== 'string' ||
    !parsed.name.trim() ||
    parsed.name.trim().length > 120
  ) {
    throw new Error('Rule pack name must be a non-empty string (<= 120 chars)');
  }
  const name = parsed.name.trim();

  if (typeof parsed.description !== 'string' || parsed.description.trim().length > 500) {
    throw new Error('Rule pack description must be a string (<= 500 chars)');
  }
  const description = parsed.description.trim();

  let author: string | undefined;
  if (parsed.author !== undefined) {
    if (typeof parsed.author !== 'string' || parsed.author.trim().length > 100) {
      throw new Error('Rule pack author must be a string (<= 100 chars)');
    }
    const trimmedAuthor = parsed.author.trim();
    if (trimmedAuthor) author = trimmedAuthor;
  }

  if (
    typeof parsed.version !== 'string' ||
    !parsed.version.trim() ||
    parsed.version.trim().length > 40
  ) {
    throw new Error('Rule pack version must be a non-empty string (<= 40 chars)');
  }
  const version = parsed.version.trim();

  let locale: RulePackPayload['locale'];
  if (parsed.locale !== undefined) {
    if (parsed.locale !== 'universal' && !isSupportedLocale(parsed.locale)) {
      throw new Error('Rule pack locale must be "universal" or a supported locale');
    }
    locale = parsed.locale;
  }

  if (typeof parsed.updatedAt !== 'string') {
    throw new Error('Rule pack updatedAt must be a valid ISO date string');
  }
  const updatedAt = parsed.updatedAt.trim();
  const dateMatch = ISO_DATE_RE.exec(updatedAt);
  if (!updatedAt || !dateMatch || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error('Rule pack updatedAt must be a valid ISO date string');
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const checkDate = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() + 1 !== month ||
    checkDate.getUTCDate() !== day
  ) {
    throw new Error('Rule pack "updatedAt" must be a valid ISO calendar date');
  }
  if (dateMatch[4] !== undefined) {
    const hour = Number(dateMatch[4]);
    const minute = Number(dateMatch[5]);
    const second = dateMatch[6] !== undefined ? Number(dateMatch[6]) : 0;
    if (hour > 23 || minute > 59 || second > 59) {
      throw new Error('Rule pack "updatedAt" must contain a valid ISO time');
    }
  }
  if (dateMatch[7] !== undefined) {
    const tzHour = Number(dateMatch[8]);
    const tzMinute = Number(dateMatch[9]);
    if (tzHour > 23 || tzMinute > 59) {
      throw new Error(
        'Rule pack "updatedAt" must contain a valid ISO timezone offset'
      );
    }
  }

  const clean: RulePackPayload = {
    format: RULE_PACK_FORMAT,
    id,
    name,
    description,
    version,
    updatedAt,
  };

  if (author !== undefined) clean.author = author;
  if (locale !== undefined) clean.locale = locale;

  const seenItemIds = new Set<string>();

  if (Array.isArray(parsed.keywords)) {
    const cleanKeywords: KeywordRuleItem[] = [];
    let totalRegexCostWeight = 0;
    for (let idx = 0; idx < parsed.keywords.length; idx++) {
      if (idx >= MAX_RULE_PACK_KEYWORDS) {
        throw new Error(
          `Rule pack keywords exceed maximum count of ${MAX_RULE_PACK_KEYWORDS}`
        );
      }
      if (!(idx in parsed.keywords)) {
        throw new Error(`keywords[${idx}] must not be empty`);
      }
      const { item: validated, regexCostWeight } = validateKeywordItem(
        parsed.keywords[idx],
        idx
      );
      if (seenItemIds.has(validated.id)) {
        throw new Error(`Rule pack contains duplicate item id "${validated.id}"`);
      }
      seenItemIds.add(validated.id);
      totalRegexCostWeight += regexCostWeight;
      if (totalRegexCostWeight > MAX_RULE_PACK_REGEX_COST_BUDGET) {
        throw new Error(
          'Rule pack exceeds safe aggregate regular expression complexity budget'
        );
      }
      cleanKeywords.push(validated);
    }
    if (cleanKeywords.length > MAX_RULE_PACK_KEYWORDS) {
      throw new Error(
        `Rule pack keywords exceed maximum count of ${MAX_RULE_PACK_KEYWORDS}`
      );
    }
    clean.keywords = cleanKeywords;
  }

  if (Array.isArray(parsed.domains)) {
    const cleanDomains: DomainRuleItem[] = [];
    for (let idx = 0; idx < parsed.domains.length; idx++) {
      if (idx >= MAX_RULE_PACK_DOMAINS) {
        throw new Error(
          `Rule pack domains exceed maximum count of ${MAX_RULE_PACK_DOMAINS}`
        );
      }
      if (!(idx in parsed.domains)) {
        throw new Error(`domains[${idx}] must not be empty`);
      }
      const validated = validateDomainItem(parsed.domains[idx], idx);
      if (seenItemIds.has(validated.id)) {
        throw new Error(`Rule pack contains duplicate item id "${validated.id}"`);
      }
      seenItemIds.add(validated.id);
      cleanDomains.push(validated);
    }
    if (cleanDomains.length > MAX_RULE_PACK_DOMAINS) {
      throw new Error(
        `Rule pack domains exceed maximum count of ${MAX_RULE_PACK_DOMAINS}`
      );
    }
    clean.domains = cleanDomains;
  }

  if (Array.isArray(parsed.blockedUids)) {
    const cleanBlockedUids: AccountListEntry[] = [];
    for (let idx = 0; idx < parsed.blockedUids.length; idx++) {
      if (idx >= MAX_RULE_PACK_BLOCKED_UIDS) {
        throw new Error(
          `Rule pack blockedUids exceed maximum count of ${MAX_RULE_PACK_BLOCKED_UIDS}`
        );
      }
      if (!(idx in parsed.blockedUids)) {
        throw new Error(`blockedUids[${idx}] must not be empty`);
      }
      const validated = validateBlockedUidItem(parsed.blockedUids[idx], idx);
      if (seenItemIds.has(validated.uid)) {
        throw new Error(
          `Rule pack contains duplicate blockedUids uid "${validated.uid}"`
        );
      }
      seenItemIds.add(validated.uid);
      cleanBlockedUids.push(validated);
    }
    if (cleanBlockedUids.length > MAX_RULE_PACK_BLOCKED_UIDS) {
      throw new Error(
        `Rule pack blockedUids exceed maximum count of ${MAX_RULE_PACK_BLOCKED_UIDS}`
      );
    }
    clean.blockedUids = cleanBlockedUids;
  }

  if (utf8ByteLength(JSON.stringify(clean)) > MAX_RULE_PACK_BYTES) {
    throw new Error(
      `Rule pack exceeds maximum size of ${MAX_RULE_PACK_BYTES} bytes`
    );
  }

  return clean;
}

/**
 * Strips local installation metadata (`enabled`, `installedAt`, `disabledItemIds`), validates against `kxc-pack-v1`,
 * and returns deterministic formatted JSON suitable for `.kxc-pack.json` export or clipboard sharing.
 */
export function serializeRulePack(pack: RulePackPayload): string {
  if (!isPlainObject(pack)) {
    throw new Error('Rule pack must be a plain object');
  }
  const raw = pack as unknown as Record<string, unknown>;
  if (Object.getOwnPropertySymbols(raw).length > 0) {
    throw new Error('Rule pack must contain only JSON-compatible values');
  }
  for (const key of Object.getOwnPropertyNames(raw)) {
    if (key !== 'enabled' && FORBIDDEN_PACK_KEYS.has(key)) {
      throw new Error(`Rule pack contains forbidden config field "${key}"`);
    }
    const desc = Object.getOwnPropertyDescriptor(raw, key);
    if (
      !desc ||
      typeof desc.get === 'function' ||
      typeof desc.set === 'function' ||
      typeof desc.value === 'function' ||
      typeof desc.value === 'symbol' ||
      typeof desc.value === 'bigint'
    ) {
      throw new Error('Rule pack must contain only JSON-compatible values');
    }
  }
  const candidate: Record<string, unknown> = {
    format: pack.format,
    id: pack.id,
    name: pack.name,
    description: pack.description,
    version: pack.version,
    updatedAt: pack.updatedAt,
  };
  if (pack.author !== undefined) candidate.author = pack.author;
  if (pack.locale !== undefined) candidate.locale = pack.locale;
  if (pack.keywords !== undefined) candidate.keywords = pack.keywords;
  if (pack.domains !== undefined) candidate.domains = pack.domains;
  if (pack.blockedUids !== undefined) candidate.blockedUids = pack.blockedUids;

  const validated = validateRulePack(candidate);
  const pretty = JSON.stringify(validated, null, 2);
  if (utf8ByteLength(pretty) <= MAX_RULE_PACK_BYTES) {
    return pretty;
  }
  const compact = JSON.stringify(validated);
  if (utf8ByteLength(compact) > MAX_RULE_PACK_BYTES) {
    throw new Error(
      `Rule pack exceeds maximum size of ${MAX_RULE_PACK_BYTES} bytes`
    );
  }
  return compact;
}
