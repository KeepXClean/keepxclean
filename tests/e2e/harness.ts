/**
 * KeepXClean E2E Test Harness & Assertion Engine
 *
 * Provides a lightweight, deterministic, zero-dependency testing DSL:
 * - describe, it / test, beforeAll, afterAll, beforeEach, afterEach
 * - expect() with sync & async deep matchers (.not, .resolves, .rejects)
 * - Deterministic suite registration and execution engine
 */

export interface TestDef {
  name: string;
  fn: () => void | Promise<void>;
  timeoutMs?: number;
  skip?: boolean;
}

export interface SuiteDef {
  name: string;
  tier?: number;
  beforeAllFns: Array<() => void | Promise<void>>;
  afterAllFns: Array<() => void | Promise<void>>;
  beforeEachFns: Array<() => void | Promise<void>>;
  afterEachFns: Array<() => void | Promise<void>>;
  tests: TestDef[];
}

export interface TestResultItem {
  suite: string;
  tier?: number;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  stack?: string;
}

export interface SuiteResultItem {
  name: string;
  tier?: number;
  tests: TestResultItem[];
  passed: number;
  failed: number;
  durationMs: number;
}

export interface RunResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  suites: SuiteResultItem[];
  failures: TestResultItem[];
}

// Global registry
const suites: SuiteDef[] = [];
let currentSuite: SuiteDef | null = null;
let currentTier: number = 1;

export function setTestTier(tier: number): void {
  currentTier = tier;
}

export function getTestTier(): number {
  return currentTier;
}

export function describe(name: string, fn: () => void | Promise<void>): void {
  const suite: SuiteDef = {
    name,
    tier: currentTier,
    beforeAllFns: [],
    afterAllFns: [],
    beforeEachFns: [],
    afterEachFns: [],
    tests: [],
  };

  const prevSuite = currentSuite;
  currentSuite = suite;

  const startIndex = suites.length;
  suites.push(suite);

  try {
    fn();
  } finally {
    currentSuite = prevSuite;
    // If this suite only served as a container for child suites:
    if (suite.tests.length === 0 && suites.length > startIndex + 1) {
      const childSuites = suites.slice(startIndex + 1);
      for (const child of childSuites) {
        child.beforeAllFns = [...suite.beforeAllFns, ...child.beforeAllFns];
        child.afterAllFns = [...child.afterAllFns, ...suite.afterAllFns];
        child.beforeEachFns = [...suite.beforeEachFns, ...child.beforeEachFns];
        child.afterEachFns = [...child.afterEachFns, ...suite.afterEachFns];
      }
      suites.splice(startIndex, 1);
    }
  }
}

export function it(name: string, fn: () => void | Promise<void>, options?: { timeout?: number }): void {
  if (!currentSuite) {
    // If it() is called outside describe, create an anonymous default suite
    describe('Default Suite', () => {
      it(name, fn, options);
    });
    return;
  }
  currentSuite.tests.push({
    name,
    fn,
    timeoutMs: options?.timeout ?? 5000,
  });
}

it.skip = function (name: string, fn: () => void | Promise<void>, options?: { timeout?: number }): void {
  if (!currentSuite) {
    describe('Default Suite', () => {
      it.skip(name, fn, options);
    });
    return;
  }
  currentSuite.tests.push({
    name,
    fn,
    timeoutMs: options?.timeout ?? 5000,
    skip: true,
  });
};

export const test = it;

export function beforeAll(fn: () => void | Promise<void>): void {
  if (currentSuite) currentSuite.beforeAllFns.push(fn);
}

export function afterAll(fn: () => void | Promise<void>): void {
  if (currentSuite) currentSuite.afterAllFns.push(fn);
}

export function beforeEach(fn: () => void | Promise<void>): void {
  if (currentSuite) currentSuite.beforeEachFns.push(fn);
}

export function afterEach(fn: () => void | Promise<void>): void {
  if (currentSuite) currentSuite.afterEachFns.push(fn);
}

export function clearSuites(): void {
  suites.length = 0;
  currentSuite = null;
}

export function getRegisteredSuites(): SuiteDef[] {
  return suites;
}

// Deep equality helper
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || typeof a !== 'object' || b === null || typeof b !== 'object') {
    return false;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.toString() === b.toString();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const val of a) {
      if (!b.has(val)) return false;
    }
    return true;
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, val] of a) {
      if (!b.has(key) || !deepEqual(val, b.get(key))) return false;
    }
    return true;
  }

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }

  return true;
}

