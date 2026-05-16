import { useEffect, useRef, useState } from 'react';
import { File as PierreFile } from '@pierre/diffs/react';
import { useResolvedTheme } from '@renderer/theme-context';
import { useTranslation } from '@renderer/i18n';
import { ChevronDown, MessageSquare, Send, X } from 'lucide-react';

import { useAppStore } from '../store/app-store';

import clsx from 'clsx';

export function BrowserFeedbackModal() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.feedbackModalOpen);
  const feedback = useAppStore((s) => s.pendingFeedback);
  const closeFeedbackModal = useAppStore((s) => s.closeFeedbackModal);
  const submitBrowserFeedback = useAppStore((s) => s.submitBrowserFeedback);
  const [comment, setComment] = useState('');
  const [snippetOpen, setSnippetOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resolvedTheme = useResolvedTheme();

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

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

  const canSubmit = comment.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/45 backdrop-blur-[2px]" onMouseDown={handleCancel}>
      <div
        className="flex max-h-[80vh] w-[min(520px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-border bg-surface-dialog shadow-[0_28px_70px_rgba(0,0,0,0.46)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex h-12 shrink-0 items-center justify-between border-border border-b px-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={15} className="text-accent" />
            <span className="font-[590] text-[15px] text-text">{t('browserFeedback.title')}</span>
          </div>
          <button className="icon-button border-transparent" type="button" onClick={handleCancel}>
            <X size={16} />
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {/* Element screenshot */}
          {element.screenshotBase64 && (
            <div className="flex max-h-[200px] items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-inset p-2">
              <img
                src={`data:image/png;base64,${element.screenshotBase64}`}
                alt={t('browserFeedback.selectedElement')}
                className="max-h-[180px] max-w-full rounded object-contain"
              />
            </div>
          )}

          {/* Element info */}
          <div className="space-y-1.5 rounded-lg border border-border-soft bg-panel p-3 font-mono text-[12px]">
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 font-[510] text-subtle">{t('browserFeedback.tag')}</span>
              <span className="text-text">{element.tagName.toLowerCase()}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 font-[510] text-subtle">{t('browserFeedback.selector')}</span>
              <span className="truncate text-muted">{element.selector}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 font-[510] text-subtle">{t('browserFeedback.page')}</span>
              <span className="truncate text-muted">{element.pageUrl}</span>
            </div>
            {element.outerHTML && (
              <div className="mt-2">
                <button
                  type="button"
                  className="flex items-center gap-1 text-[11px] text-subtle transition-colors hover:text-muted"
                  onClick={() => setSnippetOpen((v) => !v)}
                >
                  <ChevronDown size={12} className={clsx('transition-transform', !snippetOpen && '-rotate-90')} />
                  {t('browserFeedback.htmlSnippet')}
                </button>
                {snippetOpen && (
                  <div className="mt-1.5 max-h-[120px] overflow-auto rounded border border-border-soft text-[12px]">
                    <PierreFile
                      file={{
                        name: 'element.html',
                        contents: element.outerHTML,
                      }}
                      options={{
                        theme: resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light',
                        themeType: resolvedTheme,
                        overflow: 'scroll',
                        disableFileHeader: true,
                        disableLineNumbers: true,
                      }}
                      disableWorkerPool
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Comment input */}
          <div className="space-y-1.5">
            <label className="font-[510] text-[12px] text-subtle" htmlFor="feedback-comment">
              {t('browserFeedback.describeLabel')}
            </label>
            <textarea
              ref={textareaRef}
              id="feedback-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('browserFeedback.placeholder')}
              rows={3}
              className="w-full resize-y rounded-md border border-border bg-panel-2 p-2.5 text-[13px] text-text outline-none transition-colors placeholder:text-subtle/50 focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
            />
            <p className="text-[11px] text-subtle/60">
              {t('browserFeedback.pressHint')}{' '}
              <kbd className="rounded border border-border bg-panel-3 px-1 py-0.5 font-mono text-[10px] text-muted">⌘ Enter</kbd>{' '}
              {t('browserFeedback.toSend')}
            </p>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-border border-t px-4 py-3">
          <button className="secondary-button" type="button" onClick={handleCancel}>
            {t('common.cancel')}
          </button>
          <button className="primary-button" type="button" disabled={!canSubmit} onClick={handleSubmit}>
            <Send size={14} />
            {t('browserFeedback.sendToAgent')}
          </button>
        </div>
      </div>
    </div>
  );
}
