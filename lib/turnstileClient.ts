/**
 * Client-side Cloudflare Turnstile helpers
 */

/**
 * Format a Cloudflare Turnstile error code into a clean mono code label e.g. [TURNSTILE_110200]
 */
export function formatTurnstileErrorCode(code?: string | number): string {
  if (code === undefined || code === null || code === '') {
    return 'TURNSTILE_ERROR';
  }
  const str = String(code).trim();
  if (str.toUpperCase().startsWith('TURNSTILE_')) {
    return str.toUpperCase();
  }
  return `TURNSTILE_${str.toUpperCase()}`;
}

export interface TurnstileCallbacksOptions {
  setToken: (token: string | null) => void;
  onToastError?: (code: string) => void;
  resetWidget?: () => void;
  logError?: (msg: string, ...args: unknown[]) => void;
  logWarn?: (msg: string, ...args: unknown[]) => void;
}

/**
 * Creates Turnstile callbacks ensuring:
 * - On success: store token
 * - On error, expired, or timeout: clear token, log exact code to console, trigger toast with code label, and reset widget
 */
export function createTurnstileCallbacks(options: TurnstileCallbacksOptions) {
  const logError = options.logError || console.error;
  const logWarn = options.logWarn || console.warn;

  return {
    callback: (token: string) => {
      options.setToken(token);
    },
    'error-callback': (code?: string | number) => {
      logError('Turnstile error code:', code);
      options.setToken(null);
      const formatted = formatTurnstileErrorCode(code);
      options.onToastError?.(formatted);
      options.resetWidget?.();
    },
    'expired-callback': () => {
      logWarn('Turnstile expired');
      options.setToken(null);
      options.onToastError?.('TURNSTILE_EXPIRED');
      options.resetWidget?.();
    },
    'timeout-callback': () => {
      logWarn('Turnstile timeout');
      options.setToken(null);
      options.onToastError?.('TURNSTILE_TIMEOUT');
      options.resetWidget?.();
    },
  };
}
