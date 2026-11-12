import { useState } from 'react';
import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  Feather,
  Hash,
  Languages,
  Magnet,
  MegaphoneOff,
  MessageCircle,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Type,
  Users,
  UserRoundCheck,
} from 'lucide-react';
import {
  TWEET_LANGUAGE_CODES,
  getTweetLanguageLabel,
  type FilterConfig,
  type FilterRulesConfig,
  type KeywordRuleItem,
} from '@keepxclean/shared';
import { formatCount, getI18n, useI18n } from '../../i18n';
import { mutate, useApp } from '../../state/store';
import {
  Banner,
  Button,
  NumberField,
  Page,
  Panel,
  perform,
  Pill,
  ReloadXButton,
  Segmented,
  Setting,
  Switch,
} from '../../ui/components';

export const ruleDefinitions = [
  { key: 'replySpam', icon: MessageCircle },
  { key: 'engagementBait', icon: Magnet },
  { key: 'highFrequency', icon: Activity },
  { key: 'crowdBlock', icon: Users },
  { key: 'keywords', icon: Type },
  { key: 'tagSpam', icon: Hash },
  { key: 'accountQuality', icon: UserRoundCheck },
  { key: 'languageFilter', icon: Languages },
  { key: 'hidePromotedAds', icon: MegaphoneOff },
] as const;

export function summarizeRule(
  key: keyof FilterRulesConfig,
  config: FilterConfig,
  cloudKeywords: KeywordRuleItem[] = []
): string {
  const { m, locale } = getI18n(config.locale);
  const rules = config.rules;
  if (!rules[key].enabled && key !== 'keywords') {
    return m.rules.summary.disabled;
  }
  switch (key) {
    case 'replySpam': {
      const r = rules.replySpam;
      const parts: string[] = [];
      if (r.detectImpersonation) parts.push(m.rules.summary.impersonation);
      if (r.blockShortOrEmoji)
        parts.push(
          m.rules.summary.shortReply(
            r.minWeightedLength,
            Math.ceil(r.minWeightedLength / 2)
          )
        );
      if (r.blockBioLinkSpam)
        parts.push(
          m.rules.summary.bioLink(formatCount(r.bioLinkMaxFollowers, locale))
        );
      if (r.blockPureMediaReplies) parts.push(m.rules.summary.pureMedia);
      return parts.length
        ? parts.join(' · ')
        : m.rules.summary.enabledSelectItems;
    }
    case 'engagementBait': {
      const r = rules.engagementBait;
      const parts: string[] = [];
      if (r.blockCommentGiveaway) parts.push(m.rules.summary.giveaway);
      if (r.blockFollowBack) parts.push(m.rules.summary.followBack);
      return parts.length
        ? m.rules.summary.engagementPrefix(parts.join(' · '))
        : m.rules.summary.enabledSelectItems;
    }
    case 'highFrequency': {
      const r = rules.highFrequency;
      return m.rules.summary.highFreq(
        r.maxDailyTweets,
        r.slidingWindowEnabled,
        r.slidingWindowHours,
        r.slidingWindowMaxTweets
      );
    }
    case 'crowdBlock':
      return m.rules.summary.crowdBlock(rules.crowdBlock.minBlockCount);
    case 'keywords': {
      const activeLocal = rules.keywords.items.filter((k) => k.enabled).length;
      const localPart = rules.keywords.enabled
        ? m.rules.summary.keywordsLocalOn(activeLocal)
        : m.rules.summary.keywordsLocalOff;
      const disabledCloudSet = new Set(config.disabledCloudKeywordIds);
      const totalCloud = cloudKeywords.filter((k) => k.enabled).length;
      const activeCloud = cloudKeywords.filter(
        (k) => k.enabled && !disabledCloudSet.has(k.id)
      ).length;
      const cloudPart = config.enableCloudKeywords
        ? activeCloud === totalCloud
          ? m.rules.summary.keywordsCloudAll(activeCloud)
          : m.rules.summary.keywordsCloudPartial(activeCloud, totalCloud)
        : m.rules.summary.keywordsCloudOff;
      return `${localPart} · ${cloudPart}`;
    }
    case 'tagSpam':
      return m.rules.summary.tagSpam(
        rules.tagSpam.maxHashtags,
        rules.tagSpam.maxCashtags
      );
    case 'accountQuality': {
      const r = rules.accountQuality;
      const parts: string[] = [];
      if (r.minAccountAgeDays > 0)
        parts.push(m.rules.summary.minAge(r.minAccountAgeDays));
      if (r.blockDefaultAvatarInReplies)
        parts.push(m.rules.summary.defaultAvatar);
      parts.push(m.rules.summary.followRatio(r.maxFollowRatio));
      return parts.join(' · ');
    }
    case 'languageFilter': {
      const r = rules.languageFilter;
      if (!r.languages.length) {
        return m.rules.summary.langEmpty;
      }
      const labels = r.languages
        .map((code) => getTweetLanguageLabel(code, locale))
        .slice(0, 5);
      const sep = locale.startsWith('zh') || locale === 'ja' ? '、' : ', ';
      return m.rules.summary.langSummary(
        r.mode,
        labels.join(sep),
        r.languages.length,
        r.languages.length > 5
      );
    }
    case 'hidePromotedAds':
      return m.rules.summary.hideAds;
  }
}

