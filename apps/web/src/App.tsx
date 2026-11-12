import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HeroSandbox } from './components/HeroSandbox';
import { BentoGrid } from './components/BentoGrid';
import { ArchitectureFlow } from './components/ArchitectureFlow';
import { CommunityStats } from './components/CommunityStats';
import { SideloadGuide } from './components/SideloadGuide';
import { FaqAccordion } from './components/FaqAccordion';
import { I18nProvider, useI18n } from './locales';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/bento.css';

function AppContent() {
  const { locale } = useI18n();

  return (
    <div className="app-shell">
      <Header currentPage="home" />

      <main className="main-content">
        {/* Hero Interactive Sandbox Simulator */}
        <section id="hero" className="section-hero shell">
          <HeroSandbox locale={locale} />
        </section>

        {/* Bento Grid 4-Card Showcase (Feature 24-27) */}
        <section id="features" className="section-bento shell">
          <BentoGrid />
        </section>

        {/* Local-First Architecture Flow (Feature 28) */}
        <section id="architecture" className="section-arch shell">
          <ArchitectureFlow />
        </section>

        {/* Real-time Community Defense Board (Feature 29) */}
        <section id="stats" className="section-stats shell">
          <CommunityStats />
        </section>

        {/* 3-Step Sideload Installation Guide (Feature 30 Part A) */}
        <section id="install" className="section-install shell">
          <SideloadGuide />
        </section>

        {/* Collapsible FAQ Accordion (Feature 30 Part B) */}
        <section id="faq" className="section-faq shell">
          <FaqAccordion />
        </section>
      </main>

      <Footer currentPage="home" />
    </div>
  );
}

export function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

export default App;
