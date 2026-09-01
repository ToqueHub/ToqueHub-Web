import { useId, useMemo, useState } from 'react';
import { activeLocale } from '../../i18n/runtime';
import type { RnmHistoryPoint } from '../../types';

export type RnmChartSeries = {
  id: string;
  label: string;
  color: string;
  points: RnmHistoryPoint[];
};

type ChartPoint = {
  x: number;
  y: number;
  value: number;
  date: string;
  seriesId: string;
  seriesLabel: string;
  color: string;
};

function pointValue(point: RnmHistoryPoint) {
  const value = Number(point.averagePrice ?? point.price);
  return Number.isFinite(value) ? value : null;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export function RnmPriceChart({
  series,
  emptyText = 'Aucune donnée historique disponible pour cette sélection.',
}: {
  series: RnmChartSeries[];
  emptyText?: string;
}) {
  const gradientId = useId().replace(/:/g, '');
  const [hovered, setHovered] = useState<ChartPoint | null>(null);
  const normalizedSeries = useMemo(
    () =>
      series
        .map((item) => ({
          ...item,
          points: item.points
            .filter((point) => pointValue(point) !== null)
            .sort((left, right) => String(left.date ?? '').localeCompare(String(right.date ?? ''))),
        }))
        .filter((item) => item.points.length),
    [series],
  );
  const values = normalizedSeries.flatMap((item) =>
    item.points.map((point) => pointValue(point)).filter((value): value is number => value !== null),
  );

  if (!values.length) {
    return (
      <div className="rnm-redesign-chart-empty">
        <strong>Historique indisponible</strong>
        <span>{emptyText}</span>
      </div>
    );
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || Math.max(Math.abs(maximum) * 0.1, 1);
  const paddedMin = Math.max(0, minimum - spread * 0.12);
  const paddedMax = maximum + spread * 0.12;
  const paddedSpread = paddedMax - paddedMin || 1;

  const paths = normalizedSeries.map((item) => {
    const points = item.points.map((point, index) => {
      const value = pointValue(point) ?? 0;
      return {
        x: item.points.length === 1 ? 50 : 4 + (index / (item.points.length - 1)) * 92,
        y: 88 - ((value - paddedMin) / paddedSpread) * 76,
        value,
        date: String(point.date ?? ''),
        seriesId: item.id,
        seriesLabel: item.label,
        color: item.color,
      };
    });
    return { ...item, chartPoints: points };
  });
  const primary = paths[0];

  return (
    <div className="rnm-redesign-chart">
      <div className="rnm-redesign-chart-scale" aria-hidden="true">
        <span>{formatMoney(paddedMax)}</span>
        <span>{formatMoney((paddedMax + paddedMin) / 2)}</span>
        <span>{formatMoney(paddedMin)}</span>
      </div>
      <div className="rnm-redesign-chart-canvas">
        {hovered ? (
          <div
            className="rnm-redesign-chart-tooltip"
            style={{ left: `${hovered.x}%`, top: `${hovered.y}%` }}
          >
            <strong>{formatMoney(hovered.value)}</strong>
            <span>{hovered.seriesLabel}</span>
            <small>{formatDate(hovered.date)}</small>
          </div>
        ) : null}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Évolution des prix">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primary.color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={primary.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[12, 37, 62, 88].map((y) => (
            <line key={y} x1="4" x2="96" y1={y} y2={y} className="rnm-redesign-chart-gridline" />
          ))}
          {paths.length === 1 && primary.chartPoints.length > 1 ? (
            <polygon
              points={`4,88 ${primary.chartPoints.map((point) => `${point.x},${point.y}`).join(' ')} 96,88`}
              fill={`url(#${gradientId})`}
            />
          ) : null}
          {paths.map((item) => (
            <g key={item.id}>
              <polyline
                points={item.chartPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="none"
                stroke={item.color}
                strokeWidth="2.2"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {item.chartPoints.map((point) => (
                <circle
                  key={`${item.id}-${point.date}-${point.x}`}
                  cx={point.x}
                  cy={point.y}
                  r="1.1"
                  fill={item.color}
                  vectorEffect="non-scaling-stroke"
                  tabIndex={0}
                  onMouseEnter={() => setHovered(point)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(point)}
                  onBlur={() => setHovered(null)}
                />
              ))}
            </g>
          ))}
        </svg>
      </div>
      {paths.length > 1 ? (
        <div className="rnm-redesign-chart-legend">
          {paths.map((item) => (
            <span key={item.id}>
              <i style={{ background: item.color }} /> {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
