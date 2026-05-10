import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PetOverlay } from './components/pets/PetOverlay';
import './tauri-pet-api';

createRoot(document.getElementById('pet-root')!).render(
  <StrictMode>
    <PetOverlay />
  </StrictMode>,
);
