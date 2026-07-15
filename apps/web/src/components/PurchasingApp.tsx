import { PurchasingWorkspace, type PurchasingTab } from './purchasing/PurchasingWorkspace';
export type { PurchasingTab } from './purchasing/PurchasingWorkspace';

type Props = {
  token: string;
  tab: PurchasingTab;
  onNavigate: (tab: PurchasingTab) => void;
};

export function PurchasingApp(props: Props) {
  return <PurchasingWorkspace {...props} />;
}
