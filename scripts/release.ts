import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const PACKAGE_JSON_PATHS = [
  'package.json',
  'packages/shared/package.json',
  'apps/extension/package.json',
  'apps/server/package.json',
  'apps/web/package.json',
];

function printUsage(): void {
  console.log(`Usage: pnpm release:bump <new-version> [--dry-run]

Atomically aligns monorepo package.json versions, web CURRENT_VERSION,
10-locale release CTA badges, test fixtures, and Chrome Web Store submission guide.

Example:
  pnpm release:bump 0.2.1 --dry-run
  pnpm release:bump 0.2.1`);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateLocaleReleaseStrings(source: string, oldVer: string, newVer: string): string {
  const oldTag = `v${oldVer}`;
  const newTag = `v${newVer}`;
  const oldTagRe = new RegExp(escapeRegExp(oldTag), 'g');
  const oldBareRe = new RegExp(escapeRegExp(oldVer), 'g');

  // Replace v<oldVer> only on CTA, focalTweet, install, and footer release lines
  const lines = source.split('\n');
  let inFocalTweet = false;
  let inStep1Desc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('focalTweet:')) inFocalTweet = true;
    if (inFocalTweet && line.includes('},')) inFocalTweet = false;

    if (line.includes('step1Desc:')) inStep1Desc = true;
    if (inStep1Desc && line.includes('step1Action:')) inStep1Desc = false;

    const isReleaseLine =
      line.includes('downloadCta:') ||
      line.includes('ctaDownload:') ||
      line.includes('ctaPrimary:') ||
      line.includes('readyStatus:') ||
      line.includes('releaseZip:') ||
      inFocalTweet ||
      inStep1Desc;

    if (isReleaseLine) {
      lines[i] = line.replace(oldTagRe, newTag).replace(oldBareRe, newVer);
    }
  }
  return lines.join('\n');
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help') || argv.length === 0) {
    printUsage();
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const dryRun = argv.includes('--dry-run');
  const rawVer = argv.find((a) => !a.startsWith('-'))?.replace(/^v/, '');

  if (!rawVer || !SEMVER_RE.test(rawVer)) {
    console.error(`Invalid semantic version: "${rawVer ?? ''}". Expected X.Y.Z (e.g. 0.2.1).`);
    process.exit(1);
  }

  const rootDir = process.cwd();
  const rootPkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as {
    version: string;
  };
  const oldVer = rootPkg.version;

  if (oldVer === rawVer) {
    console.log(`Monorepo is already at version ${rawVer}.`);
    return;
  }

  const updates = new Map<string, string>();

  // 1. Workspace package.json files
  for (const rel of PACKAGE_JSON_PATHS) {
    const abs = resolve(rootDir, rel);
    const raw = readFileSync(abs, 'utf8');
    const updated = raw.replace(
      new RegExp(`("version":\\s*)"${escapeRegExp(oldVer)}"`),
      `$1"${rawVer}"`
    );
    updates.set(rel, updated);
  }

  // 2. apps/web/src/config.ts & apps/web/tests/config.test.ts
  const webConfigRel = 'apps/web/src/config.ts';
  updates.set(
    webConfigRel,
    readFileSync(resolve(rootDir, webConfigRel), 'utf8').replace(
      `export const CURRENT_VERSION = 'v${oldVer}';`,
      `export const CURRENT_VERSION = 'v${rawVer}';`
    )
  );

  const webConfigTestRel = 'apps/web/tests/config.test.ts';
  updates.set(
    webConfigTestRel,
    readFileSync(resolve(rootDir, webConfigTestRel), 'utf8')
      .replace(`expect(CURRENT_VERSION).toBe('v${oldVer}');`, `expect(CURRENT_VERSION).toBe('v${rawVer}');`)
  );

  const sandboxStressRel = 'apps/web/tests/sandbox-challenger-m3-2.test.tsx';
  if (existsSync(resolve(rootDir, sandboxStressRel))) {
    updates.set(
      sandboxStressRel,
      readFileSync(resolve(rootDir, sandboxStressRel), 'utf8').replace(
        `expect(container.textContent).toContain('v${oldVer}');`,
        `expect(container.textContent).toContain('v${rawVer}');`
      )
    );
  }

  // 3. Extension manifest mocks
  for (const rel of ['apps/extension/tests/mock-chrome.ts', 'apps/extension/tests/ui/main.tsx']) {
    const abs = resolve(rootDir, rel);
    if (existsSync(abs)) {
      updates.set(
        rel,
        readFileSync(abs, 'utf8').replace(
          new RegExp(`version:\\s*'${escapeRegExp(oldVer)}'`, 'g'),
          `version: '${rawVer}'`
        )
      );
    }
  }

  // 4. 10 web locale dictionaries
  const localesDir = resolve(rootDir, 'apps/web/src/locales');
  for (const file of readdirSync(localesDir)) {
    if (!file.endsWith('.ts') || ['index.ts', 'types.ts', 'resolve.ts', 'useCta.ts'].includes(file)) {
      continue;
    }
    const rel = `apps/web/src/locales/${file}`;
    const raw = readFileSync(resolve(rootDir, rel), 'utf8');
    const updated = updateLocaleReleaseStrings(raw, oldVer, rawVer);
    if (updated !== raw) {
      updates.set(rel, updated);
    }
  }

  // 5. Chrome Web Store Submission Guide
  const guideRel = 'release/chrome-web-store/SUBMISSION_GUIDE.md';
  if (existsSync(resolve(rootDir, guideRel))) {
    updates.set(
      guideRel,
      readFileSync(resolve(rootDir, guideRel), 'utf8')
        .replace(new RegExp(`\\(v${escapeRegExp(oldVer)}\\)`, 'g'), `(v${rawVer})`)
        .replace(
          new RegExp(`keepxcleanextension-${escapeRegExp(oldVer)}-chrome\\.zip`, 'g'),
          `keepxcleanextension-${rawVer}-chrome.zip`
        )
    );
  }

  // 6. Ensure CHANGELOG.md has an entry header
  const changelogRel = 'CHANGELOG.md';
  const changelogRaw = readFileSync(resolve(rootDir, changelogRel), 'utf8');
  const hasChangelogSection = new RegExp(`^## \\[${escapeRegExp(rawVer)}\\]`, 'm').test(changelogRaw);
  if (!hasChangelogSection) {
    const today = new Date().toISOString().slice(0, 10);
    const stub = `## [${rawVer}] - ${today}\n\n### Changed\n- Maintenance and rule updates.\n\n`;
    const updatedChangelog = changelogRaw.replace(/(^## \[)/m, `${stub}$1`);
    updates.set(changelogRel, updatedChangelog);
  }

  console.log(`${dryRun ? '[DRY RUN] Would update' : 'Updating'} ${updates.size} files: ${oldVer} -> ${rawVer}`);
  for (const [rel, content] of updates) {
    console.log(`  - ${rel}`);
    if (!dryRun) {
      writeFileSync(resolve(rootDir, rel), content, 'utf8');
    }
  }

  console.log(`\nNext steps to ship v${rawVer}:
  1. Edit CHANGELOG.md section [${rawVer}] with release highlights
  2. Verify: pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
  3. Commit & tag:
     git add -A && git commit -m "feat(release): ship KeepXClean v${rawVer}"
     git tag v${rawVer} && git push origin main --tags`);
}

main();
