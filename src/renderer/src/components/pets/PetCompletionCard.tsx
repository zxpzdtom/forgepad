import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompletionCard } from '@shared/types';

export type WorkingAgentSummary = {
  ptyId: string;
  title: string;
  userPrompt?: string;
};

/** Auto-dismiss delay (ms) when the card first appears. */
const AUTO_DISMISS_MS = 8_000;
/** Shorter dismiss delay after the user has hovered and left. */
const POST_HOVER_DISMISS_MS = 3_000;
const PANEL_STYLE: React.CSSProperties = {
  pointerEvents: 'auto',
  zIndex: 100,
  background: 'linear-gradient(180deg, rgba(30, 31, 40, 0.96), rgba(18, 19, 26, 0.94))',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  borderRadius: 16,
  padding: 12,
  boxShadow: '0 14px 34px rgba(0, 0, 0, 0.34), 0 2px 8px rgba(0, 0, 0, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  cursor: 'default',
  color: 'rgba(255, 255, 255, 0.92)',
};

/**
 * Completion notification card displayed above the pet when an agent finishes.
 * Shows the user's input and AI's last output (each truncated to one line).
 *
 * On hover, pauses auto-dismiss and expands to show all currently working agents.
 *
 * Visual style matches PetApprovalPopup exactly (frosted glass card).
 */
