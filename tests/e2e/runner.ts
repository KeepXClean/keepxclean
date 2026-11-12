#!/usr/bin/env tsx
/**
 * KeepXClean E2E Test Suite Runner
 *
 * CLI executable with:
 * - Deterministic tier sequencing (Tier 1 -> Tier 2 -> Tier 3 -> Tier 4)
 * - ANSI color summary table & tier breakdown
 * - Execution duration metrics
 * - JSON artifact export (tests/e2e/reports/e2e-summary.json)
 * - Exit code 0 on pass / Exit code 1 on fail
 */

import * as fs from 'fs';
import * as path from 'path';
import { runAll, getRegisteredSuites, TestResultItem, RunResults } from './harness';
import { FetchMock } from './fixtures/browser-env';

const ROOT_DIR = path.resolve(__dirname, '../../');
const globalFetchMock = new FetchMock();

// ANSI escape sequences
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
};

interface RunnerArgs {
  tier?: number;
  filter?: RegExp;
  bail: boolean;
  verbose: boolean;
  jsonPath: string;
}

function parseArgs(): RunnerArgs {
  const args = process.argv.slice(2);
  const result: RunnerArgs = {
    bail: false,
    verbose: false,
    jsonPath: path.resolve(__dirname, 'reports/e2e-summary.json'),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--tier' && args[i + 1]) {
      result.tier = parseInt(args[++i], 10);
    } else if (arg.startsWith('--tier=')) {
      result.tier = parseInt(arg.slice(7), 10);
    } else if (arg === '--filter' && args[i + 1]) {
      result.filter = new RegExp(args[++i], 'i');
    } else if (arg.startsWith('--filter=')) {
      result.filter = new RegExp(arg.slice(9), 'i');
    } else if (arg === '--bail') {
      result.bail = true;
    } else if (arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--json') {
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        result.jsonPath = path.resolve(process.cwd(), args[++i]);
      }
    } else if (arg.startsWith('--json=')) {
      result.jsonPath = path.resolve(process.cwd(), arg.slice(7));
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();
  globalFetchMock.install();

  console.log(`\n${ANSI.bold}${ANSI.cyan}================================================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}${ANSI.cyan}                   KeepXClean E2E Test Suite Runner                     ${ANSI.reset}`);
  console.log(`${ANSI.bold}${ANSI.cyan}================================================================================${ANSI.reset}`);
  console.log(`${ANSI.gray}Node: ${process.version} | Runner: tsx + in-memory Virtual DOM | Target Tiers: 1 - 5${ANSI.reset}\n`);

  // Dynamically import test suites
  console.log(`${ANSI.gray}Loading test tiers...${ANSI.reset}`);
  const startTime = Date.now();

  if (!args.tier || args.tier === 1) {
    await import('./tier1_features.test');
  }
  if (!args.tier || args.tier === 2) {
    await import('./tier2_boundaries.test');
  }
  if (!args.tier || args.tier === 3) {
    await import('./tier3_pairwise.test');
  }
  if (!args.tier || args.tier === 4) {
    await import('./tier4_workloads.test');
  }
  if (!args.tier || args.tier === 5) {
    await import('./tier5_adversarial.test');
  }

  const registered = getRegisteredSuites();
  let totalTestsInSuites = 0;
  for (const s of registered) {
    totalTestsInSuites += s.tests.length;
  }
  console.log(`${ANSI.gray}Registered ${registered.length} suites (${totalTestsInSuites} total test cases)${ANSI.reset}\n`);

  let currentTierPrinting: number | undefined = undefined;

  const results: RunResults = await runAll({
    tier: args.tier,
    filter: args.filter,
    bail: args.bail,
    onTestComplete: (item: TestResultItem) => {
      if (item.tier !== currentTierPrinting) {
        currentTierPrinting = item.tier;
        const tierName =
          currentTierPrinting === 1
            ? 'Tier 1: Feature Coverage (Features 1 – 34)'
            : currentTierPrinting === 2
            ? 'Tier 2: Boundary & Corner Cases (Features 1 – 34)'
            : currentTierPrinting === 3
            ? 'Tier 3: Pairwise Combinations (35 Tests)'
            : currentTierPrinting === 4
            ? 'Tier 4: Real-World Workloads (18 Journeys)'
            : 'Tier 5: Adversarial Hardening (30 Tests)';
        console.log(`\n${ANSI.bold}─── ${tierName} ───────────────────────────────────────${ANSI.reset}`);
      }

      if (args.verbose || !item.passed) {
        if (item.passed) {
          console.log(`  ${ANSI.green}✔ [PASS]${ANSI.reset} ${item.name} ${ANSI.gray}(${item.durationMs}ms)${ANSI.reset}`);
        } else {
          console.log(`  ${ANSI.red}✖ [FAIL]${ANSI.reset} ${item.name} ${ANSI.gray}(${item.durationMs}ms)${ANSI.reset}`);
          if (item.error) {
            console.log(`    ${ANSI.red}${item.error}${ANSI.reset}`);
          }
        }
      }
    },
  });

  // Calculate tier breakdowns
  const tierStats: Record<number, { total: number; passed: number; failed: number; durationMs: number }> = {
    1: { total: 0, passed: 0, failed: 0, durationMs: 0 },
    2: { total: 0, passed: 0, failed: 0, durationMs: 0 },
    3: { total: 0, passed: 0, failed: 0, durationMs: 0 },
    4: { total: 0, passed: 0, failed: 0, durationMs: 0 },
    5: { total: 0, passed: 0, failed: 0, durationMs: 0 },
  };

  for (const s of results.suites) {
    const t = s.tier ?? 1;
    if (tierStats[t]) {
      tierStats[t].total += s.tests.length;
      tierStats[t].passed += s.passed;
      tierStats[t].failed += s.failed;
      tierStats[t].durationMs += s.durationMs;
    }
  }

  // Print ANSI Summary Matrix Table
  console.log(`\n${ANSI.bold}================================================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}                               Summary Matrix                                   ${ANSI.reset}`);
  console.log(`${ANSI.bold}================================================================================${ANSI.reset}`);
  console.log(`┌─────────────────────────────────┬────────┬────────┬────────┬────────┬─────────┐`);
  console.log(`│ ${ANSI.bold}Test Tier${ANSI.reset}                       │  ${ANSI.bold}Total${ANSI.reset} │ ${ANSI.bold}Passed${ANSI.reset} │ ${ANSI.bold}Failed${ANSI.reset} │ ${ANSI.bold}Skip${ANSI.reset}   │    ${ANSI.bold}Time${ANSI.reset} │`);
  console.log(`├─────────────────────────────────┼────────┼────────┼────────┼────────┼─────────┤`);

  const printRow = (label: string, stat: { total: number; passed: number; failed: number; durationMs: number }) => {
    const lbl = label.padEnd(31, ' ');
    const tot = String(stat.total).padStart(6, ' ');
    const pass = `${ANSI.green}${String(stat.passed).padStart(6, ' ')}${ANSI.reset}`;
    const fail = stat.failed > 0
      ? `${ANSI.red}${String(stat.failed).padStart(6, ' ')}${ANSI.reset}`
      : `${String(stat.failed).padStart(6, ' ')}`;
    const skip = String(0).padStart(6, ' ');
    const time = `${stat.durationMs}ms`.padStart(7, ' ');
    console.log(`│ ${lbl} │ ${tot} │ ${pass} │ ${fail} │ ${skip} │ ${time} │`);
  };

  printRow('Tier 1: Feature Coverage', tierStats[1]);
  printRow('Tier 2: Boundary & Corner Cases', tierStats[2]);
  printRow('Tier 3: Pairwise Combinations', tierStats[3]);
  printRow('Tier 4: Real-World Workloads', tierStats[4]);
  printRow('Tier 5: Adversarial Hardening', tierStats[5]);
  console.log(`├─────────────────────────────────┼────────┼────────┼────────┼────────┼─────────┤`);

  const totLbl = `${ANSI.bold}TOTAL${ANSI.reset}`.padEnd(31 + ANSI.bold.length + ANSI.reset.length, ' ');
  const totCount = String(results.total).padStart(6, ' ');
  const totPass = `${ANSI.green}${ANSI.bold}${String(results.passed).padStart(6, ' ')}${ANSI.reset}`;
  const totFail = results.failed > 0
    ? `${ANSI.red}${ANSI.bold}${String(results.failed).padStart(6, ' ')}${ANSI.reset}`
    : `${String(results.failed).padStart(6, ' ')}`;
  const totTime = `${results.durationMs}ms`.padStart(7, ' ');
  console.log(`│ ${totLbl} │ ${totCount} │ ${totPass} │ ${totFail} │ ${String(results.skipped).padStart(6, ' ')} │ ${totTime} │`);
  console.log(`└─────────────────────────────────┴────────┴────────┴────────┴────────┴─────────┘`);

  // Overall verdict
  const isAllPassed = results.failed === 0 && results.total > 0;
  if (isAllPassed) {
    console.log(`\n${ANSI.bold}${ANSI.green}✨ OVERALL STATUS: ALL TESTS PASSED (100% Pass Rate, Exit Code: 0)${ANSI.reset}`);
  } else {
    console.log(`\n${ANSI.bold}${ANSI.red}❌ OVERALL STATUS: ${results.failed} TEST(S) FAILED (Exit Code: 1)${ANSI.reset}`);
  }

  // Save JSON report
  const reportDir = path.dirname(args.jsonPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const jsonReport = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'KeepXCleanE2ETestReport',
    timestamp: new Date().toISOString(),
    durationMs: results.durationMs,
    success: isAllPassed,
    exitCode: isAllPassed ? 0 : 1,
    summary: {
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      skipped: results.skipped,
    },
    tiers: {
      tier1: tierStats[1],
      tier2: tierStats[2],
      tier3: tierStats[3],
      tier4: tierStats[4],
      tier5: tierStats[5],
    },
    failures: results.failures.map((f) => ({
      tier: f.tier,
      suite: f.suite,
      name: f.name,
      errorMessage: f.error,
      stackTrace: f.stack,
    })),
  };

  fs.writeFileSync(args.jsonPath, JSON.stringify(jsonReport, null, 2), 'utf8');
  console.log(`${ANSI.gray}📄 JSON Report saved to: ${path.relative(ROOT_DIR, args.jsonPath)}${ANSI.reset}\n`);

  process.exit(isAllPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(`${ANSI.red}Fatal Runner Error:${ANSI.reset}`, err);
  process.exit(1);
});
