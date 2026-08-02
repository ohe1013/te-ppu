import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from './app/AppRoot';
import { createAppServices } from './app/app-services';
import { resolveRuntimeMode } from './app/runtime-mode';
import { SafeAreaProvider } from './platform/safe-area-provider';
import './styles/global.css';

const runtimeMode = resolveRuntimeMode(import.meta.env.VITE_RUNTIME_MODE);
const services = createAppServices(runtimeMode);
const root = document.getElementById('root');

if (root === null) {
  throw new Error('Root element #root was not found.');
}

createRoot(root).render(
  <StrictMode>
    <SafeAreaProvider platform={services.platform}>
      <AppRoot services={services} />
    </SafeAreaProvider>
  </StrictMode>,
);
