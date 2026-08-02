import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { resolveRuntimeMode } from './app/runtime-mode';
import './styles/global.css';

const runtimeMode = resolveRuntimeMode(import.meta.env.VITE_RUNTIME_MODE);
const root = document.getElementById('root');

if (root === null) {
  throw new Error('Root element #root was not found.');
}

createRoot(root).render(
  <StrictMode>
    <main id="app-shell" data-runtime-mode={runtimeMode} />
  </StrictMode>,
);