export function PetCompletionCard({
  card,
  onDismiss,
  onView,
  workingAgents,
  onWorkingAgentView,
  onHoverChange,
  variant = 'widget',
}: {
  card: CompletionCard;
  onDismiss: () => void;
  onView: () => void;
  workingAgents?: WorkingAgentSummary[];
  onWorkingAgentView?: (ptyId: string) => void;
  onHoverChange?: (hovered: boolean) => void;
  /** 'widget' = inside main window, 'overlay' = desktop pet window */
  variant?: 'widget' | 'overlay';
}) {
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasBeenHoveredRef = useRef(false);

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Auto-dismiss timer management
  const startDismissTimer = useCallback(
    (delay: number) => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(onDismiss, delay);
    },
    [onDismiss],
  );

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  // Start initial auto-dismiss timer on mount
  useEffect(() => {
    startDismissTimer(AUTO_DISMISS_MS);
    return clearDismissTimer;
  }, [startDismissTimer, clearDismissTimer]);

  // Handle hover state changes
  const handlePointerEnter = useCallback(() => {
    setHovered(true);
    hasBeenHoveredRef.current = true;
    clearDismissTimer();
    onHoverChange?.(true);
  }, [clearDismissTimer, onHoverChange]);

  const handlePointerLeave = useCallback(() => {
    setHovered(false);
    onHoverChange?.(false);
    // Use shorter timer after user has seen the card
    startDismissTimer(POST_HOVER_DISMISS_MS);
  }, [onHoverChange, startDismissTimer]);

  const visibleWorkingAgents = workingAgents ?? [];

  const viewWorkingAgent = useCallback(
    (ptyId: string) => {
      onWorkingAgentView?.(ptyId);
    },
    [onWorkingAgentView],
  );

  const isOverlay = variant === 'overlay';

  // Truncate text to a reasonable length for single-line display
  const truncate = (text: string, maxLen: number) => {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLen) return cleaned;
    return `${cleaned.slice(0, maxLen - 1)}…`;
  };

  return (
    <div
      style={{
        ...PANEL_STYLE,
        position: isOverlay ? undefined : 'absolute',
        bottom: isOverlay ? undefined : '100%',
        left: isOverlay ? undefined : '50%',
        transform: isOverlay
          ? `translateY(${visible ? 0 : 6}px) scale(${visible ? 1 : 0.96})`
          : `translateX(-50%) translateY(${visible ? 0 : 6}px) scale(${visible ? 1 : 0.96})`,
        marginBottom: isOverlay ? 0 : 10,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.18s ease, transform 0.18s cubic-bezier(0.2, 0, 0, 1)',
        width: isOverlay ? 336 : undefined,
        minWidth: 270,
        maxWidth: 360,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 22,
            borderRadius: 999,
            padding: '0 8px',
            background: 'rgba(86, 200, 132, 0.14)',
            border: '1px solid rgba(86, 200, 132, 0.24)',
            fontSize: 11,
            fontWeight: 700,
            color: 'rgba(126, 230, 162, 0.95)',
          }}
        >
          Finished
        </span>
        {visibleWorkingAgents.length > 0 && (
          <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.5)' }}>{visibleWorkingAgents.length} working</span>
        )}
      </div>

      {/* User input line */}
      <div
        style={{
          display: 'flex',
          gap: 7,
          marginBottom: 6,
          minWidth: 0,
          alignItems: 'flex-start',
          borderRadius: 10,
          background: 'rgba(255, 255, 255, 0.055)',
          border: '1px solid rgba(255, 255, 255, 0.075)',
          padding: '7px 9px',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'rgba(80, 200, 120, 0.8)',
            flexShrink: 0,
          }}
        >
          &gt;
        </span>
        <span
          style={{
            minWidth: 0,
            fontSize: 12,
            color: 'rgba(255, 255, 255, 0.78)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.4,
          }}
        >
          {truncate(card.userPrompt || 'No prompt captured', 100)}
        </span>
      </div>

      {/* AI response line */}
      <div
        style={{
          display: 'flex',
          gap: 7,
          marginBottom: 10,
          minWidth: 0,
          alignItems: 'flex-start',
          borderRadius: 10,
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          padding: '7px 9px',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'rgba(220, 160, 80, 0.8)',
            flexShrink: 0,
          }}
        >
          AI
        </span>
        <span
          style={{
            minWidth: 0,
            fontSize: 12,
            color: 'rgba(255, 255, 255, 0.78)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.4,
          }}
        >
          {truncate(card.aiResponse || 'Finished.', 100)}
        </span>
      </div>

      {/* Hover expansion: working agents list */}
      {hovered && visibleWorkingAgents.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              marginBottom: 7,
              paddingTop: 8,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.4)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Working Agents
            </span>
          </div>
          {visibleWorkingAgents.slice(0, 6).map((agent) => (
            <button
              type="button"
              key={agent.ptyId}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                viewWorkingAgent(agent.ptyId);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                minHeight: 28,
                padding: '4px 6px',
                border: 0,
                borderRadius: 8,
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'rgba(100, 180, 255, 0.8)',
                  flexShrink: 0,
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  minWidth: 0,
                  fontSize: 10,
                  color: 'rgba(255, 255, 255, 0.65)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {agent.userPrompt || agent.title}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <CompletionButton
          label="Dismiss"
          bgColor="rgba(80, 80, 80, 0.5)"
          bgHover="rgba(100, 100, 100, 0.6)"
          borderColor="rgba(150, 150, 150, 0.3)"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDismiss();
          }}
        />
        <CompletionButton
          label="View"
          bgColor="rgba(40, 100, 50, 0.7)"
          bgHover="rgba(50, 120, 60, 0.85)"
          borderColor="rgba(70, 160, 80, 0.5)"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onView();
          }}
          primary
        />
      </div>
    </div>
  );
}

function CompletionButton({
  label,
  bgColor,
  bgHover,
  borderColor,
  onClick,
  primary,
}: {
  label: string;
  bgColor: string;
  bgHover: string;
  borderColor: string;
  onClick: (e: React.MouseEvent) => void;
  primary?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: primary ? 1.5 : 1,
        minHeight: 30,
        padding: '6px 11px',
        fontSize: 12,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.92)',
        background: hovered ? bgHover : bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'background 0.15s ease, transform 0.12s ease',
        outline: 'none',
        fontFamily: 'inherit',
        lineHeight: 1.2,
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      {label}
    </button>
  );
}
