import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppStore } from '../store/app-store';
import { BrowserFeedbackModal } from './BrowserFeedbackModal';

type BrowserTabProps = {
  tab: Extract<import('@shared/types').Tab, { type: 'browser' }>;
};

export function BrowserTab({ tab }: BrowserTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [urlInput, setUrlInput] = useState(tab.url === 'about:blank' ? '' : tab.url);
  const selectMode = useAppStore((s) => s.browserSelectMode[tab.id] ?? false);
  const setBrowserSelectMode = useAppStore((s) => s.setBrowserSelectMode);

  // Sync URL bar when navigation state changes externally
  useEffect(() => {
    if (tab.url !== 'about:blank') {
      setUrlInput(tab.url);
    }
  }, [tab.url]);

  // ── Bounds synchronization ─────────────────────────────────────────────────
  const sendBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    void window.forgepad.browser.setBounds(tab.id, {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }, [tab.id]);

  // Observe size changes and window resize
  useEffect(() => {
    sendBounds();
    const observer = new ResizeObserver(sendBounds);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', sendBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sendBounds);
    };
  }, [sendBounds]);

  // ── Visibility management ─────────────────────────────────────────────────
  useEffect(() => {
    void window.forgepad.browser.setVisible(tab.id, true);
    sendBounds();
    return () => {
      void window.forgepad.browser.setVisible(tab.id, false);
    };
  }, [tab.id, sendBounds]);

  // ── Navigation handlers ───────────────────────────────────────────────────
  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url) return;
    void window.forgepad.browser.navigate(tab.id, url);
  };

  const handleBack = () => void window.forgepad.browser.goBack(tab.id);
  const handleForward = () => void window.forgepad.browser.goForward(tab.id);
  const handleReloadOrStop = () => {
    if (tab.isLoading) {
      void window.forgepad.browser.stop(tab.id);
    } else {
      void window.forgepad.browser.reload(tab.id);
    }
  };

  const handleToggleSelect = () => {
    setBrowserSelectMode(tab.id, !selectMode);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-(--color-border) border-b bg-(--color-bg-1) px-2">
        {/* Back */}
        <button
          type="button"
          onClick={handleBack}
          disabled={!tab.canGoBack}
          title="Back"
          className="rounded p-1.5 text-(--color-text-3) transition-colors hover:bg-(--color-bg-3) hover:text-(--color-text-1) disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Forward */}
        <button
          type="button"
          onClick={handleForward}
          disabled={!tab.canGoForward}
          title="Forward"
          className="rounded p-1.5 text-(--color-text-3) transition-colors hover:bg-(--color-bg-3) hover:text-(--color-text-1) disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Reload / Stop */}
        <button
          type="button"
          onClick={handleReloadOrStop}
          title={tab.isLoading ? 'Stop' : 'Reload'}
          className="rounded p-1.5 text-(--color-text-3) transition-colors hover:bg-(--color-bg-3) hover:text-(--color-text-1)"
        >
          {tab.isLoading ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M12 7A5 5 0 1 1 7 2M7 2l2.5 2.5M7 2L4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        {/* URL bar */}
        <form onSubmit={handleNavigate} className="min-w-0 flex-1">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="Enter URL or search..."
            className="h-7 w-full rounded border border-(--color-border) bg-(--color-bg-2) px-2.5 text-(--color-text-1) text-xs transition-colors placeholder:text-(--color-text-3) focus:border-(--color-accent) focus:outline-none focus:ring-(--color-accent)/30 focus:ring-1"
          />
        </form>

        {/* Select Element toggle */}
        <button
          type="button"
          onClick={handleToggleSelect}
          title={selectMode ? 'Exit element selection' : 'Select element to comment'}
          className={[
            'flex h-7 items-center gap-1.5 rounded px-2.5 font-medium text-xs transition-colors',
            selectMode
              ? 'bg-(--color-accent) text-white'
              : 'border border-(--color-border) bg-(--color-bg-2) text-(--color-text-2) hover:border-(--color-border-hover) hover:text-(--color-text-1)',
          ].join(' ')}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="6.5" cy="6.5" r="1.5" fill="currentColor" />
            <path d="M6.5 1v2M6.5 10v2M1 6.5h2M10 6.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          {selectMode ? 'Selecting…' : 'Inspect'}
        </button>
      </div>

      {/* ── Loading bar ───────────────────────────────────────────────────── */}
      {tab.isLoading && (
        <div className="h-[2px] w-full shrink-0 overflow-hidden bg-(--color-bg-3)">
          <div className="h-full animate-[browser-loading_1.4s_ease-in-out_infinite] bg-(--color-accent)" />
        </div>
      )}

      {/* ── WebContentsView placeholder ───────────────────────────────────── */}
      {/* This div is transparent — the native WebContentsView is painted over
          it from the main process. Its sole purpose is to be measured for bounds. */}
      <div ref={containerRef} className="relative w-full flex-1" style={{ background: 'transparent' }}>
        {/* Select mode overlay hint */}
        {selectMode && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-4">
            <div className="rounded-full border border-(--color-accent)/50 bg-(--color-bg-1)/90 px-3 py-1.5 text-(--color-accent) text-xs shadow backdrop-blur-sm">
              Click any element on the page • ESC to cancel
            </div>
          </div>
        )}
      </div>

      {/* Feedback modal (portal-like, rendered inside this component tree) */}
      <BrowserFeedbackModal />
    </div>
  );
}
