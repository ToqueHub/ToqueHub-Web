import type { PurchasingBootstrap } from '../../../types';
import { Field } from '../components/PurchasingUi';

export function ReceiptFormFields({
  bootstrap,
  siteId,
  locationId,
  onSite,
  onLocation,
}: {
  bootstrap: PurchasingBootstrap;
  siteId: string;
  locationId: string;
  onSite: (id: string) => void;
  onLocation: (id: string) => void;
}) {
  return (
    <>
      <Field label="Site">
        <select value={siteId} onChange={(event) => onSite(event.target.value)}>
          {bootstrap.sites.map((site) => (
            <option value={site.id} key={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Emplacement Stocks">
        <select value={locationId} onChange={(event) => onLocation(event.target.value)}>
          <option value="">Sans emplacement</option>
          {bootstrap.locations
            .filter((location) => location.siteId === siteId)
            .map((location) => (
              <option value={location.id} key={location.id}>
                {location.name}
              </option>
            ))}
        </select>
      </Field>
    </>
  );
}
