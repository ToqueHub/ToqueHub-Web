import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChefHat, 
  Package, 
  ShieldCheck, 
  Calendar, 
  Utensils, 
  DollarSign, 
  Plus, 
  AlertTriangle, 
  Thermometer, 
  Clock, 
  User, 
  CheckCircle2 
} from 'lucide-react';

type SimulatorTab = 'recipes' | 'stock' | 'haccp' | 'planning';

export function InteractiveSimulator() {
  const [activeTab, setActiveTab] = useState<SimulatorTab>('recipes');

  // Recipes Tab State
  const [portions, setPortions] = useState(60);
  const baseRecipe = {
    name: "Blanquette de Veau Traditionnelle",
    basePortions: 10,
    costPerPortion: 3.45,
    ingredients: [
      { name: "Épaule de veau", qty: 1.8, unit: "kg" },
      { name: "Carottes fraîches", qty: 0.6, unit: "kg" },
      { name: "Champignons de Paris", qty: 0.4, unit: "kg" },
      { name: "Crème fraîche 35%", qty: 0.25, unit: "L" },
      { name: "Beurre doux", qty: 0.1, unit: "kg" },
      { name: "Bouillon de légumes", qty: 1.5, unit: "L" }
    ]
  };

  // Stock Tab State
  const [stocks, setStocks] = useState([
    { id: 1, name: "Filet de Boeuf Charolais", qty: 12.5, unit: "kg", threshold: 5.0, status: "ok" },
    { id: 2, name: "Crème Liquide UHT 35%", qty: 45, unit: "L", threshold: 10, status: "ok" },
    { id: 3, name: "Beurre de Baratte demi-sel", qty: 4, unit: "kg", threshold: 8, status: "warning" },
    { id: 4, name: "Pavé de Saumon Label Rouge", qty: 3.2, unit: "kg", threshold: 4.0, status: "warning" },
  ]);
  const [stockMoves, setStockMoves] = useState([
    { id: 1, type: "Sortie (Cuisine)", qty: -3.5, unit: "kg", item: "Filet de Boeuf Charolais", date: "Il y a 5 min" },
    { id: 2, type: "Réception (Grossiste)", qty: 20, unit: "L", item: "Crème Liquide UHT 35%", date: "Il y a 1h" },
  ]);

  const handleAddStock = (itemId: number) => {
    setStocks(prev => prev.map(item => {
      if (item.id === itemId) {
        const nextQty = item.qty + 10;
        return { ...item, qty: nextQty, status: nextQty > item.threshold ? 'ok' : 'warning' };
      }
      return item;
    }));
    
    const targetItem = stocks.find(i => i.id === itemId);
    if (targetItem) {
      setStockMoves(prev => [
        {
          id: Date.now(),
          type: "Réception Stock",
          qty: 10,
          unit: targetItem.unit,
          item: targetItem.name,
          date: "À l'instant"
        },
        ...prev
      ]);
    }
  };

  // HACCP State
  const [temp, setTemp] = useState(3.2);
  const isTempAlert = temp > 4.0;

  // Planning State
  const [shifts, setShifts] = useState<Record<string, string>>({
    "Mario (Chef)": "Matin",
    "Luigi (Sous-chef)": "Soir",
    "Peach (Commis)": "Repos",
    "Yoshi (Apprenti)": "Matin"
  });

  const toggleShift = (person: string) => {
    const roles = ["Matin", "Soir", "Repos"];
    const current = shifts[person];
    const nextIdx = (roles.indexOf(current) + 1) % roles.length;
    setShifts(prev => ({ ...prev, [person]: roles[nextIdx] }));
  };

  return (
    <div id="interactive-simulator" className="glass-card" style={{ padding: '2.5rem', marginTop: '3rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <span className="badge-neon badge-neon-emerald" style={{ marginBottom: '0.75rem' }}>
          <ChefHat size={12} style={{ marginRight: '0.2rem' }} /> Démo Interactive
        </span>
        <h2 style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>
          Testez le Cœur Métier de <span style={{ color: 'var(--primary-emerald)' }}>ToqueHub</span>
        </h2>
        <p style={{ maxWidth: '600px', margin: '0 auto', fontSize: '0.95rem', color: 'var(--text-muted)' }}>
          Une interface de contrôle intuitive conçue pour simplifier la vie de votre brigade. Ajustez les données pour voir le simulateur réagir.
        </p>
      </div>

      {/* Tabs Navigation */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '1.25rem', 
        marginBottom: '2.5rem', 
        flexWrap: 'wrap',
        borderBottom: '1px solid var(--border-light)',
        paddingBottom: '0.2rem'
      }}>
        <button 
          id="sim-tab-recipes"
          className={`simulator-tab ${activeTab === 'recipes' ? 'active' : ''}`}
          onClick={() => setActiveTab('recipes')}
        >
          <Utensils size={14} /> Fiches Techniques
        </button>
        <button 
          id="sim-tab-stock"
          className={`simulator-tab ${activeTab === 'stock' ? 'active' : ''}`}
          onClick={() => setActiveTab('stock')}
        >
          <Package size={14} /> Suivi des Stocks
        </button>
        <button 
          id="sim-tab-haccp"
          className={`simulator-tab ${activeTab === 'haccp' ? 'active' : ''}`}
          onClick={() => setActiveTab('haccp')}
        >
          <ShieldCheck size={14} /> Traçabilité HACCP
        </button>
        <button 
          id="sim-tab-planning"
          className={`simulator-tab ${activeTab === 'planning' ? 'active' : ''}`}
          onClick={() => setActiveTab('planning')}
        >
          <Calendar size={14} /> Plannings RH
        </button>
      </div>

      {/* Simulator Content Area */}
      <div style={{ minHeight: '380px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <AnimatePresence mode="wait">
          
          {/* TAB 1: RECIPES */}
          {activeTab === 'recipes' && (
            <motion.div
              key="recipes"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '2.5rem', alignItems: 'start' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{baseRecipe.name}</h3>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Coût de revient : {(baseRecipe.costPerPortion).toFixed(2)} € / portion
                    </span>
                  </div>
                  <span className="badge-neon badge-neon-emerald">Recette active</span>
                </div>

                <div style={{ background: 'var(--bg-slate)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portions</span>
                    <span style={{ fontWeight: 700, color: 'var(--primary-emerald)', fontSize: '1.6rem' }}>{portions} couverts</span>
                  </div>
                  <input 
                    id="portions-slider"
                    type="range" 
                    min="10" 
                    max="200" 
                    step="5" 
                    value={portions} 
                    onChange={(e) => setPortions(parseInt(e.target.value))}
                    style={{ 
                      width: '100%', 
                      height: '4px', 
                      borderRadius: '99px',
                      background: 'rgba(0,0,0,0.1)',
                      outline: 'none',
                      cursor: 'pointer',
                      accentColor: 'var(--primary-emerald)'
                    }} 
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    {[20, 50, 100, 150].map(p => (
                      <button 
                        key={p} 
                        className="btn btn-secondary" 
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderRadius: '8px' }}
                        onClick={() => setPortions(p)}
                      >
                        {p}p
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ border: '1px solid var(--border-light)', padding: '1rem', borderRadius: '12px', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coût Total Matériaux</span>
                    <span style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--primary-emerald)', marginTop: '0.2rem' }}>{(portions * baseRecipe.costPerPortion).toFixed(2)} €</span>
                  </div>
                  <div style={{ border: '1px solid var(--border-light)', padding: '1rem', borderRadius: '12px', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Facturation suggérée (Coef 3.3)</span>
                    <span style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-dark)', marginTop: '0.2rem' }}>{(portions * baseRecipe.costPerPortion * 3.3).toFixed(2)} €</span>
                  </div>
                </div>
              </div>

              {/* Recipe Ingredients Scaling List */}
              <div style={{ 
                border: '1px solid var(--border-light)', 
                background: '#ffffff',
                borderRadius: '12px',
                padding: '1.25rem',
                maxHeight: '340px',
                overflowY: 'auto'
              }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em', display: 'block', marginBottom: '0.75rem' }}>
                  Ingrédients nécessaires :
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {baseRecipe.ingredients.map((ing, idx) => {
                    const factor = portions / baseRecipe.basePortions;
                    const scaledQty = ing.qty * factor;
                    return (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          paddingBottom: '0.5rem', 
                          borderBottom: '1px solid var(--bg-slate)',
                          alignItems: 'center'
                        }}
                      >
                        <span style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--text-dark)' }}>{ing.name}</span>
                        <span style={{ fontWeight: 700, color: 'var(--primary-emerald)' }}>
                          {scaledQty.toFixed(scaledQty % 1 === 0 ? 0 : 2)} {ing.unit}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: STOCK */}
          {activeTab === 'stock' && (
            <motion.div
              key="stock"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '2.5rem', alignItems: 'start' }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Inventaire Réel</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Simuler une réception via <Plus size={10} /></span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {stocks.map(item => (
                    <div 
                      key={item.id} 
                      style={{ 
                        background: '#ffffff', 
                        padding: '0.85rem 1.1rem', 
                        borderRadius: '12px', 
                        border: '1px solid var(--border-light)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</div>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.15rem' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Seuil &lt; {item.threshold} {item.unit}</span>
                          <span className={`badge-neon ${item.status === 'ok' ? 'badge-neon-emerald' : 'badge-neon-blue'}`} style={{ fontSize: '0.62rem', padding: '0.05rem 0.35rem' }}>
                            {item.status === 'ok' ? 'En stock' : 'Réappro requis'}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '1.1rem', color: item.status === 'ok' ? 'var(--text-dark)' : 'var(--accent-brass)' }}>
                          {item.qty.toFixed(1)} {item.unit}
                        </span>
                        <button 
                          className="btn btn-primary"
                          onClick={() => handleAddStock(item.id)}
                          style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', boxShadow: 'none' }}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Stock Movements Log */}
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem' }}>Projections &amp; Flux</h3>
                <div style={{ 
                  background: '#ffffff', 
                  border: '1px solid var(--border-light)', 
                  borderRadius: '12px', 
                  padding: '1.25rem',
                  minHeight: '260px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Mouvements de stock récents :
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <AnimatePresence initial={false}>
                      {stockMoves.map(move => (
                        <motion.div 
                          key={move.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          style={{ 
                            padding: '0.65rem 0.85rem', 
                            background: 'var(--bg-slate)', 
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.8rem'
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--primary-emerald)' }}>
                              {move.type}
                            </span>
                            <div style={{ color: 'var(--text-dark)', marginTop: '0.1rem' }}>{move.item}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontWeight: 700, color: move.qty > 0 ? 'var(--primary-emerald)' : 'var(--text-muted)' }}>
                              {move.qty > 0 ? `+${move.qty}` : move.qty} {move.unit}
                            </span>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{move.date}</div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 3: HACCP */}
          {activeTab === 'haccp' && (
            <motion.div
              key="haccp"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '2.5rem', alignItems: 'center' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.25rem' }}>Terminal de Température Froid</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Utilisez le slider pour simuler un dysfonctionnement du réfrigérateur.</p>
                </div>

                <div style={{ 
                  background: '#ffffff', 
                  border: isTempAlert ? '1px solid var(--accent-brass)' : '1px solid var(--border-light)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <div style={{ 
                      width: '40px', 
                      height: '40px', 
                      borderRadius: '8px',
                      background: isTempAlert ? 'rgba(168,142,106,0.1)' : 'var(--primary-emerald-glow)',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: isTempAlert ? 'var(--accent-brass)' : 'var(--primary-emerald)'
                    }}>
                      <Thermometer size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Chambre Froide Positive 1</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Température réglementaire &le; +4.0 °C</div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ 
                      fontSize: '1.75rem', 
                      fontWeight: 700, 
                      color: isTempAlert ? 'var(--accent-brass)' : 'var(--primary-emerald)',
                      transition: 'color 0.2s ease'
                    }}>
                      {temp.toFixed(1)} °C
                    </span>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: isTempAlert ? 'var(--accent-brass)' : 'var(--primary-emerald)' }}>
                      {isTempAlert ? 'RUPTURE FROID' : 'CONFORME'}
                    </div>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-slate)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>
                    <span>Curseur de Simulation Sonde</span>
                    <span>Consigne : 3.0 °C</span>
                  </div>
                  <input 
                    id="temp-slider"
                    type="range" 
                    min="1.0" 
                    max="9.0" 
                    step="0.1" 
                    value={temp} 
                    onChange={(e) => setTemp(parseFloat(e.target.value))}
                    style={{ 
                      width: '100%', 
                      height: '4px', 
                      borderRadius: '99px',
                      background: 'rgba(0,0,0,0.1)',
                      outline: 'none',
                      cursor: 'pointer',
                      accentColor: 'var(--primary-emerald)'
                    }} 
                  />
                </div>
              </div>

              {/* HACCP Alert / Safety Ticket Popup */}
              <div style={{ position: 'relative', height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AnimatePresence mode="wait">
                  {isTempAlert ? (
                    <motion.div
                      key="alert-ticket"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      style={{
                        background: '#ffffff',
                        border: '1px solid var(--accent-brass)',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.03)',
                        width: '100%'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--accent-brass)', marginBottom: '0.75rem' }}>
                        <AlertTriangle size={18} />
                        <div>
                          <h4 style={{ color: 'var(--text-dark)', fontSize: '0.95rem', fontWeight: 700 }}>Alerte HACCP Déclenchée</h4>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Déviation de température enregistrée</span>
                        </div>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem', lineHeight: 1.45 }}>
                        ToqueHub a généré un ticket d'anomalie HACCP automatique. Actions réglementaires requises :
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <button className="btn btn-primary" style={{ background: 'var(--accent-brass)', fontSize: '0.75rem', padding: '0.55rem', borderRadius: '6px' }} onClick={() => setTemp(2.8)}>
                          Forcer le dégivrage &amp; acquitter
                        </button>
                        <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.55rem', borderRadius: '6px' }} onClick={() => setTemp(2.8)}>
                          Déclarer incident &amp; écarter lot
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="safety-ok"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      style={{
                        background: '#ffffff',
                        border: '1px solid var(--border-light)',
                        borderRadius: '12px',
                        padding: '2rem',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '1rem',
                        width: '100%'
                      }}
                    >
                      <div style={{ 
                        width: '44px', 
                        height: '44px', 
                        borderRadius: '50%', 
                        background: 'var(--primary-emerald-glow)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        color: 'var(--primary-emerald)'
                      }}>
                        <CheckCircle2 size={24} />
                      </div>
                      <div>
                        <h4 style={{ color: 'var(--text-dark)', fontSize: '1.1rem', fontWeight: 700 }}>Système Conforme</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Toutes les sondes de stockage transmettent des rapports d'activité conformes.</p>
                      </div>
                      <span className="badge-neon badge-neon-emerald" style={{ fontSize: '0.65rem' }}>
                        Auto-surveillance active
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* TAB 4: PLANNING */}
          {activeTab === 'planning' && (
            <motion.div
              key="planning"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '2.5rem', alignItems: 'start' }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Planning de Brigade</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Changer de shift par clic</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {Object.entries(shifts).map(([person, shift]) => (
                    <div 
                      key={person} 
                      style={{ 
                        background: '#ffffff', 
                        padding: '0.85rem 1.1rem', 
                        borderRadius: '12px', 
                        border: '1px solid var(--border-light)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{ 
                          width: '28px', 
                          height: '28px', 
                          borderRadius: '50%', 
                          background: 'var(--primary-emerald-glow)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          color: 'var(--primary-emerald)'
                        }}>
                          <User size={14} />
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{person}</span>
                      </div>
                      
                      <button 
                        className={`badge-neon ${
                          shift === 'Matin' ? 'badge-neon-emerald' : 
                          shift === 'Soir' ? 'badge-neon-blue' : 'badge-neon-purple'
                        }`}
                        onClick={() => toggleShift(person)}
                        style={{ 
                          cursor: 'pointer',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          height: 'auto',
                          width: 'auto',
                          boxShadow: 'none',
                          border: '1px solid var(--border-light)'
                        }}
                      >
                        <Clock size={10} style={{ marginRight: '0.2rem' }} />
                        {shift}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Planning Summary / Stats */}
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem' }}>Couverture du Service</h3>
                <div style={{ 
                  background: '#ffffff', 
                  border: '1px solid var(--border-light)', 
                  borderRadius: '12px', 
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                      <span>Brigade Matin</span>
                      <span style={{ color: 'var(--primary-emerald)' }}>2 Chefs actifs</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--border-light)', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ width: '100%', height: '100%', background: 'var(--primary-emerald)' }}></div>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                      <span>Brigade Soir</span>
                      <span style={{ color: 'var(--accent-brass)' }}>1 Chef actif</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--border-light)', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ width: '50%', height: '100%', background: 'var(--accent-brass)' }}></div>
                    </div>
                  </div>

                  <div style={{ 
                    marginTop: '0.5rem',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-slate)', 
                    padding: '0.85rem', 
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.45
                  }}>
                    💡 <strong>Assistant Planning :</strong> ToqueHub vérifie les effectifs requis. Une alerte de sous-effectif est déclenchée pour le service du Soir (présence minimale de 2 cuisiniers requise).
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
