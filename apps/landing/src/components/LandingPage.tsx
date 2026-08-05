import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChefHat,
  CheckCircle2,
  Database,
  Factory,
  FileText,
  LineChart,
  Package,
  Server,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Thermometer,
  UsersRound,
  Utensils,
  WalletCards,
  Workflow,
} from 'lucide-react';
import { InteractiveSimulator } from './InteractiveSimulator';

type ModuleCard = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  highlights: string[];
  icon: LucideIcon;
  tone: 'emerald' | 'blue' | 'amber' | 'violet';
};

const modules: ModuleCard[] = [
  {
    id: 'stocks',
    title: 'Stocks & matériel',
    eyebrow: 'Socle matière',
    description: 'Produits, fournisseurs, équipements, inventaires et mouvements restent réunis dans un référentiel auditable.',
    highlights: ['Imports documentaires et tableurs', 'Lots, emplacements et seuils'],
    icon: Package,
    tone: 'emerald',
  },
  {
    id: 'fiches-techniques',
    title: 'Fiches techniques',
    eyebrow: 'Référentiel culinaire',
    description: 'Standardisez recettes, étapes, rendements, allergènes et coûts à partir des produits réellement suivis dans Stocks.',
    highlights: ['Coût par portion', 'Duplication, historique et exports'],
    icon: FileText,
    tone: 'amber',
  },
  {
    id: 'production',
    title: 'Production',
    eyebrow: 'Fabrication & tâches',
    description: 'Transformez les besoins en campagnes de fabrication puis organisez les tâches de la brigade sur un planning opérationnel.',
    highlights: ['Campagnes et besoins matières', 'Affectations, files et statuts'],
    icon: Factory,
    tone: 'blue',
  },
  {
    id: 'menus',
    title: 'Menus & cartes',
    eyebrow: 'Multi-activité',
    description: 'Adaptez l’expérience à un restaurant ou café, un traiteur ou une cuisine centrale avec un parcours métier dédié.',
    highlights: ['Cartes et disponibilités', 'Cycles, événements et convives'],
    icon: Utensils,
    tone: 'violet',
  },
  {
    id: 'haccp',
    title: 'HACCP',
    eyebrow: 'Maîtrise sanitaire',
    description: 'Configurez le socle sur le web, suivez capteurs et alertes, puis synchronisez les contrôles réalisés sur le terrain.',
    highlights: ['Températures et capteurs Zigbee', 'Traçabilité et rapports PDF'],
    icon: Thermometer,
    tone: 'violet',
  },
  {
    id: 'achats',
    title: 'Achats',
    eyebrow: 'Approvisionnement',
    description: 'Préparez les commandes fournisseur, envoyez leur PDF depuis la messagerie choisie et rapprochez les réceptions sans dupliquer le catalogue Stocks.',
    highlights: ['Gmail, Microsoft 365, SMTP ou Resend', 'BL, OCR et réceptions partielles'],
    icon: ShoppingCart,
    tone: 'emerald',
  },
  {
    id: 'finance',
    title: 'Finance',
    eyebrow: 'Pilotage sourcé',
    description: 'Consolidez comptabilité, caisses et imports pour lire ventes, rentabilité, trésorerie, budget et qualité des données.',
    highlights: ['Fennoa, Flatpay et POS', 'Rapports PDF et analyse Mistral'],
    icon: WalletCards,
    tone: 'blue',
  },
  {
    id: 'rh',
    title: 'Ressources humaines',
    eyebrow: 'Référentiel humain',
    description: 'Centralisez collaborateurs, services, postes, documents et organigramme, avec ou sans compte utilisateur.',
    highlights: ['Dossiers collaborateurs', 'Structure et conformité'],
    icon: UsersRound,
    tone: 'amber',
  },
  {
    id: 'planning',
    title: 'Planning',
    eyebrow: 'Organisation équipe',
    description: 'Planifiez les affectations à partir de RH, contrôlez conflits et absences, gérez les remplacements puis publiez la période.',
    highlights: ['Jour, semaine, mois et année', 'Émargement, rotations et exports'],
    icon: CalendarDays,
    tone: 'blue',
  },
  {
    id: 'marges',
    title: 'Cours des produits',
    eyebrow: 'Veille économique',
    description: 'Suivez les cotations RNM FranceAgriMer, leurs historiques et vos favoris sans les confondre avec vos prix facturés.',
    highlights: ['Recherche et secteurs', 'Tendances et favoris personnels'],
    icon: LineChart,
    tone: 'emerald',
  },
];