export function Presets({ config }: { config: FilterConfig }) {
  const { m } = useI18n();
  const presets = [
    {
      id: 'light',
      title: m.presets.lightTitle,
      icon: Feather,
      desc: m.presets.lightDesc,
    },
    {
      id: 'standard',
      title: m.presets.standardTitle,
      badge: m.presets.standardBadge,
      icon: SlidersHorizontal,
      desc: m.presets.standardDesc,
    },
    {
      id: 'strict',
      title: m.presets.strictTitle,
      icon: Sparkles,
      desc: m.presets.strictDesc,
    },
  ] as const;
  return (
    <div className="presets">
      {presets.map((p) => (
        <button
          type="button"
          className="preset"
          key={p.id}
          aria-pressed={config.preset === p.id}
          onClick={() => perform({ type: 'config.preset', preset: p.id })}
        >
          <span className="row">
            <p.icon size={16} />
            <strong>{p.title}</strong>
            {'badge' in p && p.badge && <Pill>{p.badge}</Pill>}
            {config.preset === p.id && (
              <Check className="preset-mark" size={15} />
            )}
          </span>
          <p>{p.desc}</p>
        </button>
      ))}
    </div>
  );
}

export function Presentation({
  config,
  onChanged,
}: {
  config: FilterConfig;
  onChanged?: () => void;
}) {
  const { m } = useI18n();
  return (
    <Segmented
      label={m.presets.presentationLabel}
      value={config.interceptionMode}
      options={[
        { value: 'collapse', label: m.presets.modeCollapse },
        { value: 'strip', label: m.presets.modeStrip },
      ]}
      onChange={(interceptionMode) => {
        if (interceptionMode !== config.interceptionMode) {
          perform({ type: 'config.patch', patch: { interceptionMode } });
          onChanged?.();
        }
      }}
    />
  );
}

export function rulePatch(
  key: keyof FilterRulesConfig,
  field: string,
  value: number | boolean | string | string[]
) {
  return mutate({
    type: 'config.patch',
    patch: { rules: { [key]: { [field]: value } } },
  });
}

