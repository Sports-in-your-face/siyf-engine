export type EngineLogLevel = 'info' | 'warn' | 'error';

let runtimeOverride: boolean | null = null;

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  return fallback;
}

function readShowErrorsEnv(): string | undefined {
  const fromProcess = typeof process !== 'undefined' ? process.env.SIYF_SHOW_ERRORS : undefined;
  const fromVite = typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: Record<string, string | boolean> }).env?.VITE_SIYF_SHOW_ERRORS
    : undefined;
  if (fromProcess != null) return fromProcess;
  if (fromVite != null) return String(fromVite);
  return undefined;
}

function defaultShowErrors(): boolean {
  const isProd = typeof import.meta !== 'undefined'
    && Boolean((import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD);
  return !isProd;
}

/** When false, engine info/warn/error console output is suppressed. */
export function getShowEngineErrors(): boolean {
  if (runtimeOverride !== null) return runtimeOverride;
  return parseBool(readShowErrorsEnv(), defaultShowErrors());
}

export function setShowEngineErrors(show: boolean): void {
  runtimeOverride = show;
}

export function resetShowEngineErrorsOverride(): void {
  runtimeOverride = null;
}

export function engineLog(level: EngineLogLevel, ...args: unknown[]): void {
  if (!getShowEngineErrors()) return;
  if (level === 'info') console.info(...args);
  else if (level === 'warn') console.warn(...args);
  else console.error(...args);
}

export function engineLogInfo(...args: unknown[]): void {
  engineLog('info', ...args);
}

export function engineLogWarn(...args: unknown[]): void {
  engineLog('warn', ...args);
}

export function engineLogError(...args: unknown[]): void {
  engineLog('error', ...args);
}

declare global {
  interface Window {
    __siyfEngineLog?: {
      getShowErrors: typeof getShowEngineErrors;
      setShowErrors: typeof setShowEngineErrors;
      reset: typeof resetShowEngineErrorsOverride;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__siyfEngineLog = {
    getShowErrors: getShowEngineErrors,
    setShowErrors: setShowEngineErrors,
    reset: resetShowEngineErrorsOverride,
  };
}
