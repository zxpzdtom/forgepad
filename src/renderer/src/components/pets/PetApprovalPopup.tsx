import { useCallback, useEffect, useState } from 'react';
import type { PendingPermission } from '@shared/types';

/**
 * Compact approval popup that appears near the pet when an agent
 * sends a PermissionRequest. Shows the tool name and Allow/Deny buttons.
 *
 * When the tool is `AskUserQuestion`, switches to question mode:
 * displays the question text and selectable option buttons.
 * Supports both single-select (click to submit) and multi-select
 * (toggle selections, then confirm).
 *
 * Used by both PetWidget (in-app overlay) and PetOverlay (desktop window).
 */
export function PetApprovalPopup({
  permission,
  onAllow,
  onAllowAlways,
  onDeny,
  onAnswer,
  variant = 'widget',
}: {
  permission: PendingPermission;
  onAllow: () => void;
  /** Called when "Always Allow" is clicked. Only shown when permission has suggestions. */
  onAllowAlways?: () => void;
  onDeny: () => void;
  /** Called when a question option is selected (AskUserQuestion mode). */
  onAnswer?: (answers: Record<string, string>) => void;
  /** 'widget' = inside main window (positioned above pet), 'overlay' = desktop pet window */
  variant?: 'widget' | 'overlay';
}) {
  const [visible, setVisible] = useState(false);
  // For multi-question support: track the current question index
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Reset question index when permission changes
  useEffect(() => {
    setCurrentQuestionIndex(0);
    setCollectedAnswers({});
    setMultiSelected(new Set());
  }, [permission.ptyId]);

  const handleAllow = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onAllow();
    },
    [onAllow],
  );

  const handleAllowAlways = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onAllowAlways?.();
    },
    [onAllowAlways],
  );

  const handleDeny = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDeny();
    },
    [onDeny],
  );

  // ── Question mode ──
  const isQuestionMode = permission.questions && permission.questions.length > 0;

  // Collected answers for multi-question flows
  const [collectedAnswers, setCollectedAnswers] = useState<Record<string, string>>({});
  // Multi-select: track selected option labels for the current question
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());

  /** Submit the answer for the current question and advance or finish. */
  const submitAnswer = useCallback(
    (answerValue: string) => {
      if (!permission.questions || !onAnswer) return;

      const questions = permission.questions;
      const currentQ = questions[currentQuestionIndex];
      const answerKey = currentQ.question || currentQ.header || `answer_${currentQuestionIndex + 1}`;

      if (currentQuestionIndex < questions.length - 1) {
        // More questions — collect this answer and advance
        const newAnswers = { ...collectedAnswers, [answerKey]: answerValue };
        setCollectedAnswers(newAnswers);
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setMultiSelected(new Set());
      } else {
        // Last (or only) question — submit all answers
        const finalAnswers = { ...collectedAnswers, [answerKey]: answerValue };
        onAnswer(finalAnswers);
      }
    },
    [permission.questions, onAnswer, currentQuestionIndex, collectedAnswers],
  );

  /** Single-select: click an option to immediately submit. */
  const handleSingleSelect = useCallback(
    (label: string) => {
      submitAnswer(label);
    },
    [submitAnswer],
  );

  /** Multi-select: toggle an option's selected state. */
  const handleMultiToggle = useCallback(
    (label: string) => {
      setMultiSelected((prev) => {
        const next = new Set(prev);
        if (next.has(label)) {
          next.delete(label);
        } else {
          next.add(label);
        }
        return next;
      });
    },
    [],
  );

  /** Multi-select: confirm and submit all selected options (comma-joined). */
  const handleMultiConfirm = useCallback(() => {
    if (multiSelected.size === 0) return;
    // Join selected labels with commas, maintaining the original option order
    const currentQ = permission.questions?.[currentQuestionIndex];
    if (!currentQ) return;
    const ordered = currentQ.options
      .map((opt) => opt.label)
      .filter((label) => multiSelected.has(label));
    submitAnswer(ordered.join(','));
  }, [multiSelected, permission.questions, currentQuestionIndex, submitAnswer]);

  // Derive a short file name from tool input if available
  const fileName = (() => {
    const fp = permission.toolInput?.file_path ?? permission.toolInput?.filePath;
    if (typeof fp === 'string') {
      const parts = fp.split('/');
      return parts[parts.length - 1];
    }
    return null;
  })();

  // Derive command preview for Bash tool
  const commandPreview = (() => {
    const cmd = permission.toolInput?.command ?? permission.toolInput?.cmd;
    if (typeof cmd === 'string') {
      return cmd.length > 60 ? `${cmd.slice(0, 57)}…` : cmd;
    }
    return null;
  })();

  const isOverlay = variant === 'overlay';
  const hasAlwaysAllow =
    onAllowAlways && permission.permissionSuggestions && permission.permissionSuggestions.length > 0;

  // ── Question mode rendering ──
  if (isQuestionMode && permission.questions) {
    const currentQ = permission.questions[currentQuestionIndex];
    const totalQuestions = permission.questions.length;
    const isMulti = currentQ.multiSelect === true;

    return (
      <div
        style={{
          position: isOverlay ? 'relative' : 'absolute',
          bottom: isOverlay ? undefined : '100%',
          left: '50%',
          transform: `translateX(-50%) scale(${visible ? 1 : 0.9})`,
          marginBottom: isOverlay ? 4 : 8,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          pointerEvents: 'auto',
          zIndex: 100,
          background: 'rgba(20, 20, 28, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 12,
          padding: '8px 12px',
          minWidth: 200,
          maxWidth: 300,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          cursor: 'default',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Question header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'rgba(130, 170, 255, 0.95)',
            }}
          >
            💬 {currentQ.header || 'Question'}
          </span>
          {totalQuestions > 1 && (
            <span style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.4)' }}>
              {currentQuestionIndex + 1}/{totalQuestions}
            </span>
          )}
          {isMulti && (
            <span style={{ fontSize: 9, color: 'rgba(180, 160, 255, 0.6)' }}>
              (multi)
            </span>
          )}
        </div>

        {/* Question text */}
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255, 255, 255, 0.8)',
            marginBottom: 8,
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}
        >
          {currentQ.question}
        </div>

        {/* Option buttons (vertically stacked) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {currentQ.options.map((opt) => (
            <OptionButton
              key={opt.label}
              label={opt.label}
              description={opt.description}
              selected={isMulti ? multiSelected.has(opt.label) : false}
              onClick={() =>
                isMulti ? handleMultiToggle(opt.label) : handleSingleSelect(opt.label)
              }
            />
          ))}
        </div>

        {/* Bottom buttons: Skip (always) + Confirm (multi-select only) */}
        <div style={{ marginTop: 6, display: 'flex', gap: 6, justifyContent: 'center' }}>
          <ApprovalButton
            label="Skip"
            bgColor="rgba(80, 80, 80, 0.5)"
            bgHover="rgba(100, 100, 100, 0.6)"
            borderColor="rgba(150, 150, 150, 0.3)"
            onClick={handleDeny}
          />
          {isMulti && (
            <ApprovalButton
              label={`Confirm (${multiSelected.size})`}
              bgColor={multiSelected.size > 0 ? 'rgba(40, 100, 50, 0.7)' : 'rgba(60, 60, 60, 0.5)'}
              bgHover={multiSelected.size > 0 ? 'rgba(50, 120, 60, 0.85)' : 'rgba(60, 60, 60, 0.5)'}
              borderColor={multiSelected.size > 0 ? 'rgba(70, 160, 80, 0.5)' : 'rgba(100, 100, 100, 0.3)'}
              onClick={handleMultiConfirm}
              primary
            />
          )}
        </div>
      </div>
    );
  }

  // ── Normal approval mode ──
  return (
    <div
      style={{
        position: isOverlay ? 'relative' : 'absolute',
        bottom: isOverlay ? undefined : '100%',
        left: isOverlay ? '50%' : '50%',
        transform: isOverlay
          ? `translateX(-50%) scale(${visible ? 1 : 0.9})`
          : `translateX(-50%) scale(${visible ? 1 : 0.9})`,
        marginBottom: isOverlay ? 4 : 8,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        pointerEvents: 'auto',
        zIndex: 100,
        // Card styles
        background: 'rgba(20, 20, 28, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 12,
        padding: '8px 12px',
        minWidth: 180,
        maxWidth: 280,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: 'default',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Tool name + context */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'rgba(255, 178, 71, 0.95)',
          }}
        >
          ⚡ {permission.toolName || 'Tool'}
        </span>
        {fileName && (
          <span
            style={{
              fontSize: 10,
              color: 'rgba(255, 255, 255, 0.5)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 120,
            }}
          >
            {fileName}
          </span>
        )}
      </div>

      {/* Command preview for Bash tool */}
      {commandPreview && (
        <div
          style={{
            fontSize: 10,
            color: 'rgba(255, 255, 255, 0.6)',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: 6,
            padding: '4px 8px',
            marginBottom: 8,
            fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.4,
          }}
        >
          {commandPreview}
        </div>
      )}

      {/* Action buttons */}
      <div
        style={{
          display: 'flex',
          gap: 6,
        }}
      >
        <ApprovalButton
          label="Deny"
          bgColor="rgba(140, 40, 40, 0.7)"
          bgHover="rgba(160, 50, 50, 0.85)"
          borderColor="rgba(200, 70, 70, 0.5)"
          onClick={handleDeny}
        />
        {hasAlwaysAllow && (
          <ApprovalButton
            label="Always"
            bgColor="rgba(50, 60, 130, 0.7)"
            bgHover="rgba(65, 75, 155, 0.85)"
            borderColor="rgba(90, 100, 200, 0.5)"
            onClick={handleAllowAlways}
          />
        )}
        <ApprovalButton
          label="Allow"
          bgColor="rgba(40, 100, 50, 0.7)"
          bgHover="rgba(50, 120, 60, 0.85)"
          borderColor="rgba(70, 160, 80, 0.5)"
          onClick={handleAllow}
          primary
        />
      </div>
    </div>
  );
}

