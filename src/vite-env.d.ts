/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RUNTIME_MODE: string;
  readonly VITE_E2E_DRIVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
