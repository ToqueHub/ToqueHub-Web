import {
  FinanceWorkspace,
  preloadFinanceWorkspace,
  type FinanceTab,
} from './finance/FinanceWorkspace';

export { preloadFinanceWorkspace };

type FinanceAppProps = {
  token: string;
  tab: FinanceTab;
  onNavigate: (tab: FinanceTab) => void;
};

export function FinanceApp(props: FinanceAppProps) {
  return <FinanceWorkspace {...props} />;
}
