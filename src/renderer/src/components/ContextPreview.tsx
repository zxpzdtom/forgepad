import { useTranslation } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/app-store';
import { ClipboardList } from 'lucide-react';

export function ContextPreview() {
  const bundle = useAppStore((state) => state.lastBundle);

  if (!bundle) {
    return (
      <section className="absolute inset-0 flex min-h-0 min-w-0 items-center justify-center gap-3 bg-bg p-[30px] text-center">
        <ClipboardList size={30} />
        <h1 className="m-0 font-[590] text-[22px]">No context bundle yet</h1>
        <p className="m-0 max-w-[460px] text-muted leading-[1.55]">
          Use the Context panel to send selected files, diffs, and comments to the terminal.
        </p>
      </section>
    );
  }

  return (
    <section className="absolute inset-0 flex min-h-0 min-w-0 flex-col bg-bg">
      <div className="flex min-h-[42px] items-center justify-between gap-3 border-border border-b bg-panel px-3">
        <div className="flex min-w-0 items-center gap-[7px] overflow-hidden text-ellipsis whitespace-nowrap font-[510] text-[13px]">
          {bundle.relPath}
        </div>
        <div className="text-muted">{bundle.estimatedTokens.toLocaleString()} tokens est.</div>
      </div>
      <pre className="scroll-mask flex min-h-0 flex-1 overflow-auto p-4 font-mono text-text-code-block text-xs leading-relaxed">
        {bundle.markdown}
      </pre>
    </section>
  );
}
