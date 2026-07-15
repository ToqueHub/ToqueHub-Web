'use client';

import React, { useState, useEffect } from 'react';

// Mock data to provide a seamless "Demo Mode" fallback if the database is not set up yet
const MOCK_PRODUCTS = [
  { name: 'tomate', label: 'Tomate', category: 'Légumes > Légumes frais' },
  { name: 'abricot', label: 'Abricot', category: 'Fruits > Fruits frais > Fruits à noyau' },
  { name: 'agneau', label: 'Agneau', category: 'Viande > Ovins' },
  { name: 'boeuf', label: 'Boeuf', category: 'Viande > Bovins' },
  { name: 'beurre', label: 'Beurre', category: 'Produits Laitiers > Beurre Oeuf Fromage' },
  { name: 'oeuf', label: 'Oeuf', category: 'Produits Laitiers > Beurre Oeuf Fromage' },
  { name: 'cabillaud', label: 'Cabillaud', category: 'Poisson > Pêche et aquaculture' },
  { name: 'carotte', label: 'Carotte', category: 'Légumes > Légumes frais' }
];

const MOCK_PRICES: Record<string, any[]> = {
  tomate: [
    {
      label: { name: 'TOMATE RONDE GRAPPE FRANCE CAT I' },
      market: { name: 'MIN de Rungis : fruits et légumes' },
      stage: 'Grossistes',
      avgPrice: 2.10,
      minPrice: 1.90,
      maxPrice: 2.30,
      variation: -0.15,
      unit: 'le kg',
      date: '2026-06-11'
    },
    {
      label: { name: 'TOMATE RONDE FRANCE CAT I 57-67MM' },
      market: { name: 'Marché de Lyon-Corbas : fruits et légumes' },
      stage: 'Grossistes',
      avgPrice: 1.80,
      minPrice: 1.65,
      maxPrice: 1.95,
      variation: 0.10,
      unit: 'le kg',
      date: '2026-06-11'
    },
    {
      label: { name: 'TOMATE CERISE FRANCE BARQ.250G' },
      market: { name: 'Fruits France DETAIL GMS' },
      stage: 'Détail',
      avgPrice: 1.45,
      minPrice: 1.29,
      maxPrice: 1.59,
      variation: 0.00,
      unit: 'la piece',
      date: '2026-06-11'
    }
  ],
  abricot: [
    {
      label: { name: 'ABRICOT BERGERON RHONE ALPES CAT I 45-50MM' },
      market: { name: 'Marché de Lyon-Corbas carreau : fruits et légumes' },
      stage: 'Marché de producteurs',
      avgPrice: 3.50,
      minPrice: 3.20,
      maxPrice: 3.80,
      variation: 0.00,
      unit: 'le kg',
      date: '2026-06-11'
    },
    {
      label: { name: 'ABRICOT TYPE ORANGE ROUGE ROUSSILLON CAT I 40-45MM' },
      market: { name: 'Bassin Roussillon : fruits et légumes' },
      stage: 'Expédition',
      avgPrice: 2.30,
      minPrice: 2.20,
      maxPrice: 2.40,
      variation: -0.05,
      unit: 'le kg',
      date: '2026-06-11'
    },
    {
      label: { name: 'ABRICOT FRANCE BIOLOGIQUE (LE KG)' },
      market: { name: 'Fruits France DETAIL MAG. SPECIALISES BIO' },
      stage: 'Détail',
      avgPrice: 8.52,
      minPrice: 6.90,
      maxPrice: 9.25,
      variation: 0.45,
      unit: 'le kg',
      date: '2026-06-11'
    }
  ],
  agneau: [
    {
      label: { name: 'AGNEAU (CARRE) U.E. (Y.C. ROYAUME UNI)' },
      market: { name: 'MIN de Rungis : découpes de viande' },
      stage: 'Grossistes',
      avgPrice: 19.05,
      minPrice: 18.00,
      maxPrice: 20.10,
      variation: 1.30,
      unit: 'le kg',
      date: '2026-06-11'
    },
    {
      label: { name: 'AGNEAU (CARCASSE) CIRE 16-22 KG FRANCE CAT. E' },
      market: { name: 'MIN de Rungis : ovins' },
      stage: 'Grossistes',
      avgPrice: 13.30,
      minPrice: 12.80,
      maxPrice: 13.40,
      variation: 0.00,
      unit: 'le kg',
      date: '2026-06-11'
    },
    {
      label: { name: 'AGNEAU (GIGOT) FRANCE' },
      market: { name: 'Viande France DETAIL GMS' },
      stage: 'Détail',
      avgPrice: 26.62,
      minPrice: 22.60,
      maxPrice: 28.95,
      variation: 0.19,
      unit: 'le kg',
      date: '2026-06-11'
    }
  ]
};

