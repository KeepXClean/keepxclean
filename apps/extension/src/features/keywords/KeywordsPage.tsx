import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { KeywordMatchScope, KeywordRuleItem } from '@keepxclean/shared';
import { digest } from '../../services/model';
import { validateKeyword } from '../../services/validation';
import { mutate, useApp } from '../../state/store';
import {
  Banner,
  Button,
  Confirm,
  Empty,
  Field,
  Modal,
  Page,
  Panel,
  perform,
  Pill,
  SearchBox,
  Segmented,
  Setting,
  Switch,
  Tabs,
  usePagination,
} from '../../ui/components';

const scopeLabels: Record<KeywordMatchScope, string> = {
  text: '正文',
  bio: '简介',
  name: '昵称 / Handle',
  url: '链接',
};
export function KeywordEditor({
  item,
  initialPattern = '',
  onClose,
}: {
  item?: KeywordRuleItem;
  initialPattern?: string;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<KeywordRuleItem>(
    item ?? {
      id: crypto.randomUUID(),
      pattern: initialPattern,
      isRegex: false,
      scopes: ['text', 'bio'],
      maxFollowersExempt: 20000,
      note: '',
      enabled: true,
    }
  );
  const [exempt, setExempt] = useState(!!draft.maxFollowersExempt),
    [followers, setFollowers] = useState(
      String(draft.maxFollowersExempt || 20000)
    ),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [initial] = useState(digest({ draft, exempt, followers }));
  const close = () => {
    if (digest({ draft, exempt, followers }) !== initial) setDiscard(true);
    else onClose();
  };
  async function save() {
    setPending(true);
    setError('');
    try {
      if (exempt && (!followers.trim() || Number(followers) <= 0))
        throw new Error('请输入正整数粉丝豁免值');
      const validated = validateKeyword({
        ...draft,
        maxFollowersExempt: exempt ? Number(followers) : 0,
      });
      await mutate({
        type: 'keyword.save',
        item: validated,
        expected: item ? digest(item) : undefined,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Modal
        title={item ? '编辑关键词' : '添加关键词'}
        description="以你关心的范围精确匹配。"
        onClose={() => {
          if (!pending) close();
        }}
        footer={
          <>
            <Button disabled={pending} onClick={close}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={() => void save()}
            >
              {item ? '保存修改' : '添加关键词'}
            </Button>
          </>
        }
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Segmented
            label="关键词类型"
            value={draft.isRegex ? 'regex' : 'text'}
            options={[
              { value: 'text', label: '普通文字' },
              { value: 'regex', label: '正则表达式' },
            ]}
            onChange={(value) =>
              setDraft({ ...draft, isRegex: value === 'regex' })
            }
          />
          <Field
            label={draft.isRegex ? '正则表达式' : '匹配内容'}
            help={
              draft.isRegex
                ? '不区分大小写；填写表达式本体，无需首尾斜线。'
                : '按文字直接匹配，不需要转义。'
            }
          >
            <input
              autoFocus
              className="input"
              value={draft.pattern}
              placeholder={
                draft.isRegex ? '例如：免费.*空投' : '输入想过滤的词语'
              }
              onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
            />
          </Field>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">匹配范围 · 至少选择一项</legend>
            <div className="row wrap">
              {Object.entries(scopeLabels).map(([scope, label]) => (
                <label className="check-label" key={scope}>
                  <input
                    type="checkbox"
                    checked={draft.scopes.includes(scope as KeywordMatchScope)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        scopes: e.target.checked
                          ? [...draft.scopes, scope as KeywordMatchScope]
                          : draft.scopes.filter((s) => s !== scope),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <Setting
            title="高粉账号豁免"
            description="粉丝数达到指定值时跳过这条关键词。"
          >
            <Switch
              label="高粉账号豁免"
              checked={exempt}
              onChange={setExempt}
            />
          </Setting>
          {exempt && (
            <Field label="粉丝豁免门槛">
              <input
                className="input"
                type="number"
                min={1}
                step={1}
                value={followers}
                onChange={(e) => setFollowers(e.target.value)}
              />
            </Field>
          )}
          <Field label="备注（可选）">
            <input
              className="input"
              value={draft.note ?? ''}
              placeholder="记录这条规则的用途"
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </Field>
          <Setting title="启用这条关键词">
            <Switch
              label="启用这条关键词"
              checked={draft.enabled}
              onChange={(enabled) => setDraft({ ...draft, enabled })}
            />
          </Setting>
          {error && <Banner kind="error">{error}</Banner>}
        </form>
      </Modal>
      {discard && (
        <Confirm
          title="放弃未保存的修改？"
          actionLabel="放弃修改"
          onClose={() => setDiscard(false)}
          onConfirm={async () => onClose()}
        >
          <p>这次编辑尚未保存。</p>
        </Confirm>
      )}
    </>
  );
}
export function KeywordsPage() {
  const { data } = useApp();
  const { config, snapshot } = data!;
  const [tab, setTab] = useState<'local' | 'cloud'>('local'),
    [query, setQuery] = useState(''),
    [editor, setEditor] = useState<KeywordRuleItem | 'new' | null>(null),
    [deleting, setDeleting] = useState<KeywordRuleItem | null>(null);
  const list = (
    tab === 'local' ? config.rules.keywords.items : snapshot.cloudKeywords
  ).filter((k) =>
    `${k.pattern} ${k.note ?? ''}`.toLowerCase().includes(query.toLowerCase())
  );
  const page = usePagination(list, tab + query);
  return (
    <Page
      title="关键词"
      description="过滤不想看到的词语，让内容更贴近你的兴趣。"
      action={
        tab === 'local' && (
          <Button variant="primary" onClick={() => setEditor('new')}>
            <Plus size={16} />
            添加关键词
          </Button>
        )
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          {
            value: 'local',
            label: `自定义词库 · ${config.rules.keywords.items.length}`,
          },
          {
            value: 'cloud',
            label: `公共词库 · ${snapshot.cloudKeywords.length}`,
          },
        ]}
      />
      <Panel>
        <Setting
          title={tab === 'local' ? '启用自定义词库' : '启用公共词库'}
          description={
            tab === 'local'
              ? '按每条关键词设定的范围与豁免条件过滤。'
              : '公共词库只读，随社区快照更新；未同步时使用内置词库。'
          }
        >
          <Switch
            label={tab === 'local' ? '启用自定义词库' : '启用公共词库'}
            checked={
              tab === 'local'
                ? config.rules.keywords.enabled
                : config.enableCloudKeywords
            }
            onChange={(enabled) =>
              perform({
                type: 'config.patch',
                patch:
                  tab === 'local'
                    ? { rules: { keywords: { enabled } } }
                    : { enableCloudKeywords: enabled },
              })
            }
          />
        </Setting>
      </Panel>
      <div className="row between wrap">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="搜索关键词或备注"
        />
        <span className="small muted">
          {list.length} 条关键词{tab === 'cloud' ? ' · 只读' : ''}
        </span>
      </div>
      <Panel className="table-panel">
        {list.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>匹配内容</th>
                    <th>匹配范围</th>
                    <th>粉丝豁免</th>
                    <th>状态 / 操作</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((k) => (
                    <tr key={k.id}>
                      <td>
                        <div className="cell-main">
                          <div className="row">
                            <strong className="ellipsis" title={k.pattern}>
                              {k.pattern}
                            </strong>
                            {k.isRegex && <Pill kind="neutral">正则</Pill>}
                          </div>
                          <div className="small muted ellipsis" title={k.note}>
                            {k.note || '无备注'}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="row wrap" style={{ gap: 5 }}>
                          {k.scopes.map((scope) => (
                            <Pill key={scope} kind="neutral">
                              {scopeLabels[scope]}
                            </Pill>
                          ))}
                        </div>
                      </td>
                      <td className="small muted">
                        {k.maxFollowersExempt
                          ? `≥ ${k.maxFollowersExempt.toLocaleString()}`
                          : '无'}
                      </td>
                      <td>
                        <div className="table-actions">
                          {tab === 'local' ? (
                            <>
                              <Switch
                                label={`启用关键词 ${k.pattern}`}
                                checked={k.enabled}
                                onChange={(enabled) =>
                                  perform({
                                    type: 'keyword.save',
                                    item: { ...k, enabled },
                                    expected: digest(k),
                                  })
                                }
                              />
                              <Button
                                variant="ghost icon"
                                aria-label={`编辑 ${k.pattern}`}
                                onClick={() => setEditor(k)}
                              >
                                <Pencil size={15} />
                              </Button>
                              <Button
                                variant="ghost icon"
                                aria-label={`删除 ${k.pattern}`}
                                onClick={() => setDeleting(k)}
                              >
                                <Trash2 size={15} />
                              </Button>
                            </>
                          ) : (
                            <Pill kind="neutral">
                              {k.enabled ? '已收录' : '未启用'}
                            </Pill>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {page.control}
          </>
        ) : (
          <Empty
            title={query ? '没有匹配的关键词' : '从第一个关键词开始'}
            description={
              query
                ? '试试其他词语，或清空搜索条件。'
                : '添加不想看到的内容，并选择匹配范围。'
            }
          />
        )}
      </Panel>
      {editor && (
        <KeywordEditor
          item={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
      {deleting && (
        <Confirm
          title="删除这条关键词？"
          actionLabel="删除关键词"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            mutate({
              type: 'keyword.delete',
              id: deleting.id,
              expected: digest(deleting),
            })
          }
        >
          <p className="break">{deleting.pattern}</p>
        </Confirm>
      )}
    </Page>
  );
}
