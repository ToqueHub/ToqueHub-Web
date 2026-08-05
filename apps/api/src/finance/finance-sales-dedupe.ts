type SalesRow = {
  saleDate: Date;
  grossAmount: unknown;
  transactionCount: number;
  paymentMethod?: string | null;
  sourceId: string;
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

/**
 * La consolidation additionne toujours des fournisseurs ou des établissements distincts.
 * Seules deux copies du même ticket, provenant du même fournisseur pour le même site, peuvent
 * être fusionnées (par exemple l'ancien import fichier et la nouvelle synchronisation API).
 * Les doublons internes à une source sont gérés par sa clé externe propre au fournisseur.
 */
export function deduplicateCrossSourceSales<T extends SalesRow>(input: T[]) {
  const rows: T[] = [];
  const byFingerprint = new Map<string, number>();
  const byProviderReceipt = new Map<string, number>();
  let duplicateCandidates = 0;
  for (const row of input) {
    if (row.transactionCount <= 0) {
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
  return { rows, duplicateCandidates };
}
