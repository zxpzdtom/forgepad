import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@renderer/styles/global.css';

import { PetOverlay } from '@renderer/components/pets/PetOverlay';

document.documentElement.style.background = 'transparent';
document.documentElement.classList.add('pet-window');
document.body.style.background = 'transparent';
document.body.classList.add('pet-window');
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.getElementById('root')?.classList.add('pet-window');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PetOverlay />
  </React.StrictMode>,
);
