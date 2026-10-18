// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LocationPicker } from '../components/LocationPicker';

// Mock maplibre-gl
vi.mock('maplibre-gl', () => {
  class MockMap {
    on = vi.fn();
    remove = vi.fn();
    setCenter = vi.fn();
    flyTo = vi.fn();
  }

  class MockMarker {
    setLngLat = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
    on = vi.fn();
    getLngLat = vi.fn().mockReturnValue({ lat: 0.35, lng: 32.61 });
  }

  return {
    Map: MockMap,
    Marker: MockMarker,
    setWorkerUrl: vi.fn(),
  };
});

// Mock mapStyle
vi.mock('@/lib/mapStyle', () => ({
  fetchBaseStyle: vi.fn().mockResolvedValue({}),
  transformStyle: vi.fn().mockReturnValue({}),
}));

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const msgs: Record<string, string> = {
        loc_confirm: 'Confirm location',
        loc_helper: 'Location is rounded',
        loc_type_area: 'Type your area',
        close: 'Close',
        btn_send: 'Send',
        btn_checking: 'Checking…',
        btn_retry: 'Tap to retry',
      };
      return msgs[key] || key;
    },
  }),
}));

describe('LocationPicker Sheet & Turnstile Token flow', () => {
  const origEnv = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let renderOptions: any = null;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key-123';
    renderOptions = null;

    // Mock window.turnstile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).turnstile = {
      render: vi.fn().mockImplementation((_container, options) => {
        renderOptions = options;
        return 'widget-id-mock-1';
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
  });

  afterEach(() => {
    if (origEnv) {
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = origEnv;
    } else {
      delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).turnstile;
    vi.restoreAllMocks();
  });

  it('renders sheet, keeps Send disabled on Checking…, then on success callback enables Send and submits turnstile_token', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <LocationPicker
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        initialCoords={{ lat: 0.3476, lng: 32.5825 }}
      />
    );

    // 1. Initial state: Turnstile render was called with callbacks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).turnstile.render).toHaveBeenCalled();
    expect(renderOptions).toBeDefined();

    // 2. Before success callback: Send button is disabled with "Checking…"
    const checkingBtn = screen.getByRole('button', { name: /Checking…/i });
    expect(checkingBtn).toBeDefined();
    expect((checkingBtn as HTMLButtonElement).disabled).toBe(true);

    // Attempting to click when checking does not fire onConfirm
    fireEvent.click(checkingBtn);
    expect(onConfirm).not.toHaveBeenCalled();

    // 3. Simulate Cloudflare Turnstile success callback with token
    act(() => {
      renderOptions.callback('mock-turnstile-token-xyz');
    });

    // 4. Send button is now enabled and displays "Send"
    const sendBtn = screen.getByRole('button', { name: /Send/i });
    expect(sendBtn).toBeDefined();
    expect((sendBtn as HTMLButtonElement).disabled).toBe(false);

    // 5. Click Send button and assert report request includes turnstile_token
    act(() => {
      fireEvent.click(sendBtn);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      lat: 0.3476,
      lng: 32.5825,
      loc_precision: 'pin',
      area_name: undefined,
      turnstile_token: 'mock-turnstile-token-xyz',
    });
  });

  it('shows "Tap to retry" fallback if timeout fires before token arrives, clicking it resets widget', () => {
    vi.useFakeTimers();
    try {
      const onConfirm = vi.fn();
      const onClose = vi.fn();

      render(
        <LocationPicker
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          initialCoords={{ lat: 0.3476, lng: 32.5825 }}
        />
      );

      // Initially Checking…
      expect(screen.getByRole('button', { name: /Checking…/i })).toBeDefined();

      // Fast forward 8 seconds without token
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      // Now "Tap to retry" is visible
      const retryBtn = screen.getByRole('button', { name: /Tap to retry/i });
      expect(retryBtn).toBeDefined();
      expect((retryBtn as HTMLButtonElement).disabled).toBe(false);

      // Clicking Tap to retry calls turnstile.reset
      act(() => {
        fireEvent.click(retryBtn);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((window as any).turnstile.reset).toHaveBeenCalledWith('widget-id-mock-1');
      // Returns back to Checking…
      expect(screen.getByRole('button', { name: /Checking…/i })).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
