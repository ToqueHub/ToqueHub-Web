import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, ClipboardList, Menu, Printer, Search, X } from 'lucide-react';
import { chapters, operationalFlows, screensByChapter, type DocumentationStatus, type GuideChapter } from './documentationContent';

const statusClass: Record<DocumentationStatus, string> = {
  Disponible: 'is-available',
  'À configurer': 'is-configure',
  'En préparation': 'is-planned',
};

export function DocumentationPage() {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState(chapters[0].id);
  const filteredChapters = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fr');
    if (!needle) return chapters;
    return chapters.filter((chapter) => {
      const screens = screensByChapter[chapter.id] ?? [];
      const flow = operationalFlows[chapter.id];
      const searchable = [
        chapter.title,
        chapter.eyebrow,
        chapter.goal,
        chapter.audience,
        ...chapter.steps,
        ...chapter.tips,
        ...screens.flatMap((screen) => [screen.title, screen.purpose, screen.actions, ...(screen.flow ?? [])]),
        ...(flow ? [flow.when, ...flow.prerequisites, ...flow.steps, ...flow.checks, flow.result, ...flow.pitfalls] : []),
      ];
      return searchable.join(' ').toLocaleLowerCase('fr').includes(needle);
    });
  }, [query]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveId(visible.target.id.replace('chapter-', ''));
    }, { rootMargin: '-18% 0px -70% 0px', threshold: [0.1, 0.4] });
    chapters.forEach((chapter) => {
      const element = document.getElementById(`chapter-${chapter.id}`);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [filteredChapters]);

  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (!chapters.some((chapter) => chapter.id === id)) return;
    setActiveId(id);
    window.requestAnimationFrame(() => {
      document.getElementById(`chapter-${id}`)?.scrollIntoView({ block: 'start' });
    });
  }, []);

  const goToChapter = (id: string) => {
    document.getElementById(`chapter-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
    setMenuOpen(false);
  };

  const returnHome = () => { window.location.assign('/'); };
  const currentIndex = chapters.findIndex((chapter) => chapter.id === activeId);
  const progress = Math.max(0, ((currentIndex + 1) / chapters.length) * 100);

  return (
    <main className="documentation-page">
      <header className="docs-header">
        <button className="docs-brand" onClick={returnHome} aria-label="Retour à l’accueil ToqueHub">
          <span className="docs-brand-mark"><BookOpen size={18} /></span>
          <span>TOQUE<span>HUB</span><small>Guide utilisateur</small></span>
        </button>
        <div className="docs-header-actions">
          <button className="docs-icon-button docs-print" onClick={() => window.print()}><Printer size={17} /> Imprimer</button>
          <button className="docs-icon-button docs-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="docs-navigation">
            {menuOpen ? <X size={20} /> : <Menu size={20} />} <span>Sommaire</span>
          </button>
        </div>
      </header>
      <div className="docs-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>

      <aside id="docs-navigation" className={`docs-sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div className="docs-sidebar-heading"><span>Sommaire</span><small>{chapters.length} chapitres</small></div>
        <label className="docs-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans le guide" /></label>
        <nav aria-label="Chapitres du guide">
          {filteredChapters.map((chapter, index) => <button key={chapter.id} className={activeId === chapter.id ? 'is-active' : ''} onClick={() => goToChapter(chapter.id)}><span>{String(index + 1).padStart(2, '0')}</span>{chapter.title}</button>)}
        </nav>
        {filteredChapters.length === 0 && <p className="docs-no-result">Aucun chapitre ne correspond à cette recherche.</p>}
      </aside>

      <section className="docs-content">
        <section className="docs-hero">
          <p className="docs-overline">Manuel opérationnel · édition 2.1</p>
          <h1>Le guide complet pour faire vivre <em>ToqueHub</em> au quotidien.</h1>
          <p>Ce livret accompagne la brigade, les responsables et les administrateurs dans chaque geste métier. Il explique quoi faire, dans quel ordre et pourquoi — sans code ni jargon technique.</p>
          <div className="docs-hero-meta"><span><CheckCircle2 size={17} /> Procédures réelles</span><span><ClipboardList size={17} /> {chapters.length} chapitres pratiques</span><span><BookOpen size={17} /> Web, mobile et exploitation locale</span></div>
        </section>

        <section className="docs-roadmap" aria-labelledby="roadmap-title">
          <p className="docs-overline">Le bon ordre</p><h2 id="roadmap-title">Le fil conducteur de votre cuisine</h2>
          <div className="docs-flow"><span>Référentiels</span><ChevronRight /><span>Stocks</span><ChevronRight /><span>Fiches techniques</span><ChevronRight /><span>Production & Menus</span><ChevronRight /><span>HACCP & équipes</span><ChevronRight /><span>Achats, Finance & connecteurs</span></div>
          <p>Chaque étape utilise les données de la précédente. Cette progression évite les doubles saisies, clarifie les responsabilités et rend les indicateurs fiables.</p>
        </section>

        {filteredChapters.map((chapter) => <Chapter key={chapter.id} chapter={chapter} onRelatedClick={goToChapter} />)}
        <footer className="docs-footer"><button onClick={returnHome}><ArrowLeft size={16} /> Retour à l’accueil</button><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Revenir au début <ArrowRight size={16} /></button></footer>
      </section>
    </main>
  );
}

