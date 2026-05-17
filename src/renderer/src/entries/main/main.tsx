import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@xterm/xterm/css/xterm.css';
import 'allotment/dist/style.css';
import '@renderer/styles/global.css';

import { App } from '@renderer/app/App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
