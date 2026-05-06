import { useCallback, useEffect, useState } from 'react';
import type { PendingPermission } from '@shared/types';

/**
 * Compact approval popup that appears near the pet when an agent
 * sends a PermissionRequest. Shows the tool name and Allow/Deny buttons.
 *
 * Used by both PetWidget (in-app overlay) and PetOverlay (desktop window).
 */
export function PetApprovalPopup({
  permission,
  onAllow,
  onDeny,
  variant = 'widget',
}: {
  permission: PendingPermission;
  onAllow: () => void;
  onDeny: () => void;
  /** 'widget' = inside main window (positioned above pet), 'overlay' = desktop pet window */
  variant?: 'widget' | 'overlay';
}) {
  const [visible, setVisible] = useState(false);

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleAllow = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onAllow();
    },
    [onAllow],
  );

  const handleDeny = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDeny();
    },
    [onDeny],
  );

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

  return (
    <div
      style={{
        position: isOverlay ? 'relative' : 'absolute',
        bottom: isOverlay ? undefined : '100%',
        left: isOverlay ? '50%' : '50%',
        transform: isOverlay ? `translateX(-50%) scale(${visible ? 1 : 0.9})` : `translateX(-50%) scale(${visible ? 1 : 0.9})`,
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
