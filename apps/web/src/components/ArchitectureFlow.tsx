import { useState } from 'react';
import {
  CLOUD_KEYWORD_LANG_GROUPS,
  DEFAULT_CLOUD_KEYWORDS,
} from '@keepxclean/shared';
import { Cpu, Lock, Terminal } from 'lucide-react';
import { useI18n } from '../locales';

export function ArchitectureFlow() {
  const { t } = useI18n();
  const arch = t.architecture;

  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);

  const stepsData = [
    {
      num: 1,
      title: arch.step1Title,
      summary: arch.step1Desc,
      latency: '0ms (In-Memory Hook)',
      input:
        'X Web GraphQL response (HomeTimeline / HomeLatestTimeline / TweetDetail / UserTweets)',
      processing:
        'Deep instruction tree parsing prior to DOM mounting + local parse health self-check',
      output: 'Normalized ExtractedTweet (with timelineFeed) and Author entities',
      privacy: 'Page responses processed in local browser memory; zero telemetry',
    },
    {
      num: 2,
      title: arch.step2Title,
      summary: arch.step2Desc,
      latency: '< 1ms (Pure CPU)',
      input: `Extracted Tweet + Active FilterConfig + ${DEFAULT_CLOUD_KEYWORDS.length} Cloud Keywords (${CLOUD_KEYWORD_LANG_GROUPS.length}-Language Packs) + Offline Rule Packs`,
      processing:
        'Deterministic pattern matching, Grok protection, same-thread dedup, domain rules & quote penetration',
      output: 'InterceptionDecision (allow | strip | collapse | badge_only) + matchedTarget',
      privacy: 'Zero remote AI model latency; 100% offline rule execution',
    },
    {
      num: 3,
      title: arch.step3Title,
      summary: arch.step3Desc,
      latency: 'Instant (Render Cycle)',
      input: 'InterceptionDecision + Per-Scene Override (For You / Following / Reply / Search)',
      processing:
        'In-place relay surgery or non-destructive folded bar with deep-link rule tuning & 1-click item disable',
      output: 'Clean timeline or collapsible bar with 4.5s undo countdown',
      privacy:
        'Non-destructive; full evidence retention, local 7-day stats & Canvas 2D Battle Report PNG',
    },
    {
      num: 4,
      title: arch.step4Title,
      summary: arch.step4Desc,
      latency: 'Asynchronous (Background)',
      input: 'Opt-in manual block confirmation (after 4.5s window) & optional chrome.storage.sync',
      processing:
        'One-way cryptographic hash: sha256Hex("kxc_v1_" + authorId) · chunked sync (<=6 KB)',
      output: 'Anonymous reputation counter increment (1 account = 1 vote); blocklists stay device-local',
      privacy: 'Opt-in only (default OFF); no X session credentials or telemetry ever sent',
    },
  ];

  const currentStepInfo = stepsData[activeStep - 1];

  const assurances = [
    {
      icon: <Lock size={20} />,
      title: arch.assurance1,
      desc: arch.assurance1Desc,
    },
    {
      icon: <Cpu size={20} />,
      title: arch.assurance2,
      desc: arch.assurance2Desc,
    },
    {
      icon: <Terminal size={20} />,
      title: arch.assurance3,
      desc: arch.assurance3Desc,
    },
  ];

  return (
    <div className="arch-container" data-testid="architecture-container">
      <div className="m5-section-header">
        <span className="m5-badge">{arch.badge}</span>
        <h2 className="m5-title">{arch.title}</h2>
        <p className="m5-desc">{arch.sub}</p>
      </div>

      {/* 4 Interactive Flow Nodes */}
      <div className="arch-flow-diagram" role="tablist" aria-label="Architecture Flow Steps">
        {stepsData.map((step) => {
          const isActive = activeStep === step.num;
          return (
            <div
              key={step.num}
              id={`arch-step-${step.num}`}
              role="tab"
              aria-selected={isActive}
              aria-controls="arch-inspector-panel"
              tabIndex={0}
              className={`arch-step-node ${isActive ? 'active' : ''}`}
              onClick={() => setActiveStep(step.num as 1 | 2 | 3 | 4)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setActiveStep(step.num as 1 | 2 | 3 | 4);
                }
              }}
              data-testid={`arch-step-${step.num}`}
            >
              <div className="arch-step-num">{step.num}</div>
              <h3 className="arch-step-title">{step.title}</h3>
              <p className="arch-step-summary">{step.summary}</p>
            </div>
          );
        })}
      </div>

      {/* Interactive Step Inspector */}
      <div
        className="arch-inspector"
        data-testid="arch-inspector"
        role="tabpanel"
        id="arch-inspector-panel"
        aria-labelledby={`arch-step-${currentStepInfo.num}`}
      >
        <div className="arch-inspector-header">
          <h3 className="arch-inspector-title">
            <span>{arch.stepPrefix} {currentStepInfo.num}: {currentStepInfo.title}</span>
          </h3>
          <span className="arch-inspector-latency">{currentStepInfo.latency}</span>
        </div>

        <div className="arch-inspector-grid">
          <div className="arch-inspector-item">
            <div className="arch-inspector-item-label">{arch.dataIngest}</div>
            <div className="arch-inspector-item-val">{currentStepInfo.input}</div>
          </div>

          <div className="arch-inspector-item">
            <div className="arch-inspector-item-label">{arch.executionLogic}</div>
            <div className="arch-inspector-item-val">{currentStepInfo.processing}</div>
          </div>

          <div className="arch-inspector-item">
            <div className="arch-inspector-item-label">{arch.privacyAssurance}</div>
            <div className="arch-inspector-item-val">{currentStepInfo.privacy}</div>
          </div>
        </div>
      </div>

      {/* 3 Zero-Trust Engineering Assurances */}
      <div className="arch-assurances-section">
        <h3 className="arch-assurances-title">{arch.assuranceTitle}</h3>
        <div className="arch-assurances-grid">
          {assurances.map((a, i) => (
            <div
              key={i}
              className="arch-assurance-card"
              data-testid={`arch-assurance-${i + 1}`}
            >
              <div className="arch-assurance-icon">{a.icon}</div>
              <h4 className="arch-assurance-card-title">{a.title}</h4>
              <p className="arch-assurance-card-desc">{a.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
