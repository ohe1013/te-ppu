import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot, type AppRootProps } from './app/AppRoot';
import {
  createAppServices,
  type AppServiceOverrides,
} from './app/app-services';
import { isDevClearedProgressEnabled } from './app/dev-cleared-mode';
import { resolveRuntimeMode } from './app/runtime-mode';
import { PlatformBackProvider } from './platform/back-request';
import { SafeAreaProvider } from './platform/safe-area-provider';
import './styles/global.css';

const runtimeMode = resolveRuntimeMode(import.meta.env.VITE_RUNTIME_MODE);
const devClearedProgress = isDevClearedProgressEnabled({
  isDev: import.meta.env.DEV,
  mode: import.meta.env.MODE,
  runtimeMode,
  flag: import.meta.env.VITE_DEV_ALL_CLEARED,
});
const root = document.getElementById('root');

if (root === null) {
  throw new Error('Root element #root was not found.');
}
const rootElement = root;

async function mountApplication(): Promise<void> {
  let renderMatch: AppRootProps['renderMatch'];
  let serviceOverrides: AppServiceOverrides | undefined;

  if (import.meta.env.VITE_E2E_DRIVER === 'true') {
    const { createE2EWiring } = await import('./test-support/e2e-wiring');
    const wiring = createE2EWiring();
    serviceOverrides = wiring.serviceOverrides;
    renderMatch = wiring.renderMatch;
  }
  const services = createAppServices(
    runtimeMode,
    window.localStorage,
    serviceOverrides,
    { devClearedProgress },
  );

  createRoot(rootElement).render(
    <StrictMode>
      <PlatformBackProvider platform={services.platform}>
        <SafeAreaProvider platform={services.platform}>
          <AppRoot
            devClearedMode={devClearedProgress}
            services={services}
            renderMatch={renderMatch}
          />
        </SafeAreaProvider>
      </PlatformBackProvider>
    </StrictMode>,
  );
}

void mountApplication();
