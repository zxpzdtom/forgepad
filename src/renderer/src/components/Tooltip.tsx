import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Lightweight tooltip that appears on hover with optional keyboard shortcut hint.
 * Uses a portal + fixed positioning so the bubble is never clipped by parent
 * overflow or stacking-context z-index.
 */
export function Tooltip({
  children,
  label,
  shortcut,
  position = 'top',
}: {
  children: ReactNode;
  label: string;
  shortcut?: string;
  position?: 'top' | 'bottom';
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), 150);
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
    setCoords(null);
  }, []);

  // Measure wrapper and position the bubble after it renders
  useLayoutEffect(() => {
    if (!visible || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const gap = 6;

    if (position === 'top') {
      setCoords({
        top: rect.top - gap,
        left: rect.left + rect.width / 2,
      });
    } else {
      setCoords({
        top: rect.bottom + gap,
        left: rect.left + rect.width / 2,
      });
    }
  }, [visible, position]);

  // After coords are set, adjust if the bubble overflows viewport edges
  useLayoutEffect(() => {
    if (!coords || !bubbleRef.current) return;
    const bubble = bubbleRef.current;
    const bRect = bubble.getBoundingClientRect();
    const pad = 8;
    let adjustX = 0;

    if (bRect.left < pad) {
      adjustX = pad - bRect.left;
    } else if (bRect.right > window.innerWidth - pad) {
      adjustX = window.innerWidth - pad - bRect.right;
    }

    if (adjustX !== 0) {
      bubble.style.translate = `calc(-50% + ${adjustX}px) ${position === 'top' ? '-100%' : '0'}`;
    }
  }, [coords, position]);

  const translateY = position === 'top' ? '-100%' : '0';

  return (
    <span
      ref={wrapperRef}
      className="tooltip-wrapper"
      onPointerEnter={show}
      onPointerLeave={hide}
    >
      {children}
      {visible &&
        coords &&
        createPortal(
          <span
            ref={bubbleRef}
            className="tooltip-bubble"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              translate: `-50% ${translateY}`,
            }}
          >
            <span className="tooltip-label">{label}</span>
            {shortcut && <kbd className="tooltip-kbd">{shortcut}</kbd>}
          </span>,
          document.body,
        )}
    </span>
  );
}
