import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SITE_DOMAIN,
  SUPPORTED_LOCALES,
  type SupportedLocale,
  type TriggeredRuleId,
} from '@keepxclean/shared';
import {
  buildReportCardData,
  drawBattleReportCard,
  renderBattleReportPng,
  REPORT_CARD_HEIGHT,
  REPORT_CARD_PALETTE,
  REPORT_CARD_WIDTH,
} from '../src/features/history/ReportCard';
import { getI18n, setActiveLocaleSetting } from '../src/i18n/core';
import {
  defaultStats,
  trailingLocalDates,
  type Stats,
} from '../src/services/model';
import { mockChrome } from './mock-chrome';

interface RecordedFillRect {
  fillStyle: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RecordedFillText {
  text: string;
  x: number;
  y: number;
  maxWidth?: number;
  fillStyle: string;
  font: string;
  textAlign: string;
}

interface RecordedDrawImage {
  image: CanvasImageSource;
  x: number;
  y: number;
  w: number;
  h: number;
}

function createRecordingCtx(options?: { throwOnDrawImage?: boolean }) {
  const fillRects: RecordedFillRect[] = [];
  const fillCalls: Array<{ fillStyle: string }> = [];
  const strokeCalls: Array<{ strokeStyle: string; lineWidth: number }> = [];
  const fillTexts: RecordedFillText[] = [];
  const drawImageCalls: RecordedDrawImage[] = [];

  let currentFill = '';
  let currentStroke = '';
  let currentLineWidth = 1;
  let currentFont = '';
  let currentAlign: CanvasTextAlign = 'left';
  let currentBaseline: CanvasTextBaseline = 'alphabetic';

  const ctx = {
    get fillStyle() {
      return currentFill;
    },
    set fillStyle(val: string) {
      currentFill = val;
    },
    get strokeStyle() {
      return currentStroke;
    },
    set strokeStyle(val: string) {
      currentStroke = val;
    },
    get lineWidth() {
      return currentLineWidth;
    },
    set lineWidth(val: number) {
      currentLineWidth = val;
    },
    get font() {
      return currentFont;
    },
    set font(val: string) {
      currentFont = val;
    },
    get textAlign() {
      return currentAlign;
    },
    set textAlign(val: CanvasTextAlign) {
      currentAlign = val;
    },
    get textBaseline() {
      return currentBaseline;
    },
    set textBaseline(val: CanvasTextBaseline) {
      currentBaseline = val;
    },
    save() {},
    restore() {},
    clip() {},
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    fill() {
      fillCalls.push({ fillStyle: currentFill });
    },
    stroke() {
      strokeCalls.push({
        strokeStyle: currentStroke,
        lineWidth: currentLineWidth,
      });
    },
    measureText(text: string) {
      return { width: text.length * 7 };
    },
    fillRect(x: number, y: number, w: number, h: number) {
      fillRects.push({ fillStyle: currentFill, x, y, w, h });
    },
    fillText(text: string, x: number, y: number, maxWidth?: number) {
      fillTexts.push({
        text,
        x,
        y,
        maxWidth,
        fillStyle: currentFill,
        font: currentFont,
        textAlign: currentAlign,
      });
    },
    drawImage(
      image: CanvasImageSource,
      x: number,
      y: number,
      w: number,
      h: number
    ) {
      if (options?.throwOnDrawImage) {
        throw new Error('broken image draw');
      }
      drawImageCalls.push({ image, x, y, w, h });
    },
  };

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    fillRects,
    fillCalls,
    strokeCalls,
    fillTexts,
    drawImageCalls,
  };
}

function stubCanvasEnvironment(options: {
  ctx?: CanvasRenderingContext2D | null;
  blob?: Blob | null;
  dataUrl?: string;
  toBlobSupported?: boolean;
}) {
  const ctxValue = options.ctx === undefined ? createRecordingCtx().ctx : options.ctx;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctxValue as unknown as ReturnType<HTMLCanvasElement['getContext']>
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    options.dataUrl ?? 'data:image/png;base64,iVBORw0KGgo='
  );
  if (options.toBlobSupported === false) {
    const proto = HTMLCanvasElement.prototype as unknown as {
      toBlob?: HTMLCanvasElement['toBlob'];
    };
    const originalToBlob = proto.toBlob;
    proto.toBlob = undefined;
    return () => {
      proto.toBlob = originalToBlob;
    };
  }
  const blobValue =
    options.blob === undefined
      ? new Blob(['png-bytes'], { type: 'image/png' })
      : options.blob;
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
    queueMicrotask(() => cb(blobValue));
  });
  return () => {};
}

