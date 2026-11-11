import { useState } from 'react';
import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  Feather,
  Hash,
  ListFilter,
  MegaphoneOff,
  MessageCircle,
  SlidersHorizontal,
  Sparkles,
  Type,
  Users,
  UserRoundCheck,
} from 'lucide-react';
import type { FilterConfig, FilterRulesConfig } from '@keepxclean/shared';
import { mutate, useApp } from '../../state/store';
import {
  Banner,
  NumberField,
  Page,
  Panel,
  perform,
  Pill,
  Segmented,
  Setting,
  Switch,
} from '../../ui/components';

export const ruleDefinitions = [
  {
    key: 'highFrequency',
    title: '高频发帖过滤',
    description: '减少高频发布与短时间重复刷屏',
    icon: Activity,
  },
  {
    key: 'crowdBlock',
    title: '社区记录过滤',
    description: '参考社区快照，过滤达到门槛的账号',
    icon: Users,
  },
  {
    key: 'keywords',
    title: '自定义关键词',
    description: '按正文、简介、昵称与链接匹配',
    icon: Type,
  },
  {
    key: 'blueReplySpam',
    title: '蓝标回复过滤',
    description: '减少低粉蓝标与低质量短回复',
    icon: MessageCircle,
  },
  {
    key: 'tagSpam',
    title: '标签刷屏过滤',
    description: '限制过量的 Hashtag 与 Cashtag',
    icon: Hash,
  },
  {
    key: 'accountQuality',
    title: '账号质量过滤',
    description: '按注册时间、默认头像与关注比例筛选',
    icon: UserRoundCheck,
  },
  {
    key: 'hidePromotedAds',
    title: '隐藏推广广告',
    description: '隐藏 X 信息流中的原生推广内容',
    icon: MegaphoneOff,
  },
] as const;
export function Presets({ config }: { config: FilterConfig }) {
  const presets = [
    {
      id: 'light',
      title: '轻度降噪',
      icon: Feather,
      desc: '保留更多内容，只过滤明显干扰。',
    },
    {
      id: 'standard',
      title: '标准净空',
      icon: SlidersHorizontal,
      desc: '兼顾信息密度与阅读体验。',
    },
    {
      id: 'strict',
      title: '极致净空',
      icon: Sparkles,
      desc: '更严格的门槛，更专注的信息流。',
    },
  ] as const;
  return (
    <div className="presets">
      {presets.map((p) => (
        <button
          className="preset"
          key={p.id}
          aria-pressed={config.preset === p.id}
          onClick={() => perform({ type: 'config.preset', preset: p.id })}
        >
          <span className="row">
            <p.icon size={17} />
            <strong>{p.title}</strong>
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
export function Presentation({ config }: { config: FilterConfig }) {
  return (
    <Segmented
      label="过滤后呈现方式"
      value={config.interceptionMode}
      options={[
        { value: 'strip', label: '直接隐藏' },
        { value: 'collapse', label: '折叠提示' },
      ]}
      onChange={(interceptionMode) =>
        perform({ type: 'config.patch', patch: { interceptionMode } })
      }
    />
  );
}
export function rulePatch(
  key: keyof FilterRulesConfig,
  field: string,
  value: number | boolean
) {
  return mutate({
    type: 'config.patch',
    patch: { rules: { [key]: { [field]: value } } },
  });
}
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
  highFrequency: [
    {
      field: 'maxDailyTweets',
      title: '历史日均上限',
      unit: '条 / 天',
      max: 150,
      step: 0.1,
    },
    {
      field: 'slidingWindowHours',
      title: '观察时间窗口',
      unit: '小时',
      min: 0.1,
      step: 0.1,
    },
    {
      field: 'slidingWindowMaxTweets',
      title: '窗口内推文上限',
      unit: '条',
      max: 25,
    },
  ],
  crowdBlock: [
    {
      field: 'minBlockCount',
      title: '社区记录门槛',
      unit: '次',
      min: 1,
      max: 20,
    },
  ],
  blueReplySpam: [
    { field: 'maxFollowers', title: '低粉账号门槛', unit: '粉丝', max: 3000 },
    { field: 'minReplyLength', title: '最短回复长度', unit: '字符' },
  ],
  tagSpam: [
    { field: 'maxHashtags', title: 'Hashtag 上限', unit: '个', max: 20 },
    { field: 'maxCashtags', title: 'Cashtag 上限', unit: '个', max: 20 },
  ],
  accountQuality: [
    { field: 'minAccountAgeDays', title: '最低注册时间', unit: '天', max: 90 },
    {
      field: 'maxFollowRatio',
      title: '关注 / 粉丝比例上限',
      unit: '倍',
      step: 0.1,
    },
    {
      field: 'minFollowingForRatioCheck',
      title: '开始检测的关注数量',
      unit: '人',
    },
  ],
};
const booleanFields: Partial<
  Record<keyof FilterRulesConfig, { field: string; title: string }[]>
> = {
  highFrequency: [{ field: 'slidingWindowEnabled', title: '同时检测短期刷屏' }],
  blueReplySpam: [
    { field: 'onlyInReplies', title: '仅在回复区检测' },
    { field: 'blockPureEmojiOrShort', title: '检测纯表情与极短回复' },
  ],
  accountQuality: [
    { field: 'blockDefaultAvatarInReplies', title: '检测回复区默认头像账号' },
  ],
};
const notes: Record<keyof FilterRulesConfig, string> = {
  highFrequency:
    '历史日均以账号总推文数 / 注册天数计算，并要求至少发布过 30 条。窗口统计本浏览器观察到的不同推文，不代表平台实时发布总量。',
  crowdBlock:
    '粉丝数达到 5 万或被快照标记为高粉的账号，门槛自动乘以 5。社区记录仅供过滤参考，不代表已经核实的账号风险。',
  keywords: '这里控制自定义词条。公共词库独立启停，可在关键词页面管理。',
  blueReplySpam:
    '低粉门槛以下的蓝标按场景过滤；纯表情 / 短回复检测限于回复场景，且粉丝数低于此门槛的 4 倍。长度计算会先移除提及和 URL。',
  tagSpam: '正文的 #Hashtag 与 $Cashtag 分别计数，超过任一上限时触发。',
  accountQuality:
    '注册时间检测限粉丝少于 500 的账号；默认头像检测限回复场景且粉丝少于 200 的账号。关注比例仅在达到最低关注数后检测。',
  hidePromotedAds:
    '广告规则优先于白名单与关注豁免。需要恢复广告时关闭此项；给广告作者加白不会恢复推广内容。',
};
export function RulesPage() {
  const { data } = useApp();
  const config = data!.config;
  const [expanded, setExpanded] = useState<string | null>(
    new URLSearchParams(location.hash.split('?')[1]).get('rule')
  );
  return (
    <Page
      title="过滤规则"
      description="把注意力留给值得阅读的内容。"
      action={
        <Pill>{config.preset === 'custom' ? '自定义配置' : '即时生效'}</Pill>
      }
    >
      {!config.enabled && (
        <Banner kind="warning">
          过滤已暂停。仍可调整设置，恢复后将按当前配置过滤；已剔除的内容需要刷新
          X 重新加载。
        </Banner>
      )}
      <Panel
        title="选择净空强度"
        description="从预设开始，再按你的阅读习惯微调。"
      >
        <Presets config={config} />
        <Setting
          title="过滤后呈现方式"
          description="直接隐藏不留占位；折叠提示保留原因，并可临时展开。"
        >
          <Presentation config={config} />
        </Setting>
      </Panel>
      <div className="row between">
        <h2>过滤维度</h2>
        <span className="small muted">
          已启用{' '}
          {ruleDefinitions.filter((r) => config.rules[r.key].enabled).length} /
          7 项
        </span>
      </div>
      <div className="rule-list">
        {ruleDefinitions.map((rule) => {
          const open = expanded === rule.key;
          const values = config.rules[rule.key] as unknown as Record<
            string,
            number | boolean
          >;
          return (
            <section className="rule-item" key={rule.key}>
              <div className="rule-summary">
                <button
                  className="rule-open"
                  aria-expanded={open}
                  aria-controls={`rule-${rule.key}`}
                  onClick={() => setExpanded(open ? null : rule.key)}
                >
                  <span className="rule-icon">
                    <rule.icon size={19} />
                  </span>
                  <span className="grow">
                    <h3>{rule.title}</h3>
                    <span className="small muted">{rule.description}</span>
                  </span>
                  {open ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>
                <Switch
                  label={`启用${rule.title}`}
                  checked={config.rules[rule.key].enabled}
                  onChange={(value) =>
                    void rulePatch(rule.key, 'enabled', value).catch(
                      () => undefined
                    )
                  }
                />
              </div>
              {open && (
                <div id={`rule-${rule.key}`} className="rule-detail stack">
                  <div className="detail-grid">
                    {numericFields[rule.key]?.map((field) => (
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
                  <Banner>{notes[rule.key]}</Banner>
                  {rule.key === 'keywords' && (
                    <a href="#/keywords">管理自定义关键词与公共词库 →</a>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <Panel title="场景豁免" description="让过滤符合你的主动选择。">
        <Setting
          title="豁免已关注的账号"
          description="跳过一般规则；本地黑名单和推广广告仍按各自规则处理。"
        >
          <Switch
            label="豁免已关注的账号"
            checked={config.exemptFollowing}
            onChange={(exemptFollowing) =>
              perform({ type: 'config.patch', patch: { exemptFollowing } })
            }
          />
        </Setting>
        <Setting
          title="个人主页仅显示提示"
          description="主动访问主页时保留普通推文，显示命中规则；推广广告仍可隐藏。"
        >
          <Switch
            label="个人主页仅显示提示"
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
    </Page>
  );
}
