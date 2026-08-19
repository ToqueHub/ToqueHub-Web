import { activeLocale } from '../../i18n/runtime';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import type {
  InventoryImportCommitResult,
  InventoryImportPreview,
  InventoryImportPreviewRow,
  Product,
  Site,
} from '../../types';
import { Modal } from '../ui/Modal';

export interface InventoryImportCommitPayload {
  siteId: string;
  name: string;
  inventoryDate?: string;
  comment?: string;
  updatePrices?: boolean;
  createMissingCategories?: boolean;
  createMissingSuppliers?: boolean;
  learnAliases?: boolean;
  rows: Array<{
    sourceId: string;
    sourceName: string;
    countedQuantity: number;
    unitLabel?: string;
    unitPriceExVat?: number;
    categoryName?: string;
    supplierName?: string;
    action: 'MATCH' | 'CREATE' | 'IGNORE';
    productId?: string;
    unitId?: string;
    selected?: boolean;
  }>;
}

export function InventoryImportWizard({
  isOpen,
  sites,
  products,
  primarySiteId,
  initialFile,
  onClose,
  onAnalyze,
  onCommit,
}: {
  isOpen: boolean;
  sites: Site[];
  products: Product[];
  primarySiteId?: string;
  initialFile?: File | null;
  onClose: () => void;
  onAnalyze: (file: File, siteId: string) => Promise<InventoryImportPreview>;
  onCommit: (payload: InventoryImportCommitPayload) => Promise<InventoryImportCommitResult>;
}) {
  const activeSites = useMemo(() => sites.filter((site) => !site.isArchived), [sites]);
  const activeProducts = useMemo(
    () =>
      products
        .filter((product) => !product.isArchived)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [products],
  );
  const [siteId, setSiteId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<InventoryImportPreview | null>(null);
  const [rows, setRows] = useState<InventoryImportPreviewRow[]>([]);
  const [inventoryName, setInventoryName] = useState('');
  const [inventoryDate, setInventoryDate] = useState(todayInputValue);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<'analyze' | 'commit' | null>(null);
  const [error, setError] = useState<string>();
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [updatePrices, setUpdatePrices] = useState(false);
  const [createMissingCategories, setCreateMissingCategories] = useState(true);
  const [createMissingSuppliers, setCreateMissingSuppliers] = useState(false);
  const [learnAliases, setLearnAliases] = useState(true);
  const rowsPerPage = 30;

  useEffect(() => {
    if (!isOpen) return;
    const fallback =
      activeSites.find((site) => site.id === primarySiteId)?.id ??
      activeSites.find((site) => site.isMain || site.isPrimary)?.id ??
      activeSites[0]?.id ??
      '';
    setSiteId((current) =>
      current && activeSites.some((site) => site.id === current) ? current : fallback,
    );
  }, [activeSites, isOpen, primarySiteId]);

  useEffect(() => setPage(1), [search]);

  useEffect(() => {
    if (!isOpen || !initialFile) return;
    setFile(initialFile);
    setPreview(null);
    setRows([]);
    setInventoryName('');
    setSearch('');
    setPage(1);
    setError(undefined);
    setReviewConfirmed(false);
  }, [initialFile, isOpen]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr');
    if (!query) return rows;
    return rows.filter((row) =>
      `${row.sourceName} ${row.productName ?? ''} ${row.categoryName ?? ''} ${row.sheetName}`
        .toLocaleLowerCase('fr')
        .includes(query),
    );
  }, [rows, search]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const visibleRows = filteredRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const selectedRows = rows.filter((row) => row.selected && row.action !== 'IGNORE');
  const rowsToCreate = selectedRows.filter((row) => row.action === 'CREATE');
  const unresolvedRows = selectedRows.filter((row) => row.action === 'MATCH' && !row.productId);
  const reviewRows = selectedRows.filter((row) => row.needsReview);
  const mistralReviewRows = reviewRows.filter(
    (row) => row.matchMethod === 'mistral_suggestion' && row.action === 'MATCH',
  );
  const creationReviewRows = reviewRows.filter((row) => row.action === 'CREATE');

  function resetImport() {
    setFile(null);
    setPreview(null);
    setRows([]);
    setInventoryName('');
    setSearch('');
    setPage(1);
    setError(undefined);
    setReviewConfirmed(false);
    setUpdatePrices(false);
    setCreateMissingCategories(true);
    setCreateMissingSuppliers(false);
    setLearnAliases(true);
  }

  function close() {
    if (busy) return;
    resetImport();
    onClose();
  }

  async function analyze() {
    if (!file || !siteId) {
      setError('Sélectionnez un établissement et un document d’inventaire.');
      return;
    }
    setBusy('analyze');
    setError(undefined);
    try {
      const result = await onAnalyze(file, siteId);
      setPreview(result);
      setRows(result.rows);
      setInventoryName(
        `Inventaire importé · ${result.filename.replace(/\.(xml|xlsx|csv)$/i, '')}`.slice(0, 180),
      );
      setReviewConfirmed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyse du document impossible.');
    } finally {
      setBusy(null);
    }
  }

  function patchRow(sourceId: string, patch: Partial<InventoryImportPreviewRow>) {
    setRows((current) =>
      current.map((row) => (row.sourceId === sourceId ? { ...row, ...patch } : row)),
    );
    setReviewConfirmed(false);
  }

  function chooseMatch(row: InventoryImportPreviewRow, value: string) {
    if (value === 'IGNORE') {
      patchRow(row.sourceId, {
        action: 'IGNORE',
        productId: null,
        productName: null,
        selected: false,
        needsReview: false,
      });
      return;
    }
    if (value === 'CREATE') {
      patchRow(row.sourceId, {
        action: 'CREATE',
        productId: null,
        productName: null,
        selected: true,
        needsReview: true,
      });
      return;
    }
    const product = activeProducts.find((item) => item.id === value);
    if (!product) return;
    patchRow(row.sourceId, {
      action: 'MATCH',
      productId: product.id,
      productName: product.name,
      unitId: product.unitId,
      resolvedUnitLabel: product.unit
        ? `${product.unit.name} (${product.unit.symbol})`
        : row.resolvedUnitLabel,
      selected: true,
      needsReview: false,
    });
  }

  async function commit() {
    if (!preview || !siteId || !inventoryName.trim()) return;
    if (!selectedRows.length) {
      setError('Sélectionnez au moins une ligne à importer.');
      return;
    }
    if (unresolvedRows.length) {
      setError(`${unresolvedRows.length} ligne(s) n’ont pas de produit ou d’unité valide.`);
      return;
    }
    if (reviewRows.length && !reviewConfirmed) {
      setError('Cochez la validation du contrôle final avant de créer le brouillon.');
      return;
    }
    setBusy('commit');
    setError(undefined);
    try {
      await onCommit({
        siteId,
        name: inventoryName.trim(),
        inventoryDate,
        comment: `Import contrôlé depuis ${preview.filename}. Stock inchangé avant validation du brouillon.`,
        updatePrices,
        createMissingCategories,
        createMissingSuppliers,
        learnAliases,
        rows: rows.map((row) => ({
          sourceId: row.sourceId,
          sourceName: row.sourceName,
          countedQuantity: row.countedQuantity,
          unitLabel: row.unitLabel ?? undefined,
          unitPriceExVat: row.unitPriceExVat ?? undefined,
          categoryName: row.categoryName ?? undefined,
          supplierName: row.supplierName ?? undefined,
          action: row.action,
          productId: row.productId ?? undefined,
          unitId: row.unitId ?? undefined,
          selected: row.selected,
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création du brouillon impossible.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Importer un inventaire existant"
      subtitle="Rapprochez les produits, contrôlez les écarts, puis créez un brouillon sans modifier le stock."
      size="full"
      bodyClassName="inventory-import-modal-body"
      hideHeader={Boolean(preview)}
    >
      <div className="inventory-import-wizard">
        {error && !preview ? (
          <div className="alert-modern error inventory-import-alert">
            <AlertCircle size={17} /> {error}
          </div>
        ) : null}

        {!preview ? (
          <InventoryImportStart
            activeSites={activeSites}
            siteId={siteId}
            file={file}
            busy={busy === 'analyze'}
            onSiteChange={setSiteId}
            onFileChange={setFile}
            onCancel={close}
            onAnalyze={() => void analyze()}
          />
        ) : (
          <>
            <div className="inventory-import-controlbar">
              <div className="inventory-import-control-summary">
                <span className="inventory-import-control-icon">
                  <ClipboardList size={18} />
                </span>
                <div>
                  <span>Contrôle du document</span>
                  <strong>
                    {rows.length} lignes ·{' '}
                    {preview.summary.exactMatches + preview.summary.learnedMatches} rapprochées ·{' '}
                    {rowsToCreate.length} à créer ·{' '}
                    {formatMoney(preview.summary.calculatedValueExVat)} HT
                  </strong>
                  {error ? (
                    <p className="inventory-import-control-error">
                      <AlertCircle size={13} /> {error}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="inventory-import-control-actions">
                {preview.issues.length ? <InventoryImportIssues preview={preview} /> : null}

                <details className="inventory-import-options-panel">
                  <summary>Options</summary>
                  <div className="inventory-import-options">
                    <label>
                      <input
                        type="checkbox"
                        checked={createMissingCategories}
                        onChange={(event) => setCreateMissingCategories(event.target.checked)}
                      />
                      Créer les catégories manquantes
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={createMissingSuppliers}
                        onChange={(event) => setCreateMissingSuppliers(event.target.checked)}
                      />
                      Créer les fournisseurs manquants
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={learnAliases}
                        onChange={(event) => setLearnAliases(event.target.checked)}
                      />
                      Mémoriser les noms confirmés
                    </label>
                    <label className="sensitive">
                      <input
                        type="checkbox"
                        checked={updatePrices}
                        onChange={(event) => setUpdatePrices(event.target.checked)}
                      />
                      Mettre à jour les prix d’achat
                    </label>
                  </div>
                </details>

                <span className="inventory-import-ready-badge">
                  <ShieldCheck size={14} /> Analyse terminée
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetImport}
                  disabled={Boolean(busy)}
                >
                  <RefreshCw size={15} /> Changer de fichier
                </button>
                <button
                  type="button"
                  className="icon-btn inventory-import-close"
                  onClick={close}
                  disabled={Boolean(busy)}
                  aria-label="Fermer l’import d’inventaire"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            <section className="inventory-import-editor" aria-label="Produits du document">
              <div className="inventory-import-products-toolbar">
                <div className="inventory-import-products-title">
                  <strong>Produits du document</strong>
                  <span>
                    {filteredRows.length} ligne(s) · page {page} / {pageCount}
                  </span>
                </div>
                <label className="inventory-import-compact-field inventory-import-name-field">
                  <span>Nom du brouillon</span>
                  <input
                    value={inventoryName}
                    maxLength={180}
                    onChange={(event) => setInventoryName(event.target.value)}
                  />
                </label>
                <label className="inventory-import-compact-field inventory-import-date-field">
                  <span>Date de l’inventaire</span>
                  <input
                    type="date"
                    value={inventoryDate}
                    onChange={(event) => setInventoryDate(event.target.value)}
                  />
                </label>
                <label className="inventory-import-search">
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher un produit, une feuille ou une catégorie…"
                  />
                </label>
                <div className="inventory-import-page-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    aria-label="Page précédente"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={page >= pageCount}
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    aria-label="Page suivante"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              <div className="inventory-import-table-wrap">
                <InventoryImportTable
                  rows={visibleRows}
                  products={activeProducts}
                  preview={preview}
                  onPatchRow={patchRow}
                  onChooseMatch={chooseMatch}
                />
              </div>
            </section>

            <div className="inventory-import-footer">
              <div>
                <strong>{selectedRows.length} ligne(s) sélectionnée(s)</strong>
                {reviewRows.length ? (
                  <label className="inventory-import-confirm">
                    <input
                      type="checkbox"
                      checked={reviewConfirmed}
                      onChange={(event) => {
                        setReviewConfirmed(event.target.checked);
                        if (event.target.checked) setError(undefined);
                      }}
                    />
                    <span>
                      <strong>Je valide le contrôle final</strong>
                      {mistralReviewRows.length
                        ? ` · ${mistralReviewRows.length} correspondance(s) Mistral présélectionnée(s)`
                        : ''}
                      {creationReviewRows.length
                        ? ` · ${creationReviewRows.length} produit(s) à créer`
                        : ''}
                    </span>
                  </label>
                ) : (
                  <span>Le stock sera modifié uniquement après validation du brouillon.</span>
                )}
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={close}
                  disabled={Boolean(busy)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    !selectedRows.length ||
                    (Boolean(reviewRows.length) && !reviewConfirmed) ||
                    busy === 'commit'
                  }
                  onClick={() => void commit()}
                >
                  <ClipboardList size={16} />
                  {busy === 'commit' ? 'Création…' : 'Créer le brouillon à contrôler'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function InventoryImportStart({
  activeSites,
  siteId,
  file,
  busy,
  onSiteChange,
  onFileChange,
  onCancel,
  onAnalyze,
}: {
  activeSites: Site[];
  siteId: string;
  file: File | null;
  busy: boolean;
  onSiteChange: (value: string) => void;
  onFileChange: (value: File | null) => void;
  onCancel: () => void;
  onAnalyze: () => void;
}) {
  return (
    <div className="inventory-import-start">
      <div className="inventory-import-safety">
        <div>
          <ShieldCheck size={22} />
          <strong>Import contrôlé en deux étapes</strong>
        </div>
        <p>
          ToqueHub lit les cellules localement. Mistral peut seulement proposer une correspondance
          pour un nom ambigu à partir des noms candidats du catalogue ; il ne reçoit ni quantités,
          ni prix, ni totaux et ne met jamais le stock à jour.
        </p>
      </div>
      <div className="inventory-import-start-grid">
        <label className="form-field">
          <span>Établissement concerné</span>
          <select value={siteId} onChange={(event) => onSiteChange(event.target.value)}>
            <option value="">Sélectionner un établissement</option>
            {activeSites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <label
          className="stocks-ocr-dropzone inventory-import-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const next = Array.from(event.dataTransfer.files ?? []).find((item) =>
              /\.(xml|xlsx|csv)$/i.test(item.name),
            );
            if (next) onFileChange(next);
          }}
        >
          <UploadCloud size={36} />
          <span>{file ? file.name : 'Déposer le document d’inventaire ici'}</span>
          <small>CSV, Excel .xlsx ou Excel XML .xml · 8 Mo maximum</small>
          <input
            type="file"
            accept=".xml,.xlsx,.csv,text/xml,text/csv,application/xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <div className="inventory-import-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!file || !siteId || busy}
          onClick={onAnalyze}
        >
          <Sparkles size={16} /> {busy ? 'Analyse en cours…' : 'Analyser et rapprocher'}
        </button>
      </div>
    </div>
  );
}

function InventoryImportIssues({ preview }: { preview: InventoryImportPreview }) {
  return (
    <details className="inventory-import-issues">
      <summary>
        <AlertTriangle size={16} /> {preview.issues.length} anomalie(s)
      </summary>
      <div>
        {preview.issues.slice(0, 10).map((issue, index) => (
          <p key={`${issue.sheetName}-${issue.rowNumber}-${issue.code}-${index}`}>
            <strong>
              {issue.sheetName} · ligne {issue.rowNumber}
            </strong>{' '}
            — {issue.message}
          </p>
        ))}
        {preview.issues.length > 10 ? <p>… et {preview.issues.length - 10} autre(s).</p> : null}
      </div>
    </details>
  );
}

function InventoryImportTable({
  rows,
  products,
  preview,
  onPatchRow,
  onChooseMatch,
}: {
  rows: InventoryImportPreviewRow[];
  products: Product[];
  preview: InventoryImportPreview;
  onPatchRow: (sourceId: string, patch: Partial<InventoryImportPreviewRow>) => void;
  onChooseMatch: (row: InventoryImportPreviewRow, value: string) => void;
}) {
  return (
    <table className="table-modern inventory-import-table">
      <thead>
        <tr>
          <th aria-label="Sélection" />
          <th>Produit du document</th>
          <th>Correspondance ToqueHub</th>
          <th style={{ textAlign: 'right' }}>Compté</th>
          <th style={{ textAlign: 'right' }}>Théorique</th>
          <th style={{ textAlign: 'right' }}>Écart</th>
          <th style={{ textAlign: 'right' }}>Prix HT</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const selectedValue =
            row.action === 'IGNORE'
              ? 'IGNORE'
              : row.action === 'CREATE'
                ? 'CREATE'
                : (row.productId ?? '');
          const currentProduct = products.find((product) => product.id === row.productId);
          const unit = currentProduct?.unit?.symbol ?? row.resolvedUnitLabel ?? row.unitLabel ?? '';
          return (
            <tr key={row.sourceId} className={row.needsReview ? 'needs-review' : ''}>
              <td>
                <input
                  type="checkbox"
                  checked={row.selected && row.action !== 'IGNORE'}
                  onChange={(event) =>
                    onPatchRow(row.sourceId, {
                      selected: event.target.checked,
                      action:
                        event.target.checked && row.action === 'IGNORE' ? 'CREATE' : row.action,
                    })
                  }
                  aria-label={`Importer ${row.sourceName}`}
                />
              </td>
              <td>
                <strong>{row.sourceName}</strong>
                <small>
                  {row.sheetName} · ligne {row.rowNumber}
                  {row.categoryName ? ` · ${row.categoryName}` : ''}
                </small>
                {row.warnings.length ? (
                  <span className="inventory-import-row-warning">
                    {row.matchMethod === 'mistral_suggestion'
                      ? 'Suggestion Mistral présélectionnée · validation groupée en bas.'
                      : row.warnings[0]}
                  </span>
                ) : null}
              </td>
              <td>
                <InventoryProductMatcher
                  row={row}
                  products={products}
                  value={selectedValue}
                  onChange={(value) => onChooseMatch(row, value)}
                />
                {row.action === 'CREATE' ? (
                  <select
                    value={row.unitId ?? ''}
                    onChange={(event) =>
                      onPatchRow(row.sourceId, { unitId: event.target.value || null })
                    }
                    aria-label={`Unité de ${row.sourceName}`}
                  >
                    <option value="">Choisir l’unité</option>
                    {preview.availableUnits.map((availableUnit) => (
                      <option key={availableUnit.id} value={availableUnit.id}>
                        {availableUnit.name} ({availableUnit.symbol})
                      </option>
                    ))}
                  </select>
                ) : (
                  <small>
                    {row.matchMethod === 'mistral_suggestion'
                      ? 'Présélectionné par Mistral · contrôle final en bas'
                      : row.matchMethod === 'learned_alias'
                        ? 'Alias déjà validé'
                        : 'Correspondance locale'}
                  </small>
                )}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 800 }}>
                {formatQuantity(row.countedQuantity)} {unit}
              </td>
              <td style={{ textAlign: 'right' }}>
                {formatQuantity(row.theoreticalQuantity)} {unit}
              </td>
              <td
                className={
                  row.varianceQuantity < 0 ? 'negative' : row.varianceQuantity > 0 ? 'positive' : ''
                }
                style={{ textAlign: 'right', fontWeight: 800 }}
              >
                {row.varianceQuantity > 0 ? '+' : ''}
                {formatQuantity(row.varianceQuantity)} {unit}
              </td>
              <td style={{ textAlign: 'right' }}>
                {row.unitPriceExVat == null ? '—' : formatMoney(row.unitPriceExVat)}
              </td>
            </tr>
          );
        })}
        {!rows.length ? (
          <tr>
            <td colSpan={7} className="inventory-import-empty">
              Aucun produit ne correspond à cette recherche.
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function InventoryProductMatcher({
  row,
  products,
  value,
  onChange,
}: {
  row: InventoryImportPreviewRow;
  products: Product[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const selectedProduct = products.find((product) => product.id === value);
  const selectedLabel =
    value === 'CREATE'
      ? `Créer « ${row.sourceName} »`
      : value === 'IGNORE'
        ? 'Ignorer cette ligne'
        : (selectedProduct?.name ?? row.productName ?? '');
  const normalizedSearch = search.trim().toLocaleLowerCase('fr');
  const candidateScores = useMemo(
    () => new Map(row.candidates.map((candidate) => [candidate.productId, candidate.score])),
    [row.candidates],
  );
  const filteredProducts = useMemo(() => {
    const matching = products.filter((product) => {
      if (!normalizedSearch) return true;
      return [
        product.name,
        product.sku,
        product.reference,
        product.gtin,
        product.category?.name,
        product.primarySupplier?.name,
        product.supplier?.name,
      ]
        .filter(Boolean)
        .some((entry) => String(entry).toLocaleLowerCase('fr').includes(normalizedSearch));
    });

    return matching
      .sort(
        (left, right) =>
          (candidateScores.get(right.id) ?? 0) - (candidateScores.get(left.id) ?? 0) ||
          left.name.localeCompare(right.name),
      )
      .slice(0, 12);
  }, [candidateScores, normalizedSearch, products]);

  function openMatcher() {
    setSearch(selectedProduct?.name ?? (value === 'CREATE' ? row.sourceName : ''));
    setIsOpen(true);
  }

  function choose(valueToSelect: string) {
    onChange(valueToSelect);
    setIsOpen(false);
    setSearch('');
  }

  return (
    <div className="custom-autocomplete-wrapper inventory-product-matcher">
      <div className="inventory-product-matcher-field">
        <Search size={14} aria-hidden="true" />
        <input
          type="text"
          value={isOpen ? search : selectedLabel}
          placeholder="Rechercher un produit Stocks…"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-label={`Correspondance ToqueHub pour ${row.sourceName}`}
          onFocus={openMatcher}
          onChange={(event) => {
            setSearch(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setIsOpen(false);
              event.currentTarget.blur();
            }
          }}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
        />
      </div>

      {isOpen ? (
        <div className="custom-autocomplete-dropdown inventory-product-matcher-menu" role="listbox">
          <button
            type="button"
            className={value === 'CREATE' ? 'is-selected is-create' : 'is-create'}
            role="option"
            aria-selected={value === 'CREATE'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose('CREATE')}
          >
            <span>
              <strong>Créer « {row.sourceName} »</strong>
              <small>Ajouter ce produit au catalogue Stocks</small>
            </span>
          </button>
          <button
            type="button"
            className={value === 'IGNORE' ? 'is-selected is-ignore' : 'is-ignore'}
            role="option"
            aria-selected={value === 'IGNORE'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose('IGNORE')}
          >
            <span>
              <strong>Ignorer cette ligne</strong>
              <small>Ne pas l’ajouter au brouillon</small>
            </span>
          </button>

          <div className="inventory-product-matcher-divider" aria-hidden="true" />

          {filteredProducts.length ? (
            filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className={value === product.id ? 'is-selected' : undefined}
                role="option"
                aria-selected={value === product.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(product.id)}
              >
                <span>
                  <strong>{product.name}</strong>
                  <small>
                    {[product.category?.name, product.sku, product.unit?.symbol]
                      .filter(Boolean)
                      .join(' · ') || 'Produit du catalogue Stocks'}
                  </small>
                </span>
                {candidateScores.has(product.id) ? <em>Suggestion</em> : null}
              </button>
            ))
          ) : (
            <p className="inventory-product-matcher-empty">Aucun produit trouvé</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatMoney(value: number) {
  return `${Number(value).toLocaleString(activeLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

function formatQuantity(value: number) {
  return Number(value).toLocaleString(activeLocale(), { maximumFractionDigits: 3 });
}

function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