/** A selectable option button for question mode. Supports selected state for multi-select. */
function OptionButton({
  label,
  description,
  selected = false,
  onClick,
}: {
  label: string;
  description?: string;
  /** Whether this option is currently selected (multi-select mode). */
  selected?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const bgNormal = selected ? 'rgba(60, 100, 180, 0.5)' : 'rgba(60, 80, 140, 0.3)';
  const bgHover = selected ? 'rgba(70, 110, 200, 0.6)' : 'rgba(80, 110, 180, 0.45)';
  const borderNormal = selected ? 'rgba(100, 150, 240, 0.6)' : 'rgba(80, 110, 180, 0.3)';
  const borderHover = selected ? 'rgba(120, 170, 255, 0.7)' : 'rgba(100, 140, 220, 0.5)';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        padding: '6px 10px',
        fontSize: 11,
        fontWeight: selected ? 600 : 500,
        color: 'rgba(255, 255, 255, 0.9)',
        background: hovered ? bgHover : bgNormal,
        border: `1px solid ${hovered ? borderHover : borderNormal}`,
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease',
        outline: 'none',
        fontFamily: 'inherit',
        lineHeight: 1.3,
        textAlign: 'left',
      }}
    >
      <div>
        {selected ? '✓ ' : ''}{label}
      </div>
      {description && (
        <div
          style={{
            fontSize: 9,
            color: 'rgba(255, 255, 255, 0.5)',
            marginTop: 2,
            lineHeight: 1.2,
          }}
        >
          {description}
        </div>
      )}
    </button>
  );
}

function ApprovalButton({
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
        padding: '5px 10px',
        fontSize: 11,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.92)',
        background: hovered ? bgHover : bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'background 0.15s ease',
        outline: 'none',
        fontFamily: 'inherit',
        lineHeight: 1.2,
      }}
    >
      {label}
    </button>
  );
}
