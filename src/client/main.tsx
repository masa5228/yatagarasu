import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, getStoredThemeId } from './lib/theme';
import './styles/global.css';

applyTheme(getStoredThemeId());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
