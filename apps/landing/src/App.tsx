import { LandingPage } from './components/LandingPage';
import { DocumentationPage } from './components/DocumentationPage';

export function App() {
  return window.location.pathname === '/documentation' ? <DocumentationPage /> : <LandingPage />;
}