export function RulesPage() {
  const { data } = useApp();
  const { m, locale } = useI18n();
  const { config, snapshot } = data!;
  const [expanded, setExpanded] = useState<string | null>(
    new URLSearchParams(location.hash.split('?')[1]).get('rule')
  );
  const [modeChanged, setModeChanged] = useState(false);

  const numericFields: Partial<
    Record<
      keyof FilterRulesConfig,
      {
        field: string;
        title: string;
        unit?: string;
        min?: number;
        step?: number;
        max?: number;
      }[]
    >
  > = {
    replySpam: [
      {
        field: 'minWeightedLength',
        title: m.rules.fields.minWeightedLength.title,
        unit: m.rules.fields.minWeightedLength.unit,
        min: 1,
        max: 24,
      },
      {
        field: 'bioLinkMaxFollowers',
        title: m.rules.fields.bioLinkMaxFollowers.title,
        unit: m.rules.fields.bioLinkMaxFollowers.unit,
        min: 0,
        step: 50,
        max: 5000,
      },
    ],
    highFrequency: [
      {
        field: 'maxDailyTweets',
        title: m.rules.fields.maxDailyTweets.title,
        unit: m.rules.fields.maxDailyTweets.unit,
        max: 150,
        step: 0.1,
      },
      {
        field: 'slidingWindowHours',
        title: m.rules.fields.slidingWindowHours.title,
        unit: m.rules.fields.slidingWindowHours.unit,
        min: 0.1,
        step: 0.1,
      },
      {
        field: 'slidingWindowMaxTweets',
        title: m.rules.fields.slidingWindowMaxTweets.title,
        unit: m.rules.fields.slidingWindowMaxTweets.unit,
        max: 25,
      },
    ],
    crowdBlock: [
      {
        field: 'minBlockCount',
        title: m.rules.fields.minBlockCount.title,
        unit: m.rules.fields.minBlockCount.unit,
        min: 1,
        max: 20,
      },
    ],
    tagSpam: [
      {
        field: 'maxHashtags',
        title: m.rules.fields.maxHashtags.title,
        unit: m.rules.fields.maxHashtags.unit,
        max: 20,
      },
      {
        field: 'maxCashtags',
        title: m.rules.fields.maxCashtags.title,
        unit: m.rules.fields.maxCashtags.unit,
        max: 20,
      },
    ],
    accountQuality: [
      {
        field: 'minAccountAgeDays',
        title: m.rules.fields.minAccountAgeDays.title,
        unit: m.rules.fields.minAccountAgeDays.unit,
        max: 90,
      },
      {
        field: 'maxFollowRatio',
        title: m.rules.fields.maxFollowRatio.title,
        unit: m.rules.fields.maxFollowRatio.unit,
        step: 0.1,
      },
      {
        field: 'minFollowingForRatioCheck',
        title: m.rules.fields.minFollowingForRatioCheck.title,
        unit: m.rules.fields.minFollowingForRatioCheck.unit,
      },
    ],
  };

  const booleanFields: Partial<
    Record<keyof FilterRulesConfig, { field: string; title: string }[]>
  > = {
    replySpam: [
      {
        field: 'detectImpersonation',
        title: m.rules.fields.detectImpersonation,
      },
      { field: 'blockShortOrEmoji', title: m.rules.fields.blockShortOrEmoji },
      { field: 'blockBioLinkSpam', title: m.rules.fields.blockBioLinkSpam },
      {
        field: 'blockPureMediaReplies',
        title: m.rules.fields.blockPureMediaReplies,
      },
    ],
    engagementBait: [
      {
        field: 'blockCommentGiveaway',
        title: m.rules.fields.blockCommentGiveaway,
      },
      { field: 'blockFollowBack', title: m.rules.fields.blockFollowBack },
    ],
    highFrequency: [
      {
        field: 'slidingWindowEnabled',
        title: m.rules.fields.slidingWindowEnabled,
      },
    ],
    accountQuality: [
      {
        field: 'blockDefaultAvatarInReplies',
        title: m.rules.fields.blockDefaultAvatarInReplies,
      },
    ],
  };

  return (
    <Page
      title={m.rules.pageTitle}
      description={m.rules.pageDesc}
      action={
        <div className="row" style={{ gap: 8 }}>
          {config.preset === 'custom' ? (
            <>
              <Pill kind="neutral">{m.presets.customBadge}</Pill>
              <Button
                variant="sm"
                onClick={() =>
                  perform({ type: 'config.preset', preset: 'standard' })
                }
              >
                <RotateCcw size={13} />
                {m.presets.restoreStandard}
              </Button>
            </>
          ) : (
            <Pill>{m.presets.liveBadge}</Pill>
          )}
        </div>
      }
    >
      {!config.enabled && (
        <Banner
          kind="warning"
          action={
            <div className="row" style={{ gap: 8 }}>
              <ReloadXButton />
              <Button
                variant="primary sm"
                onClick={() =>
                  perform({ type: 'config.patch', patch: { enabled: true } })
                }
              >
                <Play size={13} />
                {m.rules.resumeCleaning}
              </Button>
            </div>
          }
        >
          {m.rules.pausedBanner}
        </Banner>
      )}

      <div className={!config.enabled ? 'stack paused-dim' : 'stack'}>
        <Panel title={m.rules.strengthTitle} description={m.rules.strengthDesc}>
          <Presets config={config} />
          <Setting
            title={m.rules.presentationTitle}
            description={m.rules.presentationDesc}
          >
            <div className="row" style={{ gap: 8 }}>
              {modeChanged && <ReloadXButton label={m.common.reloadXApply} />}
              <Presentation
                config={config}
                onChanged={() => setModeChanged(true)}
              />
            </div>
          </Setting>
        </Panel>

        <div className="row between">
          <h2>{m.rules.dimensionsHeading}</h2>
          <span className="small muted">
            {m.rules.enabledCount(
              ruleDefinitions.filter((r) => config.rules[r.key].enabled).length,
              ruleDefinitions.length
            )}
          </span>
        </div>

        <div className="rule-list">
          {ruleDefinitions.map((rule) => {
            const def = m.rules.defs[rule.key];
            const open = expanded === rule.key;
            const ruleEnabled = config.rules[rule.key].enabled;
            const values = config.rules[rule.key] as unknown as Record<
              string,
              number | boolean
            >;
            return (
              <section
                className="rule-item"
                key={rule.key}
                data-disabled={String(!ruleEnabled)}
              >
                <div className="rule-summary">
                  <button
                    type="button"
                    className="rule-open"
                    aria-expanded={open}
                    aria-controls={`rule-${rule.key}`}
                    onClick={() => setExpanded(open ? null : rule.key)}
                  >
                    <span className="rule-icon">
                      <rule.icon size={19} />
                    </span>
                    <span className="grow">
                      <h3>{def.title}</h3>
                      <span className="small muted">
                        {summarizeRule(
                          rule.key,
                          config,
                          snapshot.cloudKeywords
                        )}
                      </span>
                    </span>
                  </button>
                  <Switch
                    label={m.rules.enableRule(def.title)}
                    checked={ruleEnabled}
                    onChange={(value) =>
                      void rulePatch(rule.key, 'enabled', value).catch(
                        () => undefined
                      )
                    }
                  />
                  <button
                    type="button"
                    className="rule-chevron"
                    aria-label={m.rules.expandParams(open, def.title)}
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : rule.key)}
                  >
                    {open ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </button>
                </div>
                {open && (
                  <div id={`rule-${rule.key}`} className="rule-detail stack">
                    {numericFields[rule.key] && (
                      <div className="detail-grid">
                        {numericFields[rule.key]!.map((field) => (
                          <NumberField
                            key={field.field}
                            label={field.title}
                            value={Number(values[field.field])}
                            min={field.min}
                            step={field.step}
                            sliderMax={field.max}
                            unit={field.unit}
                            onCommit={(value) =>
                              rulePatch(rule.key, field.field, value)
                            }
                          />
                        ))}
                      </div>
                    )}
                    {booleanFields[rule.key]?.map((field) => (
                      <Setting key={field.field} title={field.title}>
                        <Switch
                          label={field.title}
                          checked={Boolean(values[field.field])}
                          onChange={(value) =>
                            void rulePatch(rule.key, field.field, value).catch(
                              () => undefined
                            )
                          }
                        />
                      </Setting>
                    ))}
                    {rule.key === 'languageFilter' && (
                      <div className="stack-sm">
                        <Setting
                          title={m.rules.langModeTitle}
                          description={m.rules.langModeDesc}
                        >
                          <Segmented
                            label={m.rules.langModeTitle}
                            value={config.rules.languageFilter.mode}
                            options={[
                              { value: 'allow', label: m.rules.langModeAllow },
                              { value: 'block', label: m.rules.langModeBlock },
                            ]}
                            onChange={(mode) => {
                              if (mode !== config.rules.languageFilter.mode) {
                                void rulePatch(
                                  'languageFilter',
                                  'mode',
                                  mode
                                ).catch(() => undefined);
                              }
                            }}
                          />
                        </Setting>
                        <div className="stack-sm" style={{ gap: 8 }}>
                          <div className="row between wrap" style={{ gap: 8 }}>
                            <span
                              className="field-label"
                              style={{ marginBottom: 0 }}
                            >
                              {config.rules.languageFilter.mode === 'allow'
                                ? m.rules.langAllowHeading
                                : m.rules.langBlockHeading}
                            </span>
                            <span className="small muted">
                              {m.rules.langSelectedCount(
                                config.rules.languageFilter.languages.length
                              )}
                            </span>
                          </div>
                          <div
                            className="lang-grid"
                            role="group"
                            aria-label={m.rules.langGridAria}
                          >
                            {TWEET_LANGUAGE_CODES.map((code) => {
                              const active =
                                config.rules.languageFilter.languages.includes(
                                  code
                                );
                              return (
                                <button
                                  type="button"
                                  key={code}
                                  className="lang-chip"
                                  aria-pressed={active}
                                  onClick={() => {
                                    const current =
                                      config.rules.languageFilter.languages;
                                    const next = active
                                      ? current.filter((c) => c !== code)
                                      : [...current, code];
                                    void rulePatch(
                                      'languageFilter',
                                      'languages',
                                      next
                                    ).catch(() => undefined);
                                  }}
                                >
                                  <span>
                                    {getTweetLanguageLabel(code, locale)}
                                  </span>
                                  <span className="lang-code">{code}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                    <Banner>{def.note}</Banner>
                    {rule.key === 'keywords' && (
                      <div>
                        <a className="btn sm" href="#/keywords">
                          {m.rules.manageKeywordsLink}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <Panel title={m.rules.exemptionsTitle} description={m.rules.exemptionsDesc}>
          <Setting
            title={m.rules.exemptFollowingTitle}
            description={m.rules.exemptFollowingDesc}
          >
            <Switch
              label={m.rules.exemptFollowingTitle}
              checked={config.exemptFollowing}
              onChange={(exemptFollowing) =>
                perform({ type: 'config.patch', patch: { exemptFollowing } })
              }
            />
          </Setting>
          <Setting
            title={m.rules.profileBadgeOnlyTitle}
            description={m.rules.profileBadgeOnlyDesc}
          >
            <Switch
              label={m.rules.profileBadgeOnlyTitle}
              checked={config.profileSceneBadgeOnly}
              onChange={(profileSceneBadgeOnly) =>
                perform({
                  type: 'config.patch',
                  patch: { profileSceneBadgeOnly },
                })
              }
            />
          </Setting>
        </Panel>
      </div>
    </Page>
  );
}
