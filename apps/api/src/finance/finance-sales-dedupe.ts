type SalesRow = {
  saleDate: Date;
  grossAmount: unknown;
  netAmount?: unknown;
  vatAmount?: unknown;
  transactionCount: number;
  paymentMethod?: string | null;
  sourceId: string;
  isRevenueRecord?: boolean;
  metadata?: unknown;
  source?: { isPrimaryPos?: boolean; provider?: string; siteId?: string | null } | null;
};

type SalesSource = {
  id: string;
  provider: string;
  siteId?: string | null;
  isPrimarySales: boolean;
};

function sourceScope(source: Pick<SalesSource, 'provider' | 'siteId'>) {
  return `${source.provider}|${source.siteId || 'unassigned'}`;
}

/**
 * Une migration de nom ou un ancien import peut laisser plusieurs sources techniques pour une
 * même caisse et un même établissement. Dès qu'une de ces sources contribue au CA, toutes ses
 * copies techniques sont lues puis dédupliquées ticket par ticket. Les autres caisses restent
 * exclues tant que l'utilisateur ne les active pas.
 */
export function resolveContributingSalesSourceIds<T extends SalesSource>(sources: T[]) {
  const enabledScopes = new Set(
    sources.filter(({ isPrimarySales }) => isPrimarySales).map(sourceScope),
  );
  return sources.filter((source) => enabledScopes.has(sourceScope(source))).map(({ id }) => id);
}

function amountKey(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(4) : '0.0000';
}

