import { useI18n } from '../../locales';
import { CloudKeywordsCard } from './CloudKeywordsCard';
import { HonestStatusCard } from './HonestStatusCard';
import { ProfileBadgeCard } from './ProfileBadgeCard';
import { LangFilterCard } from './LangFilterCard';

export interface BentoGridProps {
  className?: string;
}

export function BentoGrid({ className = '' }: BentoGridProps) {
  const { t } = useI18n();
  const bento = t.bento;

  return (
    <div className={`bento-container ${className}`} data-testid="bento-container">
      <div className="m5-section-header">
        <span className="m5-badge">{bento.badge}</span>
        <h2 className="m5-title">{bento.title}</h2>
        <p className="m5-desc">{bento.sub}</p>
      </div>

      <div className="bento-grid">
        <CloudKeywordsCard />
        <HonestStatusCard />
        <ProfileBadgeCard />
        <LangFilterCard />
      </div>
    </div>
  );
}
