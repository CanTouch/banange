'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CellOut } from '@/lib/states';
import {
  PlaybackSnapshot,
  findNearestFrame,
  calculateHistoryStep,
} from '@/lib/history';

interface TimeSliderProps {
  onHistoricalChange: (
    cells: Array<CellOut & { area?: string }> | null,
    isLive: boolean,
    historyLabel?: string,
    darkCount?: number
  ) => void;
  isLite?: boolean;
  latestIngestTime?: string | null;
}

export function TimeSlider({ onHistoricalChange, isLite, latestIngestTime }: TimeSliderProps) {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const STEP_15_MIN_MS = 15 * 60 * 1000;

  const [baseNowMs, setBaseNowMs] = useState<number>(() => Date.now());
  const [sliderTimeMs, setSliderTimeMs] = useState<number>(() => Date.now());
  const [isLive, setIsLive] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [frameDarkCount, setFrameDarkCount] = useState<number | null>(null);

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cachedFramesRef = useRef<PlaybackSnapshot[]>([]);
  const currentFrameIdxRef = useRef<number>(0);

  const minTimeMs = baseNowMs - SEVEN_DAYS_MS;
  const maxTimeMs = baseNowMs;

  const formatEAT = (timeMs: number) => {
    try {
      return (
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Kampala',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(timeMs)) + ' EAT'
      );
    } catch {
      return new Date(timeMs).toLocaleTimeString();
    }
  };

  const formatUpdatedTime = () => {
    try {
      const d = latestIngestTime ? new Date(latestIngestTime) : new Date();
      return `Updated ${new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Kampala',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d)}`;
    } catch {
      return 'Updated recently';
    }
  };

  const pausePlayback = useCallback(() => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const returnToLive = useCallback(() => {
    pausePlayback();
    const freshNow = Date.now();
    setBaseNowMs(freshNow);
    setSliderTimeMs(freshNow);
    setIsLive(true);
    setFrameDarkCount(null);
    setErrorMsg(null);
    cachedFramesRef.current = [];
    onHistoricalChange(null, true);
  }, [onHistoricalChange, pausePlayback]);

  const fetchSingleSnapshot = useCallback(
    async (targetMs: number) => {
      if (targetMs >= baseNowMs - 5 * 60 * 1000) {
        returnToLive();
        return;
      }

      setIsLive(false);
      setIsLoading(true);
      setErrorMsg(null);

      const targetIso = new Date(targetMs).toISOString();
      try {
        const res = await fetch(`/api/map/history?at=${encodeURIComponent(targetIso)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Failed to fetch snapshot');
        }
        const data = await res.json();
        const cells = data.cells || [];
        const dark = data.totals?.dark_now ?? cells.filter((c: CellOut) => c.state === 'out').length;
        setFrameDarkCount(dark);
        const label = formatEAT(targetMs);
        onHistoricalChange(cells, false, label, dark);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load historical data');
      } finally {
        setIsLoading(false);
      }
    },
    [baseNowMs, onHistoricalChange, returnToLive]
  );

  const startPlayback = async () => {
    setErrorMsg(null);
    pausePlayback();

    const now = Date.now();
    setBaseNowMs(now);

    let startMs = sliderTimeMs;
    if (isLive || now - sliderTimeMs < STEP_15_MIN_MS) {
      startMs = now - 24 * 60 * 60 * 1000;
      setSliderTimeMs(startMs);
    }

    const windowMs = now - startMs;
    const stepMin = calculateHistoryStep(windowMs);

    setIsLoading(true);
    setIsLive(false);

    try {
      const fromIso = new Date(startMs).toISOString();
      const toIso = new Date(now).toISOString();
      const url = `/api/map/history?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&step=${stepMin}`;

      const res = await fetch(url);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to fetch playback sequence');
      }

      const data = await res.json();
      const frames: PlaybackSnapshot[] = data.snapshots || [];

      if (frames.length === 0) {
        returnToLive();
        return;
      }

      cachedFramesRef.current = frames;
      currentFrameIdxRef.current = 0;
      setIsPlaying(true);

      const firstFrame = frames[0];
      const firstFrameTime = new Date(firstFrame.time).getTime();
      setSliderTimeMs(firstFrameTime);
      setFrameDarkCount(firstFrame.totals.dark_now);
      onHistoricalChange(firstFrame.cells, false, formatEAT(firstFrameTime), firstFrame.totals.dark_now);

      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const frameInterval = isLite || prefersReducedMotion ? 1000 : 500;

      let idx = 0;
      playIntervalRef.current = setInterval(() => {
        idx++;
        if (idx >= frames.length) {
          returnToLive();
          return;
        }

        currentFrameIdxRef.current = idx;
        const currentFrame = frames[idx];
        const fTime = new Date(currentFrame.time).getTime();
        setSliderTimeMs(fTime);
        setFrameDarkCount(currentFrame.totals.dark_now);
        onHistoricalChange(
          currentFrame.cells,
          false,
          formatEAT(fTime),
          currentFrame.totals.dark_now
        );
      }, frameInterval);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Playback failed to start');
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSliderInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isPlaying) {
      pausePlayback();
    }

    const val = parseInt(e.target.value, 10);
    setSliderTimeMs(val);

    if (val >= maxTimeMs - 5 * 60 * 1000) {
      returnToLive();
      return;
    }

    setIsLive(false);

    if (cachedFramesRef.current.length > 0) {
      const nearest = findNearestFrame(val, cachedFramesRef.current);
      if (nearest) {
        setFrameDarkCount(nearest.totals.dark_now);
        onHistoricalChange(
          nearest.cells,
          false,
          formatEAT(new Date(nearest.time).getTime()),
          nearest.totals.dark_now
        );
        return;
      }
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchSingleSnapshot(val);
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return (
    <div className="w-full bg-[var(--surface)] backdrop-blur-xl border border-[var(--border)] rounded-2xl p-3 shadow-2xl select-none text-[var(--ink)]">
      {/* Top Header: EAT time label + Outage Count */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs font-semibold tracking-wider uppercase text-[var(--ink)]">
            {isLive ? 'LIVE NOW' : formatEAT(sliderTimeMs)}
          </span>
          <span className="font-mono text-xs text-[var(--muted)]">
            {isLive ? (
              'Real-time data'
            ) : frameDarkCount !== null ? (
              <span className={frameDarkCount > 0 ? 'text-[var(--out)] font-semibold' : 'text-[var(--muted)]'}>
                {frameDarkCount} {frameDarkCount === 1 ? 'area dark' : 'areas dark'}
              </span>
            ) : null}
          </span>
        </div>

        <div>
          {isLive ? (
            <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 font-mono text-xs font-semibold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{formatUpdatedTime()}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={returnToLive}
              className="px-2.5 py-1 rounded-full bg-[var(--out)] hover:opacity-95 text-[#05070D] font-sans text-xs font-bold shadow-md shadow-[var(--out)]/30 transition-all active:scale-95 flex items-center space-x-1 cursor-pointer"
            >
              <span>Return to Live</span>
            </button>
          )}
        </div>
      </div>

      {/* Scrubber Range Input */}
      <div className="flex items-center space-x-2.5 mb-2.5">
        <span className="font-mono text-xs text-[var(--muted)] whitespace-nowrap">-7d</span>
        <input
          type="range"
          suppressHydrationWarning
          min={minTimeMs}
          max={maxTimeMs}
          step={STEP_15_MIN_MS}
          value={sliderTimeMs}
          onChange={handleSliderInput}
          aria-label="History scrubber slider"
          className="w-full h-1.5 bg-[var(--border)] rounded-lg appearance-none cursor-pointer accent-[var(--out)]"
        />
        <span className="font-mono text-xs text-[var(--muted)] whitespace-nowrap">Now</span>
      </div>

      {/* Controls Bar: Play / Pause, Stop */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border)]">
        <div className="flex items-center space-x-2">
          {!isPlaying ? (
            <button
              type="button"
              onClick={startPlayback}
              disabled={isLoading}
              className="px-3 py-1 rounded-lg font-mono text-xs font-semibold flex items-center space-x-1.5 border border-[var(--out)]/40 bg-[var(--out)]/10 text-[var(--out)] hover:bg-[var(--out)]/20 active:scale-95 transition-all cursor-pointer"
              title="Play forward from this time to now"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>{isLive ? 'Play 24h' : 'Play'}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={pausePlayback}
                className="px-3 py-1 rounded-lg font-mono text-xs font-semibold flex items-center space-x-1.5 border border-[var(--back)]/40 bg-[var(--back)]/10 text-[var(--back)] hover:bg-[var(--back)]/20 active:scale-95 transition-all cursor-pointer"
                title="Pause playback"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                <span>Pause</span>
              </button>
              <button
                type="button"
                onClick={returnToLive}
                className="px-2.5 py-1 rounded-lg font-mono text-xs font-semibold flex items-center space-x-1 border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] active:scale-95 transition-all cursor-pointer"
                title="Stop and return to Live"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" />
                </svg>
                <span>Stop</span>
              </button>
            </>
          )}

          {isLoading && (
            <div className="flex items-center space-x-1.5 font-mono text-xs text-[var(--muted)]">
              <span className="w-3 h-3 border-2 border-[var(--out)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px]">Loading frames...</span>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="flex items-center space-x-2 font-mono text-xs text-red-400 bg-red-950/60 border border-red-500/40 rounded-lg px-2.5 py-0.5">
            <span className="truncate max-w-[140px] sm:max-w-xs">{errorMsg}</span>
            <button
              type="button"
              onClick={startPlayback}
              className="underline font-bold text-red-300 hover:text-white cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
