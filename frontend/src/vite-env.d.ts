/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL; falls back to the dev proxy (`/api`) when unset. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
