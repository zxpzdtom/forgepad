import { ClipboardList } from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";

export function ContextPreview() {
  const bundle = useAppStore((state) => state.lastBundle);

  if (!bundle) {
    return (
      <section className="absolute inset-0 flex min-h-0 min-w-0 items-center justify-center gap-3 bg-bg p-[30px] text-center">
        <ClipboardList size={30} />
        <h1 className="m-0 text-[22px] font-semibold">No context bundle yet</h1>
        <p className="m-0 max-w-[460px] leading-[1.55] text-muted">Use the Context panel to send selected files, diffs, and comments to the terminal.</p>
      </section>
    );
  }

  return (
    <section className="absolute inset-0 flex min-h-0 min-w-0 flex-col bg-bg">
      <div className="flex min-h-[42px] items-center justify-between gap-3 border-b border-border bg-panel px-3">
        <div className="min-w-0 flex items-center gap-[7px] overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-[620]">{bundle.relPath}</div>
        <div className="text-muted">{bundle.estimatedTokens.toLocaleString()} tokens est.</div>
      </div>
      <pre className="flex min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-[#d7deeb]">{bundle.markdown}</pre>
    </section>
  );
}