// Subset matching helper
export function matchesSubset(actual: unknown, subset: unknown): boolean {
  if (actual === subset) return true;
  if (subset === null || typeof subset !== 'object') {
    return deepEqual(actual, subset);
  }
  if (actual === null || typeof actual !== 'object') return false;

  if (Array.isArray(subset)) {
    if (!Array.isArray(actual)) return false;
    if (subset.length > actual.length) return false;
    for (let i = 0; i < subset.length; i++) {
      if (!matchesSubset(actual[i], subset[i])) return false;
    }
    return true;
  }

  for (const key of Object.keys(subset as object)) {
    if (!Object.prototype.hasOwnProperty.call(actual, key)) return false;
    if (!matchesSubset((actual as Record<string, unknown>)[key], (subset as Record<string, unknown>)[key])) {
      return false;
    }
  }

  return true;
}

export class AssertionError extends Error {
  constructor(message: string, public expected?: unknown, public received?: unknown) {
    super(message);
    this.name = 'AssertionError';
  }
}

export interface Matchers<T> {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toStrictEqual(expected: unknown): void;
  toMatchObject(expectedSubset: Record<string, unknown> | Array<unknown>): void;
  toMatch(pattern: RegExp | string): void;
  toContain(itemOrSubstring: unknown): void;
  toHaveLength(expectedLength: number): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toBeDefined(): void;
  toBeNaN(): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThan(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  toBeCloseTo(expected: number, precision?: number): void;
  toThrow(expectedError?: string | RegExp | ErrorConstructor): void;
  not: Matchers<T>;
}

export interface AsyncMatchers<T> {
  resolves: Matchers<T>;
  rejects: Matchers<unknown>;
}

function createMatchers<T>(actual: T, isNot = false): Matchers<T> {
  const assert = (condition: boolean, failMsg: () => string, expectedVal?: unknown) => {
    const passed = isNot ? !condition : condition;
    if (!passed) {
      throw new AssertionError(failMsg(), expectedVal, actual);
    }
  };

  const matchers: Matchers<T> = {
    toBe(expected: unknown) {
      assert(
        Object.is(actual, expected),
        () => `Expected ${isNot ? 'not ' : ''}${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
        expected
      );
    },
    toEqual(expected: unknown) {
      assert(
        deepEqual(actual, expected),
        () => `Expected ${isNot ? 'not to deeply equal' : 'to deeply equal'}:\n  ${JSON.stringify(expected, null, 2)}\nReceived:\n  ${JSON.stringify(actual, null, 2)}`,
        expected
      );
    },
    toStrictEqual(expected: unknown) {
      this.toEqual(expected);
    },
    toMatchObject(expectedSubset: Record<string, unknown> | Array<unknown>) {
      assert(
        matchesSubset(actual, expectedSubset),
        () => `Expected object ${isNot ? 'not ' : ''}to match subset:\n  ${JSON.stringify(expectedSubset, null, 2)}\nActual:\n  ${JSON.stringify(actual, null, 2)}`,
        expectedSubset
      );
    },
    toMatch(pattern: RegExp | string) {
      const reg = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
      const str = String(actual);
      assert(
        reg.test(str),
        () => `Expected ${isNot ? 'not ' : ''}to match pattern ${pattern}, received "${str}"`,
        pattern
      );
    },
    toContain(itemOrSubstring: unknown) {
      let contains = false;
      if (typeof actual === 'string') {
        contains = actual.includes(String(itemOrSubstring));
      } else if (Array.isArray(actual)) {
        contains = actual.some((item) => deepEqual(item, itemOrSubstring) || item === itemOrSubstring);
      } else if (actual instanceof Set) {
        contains = actual.has(itemOrSubstring);
      } else if (actual && typeof actual === 'object') {
        contains = Object.prototype.hasOwnProperty.call(actual, itemOrSubstring as string);
      }
      assert(
        contains,
        () => `Expected collection ${isNot ? 'not ' : ''}to contain ${JSON.stringify(itemOrSubstring)}`,
        itemOrSubstring
      );
    },
    toHaveLength(expectedLength: number) {
      const len = (actual as { length?: number })?.length ?? (actual as { size?: number })?.size;
      assert(
        len === expectedLength,
        () => `Expected length ${isNot ? 'not ' : ''}to be ${expectedLength}, received ${len}`,
        expectedLength
      );
    },
    toBeTruthy() {
      assert(
        Boolean(actual),
        () => `Expected ${isNot ? 'not ' : ''}truthy, received ${String(actual)}`
      );
    },
    toBeFalsy() {
      assert(
        !actual,
        () => `Expected ${isNot ? 'not ' : ''}falsy, received ${String(actual)}`
      );
    },
    toBeNull() {
      assert(
        actual === null,
        () => `Expected ${isNot ? 'not ' : ''}null, received ${String(actual)}`
      );
    },
    toBeUndefined() {
      assert(
        actual === undefined,
        () => `Expected ${isNot ? 'not ' : ''}undefined, received ${String(actual)}`
      );
    },
    toBeDefined() {
      assert(
        actual !== undefined,
        () => `Expected ${isNot ? 'undefined' : 'defined'}, received ${String(actual)}`
      );
    },
    toBeNaN() {
      assert(
        Number.isNaN(actual),
        () => `Expected ${isNot ? 'not ' : ''}NaN, received ${String(actual)}`
      );
    },
    toBeGreaterThan(expected: number) {
      assert(
        typeof actual === 'number' && actual > expected,
        () => `Expected ${actual} ${isNot ? 'not ' : ''}> ${expected}`,
        expected
      );
    },
    toBeGreaterThanOrEqual(expected: number) {
      assert(
        typeof actual === 'number' && actual >= expected,
        () => `Expected ${actual} ${isNot ? 'not ' : ''}>= ${expected}`,
        expected
      );
    },
    toBeLessThan(expected: number) {
      assert(
        typeof actual === 'number' && actual < expected,
        () => `Expected ${actual} ${isNot ? 'not ' : ''}< ${expected}`,
        expected
      );
    },
    toBeLessThanOrEqual(expected: number) {
      assert(
        typeof actual === 'number' && actual <= expected,
        () => `Expected ${actual} ${isNot ? 'not ' : ''}<= ${expected}`,
        expected
      );
    },
    toBeCloseTo(expected: number, precision = 2) {
      const diff = Math.abs((actual as number) - expected);
      const tolerance = Math.pow(10, -precision) / 2;
      assert(
        diff < tolerance,
        () => `Expected ${actual} ${isNot ? 'not ' : ''}to be close to ${expected} (within ${tolerance})`,
        expected
      );
    },
    toThrow(expectedError?: string | RegExp | ErrorConstructor) {
      if (typeof actual !== 'function') {
        throw new AssertionError(`Expected a function to throw, but received ${typeof actual}`);
      }
      let threw = false;
      let thrownError: unknown;
      try {
        (actual as () => void)();
      } catch (err) {
        threw = true;
        thrownError = err;
      }

      if (!isNot) {
        if (!threw) {
          throw new AssertionError('Expected function to throw, but it did not throw.');
        }
        if (expectedError) {
          if (typeof expectedError === 'string') {
            const msg = (thrownError as Error)?.message || String(thrownError);
            if (!msg.includes(expectedError)) {
              throw new AssertionError(`Expected error message to include "${expectedError}", received "${msg}"`);
            }
          } else if (expectedError instanceof RegExp) {
            const msg = (thrownError as Error)?.message || String(thrownError);
            if (!expectedError.test(msg)) {
              throw new AssertionError(`Expected error message to match ${expectedError}, received "${msg}"`);
            }
          } else if (typeof expectedError === 'function') {
            if (!(thrownError instanceof expectedError)) {
              throw new AssertionError(`Expected error to be instance of ${(expectedError as { name: string }).name}`);
            }
          }
        }
      } else {
        if (threw) {
          throw new AssertionError(`Expected function not to throw, but it threw: ${(thrownError as Error)?.message}`);
        }
      }
    },
    get not() {
      return createMatchers(actual, !isNot);
    },
  };

  return matchers;
}

export function expect<T>(actual: T): Matchers<T> & AsyncMatchers<T> {
  const syncMatchers = createMatchers(actual);

  Object.defineProperty(syncMatchers, 'resolves', {
    get() {
      if (!(actual instanceof Promise)) {
        throw new AssertionError('Expected actual to be a Promise');
      }
      return {
        ...syncMatchers,
        toBe: async (expected: unknown) => {
          const res = await actual;
          createMatchers(res).toBe(expected);
        },
        toEqual: async (expected: unknown) => {
          const res = await actual;
          createMatchers(res).toEqual(expected);
        },
        toStrictEqual: async (expected: unknown) => {
          const res = await actual;
          createMatchers(res).toStrictEqual(expected);
        },
        toMatchObject: async (expected: Record<string, unknown> | Array<unknown>) => {
          const res = await actual;
          createMatchers(res).toMatchObject(expected);
        },
        toBeTruthy: async () => {
          const res = await actual;
          createMatchers(res).toBeTruthy();
        },
        toBeFalsy: async () => {
          const res = await actual;
          createMatchers(res).toBeFalsy();
        },
      };
    },
    configurable: true,
  });

  Object.defineProperty(syncMatchers, 'rejects', {
    get() {
      if (!(actual instanceof Promise)) {
        throw new AssertionError('Expected actual to be a Promise');
      }
      return {
        ...syncMatchers,
        toThrow: async (expectedError?: string | RegExp | ErrorConstructor) => {
          let threw = false;
          let thrownError: unknown;
          try {
            await actual;
          } catch (err) {
            threw = true;
            thrownError = err;
          }
          if (!threw) {
            throw new AssertionError('Expected Promise to reject, but it resolved.');
          }
          if (expectedError) {
            const msg = (thrownError as Error)?.message || String(thrownError);
            if (typeof expectedError === 'string' && !msg.includes(expectedError)) {
              throw new AssertionError(`Expected rejected error to include "${expectedError}", got "${msg}"`);
            } else if (expectedError instanceof RegExp && !expectedError.test(msg)) {
              throw new AssertionError(`Expected rejected error to match ${expectedError}, got "${msg}"`);
            }
          }
        },
      };
    },
    configurable: true,
  });

  return syncMatchers as Matchers<T> & AsyncMatchers<T>;
}

export async function runAll(options?: {
  tier?: number;
  filter?: RegExp;
  bail?: boolean;
  onTestComplete?: (item: TestResultItem) => void;
}): Promise<RunResults> {
  const startTime = Date.now();
  const suiteResults: SuiteResultItem[] = [];
  const failures: TestResultItem[] = [];
  let totalCount = 0;
  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const suite of suites) {
    if (options?.tier && suite.tier !== options.tier) {
      continue;
    }

    const suiteStartTime = Date.now();
    const suiteResult: SuiteResultItem = {
      name: suite.name,
      tier: suite.tier,
      tests: [],
      passed: 0,
      failed: 0,
      durationMs: 0,
    };

    // Run beforeAll
    for (const bAll of suite.beforeAllFns) {
      await bAll();
    }

    for (const testDef of suite.tests) {
      if (options?.filter && !options.filter.test(testDef.name) && !options.filter.test(suite.name)) {
        skipCount++;
        continue;
      }

      totalCount++;
      const testStart = Date.now();
      let testPassed = false;
      let testError: string | undefined;
      let testStack: string | undefined;

      try {
        // Run beforeEach
        for (const bEach of suite.beforeEachFns) {
          await bEach();
        }

        // Run test with timeout
        await Promise.race([
          Promise.resolve(testDef.fn()),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`Test timed out after ${testDef.timeoutMs}ms`)),
              testDef.timeoutMs ?? 5000
            )
          ),
        ]);

        testPassed = true;
        passCount++;
        suiteResult.passed++;

        // Run afterEach
        for (const aEach of suite.afterEachFns) {
          await aEach();
        }
      } catch (err: unknown) {
        testPassed = false;
        failCount++;
        suiteResult.failed++;
        testError = (err as Error)?.message || String(err);
        testStack = (err as Error)?.stack;

        // Still run afterEach on failure
        for (const aEach of suite.afterEachFns) {
          try {
            await aEach();
          } catch {
            // ignore cleanup errors
          }
        }
      }

      const durationMs = Date.now() - testStart;
      const testItem: TestResultItem = {
        suite: suite.name,
        tier: suite.tier,
        name: testDef.name,
        passed: testPassed,
        durationMs,
        error: testError,
        stack: testStack,
      };

      suiteResult.tests.push(testItem);
      if (!testPassed) {
        failures.push(testItem);
      }

      options?.onTestComplete?.(testItem);

      if (!testPassed && options?.bail) {
        break;
      }
    }

    // Run afterAll
    for (const aAll of suite.afterAllFns) {
      try {
        await aAll();
      } catch {
        // ignore afterAll errors
      }
    }

    suiteResult.durationMs = Date.now() - suiteStartTime;
    suiteResults.push(suiteResult);

    if (failures.length > 0 && options?.bail) {
      break;
    }
  }

  return {
    total: totalCount,
    passed: passCount,
    failed: failCount,
    skipped: skipCount,
    durationMs: Date.now() - startTime,
    suites: suiteResults,
    failures,
  };
}