const MOCK_GAINERS = [
  { labelName: 'AGNEAU (CARRE) U.E.', productName: 'Agneau', marketName: 'MIN de Rungis', stage: 'Grossistes', currentPrice: 19.05, pctVar: 7.32 },
  { labelName: 'ABRICOT FRANCE BIOLOGIQUE', productName: 'Abricot', marketName: 'DETAIL BIO', stage: 'Détail', currentPrice: 8.52, pctVar: 5.58 },
  { labelName: 'TOMATE RONDE FRANCE CAT I', productName: 'Tomate', marketName: 'Lyon-Corbas', stage: 'Grossistes', currentPrice: 1.80, pctVar: 5.88 }
];

const MOCK_LOSERS = [
  { labelName: 'TOMATE RONDE GRAPPE FRANCE', productName: 'Tomate', marketName: 'MIN de Rungis', stage: 'Grossistes', currentPrice: 2.10, pctVar: -6.67 },
  { labelName: 'ABRICOT ROUSSILLON CAT I', productName: 'Abricot', marketName: 'Bassin Roussillon', stage: 'Expédition', currentPrice: 2.30, pctVar: -2.13 }
];

export default function Home() {
  const [dbMode, setDbMode] = useState<'database' | 'demo'>('demo');
  const [products, setProducts] = useState<any[]>(MOCK_PRODUCTS);
  const [selectedProduct, setSelectedProduct] = useState<string>('tomate');
  const [prices, setPrices] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string>('');

  const [topGainers, setTopGainers] = useState<any[]>(MOCK_GAINERS);
  const [topLosers, setTopLosers] = useState<any[]>(MOCK_LOSERS);
  const [varietyQuery, setVarietyQuery] = useState<string>('');

  // Reset variety filter when selected product changes
  useEffect(() => {
    setVarietyQuery('');
  }, [selectedProduct]);

  // Load products and prices
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Try connecting to Next.js REST API
        const prodRes = await fetch(`/api/market/products?search=${searchQuery}`);
        const prodData = await prodRes.json();
        
        if (prodData.success && prodData.data.length > 0) {
          setProducts(prodData.data);
          setDbMode('database');
          
          // Load prices for selected product from database
          const priceRes = await fetch(`/api/market/prices?productName=${selectedProduct}&limit=300`);
          const priceData = await priceRes.json();
          if (priceData.success) {
            setPrices(priceData.data);
          }
          
          // Load movers
          const gainRes = await fetch('/api/market/top-gainers');
          const gainData = await gainRes.json();
          if (gainData.success) setTopGainers(gainData.data);
          
          const loseRes = await fetch('/api/market/top-losers');
          const loseData = await loseRes.json();
          if (loseData.success) setTopLosers(loseData.data);
          
        } else {
          // Fallback to Demo Mode if DB is empty
          loadDemoData();
        }
      } catch (e) {
        // Fallback to Demo Mode if DB is not connected / API fails
        loadDemoData();
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [selectedProduct, searchQuery]);

  const loadDemoData = () => {
    setDbMode('demo');
    const filteredProducts = MOCK_PRODUCTS.filter(p => 
      p.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setProducts(filteredProducts);
    
    // Load mock prices or empty array
    setPrices(MOCK_PRICES[selectedProduct] || []);
    setTopGainers(MOCK_GAINERS);
    setTopLosers(MOCK_LOSERS);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage('Initialisation de la synchronisation RNM...');
    try {
      // Simulate/trigger trigger route or action
      // In scrap workspace, we trigger sync ciblée for selected product via custom Next.js endpoint if configured
      // Or we can simulate it in demo mode
      if (dbMode === 'demo') {
        await new Promise(resolve => setTimeout(resolve, 2000));
        setSyncMessage('Synchronisation simulée terminée avec succès !');
        // Add items to mock database to show change
        if (selectedProduct === 'tomate') {
          // Modify tomato price to simulate updates
          const updatedTomate = [...MOCK_PRICES.tomate];
          updatedTomate[0] = { ...updatedTomate[0], avgPrice: 2.25, variation: 0.15, date: '2026-06-11' };
          setPrices(updatedTomate);
        }
      } else {
        const res = await fetch('/api/market/trends'); // Trigger active analytics
        setSyncMessage('Mise à jour de la base terminée.');
      }
    } catch (e: any) {
      setSyncMessage(`Échec : ${e.message}`);
    } finally {
      setTimeout(() => {
        setSyncing(false);
        setSyncMessage('');
      }, 3000);
    }
  };

  const formatPrice = (val: any) => {
    if (val === undefined || val === null) return 'N/A';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? 'N/A' : num.toFixed(2);
  };

  const getVariationClass = (val: any) => {
    if (val === undefined || val === null || val === 0 || val === '0') return 'equal';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num) || num === 0) return 'equal';
    return num > 0 ? 'up' : 'down';
  };

  const getVariationSign = (val: any) => {
    if (val === undefined || val === null || val === 0 || val === '0') return '=';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num) || num === 0) return '=';
    return num > 0 ? `+${num.toFixed(2)}` : num.toFixed(2);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="logo-section">
          <div className="logo-icon">T</div>
          <div>
            <h1 className="logo-text">ToqueHub</h1>
            <p className="logo-tag">Marché Alimentaire RNM</p>
          </div>
        </div>
        <div>
          {dbMode === 'demo' ? (
            <span className="badge badge-demo">Mode Démo (PostgreSQL déconnecté)</span>
          ) : (
            <span className="badge badge-db">PostgreSQL Connecté</span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="dashboard-grid">
        {/* Sidebar */}
        <aside className="search-sidebar">
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Produits Disponibles</h3>
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Rechercher un ingrédient..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="product-list">
              {products.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>
                  Aucun produit trouvé
                </p>
              ) : (
                products.map((p) => {
                  const key = p.name || p.label.toLowerCase();
                  return (
                    <button
                      key={key}
                      className={`product-item ${selectedProduct === key ? 'active' : ''}`}
                      onClick={() => setSelectedProduct(key)}
                    >
                      <span>{p.label}</span>
                      <span className="product-item-arrow">→</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Actions</h3>
            <button className="btn-sync" onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <>
                  <div className="spinner" />
                  <span>Synchronisation...</span>
                </>
              ) : (
                <>
                  <span>🔄</span>
                  <span>Mettre à jour les cours</span>
                </>
              )}
            </button>
            {syncMessage && (
              <p style={{ marginTop: '0.85rem', fontSize: '0.8rem', color: 'var(--accent)', textAlign: 'center' }}>
                {syncMessage}
              </p>
            )}
          </div>
        </aside>

        {/* Detail Panel */}
        <section className="detail-panel">
          {loading ? (
            <div className="empty-state">
              <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '3px', marginBottom: '1rem' }} />
              <p>Chargement des cotations...</p>
            </div>
          ) : prices.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <h4 className="empty-state-title">Aucune cotation enregistrée</h4>
              <p className="empty-state-desc">
                Nous n'avons trouvé aucun prix pour le produit "{selectedProduct}". Lancez une synchronisation pour charger ses cours depuis FranceAgriMer.
              </p>
            </div>
          ) : (
            <>
              {/* Product Header */}
              <div className="detail-header">
                <div className="detail-breadcrumbs">
                  <span>ToqueHub</span>
                  <span>&gt;</span>
                  <span>Marché</span>
                  <span>&gt;</span>
                  <span>
                    {MOCK_PRODUCTS.find(p => p.name === selectedProduct)?.category || 'Secteur Alimentaire'}
                  </span>
                </div>
                <div className="detail-title-row">
                  <h2 className="detail-title">
                    {MOCK_PRODUCTS.find(p => p.name === selectedProduct)?.label || selectedProduct}
                  </h2>
                  <div className="detail-date">
                    Dernière cotation : {prices[0] ? new Date(prices[0].date).toLocaleDateString('fr-FR') : 'Récente'}
                  </div>
                </div>
              </div>

              {/* Filtre de variétés et calibres */}
              <div className="card" style={{ padding: '0.85rem 1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center', backgroundColor: 'rgba(8, 13, 26, 0.4)' }}>
                <span style={{ fontSize: '1.2rem', userSelect: 'none' }}>🔍</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Filtrer par variété, origine, calibre ou marché (ex: 'grappe', 'Rungis', 'bio', 'Belgique')..."
                  value={varietyQuery}
                  onChange={(e) => setVarietyQuery(e.target.value)}
                  style={{ border: 'none', background: 'transparent', padding: '0.25rem', width: '100%', fontSize: '0.95rem', outline: 'none', boxShadow: 'none' }}
                />
              </div>

              {/* Price Cards Grid */}
              <div className="price-grid">
                {prices.filter(p => {
                  const searchString = `${p.label.name} ${p.market.name} ${p.stage}`.toLowerCase();
                  return searchString.includes(varietyQuery.toLowerCase());
                }).map((p, index) => {
                  const varVal = p.variation;
                  const varClass = getVariationClass(varVal);
                  return (
                    <div key={index} className="card price-card">
                      <div className="price-card-header">
                        <h4 className="market-name">{p.market.name}</h4>
                        <div className="market-meta">
                          <span>{p.stage}</span>
                          <span>•</span>
                          <span>RNM</span>
                        </div>
                      </div>
                      
                      <div className="price-card-body">
                        <div className="price-amount-wrapper">
                          <span className="price-label">Prix Moyen</span>
                          <div className="price-amount">
                            {formatPrice(p.avgPrice)}
                            <span className="price-unit">€ / {p.unit}</span>
                          </div>
                        </div>

                        <div className={`price-variation ${varClass}`}>
                          <span>{varVal && parseFloat(varVal as any) > 0 ? '▲' : varVal && parseFloat(varVal as any) < 0 ? '▼' : '●'}</span>
                          <span>{getVariationSign(varVal)}</span>
                        </div>
                      </div>

                      <div className="price-card-footer">
                        <strong>Libellé RNM :</strong> <br />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{p.label.name}</span>
                        {p.minPrice && p.maxPrice && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            <span>Cours Mini : {formatPrice(p.minPrice)} €</span>
                            <span>Cours Maxi : {formatPrice(p.maxPrice)} €</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Movers Section */}
          <div className="movers-section">
            {/* Top Gainers */}
            <div className="card">
              <h3 className="movers-title">
                <span style={{ color: 'var(--danger)' }}>📈</span> Plus fortes hausses (7j)
              </h3>
              <div className="movers-list">
                {topGainers.map((item, index) => (
                  <div key={index} className="mover-item">
                    <div className="mover-info">
                      <span className="mover-name">{item.productName} ({item.labelName.split(' ')[0]})</span>
                      <span className="mover-market">{item.marketName} • {item.stage}</span>
                    </div>
                    <div className="mover-stats">
                      <span className="mover-price">{formatPrice(item.currentPrice)} €</span>
                      <span className="badge" style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', fontSize: '0.75rem' }}>
                        +{item.pctVar}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Losers */}
            <div className="card">
              <h3 className="movers-title">
                <span style={{ color: 'var(--success)' }}>📉</span> Plus fortes baisses (7j)
              </h3>
              <div className="movers-list">
                {topLosers.map((item, index) => (
                  <div key={index} className="mover-item">
                    <div className="mover-info">
                      <span className="mover-name">{item.productName} ({item.labelName.split(' ')[0]})</span>
                      <span className="mover-market">{item.marketName} • {item.stage}</span>
                    </div>
                    <div className="mover-stats">
                      <span className="mover-price">{formatPrice(item.currentPrice)} €</span>
                      <span className="badge" style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success)', fontSize: '0.75rem' }}>
                        {item.pctVar}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
