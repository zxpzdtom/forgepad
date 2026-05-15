import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@renderer/store/app-store';

type MarkdownPreviewNativeProps = {
  components?: unknown;
  markdownPath: string;
  markdownText: string;
  theme: 'dark' | 'light';
  workspaceId: string;
  workspacePath: string;
  absPath?: string;
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

function resolveMarkdownAssetPath(src: string, markdownPath: string): string {
  const [pathPart, suffix = ''] = src.split(/([?#].*)/, 2);
  if (pathPart.startsWith('/')) return normalizeRelativePath(pathPart.slice(1)) + suffix;
  const baseDir = dirname(markdownPath);
  return normalizeRelativePath(baseDir ? `${baseDir}/${pathPart}` : pathPart) + suffix;
}

function resolveAbsMarkdownAssetPath(src: string, markdownAbsPath: string): string {
  if (src.startsWith('/')) return src;
  const baseDir = dirname(markdownAbsPath);
  return normalizeAbsolutePath(baseDir ? `${baseDir}/${src}` : src);
}

function splitPathFromSuffix(path: string): string {
  return path.split(/[?#]/, 1)[0];
}

function parseInline(line: string) {
  const parts: Array<{ kind: 'text' | 'link' | 'image'; text: string; target?: string }> = [];
  const pattern = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
  let cursor = 0;
  for (const match of line.matchAll(pattern)) {
    if (match.index > cursor) {
      parts.push({ kind: 'text', text: line.slice(cursor, match.index) });
    }
    parts.push({
      kind: match[1] ? 'image' : 'link',
      text: match[2],
      target: match[3],
    });
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) parts.push({ kind: 'text', text: line.slice(cursor) });
  return parts.length ? parts : [{ kind: 'text' as const, text: line }];
}

function MarkdownImage({
  alt,
  absPath,
  markdownPath,
  src,
  workspacePath,
}: {
  alt: string;
  absPath?: string;
  markdownPath: string;
  src: string;
  workspacePath: string;
}) {
  const [resolvedSrc, setResolvedSrc] = useState(src);

  useEffect(() => {
    let disposed = false;
    setResolvedSrc(src);
    if (!src || isRemoteOrEmbeddedUrl(src)) return;

    const [pathWithoutSuffix] = src.split(/[?#]/, 1);
    const loadImage = absPath
      ? window.forgepad.fs.readAbsFileAsDataUrl(resolveAbsMarkdownAssetPath(pathWithoutSuffix, absPath))
      : window.forgepad.fs.readFileAsDataUrl(workspacePath, resolveMarkdownAssetPath(pathWithoutSuffix, markdownPath));

    loadImage
      .then((dataUrl) => {
        if (!disposed) setResolvedSrc(dataUrl);
      })
      .catch(() => {
        if (!disposed) setResolvedSrc(src);
      });

    return () => {
      disposed = true;
    };
  }, [absPath, markdownPath, src, workspacePath]);

  return <img src={resolvedSrc} alt={alt} />;
}

export function MarkdownPreviewNative({
  absPath,
  markdownPath,
  markdownText,
  workspaceId,
  workspacePath,
}: MarkdownPreviewNativeProps) {
  const openFileTab = useAppStore((state) => state.openFileTab);
  const openExternalFileTab = useAppStore((state) => state.openExternalFileTab);

  const blocks = useMemo(() => {
    const output: Array<{ kind: 'code' | 'line'; text: string; index: number }> = [];
    const lines = markdownText.split('\n');
    let inCode = false;
    let code: string[] = [];
    let codeStart = 0;

    lines.forEach((line, index) => {
      if (line.startsWith('```')) {
        if (inCode) {
          output.push({ kind: 'code', text: code.join('\n'), index: codeStart });
          code = [];
        } else {
          codeStart = index;
        }
        inCode = !inCode;
        return;
      }
      if (inCode) {
        code.push(line);
        return;
      }
      output.push({ kind: 'line', text: line, index });
    });

    if (code.length) output.push({ kind: 'code', text: code.join('\n'), index: codeStart });
    return output;
  }, [markdownText]);

  const openLink = (rawHref: string) => {
    if (!rawHref || rawHref.startsWith('#')) return;
    if (isRemoteOrEmbeddedUrl(rawHref)) {
      void window.forgepad.shell.openExternal(rawHref);
      return;
    }
    const pathWithoutSuffix = splitPathFromSuffix(rawHref);
    if (absPath) {
      openExternalFileTab(workspaceId, resolveAbsMarkdownAssetPath(pathWithoutSuffix, absPath));
      return;
    }
    openFileTab(workspaceId, splitPathFromSuffix(resolveMarkdownAssetPath(pathWithoutSuffix, markdownPath)));
  };

  return (
    <div className="markdown-preview native-markdown-preview">
      {blocks.map((block) => {
        if (block.kind === 'code') {
          return <pre key={block.index}>{block.text}</pre>;
        }

        const heading = block.text.match(/^(#{1,6})\s+(.*)$/);
        const line = heading ? heading[2] : block.text;
        const Tag = heading ? (`h${Math.min(heading[1].length, 6)}` as const) : block.text.trim() ? 'p' : 'div';

        return (
          <Tag key={block.index}>
            {parseInline(line).map((part, index) => {
              if (part.kind === 'image' && part.target) {
                return (
                  <MarkdownImage
                    key={`${block.index}-${index}`}
                    absPath={absPath}
                    alt={part.text}
                    markdownPath={markdownPath}
                    src={part.target}
                    workspacePath={workspacePath}
                  />
                );
              }
              if (part.kind === 'link' && part.target) {
                return (
                  <a
                    key={`${block.index}-${index}`}
                    href={part.target}
                    onClick={(event) => {
                      event.preventDefault();
                      openLink(part.target ?? '');
                    }}
                  >
                    {part.text}
                  </a>
                );
              }
              return <span key={`${block.index}-${index}`}>{part.text}</span>;
            })}
          </Tag>
        );
      })}
    </div>
  );
}
