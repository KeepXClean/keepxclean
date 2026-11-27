import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  Ban,
  Download,
  UserRoundCheck,
} from 'lucide-react';
import type {
  ExtractedAuthor,
  FilterConfig,
  InterceptionDecision,
  MatchedTarget,
  TriggeredRuleId,
} from '@keepxclean/shared';
import { formatCount, useI18n, type ExtensionMessages } from '../i18n';
import { disableMatchedTarget, openOptions } from '../services/client';
import { useApp } from '../state/store';
import {
  Banner,
  BrandIcon,
  Button,
  Loading,
  LoadError,
  Modal,
  perform,
  Pill,
  SaveError,
  SaveStatus,
  Switch,
  ThemeCycleButton,
} from '../ui/components';
import { resolveThemeSetting } from '../ui/theme';
import { QuickControls } from '../features/quick-controls/QuickControls';
import { OnboardingCard } from '../features/quick-controls/OnboardingCard';
import { ParseHealthBanner } from '../features/quick-controls/ParseHealthBanner';
import { ImportWizard } from '../features/accounts/ImportWizard';
import { OperationToasts } from '../features/history/Operations';
import type { DomController, InlineItem } from './dom-controller';
import { UID } from '../services/validation';
import { PROTO_POLLUTION_KEYS } from '../services/schema';

const SAFE_QUERY_VALUE_RE = /^[a-zA-Z0-9_.:-]{1,200}$/;

const RULE_TARGET_TO_OPTIONS: Record<
  string,
  { page: string; query?: Record<string, string> }
> = {
  local_blocklist: { page: 'accounts' },
  rule_pack: { page: 'keywords', query: { tab: 'packs' } },
  keywords: { page: 'keywords', query: { tab: 'custom' } },
  domainFilter: { page: 'rules', query: { focus: 'domainFilter' } },
  crowdBlock: { page: 'rules', query: { focus: 'crowdBlock' } },
  highFrequency: { page: 'rules', query: { focus: 'highFrequency' } },
  replySpam: { page: 'rules', query: { focus: 'replySpam' } },
  engagementBait: { page: 'rules', query: { focus: 'engagementBait' } },
  tagSpam: { page: 'rules', query: { focus: 'tagSpam' } },
  accountQuality: { page: 'rules', query: { focus: 'accountQuality' } },
  languageFilter: { page: 'rules', query: { focus: 'languageFilter' } },
  hidePromotedAds: { page: 'rules', query: { focus: 'hidePromotedAds' } },
  grokFilter: { page: 'rules', query: { focus: 'grokFilter' } },
};

const RULE_ID_FALLBACK: Record<
  TriggeredRuleId,
  { page: string; query?: Record<string, string> }
> = {
  local_blocklist: { page: 'accounts' },
  crowd_block: { page: 'rules', query: { focus: 'crowdBlock' } },
  high_frequency_daily: { page: 'rules', query: { focus: 'highFrequency' } },
  high_frequency_window: { page: 'rules', query: { focus: 'highFrequency' } },
  keyword: { page: 'keywords', query: { tab: 'custom' } },
  cloud_keyword: { page: 'keywords', query: { tab: 'cloud' } },
  reply_spam: { page: 'rules', query: { focus: 'replySpam' } },
  impersonation: { page: 'rules', query: { focus: 'replySpam' } },
  engagement_bait: { page: 'rules', query: { focus: 'engagementBait' } },
  tag_spam: { page: 'rules', query: { focus: 'tagSpam' } },
  account_quality: { page: 'rules', query: { focus: 'accountQuality' } },
  language_filter: { page: 'rules', query: { focus: 'languageFilter' } },
  promoted_ad: { page: 'rules', query: { focus: 'hidePromotedAds' } },
  grok_filter: { page: 'rules', query: { focus: 'grokFilter' } },
  domain_filter: { page: 'keywords', query: { tab: 'domains' } },
  rule_pack: { page: 'keywords', query: { tab: 'packs' } },
};

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isPrototypeKey(key: string): boolean {
  return PROTO_POLLUTION_KEYS.has(key) || hasOwn(Object.prototype, key);
}

