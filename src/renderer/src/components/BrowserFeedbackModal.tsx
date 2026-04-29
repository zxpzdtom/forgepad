import { useState } from 'react';

import { useAppStore } from '../store/app-store';

export function BrowserFeedbackModal() {
  const open = useAppStore((s) => s.feedbackModalOpen);
  const feedback = useAppStore((s) => s.pendingFeedback);
  const closeFeedbackModal = useAppStore((s) => s.closeFeedbackModal);
  const submitBrowserFeedback = useAppStore((s) => s.submitBrowserFeedback);
  const [comment, setComment] = useState('');

  if (!open || !feedback) return null;

  const { element } = feedback;

  const handleSubmit = () => {
    if (!comment.trim()) return;
    submitBrowserFeedback(comment.trim());
    setComment('');
  };

  const handleCancel = () => {
    closeFeedbackModal();
    setComment('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div className="flex max-h-[80vh] w-[520px] flex-col overflow-auto rounded-lg border border-(--color-border) bg-(--color-bg-1) shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-(--color-border) border-b px-4 py-3">
          <h3 className="font-medium text-(--color-text-1) text-sm">Element Feedback</h3>
          <button type="button" onClick={handleCancel} className="text-(--color-text-3) transition-colors hover:text-(--color-text-1)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          {/* Element screenshot */}
          {element.screenshotBase64 && (
            <div className="flex max-h-[180px] items-center justify-center overflow-hidden rounded border border-(--color-border) bg-(--color-bg-2)">
              <img
                src={`data:image/png;base64,${element.screenshotBase64}`}
                alt="Selected element"
                className="max-h-[180px] max-w-full object-contain"
              />
            </div>
          )}

          {/* Element info */}
          <div className="space-y-1 rounded bg-(--color-bg-2) p-2.5 font-mono text-(--color-text-2) text-xs">
            <div>
              <span className="text-(--color-text-3)">Tag: </span>
              <span>{element.tagName.toLowerCase()}</span>
            </div>
            <div className="truncate">
              <span className="text-(--color-text-3)">Selector: </span>
              <span>{element.selector}</span>
            </div>
            <div>
              <span className="text-(--color-text-3)">Page: </span>
              <span className="inline-block max-w-[380px] truncate align-bottom">{element.pageUrl}</span>
            </div>
            {element.outerHTML && (
              <details className="mt-1">
                <summary className="cursor-pointer select-none text-(--color-text-3)">HTML snippet</summary>
                <pre className="mt-1 max-h-[80px] overflow-auto whitespace-pre-wrap break-all text-(--color-text-2) text-[11px]">
                  {element.outerHTML}
                </pre>
              </details>
            )}
          </div>

          {/* Comment input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-(--color-text-3) text-xs">Describe what you want the agent to do with this element</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Change the button color to indigo, make it larger..."
              rows={4}
              autoFocus
              className="w-full resize-y rounded border border-(--color-border) bg-(--color-bg-2) p-2.5 text-(--color-text-1) text-sm transition-colors placeholder:text-(--color-text-3) focus:border-(--color-accent) focus:outline-none focus:ring-(--color-accent)/30 focus:ring-1"
            />
            <p className="text-(--color-text-3) text-[11px]">
              Press{' '}
              <kbd className="rounded border border-(--color-border) bg-(--color-bg-3) px-1 py-0.5 font-mono text-[10px]">
                ⌘ Enter
              </kbd>{' '}
              to send
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 border-(--color-border) border-t px-4 py-3">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded border border-(--color-border) px-3 py-1.5 text-(--color-text-2) text-xs transition-colors hover:border-(--color-border-hover) hover:text-(--color-text-1)"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!comment.trim()}
            className="rounded bg-(--color-accent) px-3 py-1.5 text-white text-xs transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send to Agent
          </button>
        </div>
      </div>
    </div>
  );
}
