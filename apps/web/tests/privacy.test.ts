import { describe, it, expect } from 'vitest';
import { PRIVACY_CONTENT } from '../src/data/privacyContent';

describe('Privacy Policy Content Specification', () => {
  it('contains complete bilingual dictionaries for en and zh-CN', () => {
    expect(PRIVACY_CONTENT).toHaveProperty('en');
    expect(PRIVACY_CONTENT).toHaveProperty('zh-CN');
    expect(PRIVACY_CONTENT.en.title).toBe('Privacy Policy');
    expect(PRIVACY_CONTENT['zh-CN'].title).toBe('隐私政策（Privacy Policy）');
  });

  it('contains all 6 required privacy sections with correct titles and non-empty content', () => {
    for (const locale of ['en', 'zh-CN'] as const) {
      const doc = PRIVACY_CONTENT[locale];
      expect(doc.sec1Title).toContain('1.');
      expect(doc.sec1Bullets.length).toBeGreaterThanOrEqual(3);

      expect(doc.sec2Title).toContain('2.');
      expect(doc.sec2Bullets.length).toBeGreaterThanOrEqual(4);
      expect(doc.sec2Outro).toBeTruthy();

      expect(doc.sec3Title).toContain('3.');
      expect(doc.sec3SyncTitle).toBeTruthy();
      expect(doc.sec3ReportTitle).toBeTruthy();
      expect(doc.sec3ReportBullets.length).toBeGreaterThanOrEqual(2);
      expect(doc.sec3NativeTitle).toBeTruthy();

      expect(doc.sec4Title).toContain('4.');
      expect(doc.sec4Rows.length).toBe(5);

      expect(doc.sec5Title).toContain('5.');
      expect(doc.sec5Bullets.length).toBeGreaterThanOrEqual(3);

      expect(doc.sec6Title).toContain('6.');
      expect(doc.contactEmail).toBe('privacy@keepxclean.com');
    }
  });

  it('declares the exact 5 Chrome Web Store extension permissions with single-purpose justifications', () => {
    for (const locale of ['en', 'zh-CN'] as const) {
      const rows = PRIVACY_CONTENT[locale].sec4Rows;
      expect(rows).toHaveLength(5);

      // Row 1: storage
      expect(rows[0].permission).toEqual(['storage']);
      expect(rows[0].reason.length).toBeGreaterThan(10);

      // Row 2: alarms
      expect(rows[1].permission).toEqual(['alarms']);
      expect(rows[1].reason.length).toBeGreaterThan(10);

      // Row 3: X host permissions
      expect(rows[2].permission).toEqual(['*://*.x.com/*', '*://*.twitter.com/*']);
      expect(rows[2].reason.length).toBeGreaterThan(10);

      // Row 4: KeepXClean API host permissions
      expect(rows[3].permission).toEqual(['https://*.keepxclean.com/*']);
      expect(rows[3].reason.length).toBeGreaterThan(10);

      // Row 5: optional_host_permissions
      expect(rows[4].permission).toEqual(['optional_host_permissions']);
      expect(rows[4].reason.length).toBeGreaterThan(10);
    }
  });

  it('guarantees salted SHA-256 hash explanation and anti-abuse thresholds in section 3', () => {
    expect(PRIVACY_CONTENT.en.sec3ReportBullets[1]).toContain('reporterUidHash');
    expect(PRIVACY_CONTENT.en.sec3ReportBullets[1]).toContain('≥30-day');
    expect(PRIVACY_CONTENT['zh-CN'].sec3ReportBullets[1]).toContain('reporterUidHash');
    expect(PRIVACY_CONTENT['zh-CN'].sec3ReportBullets[1]).toContain('≥30 天');
  });
});
