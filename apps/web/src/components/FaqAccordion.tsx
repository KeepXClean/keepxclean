import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '../locales';

export function FaqAccordion() {
  const { t } = useI18n();
  const faq = t.faq;

  // Default item 0 is open
  const [openIndices, setOpenIndices] = useState<Set<number>>(new Set([0]));

  const toggleItem = (idx: number) => {
    setOpenIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  return (
    <div className="faq-container" data-testid="faq-accordion-container">
      <div className="m5-section-header">
        <span className="m5-badge">{faq.badge}</span>
        <h2 className="m5-title">{faq.title}</h2>
        <p className="m5-desc">{faq.sub}</p>
      </div>

      <div className="faq-accordion-box" role="presentation">
        {faq.items.map((item, idx) => {
          const isOpen = openIndices.has(idx);
          const triggerId = `faq-trigger-${idx}`;
          const panelId = `faq-panel-${idx}`;

          return (
            <div
              key={idx}
              className={`faq-item-card ${isOpen ? 'open' : ''}`}
              data-testid={`faq-item-${idx}`}
            >
              <button
                type="button"
                id={triggerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="faq-trigger-btn"
                onClick={() => toggleItem(idx)}
                data-testid={`faq-trigger-${idx}`}
              >
                <span>{item.q}</span>
                <ChevronDown
                  size={18}
                  className={`faq-chevron ${isOpen ? 'open' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {isOpen && (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  className="faq-answer-panel"
                  data-testid={`faq-answer-${idx}`}
                >
                  <p style={{ margin: 0 }}>{item.a}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
