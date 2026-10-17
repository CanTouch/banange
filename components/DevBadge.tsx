'use client';

import React from 'react';

export function DevBadge({ isDev }: { isDev?: boolean }) {
  if (!isDev) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase border border-amber-500/40 bg-amber-500/10 text-amber-400 select-none"
      title="Running in local DEV MODE with in-memory store"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      DEV MODE
    </span>
  );
}
