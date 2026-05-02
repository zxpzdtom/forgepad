import { type ReactNode, useCallback, useRef, useState } from 'react';

/**
 * Lightweight tooltip that appears on hover with optional keyboard shortcut hint.
 * Appears above the trigger element by default, with a ~400ms delay.
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

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), 400);
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  return (
    <span className="tooltip-wrapper" onPointerEnter={show} onPointerLeave={hide}>
      {children}
      {visible && (
        <span className={`tooltip-bubble tooltip-bubble--${position}`}>
          <span className="tooltip-label">{label}</span>
          {shortcut && <kbd className="tooltip-kbd">{shortcut}</kbd>}
        </span>
      )}
    </span>
  );
}