function centAmountKey(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function normalizedIdentifier(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('fr-FR')
    .replace(/\s+/g, '');
}

/**
 * Les exports de paiement utilisent parfois le numéro de ticket comme libellé d'article. Ces
 * références restent disponibles dans la donnée brute, mais ne doivent jamais devenir un produit
 * ni alimenter le chiffre d'affaires produit.
 */
export function isTechnicalProductLabel(value: string, identifiers: unknown[] = []) {
  const label = value.trim();
  if (!label) return false;
  const normalized = normalizedIdentifier(label);
  if (
    identifiers.some(
      (identifier) => normalizedIdentifier(identifier) === normalized && normalized.length > 0,
    )
  )
    return true;
  if (/^#?\s*[0-9][0-9\s._:/-]{3,}$/.test(label)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(label)) return true;
  return /^(?:transaction|ticket|receipt|re[cç]u|kuitti|kuitin)[\s#:_-]*[a-z0-9._:/-]+$/i.test(
    label,
  );
}

const HOUR = 3_600_000;
const MIRROR_TIME_TOLERANCE = 90_000;
const MAX_TIMEZONE_OFFSET_HOURS = 14;

type IndexedSalesRow<T extends SalesRow> = { index: number; row: T };
type MirrorCandidate = {
  left: number;
  right: number;
  residual: number;
  profileMatches: number;
  profileCoverage: number;
};

function numeric(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function isComparableSale(row: SalesRow) {
  if (row.isRevenueRecord === false) return false;
  return row.transactionCount > 0 || Math.abs(numeric(row.grossAmount)) > 0.005;
}

function rowMetadata(row: SalesRow) {
  return row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? (row.metadata as Record<string, unknown>)
    : {};
}

function rowQuality(row: SalesRow) {
  const details = rowMetadata(row);
  const gross = numeric(row.grossAmount);
  const net = numeric(row.netAmount);
  const vat = numeric(row.vatAmount);
  return (
    (row.source?.isPrimaryPos ? 1_000 : 0) +
    (vat !== 0 ? 40 : 0) +
    (net !== 0 && Math.abs(net - gross) > 0.005 ? 20 : 0) +
    (details.recordType === 'transaction' ? 10 : 0) +
    Math.min(10, Object.values(details).filter((value) => value != null && value !== '').length)
  );
}

function mirroredAtOffset<T extends SalesRow>(
  leftByAmount: Map<string, IndexedSalesRow<T>[]>,
  rightByAmount: Map<string, IndexedSalesRow<T>[]>,
  offsetHours: number,
) {
  const matches: Array<{ left: number; right: number; residual: number }> = [];
  const offset = offsetHours * HOUR;
  for (const [amount, leftValues] of leftByAmount) {
    const rightValues = rightByAmount.get(amount);
    if (!rightValues?.length) continue;
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < leftValues.length && rightIndex < rightValues.length) {
      const leftEntry = leftValues[leftIndex];
      const rightEntry = rightValues[rightIndex];
      const delta = leftEntry.row.saleDate.getTime() - (rightEntry.row.saleDate.getTime() + offset);
      if (Math.abs(delta) <= MIRROR_TIME_TOLERANCE) {
        matches.push({
          left: leftEntry.index,
          right: rightEntry.index,
          residual: Math.abs(delta),
        });
        leftIndex += 1;
        rightIndex += 1;
      } else if (delta < 0) leftIndex += 1;
      else rightIndex += 1;
    }
  }
  return matches;
}

function entriesByAmount<T extends SalesRow>(entries: IndexedSalesRow<T>[]) {
  const result = new Map<string, IndexedSalesRow<T>[]>();
  for (const entry of entries) {
    const key = centAmountKey(entry.row.grossAmount);
    const values = result.get(key) ?? [];
    values.push(entry);
    result.set(key, values);
  }
  for (const values of result.values())
    values.sort((left, right) => left.row.saleDate.getTime() - right.row.saleDate.getTime());
  return result;
}

function crossProviderMirrorCandidates<T extends SalesRow>(rows: T[]) {
  const bySource = new Map<
    string,
    {
      provider: string;
      siteId: string;
      entries: IndexedSalesRow<T>[];
    }
  >();
  rows.forEach((row, index) => {
    if (!isComparableSale(row)) return;
    const provider = String(row.source?.provider ?? '').trim();
    const siteId = String(row.source?.siteId ?? '').trim();
    if (!provider || !siteId) return;
    const current = bySource.get(row.sourceId) ?? { provider, siteId, entries: [] };
    current.entries.push({ index, row });
    bySource.set(row.sourceId, current);
  });
  const sources = [...bySource.values()].map((source) => ({
    ...source,
    byAmount: entriesByAmount(source.entries),
  }));
  const candidates: MirrorCandidate[] = [];
  for (let leftIndex = 0; leftIndex < sources.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sources.length; rightIndex += 1) {
      const left = sources[leftIndex];
      const right = sources[rightIndex];
      if (left.provider === right.provider || left.siteId !== right.siteId) continue;
      const smallerSourceSize = Math.min(left.entries.length, right.entries.length);
      for (
        let offset = -MAX_TIMEZONE_OFFSET_HOURS;
        offset <= MAX_TIMEZONE_OFFSET_HOURS;
        offset += 1
      ) {
        const matches = mirroredAtOffset(left.byAmount, right.byAmount, offset);
        const coverage = smallerSourceSize ? matches.length / smallerSourceSize : 0;
        const confidentProfile =
          (matches.length >= 20 && coverage >= 0.05) ||
          (matches.length >= 3 && coverage >= 0.25) ||
          (matches.length >= 2 && coverage >= 0.8);
        if (!confidentProfile) continue;
        for (const match of matches) {
          candidates.push({
            ...match,
            profileMatches: matches.length,
            profileCoverage: coverage,
          });
        }
      }
    }
  }
  return candidates.sort(
    (left, right) =>
      right.profileMatches - left.profileMatches ||
      right.profileCoverage - left.profileCoverage ||
      left.residual - right.residual,
  );
}

function deduplicateMirroredProviders<T extends SalesRow>(rows: T[]) {
  const parent = rows.map((_, index) => index);
  const componentSources = rows.map((row) => new Set([row.sourceId]));
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  for (const candidate of crossProviderMirrorCandidates(rows)) {
    let leftRoot = find(candidate.left);
    let rightRoot = find(candidate.right);
    if (leftRoot === rightRoot) continue;
    if (
      [...componentSources[leftRoot]].some((sourceId) => componentSources[rightRoot].has(sourceId))
    )
      continue;
    if (leftRoot > rightRoot) [leftRoot, rightRoot] = [rightRoot, leftRoot];
    parent[rightRoot] = leftRoot;
    for (const sourceId of componentSources[rightRoot]) componentSources[leftRoot].add(sourceId);
  }
  const components = new Map<number, number[]>();
  rows.forEach((_, index) => {
    const root = find(index);
    const values = components.get(root) ?? [];
    values.push(index);
    components.set(root, values);
  });
  const canonicalAt = new Map<number, T>();
  let duplicates = 0;
  for (const indices of components.values()) {
    if (indices.length === 1) continue;
    duplicates += indices.length - 1;
    const canonicalIndex = [...indices].sort(
      (left, right) => rowQuality(rows[right]) - rowQuality(rows[left]) || left - right,
    )[0];
    canonicalAt.set(Math.min(...indices), rows[canonicalIndex]);
  }
  return {
    rows: rows.flatMap((row, index) => {
      const indices = components.get(find(index))!;
      if (indices.length === 1) return [row];
      return index === Math.min(...indices) ? [canonicalAt.get(index)!] : [];
    }),
    duplicates,
  };
}

/**
 * Deux copies techniques du même ticket sont fusionnées au sein d'un fournisseur. Entre deux
 * fournisseurs, la fusion n'est faite que lorsqu'une série cohérente de tickets du même site a le
 * même montant et le même instant à quelques secondes près. Les décalages entiers de fuseau horaire
 * sont testés afin de rapprocher un export en heure locale d'une API en UTC.
 */
export function deduplicateCrossSourceSales<T extends SalesRow>(input: T[]) {
  const rows: T[] = [];
  const byFingerprint = new Map<string, number>();
  const byProviderReceipt = new Map<string, number>();
  let duplicateCandidates = 0;
  for (const row of input) {
    if (!isComparableSale(row)) {
      rows.push(row);
      continue;
    }
    const details =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const receiptNumber = String(details.receiptNumber ?? '').trim();
    const provider = String(row.source?.provider ?? '').trim();
    const siteId = String(row.source?.siteId ?? '').trim();
    const sourceScope = provider ? `${provider}|${siteId || 'unassigned'}` : '';
    const receiptKey = sourceScope && receiptNumber ? `${sourceScope}|${receiptNumber}` : '';
    const receiptIndex = receiptKey ? byProviderReceipt.get(receiptKey) : undefined;
    if (receiptIndex != null) {
      duplicateCandidates += 1;
      const existing = rows[receiptIndex];
      if (row.source?.isPrimaryPos && !existing.source?.isPrimaryPos) rows[receiptIndex] = row;
      continue;
    }
    const fingerprint = [
      sourceScope || `source:${row.sourceId}`,
      row.saleDate.toISOString(),
      amountKey(row.grossAmount),
      row.transactionCount,
      String(row.paymentMethod ?? '')
        .trim()
        .toLowerCase(),
    ].join('|');
    const existingIndex = byFingerprint.get(fingerprint);
    if (existingIndex == null || rows[existingIndex].sourceId === row.sourceId) {
      byFingerprint.set(fingerprint, rows.length);
      if (receiptKey) byProviderReceipt.set(receiptKey, rows.length);
      rows.push(row);
      continue;
    }
    duplicateCandidates += 1;
    const existing = rows[existingIndex];
    if (row.source?.isPrimaryPos && !existing.source?.isPrimaryPos) rows[existingIndex] = row;
  }
  const mirrored = deduplicateMirroredProviders(rows);
  return {
    rows: mirrored.rows,
    duplicateCandidates: duplicateCandidates + mirrored.duplicates,
  };
}