function safeQueryVal(value?: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (
    !trimmed ||
    isPrototypeKey(trimmed) ||
    !SAFE_QUERY_VALUE_RE.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

export function resolveAdjustRuleTarget(
  decision?: InterceptionDecision
): { page: string; query?: Record<string, string> } {
  const target = decision?.matchedTarget;
  if (target) {
    const safeId = safeQueryVal(target.id);
    switch (target.kind) {
      case 'keyword':
        return {
          page: 'keywords',
          query: { tab: 'custom', ...(safeId ? { focus: safeId } : {}) },
        };
      case 'cloud_keyword':
        return {
          page: 'keywords',
          query: { tab: 'cloud', ...(safeId ? { focus: safeId } : {}) },
        };
      case 'domain':
        return {
          page: 'keywords',
          query: { tab: 'domains', ...(safeId ? { focus: safeId } : {}) },
        };
      case 'pack_item': {
        const safePack = safeQueryVal(target.packId);
        return {
          page: 'keywords',
          query: {
            tab: 'packs',
            ...(safePack ? { pack: safePack } : {}),
            ...(safeId ? { focus: safeId } : {}),
          },
        };
      }
      case 'rule':
        if (
          typeof target.id === 'string' &&
          hasOwn(RULE_TARGET_TO_OPTIONS, target.id)
        ) {
          return RULE_TARGET_TO_OPTIONS[target.id]!;
        }
        if (safeId) {
          return { page: 'rules', query: { focus: safeId } };
        }
        break;
    }
  }
  if (
    typeof decision?.ruleId === 'string' &&
    hasOwn(RULE_ID_FALLBACK, decision.ruleId)
  ) {
    return RULE_ID_FALLBACK[decision.ruleId];
  }
  return { page: 'rules' };
}

export function isDisableableMatchedTarget(
  target?: MatchedTarget
): target is MatchedTarget {
  if (
    !target ||
    typeof target !== 'object' ||
    typeof target.id !== 'string' ||
    !target.id.trim()
  ) {
    return false;
  }
  if (
    target.kind === 'keyword' ||
    target.kind === 'cloud_keyword' ||
    target.kind === 'domain'
  ) {
    return true;
  }
  if (target.kind === 'pack_item') {
    return (
      typeof target.packId === 'string' && target.packId.trim().length > 0
    );
  }
  return false;
}

function block(author: ExtractedAuthor) {
  perform({
    type: 'block.start',
    entry: {
      uid: author.restId,
      screenName: author.screenName,
      name: author.name,
      avatarUrl: author.avatarUrl,
      tag: 'other',
      addedAt: Date.now(),
    },
    followers: author.followersCount,
  });
}
function whitelist(author: ExtractedAuthor) {
  perform({
    type: 'account.save',
    list: 'white',
    entry: {
      uid: author.restId,
      screenName: author.screenName,
      name: author.name,
      avatarUrl: author.avatarUrl,
      addedAt: Date.now(),
    },
  });
}
function unblock(author: ExtractedAuthor) {
  perform({
    type: 'account.delete',
    list: 'black',
    uid: author.restId,
  });
}
const NUMERIC_UID_RE = /^\d{1,25}$/;
function hasOwnUid(
  map: Record<string, unknown> | undefined,
  uid: string | undefined
): boolean {
  return Boolean(
    map &&
      uid &&
      NUMERIC_UID_RE.test(uid) &&
      Object.prototype.hasOwnProperty.call(map, uid)
  );
}
function resolveActionTarget(
  item: InlineItem,
  config?: FilterConfig
): { target?: ExtractedAuthor; secondaryRelation?: 'retweet' | 'quote' } {
  const ruleId = item.decision?.ruleId;
  const hitUid = item.decision?.evidence?.find(
    (ev) => ev.key === 'hit_uid'
  )?.value;
  const candidates: Array<{
    author?: ExtractedAuthor;
    relation: 'retweet' | 'quote';
  }> = [
    { author: item.tweet?.retweetedAuthor, relation: 'retweet' },
    { author: item.tweet?.quotedAuthor, relation: 'quote' },
  ];
  for (const { author: sec, relation } of candidates) {
    if (!sec?.restId || sec.restId === item.author?.restId) continue;
    if (
      ruleId === 'local_blocklist' &&
      config &&
      !hasOwnUid(config.localBlocklistUids, item.author?.restId) &&
      hasOwnUid(config.localBlocklistUids, sec.restId)
    ) {
      return { target: sec, secondaryRelation: relation };
    }
    if (hitUid !== undefined && String(hitUid) === sec.restId) {
      return { target: sec, secondaryRelation: relation };
    }
  }
  return { target: item.author };
}
function compactReason(
  decision: InterceptionDecision | undefined,
  fallback: string
): string {
  const raw = decision?.reasonText || fallback;
  const cleaned = raw.replace(/\s*\(>\d+(?:\.\d+)?\)$/, '');
  const maxLen = /[\u3000-\u9fff\uac00-\ud7af]/.test(cleaned) ? 28 : 52;
  return cleaned.length > maxLen
    ? `${cleaned.slice(0, maxLen - 1)}…`
    : cleaned;
}
function formatAccountAge(
  days: number,
  contentMsg: ExtensionMessages['content']
): string {
  if (!Number.isFinite(days) || days <= 0) return contentMsg.ageUnknown;
  if (days < 30) return contentMsg.ageDays(Math.max(1, Math.floor(days)));
  if (days < 365)
    return contentMsg.ageMonths(Math.max(1, Math.floor(days / 30)));
  const years = (days / 365).toFixed(1).replace(/\.0$/, '');
  return contentMsg.ageYears(years);
}
function formatDailyRate(
  rate: number,
  contentMsg: ExtensionMessages['content']
): string {
  if (!Number.isFinite(rate) || rate < 0) return contentMsg.dailyRateZero;
  const formatted =
    rate >= 10 ? String(Math.round(rate)) : rate.toFixed(1).replace(/\.0$/, '');
  return contentMsg.dailyRate(formatted);
}

function Inline({
  item,
  open,
  onDisableTarget,
}: {
  item: InlineItem;
  open: () => void;
  onDisableTarget: (target: MatchedTarget) => void;
}) {
  const { data } = useApp();
  const { m, locale } = useI18n();
  if (item.kind === 'nav')
    return (
      <button
        type="button"
        className="inline-nav"
        aria-label={m.content.navButton}
        aria-haspopup="dialog"
        title={m.content.navButton}
        onClick={open}
      >
        <BrandIcon size={26} />
        <span>{m.content.navButton}</span>
      </button>
    );
  if (item.kind === 'quick') {
    if (!item.author || !UID.test(item.author.restId)) return null;
    return (
      <Button
        variant="ghost icon"
        className="inline-quick"
        data-grok-gap={item.hasGrokGap ? 'true' : undefined}
        aria-label={m.content.quickBlockAria(item.author.screenName)}
        title={m.content.quickBlockTitle(item.author.screenName)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          block(item.author!);
        }}
      >
        <Ban size={13} />
      </Button>
    );
  }
  if (item.kind === 'collapse') {
    const { target, secondaryRelation } = resolveActionTarget(
      item,
      data?.config
    );
    const isSecondaryTarget = Boolean(secondaryRelation);
    const relationLabel =
      secondaryRelation === 'retweet'
        ? m.content.relationRetweet
        : secondaryRelation === 'quote'
          ? m.content.relationQuote
          : undefined;
    const canManageTarget = Boolean(target && UID.test(target.restId));
    const isTargetBlocked = Boolean(
      canManageTarget && data?.config.localBlocklistUids[target!.restId]
    );
    const handle = item.author?.screenName || item.tweet?.author.screenName;
    const displayLabel =
      relationLabel && handle && target?.screenName
        ? `@${handle} ${relationLabel} @${target.screenName}`
        : handle
          ? `@${handle}`
          : m.content.collapsedFallback;
    const ruleId = item.decision?.ruleId;

    if (!item.expanded) {
      return (
        <button
          type="button"
          className="collapse-bar collapse-trigger"
          aria-expanded={false}
          title={item.decision?.reasonText}
          onClick={item.toggle}
        >
          <div className="collapse-main">
            <span className="collapse-icon">
              <BrandIcon size={14} />
            </span>
            <span className="collapse-text ellipsis">
              {displayLabel}
              <span className="collapse-sep">·</span>
              {compactReason(item.decision, m.content.matchedRuleFallback)}
            </span>
            <span className="grow" />
            <span className="collapse-hint">{m.content.expandHint}</span>
          </div>
        </button>
      );
    }

    return (
      <div className="collapse-bar" data-expanded="true">
        <div className="collapse-main">
          <button
            type="button"
            className="collapse-summary"
            aria-expanded={true}
            title={m.content.collapseTooltip}
            onClick={item.toggle}
          >
            <span className="collapse-icon">
              <BrandIcon size={14} />
            </span>
            <span className="collapse-text ellipsis">
              {displayLabel}
              <span className="collapse-sep">·</span>
              {item.decision?.reasonText || m.content.matchedRuleFallback}
            </span>
          </button>
          <div className="collapse-actions">
            <button
              type="button"
              className="collapse-btn"
              onClick={item.toggle}
            >
              {m.content.collapseHint}
            </button>
            {ruleId !== 'promoted_ad' && (
              <button
                type="button"
                className="collapse-btn"
                data-kxc-action="adjust"
                title={m.content.adjustRuleTitle}
                onClick={() => {
                  const dest = resolveAdjustRuleTarget(item.decision);
                  void openOptions(dest.page, dest.query).catch(
                    () => undefined
                  );
                }}
              >
                {m.content.adjustRuleBtn}
              </button>
            )}
            {ruleId !== 'promoted_ad' &&
              isDisableableMatchedTarget(item.decision?.matchedTarget) && (
              <button
                type="button"
                className="collapse-btn"
                data-kxc-action="disable"
                title={m.content.disableItemTitle}
                onClick={() => onDisableTarget(item.decision!.matchedTarget!)}
              >
                {m.content.disableItemBtn}
              </button>
            )}
            {ruleId !== 'promoted_ad' &&
              canManageTarget &&
              (ruleId === 'local_blocklist' || isTargetBlocked ? (
                <button
                  type="button"
                  className="collapse-btn"
                  title={m.content.unblockTargetTitle(target!.screenName)}
                  onClick={() => unblock(target!)}
                >
                  {isSecondaryTarget
                    ? m.content.unblockTargetSecondary(target!.screenName)
                    : m.content.unblockBtn}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="collapse-btn"
                    title={m.content.whitelistTargetTitle(target!.screenName)}
                    onClick={() => whitelist(target!)}
                  >
                    {isSecondaryTarget
                      ? m.content.whitelistTargetSecondary(target!.screenName)
                      : m.content.whitelistBtn}
                  </button>
                  <button
                    type="button"
                    className="collapse-btn danger"
                    aria-label={m.content.blockTargetAria(target!.screenName)}
                    title={m.content.blockTargetTitle(target!.screenName)}
                    onClick={() => block(target!)}
                  >
                    {isSecondaryTarget
                      ? m.content.blockTargetSecondary(target!.screenName)
                      : m.content.blockBtn}
                  </button>
                </>
              ))}
          </div>
        </div>
      </div>
    );
  }
  if (item.kind === 'profile' && item.author) {
    const author = item.author;
    const whitelisted = hasOwnUid(data?.config.whitelistUids, author.restId);
    const localBlocked = hasOwnUid(
      data?.config.localBlocklistUids,
      author.restId
    );
    const crowdCount = hasOwnUid(data?.snapshot.counts, author.restId)
      ? (data?.snapshot.counts[author.restId]?.c ?? 0)
      : 0;
    const badges = item.badges ?? [];
    const hasCrowdBadge = Boolean(item.hasCrowdBadge);
    const createdHint = author.createdAt
      ? m.content.createdHint(
          new Date(author.createdAt).toLocaleDateString(locale),
          author.restId
        )
      : `UID ${author.restId}`;

    return (
      <div className="profile-badges">
        <BrandIcon size={16} />
        <span className="profile-stat" title={createdHint}>
          {formatAccountAge(author.accountAgeDays, m.content)}
        </span>
        <span className="profile-dot">·</span>
        <span
          className="profile-stat"
          title={m.content.totalPostsHint(
            formatCount(author.statusesCount, locale)
          )}
        >
          {formatDailyRate(author.dailyTweetRate, m.content)}
        </span>
        {crowdCount > 0 && !hasCrowdBadge && (
          <>
            <span className="profile-dot">·</span>
            <span className="profile-stat">
              {m.content.communityCountStat(crowdCount)}
            </span>
          </>
        )}
        {badges.map((badge) => (
          <Pill kind="warning" key={badge}>
            {badge}
          </Pill>
        ))}
        {whitelisted && <Pill>{m.content.inWhitelistPill}</Pill>}
        {!whitelisted && !localBlocked && badges.length === 0 && (
          <Pill kind="neutral">{m.content.noAnomalyPill}</Pill>
        )}
        <span className="grow" />
        {item.isSelf ? (
          <Pill kind="neutral">{m.content.currentAccountPill}</Pill>
        ) : (
          <div className="profile-actions">
            {whitelisted ? (
              <Button
                variant="ghost sm"
                onClick={() =>
                  perform({
                    type: 'account.delete',
                    list: 'white',
                    uid: author.restId,
                  })
                }
              >
                {m.content.removeFromWhiteBtn}
              </Button>
            ) : (
              <Button variant="ghost sm" onClick={() => whitelist(author)}>
                <UserRoundCheck size={13} />
                {m.content.whitelistBtn}
              </Button>
            )}
            {localBlocked ? (
              <Button
                variant="ghost sm"
                onClick={() =>
                  perform({
                    type: 'account.delete',
                    list: 'black',
                    uid: author.restId,
                  })
                }
              >
                {m.content.unblockBtn}
              </Button>
            ) : (
              <Button
                variant="ghost sm"
                className="profile-block-btn"
                aria-label={m.content.cleanThisAccountAria}
                onClick={() => block(author)}
              >
                <Ban size={13} />
                {m.content.blockBtn}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }
  return null;
}
export function ContentApp({ controller }: { controller: DomController }) {
  const state = useApp();
  const { m } = useI18n();
  const items = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot
  );
  const xPageDark = useSyncExternalStore(
    controller.subscribeTheme,
    controller.isPageDark
  );
  const surfaceTheme = resolveThemeSetting(
    state.data?.config.theme,
    xPageDark
  );
  const [drawer, setDrawer] = useState(false),
    [importing, setImporting] = useState(false),
    [inlineNotice, setInlineNotice] = useState<{
      id: number;
      kind: 'success' | 'error';
      text: string;
    } | null>(null);

  useEffect(() => {
    if (!inlineNotice) return;
    const timer = setTimeout(() => {
      setInlineNotice((prev) => (prev?.id === inlineNotice.id ? null : prev));
    }, 3600);
    return () => clearTimeout(timer);
  }, [inlineNotice]);

  async function handleDisableTarget(target: MatchedTarget) {
    try {
      await disableMatchedTarget(target);
      setInlineNotice({
        id: Date.now(),
        kind: 'success',
        text: m.content.itemDisabledToast,
      });
    } catch {
      setInlineNotice({
        id: Date.now(),
        kind: 'error',
        text: m.content.itemDisableFailedToast,
      });
    }
  }

  return (
    <>
      <div
        className="kxc-root"
        data-theme={surfaceTheme}
        style={{ background: 'transparent' }}
      >
        {items.map((item) =>
          createPortal(
            <Inline
              item={item}
              open={() => setDrawer(true)}
              onDisableTarget={(target) => void handleDisableTarget(target)}
            />,
            item.container,
            item.id
          )
        )}
        <OperationToasts />
        {inlineNotice && (
          <div
            className="toast-region"
            data-kxc-inline-toast="true"
            style={{
              bottom: state.data?.operations.length ? 120 : 20,
            }}
          >
            <Banner
              kind={inlineNotice.kind}
              onDismiss={() => setInlineNotice(null)}
            >
              {inlineNotice.text}
            </Banner>
          </div>
        )}
        {state.saveError && !drawer && (
          <div className="toast-region">
            <SaveError />
          </div>
        )}
        {drawer && (
          <Modal
            title={m.content.drawerTitle}
            description={m.content.drawerDesc}
            headerAction={<ThemeCycleButton />}
            drawer
            onClose={() => setDrawer(false)}
            footer={
              <>
                <Button onClick={() => setImporting(true)}>
                  <Download size={14} />
                  {m.content.importXBlocklistBtn}
                </Button>
                <Button variant="primary" onClick={() => void openOptions()}>
                  {m.nav.fullSettings} <ArrowUpRight size={14} />
                </Button>
              </>
            }
          >
            {state.error ? (
              <LoadError error={state.error} />
            ) : !state.data ? (
              <Loading />
            ) : (
              <div className="stack" style={{ gap: 14 }}>
                <div
                  className="row between"
                  style={{
                    paddingBottom: 10,
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <h3>{m.content.enableCleanTitle}</h3>
                    <p className="small muted">{m.content.enableCleanDesc}</p>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <SaveStatus />
                    <Switch
                      label={m.content.enableCleanTitle}
                      checked={state.data.config.enabled}
                      onChange={(enabled) =>
                        perform({ type: 'config.patch', patch: { enabled } })
                      }
                    />
                  </div>
                </div>
                <SaveError />
                <ParseHealthBanner />
                <OnboardingCard onImport={() => setImporting(true)} />
                <QuickControls drawer />
              </div>
            )}
          </Modal>
        )}
        {importing && state.data && (
          <ImportWizard onClose={() => setImporting(false)} />
        )}
      </div>
    </>
  );
}
