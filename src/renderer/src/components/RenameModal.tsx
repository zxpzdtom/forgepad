import { useEffect, useRef } from "react";

type RenameModalProps = {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function RenameModal({
  value,
  onChange,
  onConfirm,
  onCancel,
}: RenameModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex w-72 flex-col gap-3 rounded-lg border border-border bg-panel-2 p-4 shadow-[0_14px_32px_rgba(0,0,0,0.4)]">
        <p className="text-sm font-[510] text-text">Rename Tab</p>
        <input
          ref={inputRef}
          className="h-8 rounded-md border border-border bg-bg px-2.5 text-sm text-text outline-none focus:border-accent"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm();
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="h-7 rounded-md border border-border bg-transparent px-3 text-sm text-muted hover:bg-panel-3 hover:text-text"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-7 rounded-md bg-accent px-3 text-sm text-accent-contrast hover:opacity-90"
            onClick={onConfirm}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}
