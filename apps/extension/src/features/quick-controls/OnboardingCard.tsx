import { Download, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { openOptions } from '../../services/client';
import { useApp } from '../../state/store';
import { Button, perform } from '../../ui/components';
import { Presentation } from '../rules/RulesPage';

export function OnboardingCard({ onImport }: { onImport?: () => void }) {
  const { data } = useApp();
  const { m } = useI18n();

  if (!data || data.config.onboardingDismissed !== false) return null;

  const { config } = data;
  const presets = [
    { id: 'light', label: m.presets.lightTitle },
    { id: 'standard', label: m.presets.standardTitle },
    { id: 'strict', label: m.presets.strictTitle },
  ] as const;

  function dismiss() {
    perform({ type: 'config.patch', patch: { onboardingDismissed: true } });
  }

  function handleImport() {
    if (onImport) {
      onImport();
    } else {
      void openOptions('accounts', { action: 'import' }).catch(() => undefined);
    }
  }

  return (
    <section
      className="onboarding-card"
      data-kxc-onboarding="true"
      aria-label={m.onboarding.title}
    >
      <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div>
          <h3>{m.onboarding.title}</h3>
          <p className="small muted">{m.onboarding.desc}</p>
        </div>
        <Button
          variant="ghost icon sm"
          data-kxc-onboarding-close="true"
          aria-label={m.onboarding.dismissBtn}
          title={m.onboarding.dismissBtn}
          onClick={dismiss}
        >
          <X size={14} />
        </Button>
      </div>

      <div className="onboarding-step">
        <span className="onboarding-step-label">
          {m.onboarding.stepStrength}
        </span>
        <div
          className="onboarding-presets"
          role="group"
          aria-label={m.onboarding.stepStrength}
        >
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={config.preset === p.id}
              onClick={() => perform({ type: 'config.preset', preset: p.id })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="onboarding-step">
        <span className="onboarding-step-label">
          {m.onboarding.stepDisplay}
        </span>
        <Presentation config={config} />
      </div>

      <div className="onboarding-step">
        <span className="onboarding-step-label">{m.onboarding.stepImport}</span>
        <div>
          <Button variant="sm" onClick={handleImport}>
            <Download size={13} />
            {m.onboarding.importBtn}
          </Button>
        </div>
      </div>

      <div className="row between wrap" style={{ gap: 8 }}>
        <p className="small muted grow" style={{ fontSize: 11.5 }}>
          {m.onboarding.privacyNote}
        </p>
        <Button
          variant="primary sm"
          data-kxc-onboarding-dismiss="true"
          onClick={dismiss}
        >
          {m.onboarding.doneBtn}
        </Button>
      </div>
    </section>
  );
}