function stubImageClass(
  behavior: 'load' | 'load-zero-width' | 'error' | 'timeout'
) {
  const loadedSrcs: string[] = [];
  class FakeImage {
    naturalWidth = 0;
    naturalHeight = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = '';

    get src() {
      return this._src;
    }

    set src(value: string) {
      this._src = value;
      loadedSrcs.push(value);
      if (behavior === 'load') {
        this.naturalWidth = 128;
        this.naturalHeight = 128;
        queueMicrotask(() => this.onload?.());
      } else if (behavior === 'load-zero-width') {
        this.naturalWidth = 0;
        this.naturalHeight = 0;
        queueMicrotask(() => this.onload?.());
      } else if (behavior === 'error') {
        queueMicrotask(() => this.onerror?.());
      }
    }
  }
  vi.stubGlobal('Image', FakeImage);
  return { loadedSrcs };
}

function makeRichStats(now = new Date(2026, 4, 10, 12, 0, 0)): Stats {
  const dates = trailingLocalDates(7, now);
  return {
    ...defaultStats(now),
    todayBlocked: 42,
    totalBlocked: 1520,
    todayAdsHidden: 12,
    totalAdsHidden: 340,
    byRule: {
      reply_spam: 520,
      high_frequency_daily: 310,
      domain_filter: 180,
      grok_filter: 90,
      promoted_ad: 340,
    },
    dailyHistory: dates.map((date, idx) => ({
      date,
      blocked: (idx + 1) * 10,
      ads: idx + 2,
    })),
  };
}

let cleanupToBlob: (() => void) | null = null;

