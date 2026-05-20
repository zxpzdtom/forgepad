import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { FileDiffOptions, FileOptions } from '@pierre/diffs';
import { PatchDiff, File as PierreFile } from '@pierre/diffs/react';
import { useResolvedTheme } from '@renderer/app/theme-context';
import { Check, Copy } from 'lucide-react';
import type { CustomRenderer } from 'streamdown';

type MarkdownCodeBlockProps = {
  children?: ReactNode;
  className?: string;
  node?: {
    properties?: {
      metastring?: string;
    };
  };
  'data-block'?: boolean | string;
};

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  bash: 'sh',
  csharp: 'cs',
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  markdown: 'md',
  md: 'md',
  patch: 'diff',
  python: 'py',
  py: 'py',
  rust: 'rs',
  rs: 'rs',
  shell: 'sh',
  sh: 'sh',
  ts: 'ts',
  tsx: 'tsx',
  typescript: 'ts',
};

const MARKDOWN_CODE_UNSAFE_CSS = `
  :host {
    --diffs-font-features: "tnum";
  }

  [data-code],
  [data-line],
  [data-line] span {
    -webkit-user-select: text;
    user-select: text;
  }

  [data-unmodified-lines] {
    cursor: default;
  }
`;

const MARKDOWN_CODE_RENDERER_LANGUAGES = [
  'bash',
  'c',
  'cpp',
  'cs',
  'csharp',
  'css',
  'diff',
  'go',
  'html',
  'java',
  'javascript',
  'js',
  'json',
  'jsx',
  'kotlin',
  'markdown',
  'md',
  'patch',
  'py',
  'python',
  'rs',
  'rust',
  'sh',
  'shell',
  'sql',
  'swift',
  'toml',
  'ts',
  'tsx',
  'typescript',
  'xml',
  'yaml',
  'yml',
];

function languageFromClassName(className?: string): string {
  return className?.match(/language-([^\s]+)/)?.[1]?.toLowerCase() ?? '';
}

function childrenToCode(children: ReactNode): string {
  if (typeof children === 'string') return children.replace(/\n$/, '');
  if (Array.isArray(children)) return children.map(childrenToCode).join('');
  if (children == null || typeof children === 'boolean') return '';
  return String(children).replace(/\n$/, '');
}

function filenameForLanguage(language: string): string {
  if (!language) return 'snippet.txt';
  return `snippet.${LANGUAGE_EXTENSIONS[language] ?? language}`;
}

function looksLikePatch(code: string): boolean {
  return /^(diff --git|---\s|\+\+\+\s|@@\s)/m.test(code);
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      aria-label={copied ? 'Copied code' : 'Copy code'}
      className="markdown-code-copy-button"
      onClick={copyCode}
      title={copied ? 'Copied' : 'Copy'}
      type="button"
    >
      {copied ? <Check aria-hidden="true" size={18} strokeWidth={1.8} /> : <Copy aria-hidden="true" size={18} strokeWidth={1.75} />}
    </button>
  );
}

function MarkdownCodeBlockSurface({ code, language, meta }: { code: string; language: string; meta?: string }) {
  const resolvedTheme = useResolvedTheme();

  const fileOptions = useMemo<FileOptions<undefined>>(
    () => ({
      theme: resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light',
      themeType: resolvedTheme,
      overflow: 'scroll',
      disableFileHeader: true,
      unsafeCSS: MARKDOWN_CODE_UNSAFE_CSS,
    }),
    [resolvedTheme],
  );

  const diffOptions = useMemo<FileDiffOptions<undefined>>(
    () => ({
      theme: resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light',
      themeType: resolvedTheme,
      diffStyle: 'unified',
      diffIndicators: 'bars',
      lineDiffType: 'word-alt',
      overflow: 'scroll',
      disableFileHeader: true,
      expandUnchanged: false,
      unsafeCSS: MARKDOWN_CODE_UNSAFE_CSS,
    }),
    [resolvedTheme],
  );

  if ((language === 'diff' || language === 'patch') && looksLikePatch(code)) {
    return (
      <div className="markdown-code-block markdown-code-block-diff" data-language={language}>
        <div className="markdown-code-block-header">
          <span>{language || meta || 'diff'}</span>
          <CopyCodeButton code={code} />
        </div>
        <PatchDiff patch={code} options={diffOptions} />
      </div>
    );
  }

  return (
    <div className="markdown-code-block" data-language={language || undefined}>
      <div className="markdown-code-block-header">
        <span>{language || meta || 'text'}</span>
        <CopyCodeButton code={code} />
      </div>
      <PierreFile
        className="markdown-code-block-file"
        file={{ name: filenameForLanguage(language), contents: code }}
        options={fileOptions}
        style={{ fontSize: 'var(--agent-chat-code-font, 12px)' }}
      />
    </div>
  );
}

export function MarkdownCodeBlock({ children, className, node, 'data-block': dataBlock }: MarkdownCodeBlockProps) {
  const language = languageFromClassName(className);
  const isBlock = dataBlock !== undefined || Boolean(className && /language-/.test(className));

  if (!isBlock) {
    return <code className={className}>{children}</code>;
  }

  return <MarkdownCodeBlockSurface code={childrenToCode(children)} language={language} meta={node?.properties?.metastring} />;
}

export const markdownCodeBlockRenderer = {
  component: ({ code, language, meta }) => <MarkdownCodeBlockSurface code={code} language={language} meta={meta} />,
  language: MARKDOWN_CODE_RENDERER_LANGUAGES,
} satisfies CustomRenderer;
