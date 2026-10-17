'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export function detectAutoLiteMode(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    // Check saved override first
    const saved = window.localStorage.getItem('banange_lite');
    if (saved !== null) {
      return saved === 'true';
    }

    // Auto-detect
    const nav = window.navigator as unknown as {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };

    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) {
      return true;
    }

    if (nav.connection?.saveData) {
      return true;
    }

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

interface LiteModeContextType {
  isLite: boolean;
  setLite: (val: boolean) => void;
}

const LiteModeContext = createContext<LiteModeContextType>({
  isLite: false,
  setLite: () => {},
});

export function LiteModeProvider({ children }: { children: React.ReactNode }) {
  const [isLite, setIsLiteState] = useState(false);

  useEffect(() => {
    setIsLiteState(detectAutoLiteMode());
  }, []);

  const setLite = (val: boolean) => {
    setIsLiteState(val);
    try {
      window.localStorage.setItem('banange_lite', String(val));
    } catch {
      // ignore
    }
  };

  return (
    <LiteModeContext.Provider value={{ isLite, setLite }}>
      {children}
    </LiteModeContext.Provider>
  );
}

export function useLiteMode() {
  return useContext(LiteModeContext);
}
