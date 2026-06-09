import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installBrowserDialogLocalization } from './i18n/browserDialogs';

installBrowserDialogLocalization();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
