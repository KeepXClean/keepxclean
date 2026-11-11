import { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  Ban,
  ChevronDown,
  ChevronUp,
  Download,
  UserRoundCheck,
} from 'lucide-react';
import type { ExtractedAuthor } from '@keepxclean/shared';
import { openOptions } from '../services/client';
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
  Setting,
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
      addedAt: Date.now(),
    },
  });
}
function Inline({ item, open }: { item: InlineItem; open: () => void }) {
  const { data } = useApp();
  if (item.kind === 'nav')
    return (
      <button
        type="button"
        className="inline-nav"
        aria-label="净空设置"
        aria-haspopup="dialog"
        title="净空设置"
        onClick={open}
      >
        <BrandIcon size={26} />
        <span>净空设置</span>
      </button>
    );
  if (item.kind === 'quick')
    return (
      <Button
        variant="ghost icon"
        className="inline-quick"
        aria-label={
          item.author ? `净空 @${item.author.screenName}` : '等待账号 UID'
        }
        title={
          item.author
            ? `加入本地黑名单：@${item.author.screenName}`
            : '尚未读取到此账号的真实 UID'
        }
        disabled={!item.author || !UID.test(item.author.restId)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (item.author) block(item.author);
        }}
      >
        <Ban size={16} />
      </Button>
    );
  if (item.kind === 'collapse')
    return (
      <div className="collapse-bar">
        <div className="row">
          <BrandIcon size={20} />
          <div className="grow">
            <strong className="small">
              已折叠 · @{item.author?.screenName}
            </strong>
            <p className="small muted">{item.decision?.reasonText}</p>
          </div>
          <Button variant="ghost" onClick={item.toggle}>
            {item.expanded ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
            {item.expanded ? '收起' : '展开'}
          </Button>
        </div>
        <div className="row" style={{ marginTop: 5 }}>
          {item.decision?.ruleId === 'promoted_ad' ? (
            <Button variant="ghost" onClick={() => void openOptions('rules')}>
              调整广告规则
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => item.author && whitelist(item.author!)}
            >
              <UserRoundCheck size={14} />
              加入白名单
            </Button>
          )}
        </div>
      </div>
    );
  if (item.kind === 'profile' && item.author) {
    const hasMetrics = Boolean(
      item.author.createdAt || item.author.statusesCount > 0
    );
    const rate = hasMetrics
      ? Math.round(item.author.dailyTweetRate * 10) / 10
      : null;
    const hasRateBadge = item.badges?.some((b) => b.includes('历史日均'));
    return (
      <div className="profile-badges">
        <BrandIcon size={20} />
        {rate !== null && !hasRateBadge && (
          <Pill kind="neutral">历史日均 {rate} 条</Pill>
        )}
        {item.badges?.length ? (
          item.badges.map((badge) => (
            <Pill kind="warning" key={badge}>
              {badge}
            </Pill>
          ))
        ) : (
          <Pill kind="neutral">未命中当前规则</Pill>
        )}
        {data?.config.whitelistUids[item.author.restId] ? (
          <Pill>已在白名单</Pill>
        ) : (
          <Button variant="ghost" onClick={() => whitelist(item.author!)}>
            加入白名单
          </Button>
        )}
        <Button
          variant="ghost icon"
          aria-label="净空此账号"
          onClick={() => block(item.author!)}
        >
          <Ban size={15} />
        </Button>
      </div>
    );
  }
  return null;
}
export function ContentApp({ controller }: { controller: DomController }) {
  const state = useApp();
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
        {state.saveError && (
          <div className="toast-region">
            <SaveError />
          </div>
        )}
        {drawer && (
          <Modal
            title="净空设置"
            description="调整偏好，继续留在当前阅读现场。"
            drawer
            onClose={() => setDrawer(false)}
            footer={
              <>
                <Button onClick={() => setImporting(true)}>
                  <Download size={14} />
                  导入 X 黑名单
                </Button>
                <Button variant="primary" onClick={() => void openOptions()}>
                  完整设置 <ArrowUpRight size={14} />
                </Button>
              </>
            }
          >
            {state.error ? (
              <LoadError error={state.error} />
            ) : !state.data ? (
              <Loading />
            ) : (
              <div className="stack">
                <div>
                  <Setting
                    title="启用净空"
                    description="修改会同步到插件弹窗与完整设置。"
                  >
                    <Switch
                      label="启用净空"
                      checked={state.data.config.enabled}
                      onChange={(enabled) =>
                        perform({ type: 'config.patch', patch: { enabled } })
                      }
                    />
                  </Setting>
                  <SaveStatus />
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
