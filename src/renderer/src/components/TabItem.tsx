import { type CSSProperties, forwardRef, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

import clsx from 'clsx';

export type TabItemProps = {
  /** Whether this tab is the currently active/selected tab. */
  active: boolean;
  /** Icon element rendered before the title. */
  icon: ReactNode;
  /** Tab display title — also used for the native tooltip unless `tooltip` is set. */
  title: string;
  /** Override the native tooltip text (defaults to `title`). */
  tooltip?: string;
  /** Called when the tab body is clicked or activated via keyboard. */
  onSelect: () => void;
  /** Called when the close button is clicked. Omit to hide the close button. */
  onClose?: () => void;
  /** Forwarded native contextmenu event for right-click menus. */
  onContextMenu?: (event: MouseEvent) => void;
  /** Optional content rendered between the title and the close button (e.g. status dots). */
  suffix?: ReactNode;
  /** Close button tooltip. @default "Close tab" */
  closeTitle?: string;
  /** Additional CSS classes merged onto the outer element (e.g. min-w / max-w overrides). */
  className?: string;
  /** Inline styles (used by dnd-kit for transform/transition). */
  style?: CSSProperties;
} & Omit<
  HTMLAttributes<HTMLDivElement>,
  'title' | 'className' | 'style' | 'onClick' | 'onKeyDown' | 'onContextMenu' | 'role' | 'tabIndex'
>;

export const TabItem = forwardRef<HTMLDivElement, TabItemProps>(function TabItem(
  { active, icon, title, tooltip, onSelect, onClose, onContextMenu, suffix, closeTitle = 'Close tab', className, style, ...rest },
  ref,
) {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      ref={ref}
      className={clsx(
        'group/tab relative flex h-9 shrink-0 cursor-pointer items-center gap-1.5 px-3 text-[13px] transition-colors select-none',
        active ? 'text-text' : 'text-muted hover:text-text',
        className,
      )}
      role="tab"
      tabIndex={0}
      aria-selected={active}
      title={tooltip ?? title}
      style={style}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      onContextMenu={onContextMenu}
      {...rest}
    >
      {icon}
      <span className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">{title}</span>
      {suffix}
      {onClose && (
        <span
          className="grid size-4 place-items-center rounded text-subtle opacity-0 transition-opacity hover:text-text focus:opacity-100 group-hover/tab:opacity-100"
          role="button"
          tabIndex={0}
          title={closeTitle}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
          }}
        >
          <X size={11} />
        </span>
      )}
      {active && <span className="absolute right-3 bottom-0 left-3 h-[2px] rounded-full bg-accent" />}
    </div>
  );
});
