import { useEffect, useRef, useState } from "react";
import { Play, Save, Trash2, X } from "lucide-react";

export function RunSetupDialog({
  initialCommand,
  onSave,
  onSaveOnly,
  onClear,
  onClose,
}: {
  initialCommand?: string;
  onSave: (command: string) => void;
  onSaveOnly?: (command: string) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const [command, setCommand] = useState(initialCommand ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const canSave = command.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/85"
      onMouseDown={onClose}
    >
      <div
        className="w-[min(480px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border bg-surface-dialog shadow-[0_28px_70px_rgba(0,0,0,0.46)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <span className="text-[15px] font-[590] text-text">配置启动命令</span>
          <button
            className="icon-button border-transparent"
            type="button"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <label
              className="text-[12px] font-[510] text-subtle"
              htmlFor="run-command"
            >
              启动命令
            </label>
            <input
              ref={inputRef}
              id="run-command"
              className="h-8 w-full rounded-md border border-border bg-panel-2 px-3 font-mono text-[12px] text-text outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
              value={command}
              placeholder="e.g. bun install && bun run dev"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) onSave(command.trim());
              }}
              onChange={(e) => setCommand(e.currentTarget.value)}
            />
            <p className="text-[11px] text-subtle/60">
              该命令将在终端中执行，用于启动开发服务
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div>
            {onClear && (
              <button
                className="secondary-button text-red-400 hover:text-red-300"
                type="button"
                onClick={onClear}
              >
                <Trash2 size={14} />
                清除
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
            >
              取消
            </button>
            {onSaveOnly && (
              <button
                className="secondary-button"
                type="button"
                disabled={!canSave}
                onClick={() => onSaveOnly(command.trim())}
              >
                <Save size={14} />
                保存
              </button>
            )}
            <button
              className="primary-button"
              type="button"
              disabled={!canSave}
              onClick={() => onSave(command.trim())}
            >
              <Play size={14} />
              保存并运行
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
