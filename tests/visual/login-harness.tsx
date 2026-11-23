import React from 'react';
import { createRoot } from 'react-dom/client';
import { LoginView } from '../../src/components/auth/LoginView.tsx';
import { ParentPortalView } from '../../src/components/parent/ParentPortalView.tsx';
import './harness.css';

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') || 'light';
document.documentElement.setAttribute('data-theme', theme);

function Harness() {
  if (params.get('component') === 'parent') return <ParentPortalView />;
  return <LoginView />;
}

createRoot(document.getElementById('root')!).render(<Harness />);
