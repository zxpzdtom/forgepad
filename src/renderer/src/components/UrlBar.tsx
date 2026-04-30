import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BrowserHistoryEntry } from '@shared/types';

type UrlBarProps = {
  value: string;
  onChange: (url: string) => void;
  onNavigate: (url: string) => void;
  history: BrowserHistoryEntry[];
};

/** Globe icon fallback for missing favicons */
function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-subtle">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="8" cy="8" rx="2.5" ry="6.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1.5" y1="6" x2="14.5" y2="6" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1.5" y1="10" x2="14.5" y2="10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function FaviconImg({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(!src);
  if (failed || !src) return <GlobeIcon />;
  return (
    <img
      src={src}
      alt={alt}
      width={14}
      height={14}
      className="shrink-0 rounded-sm"
      onError={() => setFailed(true)}
    />
  );
}

export function UrlBar({ value, onChange, onNavigate, history }: UrlBarProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Suggestions: show recent 10 when empty, else fuzzy-match
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return history.slice(0, 10);
    return history
      .filter((h) => h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q))
      .slice(0, 10);
  }, [value, history]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset activeIdx when suggestions change
  useEffect(() => {
    setActiveIdx(-1);
  }, [suggestions.length]);

  const navigate = useCallback(
    (url: string) => {
      setOpen(false);
      setActiveIdx(-1);
      onNavigate(url);
    },
    [onNavigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setOpen(true);
          setActiveIdx(0);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          navigate(value);
          return;
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => {
          if (i <= 0) {
            setOpen(false);
            return -1;
          }
          return i - 1;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIdx >= 0 && suggestions[activeIdx]) {
          navigate(suggestions[activeIdx].url);
        } else {
          navigate(value);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        setActiveIdx(-1);
        inputRef.current?.blur();
      }
    },
    [open, value, suggestions, activeIdx, navigate],
  );

  const handleFocus = useCallback(() => {
    inputRef.current?.select();
    setOpen(true);
  }, []);

  const handleChevronClick = useCallback(() => {
    if (open) {
      setOpen(false);
      setActiveIdx(-1);
    } else {
      setOpen(true);
      setActiveIdx(-1);
      inputRef.current?.focus();
    }
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative min-w-0 flex-1">
      {/* Input row */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="Enter URL..."
          spellCheck={false}
          className="h-7 w-full rounded border border-border bg-panel-2 py-0 pl-2.5 pr-7 text-text text-xs transition-colors placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
        {/* Chevron / history toggle */}
        <button
          type="button"
          tabIndex={-1}
          onClick={handleChevronClick}
          title={open ? 'Close history' : 'Show history'}
          className="absolute right-1 flex h-5 w-5 items-center justify-center rounded text-subtle transition-colors hover:text-muted"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-panel shadow-xl">
          {suggestions.map((entry, idx) => {
            const isActive = idx === activeIdx;
            return (
              <button
                key={entry.url + idx}
                type="button"
                onMouseDown={(e) => {
                  // Prevent input blur before click fires
                  e.preventDefault();
                  navigate(entry.url);
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                className={[
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
                  isActive ? 'bg-panel-3' : 'hover:bg-panel-2',
                ].join(' ')}
              >
                <FaviconImg src={entry.favicon} alt={entry.title} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-text leading-tight">{entry.title || entry.url}</div>
                  <div className="truncate text-[11px] text-subtle leading-tight">{entry.url}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
