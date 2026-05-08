import { useCallback, useEffect, useRef, useState } from "react";
import type { CompletionCard } from "@shared/types";
export type WorkingAgentSummary = {
  ptyId: string;
  title: string;
  userPrompt?: string;
};

/** Auto-dismiss delay (ms) when the card first appears. */
const AUTO_DISMISS_MS = 8_000;
/** Shorter dismiss delay after the user has hovered and left. */
const POST_HOVER_DISMISS_MS = 3_000;

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
  variant = "widget",
}: {
  card: CompletionCard;
  onDismiss: () => void;
  onView: () => void;
  workingAgents?: WorkingAgentSummary[];
  onWorkingAgentView?: (ptyId: string) => void;
  onHoverChange?: (hovered: boolean) => void;
  /** 'widget' = inside main window, 'overlay' = desktop pet window */
  variant?: "widget" | "overlay";
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

  const isOverlay = variant === "overlay";

  // Truncate text to a reasonable length for single-line display
  const truncate = (text: string, maxLen: number) => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned.length <= maxLen) return cleaned;
    return `${cleaned.slice(0, maxLen - 1)}…`;
  };

  return (
    <div
      style={{
        position: isOverlay ? "relative" : "absolute",
        bottom: isOverlay ? undefined : "100%",
        left: "50%",
        transform: `translateX(-50%) scale(${visible ? 1 : 0.9})`,
        marginBottom: isOverlay ? 4 : 8,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.2s ease, transform 0.2s ease",
        pointerEvents: "auto",
        zIndex: 100,
        background: "rgba(20, 20, 28, 0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 12,
        padding: "8px 12px",
        width: isOverlay ? 320 : undefined,
        minWidth: 240,
        maxWidth: 340,
        boxShadow:
          "0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        userSelect: "none",
        WebkitUserSelect: "none",
        cursor: "default",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {/* User input line */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 3,
          minWidth: 0,
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(80, 200, 120, 0.8)",
            flexShrink: 0,
          }}
        >
          &gt;
        </span>
        <span
          style={{
            minWidth: 0,
            fontSize: 11,
            color: "rgba(255, 255, 255, 0.75)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.4,
          }}
        >
          {truncate(card.userPrompt || "No prompt captured", 100)}
        </span>
      </div>

      {/* AI response line */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 6,
          minWidth: 0,
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(220, 160, 80, 0.8)",
            flexShrink: 0,
          }}
        >
          AI
        </span>
        <span
          style={{
            minWidth: 0,
            fontSize: 11,
            color: "rgba(255, 255, 255, 0.75)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.4,
          }}
        >
          {truncate(card.aiResponse || "Finished.", 100)}
        </span>
      </div>

      {/* Hover expansion: working agents list */}
      {hovered && visibleWorkingAgents.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div
            style={{
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
              marginBottom: 6,
              paddingTop: 6,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "rgba(255, 255, 255, 0.4)",
                textTransform: "uppercase",
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
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                padding: "3px 0",
                border: 0,
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "rgba(100, 180, 255, 0.8)",
                  flexShrink: 0,
                  animation: "pulse 2s ease-in-out infinite",
                }}
              />
              <span
                style={{
                  minWidth: 0,
                  fontSize: 10,
                  color: "rgba(255, 255, 255, 0.65)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {agent.userPrompt || agent.title}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6 }}>
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
        padding: "5px 10px",
        fontSize: 11,
        fontWeight: 600,
        color: "rgba(255, 255, 255, 0.92)",
        background: hovered ? bgHover : bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        cursor: "pointer",
        transition: "background 0.15s ease",
        outline: "none",
        fontFamily: "inherit",
        lineHeight: 1.2,
      }}
    >
      {label}
    </button>
  );
}
