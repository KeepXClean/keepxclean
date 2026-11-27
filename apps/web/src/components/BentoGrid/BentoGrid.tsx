import { BarChart3, Globe, Package, RefreshCw } from 'lucide-react';
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
  const highlights = bento.v020Highlights;

  const v020Cards = [
    {
      id: 'lang-packs',
      icon: <Globe size={18} aria-hidden="true" />,
      ...highlights.langPacks,
    },
    {
      id: 'rule-packs',
      icon: <Package size={18} aria-hidden="true" />,
      ...highlights.rulePacks,
    },
    {
      id: 'battle-report',
      icon: <BarChart3 size={18} aria-hidden="true" />,
      ...highlights.battleReport,
    },
    {
      id: 'cloud-sync',
      icon: <RefreshCw size={18} aria-hidden="true" />,
      ...highlights.cloudSync,
    },
  ];

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

      <div
        className="bento-highlights-section"
        data-testid="bento-v020-highlights"
      >
        <div className="bento-highlights-header">
          <span className="m5-badge">{highlights.badge}</span>
          <h3 className="bento-highlights-title">{highlights.title}</h3>
        </div>

        <div className="bento-highlights-grid">
          {v020Cards.map((card) => (
            <article
              key={card.id}
              className="bento-highlight-card"
              data-testid={`bento-highlight-${card.id}`}
            >
              <div className="bento-highlight-top">
                <span className="bento-highlight-icon">{card.icon}</span>
                <span className="bento-highlight-tag">{card.tag}</span>
              </div>
              <h4 className="bento-highlight-card-title">{card.title}</h4>
              <p className="bento-highlight-card-desc">{card.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