const workflows = [
  {
    title: 'De l’achat à la marge',
    description: 'Une réception alimente le stock et les prix, puis met à jour le coût des recettes et les indicateurs matière.',
    steps: ['Achats', 'Réception', 'Stocks', 'Fiches techniques', 'Coûts'],
  },
  {
    title: 'Du menu au poste de travail',
    description: 'Les menus s’appuient sur les fiches existantes, génèrent les fabrications et les placent dans le planning des tâches.',
    steps: ['Menus', 'Fiches', 'Campagnes', 'Tâches', 'Brigade'],
  },
  {
    title: 'Du terrain au pilotage',
    description: 'Les équipes saisissent les contrôles HACCP et l’activité opérationnelle ; les responsables retrouvent alertes et rapports.',
    steps: ['Mobile', 'Contrôles', 'Alertes', 'Rapports', 'Audit'],
  },
];

export function LandingPage() {
  return (
    <div className="landing-shell">
      <header className="landing-header">
        <div className="container landing-nav">
          <a className="landing-brand" href="/" aria-label="Accueil ToqueHub">
            <span className="landing-brand-mark"><ChefHat size={20} /></span>
            <span>TOQUE<strong>HUB</strong></span>
          </a>
          <nav className="landing-links" aria-label="Navigation principale">
            <a href="#modules">Modules</a>
            <a href="#workflows">Parcours</a>
            <a href="#interactive-simulator">Démonstration</a>
            <a href="#architecture">Architecture</a>
            <a href="/documentation">Documentation</a>
          </nav>
          <div className="landing-actions">
            <a href="http://localhost:5173/login" className="btn btn-secondary">Connexion</a>
            <a href="http://localhost:5173" className="btn btn-primary">Ouvrir ToqueHub <ArrowRight size={14} /></a>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-orb landing-orb-one" />
          <div className="landing-orb landing-orb-two" />
          <div className="container landing-hero-grid">
            <motion.div
              className="landing-hero-copy"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
            >
              <span className="landing-kicker"><Server size={14} /> ERP local-first pour cuisines professionnelles</span>
              <h1>Une seule chaîne de données, <em>du fournisseur au service.</em></h1>
              <p>
                ToqueHub relie stocks, achats, recettes, production, menus, HACCP, équipes et finance dans un environnement modulaire. Chaque métier garde son espace, sans recréer les mêmes produits, personnes ou chiffres.
              </p>
              <div className="landing-hero-actions">
                <a href="http://localhost:5173" className="btn btn-primary">Accéder à l’instance <ArrowRight size={15} /></a>
                <a href="/documentation" className="btn btn-secondary"><BookOpen size={15} /> Consulter le guide</a>
              </div>
              <div className="landing-proof-row">
                <span><CheckCircle2 size={16} /> 10 espaces métier</span>
                <span><CheckCircle2 size={16} /> Droits par rôle</span>
                <span><CheckCircle2 size={16} /> Données auditables</span>
              </div>
            </motion.div>

            <motion.div
              className="landing-product-preview"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, delay: 0.12 }}
            >
              <div className="preview-window-bar"><span /><span /><span /><small>Vue établissement</small></div>
              <div className="preview-headline">
                <div><small>AUJOURD’HUI</small><h2>Votre activité, reliée</h2></div>
                <span className="preview-live"><Activity size={13} /> Synchronisé</span>
              </div>
              <div className="preview-kpis">
                <PreviewKpi icon={Package} label="Stock valorisé" value="24 860 €" detail="3 seuils à traiter" />
                <PreviewKpi icon={Factory} label="Fabrications" value="18" detail="12 planifiées" />
                <PreviewKpi icon={ShieldCheck} label="HACCP" value="94 / 100" detail="1 alerte ouverte" />
                <PreviewKpi icon={BarChart3} label="Ventes" value="+ 8,4 %" detail="vs période précédente" />
              </div>
              <div className="preview-flow">
                <div><ShoppingCart size={15} /><span>Réception validée</span><strong>+ 42 lignes</strong></div>
                <div><Utensils size={15} /><span>Menu publié</span><strong>320 convives</strong></div>
                <div><CalendarDays size={15} /><span>Planning équipe</span><strong>Complet</strong></div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="landing-stat-strip" aria-label="Points clés">
          <div className="container">
            <div><strong>Local-first</strong><span>Le cœur applicatif et la base restent sur votre infrastructure.</span></div>
            <div><strong>Modulaire</strong><span>Activez les espaces selon les dépendances et votre maturité.</span></div>
            <div><strong>Multi-activité</strong><span>Restaurant ou café, traiteur et cuisine centrale/collective.</span></div>
            <div><strong>Sourcé</strong><span>Historique, origine et couverture accompagnent les décisions.</span></div>
          </div>
        </section>

        <section id="modules" className="landing-section">
          <div className="container">
            <SectionHeading
              eyebrow="Écosystème ToqueHub"
              title="Tous les modules réellement disponibles"
              description="Le catalogue ci-dessous reflète les espaces aujourd’hui installables dans l’application et leurs responsabilités réelles."
            />
            <div className="module-grid">
              {modules.map((module) => <ModuleFeature key={module.id} module={module} />)}
            </div>
          </div>
        </section>

        <section id="workflows" className="landing-section landing-workflows-section">
          <div className="container">
            <SectionHeading
              eyebrow="Données interconnectées"
              title="Des parcours complets, pas des silos"
              description="Chaque module produit une donnée que le suivant consomme. Le guide utilisateur précise les prérequis, contrôles et erreurs à éviter."
            />
            <div className="workflow-grid">
              {workflows.map((workflow, index) => (
                <article className="workflow-card" key={workflow.title}>
                  <span className="workflow-index">0{index + 1}</span>
                  <Workflow size={21} />
                  <h3>{workflow.title}</h3>
                  <p>{workflow.description}</p>
                  <div className="workflow-steps">
                    {workflow.steps.map((step, stepIndex) => (
                      <span key={step}>{step}{stepIndex < workflow.steps.length - 1 ? <ArrowRight size={12} /> : null}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            <a className="landing-text-link" href="/documentation">Voir les procédures détaillées <ArrowRight size={15} /></a>
          </div>
        </section>

        <section className="landing-section simulator-section">
          <div className="container">
            <InteractiveSimulator />
          </div>
        </section>

        <section id="architecture" className="landing-section architecture-section">
          <div className="container architecture-grid">
            <div>
              <span className="landing-kicker"><Database size={14} /> Architecture & souveraineté</span>
              <h2>Le cœur reste local. Les connexions externes restent choisies.</h2>
              <p>
                L’interface, l’API métier et PostgreSQL fonctionnent sur l’infrastructure de l’établissement. Les intégrations externes — cotations RNM, comptabilité, caisses, messagerie ou analyse assistée — sont optionnelles et nécessitent une connexion lorsqu’elles sont utilisées.
              </p>
              <div className="architecture-points">
                <span><Server size={18} /><span><strong>Instance locale</strong> PC, serveur ou appliance Raspberry Pi selon le déploiement.</span></span>
                <span><Database size={18} /><span><strong>Base relationnelle</strong> Une source de vérité partagée entre les modules.</span></span>
                <span><ShieldCheck size={18} /><span><strong>Accès maîtrisés</strong> Comptes individuels, rôles, permissions et audit.</span></span>
                <span><Smartphone size={18} /><span><strong>Terrain synchronisé</strong> Application mobile dédiée aux opérations HACCP.</span></span>
              </div>
            </div>
            <div className="architecture-map" aria-label="Architecture de ToqueHub">
              <div className="architecture-node architecture-core"><ChefHat size={22} /><strong>ToqueHub Core</strong><span>API métier + PostgreSQL</span></div>
              <div className="architecture-node"><UsersRound size={20} /><strong>Web</strong><span>Gestion & pilotage</span></div>
              <div className="architecture-node"><Smartphone size={20} /><strong>Mobile</strong><span>Contrôles terrain</span></div>
              <div className="architecture-node"><Thermometer size={20} /><strong>IoT</strong><span>Capteurs locaux</span></div>
              <div className="architecture-node"><Activity size={20} /><strong>Connecteurs</strong><span>Services choisis</span></div>
            </div>
          </div>
        </section>

        <section className="landing-cta-section">
          <div className="container">
            <div className="landing-cta-card">
              <span className="landing-kicker"><ChefHat size={14} /> Prêt à travailler</span>
              <h2>Commencez par le socle, puis activez chaque métier au bon moment.</h2>
              <p>Le parcours recommandé part des référentiels et de Stocks, avant les recettes, la production, les menus et les modules de pilotage.</p>
              <div>
                <a href="http://localhost:5173" className="btn btn-primary">Ouvrir ToqueHub <ArrowRight size={15} /></a>
                <a href="/documentation#parcours" className="btn btn-secondary">Voir le parcours de déploiement</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="container">
          <div className="landing-brand"><span className="landing-brand-mark"><ChefHat size={18} /></span><span>TOQUE<strong>HUB</strong></span></div>
          <p>ERP libre et local-first pour cuisines professionnelles · Licence AGPLv3.</p>
          <div><a href="/documentation"><BookOpen size={14} /> Guide utilisateur</a><a href="http://localhost:3000/api/docs"><Database size={14} /> API</a></div>
        </div>
      </footer>
    </div>
  );
}

function PreviewKpi({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return <div className="preview-kpi"><span><Icon size={16} /></span><small>{label}</small><strong>{value}</strong><em>{detail}</em></div>;
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="section-heading"><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>;
}

function ModuleFeature({ module }: { module: ModuleCard }) {
  const Icon = module.icon;
  return (
    <article className={`module-card module-${module.tone}`}>
      <div className="module-card-top"><span className="module-icon"><Icon size={20} /></span><span>{module.eyebrow}</span></div>
      <h3>{module.title}</h3>
      <p>{module.description}</p>
      <ul>{module.highlights.map((highlight) => <li key={highlight}><CheckCircle2 size={14} /> {highlight}</li>)}</ul>
      <a href={`/documentation#${module.id}`}>Consulter le module <ArrowRight size={14} /></a>
    </article>
  );
}
