import { useState, useSyncExternalStore } from 'react';
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
} from '@keepxclean/shared';
import { formatCount, useI18n, type ExtensionMessages } from '../i18n';
import { openOptions } from '../services/client';
import { useApp } from '../state/store';
import {
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
} from '../ui/components';
import { QuickControls } from '../features/quick-controls/QuickControls';
import { ImportWizard } from '../features/accounts/ImportWizard';
import { OperationToasts } from '../features/history/Operations';
import type { DomController, InlineItem } from './dom-controller';
import { UID } from '../services/validation';

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
      !config.localBlocklistUids[item.author?.restId || ''] &&
      config.localBlocklistUids[sec.restId]
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

function Inline({ item, open }: { item: InlineItem; open: () => void }) {
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
    const whitelisted = Boolean(data?.config.whitelistUids[author.restId]);
    const localBlocked = Boolean(
      data?.config.localBlocklistUids[author.restId]
    );
    const crowdCount = data?.snapshot.counts[author.restId]?.c ?? 0;
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
  const [drawer, setDrawer] = useState(false),
    [importing, setImporting] = useState(false);
  return (
    <>
      <div className="kxc-root" style={{ background: 'transparent' }}>
        {items.map((item) =>
          createPortal(
            <Inline item={item} open={() => setDrawer(true)} />,
            item.container,
            item.id
          )
        )}
        <OperationToasts />
        {state.saveError && !drawer && (
          <div className="toast-region">
            <SaveError />
          </div>
        )}
        {drawer && (
          <Modal
            title={m.content.drawerTitle}
            description={m.content.drawerDesc}
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
