import {
  FinanceWorkspace,
  preloadFinanceWorkspace,
  type FinanceFocusSection,
  type FinanceTab,
} from './finance/FinanceWorkspace';

export { preloadFinanceWorkspace };

type FinanceAppProps = {
  token: string;
  tab: FinanceTab;
  onNavigate: (tab: FinanceTab) => void;
  focusSection?: FinanceFocusSection;
  onFocusSectionHandled?: () => void;
};

export function FinanceApp(props: FinanceAppProps) {
  return <FinanceWorkspace {...props} />;
}
