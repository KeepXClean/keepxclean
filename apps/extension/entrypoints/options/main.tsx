import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../src/styles/global.css';
import { bootDocumentTheme } from '../../src/ui/theme';
import { App } from './App';

bootDocumentTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
