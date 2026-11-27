import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './components/schooladmin/school-admin-mobile-rebuild.css';

const fontStylesheet = document.querySelector<HTMLLinkElement>('link[data-font-stylesheet]');
if (fontStylesheet) fontStylesheet.media = 'all';

createRoot(document.getElementById('root')!).render(<App />);
