import {
  SITE_DOMAIN,
  type SupportedLocale,
  type TriggeredRuleId,
} from '@keepxclean/shared';
import { formatCount, type ExtensionMessages } from '../../i18n';
import { runtimeUrl } from '../../services/client';
import { rollStats, type DailyStatEntry, type Stats } from '../../services/model';

export const REPORT_CARD_WIDTH = 960;
export const REPORT_CARD_HEIGHT = 600;

export const REPORT_CARD_PALETTE = {
  canvasBg: '#F7F9F8',
  cardBg: '#FFFFFF',
  cardBorder: '#E1E7E3',
  brandGreen: '#13865F',
  brandGreenSoft: '#EAF6EF',
  textPrimary: '#172B24',
  textMuted: '#607168',
  barTrack: '#EDF2EE',
  adsBar: '#9EB5A8',
} as const;

export interface ReportReasonItem {
  ruleId: string;
  label: string;
  count: number;
  share: number;
}

export interface ReportCardData {
  totalBlocked: number;
  totalAdsHidden: number;
  sevenDayBlocked: number;
  sevenDayAds: number;
  dailyHistory: DailyStatEntry[];
  topReasons: ReportReasonItem[];
  dateRangeLabel: string;
}

function safeNonNegInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function formatShortDate(isoDate: string): string {
  const parts = isoDate.split('-');
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : isoDate;
}

/**
 * Pure aggregate builder for the Local Cleanup Battle Report.
 * Structurally accepts ONLY aggregate `Stats` + static localized rule names —
 * zero handles, UIDs, tweet text, or user keywords can ever enter this pipeline.
 */
export function buildReportCardData(
  stats: Stats,
  ruleLabels: Record<TriggeredRuleId, string>,
  now = new Date()
): ReportCardData {
  const rolled = rollStats(stats, now);
  const dailyHistory: DailyStatEntry[] = (rolled.dailyHistory ?? []).map(
    (d) => ({
      date: typeof d?.date === 'string' ? d.date : '',
      blocked: safeNonNegInt(d?.blocked),
      ads: safeNonNegInt(d?.ads),
    })
  );
  const sevenDayBlocked = dailyHistory.reduce((sum, d) => sum + d.blocked, 0);
  const sevenDayAds = dailyHistory.reduce((sum, d) => sum + d.ads, 0);
  const totalBlocked = safeNonNegInt(rolled.totalBlocked);
  const rawByRule =
    rolled.byRule && typeof rolled.byRule === 'object' ? rolled.byRule : {};
  const totalAdsHidden =
    rolled.totalAdsHidden !== undefined
      ? safeNonNegInt(rolled.totalAdsHidden)
      : Object.prototype.hasOwnProperty.call(rawByRule, 'promoted_ad')
        ? safeNonNegInt(rawByRule.promoted_ad)
        : 0;

  const byRuleEntries: Array<{
    ruleId: TriggeredRuleId;
    label: string;
    count: number;
  }> = [];
  for (const [ruleId, rawCount] of Object.entries(rawByRule)) {
    if (!Object.prototype.hasOwnProperty.call(ruleLabels, ruleId)) continue;
    const count = safeNonNegInt(rawCount);
    if (count <= 0) continue;
    const safeId = ruleId as TriggeredRuleId;
    const label = ruleLabels[safeId];
    if (typeof label !== 'string' || !label) continue;
    byRuleEntries.push({
      ruleId: safeId,
      label,
      count,
    });
  }

  if (
    totalAdsHidden > 0 &&
    Object.prototype.hasOwnProperty.call(ruleLabels, 'promoted_ad') &&
    !byRuleEntries.some((entry) => entry.ruleId === 'promoted_ad')
  ) {
    byRuleEntries.push({
      ruleId: 'promoted_ad',
      label: ruleLabels.promoted_ad,
      count: totalAdsHidden,
    });
  }

  byRuleEntries.sort((a, b) => b.count - a.count);
  const sumAll = byRuleEntries.reduce((s, e) => s + e.count, 0) || 1;
  const topReasons: ReportReasonItem[] = byRuleEntries
    .slice(0, 3)
    .map((entry) => ({
      ...entry,
      share: Number.isFinite(entry.count / sumAll)
        ? Math.min(1, Math.max(0, entry.count / sumAll))
        : 0,
    }));

  const firstDay = dailyHistory[0]?.date;
  const lastDay = dailyHistory[dailyHistory.length - 1]?.date;
  const dateRangeLabel =
    firstDay && lastDay
      ? `${formatShortDate(firstDay)} – ${formatShortDate(lastDay)}`
      : rolled.todayDate;

  return {
    totalBlocked,
    totalAdsHidden,
    sevenDayBlocked,
    sevenDayAds,
    dailyHistory,
    topReasons,
    dateRangeLabel,
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (!text || maxWidth <= 0) return '';
  if (typeof ctx.measureText !== 'function') {
    return text.length > 28 ? `${text.slice(0, 27)}…` : text;
  }
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

function formatShortCompact(n: number): string {
  if (n >= 999_500_000_000) return `${Math.round(n / 1e12)}T`;
  if (n >= 999_500_000) {
    const v = n / 1e9;
    return `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))}B`;
  }
  if (n >= 999_500) {
    const v = n / 1e6;
    return `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))}M`;
  }
  if (n >= 10_000) {
    const v = n / 1e3;
    return `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))}K`;
  }
  return String(n);
}

function formatBarCount(
  ctx: CanvasRenderingContext2D,
  total: number,
  locale: SupportedLocale,
  maxWidth: number
): string {
  const safeTotal = safeNonNegInt(total);
  if (safeTotal < 10_000) {
    return truncateText(ctx, String(safeTotal), maxWidth);
  }
  const fits = (text: string): boolean =>
    typeof ctx.measureText === 'function'
      ? ctx.measureText(text).width <= maxWidth
      : text.length <= 6;

  try {
    const compact1 = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(safeTotal);
    if (fits(compact1)) return compact1;

    const compact0 = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 0,
    }).format(safeTotal);
    if (fits(compact0)) return compact0;
  } catch {
    // Fallback to universal compact format when Intl compact notation is unavailable
  }

  return truncateText(ctx, formatShortCompact(safeTotal), maxWidth);
}

