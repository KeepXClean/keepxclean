import { Check, SlidersHorizontal, Eye, EyeOff, Globe } from 'lucide-react';
import type {
  SandboxDatasetLocale,
  SandboxDisplayMode,
  SandboxNoiseCategory,
  SandboxPreset,
} from './types';
import { CATEGORY_METAS } from './sampleData';

export interface ControlsProps {
  masterEnabled: boolean;
  onToggleMaster: (enabled: boolean) => void;
  preset: SandboxPreset;
  onChangePreset: (preset: SandboxPreset) => void;
  displayMode: SandboxDisplayMode;
  onChangeDisplayMode: (mode: SandboxDisplayMode) => void;
  categories: Record<SandboxNoiseCategory, boolean>;
  onToggleCategory: (category: SandboxNoiseCategory) => void;
  datasetLang: SandboxDatasetLocale;
  onSwitchDatasetLang: (lang: SandboxDatasetLocale) => void;
  filteredCount: number;
  totalNoiseCount: number;
  locale?: string;
}

export function Controls({
  masterEnabled,
  onToggleMaster,
  preset,
  onChangePreset,
  displayMode,
  onChangeDisplayMode,
  categories,
  onToggleCategory,
  datasetLang,
  onSwitchDatasetLang,
  filteredCount,
  totalNoiseCount,
  locale = 'zh-CN',
}: ControlsProps) {
  const isZh = locale.startsWith('zh');

  return (
    <div
      className="sandbox-controls-toolbar"
      role="toolbar"
      aria-label={isZh ? '沙盒过滤器控制栏' : 'Sandbox Filter Controls'}
    >
      {/* Primary Row: Master Switch & Presets / Display Modes */}
      <div className="controls-primary-row">
        <div className="controls-primary-left">
          {/* Feature 13: Master Switch */}
          <label className="master-toggle-wrapper">
            <span className="kxc-switch">
              <input
                type="checkbox"
                role="switch"
                aria-checked={masterEnabled}
                aria-label={isZh ? '净空引擎总开关' : 'Clean Engine Master Switch'}
                checked={masterEnabled}
                onChange={(e) => onToggleMaster(e.target.checked)}
              />
              <span className="kxc-switch-slider" />
            </span>
            <span className="master-toggle-label">
              <span>{isZh ? '净空引擎' : 'Clean Engine'}</span>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: masterEnabled ? 'var(--green)' : 'var(--muted)',
                }}
              >
                {masterEnabled
                  ? isZh ? '已开启' : 'ON'
                  : isZh ? '已关闭' : 'OFF'}
              </span>
            </span>
          </label>

          {/* Feature 19: Localized Dataset Switcher */}
          <div
            className="segmented-group"
            role="radiogroup"
            aria-label={isZh ? '样本语言' : 'Sample Language'}
          >
            <button
              type="button"
              role="radio"
              aria-checked={datasetLang === 'zh-CN'}
              className={`segmented-btn ${datasetLang === 'zh-CN' ? 'active' : ''}`}
              onClick={() => onSwitchDatasetLang('zh-CN')}
            >
              <Globe size={12} />
              <span>简中</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={datasetLang === 'zh-TW'}
              className={`segmented-btn ${datasetLang === 'zh-TW' ? 'active' : ''}`}
              onClick={() => onSwitchDatasetLang('zh-TW')}
            >
              <span>繁中</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={datasetLang === 'en'}
              className={`segmented-btn ${datasetLang === 'en' ? 'active' : ''}`}
              onClick={() => onSwitchDatasetLang('en')}
            >
              <span>English</span>
            </button>
          </div>
        </div>

        <div className="controls-primary-right">
          {/* Feature 14: 3 Intensity Presets */}
          <div
            className="segmented-group"
            role="radiogroup"
            aria-label={isZh ? '过滤强度' : 'Filter Intensity'}
          >
            <button
              type="button"
              role="radio"
              aria-checked={preset === 'mild'}
              className={`segmented-btn ${preset === 'mild' ? 'active' : ''}`}
              onClick={() => onChangePreset('mild')}
              title={
                isZh
                  ? '轻度：仅拦截高危高仿与商业推广广告 (2条)'
                  : 'Mild: Intercept high-risk impersonators and ads (2 items)'
              }
            >
              <span>{isZh ? '轻度' : 'Mild'}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={preset === 'standard'}
              className={`segmented-btn ${preset === 'standard' ? 'active' : ''}`}
              onClick={() => onChangePreset('standard')}
              title={
                isZh
                  ? '标准推荐：拦截高仿、广告、抽奖引流与币圈喊单 (4条)'
                  : 'Standard: Intercept impersonators, ads, giveaways & crypto (4 items)'
              }
            >
              <span>{isZh ? '标准' : 'Standard'}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={preset === 'extreme'}
              className={`segmented-btn ${preset === 'extreme' ? 'active' : ''}`}
              onClick={() => onChangePreset('extreme')}
              title={
                isZh
                  ? '极致：拦截全部5类噪音，仅留深度技术讨论 (5条)'
                  : 'Extreme: Intercept all 5 noise categories (5 items)'
              }
            >
              <span>{isZh ? '极致' : 'Extreme'}</span>
            </button>
          </div>

          {/* Feature 15: Interception Display Mode */}
          <div
            className="segmented-group"
            role="radiogroup"
            aria-label={isZh ? '展现形态' : 'Display Mode'}
          >
            <button
              type="button"
              role="radio"
              aria-checked={displayMode === 'folded'}
              className={`segmented-btn ${displayMode === 'folded' ? 'active' : ''}`}
              onClick={() => onChangeDisplayMode('folded')}
              title={
                isZh
                  ? '折叠条：收纳为单行原因条，支持展开检视依据'
                  : 'Folded Bar: Compact single-line bar with expand inspection'
              }
            >
              <Eye size={13} />
              <span>{isZh ? '折叠条' : 'Folded'}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={displayMode === 'hide'}
              className={`segmented-btn ${displayMode === 'hide' ? 'active' : ''}`}
              onClick={() => onChangeDisplayMode('hide')}
              title={
                isZh
                  ? '无痕隐藏：直接从视口抹除，完全不占位'
                  : 'Hide: Completely remove filtered items without placeholder'
              }
            >
              <EyeOff size={13} />
              <span>{isZh ? '无痕隐藏' : 'Hide'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feature 16: 5 Noise Category Toggles */}
      <div className="controls-category-row">
        <div className="category-chips-list">
          {CATEGORY_METAS.map((cat) => {
            const isActive = categories[cat.id];
            const label = isZh ? cat.labelZh : cat.labelEn;
            const title = isZh ? cat.shortDescZh : cat.shortDescEn;

            return (
              <button
                key={cat.id}
                type="button"
                role="checkbox"
                aria-checked={isActive}
                aria-label={`Filter category: ${label}`}
                title={title}
                className={`category-chip ${isActive ? 'active' : ''}`}
                onClick={() => onToggleCategory(cat.id)}
              >
                <span className="chip-checkbox-indicator">
                  {isActive && <Check size={10} strokeWidth={3} />}
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Real-time intercepted count readout */}
        <div className="category-stats-summary">
          <span>
            {isZh ? '已过滤噪音：' : 'Filtered noise: '}
            <strong>
              {masterEnabled ? filteredCount : 0} / {totalNoiseCount}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
}
