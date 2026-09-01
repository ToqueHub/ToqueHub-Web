import { Boxes, CheckCircle2, FileText, Landmark, WalletCards } from 'lucide-react';
import { activeLocale } from '../../i18n/runtime';
import type { EquipmentFinancingContractsResponse } from '../../types';

export function EquipmentFinancingContractsPanel({
  data,
}: {
  data: EquipmentFinancingContractsResponse | null;
}) {
  const money = (value: number | null | undefined, currency = 'EUR') =>
    new Intl.NumberFormat(activeLocale(), {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value ?? 0));
  const date = (value?: string | null) =>
    value ? new Date(value).toLocaleDateString(activeLocale()) : '—';

  if (!data) {
    return (
      <div className="cockpit-receivables-empty">
        <WalletCards size={30} />
        <strong>Financements indisponibles</strong>
        <span>Actualisez la page pour recharger les contrats.</span>
      </div>
    );
  }

  return (
    <div className="equipment-financing-contracts-panel">
      <div className="equipment-financing-summary-grid">
        <div>
          <span>Contrats</span>
          <strong>{data.summary.contractCount}</strong>
        </div>
        <div>
          <span>Contrats actifs</span>
          <strong>{data.summary.activeContractCount}</strong>
        </div>
        <div>
          <span>Mensualités</span>
          <strong>{money(data.summary.monthlyTotal)}</strong>
        </div>
        <div>
          <span>Montant financé</span>
          <strong>{money(data.summary.financedTotal)}</strong>
        </div>
      </div>

      {data.items.length ? (
        <div className="equipment-financing-contract-list">
          {data.items.map((contract) => (
            <article className="equipment-financing-contract" key={contract.id}>
              <header>
                <div>
                  <span
                    className={`stocks-financing-source ${contract.source === 'FENNOA' ? 'fennoa' : ''}`}
                  >
                    {contract.source === 'FENNOA' ? 'Source Fennoa prioritaire' : 'Source ToqueHub'}
                  </span>
                  <h4>
                    {contract.acquisitionMode === 'LEASING' ? 'Leasing' : 'Crédit'}
                    {contract.contractNumber ? ` · ${contract.contractNumber}` : ''}
                  </h4>
                  <p>
                    {contract.financingProvider ||
                      contract.supplier?.name ||
                      'Organisme à compléter'}
                  </p>
                </div>
                <div className="equipment-financing-contract-main-amount">
                  <strong>{money(contract.monthlyPayment, contract.currency)}</strong>
                  <span>par mois</span>
                </div>
              </header>

              <div className="equipment-financing-contract-facts">
                <div>
                  <span>Début</span>
                  <strong>{date(contract.financingStart)}</strong>
                </div>
                <div>
                  <span>Échéance</span>
                  <strong>{date(contract.financingEnd)}</strong>
                </div>
                <div>
                  <span>Durée</span>
                  <strong>{contract.termMonths ? `${contract.termMonths} mois` : '—'}</strong>
                </div>
                <div>
                  <span>Montant financé</span>
                  <strong>{money(contract.financedAmount, contract.currency)}</strong>
                </div>
                <div>
                  <span>Valeur de rachat</span>
                  <strong>{money(contract.buyoutValue, contract.currency)}</strong>
                </div>
              </div>

              {contract.fennoa ? (
                <div className="equipment-financing-fennoa-proof">
                  <Landmark size={16} />
                  <span>
                    Écriture Fennoa {contract.fennoa.accountCode} ·{' '}
                    {date(contract.fennoa.entryDate)} ·{' '}
                    {money(contract.fennoa.bookedAmount, contract.currency)}
                  </span>
                </div>
              ) : null}

              <div className="equipment-financing-assets">
                <span>Matériel rattaché</span>
                <div>
                  {contract.equipment.length ? (
                    contract.equipment.map((item) => (
                      <span className="equipment-financing-asset-chip" key={item.id}>
                        <Boxes size={13} /> {item.name}
                      </span>
                    ))
                  ) : (
                    <span className="muted">Aucun matériel rapproché.</span>
                  )}
                </div>
              </div>

              <footer>
                <span>
                  {contract.documents.length} document{contract.documents.length > 1 ? 's' : ''}
                </span>
                {contract.documents.map((document) => (
                  <span className="equipment-financing-asset-chip" key={document.id}>
                    <FileText size={13} /> {document.originalName}
                  </span>
                ))}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="cockpit-receivables-empty">
          <CheckCircle2 size={30} />
          <strong>Aucun financement enregistré</strong>
          <span>Les contrats importés avec les documents matériel apparaîtront ici.</span>
        </div>
      )}
    </div>
  );
}
