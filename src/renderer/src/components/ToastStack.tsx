import { X } from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";

export function ToastStack() {
  const toasts = useAppStore((state) => state.toasts);
  const dismissToast = useAppStore((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-4 z-20 grid w-[min(420px,calc(100vw-32px))] gap-2">
      {toasts.map((toast) => (
        <div
          className={`grid grid-cols-[minmax(0,1fr)_24px] items-center gap-2.5 rounded-lg border border-border bg-panel-2 px-2.5 py-2.5 pl-3 shadow-[0_14px_34px_rgba(0,0,0,0.22)]${toast.kind === "success" ? " border-[#2f6f58]" : toast.kind === "error" ? " border-[#783d45]" : ""}`}
          key={toast.id}
        >
          <span className="break-anywhere">{toast.message}</span>
          <button className="icon-button small" type="button" title="Dismiss" onClick={() => dismissToast(toast.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
