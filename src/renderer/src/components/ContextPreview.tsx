import { ClipboardList } from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";

export function ContextPreview() {
  const bundle = useAppStore((state) => state.lastBundle);

  if (!bundle) {
    return (
      <section className="context-preview empty">
        <ClipboardList size={30} />
        <h1>No context bundle yet</h1>
        <p>Use the Context panel to send selected files, diffs, and comments to the terminal.</p>
      </section>
    );
  }

  return (
    <section className="context-preview">
      <div className="surface-toolbar">
        <div className="toolbar-title">{bundle.relPath}</div>
        <div className="toolbar-meta">{bundle.estimatedTokens.toLocaleString()} tokens est.</div>
      </div>
      <pre>{bundle.markdown}</pre>
    </section>
  );
}
