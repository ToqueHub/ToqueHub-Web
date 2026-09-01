import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  GitCompareArrows,
  LoaderCircle,
  MapPin,
  Star,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { activeLocale } from '../../i18n/runtime';
import type { RnmProduct, RnmQuote } from '../../types';
import { RnmPriceChart } from './RnmPriceChart';

type Period = '7d' | '30d' | '90d' | '1y' | 'all';

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: '7d', label: '7 j' },
  { value: '30d', label: '30 j' },
  { value: '90d', label: '90 j' },
  { value: '1y', label: '1 an' },
  { value: 'all', label: 'Tout' },
];

function money(value?: number | null, unit?: string | null) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const formatted = new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(Number(value));
  return unit ? `${formatted} / ${unit}` : formatted;
}

function date(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(activeLocale());
}

function variation(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return 'Stable';
  const formatted = Number(value).toLocaleString(activeLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${Number(value) > 0 ? '+' : ''}${formatted} %`;
}

export function RnmProductModal({
  token,
  productId,
  favorite,
  compared,
  onClose,
  onToggleFavorite,
  onToggleCompare,
}: {
  token: string;
  productId: string;
  favorite: boolean;
  compared: boolean;
  onClose: () => void;
  onToggleFavorite: (product: RnmProduct) => void;
  onToggleCompare: (product: RnmProduct) => void;
}) {
  const [period, setPeriod] = useState<Period>('30d');
  const detailQuery = useQuery({
    queryKey: ['rnm', 'product', productId],
    queryFn: () => api.rnmProduct(token, productId),
    staleTime: 5 * 60_000,
  });
  const historyQuery = useQuery({
    queryKey: ['rnm', 'product-history', productId, period],
    queryFn: () => api.rnmHistory(token, { productId, period, limit: 250 }),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const detail = detailQuery.data;
  const quotes = detail?.quotes ?? detail?.quotations ?? [];
  const priceRange = useMemo(() => {
    const prices = quotes.flatMap((quote) => [quote.minPrice, quote.maxPrice, quote.averagePrice])
      .filter((value): value is number => value != null && Number.isFinite(Number(value)))
      .map(Number);
    return {
      minimum: prices.length ? Math.min(...prices) : null,
      maximum: prices.length ? Math.max(...prices) : null,
    };
  }, [quotes]);
  const markets = [...new Set(quotes.map((quote) => quote.market).filter(Boolean))] as string[];

  return (
    <div
      className="modal-overlay rnm-redesign-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal-card hr-modal hr-collaborator-modal rnm-redesign-product-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rnm-product-modal-title"
      >
        <div className="modal-header hr-modal-sticky">
          <div className="rnm-redesign-modal-title">
            <span className="welcome-tag"><BarChart3 size={14} /> Cotation RNM</span>
            <h2 id="rnm-product-modal-title">{detail?.name ?? 'Fiche produit'}</h2>
            <p>
              {[detail?.category, detail?.sector].filter(Boolean).join(' · ') ||
                'Informations officielles du marché'}
            </p>
          </div>
          <div className="rnm-redesign-modal-header-actions">
            {detail ? (
              <button
                type="button"
                className={`rnm-redesign-star-button${favorite ? ' is-active' : ''}`}
                aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                title={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                onClick={() => onToggleFavorite(detail)}
              >
                <Star size={18} fill={favorite ? 'currentColor' : 'none'} />
              </button>
            ) : null}
            <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fermer">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="hr-collaborator-body rnm-redesign-modal-body">
          {detailQuery.isLoading ? (
            <div className="rnm-redesign-loading"><LoaderCircle size={26} className="spin" /> Chargement de la fiche…</div>
          ) : detailQuery.error || !detail ? (
            <div className="alert-modern error">
              <AlertTriangle size={18} />
              <span>Impossible de charger cette fiche produit.</span>
              <button type="button" className="btn btn-secondary" onClick={() => void detailQuery.refetch()}>
                Réessayer
              </button>
            </div>
          ) : (
            <>
              <div className="rnm-redesign-detail-metrics">
                <div>
                  <span>Prix moyen actuel</span>
                  <strong>{money(detail.averagePrice, detail.unit)}</strong>
                </div>
                <div>
                  <span>Prix minimum</span>
                  <strong>{money(priceRange.minimum, detail.unit)}</strong>
                </div>
                <div>
                  <span>Prix maximum</span>
                  <strong>{money(priceRange.maximum, detail.unit)}</strong>
                </div>
                <div>
                  <span>Variation</span>
                  <strong className={Number(detail.variation ?? 0) > 0 ? 'is-up' : Number(detail.variation ?? 0) < 0 ? 'is-down' : ''}>
                    {variation(detail.variation)}
                  </strong>
                </div>
              </div>

              <section className="card-modern rnm-redesign-chart-card">
                <div className="rnm-redesign-section-heading">
                  <div>
                    <span>Évolution temporelle</span>
                    <strong>Historique du prix moyen</strong>
                  </div>
                  <div className="rnm-redesign-periods" role="group" aria-label="Période du graphique">
                    {PERIODS.map((item) => (
                      <button
                        type="button"
                        key={item.value}
                        className={period === item.value ? 'active' : ''}
                        onClick={() => setPeriod(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                {historyQuery.isLoading ? (
                  <div className="rnm-redesign-loading"><LoaderCircle size={22} className="spin" /> Chargement de l’historique…</div>
                ) : (
                  <RnmPriceChart
                    series={[{ id: productId, label: detail.name, color: '#10b981', points: historyQuery.data?.items ?? [] }]}
                  />
                )}
              </section>

              <section className="rnm-redesign-markets-card">
                <div className="rnm-redesign-section-heading">
                  <div>
                    <span>Couverture</span>
                    <strong>Marchés disponibles</strong>
                  </div>
                  <small>{markets.length} marché{markets.length > 1 ? 's' : ''}</small>
                </div>
                <div className="rnm-redesign-market-chips">
                  {markets.length ? markets.map((market) => (
                    <span key={market}><MapPin size={13} /> {market}</span>
                  )) : <span className="muted">Aucun marché précisé.</span>}
                </div>
              </section>

              <section className="rnm-redesign-quotes-section">
                <div className="rnm-redesign-section-heading">
                  <div>
                    <span>Cotations</span>
                    <strong>Dernières valeurs publiées</strong>
                  </div>
                  <small><CalendarDays size={14} /> Mise à jour {date(detail.latestQuotationDate ?? detail.lastQuotationDate)}</small>
                </div>
                {quotes.length ? (
                  <div className="table-wrapper rnm-redesign-table-wrapper">
                    <table className="table-modern rnm-redesign-table">
                      <thead>
                        <tr>
                          <th>Variété / stade</th>
                          <th>Marché</th>
                          <th>Moyenne</th>
                          <th>Minimum / maximum</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotes.slice(0, 20).map((quote: RnmQuote, index) => (
                          <tr key={`${quote.date ?? 'date'}-${quote.market ?? 'market'}-${index}`}>
                            <td><strong>{quote.variety || detail.name}</strong><small>{quote.stage || 'Stade non précisé'}</small></td>
                            <td>{quote.market || '—'}</td>
                            <td><strong>{money(quote.averagePrice, quote.unit ?? detail.unit)}</strong></td>
                            <td>{money(quote.minPrice)} / {money(quote.maxPrice)}</td>
                            <td>{date(quote.date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rnm-redesign-empty compact">Aucune cotation récente n’est disponible.</div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="modal-actions hr-modal-footer rnm-redesign-modal-footer">
          <span className="muted">Source : Réseau des Nouvelles des Marchés — FranceAgriMer</span>
          <div className="row-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Fermer</button>
            {detail ? (
              <button type="button" className="btn btn-primary" onClick={() => onToggleCompare(detail)}>
                {compared ? <Check size={16} /> : <GitCompareArrows size={16} />}
                {compared ? 'Retirer du comparateur' : 'Ajouter au comparateur'}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