export function drawBattleReportCard(
  ctx: CanvasRenderingContext2D,
  data: ReportCardData,
  labels: ExtensionMessages['history']['report'],
  locale: SupportedLocale,
  options?: {
    iconImage?: CanvasImageSource | null;
    width?: number;
    height?: number;
  }
) {
  const W = options?.width ?? REPORT_CARD_WIDTH;
  const H = options?.height ?? REPORT_CARD_HEIGHT;
  const P = REPORT_CARD_PALETTE;
  const fontFamily =
    "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif";

  // 1. Always-light outer background
  ctx.fillStyle = P.canvasBg;
  ctx.fillRect(0, 0, W, H);

  // 2. Main elevated light card
  const pad = 32;
  const cardX = pad;
  const cardY = pad;
  const cardW = W - pad * 2;
  const cardH = H - pad * 2;

  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fillStyle = P.cardBg;
  ctx.fill();
  ctx.strokeStyle = P.cardBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Top subtle accent bar
  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.clip();
  ctx.fillStyle = P.brandGreen;
  ctx.fillRect(cardX, cardY, cardW, 5);
  ctx.restore();

  // 3. Header (Brand icon + title + date range pill)
  const contentX = cardX + 36;
  const contentRight = cardX + cardW - 36;
  const contentW = contentRight - contentX;
  const headerY = cardY + 34;

  let iconDrawn = false;
  if (options?.iconImage) {
    try {
      ctx.drawImage(options.iconImage, contentX, headerY, 44, 44);
      iconDrawn = true;
    } catch {
      iconDrawn = false;
    }
  }

  // Date range pill on top-right (measure first so header text never collides with pill)
  const rangeText = data.dateRangeLabel;
  ctx.font = `600 13px ${fontFamily}`;
  const pillW = Math.max(
    118,
    (typeof ctx.measureText === 'function'
      ? ctx.measureText(rangeText).width
      : 90) + 28
  );
  const pillX = contentRight - pillW;
  const pillY = headerY + 8;

  const titleX = iconDrawn ? contentX + 58 : contentX;
  const headerTextMaxW = Math.max(200, pillX - titleX - 16);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = P.textPrimary;
  ctx.font = `700 24px ${fontFamily}`;
  ctx.fillText(
    truncateText(ctx, labels.cardTitle, headerTextMaxW),
    titleX,
    headerY + 22
  );

  ctx.fillStyle = P.textMuted;
  ctx.font = `500 14px ${fontFamily}`;
  ctx.fillText(
    truncateText(ctx, labels.cardSubtitle, headerTextMaxW),
    titleX,
    headerY + 42
  );

  drawRoundedRect(ctx, pillX, pillY, pillW, 28, 14);
  ctx.fillStyle = P.brandGreenSoft;
  ctx.fill();
  ctx.fillStyle = P.brandGreen;
  ctx.font = `600 13px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rangeText, pillX + pillW / 2, pillY + 14.5);

  // 4. Three KPI stat cards
  const kpiY = headerY + 68;
  const kpiGap = 18;
  const kpiW = (contentW - kpiGap * 2) / 3;
  const kpiH = 102;
  const kpis = [
    {
      label: labels.totalCleanedLabel,
      value: formatCount(safeNonNegInt(data.totalBlocked), locale),
      accent: true,
    },
    {
      label: labels.sevenDayCleanedLabel,
      value: formatCount(safeNonNegInt(data.sevenDayBlocked), locale),
      accent: false,
    },
    {
      label: labels.adsHiddenLabel,
      value: formatCount(safeNonNegInt(data.totalAdsHidden), locale),
      accent: false,
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = contentX + idx * (kpiW + kpiGap);
    drawRoundedRect(ctx, x, kpiY, kpiW, kpiH, 14);
    ctx.fillStyle = kpi.accent ? P.brandGreenSoft : P.canvasBg;
    ctx.fill();
    ctx.strokeStyle = kpi.accent ? '#BFE3CF' : P.cardBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = P.textMuted;
    ctx.font = `500 13px ${fontFamily}`;
    ctx.fillText(truncateText(ctx, kpi.label, kpiW - 36), x + 18, kpiY + 30);

    ctx.fillStyle = kpi.accent ? P.brandGreen : P.textPrimary;
    ctx.font = `700 34px ${fontFamily}`;
    ctx.fillText(truncateText(ctx, kpi.value, kpiW - 36), x + 18, kpiY + 76);
  });

  // 5. Lower two-column section: 7-Day Trend (left) + Top 3 Reasons (right)
  const lowerY = kpiY + kpiH + 22;
  const lowerH = 224;
  const colGap = 18;
  const leftW = Math.round(contentW * 0.52);
  const rightW = contentW - leftW - colGap;
  const rightX = contentX + leftW + colGap;

  // Left panel: 7-Day Activity
  drawRoundedRect(ctx, contentX, lowerY, leftW, lowerH, 14);
  ctx.fillStyle = P.canvasBg;
  ctx.fill();
  ctx.strokeStyle = P.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = P.textPrimary;
  ctx.font = `600 15px ${fontFamily}`;
  ctx.fillText(
    truncateText(ctx, labels.trendHeading, leftW - 36),
    contentX + 20,
    lowerY + 30
  );

  const bars = data.dailyHistory.slice(-7);
  const maxDayTotal = Math.max(
    1,
    ...bars.map((b) => safeNonNegInt(b.blocked) + safeNonNegInt(b.ads))
  );
  const chartX = contentX + 20;
  const chartW = leftW - 40;
  const chartTop = lowerY + 56;
  const chartH = 122;
  const slotW = bars.length ? chartW / bars.length : chartW;
  const barW = Math.min(28, Math.max(12, Math.floor(slotW * 0.48)));

  bars.forEach((day, idx) => {
    const cx = chartX + idx * slotW + slotW / 2;
    const blocked = safeNonNegInt(day.blocked);
    const ads = safeNonNegInt(day.ads);
    const total = blocked + ads;
    const totalBarH = total > 0 ? Math.max(8, (total / maxDayTotal) * chartH) : 4;
    const blockedH = total > 0 ? (blocked / total) * totalBarH : 0;
    const adsH = total > 0 ? totalBarH - blockedH : 0;
    const baseBottom = chartTop + chartH;

    // Background track
    drawRoundedRect(ctx, cx - barW / 2, chartTop, barW, chartH, 6);
    ctx.fillStyle = P.barTrack;
    ctx.fill();

    if (total > 0) {
      if (adsH > 0) {
        drawRoundedRect(
          ctx,
          cx - barW / 2,
          baseBottom - totalBarH,
          barW,
          totalBarH,
          6
        );
        ctx.fillStyle = P.adsBar;
        ctx.fill();
      }
      if (blockedH > 0) {
        drawRoundedRect(
          ctx,
          cx - barW / 2,
          baseBottom - blockedH,
          barW,
          blockedH,
          adsH > 0 ? 4 : 6
        );
        ctx.fillStyle = P.brandGreen;
        ctx.fill();
      }
      ctx.fillStyle = P.textMuted;
      ctx.font = `600 11px ${fontFamily}`;
      ctx.textAlign = 'center';
      const maxBarLabelW = Math.max(0, slotW - 4);
      const barLabel = formatBarCount(ctx, total, locale, maxBarLabelW);
      ctx.fillText(
        barLabel,
        cx,
        Math.max(chartTop - 6, baseBottom - totalBarH - 6),
        maxBarLabelW
      );
    }

    ctx.fillStyle =
      idx === bars.length - 1 ? P.brandGreen : P.textMuted;
    ctx.font = `${idx === bars.length - 1 ? '700' : '500'} 11px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(formatShortDate(day.date), cx, baseBottom + 20);
  });

  // Right panel: Top 3 Filter Reasons
  drawRoundedRect(ctx, rightX, lowerY, rightW, lowerH, 14);
  ctx.fillStyle = P.canvasBg;
  ctx.fill();
  ctx.strokeStyle = P.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = P.textPrimary;
  ctx.font = `600 15px ${fontFamily}`;
  ctx.fillText(
    truncateText(ctx, labels.topReasonsHeading, rightW - 36),
    rightX + 20,
    lowerY + 30
  );

  if (data.topReasons.length === 0) {
    ctx.fillStyle = P.textMuted;
    ctx.font = `500 14px ${fontFamily}`;
    ctx.fillText(
      truncateText(ctx, labels.noReasonsYet, rightW - 40),
      rightX + 20,
      lowerY + 115
    );
  } else {
    const maxReason = Math.max(1, safeNonNegInt(data.topReasons[0]?.count));
    data.topReasons.forEach((reason, idx) => {
      const rowY = lowerY + 56 + idx * 52;
      const trackX = rightX + 20;
      const trackW = rightW - 40;
      const reasonCount = safeNonNegInt(reason.count);
      const pct = Number.isFinite(reason.share)
        ? Math.min(100, Math.max(0, Math.round(reason.share * 100)))
        : 0;
      const rightLabel = `${formatCount(reasonCount, locale)} (${pct}%)`;

      ctx.font = `600 13px ${fontFamily}`;
      const rightLabelWidth =
        typeof ctx.measureText === 'function'
          ? ctx.measureText(rightLabel).width
          : rightLabel.length * 8;
      const leftMaxWidth = Math.max(0, trackW - rightLabelWidth - 12);

      ctx.textAlign = 'left';
      ctx.fillStyle = P.textPrimary;
      ctx.font = `600 13.5px ${fontFamily}`;
      ctx.fillText(
        truncateText(ctx, `${idx + 1}. ${reason.label}`, leftMaxWidth),
        trackX,
        rowY + 12
      );

      ctx.textAlign = 'right';
      ctx.fillStyle = P.textMuted;
      ctx.font = `600 13px ${fontFamily}`;
      ctx.fillText(rightLabel, trackX + trackW, rowY + 12);

      drawRoundedRect(ctx, trackX, rowY + 22, trackW, 10, 5);
      ctx.fillStyle = P.barTrack;
      ctx.fill();

      const fillW = Math.min(
        trackW,
        Math.max(10, (reasonCount / maxReason) * trackW)
      );
      drawRoundedRect(ctx, trackX, rowY + 22, fillW, 10, 5);
      ctx.fillStyle =
        reason.ruleId === 'promoted_ad' ? P.adsBar : P.brandGreen;
      ctx.fill();
    });
  }

  // 6. Footer with mandatory keepxclean.com watermark
  const footerY = cardY + cardH - 22;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = P.textMuted;
  ctx.font = `500 12.5px ${fontFamily}`;
  ctx.fillText(
    truncateText(ctx, labels.footerNote, contentW - 180),
    contentX,
    footerY
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = P.brandGreen;
  ctx.font = `700 14px ${fontFamily}`;
  ctx.fillText(SITE_DOMAIN, contentRight, footerY);
}

function loadBrandIcon(): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 1500);
    img.onload = () => {
      clearTimeout(timer);
      finish(img.naturalWidth > 0 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    try {
      img.src = runtimeUrl('icon/icon-128.png');
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

export async function renderBattleReportPng(
  stats: Stats,
  m: ExtensionMessages,
  locale: SupportedLocale
): Promise<{ dataUrl: string; blob: Blob }> {
  const canvas = document.createElement('canvas');
  canvas.width = REPORT_CARD_WIDTH;
  canvas.height = REPORT_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(m.history.report.renderError);
  }
  const iconImage = await loadBrandIcon();
  const data = buildReportCardData(stats, m.history.ruleLabels);
  drawBattleReportCard(ctx, data, m.history.report, locale, { iconImage });
  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error(m.history.report.renderError));
      }, 'image/png');
    } else {
      reject(new Error(m.history.report.renderError));
    }
  });
  return { dataUrl, blob };
}
