import { useEffect, useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import { api } from '../../../api/client';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import type { PurchaseOrderEvent } from '../../../types';
import { Empty, Pagination, dateTimeLabel } from '../components/PurchasingUi';

export function HistoryView({ token }: { token: string }) {
  const [events, setEvents] = useState<PurchaseOrderEvent[]>([]);
  const [search, setSearch] = useState('');
  const [actorId, setActorId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const debouncedSearch = useDebouncedValue(search);
  const actors = useMemo(
    () =>
      Array.from(
        new Map(
          events.filter((event) => event.actor).map((event) => [event.actor!.id, event.actor!]),
        ).values(),
      ),
    [events],
  );
  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const response = await api.purchasingHistory(token, {
          search: debouncedSearch.trim() || undefined,
          actorId: actorId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
          pageSize: 30,
        });
        setEvents(response.items);
        setTotal(response.total);
      } finally {
        setLoading(false);
      }
    })();
  }, [actorId, dateFrom, dateTo, debouncedSearch, page, token]);
  const filtersActive = Boolean(search || actorId || dateFrom || dateTo);
  return (
    <section className="card-modern">
      <div className="section-header-modern">
        <div className="section-info">
          <span className="card-title">Historique métier</span>
          <span className="section-tagline">Actions, acteurs et commandes dans un journal filtrable côté serveur.</span>
        </div>
      </div>
      <div className="filter-bar purchasing-history-filters">
        <label className="search-input-wrapper">
          <Search size={17} />
          <input
            className="search-input"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Commande, fournisseur ou action"
          />
        </label>
        <select
          value={actorId}
          onChange={(event) => {
            setActorId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Tous les acteurs</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {`${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim() || actor.email}
            </option>
          ))}
        </select>
        <input
          aria-label="Historique depuis"
          type="date"
          value={dateFrom}
          onChange={(event) => {
            setDateFrom(event.target.value);
            setPage(1);
          }}
        />
        <input
          aria-label="Historique jusqu’au"
          type="date"
          value={dateTo}
          onChange={(event) => {
            setDateTo(event.target.value);
            setPage(1);
          }}
        />
      </div>
      {events.length ? (
        <div className="purchasing-timeline">
          {events.map((event) => (
            <article key={event.id}>
              <span className="purchasing-timeline-dot" />
              <div>
                <strong>{event.summary}</strong>
                <p>
                  {event.order?.number} · {event.order?.supplierNameSnapshot}
                </p>
                <small>
                  {dateTimeLabel(event.createdAt)}
                  {event.actor
                    ? ` · ${event.actor.firstName ?? ''} ${event.actor.lastName ?? event.actor.email}`
                    : ''}
                </small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={History}
          title={filtersActive ? 'Aucun événement pour ces filtres' : 'Aucun événement'}
          text={
            filtersActive
              ? 'Élargissez la période ou retirez un filtre.'
              : 'L’historique se constituera au fil des commandes et réceptions.'
          }
        />
      )}
      {loading && <p className="purchasing-inline-note">Chargement de l’historique…</p>}
      <Pagination page={page} total={total} pageSize={30} onChange={setPage} />
    </section>
  );
}
