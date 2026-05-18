import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadFile } from '@renderer/lib/download-file';
import { useAppStore } from '@renderer/store/app-store';
import { code as streamdownCode } from '@streamdown/code';
import type { AllowedTags, Components } from 'streamdown';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';

type MarkdownPreviewProps = {
  components: Components;
  markdownPath: string;
  markdownText: string;
  theme: 'dark' | 'light';
  workspaceId: string;
  workspacePath: string;
  absPath?: string;
};

type StreamdownPlugins = NonNullable<React.ComponentProps<typeof Streamdown>['plugins']>;

const streamdownBasePlugins = { code: streamdownCode } satisfies StreamdownPlugins;

function containsMermaid(markdownText: string): boolean {
  return /^```mermaid\b/im.test(markdownText) || /<pre[^>]+class=["'][^"']*\bmermaid\b/i.test(markdownText);
}

const markdownAllowedTags: AllowedTags = {
  a: ['href', 'title', 'target', 'rel', 'download'],
  h1: ['align', 'id'],
  h2: ['align', 'id'],
  h3: ['align', 'id'],
  h4: ['align', 'id'],
  h5: ['align', 'id'],
  h6: ['align', 'id'],
  img: ['src', 'alt', 'title', 'width', 'height', 'align'],
  p: ['align'],
};

function isRemoteOrEmbeddedUrl(src: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src);
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function normalizeRelativePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function normalizeAbsolutePath(path: string): string {
  return `/${normalizeRelativePath(path)}`;
}

function resolveMarkdownImagePath(src: string, markdownPath: string): string {
  const [pathPart, suffix = ''] = src.split(/([?#].*)/, 2);
  if (pathPart.startsWith('/')) return normalizeRelativePath(pathPart.slice(1)) + suffix;
  const baseDir = dirname(markdownPath);
  return normalizeRelativePath(baseDir ? `${baseDir}/${pathPart}` : pathPart) + suffix;
}

function resolveAbsMarkdownImagePath(src: string, markdownAbsPath: string): string {
  if (src.startsWith('/')) return src;
  const baseDir = dirname(markdownAbsPath);
  return normalizeAbsolutePath(baseDir ? `${baseDir}/${src}` : src);
}

function splitPathFromSuffix(path: string): string {
  return path.split(/[?#]/, 1)[0];
}

function fallbackDownloadName(url: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    const name = parsed.pathname.split('/').filter(Boolean).pop();
    return name ? decodeURIComponent(name) : 'download';
  } catch {
    return 'download';
  }
}

const CODE_DOWNLOAD_EXTENSIONS: Record<string, string> = {
  bash: 'sh',
  css: 'css',
  html: 'html',
  javascript: 'js',
  js: 'js',
  json: 'json',
  jsx: 'jsx',
  markdown: 'md',
  md: 'md',
  python: 'py',
  py: 'py',
  rust: 'rs',
  rs: 'rs',
  shell: 'sh',
  sh: 'sh',
  ts: 'ts',
  tsx: 'tsx',
  typescript: 'ts',
  yaml: 'yaml',
  yml: 'yml',
};

function codeDownloadName(language: string): string {
  const normalized = language.trim().toLowerCase();
  return `file.${CODE_DOWNLOAD_EXTENSIONS[normalized] ?? 'txt'}`;
}

function tableCells(row: HTMLTableRowElement): string[] {
  return Array.from(row.cells).map((cell) => cell.textContent?.trim() ?? '');
}

function escapeCsvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function tableToCsv(table: HTMLTableElement): string {
  return Array.from(table.rows)
    .map((row) => tableCells(row).map(escapeCsvCell).join(','))
    .join('\n');
}

function tableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.rows).map(tableCells);
  if (rows.length === 0) return '';

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ''));
  const [header, ...body] = normalizedRows;
  const separator = Array.from({ length: columnCount }, () => '---');
  return [header, separator, ...body].map((row) => `| ${row.map(escapeMarkdownCell).join(' | ')} |`).join('\n');
}

type MarkdownImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  node?: unknown;
};

type MarkdownAnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  node?: unknown;
};

async function downloadMarkdownHref(
  href: string,
  download: React.AnchorHTMLAttributes<HTMLAnchorElement>['download'],
  workspacePath: string,
  markdownPath: string,
  markdownAbsPath?: string,
) {
  const downloadName = typeof download === 'string' && download ? download : fallbackDownloadName(href);
  let resolvedHref = href;
  if (!isRemoteOrEmbeddedUrl(href)) {
    const pathWithoutSuffix = splitPathFromSuffix(href);
    resolvedHref = markdownAbsPath
      ? ((await window.forgepad.fs.absFileUrl?.(resolveAbsMarkdownImagePath(pathWithoutSuffix, markdownAbsPath))) ?? href)
      : ((await window.forgepad.fs.fileUrl?.(
          workspacePath,
          splitPathFromSuffix(resolveMarkdownImagePath(pathWithoutSuffix, markdownPath)),
        )) ?? href);
  }

  const response = await fetch(resolvedHref);
  const blob = await response.blob();
  await downloadFile({ blob, suggestedName: downloadName });
}

async function resolveLocalMarkdownImageUrl(src: string, workspacePath: string, markdownPath: string, markdownAbsPath?: string) {
  if (!src || isRemoteOrEmbeddedUrl(src)) return src;
  const [pathWithoutSuffix] = src.split(/[?#]/, 1);
  if (markdownAbsPath && window.forgepad.fs.absFileUrl) {
    return window.forgepad.fs.absFileUrl(resolveAbsMarkdownImagePath(pathWithoutSuffix, markdownAbsPath));
  }
  if (!markdownAbsPath && window.forgepad.fs.fileUrl) {
    return window.forgepad.fs.fileUrl(workspacePath, resolveMarkdownImagePath(pathWithoutSuffix, markdownPath));
  }
  return src;
}

async function rewriteLocalMarkdownImageSources(
  markdownText: string,
  workspacePath: string,
  markdownPath: string,
  markdownAbsPath?: string,
) {
  const replacements = new Map<string, string>();
  const sources = new Set<string>();

  for (const match of markdownText.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    sources.add(match[1]);
  }
  for (const match of markdownText.matchAll(/<img\b[^>]*\bsrc=(["'])(.*?)\1/gi)) {
    sources.add(match[2]);
  }

  await Promise.all(
    Array.from(sources).map(async (src) => {
      if (isRemoteOrEmbeddedUrl(src)) return;
      try {
        replacements.set(src, await resolveLocalMarkdownImageUrl(src, workspacePath, markdownPath, markdownAbsPath));
      } catch {
        // Leave the source untouched; GitHub-compatible markdown should stay readable
        // even when a local file cannot be resolved inside ForgePad.
      }
    }),
  );

  if (replacements.size === 0) return markdownText;
  return markdownText
    .replace(/!\[([^\]]*)]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (full, alt, src, title) => {
      const replacement = replacements.get(src);
      return replacement ? `![${alt}](${replacement}${title})` : full;
    })
    .replace(/(<img\b[^>]*\bsrc=)(["'])(.*?)\2/gi, (full, prefix, quote, src) => {
      const replacement = replacements.get(src);
      return replacement ? `${prefix}${quote}${replacement}${quote}` : full;
    });
}

function createMarkdownImageComponent(workspacePath: string, markdownPath: string, markdownAbsPath?: string) {
  const MarkdownImage = ({ node: _, src, alt, ...props }: MarkdownImageProps) => {
    const rawSrc = typeof src === 'string' ? src : '';
    const [resolvedSrc, setResolvedSrc] = useState(rawSrc);

    useEffect(() => {
      let disposed = false;
      setResolvedSrc(rawSrc);

      if (!rawSrc || isRemoteOrEmbeddedUrl(rawSrc)) return;

      resolveLocalMarkdownImageUrl(rawSrc, workspacePath, markdownPath, markdownAbsPath)
        .then((url) => {
          if (!disposed) setResolvedSrc(url);
        })
        .catch(() => {
          if (!disposed) setResolvedSrc(rawSrc);
        });

      return () => {
        disposed = true;
      };
    }, [rawSrc]);

    const handleError = () => {
      setResolvedSrc(rawSrc);
    };

    return <img {...props} src={resolvedSrc} alt={alt ?? ''} onError={handleError} />;
  };

  MarkdownImage.displayName = 'MarkdownImage';
  return MarkdownImage;
}

function createMarkdownAnchorComponent(
  workspaceId: string,
  workspacePath: string,
  markdownPath: string,
  openFileTab: (workspaceId: string, relPath: string) => void,
  openExternalFileTab: (workspaceId: string, absPath: string) => void,
  markdownAbsPath?: string,
) {
  const MarkdownAnchor = ({ node: _, download, href, onClick, children, ...props }: MarkdownAnchorProps) => {
    const rawHref = typeof href === 'string' ? href : '';

    const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || !rawHref) return;

      if (rawHref.startsWith('#')) return;

      event.preventDefault();

      if (download !== undefined && download !== false) {
        downloadMarkdownHref(rawHref, download, workspacePath, markdownPath, markdownAbsPath).catch((error) => {
          console.error('Failed to save markdown download', error);
        });
        return;
      }

      if (isRemoteOrEmbeddedUrl(rawHref)) {
        void window.forgepad.shell.openExternal(rawHref);
        return;
      }

      const pathWithoutSuffix = splitPathFromSuffix(rawHref);
      if (markdownAbsPath) {
        openExternalFileTab(workspaceId, resolveAbsMarkdownImagePath(pathWithoutSuffix, markdownAbsPath));
        return;
      }

      openFileTab(workspaceId, splitPathFromSuffix(resolveMarkdownImagePath(pathWithoutSuffix, markdownPath)));
    };

    return (
      <a {...props} download={download} href={rawHref} onClick={handleClick}>
        {children}
      </a>
    );
  };

  MarkdownAnchor.displayName = 'MarkdownAnchor';
  return MarkdownAnchor;
}

export function MarkdownPreview({
  absPath,
  components,
  markdownPath,
  markdownText,
  theme,
  workspaceId,
  workspacePath,
}: MarkdownPreviewProps) {
  const openFileTab = useAppStore((state) => state.openFileTab);
  const openExternalFileTab = useAppStore((state) => state.openExternalFileTab);
  const rootRef = useRef<HTMLDivElement>(null);
  const [renderMarkdownText, setRenderMarkdownText] = useState(markdownText);
  const needsMermaid = containsMermaid(renderMarkdownText);
  const [mermaidPlugin, setMermaidPlugin] = useState<StreamdownPlugins['mermaid'] | null>(null);

  useEffect(() => {
    const handleStreamdownDownloadClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest<HTMLButtonElement>('button');
      if (!button) return;

      const root = rootRef.current;
      const inPreview = root?.contains(button) ?? false;
      const inTableFullscreen = button.closest('[data-streamdown="table-fullscreen"]') !== null;
      if (!inPreview && !inTableFullscreen) return;

      const codeButton = button.closest<HTMLButtonElement>('[data-streamdown="code-block-download-button"]');
      if (codeButton) {
        const block = codeButton.closest<HTMLElement>('[data-streamdown="code-block"]');
        const codeElement = block?.querySelector<HTMLElement>('[data-streamdown="code-block-body"] code');
        const code = codeElement?.textContent ?? '';
        const language = block?.dataset.language ?? '';
        event.preventDefault();
        event.stopImmediatePropagation();
        void downloadFile({
          blob: new Blob([code], { type: 'text/plain' }),
          suggestedName: codeDownloadName(language),
        });
        return;
      }

      const title = button.getAttribute('title') ?? '';
      const tableFormat = title.includes('Markdown') ? 'markdown' : title.includes('CSV') ? 'csv' : null;
      if (tableFormat) {
        const wrapper = button.closest<HTMLElement>('[data-streamdown="table-wrapper"], [data-streamdown="table-fullscreen"]');
        const table = wrapper?.querySelector<HTMLTableElement>('table');
        if (!table) return;

        const content = tableFormat === 'markdown' ? tableToMarkdown(table) : tableToCsv(table);
        event.preventDefault();
        event.stopImmediatePropagation();
        void downloadFile({
          blob: new Blob([content], { type: tableFormat === 'markdown' ? 'text/markdown' : 'text/csv' }),
          suggestedName: tableFormat === 'markdown' ? 'table.md' : 'table.csv',
        });
      }
    };

    document.addEventListener('click', handleStreamdownDownloadClick, true);
    return () => document.removeEventListener('click', handleStreamdownDownloadClick, true);
  }, []);

  useEffect(() => {
    let disposed = false;
    setRenderMarkdownText(markdownText);
    rewriteLocalMarkdownImageSources(markdownText, workspacePath, markdownPath, absPath).then((nextText) => {
      if (!disposed) setRenderMarkdownText(nextText);
    });
    return () => {
      disposed = true;
    };
  }, [absPath, markdownPath, markdownText, workspacePath]);

  useEffect(() => {
    if (!needsMermaid) {
      setMermaidPlugin(null);
      return;
    }

    let disposed = false;
    import('@streamdown/mermaid')
      .then(({ createMermaidPlugin }) => {
        if (!disposed) setMermaidPlugin(createMermaidPlugin({ config: { theme: theme === 'dark' ? 'dark' : 'default' } }));
      })
      .catch(() => {
        if (!disposed) setMermaidPlugin(null);
      });
    return () => {
      disposed = true;
    };
  }, [needsMermaid, theme]);

  const previewComponents = useMemo<Components>(
    () => ({
      ...components,
      a: createMarkdownAnchorComponent(workspaceId, workspacePath, markdownPath, openFileTab, openExternalFileTab, absPath),
      img: createMarkdownImageComponent(workspacePath, markdownPath, absPath),
    }),
    [absPath, components, markdownPath, openExternalFileTab, openFileTab, workspaceId, workspacePath],
  );
  const plugins = useMemo<StreamdownPlugins>(
    () => (needsMermaid && mermaidPlugin ? { ...streamdownBasePlugins, mermaid: mermaidPlugin } : streamdownBasePlugins),
    [mermaidPlugin, needsMermaid],
  );

  return (
    <div ref={rootRef} style={{ display: 'contents' }}>
      <Streamdown
        allowedTags={markdownAllowedTags}
        components={previewComponents}
        linkSafety={{ enabled: false }}
        plugins={plugins}
      >
        {renderMarkdownText}
      </Streamdown>
    </div>
  );
}
