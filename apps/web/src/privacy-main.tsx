import React from 'react';
import ReactDOM from 'react-dom/client';
import PrivacyApp from './PrivacyApp';
import './styles/tokens.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element in privacy/index.html');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <PrivacyApp />
  </React.StrictMode>
);
