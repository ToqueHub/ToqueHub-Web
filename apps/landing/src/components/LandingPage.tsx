import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  ChefHat, 
  Sparkles, 
  ArrowRight, 
  Layers, 
  ShieldAlert, 
  Database, 
  Activity, 
  BookOpen, 
  Server,
  Globe,
  Settings,
  Lock
} from 'lucide-react';
import { InteractiveSimulator } from './InteractiveSimulator';

export function LandingPage() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);

  // Mouse move for subtle warm light tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseMoveEvent) => {
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect();
        setMousePosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div style={{ position: 'relative', overflow: 'hidden', minHeight: '100vh', background: 'var(--bg-slate)' }}>
      {/* Soft tracking spotlight for elegant sheen */}
      <div 
        className="spotlight"
        style={{
          left: `${mousePosition.x}px`,
          top: `${mousePosition.y}px`,
        }}
      />

      {/* HEADER / NAVBAR */}
      <header style={{ 
        position: 'sticky', 
        top: 0, 
        zIndex: 100, 
        background: 'rgba(248, 250, 252, 0.85)', 
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-light)',
        padding: '1.25rem 0'
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{ 
              width: '38px', 
              height: '38px', 
              borderRadius: '10px',
              background: 'var(--primary-emerald)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
            }}>
              <ChefHat size={20} />
            </div>
            <span style={{ 
              fontWeight: 700, 
              fontSize: '1.25rem', 
              fontFamily: 'var(--font-heading)', 
              letterSpacing: '-0.02em',
              color: 'var(--text-dark)'
            }}>
              TOQUE<span style={{ color: 'var(--primary-emerald)' }}>HUB</span>
            </span>
          </div>

          <nav style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            <a href="#features" style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="nav-link">Modules</a>
            <a href="/documentation" style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="nav-link">Documentation</a>
            <a href="#interactive-simulator" style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="nav-link">Démonstration</a>
            <a href="#architecture" style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="nav-link">Architecture</a>
            <span className="badge-neon badge-neon-emerald" style={{ fontSize: '0.68rem', border: '1px solid var(--border-light)' }}>
              <Server size={10} style={{ marginRight: '0.2rem' }} /> Serveur Local
            </span>
          </nav>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <a 
              href="http://localhost:5173/login" 
              className="btn btn-secondary" 
              style={{ padding: '0.55rem 1.25rem', fontSize: '0.8rem' }}
            >
              Connexion
            </a>
            <a 
              href="http://localhost:5173" 
              className="btn btn-primary" 
              style={{ padding: '0.55rem 1.25rem', fontSize: '0.8rem' }}
            >
              Lancer ToqueHub <ArrowRight size={12} />
            </a>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section ref={heroRef} style={{ padding: '7rem 0 5rem', position: 'relative' }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '4rem', alignItems: 'center' }}>
          
          {/* Left Text Column */}
          <div style={{ position: 'relative', zIndex: 10 }}>
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'var(--primary-emerald-glow)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.35rem 0.85rem', borderRadius: '6px', marginBottom: '1.5rem' }}
            >
              <Sparkles size={12} color="var(--primary-emerald)" />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--primary-emerald)' }}>
                ERP Moderne pour Cuisines Professionnelles
              </span>
            </motion.div>

            <motion.h1 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              style={{ fontSize: '3.75rem', lineHeight: 1.15, fontWeight: 800, marginBottom: '1.5rem', fontFamily: 'var(--font-heading)' }}
            >
              Le logiciel de gestion <br />
              conçu pour votre <span style={{ color: 'var(--primary-emerald)' }}>Brigade de Cuisine</span>
            </motion.h1>

            <motion.p 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              style={{ fontSize: '1.05rem', lineHeight: 1.6, marginBottom: '2.5rem', color: 'var(--text-muted)', maxWidth: '540px' }}
            >
              Fini les tableurs et les feuilles volantes. Un cœur ERP relationnel souverain et modulaire pour piloter vos stocks, fiches techniques et la traçabilité HACCP au quotidien.
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}
            >
              <a href="http://localhost:5173" className="btn btn-primary" style={{ padding: '0.95rem 1.85rem' }}>
                Installer ToqueHub (Local) <ArrowRight size={14} />
              </a>
              <a href="#interactive-simulator" className="btn btn-secondary" style={{ padding: '0.95rem 1.85rem' }}>
                Démo interactive
              </a>
            </motion.div>
          </div>

          {/* Right Floating Elements Column */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            {/* Elegant UI Panel Card */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="glass-card" 
              style={{ 
                width: '310px', 
                border: '1px solid var(--border-light)',
                boxShadow: '0 15px 35px rgba(15, 23, 42, 0.04)',
                padding: '1.5rem',
                borderRadius: '16px',
                zIndex: 2,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.65rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <Activity size={14} color="var(--primary-emerald)" />
                  <span style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activité Récente</span>
                </div>
                <span className="badge-neon badge-neon-emerald" style={{ fontSize: '0.6rem' }}>Online</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  { name: "Filet de Boeuf Aubrac", details: "+15.0 kg - Livraison Grossiste", qty: "En stock", color: "var(--primary-emerald)" },
                  { name: "Sonde Chambre Froide 1", details: "Rapport régulier d'activité", qty: "+3.2 °C", color: "var(--text-dark)" }
                ].map((item, idx) => (
                  <div key={idx} style={{ padding: '0.75rem', background: 'var(--bg-slate)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{item.name}</span>
                      <span style={{ fontSize: '0.8rem', color: item.color, fontWeight: 700 }}>{item.qty}</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{item.details}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Behind UI Mockup Card */}
            <motion.div 
              initial={{ opacity: 0, x: 25 }}
              animate={{ opacity: 0.95, x: 20 }}
              transition={{ duration: 0.7, delay: 0.15 }}
              className="glass-card"
              style={{
                position: 'absolute',
                width: '260px',
                right: '-15px',
                top: '-40px',
                padding: '1.25rem',
                border: '1px solid var(--border-light)',
                borderRadius: '16px',
                zIndex: 1,
                background: '#ffffff'
              }}
            >
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <Layers size={12} color="var(--accent-brass)" />
                <span style={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Marge Ingrédients</span>
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-brass)' }}>74.5 %</div>
              <div style={{ height: '3px', background: 'var(--border-light)', borderRadius: '99px', marginTop: '0.5rem', overflow: 'hidden' }}>
                <div style={{ width: '74.5%', height: '100%', background: 'var(--accent-brass)' }}></div>
              </div>
            </motion.div>
          </div>

        </div>
      </section>

      <div className="container">
        <div className="decorative-line" />
      </div>

      {/* CORE FEATURES MODULES SECTION */}
      <section id="features" style={{ padding: '5rem 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <span className="badge-neon badge-neon-blue" style={{ marginBottom: '0.75rem', border: '1px solid var(--border-light)' }}>
              Écosystème Logiciel
            </span>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.75rem', fontFamily: 'var(--font-heading)' }}>
              Un Cœur Applicatif Structuré
            </h2>
            <p style={{ maxWidth: '580px', margin: '0 auto', fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              Gérez votre établissement avec rigueur grâce à nos modules interconnectés partageant la même base de données locale.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            {/* FEATURE 1: STOCKS */}
            <TiltCard 
              title="Suivi de Stock Strict"
              icon={<Database size={18} color="var(--primary-emerald)" />}
              description="Aucune modification directe de stock autorisée. Chaque action crée un mouvement auditable, permettant des calculs de projections précis."
              badgeText="Zéro perte"
              badgeColor="emerald"
            />
            {/* FEATURE 2: TECHNICAL SHEETS */}
            <TiltCard 
              title="Fiches Techniques"
              icon={<ChefHat size={18} color="var(--primary-emerald)" />}
              description="Ajustement automatique des portions et calcul dynamique des coûts d'ingrédients. Suivez l'évolution de vos marges en cuisine."
              badgeText="Calculateur"
              badgeColor="blue"
            />
            {/* FEATURE 3: HACCP COMPLIANCE */}
            <TiltCard 
              title="Sécurité HACCP"
              icon={<ShieldAlert size={18} color="var(--primary-emerald)" />}
              description="Archivage numérique et automatisé de vos relevés de température. Notifications intelligentes en cas de rupture de froid."
              badgeText="Réglementaire"
              badgeColor="purple"
            />
          </div>
        </div>
      </section>

      {/* INTERACTIVE SIMULATOR WRAPPER */}
      <section style={{ padding: '2rem 0 5rem' }}>
        <div className="container">
          <InteractiveSimulator />
        </div>
      </section>

      {/* TECHNOLOGY STACK / ARCHITECTURE SECTION */}
      <section id="architecture" style={{ padding: '5rem 0', background: 'var(--bg-card-secondary)', borderTop: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: '4rem', alignItems: 'center' }}>
            
            {/* Left side text */}
            <div>
              <span className="badge-neon badge-neon-purple" style={{ marginBottom: '0.75rem', border: '1px solid var(--border-light)' }}>
                Technologie &amp; Souveraineté
              </span>
              <h2 style={{ fontSize: '2.5rem', marginBottom: '1.25rem', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
                Architecture Locale-First, <br />
                Indépendante et Sécurisée
              </h2>
              <p style={{ fontSize: '0.95rem', marginBottom: '2rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                ToqueHub s'installe localement sur vos propres machines (PC de bureau ou serveur local en cuisine). Vous gardez la propriété absolue de vos données sans dépendance à des services cloud.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {[
                  { title: "React & TypeScript", desc: "Une interface web fluide, robuste et optimisée pour les écrans tactiles de cuisine." },
                  { title: "Core REST API (NestJS)", desc: "Moteur applicatif performant assurant la validation des règles métier." },
                  { title: "PostgreSQL & Prisma", desc: "Persistance des données relationnelles, sécurisée et facile à sauvegarder ou à exporter." }
                ].map((tech, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '1rem', alignItems: 'start' }}>
                    <div style={{ 
                      width: '24px', 
                      height: '24px', 
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.03)', 
                      border: '1px solid var(--border-light)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--primary-emerald)'
                    }}>
                      {idx + 1}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{tech.title}</h4>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{tech.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right side tech diagram */}
            <div className="glass-card" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2rem', background: '#ffffff', borderRadius: '16px' }}>
              <h3 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-heading)', textAlign: 'center', fontWeight: 700 }}>Flux Applicatifs de l'Instance</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', position: 'relative' }}>
                {/* Node 1 */}
                <div style={{ display: 'flex', justifyContent: 'center', zIndex: 2 }}>
                  <div style={{ 
                    background: '#ffffff', 
                    border: '1px solid var(--border-light)', 
                    borderRadius: '8px',
                    padding: '0.65rem 1.5rem', 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                  }}>
                    <Globe size={14} color="var(--primary-emerald)" />
                    <span style={{ fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client React / Web</span>
                  </div>
                </div>

                {/* Path line 1 */}
                <div style={{ position: 'absolute', left: '50%', top: '35px', bottom: '95px', width: '1px', background: 'var(--border-light)', transform: 'translateX(-50%)', zIndex: 1 }} />

                {/* Node 2 */}
                <div style={{ display: 'flex', justifyContent: 'center', zIndex: 2 }}>
                  <div style={{ 
                    background: '#ffffff', 
                    border: '1px solid var(--primary-emerald)', 
                    borderRadius: '8px',
                    padding: '0.65rem 1.5rem', 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                  }}>
                    <Settings size={14} color="var(--primary-emerald)" />
                    <span style={{ fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary-emerald)' }}>REST Backend API</span>
                  </div>
                </div>

                {/* Path line 2 */}
                <div style={{ position: 'absolute', left: '50%', top: '105px', bottom: '35px', width: '1px', background: 'var(--border-light)', transform: 'translateX(-50%)', zIndex: 1 }} />

                {/* Node 3 */}
                <div style={{ display: 'flex', justifyContent: 'center', zIndex: 2 }}>
                  <div style={{ 
                    background: '#ffffff', 
                    border: '1px solid var(--border-light)', 
                    borderRadius: '8px',
                    padding: '0.65rem 1.5rem', 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                  }}>
                    <Database size={14} color="var(--primary-emerald)" />
                    <span style={{ fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Base PostgreSQL Locale</span>
                  </div>
                </div>
              </div>

              <div style={{ 
                background: 'var(--bg-slate)', 
                border: '1px solid var(--border-light)', 
                borderRadius: '8px',
                padding: '1rem', 
                textAlign: 'center', 
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                lineHeight: 1.45
              }}>
                🔒 <strong>Réseau Local Fermé :</strong> Pas d'accès internet requis en production. Idéal pour les configurations isolées et la traçabilité hors-ligne.
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* FINAL CALL TO ACTION */}
      <section style={{ padding: '6rem 0' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="glass-card" style={{ 
            width: '100%', 
            maxWidth: '920px', 
            padding: '4rem 3rem', 
            textAlign: 'center',
            background: 'radial-gradient(circle at 50% 0%, var(--primary-emerald-glow) 0%, transparent 60%), #ffffff',
            border: '1px solid var(--border-light)',
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '16px'
          }}>
            <ChefHat size={36} color="var(--primary-emerald)" style={{ margin: '0 auto 1.25rem' }} />
            <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem', fontFamily: 'var(--font-heading)' }}>
              Structurez votre cuisine professionnelle dès aujourd'hui
            </h2>
            <p style={{ maxWidth: '520px', margin: '0 auto 2.5rem', fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              Installez l'instance ToqueHub sur votre ordinateur ou serveur local en moins d'une minute.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <a href="http://localhost:5173" className="btn btn-primary" style={{ padding: '0.9rem 2.25rem' }}>
                Lancer la configuration <ArrowRight size={14} />
              </a>
              <a href="http://localhost:5173/login" className="btn btn-secondary" style={{ padding: '0.9rem 2.25rem' }}>
                Accéder à la connexion
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ 
        borderTop: '1px solid var(--border-light)', 
        padding: '3rem 0', 
        background: '#ffffff',
        fontSize: '0.82rem',
        color: 'var(--text-muted)'
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ChefHat size={16} color="var(--primary-emerald)" />
            <span style={{ fontWeight: 700, color: 'var(--text-dark)', fontFamily: 'var(--font-heading)', fontSize: '1rem', letterSpacing: '-0.02em' }}>TOQUEHUB</span>
            <span style={{ fontSize: '0.75rem' }}>— Logiciel Libre de Cuisine</span>
          </div>

          <div>
            Licence AGPLv3. Développé localement pour la maîtrise des données et la traçabilité culinaire.
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <a href="http://localhost:3000/api/docs" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)' }}>
              <BookOpen size={12} /> Documentation de l'API
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// =========================================================================
// CUSTOM TILT CARD COMPONENT FOR 3D ROTATION EFFECT
// =========================================================================
interface TiltCardProps {
  title: string;
  icon: React.ReactNode;
  description: string;
  badgeText: string;
  badgeColor: 'emerald' | 'blue' | 'purple';
}

function TiltCard({ title, icon, description, badgeText, badgeColor }: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    
    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    const mouseX = e.clientX - rect.left - width / 2;
    const mouseY = e.clientY - rect.top - height / 2;
    
    const rX = -(mouseY / (height / 2)) * 4;
    const rY = (mouseX / (width / 2)) * 4;
    
    setRotateX(rX);
    setRotateY(rY);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  return (
    <div 
      ref={cardRef}
      className="tilt-card-wrapper"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div 
        className="glass-card tilt-card" 
        style={{
          transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
          transformStyle: 'preserve-3d',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '1.5rem',
          borderRadius: '16px'
        }}
      >
        <div style={{ transform: 'translateZ(10px)' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '8px',
            background: 'var(--primary-emerald-glow)', 
            border: '1px solid rgba(16, 185, 129, 0.2)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            marginBottom: '1.25rem'
          }}>
            {icon}
          </div>
          
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-heading)', marginBottom: '0.5rem' }}>{title}</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>{description}</p>
        </div>

        <div style={{ transform: 'translateZ(5px)' }}>
          <span className={`badge-neon badge-neon-${badgeColor}`}>
            {badgeText}
          </span>
        </div>
      </div>
    </div>
  );
}

// Temporary Type Definition overrides for window listeners
interface MouseMoveEvent extends MouseEvent {
  clientX: number;
  clientY: number;
}
