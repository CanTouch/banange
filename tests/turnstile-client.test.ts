import { describe, it, expect, vi } from 'vitest';
import {
  formatTurnstileErrorCode,
  createTurnstileCallbacks,
} from '../lib/turnstileClient';

describe('Turnstile Client Helpers', () => {
  describe('formatTurnstileErrorCode', () => {
    it('formats numeric error codes with TURNSTILE_ prefix', () => {
      expect(formatTurnstileErrorCode(110200)).toBe('TURNSTILE_110200');
      expect(formatTurnstileErrorCode(300030)).toBe('TURNSTILE_300030');
      expect(formatTurnstileErrorCode(600010)).toBe('TURNSTILE_600010');
    });

    it('formats string error codes with TURNSTILE_ prefix in uppercase', () => {
      expect(formatTurnstileErrorCode('110200')).toBe('TURNSTILE_110200');
      expect(formatTurnstileErrorCode('interactive_timeout')).toBe('TURNSTILE_INTERACTIVE_TIMEOUT');
      expect(formatTurnstileErrorCode('crashed')).toBe('TURNSTILE_CRASHED');
    });

    it('preserves already prefixed code labels', () => {
      expect(formatTurnstileErrorCode('TURNSTILE_110200')).toBe('TURNSTILE_110200');
    });

    it('handles undefined, null, or empty string gracefully', () => {
      expect(formatTurnstileErrorCode(undefined)).toBe('TURNSTILE_ERROR');
      expect(formatTurnstileErrorCode(null as unknown as undefined)).toBe('TURNSTILE_ERROR');
      expect(formatTurnstileErrorCode('')).toBe('TURNSTILE_ERROR');
    });
  });

  describe('createTurnstileCallbacks', () => {
    it('success callback stores token and enables sending', () => {
      const setToken = vi.fn();
      const onToastError = vi.fn();
      const resetWidget = vi.fn();

      const callbacks = createTurnstileCallbacks({
        setToken,
        onToastError,
        resetWidget,
      });

      callbacks.callback('cf-turnstile-token-12345');

      expect(setToken).toHaveBeenCalledWith('cf-turnstile-token-12345');
      expect(onToastError).not.toHaveBeenCalled();
      expect(resetWidget).not.toHaveBeenCalled();
    });

    it('error-callback logs exact code to console, clears token, toasts error code, and resets widget', () => {
      const setToken = vi.fn();
      const onToastError = vi.fn();
      const resetWidget = vi.fn();
      const logError = vi.fn();

      const callbacks = createTurnstileCallbacks({
        setToken,
        onToastError,
        resetWidget,
        logError,
      });

      callbacks['error-callback'](110200);

      // 1. Log exact Turnstile error code to console
      expect(logError).toHaveBeenCalledWith('Turnstile error code:', 110200);

      // 2. Clear token (disabling Send)
      expect(setToken).toHaveBeenCalledWith(null);

      // 3. Show error in toast with code label e.g. [TURNSTILE_110200]
      expect(onToastError).toHaveBeenCalledWith('TURNSTILE_110200');

      // 4. Reset the widget
      expect(resetWidget).toHaveBeenCalledTimes(1);
    });

    it('expired-callback clears token, toasts TURNSTILE_EXPIRED, and resets widget', () => {
      const setToken = vi.fn();
      const onToastError = vi.fn();
      const resetWidget = vi.fn();
      const logWarn = vi.fn();

      const callbacks = createTurnstileCallbacks({
        setToken,
        onToastError,
        resetWidget,
        logWarn,
      });

      callbacks['expired-callback']();

      expect(logWarn).toHaveBeenCalled();
      expect(setToken).toHaveBeenCalledWith(null);
      expect(onToastError).toHaveBeenCalledWith('TURNSTILE_EXPIRED');
      expect(resetWidget).toHaveBeenCalledTimes(1);
    });

    it('timeout-callback clears token, toasts TURNSTILE_TIMEOUT, and resets widget', () => {
      const setToken = vi.fn();
      const onToastError = vi.fn();
      const resetWidget = vi.fn();
      const logWarn = vi.fn();

      const callbacks = createTurnstileCallbacks({
        setToken,
        onToastError,
        resetWidget,
        logWarn,
      });

      callbacks['timeout-callback']();

      expect(logWarn).toHaveBeenCalled();
      expect(setToken).toHaveBeenCalledWith(null);
      expect(onToastError).toHaveBeenCalledWith('TURNSTILE_TIMEOUT');
      expect(resetWidget).toHaveBeenCalledTimes(1);
    });
  });
});
