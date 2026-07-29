import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChefHat, Clock3, ListChecks, Search, Sparkles, X } from 'lucide-react';

export type TechnicalSheetPickerStep = {
  id: string;
  order: number;
  title: string;
  description?: string | null;
  estimatedMinutes?: number | null;
};

export type TechnicalSheetPickerItem = {
  id: string;
  name: string;
  category?: string | null;
  group?: string | null;
  referenceLabel?: string | null;
  durationMinutes?: number | null;
  contextLabel?: string | null;
  featured?: boolean;
  steps?: TechnicalSheetPickerStep[];
};

type Props = {
  open: boolean;
  items: TechnicalSheetPickerItem[];
  selectionMode?: 'sheet' | 'step';
  initialSheetId?: string;
  selectedSheetId?: string;
  selectedStepId?: string;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  onClose: () => void;
  onSelectSheet: (item: TechnicalSheetPickerItem) => void;
  onSelectStep?: (item: TechnicalSheetPickerItem, step: TechnicalSheetPickerStep) => void;
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-FR')
    .trim();
}

function durationLabel(minutes?: number | null) {
  if (!minutes || minutes <= 0) return 'Non renseignée';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} h ${remaining}` : `${hours} h`;
}

export function TechnicalSheetPickerModal({
  open,
  items,
  selectionMode = 'sheet',
  initialSheetId = '',
  selectedSheetId = '',
  selectedStepId = '',
  title,
  subtitle,
  emptyMessage = 'Aucune fiche technique ne correspond à cette recherche.',
  onClose,
  onSelectSheet,
  onSelectStep,
}: Props) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [activeSheetId, setActiveSheetId] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setGroup('');
    setActiveSheetId(selectionMode === 'step' ? initialSheetId : '');
  }, [initialSheetId, open, selectionMode]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const groups = useMemo(
    () =>
      Array.from(
        new Set(items.map((item) => item.group).filter((value): value is string => Boolean(value))),
      ).sort((a, b) => a.localeCompare(b, 'fr')),
    [items],
  );

  const filteredItems = useMemo(() => {
    const needle = normalize(search);
    return items
      .filter((item) => !group || item.group === group)
      .filter((item) => {
        if (!needle) return true;
        return normalize(
          [item.name, item.category, item.group, item.referenceLabel, item.contextLabel]
            .filter(Boolean)
            .join(' '),
        ).includes(needle);
      })
      .sort(
        (a, b) =>
          Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
          a.name.localeCompare(b.name, 'fr'),
      );
  }, [group, items, search]);

  const activeSheet = items.find((item) => item.id === activeSheetId);

  if (!open || typeof document === 'undefined') return null;

  const modalTitle =
    title ??
    (selectionMode === 'step'
      ? 'Choisir une fiche et une étape'
      : 'Catalogue des fiches techniques');
  const modalSubtitle =
    subtitle ??
    (selectionMode === 'step'
      ? 'Recherchez d’abord la recette, puis choisissez précisément l’étape à planifier.'
      : 'Recherchez une recette puis sélectionnez-la dans la liste.');

  return createPortal(
    <div
      className="technical-sheet-picker-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="technical-sheet-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="technical-sheet-picker-title"
      >
        <header className="technical-sheet-picker-header">
          <div className="technical-sheet-picker-heading">
            <span className="technical-sheet-picker-eyebrow">
              <ChefHat size={17} />
              {activeSheet ? 'Étapes de fabrication' : 'Fiches techniques'}
            </span>
            <h2 id="technical-sheet-picker-title">{activeSheet ? activeSheet.name : modalTitle}</h2>
            <p>
              {activeSheet
                ? 'Sélectionnez l’étape exacte à ajouter au planning opérationnel.'
                : modalSubtitle}
            </p>
          </div>
          <button
            type="button"
            className="technical-sheet-picker-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={21} />
          </button>
        </header>

        {activeSheet ? (
          <div className="technical-sheet-picker-step-view">
            <button
              type="button"
              className="technical-sheet-picker-back"
              onClick={() => setActiveSheetId('')}
            >
              <ArrowLeft size={17} />
              Revenir aux fiches techniques
            </button>

            <div className="technical-sheet-picker-selected-recipe">
              <div className="technical-sheet-picker-recipe-icon">
                <ChefHat size={23} />
              </div>
              <div>
                <strong>{activeSheet.name}</strong>
                <span>
                  {activeSheet.steps?.length ?? 0} étape
                  {(activeSheet.steps?.length ?? 0) > 1 ? 's' : ''}
                  {activeSheet.referenceLabel ? ` · ${activeSheet.referenceLabel}` : ''}
                </span>
              </div>
            </div>

            <div className="technical-sheet-picker-step-list">
              {(activeSheet.steps ?? []).map((step) => (
                <article
                  key={step.id}
                  className={
                    step.id === selectedStepId
                      ? 'technical-sheet-picker-step selected'
                      : 'technical-sheet-picker-step'
                  }
                >
                  <span className="technical-sheet-picker-step-number">{step.order}</span>
                  <div className="technical-sheet-picker-step-content">
                    <strong>{step.title}</strong>
                    <span>{step.description || 'Aucune consigne complémentaire.'}</span>
                  </div>
                  <span className="technical-sheet-picker-step-duration">
                    <Clock3 size={15} />
                    {durationLabel(step.estimatedMinutes)}
                  </span>
                  <button type="button" onClick={() => onSelectStep?.(activeSheet, step)}>
                    {step.id === selectedStepId ? 'Sélectionnée' : 'Choisir'}
                  </button>
                </article>
              ))}
              {!activeSheet.steps?.length && (
                <div className="technical-sheet-picker-empty">
                  <ListChecks size={28} />
                  <strong>Aucune étape planifiable</strong>
                  <span>Ajoutez d’abord des étapes dans cette fiche technique.</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="technical-sheet-picker-filters">
              <label className="technical-sheet-picker-search">
                <Search size={19} />
                <input
                  autoFocus
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher par nom, catégorie ou menu…"
                />
              </label>
              {groups.length > 0 && (
                <select value={group} onChange={(event) => setGroup(event.target.value)}>
                  <option value="">Toutes les fiches</option>
                  {groups.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="technical-sheet-picker-table-wrap">
              <table className="technical-sheet-picker-table">
                <thead>
                  <tr>
                    <th>Fiche technique</th>
                    <th>Catégorie</th>
                    <th>Rendement</th>
                    <th>Durée</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className={item.id === selectedSheetId ? 'selected' : undefined}
                    >
                      <td>
                        <div className="technical-sheet-picker-name">
                          <strong>{item.name}</strong>
                          <span>
                            {item.featured && (
                              <em>
                                <Sparkles size={12} /> Au menu
                              </em>
                            )}
                            {item.contextLabel}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="technical-sheet-picker-category">
                          {item.category || 'Sans catégorie'}
                        </span>
                      </td>
                      <td>{item.referenceLabel || 'Non renseigné'}</td>
                      <td>
                        <span className="technical-sheet-picker-duration">
                          <Clock3 size={15} />
                          {durationLabel(item.durationMinutes)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="technical-sheet-picker-choose"
                          onClick={() => {
                            if (selectionMode === 'step') {
                              setActiveSheetId(item.id);
                              return;
                            }
                            onSelectSheet(item);
                          }}
                        >
                          {selectionMode === 'step' ? 'Voir les étapes' : 'Choisir'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filteredItems.length && (
                <div className="technical-sheet-picker-empty">
                  <Search size={28} />
                  <strong>Aucun résultat</strong>
                  <span>{emptyMessage}</span>
                </div>
              )}
            </div>
          </>
        )}

        <footer className="technical-sheet-picker-footer">
          <span>
            {activeSheet
              ? `${activeSheet.steps?.length ?? 0} étape(s) disponible(s)`
              : `${filteredItems.length} fiche(s) affichée(s) sur ${items.length}`}
          </span>
          <button type="button" onClick={onClose}>
            Fermer
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