afterEach(() => {
  cleanupToBlob?.();
  cleanupToBlob = null;
  document.documentElement.removeAttribute('data-theme');
  setActiveLocaleSetting('auto');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Battle Report Canvas 2D renderer (ReportCard)', () => {
  describe('buildReportCardData', () => {
    it('computes 7-day rolling totals, date range, and Top 3 descending reasons', () => {
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const stats = makeRichStats(now);
      const { m } = getI18n('en');

      const data = buildReportCardData(stats, m.history.ruleLabels, now);
      expect(data.totalBlocked).toBe(1520);
      expect(data.totalAdsHidden).toBe(340);
      expect(data.sevenDayBlocked).toBe(280);
      expect(data.sevenDayAds).toBe(35);
      expect(data.dailyHistory).toHaveLength(7);
      expect(data.dateRangeLabel).toBe('05/04 – 05/10');
      expect(data.topReasons.map((r) => r.ruleId)).toEqual([
        'reply_spam',
        'promoted_ad',
        'high_frequency_daily',
      ]);
      expect(data.topReasons[0]?.share).toBeCloseTo(
        520 / (520 + 340 + 310 + 180 + 90),
        6
      );
    });

    it('synthesizes promoted_ad when omitted from byRule and never duplicates when present', () => {
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const { m } = getI18n('en');

      const omittedStats: Stats = {
        ...defaultStats(now),
        totalBlocked: 100,
        totalAdsHidden: 250,
        byRule: { reply_spam: 60 },
      };
      const synthesized = buildReportCardData(
        omittedStats,
        m.history.ruleLabels,
        now
      );
      expect(synthesized.topReasons[0]).toMatchObject({
        ruleId: 'promoted_ad',
        label: m.history.ruleLabels.promoted_ad,
        count: 250,
      });

      const presentStats: Stats = {
        ...defaultStats(now),
        totalBlocked: 100,
        totalAdsHidden: 120,
        byRule: { promoted_ad: 120, reply_spam: 80 },
      };
      const deduped = buildReportCardData(
        presentStats,
        m.history.ruleLabels,
        now
      );
      expect(
        deduped.topReasons.filter((r) => r.ruleId === 'promoted_ad')
      ).toHaveLength(1);
    });

    it('strips prototype keys (__proto__, constructor, toString, valueOf, hasOwnProperty)', () => {
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const { m, locale } = getI18n('en');
      const poisonedByRule = JSON.parse(
        '{"__proto__":500,"constructor":400,"toString":300,"valueOf":200,"hasOwnProperty":100,"reply_spam":10}'
      ) as Partial<Record<TriggeredRuleId, number>>;

      const stats: Stats = {
        ...defaultStats(now),
        totalBlocked: 10,
        byRule: poisonedByRule,
      };
      const data = buildReportCardData(stats, m.history.ruleLabels, now);
      expect(data.topReasons).toHaveLength(1);
      expect(data.topReasons[0]?.ruleId).toBe('reply_spam');
      expect(data.topReasons[0]?.label).toBe(m.history.ruleLabels.reply_spam);

      const rec = createRecordingCtx();
      drawBattleReportCard(rec.ctx, data, m.history.report, locale);
      const allText = rec.fillTexts.map((t) => t.text).join('\n');
      expect(allText).not.toContain('[object Object]');
      expect(allText).not.toContain('function Object');
      expect(allText).not.toContain('function toString');
      expect(allText).not.toContain('native code');
    });

    it('strictly strips arbitrary PII canaries from byRule (Zero-PII structural guarantee)', () => {
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const { m, locale } = getI18n('en');
      const piiByRule = {
        '@secret_handle': 999,
        '123456789012': 888,
        'https://evil.example': 777,
        sk_secret_token: 666,
        reply_spam: 10,
      } as unknown as Partial<Record<TriggeredRuleId, number>>;

      const stats: Stats = {
        ...defaultStats(now),
        totalBlocked: 10,
        byRule: piiByRule,
      };
      const data = buildReportCardData(stats, m.history.ruleLabels, now);
      expect(data.topReasons.map((r) => r.ruleId)).toEqual(['reply_spam']);

      const rec = createRecordingCtx();
      drawBattleReportCard(rec.ctx, data, m.history.report, locale);
      const allText = rec.fillTexts.map((t) => t.text).join('\n');
      expect(allText).not.toContain('@');
      expect(allText).not.toContain('secret');
      expect(allText).not.toContain('123456789012');
      expect(allText).not.toContain('evil.example');
    });

    it('sanitizes Infinity, NaN, negative, and <1 fractional counts cleanly', () => {
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const { m, locale } = getI18n('en');
      const stats: Stats = {
        ...defaultStats(now),
        totalBlocked: Number.POSITIVE_INFINITY,
        totalAdsHidden: Number.NaN,
        byRule: {
          reply_spam: 0.4,
          grok_filter: -5,
          domain_filter: Number.POSITIVE_INFINITY,
          keyword: Number.NaN,
          tag_spam: 3.9,
        },
      };

      const data = buildReportCardData(stats, m.history.ruleLabels, now);
      expect(data.totalBlocked).toBe(0);
      expect(data.totalAdsHidden).toBe(0);
      expect(data.topReasons).toEqual([
        {
          ruleId: 'tag_spam',
          label: m.history.ruleLabels.tag_spam,
          count: 3,
          share: 1,
        },
      ]);

      const rec = createRecordingCtx();
      drawBattleReportCard(rec.ctx, data, m.history.report, locale);
      const texts = rec.fillTexts.map((t) => t.text);
      expect(texts.some((t) => t.includes('∞'))).toBe(false);
      expect(texts.some((t) => t.includes('Infinity'))).toBe(false);
      expect(texts.some((t) => t.includes('NaN'))).toBe(false);
      expect(texts.some((t) => t.includes('0 (0%)'))).toBe(false);
    });

    it('renders empty state cleanly for zero stats', () => {
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const { m, locale } = getI18n('en');
      const data = buildReportCardData(defaultStats(now), m.history.ruleLabels, now);
      expect(data.topReasons).toEqual([]);
      expect(data.totalBlocked).toBe(0);
      expect(data.sevenDayBlocked).toBe(0);

      const rec = createRecordingCtx();
      drawBattleReportCard(rec.ctx, data, m.history.report, locale);
      expect(rec.fillTexts.map((t) => t.text)).toContain(
        m.history.report.noReasonsYet
      );
    });
  });

  describe('drawBattleReportCard', () => {
    it('draws the approved shield-x-v1 brand icon via ctx.drawImage at exact header coordinates', () => {
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const { m, locale } = getI18n('en');
      const data = buildReportCardData(
        makeRichStats(now),
        m.history.ruleLabels,
        now
      );
      const fakeImg = {
        src: 'chrome-extension://test/icon/icon-128.png',
        naturalWidth: 128,
        naturalHeight: 128,
      } as unknown as HTMLImageElement;

      const rec = createRecordingCtx();
      drawBattleReportCard(rec.ctx, data, m.history.report, locale, {
        iconImage: fakeImg,
      });

      expect(rec.drawImageCalls).toEqual([
        { image: fakeImg, x: 68, y: 66, w: 44, h: 44 },
      ]);
      // Title shifted right to make room for 44px icon
      const titleDraw = rec.fillTexts.find(
        (t) => t.text === m.history.report.cardTitle
      );
      expect(titleDraw?.x).toBe(68 + 58);
    });

    it('recovers cleanly without an X glyph if ctx.drawImage throws', () => {
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const { m, locale } = getI18n('en');
      const data = buildReportCardData(
        makeRichStats(now),
        m.history.ruleLabels,
        now
      );
      const fakeImg = {
        src: 'chrome-extension://test/icon/icon-128.png',
      } as unknown as HTMLImageElement;

      const rec = createRecordingCtx({ throwOnDrawImage: true });
      expect(() =>
        drawBattleReportCard(rec.ctx, data, m.history.report, locale, {
          iconImage: fakeImg,
        })
      ).not.toThrow();

      const texts = rec.fillTexts.map((t) => t.text);
      expect(texts).toContain(m.history.report.cardTitle);
      expect(texts).toContain(SITE_DOMAIN);
      expect(texts).not.toContain('X');
    });

    it('uses compliant text-only header (NO X glyph) when iconImage is null or omitted', () => {
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const { m, locale } = getI18n('en');
      const data = buildReportCardData(
        makeRichStats(now),
        m.history.ruleLabels,
        now
      );

      for (const opts of [{ iconImage: null }, undefined]) {
        const rec = createRecordingCtx();
        drawBattleReportCard(rec.ctx, data, m.history.report, locale, opts);
        expect(rec.drawImageCalls).toHaveLength(0);
        expect(rec.fillTexts.map((t) => t.text)).not.toContain('X');
        expect(
          rec.fillCalls.some(
            (c) => c.fillStyle === REPORT_CARD_PALETTE.brandGreenSoft
          )
        ).toBe(true);
        const titleDraw = rec.fillTexts.find(
          (t) => t.text === m.history.report.cardTitle
        );
        expect(titleDraw?.x).toBe(68);
      }
    });

    it('keeps the always-light brand palette and keepxclean.com watermark even under active dark theme', () => {
      document.documentElement.dataset.theme = 'dark';
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const { m, locale } = getI18n('en');
      const data = buildReportCardData(
        makeRichStats(now),
        m.history.ruleLabels,
        now
      );

      const rec = createRecordingCtx();
      drawBattleReportCard(rec.ctx, data, m.history.report, locale);

      expect(rec.fillRects[0]).toEqual({
        fillStyle: REPORT_CARD_PALETTE.canvasBg,
        x: 0,
        y: 0,
        w: REPORT_CARD_WIDTH,
        h: REPORT_CARD_HEIGHT,
      });
      expect(
        rec.fillCalls.some((c) => c.fillStyle === REPORT_CARD_PALETTE.cardBg)
      ).toBe(true);
      expect(
        rec.strokeCalls.some(
          (c) => c.strokeStyle === REPORT_CARD_PALETTE.cardBorder
        )
      ).toBe(true);
      expect(
        rec.fillTexts.some(
          (t) => t.fillStyle === REPORT_CARD_PALETTE.textPrimary
        )
      ).toBe(true);
      expect(
        rec.fillTexts.some((t) => t.fillStyle === REPORT_CARD_PALETTE.textMuted)
      ).toBe(true);
      expect(
        rec.fillTexts.some(
          (t) => t.fillStyle === REPORT_CARD_PALETTE.brandGreen
        )
      ).toBe(true);
      expect(
        rec.fillCalls.some(
          (c) => c.fillStyle === REPORT_CARD_PALETTE.brandGreenSoft
        )
      ).toBe(true);

      const allSurfaceFills = [
        ...rec.fillRects.map((r) => r.fillStyle),
        ...rec.fillCalls.map((c) => c.fillStyle),
      ];
      for (const color of allSurfaceFills) {
        const lower = color.toLowerCase();
        expect(lower.startsWith('#0')).toBe(false);
        expect(lower.startsWith('#111')).toBe(false);
        expect(lower.startsWith('#15202b')).toBe(false);
        expect(lower.startsWith('#181')).toBe(false);
      }

      expect(rec.fillTexts.map((t) => t.text)).toContain(SITE_DOMAIN);
      expect(rec.fillTexts.some((t) => t.text.includes('1,520'))).toBe(true);
    });

    it('compacts huge 7-day bar counts to fit slotW - 4 across all 10 locales without overflow', () => {
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const dates = trailingLocalDates(7, now);
      const hugeStats: Stats = {
        ...defaultStats(now),
        totalBlocked: 7_777_777_770,
        totalAdsHidden: 777_777_777,
        byRule: { reply_spam: 7_777_777_770 },
        dailyHistory: dates.map((date) => ({
          date,
          blocked: 999_999_999,
          ads: 111_111_111,
        })),
      };

      const cardW = REPORT_CARD_WIDTH - 64;
      const contentW = cardW - 72;
      const leftW = Math.round(contentW * 0.52);
      const chartW = leftW - 40;
      const slotW = chartW / 7;
      const maxBarLabelW = slotW - 4;

      for (const locale of SUPPORTED_LOCALES) {
        const { m } = getI18n(locale as SupportedLocale);
        const data = buildReportCardData(hugeStats, m.history.ruleLabels, now);
        const rec = createRecordingCtx();
        drawBattleReportCard(rec.ctx, data, m.history.report, locale);

        expect(rec.fillTexts.some((t) => t.text === '1111111110')).toBe(false);
        const barLabels = rec.fillTexts.filter(
          (t) => t.textAlign === 'center' && t.font.startsWith('600 11px')
        );
        expect(barLabels).toHaveLength(7);
        for (const label of barLabels) {
          expect(rec.ctx.measureText(label.text).width).toBeLessThanOrEqual(
            maxBarLabelW
          );
        }
      }
    });

    it('dynamically truncates Top-3 left labels so they never collide with wide localized right counts', () => {
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const { m, locale } = getI18n('de');
      const hugeReasonStats: Stats = {
        ...defaultStats(now),
        totalBlocked: 98_765_432,
        byRule: {
          high_frequency_daily: 98_765_432,
        },
      };
      const data = buildReportCardData(
        hugeReasonStats,
        m.history.ruleLabels,
        now
      );
      const rec = createRecordingCtx();
      drawBattleReportCard(rec.ctx, data, m.history.report, locale);

      const cardW = REPORT_CARD_WIDTH - 64;
      const contentW = cardW - 72;
      const leftW = Math.round(contentW * 0.52);
      const rightW = contentW - leftW - 18;
      const trackW = rightW - 40;

      const leftEntry = rec.fillTexts.find(
        (t) => t.textAlign === 'left' && t.font.startsWith('600 13.5px')
      );
      const rightEntry = rec.fillTexts.find(
        (t) => t.textAlign === 'right' && t.font.startsWith('600 13px')
      );
      expect(leftEntry).toBeDefined();
      expect(rightEntry).toBeDefined();
      const leftWpx = rec.ctx.measureText(leftEntry!.text).width;
      const rightWpx = rec.ctx.measureText(rightEntry!.text).width;
      expect(leftWpx + 12 + rightWpx).toBeLessThanOrEqual(trackW);
    });

    it('smoke-renders cleanly across all 10 locales with brand icon, localized labels, and watermark', () => {
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const stats = makeRichStats(now);
      const fakeImg = {
        src: 'chrome-extension://test/icon/icon-128.png',
        naturalWidth: 128,
        naturalHeight: 128,
      } as unknown as HTMLImageElement;

      for (const locale of SUPPORTED_LOCALES) {
        const { m } = getI18n(locale);
        const data = buildReportCardData(stats, m.history.ruleLabels, now);
        const rec = createRecordingCtx();
        drawBattleReportCard(rec.ctx, data, m.history.report, locale, {
          iconImage: fakeImg,
        });

        expect(rec.drawImageCalls).toHaveLength(1);
        const texts = rec.fillTexts.map((t) => t.text);
        expect(texts).toContain(SITE_DOMAIN);
        expect(
          texts.some(
            (t) =>
              t === m.history.report.cardTitle ||
              t.startsWith(m.history.report.cardTitle.slice(0, 6))
          )
        ).toBe(true);
        const prefix = `1. ${m.history.ruleLabels.reply_spam.slice(0, 4)}`;
        expect(texts.some((t) => t.startsWith(prefix))).toBe(true);
        const joined = texts.join('\n');
        expect(joined).not.toContain('undefined');
        expect(joined).not.toContain('NaN');
        expect(joined).not.toContain('@');
      }
    });
  });

  describe('renderBattleReportPng', () => {
    it('loads icon/icon-128.png, draws it with ctx.drawImage, and resolves { dataUrl, blob }', async () => {
      mockChrome();
      const rec = createRecordingCtx();
      cleanupToBlob = stubCanvasEnvironment({ ctx: rec.ctx });
      const { loadedSrcs } = stubImageClass('load');
      const { m, locale } = getI18n('en');

      const res = await renderBattleReportPng(makeRichStats(), m, locale);

      expect(loadedSrcs).toEqual(['chrome-extension://test/icon/icon-128.png']);
      expect(rec.drawImageCalls).toHaveLength(1);
      expect((rec.drawImageCalls[0]?.image as HTMLImageElement).src).toBe(
        'chrome-extension://test/icon/icon-128.png'
      );
      expect(res.dataUrl.startsWith('data:image/png')).toBe(true);
      expect(res.blob).toBeInstanceOf(Blob);
      expect(res.blob.type).toBe('image/png');
    });

    it('falls back to null icon (no drawImage, no X glyph) when onload reports naturalWidth === 0', async () => {
      mockChrome();
      const rec = createRecordingCtx();
      cleanupToBlob = stubCanvasEnvironment({ ctx: rec.ctx });
      stubImageClass('load-zero-width');
      const { m, locale } = getI18n('en');

      const res = await renderBattleReportPng(makeRichStats(), m, locale);
      expect(res.blob).toBeInstanceOf(Blob);
      expect(rec.drawImageCalls).toHaveLength(0);
      expect(rec.fillTexts.map((t) => t.text)).not.toContain('X');
    });

    it('degrades gracefully when Image fires onerror', async () => {
      mockChrome();
      const rec = createRecordingCtx();
      cleanupToBlob = stubCanvasEnvironment({ ctx: rec.ctx });
      stubImageClass('error');
      const { m, locale } = getI18n('en');

      const res = await renderBattleReportPng(makeRichStats(), m, locale);
      expect(res.blob).toBeInstanceOf(Blob);
      expect(rec.drawImageCalls).toHaveLength(0);
    });

    it('resolves cleanly after the 1500ms icon-load timeout without hanging', async () => {
      vi.useFakeTimers();
      mockChrome();
      const rec = createRecordingCtx();
      cleanupToBlob = stubCanvasEnvironment({ ctx: rec.ctx });
      stubImageClass('timeout');
      const { m, locale } = getI18n('en');

      const promise = renderBattleReportPng(makeRichStats(), m, locale);
      await vi.advanceTimersByTimeAsync(1500);
      const res = await promise;

      expect(res.blob).toBeInstanceOf(Blob);
      expect(rec.drawImageCalls).toHaveLength(0);
    });

    it('rejects with localized renderError when canvas.toBlob returns null or is unsupported', async () => {
      mockChrome();
      const rec = createRecordingCtx();
      cleanupToBlob = stubCanvasEnvironment({ ctx: rec.ctx, blob: null });
      stubImageClass('load');
      const { m, locale } = getI18n('en');

      await expect(
        renderBattleReportPng(makeRichStats(), m, locale)
      ).rejects.toThrow(m.history.report.renderError);

      cleanupToBlob();
      cleanupToBlob = stubCanvasEnvironment({
        ctx: rec.ctx,
        toBlobSupported: false,
      });
      await expect(
        renderBattleReportPng(makeRichStats(), m, locale)
      ).rejects.toThrow(m.history.report.renderError);
    });

    it('rejects with localized renderError when canvas.getContext("2d") returns null', async () => {
      mockChrome();
      cleanupToBlob = stubCanvasEnvironment({ ctx: null });
      const { m, locale } = getI18n('en');

      await expect(
        renderBattleReportPng(makeRichStats(), m, locale)
      ).rejects.toThrow(m.history.report.renderError);
    });

    it('restores 600 13px font before drawing the date range pill label (LOW-3)', () => {
      const rec = createRecordingCtx();
      const { m, locale } = getI18n('en');
      const data = buildReportCardData(makeRichStats(), m.history.ruleLabels);

      drawBattleReportCard(rec.ctx, data, m.history.report, locale);

      const pillTextCall = rec.fillTexts.find(
        (call) => call.text === data.dateRangeLabel
      );
      expect(pillTextCall).toBeDefined();
      expect(pillTextCall!.font.startsWith('600 13px ')).toBe(true);
    });
  });
});
