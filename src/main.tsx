import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const fontStylesheet = document.querySelector<HTMLLinkElement>('link[data-font-stylesheet]');
if (fontStylesheet) fontStylesheet.media = 'all';

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
