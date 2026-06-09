/// <reference types="vite/client" />

interface ImportMeta {
  readonly env: ImportMetaEnv;
  glob: (
    pattern: string,
    options?: { eager?: boolean; import?: string },
  ) => Record<string, unknown>;
}

interface ImportMetaEnv {
  readonly VITE_SIYF_API_URL?: string;
  readonly VITE_SIYF_CDN_URL?: string;
}