function Chapter({ chapter, onRelatedClick }: { chapter: GuideChapter; onRelatedClick: (id: string) => void }) {
  return <article id={`chapter-${chapter.id}`} className="docs-chapter">
    <div className="docs-chapter-title"><div><p className="docs-overline">{chapter.eyebrow}</p><h2>{chapter.title}</h2></div><span className={`docs-status ${statusClass[chapter.status]}`}>{chapter.status}</span></div>
    <div className="docs-audience">Pour : <strong>{chapter.audience}</strong></div>
    <p className="docs-goal">{chapter.goal}</p>
    {chapter.prerequisites && <aside className="docs-prerequisites"><strong>Avant de commencer</strong><ul>{chapter.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul></aside>}
    {operationalFlows[chapter.id] ? <OperationalFlowGuide flow={operationalFlows[chapter.id]} /> : null}
    <div className="docs-tutorial"><div className="docs-tutorial-heading"><span>Mode d’emploi</span><small>{chapter.steps.length} étapes</small></div><ol>{chapter.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol></div>
    {screensByChapter[chapter.id]?.length ? <section className="docs-screen-guide" aria-label={`Onglets et écrans : ${chapter.title}`}><div className="docs-screen-guide-heading"><span>Onglets et écrans à connaître</span><small>{screensByChapter[chapter.id].length} repères</small></div><div className="docs-screen-list">{screensByChapter[chapter.id].map((screen) => <div className="docs-screen" key={screen.title}><h3>{screen.title}</h3><p>{screen.purpose}</p><strong>À faire : </strong><span>{screen.actions}</span>{screen.flow ? <ol className="docs-screen-flow">{screen.flow.map((step) => <li key={step}>{step}</li>)}</ol> : null}</div>)}</div></section> : null}
    <div className="docs-outcome"><CheckCircle2 size={20} /><div><strong>À la fin</strong><p>{chapter.result}</p></div></div>
    <div className="docs-tips"><strong>À retenir</strong><ul>{chapter.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul></div>
    {chapter.related && <div className="docs-related"><span>À lire ensuite</span>{chapter.related.map((id) => { const item = chapters.find((candidate) => candidate.id === id); return item ? <button key={id} onClick={() => onRelatedClick(id)}>{item.title} <ChevronRight size={14} /></button> : null; })}</div>}
  </article>;
}

function OperationalFlowGuide({ flow }: { flow: { when: string; prerequisites: string[]; steps: string[]; checks: string[]; result: string; pitfalls: string[] } }) {
  return <section className="docs-operational-flow"><div className="docs-operational-flow-heading"><span>Flow opérationnel complet</span><small>Du besoin au contrôle final</small></div><p><strong>Quand l’utiliser :</strong> {flow.when}</p><div className="docs-flow-columns"><div><h3>Préparer</h3><ul>{flow.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>Vérifier</h3><ul>{flow.checks.map((item) => <li key={item}>{item}</li>)}</ul></div></div><ol>{flow.steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol><div className="docs-flow-result"><strong>Résultat attendu</strong><p>{flow.result}</p></div><div className="docs-flow-pitfalls"><strong>Erreurs à éviter</strong><ul>{flow.pitfalls.map((item) => <li key={item}>{item}</li>)}</ul></div></section>;
}
