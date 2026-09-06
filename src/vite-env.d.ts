/// <reference types="vite/client" />
/// <reference types="chrome" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
